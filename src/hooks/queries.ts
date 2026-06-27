import { useQuery } from '@tanstack/react-query'
import * as api from '../api'

/** Centralized query keys so callers can invalidate consistently. */
export const qk = {
  cases: ['cases'] as const,
  stats: (caseId: string) => ['stats', caseId] as const,
  graph: (caseId: string) => ['graph', caseId] as const,
  claim: (claimId: string) => ['claim', claimId] as const,
  evidence: (claimId: string) => ['evidence', claimId] as const,
  redteam: (caseId: string) => ['redteam', caseId] as const,
  gds: (caseId: string) => ['gds', caseId] as const,
  pleading: (caseId: string) => ['pleading', caseId] as const,
}

export const useCases = () => useQuery({ queryKey: qk.cases, queryFn: api.listCases })

export const useStats = (caseId: string) =>
  useQuery({ queryKey: qk.stats(caseId), queryFn: () => api.getStats(caseId), enabled: !!caseId })

export const useGraph = (caseId: string) =>
  useQuery({ queryKey: qk.graph(caseId), queryFn: () => api.getCaseGraph(caseId), enabled: !!caseId })

export const useClaim = (claimId: string | null | undefined) =>
  useQuery({
    queryKey: qk.claim(claimId ?? ''),
    queryFn: () => api.getClaim(claimId as string),
    enabled: !!claimId,
  })

export const useEvidence = (claimId: string | null | undefined) =>
  useQuery({
    queryKey: qk.evidence(claimId ?? ''),
    queryFn: () => api.getEvidence(claimId as string),
    enabled: !!claimId,
  })

export const useRedTeam = (caseId: string) =>
  useQuery({ queryKey: qk.redteam(caseId), queryFn: () => api.getRedTeam(caseId), enabled: !!caseId })

export const useGds = (caseId: string) =>
  useQuery({ queryKey: qk.gds(caseId), queryFn: () => api.getGds(caseId), enabled: !!caseId })

export const usePleading = (caseId: string) =>
  useQuery({
    queryKey: qk.pleading(caseId),
    queryFn: () => api.getPleading(caseId),
    enabled: !!caseId,
  })
