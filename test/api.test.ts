import { env, SELF } from 'cloudflare:test'
import { it, expect } from 'vitest'

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
