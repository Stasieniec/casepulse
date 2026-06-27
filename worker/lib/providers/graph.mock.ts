import type {
  GraphProvider,
  CaseSummary,
  CaseGraph,
  ClaimDetail,
  EvidenceLink,
  Stats,
  GdsOverlays,
  RedTeamItem,
} from '../../../shared/types'
import { loadSeed } from '../seed-loader'

export class MockGraphProvider implements GraphProvider {
  private s = loadSeed()

  async listCases(): Promise<CaseSummary[]> {
    return [this.s.caseSummary]
  }

  async getCaseGraph(_caseId: string): Promise<CaseGraph> {
    return {
      claims: this.s.claims,
      evidence: this.s.evidence,
      edges: this.s.edges,
    }
  }

  async getClaim(id: string): Promise<ClaimDetail> {
    const c = this.s.claims.find(x => x.id === id)
    if (!c) throw new Error(`Claim ${id} not found`)
    const es = this.s.edges.filter(e => e.claimId === id)
    return {
      ...c,
      supporting: es.filter(e => e.relation === 'supports'),
      contradicting: es.filter(e => e.relation === 'contradicts'),
      neutral: es.filter(e => e.relation === 'neutral'),
    }
  }

  async getEvidenceForClaim(id: string): Promise<EvidenceLink[]> {
    return this.s.edges
      .filter(e => e.claimId === id)
      .map(e => ({
        documentId: e.documentId,
        title: this.s.titleOf(e.documentId),
        relation: e.relation,
        confidence: e.confidence,
        quote: e.quote,
        rationale: e.rationale,
      }))
  }

  async getStats(_caseId: string): Promise<Stats> {
    return this.s.stats
  }

  async getGdsOverlays(_caseId: string): Promise<GdsOverlays> {
    return this.s.gds
  }

  async getRedTeam(_caseId: string): Promise<RedTeamItem[]> {
    return this.s.redteam
  }
}
