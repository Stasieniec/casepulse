import { describe, it, expect } from 'vitest'
import { MockGraphProvider } from '../worker/lib/providers/graph.mock'

const g = new MockGraphProvider()

describe('MockGraphProvider', () => {
  it('lists the Meridian case', async () => {
    expect((await g.listCases())[0].name).toMatch(/Meridian/)
  })

  it('returns 13 claims and edges in the graph', async () => {
    const cg = await g.getCaseGraph('meridian')
    expect(cg.claims).toHaveLength(13)
    expect(cg.edges.length).toBeGreaterThan(20)
  })

  it('stats overall score is 28 with 8 contradicted', async () => {
    const s = await g.getStats('meridian')
    expect(s.overallScore).toBe(28)
    expect(s.contradicted).toBe(8)
  })

  it('claim detail splits supporting/contradicting', async () => {
    const d = await g.getClaim('P6')
    expect(d.contradicting.length).toBeGreaterThan(0)
    expect(d.supporting.length).toBe(0)
  })
})
