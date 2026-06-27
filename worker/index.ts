import { Hono } from 'hono'

export type Env = { ASSETS: Fetcher } // expanded in a later task

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
