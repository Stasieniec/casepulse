import type { Claim, Evidence, Edge, ClaimStatus, Relation } from '../../shared/types'

const STATUS_MAP: Record<string, ClaimStatus> = {
  WELL_SUPPORTED: 'well_supported',
  CONTESTED: 'contested',
  CONTRADICTED: 'contradicted',
  GAP: 'gap',
  UNADDRESSED: 'unaddressed',
}

const REL_MAP: Record<string, Relation> = {
  SUPPORTS: 'supports',
  CONTRADICTS: 'contradicts',
  NEUTRAL: 'neutral',
}

// Actual pleading paragraph references (from the Particulars of Claim) per proposition.
const PARAGRAPH_REF: Record<string, string> = {
  P1: '¶3',
  P2: '¶5',
  P3: '¶6',
  P4: '¶7',
  P5: '¶8',
  P6: '¶9',
  P7: '¶10',
  P8: '¶11',
  P9: '¶12',
  P10: '¶13',
  P11: '¶14',
  P12: '¶15(a)',
  P13: '¶15(b)',
}

// Verbatim snippets from the normalized pleading (whitespace-collapsed).
// Each snippet is a distinctive phrase that exists exactly once in the normalized text.
const SNIPPET: Record<string, string> = {
  P1: 'design, build, configure and implement',
  P2: '£2,400,000',
  P3: 'time was of the essence',
  P4: '10,000 concurrent transactions',
  P5: 'did not go live until 18 November 2024',
  P6: 'did not at any time request any change',
  P7: 'warned TechFlow that the Platform was not ready',
  P8: 'unavailable for more than 40%',
  P9: 'stock-synchronisation module',
  P10: 'did not accept the Platform',
  P11: 'failed to provide adequate training',
  P12: 'Wasted expenditure',
  P13: 'Loss of profit during the peak trading',
}

/**
 * Normalize a raw pleading string: collapse all whitespace (including newlines)
 * to a single space and trim. This allows span-finding to work across line-wrapped
 * phrases and produces the canonical text stored in the DB / rendered in the UI.
 */
export function normalizePleading(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Build seed records from the ground-truth matrix JSON and the raw pleading text.
 * The pleading is normalized internally so all span offsets are into the
 * normalized string. The normalized text is also returned for callers.
 */
export function buildSeed(
  matrix: any,
  rawPleading: string,
): { claims: Claim[]; evidence: Evidence[]; edges: Edge[]; normalizedPleading: string } {
  const pleading = normalizePleading(rawPleading)

  const claims: Claim[] = matrix.matrix.propositions.map((p: any) => {
    const snip = SNIPPET[p.propositionId] ?? p.propositionId
    const idx = pleading.indexOf(snip)
    const spanStart = idx >= 0 ? idx : 0
    const spanEnd = idx >= 0 ? idx + snip.length : snip.length
    return {
      id: p.propositionId,
      label: p.propositionId,
      paragraphRef: PARAGRAPH_REF[p.propositionId] ?? p.propositionId,
      text: snip,
      spanStart,
      spanEnd,
      status: STATUS_MAP[p.status] ?? 'unaddressed',
      riskScore: p.riskScore,
      headline: p.headline,
    } satisfies Claim
  })

  const evidence: Evidence[] = matrix.analyses.map((a: any) => ({
    id: a.docId,
    title: a.docId, // enriched with full title in seed-loader
    docType: a.docType,
    party: a.party,
  }))

  const edges: Edge[] = []
  for (const a of matrix.analyses) {
    // Include the finding index so ids stay unique when one doc has multiple
    // findings about the same proposition (otherwise PK collisions in D1).
    a.findings.forEach((f: any, i: number) => {
      edges.push({
        id: `${a.docId}-${f.propositionId}-${i}`,
        claimId: f.propositionId,
        documentId: a.docId,
        relation: REL_MAP[f.relation] ?? 'neutral',
        confidence: f.confidence,
        quote: f.quote,
        rationale: f.rationale,
      })
    })
  }

  return { claims, evidence, edges, normalizedPleading: pleading }
}
