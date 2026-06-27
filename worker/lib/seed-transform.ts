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
      paragraphRef: p.propositionId,
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
    for (const f of a.findings) {
      edges.push({
        id: `${a.docId}-${f.propositionId}`,
        claimId: f.propositionId,
        documentId: a.docId,
        relation: REL_MAP[f.relation] ?? 'neutral',
        confidence: f.confidence,
        quote: f.quote,
        rationale: f.rationale,
      })
    }
  }

  return { claims, evidence, edges, normalizedPleading: pleading }
}
