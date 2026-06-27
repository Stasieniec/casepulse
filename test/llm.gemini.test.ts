/**
 * Live tests for GeminiProvider — guarded by RUN_LIVE=1.
 *
 * Run with:
 *   RUN_LIVE=1 GEMINI_API_KEY="$(grep '^GEMINI_API_KEY=' .dev.vars | cut -d= -f2-)" \
 *     npx vitest run test/llm.gemini.test.ts
 *
 * The default `npm run test` (no RUN_LIVE) skips all tests here.
 */
import { describe, it, expect } from 'vitest'
import { GeminiProvider } from '../worker/lib/providers/llm.gemini'

const live = process.env.RUN_LIVE === '1'

describe.runIf(live)('GeminiProvider (live)', () => {
  const provider = new GeminiProvider({
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-3.5-flash',
    embedModel: 'gemini-embedding-001',
  })

  it('extractClaims returns ≥2 claims for a 2-proposition pleading', async () => {
    const claims = await provider.extractClaims(
      '1. The defendant failed to deliver the platform by the agreed date. ' +
        '2. The claimant suffered loss of £50,000 as a direct result.',
    )
    expect(claims.length).toBeGreaterThanOrEqual(2)
    expect(claims[0]).toHaveProperty('label')
    expect(claims[0]).toHaveProperty('paragraphRef')
    expect(claims[0]).toHaveProperty('text')
    expect(typeof claims[0].text).toBe('string')
    expect(claims[0].text.length).toBeGreaterThan(0)
    // spanStart is -1 sentinel (filled by mapClaimSpan in pipeline)
    expect(claims[0]).toHaveProperty('spanStart')
  }, 30_000)

  it('judgeEdge returns contradicts + confidence > 0.5 for the downtime scenario', async () => {
    const result = await provider.judgeEdge(
      'Platform was down >40%',
      'Expert: downtime was ~6.2%',
      'Expert Report',
    )
    expect(result.relation).toBe('contradicts')
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(['supports', 'contradicts', 'neutral']).toContain(result.relation)
    expect(typeof result.rationale).toBe('string')
    expect(result.rationale.length).toBeGreaterThan(0)
  }, 30_000)

  it('embed returns 768-dim, approximately unit-normalized vectors', async () => {
    const vecs = await provider.embed(['hello world'])
    expect(vecs).toHaveLength(1)
    const v = vecs[0]
    expect(v.length).toBe(768)

    // Confirm L2-normalization: ||v|| should be very close to 1.0
    const norm = Math.sqrt(v.reduce((sum: number, x: number) => sum + x * x, 0))
    expect(norm).toBeCloseTo(1.0, 3)
  }, 30_000)
})
