import { Hono } from 'hono'
import type { Env } from '../index'
import { getGraphProvider } from '../lib/providers/graph'

export const cases = new Hono<{ Bindings: Env }>()

cases.get('/', async (c) => c.json(await getGraphProvider(c.env).listCases()))
cases.get('/:id/stats', async (c) => c.json(await getGraphProvider(c.env).getStats(c.req.param('id'))))
cases.get('/:id/graph', async (c) => c.json(await getGraphProvider(c.env).getCaseGraph(c.req.param('id'))))
cases.get('/:id/redteam', async (c) => c.json(await getGraphProvider(c.env).getRedTeam(c.req.param('id'))))
cases.get('/:id/gds', async (c) => c.json(await getGraphProvider(c.env).getGdsOverlays(c.req.param('id'))))
cases.get('/:id/pleading', async (c) => c.json(await getGraphProvider(c.env).getPleading(c.req.param('id'))))
