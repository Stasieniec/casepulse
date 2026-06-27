import type {
  CaseSummary,
  Stats,
  CaseGraph,
  ClaimDetail,
  EvidenceLink,
  RedTeamItem,
  GdsOverlays,
  Pleading,
  DocumentText,
} from '../shared/types'

export type { Pleading, DocumentText } from '../shared/types'

/** Result of an analysis run (currently a stub; see analyze()). */
export interface AnalyzeResult {
  caseId: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export const listCases = () => get<CaseSummary[]>('/api/cases')

export const getStats = (caseId: string) => get<Stats>(`/api/cases/${caseId}/stats`)

export const getCaseGraph = (caseId: string) => get<CaseGraph>(`/api/cases/${caseId}/graph`)

export const getClaim = (claimId: string) => get<ClaimDetail>(`/api/claims/${claimId}`)

export const getEvidence = (claimId: string) =>
  get<EvidenceLink[]>(`/api/claims/${claimId}/evidence`)

export const getRedTeam = (caseId: string) => get<RedTeamItem[]>(`/api/cases/${caseId}/redteam`)

export const getGds = (caseId: string) => get<GdsOverlays>(`/api/cases/${caseId}/gds`)

export const getPleading = (caseId: string) => get<Pleading>(`/api/cases/${caseId}/pleading`)

export const getDocument = (caseId: string, docId: string) =>
  get<DocumentText>(`/api/cases/${caseId}/documents/${docId}`)

/**
 * Stub: kick off live analysis of a pleading.
 *
 * TODO(Task 2.10): wire to `POST /api/analyze {caseId, pleadingText}` which runs
 * the extract → retrieve → judge → aggregate pipeline and returns an analysisId.
 * For now we resolve immediately so the UI can navigate to the seeded CaseView.
 */
export async function analyze(caseId: string, _pleadingText: string): Promise<AnalyzeResult> {
  return { caseId }
}
