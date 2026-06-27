/**
 * LiveGraphProvider — reads a live analysis from D1.
 *
 * Constructed with a specific analysisId and serves all GraphProvider methods
 * by reading from the D1 database for that analysis. Evidence catalog comes
 * from DOC_TEXTS (the 18 bundled docs), identical to the seed approach.
 */
import type {
  GraphProvider,
  CaseSummary,
  CaseGraph,
  Claim,
  ClaimDetail,
  Evidence,
  Edge,
  EvidenceLink,
  Stats,
  GdsOverlays,
  RedTeamItem,
  Pleading,
  DocumentText,
  ClaimStatus,
  Relation,
  AttackType,
} from '../../../shared/types'
import { DOC_TEXTS } from '../docs-data'
import { titleOf } from '../seed-loader'
import {
  selectAnalysis,
  selectPleading,
  selectClaimsByAnalysis,
  selectEdgesByAnalysis,
  selectRedTeamByAnalysis,
} from '../db'

export class LiveGraphProvider implements GraphProvider {
  private db: D1Database
  private analysisId: string

  constructor(db: D1Database, analysisId: string) {
    this.db = db
    this.analysisId = analysisId
  }

  /**
   * Load all data for this analysis from D1 in parallel where possible.
   * Returns typed objects ready for the GraphProvider methods.
   */
  private async loadData() {
    const [analysisRow, claimRows, edgeRows, redteamRows] = await Promise.all([
      selectAnalysis(this.db, this.analysisId),
      selectClaimsByAnalysis(this.db, this.analysisId),
      selectEdgesByAnalysis(this.db, this.analysisId),
      selectRedTeamByAnalysis(this.db, this.analysisId),
    ])

    if (!analysisRow) throw new Error(`Analysis ${this.analysisId} not found`)

    const pleadingRow = await selectPleading(this.db, analysisRow.pleading_id)

    const claims: Claim[] = claimRows.map(r => ({
      id: r.id,
      label: r.label,
      paragraphRef: r.paragraph_ref,
      text: r.text,
      spanStart: r.span_start,
      spanEnd: r.span_end,
      status: r.status as ClaimStatus,
      riskScore: r.risk_score,
      headline: r.headline,
    }))

    const edges: Edge[] = edgeRows.map(r => ({
      id: r.id,
      claimId: r.claim_id,
      documentId: r.document_id,
      relation: r.relation as Relation,
      confidence: r.confidence,
      quote: r.quote,
      rationale: r.rationale,
    }))

    const redteam: RedTeamItem[] = redteamRows.map(r => ({
      id: r.id,
      claimId: r.claim_id,
      attackType: r.attack_type as AttackType,
      attackText: r.attack_text,
      killshotQuote: r.killshot_quote,
      fixSuggestion: r.fix_suggestion,
    }))

    const counts = JSON.parse(analysisRow.counts_json ?? '{}')
    const stats: Stats = {
      wellSupported: counts.wellSupported ?? 0,
      contested: counts.contested ?? 0,
      contradicted: counts.contradicted ?? 0,
      gaps: counts.gaps ?? 0,
      unaddressed: counts.unaddressed ?? 0,
      overallScore: analysisRow.overall_score,
      verdict: analysisRow.verdict ?? '',
      biggestVulnerabilities: JSON.parse(analysisRow.vulnerabilities_json ?? '[]'),
    }

    // Evidence catalog: all 18 bundled documents (same as seed, always available)
    const evidence: Evidence[] = Object.keys(DOC_TEXTS).map(docId => ({
      id: docId,
      title: titleOf(docId),
      docType: 'document',
      party: 'bundle',
    }))

    // GDS overlays — degree centrality (same approach as seed-loader)
    const centrality: Record<string, number> = {}
    const communities: Record<string, number> = {}
    for (const c of claims) {
      centrality[c.id] = edges.filter(e => e.claimId === c.id).length
      communities[c.id] = 0
    }
    for (const e of evidence) {
      centrality[e.id] = edges.filter(edge => edge.documentId === e.id).length
      communities[e.id] = 0
    }
    const missingEvidence = claims
      .filter(c => c.status === 'gap' || c.status === 'unaddressed')
      .map(c => c.id)
    const gds: GdsOverlays = { centrality, communities, missingEvidence }

    return { analysisRow, pleadingRow, claims, edges, evidence, redteam, stats, gds }
  }

  async listCases(): Promise<CaseSummary[]> {
    // Live analyses are always scoped to the Meridian case for now
    return [
      {
        id: 'meridian',
        name: 'Meridian Retail Group PLC v TechFlow Solutions Ltd',
        parties: 'Meridian Retail Group PLC (Claimant) v TechFlow Solutions Ltd (Defendant)',
        court: 'High Court, TCC (KBD)',
        claimNo: 'HT-2025-000231',
      },
    ]
  }

  async getCaseGraph(_caseId: string): Promise<CaseGraph> {
    const { claims, evidence, edges } = await this.loadData()
    return { claims, evidence, edges }
  }

  async getClaim(claimId: string): Promise<ClaimDetail> {
    const { claims, edges } = await this.loadData()
    const c = claims.find(x => x.id === claimId)
    if (!c) throw new Error(`Claim ${claimId} not found in analysis ${this.analysisId}`)
    const es = edges.filter(e => e.claimId === claimId)
    return {
      ...c,
      supporting: es.filter(e => e.relation === 'supports'),
      contradicting: es.filter(e => e.relation === 'contradicts'),
      neutral: es.filter(e => e.relation === 'neutral'),
    }
  }

  async getEvidenceForClaim(claimId: string): Promise<EvidenceLink[]> {
    const { edges } = await this.loadData()
    return edges
      .filter(e => e.claimId === claimId)
      .map(e => ({
        documentId: e.documentId,
        title: titleOf(e.documentId),
        relation: e.relation,
        confidence: e.confidence,
        quote: e.quote,
        rationale: e.rationale,
      }))
  }

  async getStats(_caseId: string): Promise<Stats> {
    const { stats } = await this.loadData()
    return stats
  }

  async getGdsOverlays(_caseId: string): Promise<GdsOverlays> {
    const { gds } = await this.loadData()
    return gds
  }

  async getRedTeam(_caseId: string): Promise<RedTeamItem[]> {
    const { redteam } = await this.loadData()
    return redteam
  }

  async getPleading(_caseId: string): Promise<Pleading> {
    const { pleadingRow, analysisRow } = await this.loadData()
    return {
      caseId: analysisRow.case_id,
      title: pleadingRow?.title ?? 'Particulars of Claim',
      fullText: pleadingRow?.full_text ?? '',
    }
  }

  async getDocument(_caseId: string, docId: string): Promise<DocumentText> {
    const text = DOC_TEXTS[docId]
    if (text === undefined) throw new Error(`Document ${docId} not found`)
    return { docId, title: titleOf(docId), text }
  }
}
