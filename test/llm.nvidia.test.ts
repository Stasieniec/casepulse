/**
 * Live tests for NvidiaProvider — guarded by RUN_LIVE=1.
 *
 * Run with:
 *   RUN_LIVE=1 NVIDIA_API_KEY="$(grep '^NVIDIA_API_KEY=' .dev.vars | cut -d= -f2-)" \
 *     npx vitest run test/llm.nvidia.test.ts
 *
 * The default `npm run test` (no RUN_LIVE) skips all tests here.
 */
import { describe, it, expect } from 'vitest'
import { NvidiaProvider } from '../worker/lib/providers/llm.nvidia'

const live = process.env.RUN_LIVE === '1'

describe.runIf(live)('NvidiaProvider (live)', () => {
  const provider = new NvidiaProvider({
    apiKey: process.env.NVIDIA_API_KEY!,
    model: process.env.NVIDIA_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    embedModel: process.env.NVIDIA_EMBED_MODEL ?? 'nvidia/nv-embedqa-e5-v5',
  })

  it('extractClaims returns ≥2 claims for a 2-proposition pleading', async () => {
    const claims = await provider.extractClaims(
      '1. The defendant delivered the platform late. ' +
        '2. The platform was unavailable for more than 40% of trading hours.',
    )
    expect(claims.length).toBeGreaterThanOrEqual(2)
    expect(claims[0]).toHaveProperty('label')
    expect(claims[0]).toHaveProperty('paragraphRef')
    expect(claims[0]).toHaveProperty('text')
    expect(typeof claims[0].text).toBe('string')
    expect(claims[0].text.length).toBeGreaterThan(0)
    // spanStart is -1 sentinel (filled by mapClaimSpan in pipeline)
    expect(claims[0].spanStart).toBe(-1)
  }, 60_000)

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
    // confidence must be clamped to [0, 1]
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  }, 60_000)

  it('embed returns 1024-dim vectors', async () => {
    const vecs = await provider.embed(['hello'])
    expect(vecs).toHaveLength(1)
    const v = vecs[0]
    expect(v.length).toBe(1024)

    // Confirm L2-normalization: ||v|| should be very close to 1.0
    const norm = Math.sqrt(v.reduce((sum: number, x: number) => sum + x * x, 0))
    expect(norm).toBeCloseTo(1.0, 3)
  }, 60_000)
})
