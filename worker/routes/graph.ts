import { Hono } from 'hono'
import type { Env } from '../index'
import { getGraphProvider } from '../lib/providers/graph'

export const claims = new Hono<{ Bindings: Env }>()

claims.get('/:id', async (c) => c.json(await getGraphProvider(c.env).getClaim(c.req.param('id'))))
claims.get('/:id/evidence', async (c) => c.json(await getGraphProvider(c.env).getEvidenceForClaim(c.req.param('id'))))
