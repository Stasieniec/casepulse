import { Hono } from 'hono'
import type { Env } from '../index'
import { getGraphProvider } from '../lib/providers/graph'

export const cases = new Hono<{ Bindings: Env }>()

/** Get the right GraphProvider, routing to LiveGraphProvider when ?analysis= is set. */
function provider(c: { env: Env; req: { query: (k: string) => string | undefined } }) {
  return getGraphProvider(c.env, c.req.query('analysis'))
}

cases.get('/', async (c) => c.json(await provider(c).listCases()))
cases.get('/:id/stats', async (c) => c.json(await provider(c).getStats(c.req.param('id'))))
cases.get('/:id/graph', async (c) => c.json(await provider(c).getCaseGraph(c.req.param('id'))))
cases.get('/:id/redteam', async (c) => c.json(await provider(c).getRedTeam(c.req.param('id'))))
cases.get('/:id/gds', async (c) => c.json(await provider(c).getGdsOverlays(c.req.param('id'))))
cases.get('/:id/pleading', async (c) => c.json(await provider(c).getPleading(c.req.param('id'))))
cases.get('/:id/documents/:docId', async (c) => {
  try {
    const doc = await provider(c).getDocument(c.req.param('id'), c.req.param('docId'))
    return c.json(doc)
  } catch {
    return c.json({ error: 'Document not found' }, 404)
  }
})
