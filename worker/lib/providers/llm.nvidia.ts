/**
 * NvidiaProvider — implements LlmProvider via NVIDIA NIM REST API.
 *
 * The NIM endpoint is OpenAI-compatible at https://integrate.api.nvidia.com/v1.
 *
 * Uses:
 *  - /chat/completions (nemotron-3-super-120b-a12b by default) with
 *    enable_thinking:false + response_format json_object for fast structured outputs.
 *  - /embeddings (nv-embedqa-e5-v5 by default, 1024-dim, asymmetric).
 *    We always pass input_type:"passage" — acceptable for this use case since
 *    the LLM-judge corrects retrieval and the bundle is small.
 */
import type { LlmProvider, ExtractedClaim, JudgeResult, Claim, Edge, RedTeamItem } from '../../../shared/types'

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'

interface NvidiaProviderOptions {
  apiKey: string
  model: string
  embedModel: string
}

/**
 * Strip optional ```json ... ``` fences that the model sometimes wraps around
 * its JSON response before returning the raw JSON string.
 */
function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

/**
 * POST a chat completion request and return the parsed JSON from the first
 * choice's message content. Throws if the response is not OK.
 */
async function chatJson<T>(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 2048,
): Promise<T> {
  const url = `${NIM_BASE}/chat/completions`
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.2,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_object' },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const snippet = await res.text().then(t => t.slice(0, 400))
    throw new Error(`NVIDIA NIM chat/completions HTTP ${res.status}: ${snippet}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }

  const raw = data?.choices?.[0]?.message?.content ?? ''
  return JSON.parse(stripFences(raw)) as T
}

export class NvidiaProvider implements LlmProvider {
  private apiKey: string
  private model: string
  private embedModel: string

  constructor({ apiKey, model, embedModel }: NvidiaProviderOptions) {
    this.apiKey = apiKey
    this.model = model
    this.embedModel = embedModel
  }

  // ---------------------------------------------------------------------------
  // extractClaims
  // ---------------------------------------------------------------------------
  async extractClaims(pleadingText: string): Promise<ExtractedClaim[]> {
    const prompt = `You are a legal analyst. Read the following pleading text and extract each distinct pleaded proposition.

For each proposition return:
- label: a short identifier like "P1", "P2", etc. (sequential)
- paragraphRef: the paragraph reference if discernible (e.g. "¶6"), otherwise ""
- text: the VERBATIM sentence or phrase from the pleading that states the proposition

Return ONLY the propositions — do not include procedural boilerplate (party names, jurisdiction, prayer for relief).

Pleading:
"""
${pleadingText}
"""

Return a JSON object with a single key "claims" whose value is an array of objects with fields: label (string), paragraphRef (string), text (string).`

    const raw = await chatJson<{ claims?: { label: string; paragraphRef: string; text: string }[] }>(
      this.apiKey,
      this.model,
      prompt,
      4096,
    )

    const items = raw.claims ?? []

    // spanStart/spanEnd are computed by mapClaimSpan (Task 2.2), not the LLM.
    // Return -1 as sentinel; the pipeline fills them in.
    return items.map(item => ({
      label: item.label ?? '',
      paragraphRef: item.paragraphRef ?? '',
      text: item.text ?? '',
      spanStart: -1,
      spanEnd: -1,
    }))
  }

  // ---------------------------------------------------------------------------
  // judgeEdge
  // ---------------------------------------------------------------------------
  async judgeEdge(
    claimText: string,
    evidenceChunk: string,
    evidenceTitle: string,
  ): Promise<JudgeResult> {
    const prompt = `You are a careful legal analyst. Determine whether the evidence passage SUPPORTS, CONTRADICTS, or is NEUTRAL with respect to the legal claim below.

CLAIM: ${claimText}

EVIDENCE (from "${evidenceTitle}"):
"""
${evidenceChunk}
"""

Rules:
- "supports" if the evidence positively corroborates the claim.
- "contradicts" if the evidence directly contradicts or undermines the claim.
- "neutral" if the evidence is irrelevant or too ambiguous to decide.
- Return relation "neutral" with low confidence (< 0.5) if you are unsure.
- quote: a SHORT verbatim phrase from the evidence that best justifies your relation. If no relevant phrase exists return "".
- rationale: one concise sentence explaining the relation.
- confidence: 0.0 (uncertain) to 1.0 (certain).

Return a JSON object with fields: relation (string), confidence (number), quote (string), rationale (string).`

    const raw = await chatJson<{
      relation: string
      confidence: number
      quote: string
      rationale: string
    }>(this.apiKey, this.model, prompt, 512)

    // Normalise relation to the canonical enum
    const rel = (['supports', 'contradicts', 'neutral'] as const).includes(
      raw.relation as 'supports' | 'contradicts' | 'neutral',
    )
      ? (raw.relation as 'supports' | 'contradicts' | 'neutral')
      : 'neutral'

    return {
      relation: rel,
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
      quote: raw.quote ?? '',
      rationale: raw.rationale ?? '',
    }
  }

  // ---------------------------------------------------------------------------
  // redTeam
  // ---------------------------------------------------------------------------
  async redTeam(
    claim: Claim,
    killEdges: Edge[],
  ): Promise<Omit<RedTeamItem, 'id' | 'claimId'>> {
    const adverseQuotes = killEdges
      .filter(e => e.relation === 'contradicts')
      .slice(0, 5)
      .map((e, i) => `[${i + 1}] ${e.quote} (source: ${e.documentId})`)
      .join('\n')

    const prompt = `You are experienced opposing counsel preparing to cross-examine a witness or strike out a pleaded allegation.

PLEADED CLAIM: ${claim.text}

ADVERSE EVIDENCE FROM THE CLAIMANT'S OWN BUNDLE:
${adverseQuotes || '(No directly contradicting evidence found.)'}

Produce ONE sharp, devastating attack on this claim. Choose the most effective attack type:
- "cross_exam": a probing question or sequence that would destabilise the witness in evidence.
- "strike_out": a strike-out / summary judgment argument based on the evidence.
- "credibility": an argument that undermines the credibility or reliability of the pleading.

Return a JSON object with fields:
- attackType: one of "cross_exam", "strike_out", "credibility"
- attackText: the actual cross-exam question(s) or legal argument (2–4 sentences, specific, grounded in the quoted evidence)
- killshotQuote: the single most damaging verbatim quote from the adverse evidence above (if available, else "")
- fixSuggestion: what the claimant should do to shore up or abandon this allegation (1–2 sentences)`

    const raw = await chatJson<{
      attackType: string
      attackText: string
      killshotQuote: string
      fixSuggestion: string
    }>(this.apiKey, this.model, prompt, 1024)

    const validAttackTypes = ['cross_exam', 'strike_out', 'credibility'] as const
    const attackType = validAttackTypes.includes(raw.attackType as (typeof validAttackTypes)[number])
      ? (raw.attackType as (typeof validAttackTypes)[number])
      : 'cross_exam'

    return {
      attackType,
      attackText: raw.attackText ?? '',
      killshotQuote: raw.killshotQuote ?? '',
      fixSuggestion: raw.fixSuggestion ?? '',
    }
  }

  // ---------------------------------------------------------------------------
  // embed
  // ---------------------------------------------------------------------------
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const url = `${NIM_BASE}/embeddings`
    const body = {
      model: this.embedModel,
      input: texts,
      // nv-embedqa-e5-v5 is asymmetric; "passage" is correct for indexing documents.
      // Using "passage" universally is acceptable for this small bundle (LLM judge corrects retrieval).
      input_type: 'passage',
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const snippet = await res.text().then(t => t.slice(0, 400))
      throw new Error(`NVIDIA NIM embeddings HTTP ${res.status}: ${snippet}`)
    }

    const data = (await res.json()) as { data?: { embedding: number[] }[] }
    const embeddings = data.data ?? []

    return embeddings.map(e => l2Normalize(e.embedding))
  }
}

/**
 * L2-normalize a vector so it becomes a unit vector.
 * nv-embedqa-e5-v5 returns 1024-dim vectors; we normalize for cosine consistency.
 */
function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (norm === 0) return v
  return v.map(x => x / norm)
}
