/**
 * TDD tests for aggregateClaim and computeStats (Task 2.5).
 */
import { describe, it, expect } from 'vitest'
import { aggregateClaim, computeStats } from '../worker/lib/aggregate'

// ---------------------------------------------------------------------------
// aggregateClaim — status + riskScore
// ---------------------------------------------------------------------------
describe('aggregateClaim — status determination', () => {
  it('returns well_supported when only supports edges above threshold', () => {
    const edges = [
      { relation: 'supports' as const, confidence: 0.9, quote: 'q', rationale: 'r' },
      { relation: 'supports' as const, confidence: 0.75, quote: 'q2', rationale: 'r2' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('well_supported')
  })

  it('returns contradicted when only contradicts edges above threshold', () => {
    const edges = [
      { relation: 'contradicts' as const, confidence: 0.85, quote: 'q', rationale: 'r' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('contradicted')
  })

  it('returns contested when both supports and contradicts edges above threshold', () => {
    const edges = [
      { relation: 'supports' as const, confidence: 0.8, quote: 'q', rationale: 'r' },
      { relation: 'contradicts' as const, confidence: 0.7, quote: 'q2', rationale: 'r2' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('contested')
  })

  it('returns gap when all edges are below confidence threshold (candidate edges exist)', () => {
    // All below 0.55 threshold — abstained; but candidates existed.
    const edges = [
      { relation: 'neutral' as const, confidence: 0.3, quote: '', rationale: 'weak' },
      { relation: 'contradicts' as const, confidence: 0.4, quote: 'q', rationale: 'r' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('gap')
  })

  it('returns unaddressed when no edges at all', () => {
    const result = aggregateClaim([], {})
    expect(result.status).toBe('unaddressed')
  })

  it('returns gap (not unaddressed) when edges exist but all are abstained', () => {
    const edges = [
      { relation: 'supports' as const, confidence: 0.2, quote: '', rationale: '' },
      { relation: 'supports' as const, confidence: 0.1, quote: '', rationale: '' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('gap')
  })
})

describe('aggregateClaim — abstention threshold', () => {
  it('drops edges with confidence < 0.55', () => {
    const edges = [
      { relation: 'contradicts' as const, confidence: 0.54, quote: 'q', rationale: 'r' }, // dropped
      { relation: 'supports' as const, confidence: 0.8, quote: 'q2', rationale: 'r2' },   // kept
    ]
    const result = aggregateClaim(edges, {})
    // Only the supports edge is retained → well_supported
    expect(result.status).toBe('well_supported')
  })

  it('retains edges at exactly 0.55', () => {
    const edges = [
      { relation: 'contradicts' as const, confidence: 0.55, quote: 'q', rationale: 'r' },
    ]
    const result = aggregateClaim(edges, {})
    expect(result.status).toBe('contradicted')
  })
})

describe('aggregateClaim — riskScore ordering', () => {
  it('contradicted with high confidence → higher riskScore than gap', () => {
    const contradicted = aggregateClaim([
      { relation: 'contradicts' as const, confidence: 0.95, quote: 'q', rationale: 'r' },
    ], {})
    const gap = aggregateClaim([
      { relation: 'neutral' as const, confidence: 0.3, quote: '', rationale: '' },
    ], {})
    expect(contradicted.riskScore).toBeGreaterThan(gap.riskScore)
  })

  it('gap → higher riskScore than well_supported', () => {
    const gap = aggregateClaim([
      { relation: 'neutral' as const, confidence: 0.3, quote: '', rationale: '' },
    ], {})
    const wellSupported = aggregateClaim([
      { relation: 'supports' as const, confidence: 0.9, quote: 'q', rationale: 'r' },
    ], {})
    expect(gap.riskScore).toBeGreaterThan(wellSupported.riskScore)
  })

  it('high-confidence contradicted → higher riskScore than low-confidence contradicted', () => {
    const highConf = aggregateClaim([
      { relation: 'contradicts' as const, confidence: 0.95, quote: 'q', rationale: 'r' },
    ], {})
    const lowConf = aggregateClaim([
      { relation: 'contradicts' as const, confidence: 0.6, quote: 'q', rationale: 'r' },
    ], {})
    expect(highConf.riskScore).toBeGreaterThan(lowConf.riskScore)
  })

  it('riskScore is between 0 and 100', () => {
    const cases = [
      aggregateClaim([], {}),
      aggregateClaim([{ relation: 'supports' as const, confidence: 0.9, quote: '', rationale: '' }], {}),
      aggregateClaim([{ relation: 'contradicts' as const, confidence: 0.95, quote: '', rationale: '' }], {}),
      aggregateClaim([{ relation: 'neutral' as const, confidence: 0.2, quote: '', rationale: '' }], {}),
    ]
    for (const c of cases) {
      expect(c.riskScore).toBeGreaterThanOrEqual(0)
      expect(c.riskScore).toBeLessThanOrEqual(100)
    }
  })
})

// ---------------------------------------------------------------------------
// computeStats — counts + overallScore
// ---------------------------------------------------------------------------
describe('computeStats', () => {
  it('counts each status correctly', () => {
    const claims = [
      { status: 'well_supported' as const },
      { status: 'well_supported' as const },
      { status: 'contradicted' as const },
      { status: 'contradicted' as const },
      { status: 'contradicted' as const },
      { status: 'contested' as const },
      { status: 'gap' as const },
      { status: 'unaddressed' as const },
    ]
    const stats = computeStats(claims)
    expect(stats.wellSupported).toBe(2)
    expect(stats.contradicted).toBe(3)
    expect(stats.contested).toBe(1)
    expect(stats.gaps).toBe(1)
    expect(stats.unaddressed).toBe(1)
  })

  it('overallScore is higher when more claims are well_supported', () => {
    const good = computeStats([
      { status: 'well_supported' as const },
      { status: 'well_supported' as const },
      { status: 'well_supported' as const },
    ])
    const bad = computeStats([
      { status: 'contradicted' as const },
      { status: 'contradicted' as const },
      { status: 'contradicted' as const },
    ])
    expect(good.overallScore).toBeGreaterThan(bad.overallScore)
  })

  it('overallScore is between 0 and 100', () => {
    const mixed = computeStats([
      { status: 'well_supported' as const },
      { status: 'contradicted' as const },
      { status: 'gap' as const },
      { status: 'unaddressed' as const },
    ])
    expect(mixed.overallScore).toBeGreaterThanOrEqual(0)
    expect(mixed.overallScore).toBeLessThanOrEqual(100)
  })

  it('returns 0 overallScore for empty claims', () => {
    const stats = computeStats([])
    expect(stats.overallScore).toBe(0)
    expect(stats.wellSupported).toBe(0)
    expect(stats.contradicted).toBe(0)
  })

  it('all-well-supported → overallScore near 100', () => {
    const stats = computeStats([
      { status: 'well_supported' as const },
      { status: 'well_supported' as const },
    ])
    expect(stats.overallScore).toBeGreaterThanOrEqual(80)
  })

  it('all-contradicted → overallScore near 0', () => {
    const stats = computeStats([
      { status: 'contradicted' as const },
      { status: 'contradicted' as const },
    ])
    expect(stats.overallScore).toBeLessThanOrEqual(20)
  })
})
