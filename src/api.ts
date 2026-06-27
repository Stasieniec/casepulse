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

/** Result returned by POST /api/analyze. */
export interface AnalyzeResult {
  analysisId: string
  stats: {
    wellSupported: number
    contested: number
    contradicted: number
    gaps: number
    unaddressed: number
    overallScore: number
  }
  claimCount: number
  edgeCount: number
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** Append ?analysis=<id> to a path when an analysisId is provided. */
function withAnalysis(path: string, analysisId?: string | null): string {
  return analysisId ? `${path}?analysis=${encodeURIComponent(analysisId)}` : path
}

export const listCases = (analysisId?: string | null) =>
  get<CaseSummary[]>(withAnalysis('/api/cases', analysisId))

export const getStats = (caseId: string, analysisId?: string | null) =>
  get<Stats>(withAnalysis(`/api/cases/${caseId}/stats`, analysisId))

export const getCaseGraph = (caseId: string, analysisId?: string | null) =>
  get<CaseGraph>(withAnalysis(`/api/cases/${caseId}/graph`, analysisId))

export const getClaim = (claimId: string, analysisId?: string | null) =>
  get<ClaimDetail>(withAnalysis(`/api/claims/${claimId}`, analysisId))

export const getEvidence = (claimId: string, analysisId?: string | null) =>
  get<EvidenceLink[]>(withAnalysis(`/api/claims/${claimId}/evidence`, analysisId))

export const getRedTeam = (caseId: string, analysisId?: string | null) =>
  get<RedTeamItem[]>(withAnalysis(`/api/cases/${caseId}/redteam`, analysisId))

export const getGds = (caseId: string, analysisId?: string | null) =>
  get<GdsOverlays>(withAnalysis(`/api/cases/${caseId}/gds`, analysisId))

export const getPleading = (caseId: string, analysisId?: string | null) =>
  get<Pleading>(withAnalysis(`/api/cases/${caseId}/pleading`, analysisId))

export const getDocument = (caseId: string, docId: string, analysisId?: string | null) =>
  get<DocumentText>(withAnalysis(`/api/cases/${caseId}/documents/${docId}`, analysisId))

/** Result returned by POST /api/ingest. */
export interface IngestResult {
  docId: string
  title: string
  text: string
  charCount: number
}

/**
 * POST /api/ingest — sends one of the 4 exhibit PDFs to Google Document AI
 * and returns the extracted text.
 *
 * Returns a 503 error when the server is not configured with GCP credentials.
 */
export async function ingest(docId: string): Promise<IngestResult> {
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ docId }),
  })
  if (res.status === 503) {
    throw Object.assign(new Error('Document AI not configured'), { status: 503 })
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`POST /api/ingest failed: ${res.status} — ${err.slice(0, 300)}`)
  }
  return (await res.json()) as IngestResult
}

/**
 * POST /api/analyze — runs the real Gemini pipeline and returns an analysisId.
 * Expects ~20-60s for a full pleading.
 */
export async function analyze(caseId: string, pleadingText: string): Promise<AnalyzeResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ caseId, pleadingText }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`POST /api/analyze failed: ${res.status} — ${err.slice(0, 300)}`)
  }
  return (await res.json()) as AnalyzeResult
}
