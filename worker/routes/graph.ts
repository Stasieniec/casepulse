import { Hono } from 'hono'
import type { Env } from '../index'
import { getGraphProvider } from '../lib/providers/graph'

export const claims = new Hono<{ Bindings: Env }>()

/** Get the right GraphProvider, routing to LiveGraphProvider when ?analysis= is set. */
function provider(c: { env: Env; req: { query: (k: string) => string | undefined } }) {
  return getGraphProvider(c.env, c.req.query('analysis'))
}

claims.get('/:id', async (c) => c.json(await provider(c).getClaim(c.req.param('id'))))
claims.get('/:id/evidence', async (c) =>
  c.json(await provider(c).getEvidenceForClaim(c.req.param('id'))),
)
