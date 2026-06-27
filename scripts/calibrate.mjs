#!/usr/bin/env node
/**
 * scripts/calibrate.mjs
 *
 * Calibration harness for the Crucible LLM judge.
 *
 * Reads seed/goldset.json (15 human-labeled claim↔evidence pairs, independent
 * of the LLM-produced seed) and calls the Gemini judge on each pair using the
 * SAME prompt / abstention threshold (0.55) as GeminiProvider.judgeEdge().
 *
 * Reads GEMINI_API_KEY and GEMINI_MODEL from .dev.vars (or process.env).
 * NEVER hardcodes the key.
 *
 * Outputs:
 *  - a per-pair table to stdout
 *  - docs/calibration.md (methodology + actual numbers)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Read API key from .dev.vars or environment ──────────────────────────────
function loadDevVars(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8')
    const vars = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (k && !k.startsWith('#')) vars[k] = v
    }
    return vars
  } catch {
    return {}
  }
}

const devVars = loadDevVars(resolve(ROOT, '.dev.vars'))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? devVars.GEMINI_API_KEY
const GEMINI_MODEL   = process.env.GEMINI_MODEL   ?? devVars.GEMINI_MODEL ?? 'gemini-2.0-flash'

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not found in .dev.vars or environment.')
  process.exit(1)
}

// ── Load goldset ─────────────────────────────────────────────────────────────
const goldset = JSON.parse(readFileSync(resolve(ROOT, 'seed/goldset.json'), 'utf8'))

// ── Load DOC_TEXTS (from docs-data source text files in seed/docs/) ──────────
// The calibration script runs in Node, so we read the source .txt files that
// gen-docs-data.mjs was run from — same content as DOC_TEXTS in docs-data.ts.
function loadDocText(docId) {
  const p = resolve(ROOT, `seed/docs/${docId}.txt`)
  try {
    return readFileSync(p, 'utf8')
  } catch {
    throw new Error(`Cannot find seed/docs/${docId}.txt for docId ${docId}`)
  }
}

const DOC_TITLES = {
  D03: 'Master Services Agreement',
  D04: 'Statement of Work (SOW-01)',
  D05: 'Order Form (Phase 1)',
  D06: 'Deed of Variation No. 1',
  D07: 'Change Order No. 3 (loyalty module)',
  D08: 'Phase 1 UAT Acceptance Certificate',
  D09: 'Email — go-live decision (24 Oct 2024)',
  D10: 'Email — loyalty module change request',
  D11: 'Email — 25 Nov outage root cause',
  D12: 'Email — internal, Q4 trading',
  D13: 'Platform defect / issue log (extract)',
  D14: 'Letter — Notice of Termination',
  D15: 'Letter — TechFlow response',
  D16: 'Witness statement — Helena Vance',
  D17: 'Witness statement — Raymond Okafor',
  D18: 'Witness statement — Priya Nair',
  D19: 'Expert report — Dr Alan Whitfield (IT)',
  D20: 'Expert report — Fiona Greenhalgh FCA (quantum)',
}

// ── Gemini judge (mirrors GeminiProvider.judgeEdge exactly) ─────────────────
const ABSTENTION_THRESHOLD = 0.55
const GENERATE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function stripFences(raw) {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

async function judgeEdge(claimText, evidenceChunk, evidenceTitle) {
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

  const url = `${GENERATE_BASE}/${GEMINI_MODEL}:generateContent`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const snippet = await res.text().then(t => t.slice(0, 400))
    throw new Error(`Gemini HTTP ${res.status}: ${snippet}`)
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const parsed = JSON.parse(stripFences(raw))

  const validRels = ['supports', 'contradicts', 'neutral']
  const rel = validRels.includes(parsed.relation) ? parsed.relation : 'neutral'
  const conf = Math.max(0, Math.min(1, parsed.confidence ?? 0))

  return {
    relation: rel,
    confidence: conf,
    quote: parsed.quote ?? '',
    rationale: parsed.rationale ?? '',
    // Abstention: if confidence < threshold, treat as "abstained"
    abstained: conf < ABSTENTION_THRESHOLD,
  }
}

// ── Run calibration ──────────────────────────────────────────────────────────
async function main() {
  const pairs = goldset.pairs
  console.log(`\nCrucible Judge Calibration — ${pairs.length} gold pairs\n`)
  console.log(`Model: ${GEMINI_MODEL}  |  Abstention threshold: ${ABSTENTION_THRESHOLD}\n`)

  const results = []
  let abstentions = 0

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const docText = loadDocText(pair.docId)
    const docTitle = DOC_TITLES[pair.docId] ?? pair.docId

    process.stdout.write(`[${i + 1}/${pairs.length}] ${pair.docId} × claim…`)

    let result
    try {
      result = await judgeEdge(pair.claim.slice(0, 300), docText, docTitle)
    } catch (err) {
      console.error(`\n  ERROR: ${err.message}`)
      result = { relation: 'error', confidence: 0, quote: '', rationale: err.message, abstained: true }
    }

    const predicted = result.abstained ? 'abstained' : result.relation
    const match = !result.abstained && predicted === pair.expected
    if (result.abstained) abstentions++

    results.push({
      i: i + 1,
      docId: pair.docId,
      claim: pair.claim.slice(0, 70) + (pair.claim.length > 70 ? '…' : ''),
      expected: pair.expected,
      predicted,
      confidence: result.confidence,
      match,
      abstained: result.abstained,
      quote: result.quote?.slice(0, 60) ?? '',
      rationale: result.rationale?.slice(0, 100) ?? '',
      why: pair.why,
    })

    const status = result.abstained ? '⟳ abstained' : match ? '✓' : '✗'
    console.log(` ${status}  (conf=${result.confidence.toFixed(2)}, predicted=${predicted})`)

    // Small delay to avoid rate limits
    if (i < pairs.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  // ── Compute stats ──────────────────────────────────────────────────────────
  const judged = results.filter(r => !r.abstained)
  const agreement = judged.length > 0
    ? (judged.filter(r => r.match).length / judged.length * 100).toFixed(1)
    : 'n/a'
  const overallAgreement = (results.filter(r => r.match).length / pairs.length * 100).toFixed(1)

  const classes = ['supports', 'contradicts', 'neutral']
  const perClass = {}
  for (const cls of classes) {
    const inClass = results.filter(r => r.expected === cls)
    const correct = inClass.filter(r => r.match)
    perClass[cls] = {
      total: inClass.length,
      correct: correct.length,
      pct: inClass.length > 0 ? (correct.length / inClass.length * 100).toFixed(0) : 'n/a',
    }
  }

  const abstentionRate = (abstentions / pairs.length * 100).toFixed(1)

  console.log('\n── Results ────────────────────────────────────────────────────')
  console.log(`Overall agreement (all N=${pairs.length}): ${overallAgreement}%`)
  console.log(`Agreement on judged (N=${judged.length}): ${agreement}%`)
  console.log(`Abstention rate: ${abstentionRate}% (${abstentions}/${pairs.length} below ${ABSTENTION_THRESHOLD})`)
  console.log('\nPer-class correctness (of expected pairs):')
  for (const [cls, s] of Object.entries(perClass)) {
    console.log(`  ${cls.padEnd(12)} ${s.correct}/${s.total} = ${s.pct}%`)
  }

  // ── Write docs/calibration.md ─────────────────────────────────────────────
  const docsDir = resolve(ROOT, 'docs')
  mkdirSync(docsDir, { recursive: true })

  const table = [
    '| # | Doc | Claim (truncated) | Expected | Predicted | Conf | Match |',
    '|---|-----|-------------------|----------|-----------|------|-------|',
    ...results.map(r =>
      `| ${r.i} | ${r.docId} | ${r.claim.replace(/\|/g, '\\|')} | ${r.expected} | ${r.predicted} | ${r.confidence.toFixed(2)} | ${r.abstained ? 'abstained' : r.match ? 'yes' : 'no'} |`
    )
  ].join('\n')

  const md = `# Crucible Judge Calibration

## Methodology

A hand-curated gold set of **${pairs.length} unambiguous claim↔evidence relations** from the Meridian v TechFlow bundle.
Each pair was labeled by a human (the controller) reading the original documents—**independent of the LLM-produced seed matrix**—so this is a genuine external check, not a circular validation.

The calibration script (\`scripts/calibrate.mjs\`) calls the Gemini judge on each pair using the **identical prompt and abstention logic as \`GeminiProvider.judgeEdge()\`** in \`worker/lib/providers/llm.gemini.ts\`, including the 0.55 confidence abstention threshold.
Model used: \`${GEMINI_MODEL}\`.

**Limitations:** Small N (${pairs.length} pairs), single benchmark run, single model temperature=0. Results are indicative, not definitive. Neutral pairs are intentionally included as a harder test.

---

## Results

| Metric | Value |
|--------|-------|
| Gold pairs (N) | ${pairs.length} |
| Overall agreement (all N) | **${overallAgreement}%** |
| Agreement on judged pairs (N=${judged.length}) | **${agreement}%** |
| Abstention rate | **${abstentionRate}%** (${abstentions}/${pairs.length} below ${ABSTENTION_THRESHOLD} confidence) |
| Abstention threshold | 0.55 |
| Model | \`${GEMINI_MODEL}\` |

### Per-class correctness

| Relation (expected) | N | Correct | % |
|---------------------|---|---------|---|
| contradicts | ${perClass.contradicts.total} | ${perClass.contradicts.correct} | ${perClass.contradicts.pct}% |
| supports | ${perClass.supports.total} | ${perClass.supports.correct} | ${perClass.supports.pct}% |
| neutral | ${perClass.neutral.total} | ${perClass.neutral.correct} | ${perClass.neutral.pct}% |

---

## Per-pair table

${table}

---

*Generated by \`scripts/calibrate.mjs\` — ${new Date().toISOString().slice(0,10)}.*
`

  writeFileSync(resolve(docsDir, 'calibration.md'), md, 'utf8')
  console.log('\n✓ Wrote docs/calibration.md')

  // Return the headline numbers for AppShell update
  console.log(`\nHEADLINE: judge agrees with ${results.filter(r => r.match).length}/${pairs.length} hand-labeled relations; abstains in ${abstentionRate}% of cases`)

  return { overallAgreement, agreement, abstentionRate, abstentions, total: pairs.length, judged: judged.length, perClass, results }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
