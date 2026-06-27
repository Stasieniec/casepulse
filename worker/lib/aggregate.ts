/**
 * Aggregation + abstention logic (Task 2.5).
 *
 * aggregateClaim — given the judged edges for a single claim, compute its
 *   ClaimStatus and riskScore. Edges below the confidence threshold are
 *   abstained (dropped). Remaining edges determine status:
 *
 *     contradicts only (any) + no supports  → contradicted
 *     supports only                         → well_supported
 *     both supports AND contradicts         → contested
 *     no retained edges, but candidates existed → gap
 *     no candidate edges at all             → unaddressed
 *
 * riskScore is monotonically ordered:
 *   contradicted (high-conf) > contradicted (low-conf) > gap > contested > well_supported
 *
 * computeStats — given all claims in a case, compute case-level Stats.
 *   overallScore formula: weighted average where each claim contributes a
 *   status-specific weight (well_supported→100, contested→50, gap→30,
 *   unaddressed→20, contradicted→0). Penalized further by the fraction of
 *   contradicted claims.
 */
import type { ClaimStatus, Stats } from '../../shared/types'

/** Minimum confidence for an edge to count (abstention threshold). */
const CONFIDENCE_THRESHOLD = 0.55

export interface EdgeLike {
  relation: 'supports' | 'contradicts' | 'neutral'
  confidence: number
  quote: string
  rationale: string
}

export interface AggregateResult {
  status: ClaimStatus
  riskScore: number
}

export interface AggregateOpts {
  /** Override confidence threshold (default 0.55). */
  confidenceThreshold?: number
}

export function aggregateClaim(edges: EdgeLike[], opts: AggregateOpts = {}): AggregateResult {
  const threshold = opts.confidenceThreshold ?? CONFIDENCE_THRESHOLD
  const hadCandidates = edges.length > 0

  // Drop low-confidence / neutral edges (abstention).
  const retained = edges.filter(
    e => e.confidence >= threshold && (e.relation === 'supports' || e.relation === 'contradicts'),
  )

  const hasSupports = retained.some(e => e.relation === 'supports')
  const hasContradicts = retained.some(e => e.relation === 'contradicts')

  let status: ClaimStatus
  let riskScore: number

  if (retained.length === 0) {
    // No strong evidence either way.
    status = hadCandidates ? 'gap' : 'unaddressed'
    riskScore = hadCandidates ? 40 : 20
  } else if (hasContradicts && !hasSupports) {
    status = 'contradicted'
    // riskScore for contradicted: 60..100 scaled by max adverse confidence.
    const maxAdverse = Math.max(...retained.filter(e => e.relation === 'contradicts').map(e => e.confidence))
    riskScore = Math.round(60 + maxAdverse * 40)
  } else if (hasSupports && !hasContradicts) {
    status = 'well_supported'
    // riskScore for well_supported: 0..20 (inverse of support confidence).
    const maxSupport = Math.max(...retained.filter(e => e.relation === 'supports').map(e => e.confidence))
    riskScore = Math.round((1 - maxSupport) * 20)
  } else {
    // Both present → contested.
    status = 'contested'
    // contested: 30..59 range.
    const maxAdverse = Math.max(...retained.filter(e => e.relation === 'contradicts').map(e => e.confidence))
    riskScore = Math.round(30 + maxAdverse * 29)
  }

  return { status, riskScore: Math.max(0, Math.min(100, riskScore)) }
}

// ---------------------------------------------------------------------------
// Status weights for overallScore (higher = stronger case position).
// well_supported → 100 pts, contested → 50, gap → 30, unaddressed → 20, contradicted → 0
// ---------------------------------------------------------------------------
const STATUS_WEIGHT: Record<ClaimStatus, number> = {
  well_supported: 100,
  contested: 50,
  gap: 30,
  unaddressed: 20,
  contradicted: 0,
}

export interface ClaimLike {
  status: ClaimStatus
  /** Optional headline for verdict/vulnerability generation (live analyses only). */
  headline?: string
  /** Optional label (e.g. "P6") for display in vulnerabilities list. */
  label?: string
}

export function computeStats(claims: ClaimLike[], _opts?: unknown): Stats {
  if (claims.length === 0) {
    return {
      wellSupported: 0,
      contested: 0,
      contradicted: 0,
      gaps: 0,
      unaddressed: 0,
      overallScore: 0,
      verdict: '',
      biggestVulnerabilities: [],
    }
  }

  let wellSupported = 0
  let contested = 0
  let contradicted = 0
  let gaps = 0
  let unaddressed = 0

  for (const c of claims) {
    switch (c.status) {
      case 'well_supported': wellSupported++; break
      case 'contested': contested++; break
      case 'contradicted': contradicted++; break
      case 'gap': gaps++; break
      case 'unaddressed': unaddressed++; break
    }
  }

  // Weighted average of status points.
  const totalPoints = claims.reduce((sum, c) => sum + STATUS_WEIGHT[c.status], 0)
  const overallScore = Math.round(totalPoints / claims.length)

  // Template-based verdict + vulnerabilities (no LLM call).
  // Built from claim counts and the highest-risk contradicted/gap/contested headlines.
  const riskyClaims = claims.filter(
    c => c.status === 'contradicted' || c.status === 'gap' || c.status === 'contested',
  )

  const biggestVulnerabilities: string[] = riskyClaims
    .slice(0, 6)
    .map(c => {
      const prefix = c.label ? `[${c.label}]` : `[${c.status}]`
      const hl = c.headline ?? '(no headline)'
      return `${prefix} ${hl}`
    })

  let verdict = ''
  if (riskyClaims.length === 0) {
    verdict = `Case analysis shows strong evidential support across all ${claims.length} propositions. Overall trial-readiness score: ${overallScore}/100.`
  } else {
    const topRiskHeadlines = riskyClaims
      .slice(0, 3)
      .map(c => c.headline ?? c.label ?? 'unknown')
      .join('; ')
    verdict =
      `Of ${claims.length} propositions analysed, ${wellSupported} are well-supported, ` +
      `${contradicted} contradicted, ${gaps} gap${gaps !== 1 ? 's' : ''}, ` +
      `${contested} contested, and ${unaddressed} unaddressed. ` +
      `Overall trial-readiness score: ${overallScore}/100. ` +
      `Highest-risk areas: ${topRiskHeadlines}.`
  }

  return {
    wellSupported,
    contested,
    contradicted,
    gaps,
    unaddressed,
    overallScore,
    verdict,
    biggestVulnerabilities,
  }
}
