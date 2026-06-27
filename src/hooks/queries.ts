import { useQuery } from '@tanstack/react-query'
import * as api from '../api'

/** Centralized query keys — include analysisId so live vs seed queries cache separately. */
export const qk = {
  cases: (a?: string | null) => ['cases', a ?? ''] as const,
  stats: (caseId: string, a?: string | null) => ['stats', caseId, a ?? ''] as const,
  graph: (caseId: string, a?: string | null) => ['graph', caseId, a ?? ''] as const,
  claim: (claimId: string, a?: string | null) => ['claim', claimId, a ?? ''] as const,
  evidence: (claimId: string, a?: string | null) => ['evidence', claimId, a ?? ''] as const,
  redteam: (caseId: string, a?: string | null) => ['redteam', caseId, a ?? ''] as const,
  gds: (caseId: string, a?: string | null) => ['gds', caseId, a ?? ''] as const,
  pleading: (caseId: string, a?: string | null) => ['pleading', caseId, a ?? ''] as const,
  document: (caseId: string, docId: string, a?: string | null) =>
    ['document', caseId, docId, a ?? ''] as const,
}

export const useCases = (analysisId?: string | null) =>
  useQuery({ queryKey: qk.cases(analysisId), queryFn: () => api.listCases(analysisId) })

export const useStats = (caseId: string, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.stats(caseId, analysisId),
    queryFn: () => api.getStats(caseId, analysisId),
    enabled: !!caseId,
  })

export const useGraph = (caseId: string, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.graph(caseId, analysisId),
    queryFn: () => api.getCaseGraph(caseId, analysisId),
    enabled: !!caseId,
  })

export const useClaim = (claimId: string | null | undefined, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.claim(claimId ?? '', analysisId),
    queryFn: () => api.getClaim(claimId as string, analysisId),
    enabled: !!claimId,
  })

export const useEvidence = (claimId: string | null | undefined, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.evidence(claimId ?? '', analysisId),
    queryFn: () => api.getEvidence(claimId as string, analysisId),
    enabled: !!claimId,
  })

export const useRedTeam = (caseId: string, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.redteam(caseId, analysisId),
    queryFn: () => api.getRedTeam(caseId, analysisId),
    enabled: !!caseId,
  })

export const useGds = (caseId: string, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.gds(caseId, analysisId),
    queryFn: () => api.getGds(caseId, analysisId),
    enabled: !!caseId,
  })

export const usePleading = (caseId: string, analysisId?: string | null) =>
  useQuery({
    queryKey: qk.pleading(caseId, analysisId),
    queryFn: () => api.getPleading(caseId, analysisId),
    enabled: !!caseId,
  })

export const useDocument = (
  caseId: string,
  docId: string | null | undefined,
  analysisId?: string | null,
) =>
  useQuery({
    queryKey: qk.document(caseId, docId ?? '', analysisId),
    queryFn: () => api.getDocument(caseId, docId as string, analysisId),
    enabled: !!caseId && !!docId,
    staleTime: Infinity, // document text never changes
  })
