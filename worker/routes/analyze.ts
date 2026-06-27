import { Hono } from 'hono'
import type { Env } from '../index'
import { runAnalysis } from '../lib/pipeline'

export const analyze = new Hono<{ Bindings: Env }>()

analyze.post('/', async (c) => {
  try {
    const body = await c.req.json<{ caseId: string; pleadingText: string }>()
    const { caseId, pleadingText } = body
    if (!caseId || !pleadingText) {
      return c.json({ error: 'caseId and pleadingText are required' }, 400)
    }
    const result = await runAnalysis(c.env, { caseId, pleadingText })
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/analyze]', msg)
    return c.json({ error: msg }, 500)
  }
})
