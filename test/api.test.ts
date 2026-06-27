import { env, SELF } from 'cloudflare:test'
import { it, expect } from 'vitest'

it('GET /api/cases/meridian/stats?analysis=<id> returns live stats from D1', async () => {
  const db = env.DB
  const analysisId = 'test-analysis-001'
  const pleadingId = `meridian-${analysisId}`
  const now = new Date().toISOString()

  // Insert minimal pleading
  await db
    .prepare(
      `INSERT OR REPLACE INTO pleadings (id, case_id, title, full_text, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(pleadingId, 'meridian', 'Test Pleading', 'Test pleading text.', now)
    .run()

  // Insert analysis row with canned stats
  const counts = JSON.stringify({
    wellSupported: 2,
    contested: 1,
    contradicted: 3,
    gaps: 0,
    unaddressed: 0,
  })
  await db
    .prepare(
      `INSERT OR REPLACE INTO analyses (id, case_id, pleading_id, overall_score, counts_json, verdict, vulnerabilities_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(analysisId, 'meridian', pleadingId, 42, counts, 'Contested', '["Claim 3 contradicted"]', now)
    .run()

  const r = await SELF.fetch(`http://x/api/cases/meridian/stats?analysis=${analysisId}`)
  expect(r.status).toBe(200)
  const j = (await r.json()) as any
  expect(j.overallScore).toBe(42)
  expect(j.contradicted).toBe(3)
  expect(j.wellSupported).toBe(2)
})

it('GET /api/cases returns Meridian', async () => {
  const r = await SELF.fetch('http://x/api/cases')
  const j = await r.json() as any[]
  expect(r.status).toBe(200)
  expect(j[0].name).toMatch(/Meridian/)
})

it('GET /api/cases/meridian/stats returns overall 28', async () => {
  const j = await (await SELF.fetch('http://x/api/cases/meridian/stats')).json() as any
  expect(j.overallScore).toBe(28)
})

it('GET /api/cases/meridian/pleading returns non-empty fullText containing Particulars', async () => {
  const r = await SELF.fetch('http://x/api/cases/meridian/pleading')
  expect(r.status).toBe(200)
  const j = await r.json() as any
  expect(typeof j.fullText).toBe('string')
  expect(j.fullText.length).toBeGreaterThan(100)
  expect(j.fullText).toContain('Particulars')
})

it('GET /api/cases/meridian/documents/D19 returns the Whitfield report text + title', async () => {
  const r = await SELF.fetch('http://x/api/cases/meridian/documents/D19')
  expect(r.status).toBe(200)
  const j = await r.json() as any
  expect(j.docId).toBe('D19')
  expect(j.title).toMatch(/Whitfield/)
  expect(typeof j.text).toBe('string')
  expect(j.text).toContain('6.2%')
})

it('GET /api/cases/meridian/documents/UNKNOWN returns 404', async () => {
  const r = await SELF.fetch('http://x/api/cases/meridian/documents/ZZZ')
  expect(r.status).toBe(404)
})
