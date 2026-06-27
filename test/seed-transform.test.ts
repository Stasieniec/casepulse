import { describe, it, expect } from 'vitest'
import { buildSeed } from '../worker/lib/seed-transform'
import matrix from '../seed/meridian.matrix.json'
import { readFileSync } from 'fs'

function readPleading() {
  return readFileSync('seed/meridian.pleading.txt', 'utf8')
}

describe('buildSeed', () => {
  it('produces 13 claims with statuses and risk', () => {
    const s = buildSeed(matrix as any, readPleading())
    expect(s.claims).toHaveLength(13)
    const p6 = s.claims.find(c => c.label === 'P6')!
    expect(p6.status).toBe('contradicted')
    expect(p6.riskScore).toBe(95)
  })

  it('maps every finding to an edge with a verbatim quote', () => {
    const s = buildSeed(matrix as any, readPleading())
    expect(s.edges.length).toBeGreaterThan(20)
    expect(s.edges.every(e => e.quote.length > 0 && ['supports', 'contradicts', 'neutral'].includes(e.relation))).toBe(true)
  })

  it('assigns spans within the pleading text for each claim', () => {
    const s = buildSeed(matrix as any, readPleading())
    expect(s.claims.every(c => c.spanEnd > c.spanStart && c.spanEnd <= s.normalizedPleading.length)).toBe(true)
  })
})
