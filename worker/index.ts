import { Hono } from 'hono'
import { cases } from './routes/cases'
import { claims } from './routes/graph'
import { analyze } from './routes/analyze'

export type Env = {
  ASSETS: Fetcher; DB: D1Database; UPLOADS?: R2Bucket; VECTORIZE?: VectorizeIndex
  LLM_PROVIDER: string; GEMINI_API_KEY: string; GEMINI_MODEL: string; GEMINI_EMBED_MODEL: string
  NVIDIA_API_KEY?: string; NEO4J_QUERY_URL?: string; NEO4J_USER?: string; NEO4J_PASSWORD?: string
  GCP_DOCAI_ENDPOINT?: string; GCP_TOKEN?: string; GRAPH_PROVIDER?: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/cases', cases)
app.route('/api/claims', claims)
app.route('/api/analyze', analyze)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
