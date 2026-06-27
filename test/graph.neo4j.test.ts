/**
 * Neo4jGraphProvider live integration tests.
 *
 * Guarded by RUN_NEO4J=1 — skipped by default so `npm run test` stays offline.
 * Run once live with:
 *   source .dev.vars && RUN_NEO4J=1 npx vitest run test/graph.neo4j.test.ts
 *
 * Credentials are read from .dev.vars env vars (NEO4J_QUERY_URL, NEO4J_USER,
 * NEO4J_PASSWORD) — never hardcoded.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Neo4jGraphProvider } from '../worker/lib/providers/graph.neo4j'
import type { Env } from '../worker/index'

const RUN = process.env.RUN_NEO4J === '1'

function makeEnv(): Env {
  return {
    ASSETS: null as unknown as Fetcher,
    DB: null as unknown as D1Database,
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
    GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
    GEMINI_EMBED_MODEL: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
    NEO4J_QUERY_URL: process.env.NEO4J_QUERY_URL ?? '',
    NEO4J_USER: process.env.NEO4J_USER ?? '',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? '',
    GRAPH_PROVIDER: 'neo4j',
  }
}

describe.skipIf(!RUN)('Neo4jGraphProvider live (RUN_NEO4J=1 required)', () => {
  let provider: Neo4jGraphProvider

  beforeAll(() => {
    provider = new Neo4jGraphProvider(makeEnv())
  })

  it('getCaseGraph returns 13 claims and 18 evidence', async () => {
    const graph = await provider.getCaseGraph('meridian')
    expect(graph.claims).toHaveLength(13)
    expect(graph.evidence).toHaveLength(18)
    // 103 Extract nodes → 103 edges (one per finding, no deduplication in extract model)
    expect(graph.edges.length).toBeGreaterThanOrEqual(103)
  })

  it('getStats returns contradicted=8 and wellSupported=3', async () => {
    const stats = await provider.getStats('meridian')
    expect(stats.contradicted).toBe(8)
    expect(stats.wellSupported).toBe(3)
    // overallScore computed from live Neo4j status counts (same formula as aggregate.ts)
    // The seed reports 28 (editorially set); live formula gives 29 — both in the ~25-35 range
    expect(stats.overallScore).toBeGreaterThanOrEqual(25)
    expect(stats.overallScore).toBeLessThanOrEqual(35)
  })

  it('getClaim P6 has only contradicting edges and none supporting', async () => {
    const detail = await provider.getClaim('P6')
    expect(detail.contradicting.length).toBeGreaterThan(0)
    expect(detail.supporting.length).toBe(0)
  })

  it('getRedTeam returns 10 items', async () => {
    const items = await provider.getRedTeam('meridian')
    expect(items).toHaveLength(10)
  })

  it('getGdsOverlays returns real PageRank centrality for P9', async () => {
    const gds = await provider.getGdsOverlays('meridian')
    // P9 has high claim centrality (3.1682 in extract-level model) per gds-results.json
    expect(gds.centrality['P9']).toBeGreaterThan(1.5)
    // P3 is in community 123 per Louvain results (extract-level model v2)
    expect(gds.communities['P3']).toBe(123)
    // missingEvidence should include high-risk gap claims
    expect(gds.missingEvidence).toContain('P6')
  })

  it('listCases returns the Meridian case', async () => {
    const cases = await provider.listCases()
    expect(cases.length).toBeGreaterThan(0)
    expect(cases[0].name).toMatch(/Meridian/i)
  })
})
