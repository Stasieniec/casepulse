import type { CaseSummary, Stats, GdsOverlays, Evidence, RedTeamItem } from '../../shared/types'
import { buildSeed } from './seed-transform'
import matrixJson from '../../seed/meridian.matrix.json'
import { MERIDIAN_PLEADING_RAW } from './pleading-data'

// docId → human-readable document title
export const DOC_TITLES: Record<string, string> = {
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

export function titleOf(docId: string): string {
  return DOC_TITLES[docId] ?? docId
}

export interface SeedData {
  caseSummary: CaseSummary
  claims: ReturnType<typeof buildSeed>['claims']
  evidence: Evidence[]
  edges: ReturnType<typeof buildSeed>['edges']
  redteam: RedTeamItem[]
  stats: Stats
  gds: GdsOverlays
  normalizedPleading: string
  titleOf: (docId: string) => string
}

let _cached: SeedData | null = null

export function loadSeed(): SeedData {
  if (_cached) return _cached

  const { claims, evidence: rawEvidence, edges, normalizedPleading } = buildSeed(matrixJson as any, MERIDIAN_PLEADING_RAW)

  // Enrich evidence titles
  const evidence: Evidence[] = rawEvidence.map(e => ({
    ...e,
    title: titleOf(e.id),
  }))

  const caseSummary: CaseSummary = {
    id: 'meridian',
    name: 'Meridian Retail Group PLC v TechFlow Solutions Ltd',
    parties: 'Meridian Retail Group PLC (Claimant) v TechFlow Solutions Ltd (Defendant)',
    court: 'High Court, TCC (KBD)',
    claimNo: 'HT-2025-000231',
  }

  const m = (matrixJson as any).matrix
  const stats: Stats = {
    wellSupported: m.counts.wellSupported,
    contested: m.counts.contested,
    contradicted: m.counts.contradicted,
    gaps: m.counts.gaps,
    unaddressed: 0,
    overallScore: m.overallScore,
    verdict: m.trialReadiness,
    biggestVulnerabilities: m.biggestVulnerabilities,
  }

  // Minimal GDS overlays — degree-based centrality
  const centrality: Record<string, number> = {}
  const communities: Record<string, number> = {}
  const missingEvidence: string[] = claims
    .filter(c => c.status === 'gap' || c.status === 'unaddressed')
    .map(c => c.id)

  for (const c of claims) {
    const degree = edges.filter(e => e.claimId === c.id).length
    centrality[c.id] = degree
    communities[c.id] = 0
  }
  for (const e of evidence) {
    const degree = edges.filter(edge => edge.documentId === e.id).length
    centrality[e.id] = degree
    communities[e.id] = 0
  }

  const gds: GdsOverlays = { centrality, communities, missingEvidence }

  _cached = {
    caseSummary,
    claims,
    evidence,
    edges,
    redteam: [],
    stats,
    gds,
    normalizedPleading,
    titleOf,
  }
  return _cached
}
