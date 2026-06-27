import { Hono } from 'hono'

export type Env = {
  ASSETS: Fetcher; DB: D1Database; UPLOADS: R2Bucket; VECTORIZE: VectorizeIndex
  LLM_PROVIDER: string; GEMINI_API_KEY: string; GEMINI_MODEL: string; GEMINI_EMBED_MODEL: string
  NVIDIA_API_KEY?: string; NEO4J_QUERY_URL?: string; NEO4J_USER?: string; NEO4J_PASSWORD?: string
  GCP_DOCAI_ENDPOINT?: string; GCP_TOKEN?: string; GRAPH_PROVIDER?: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
