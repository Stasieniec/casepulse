export type ClaimStatus = 'well_supported' | 'contested' | 'contradicted' | 'gap' | 'unaddressed'
export type Relation = 'supports' | 'contradicts' | 'neutral'
export type AttackType = 'cross_exam' | 'strike_out' | 'credibility'

export interface Claim {
  id: string; label: string; paragraphRef: string; text: string
  spanStart: number; spanEnd: number
  status: ClaimStatus; riskScore: number; headline: string
}
export interface Evidence {
  id: string; title: string; docType: string; party: string; text?: string
}
export interface Edge {
  id: string; claimId: string; documentId: string
  relation: Relation; confidence: number; quote: string; rationale: string
}
export interface RedTeamItem {
  id: string; claimId: string; attackType: AttackType
  attackText: string; killshotQuote: string; fixSuggestion: string
}
export interface CaseGraph { claims: Claim[]; evidence: Evidence[]; edges: Edge[] }
export interface ClaimDetail extends Claim {
  supporting: Edge[]; contradicting: Edge[]; neutral: Edge[]
}
export interface EvidenceLink { documentId: string; title: string; relation: Relation; confidence: number; quote: string; rationale: string }
export interface Stats {
  wellSupported: number; contested: number; contradicted: number; gaps: number; unaddressed: number
  overallScore: number; verdict: string; biggestVulnerabilities: string[]
}
export interface GdsOverlays {
  centrality: Record<string, number>   // node id -> score
  communities: Record<string, number>  // node id -> cluster
  missingEvidence: string[]            // claim ids flagged as gaps by graph
}
export interface CaseSummary { id: string; name: string; parties: string; court: string; claimNo: string }
export interface Pleading { caseId: string; title: string; fullText: string }
export interface DocumentText { docId: string; title: string; text: string }

export interface GraphProvider {
  listCases(): Promise<CaseSummary[]>
  getCaseGraph(caseId: string): Promise<CaseGraph>
  getClaim(claimId: string): Promise<ClaimDetail>
  getEvidenceForClaim(claimId: string): Promise<EvidenceLink[]>
  getStats(caseId: string): Promise<Stats>
  getGdsOverlays(caseId: string): Promise<GdsOverlays>
  getRedTeam(caseId: string): Promise<RedTeamItem[]>
  getPleading(caseId: string): Promise<Pleading>
  getDocument(caseId: string, docId: string): Promise<DocumentText>
}

export interface ExtractedClaim { label: string; paragraphRef: string; text: string; spanStart: number; spanEnd: number }
export interface JudgeResult { relation: Relation; confidence: number; quote: string; rationale: string }
export interface LlmProvider {
  extractClaims(pleadingText: string): Promise<ExtractedClaim[]>
  judgeEdge(claimText: string, evidenceChunk: string, evidenceTitle: string): Promise<JudgeResult>
  redTeam(claim: Claim, killEdges: Edge[]): Promise<Omit<RedTeamItem,'id'|'claimId'>>
  embed(texts: string[]): Promise<number[][]>
}
export interface Retriever {
  index(caseId: string, chunks: { id: string; documentId: string; text: string }[]): Promise<void>
  topK(caseId: string, queryText: string, k: number): Promise<{ id: string; documentId: string; text: string; score: number }[]>
}
