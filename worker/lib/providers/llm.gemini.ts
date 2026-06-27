/**
 * GeminiProvider — implements LlmProvider via Gemini REST API.
 *
 * Uses:
 *  - generateContent (gemini-3.5-flash) for structured outputs (extractClaims, judgeEdge, redTeam)
 *  - batchEmbedContents (gemini-embedding-001) for embed()
 */
import type { LlmProvider, ExtractedClaim, JudgeResult, Claim, Edge, RedTeamItem } from '../../../shared/types'

const GENERATE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const EMBED_MODEL = 'gemini-embedding-001'

interface GeminiProviderOptions {
  apiKey: string
  model: string
  embedModel?: string
}

/**
 * Strip optional ```json ... ``` fences that the model sometimes wraps around
 * its JSON response before returning the raw JSON string.
 */
function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

/**
 * POST a generateContent request and return the parsed JSON from the first
 * candidate's text part. Throws if the response is not OK.
 */
async function generateJson<T>(
  apiKey: string,
  model: string,
  prompt: string,
  responseSchema: unknown,
): Promise<T> {
  const url = `${GENERATE_BASE}/${model}:generateContent`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const snippet = await res.text().then(t => t.slice(0, 400))
    throw new Error(`Gemini generateContent HTTP ${res.status}: ${snippet}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(stripFences(raw)) as T
}

export class GeminiProvider implements LlmProvider {
  private apiKey: string
  private model: string
  private embedModel: string

  constructor({ apiKey, model, embedModel }: GeminiProviderOptions) {
    this.apiKey = apiKey
    this.model = model
    this.embedModel = embedModel ?? EMBED_MODEL
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

Return a JSON array of objects with fields: label (string), paragraphRef (string), text (string).`

    const schema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          paragraphRef: { type: 'STRING' },
          text: { type: 'STRING' },
        },
        required: ['label', 'paragraphRef', 'text'],
      },
    }

    const raw = await generateJson<{ label: string; paragraphRef: string; text: string }[]>(
      this.apiKey,
      this.model,
      prompt,
      schema,
    )

    // spanStart/spanEnd are computed by mapClaimSpan (Task 2.2), not the LLM.
    // Return -1 as sentinel; the pipeline fills them in.
    return raw.map(item => ({
      label: item.label,
      paragraphRef: item.paragraphRef,
      text: item.text,
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
- confidence: 0.0 (uncertain) to 1.0 (certain).`

    const schema = {
      type: 'OBJECT',
      properties: {
        relation: { type: 'STRING' },
        confidence: { type: 'NUMBER' },
        quote: { type: 'STRING' },
        rationale: { type: 'STRING' },
      },
      required: ['relation', 'confidence', 'quote', 'rationale'],
    }

    const raw = await generateJson<{
      relation: string
      confidence: number
      quote: string
      rationale: string
    }>(this.apiKey, this.model, prompt, schema)

    // Normalise relation to the canonical enum
    const rel = (['supports', 'contradicts', 'neutral'] as const).includes(
      raw.relation as 'supports' | 'contradicts' | 'neutral',
    )
      ? (raw.relation as 'supports' | 'contradicts' | 'neutral')
      : 'neutral'

    return {
      relation: rel,
      confidence: Math.max(0, Math.min(1, raw.confidence)),
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

Return:
- attackType: one of "cross_exam", "strike_out", "credibility"
- attackText: the actual cross-exam question(s) or legal argument (2–4 sentences, specific, grounded in the quoted evidence)
- killshotQuote: the single most damaging verbatim quote from the adverse evidence above (if available, else "")
- fixSuggestion: what the claimant should do to shore up or abandon this allegation (1–2 sentences)`

    const schema = {
      type: 'OBJECT',
      properties: {
        attackType: { type: 'STRING' },
        attackText: { type: 'STRING' },
        killshotQuote: { type: 'STRING' },
        fixSuggestion: { type: 'STRING' },
      },
      required: ['attackType', 'attackText', 'killshotQuote', 'fixSuggestion'],
    }

    const raw = await generateJson<{
      attackType: string
      attackText: string
      killshotQuote: string
      fixSuggestion: string
    }>(this.apiKey, this.model, prompt, schema)

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

    const url = `${GENERATE_BASE}/${this.embedModel}:batchEmbedContents`
    const body = {
      requests: texts.map(t => ({
        model: `models/${this.embedModel}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: 768,
      })),
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const snippet = await res.text().then(t => t.slice(0, 400))
      throw new Error(`Gemini batchEmbedContents HTTP ${res.status}: ${snippet}`)
    }

    const data = (await res.json()) as { embeddings?: { values: number[] }[] }
    const embeddings = data.embeddings ?? []

    return embeddings.map(e => l2Normalize(e.values))
  }
}

/**
 * L2-normalize a vector in-place so it becomes a unit vector.
 * Required for truncated (sub-3072-dim) Gemini embeddings which are NOT
 * unit-normalized by default.
 */
function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (norm === 0) return v
  return v.map(x => x / norm)
}
