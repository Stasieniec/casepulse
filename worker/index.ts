import { Hono } from 'hono'
import { cases } from './routes/cases'
import { claims } from './routes/graph'
import { analyze } from './routes/analyze'
import { ingest } from './routes/ingest'

export type Env = {
  ASSETS: Fetcher; DB: D1Database; UPLOADS?: R2Bucket; VECTORIZE?: VectorizeIndex
  LLM_PROVIDER: string; GEMINI_API_KEY: string; GEMINI_MODEL: string; GEMINI_EMBED_MODEL: string
  NVIDIA_API_KEY?: string; NVIDIA_MODEL?: string; NVIDIA_EMBED_MODEL?: string
  NEO4J_QUERY_URL?: string; NEO4J_USER?: string; NEO4J_PASSWORD?: string
  GCP_DOCAI_ENDPOINT?: string; GCP_TOKEN?: string; GRAPH_PROVIDER?: string
  // Google Document AI (ingest pipeline)
  // GCP_SA_KEY            — full JSON of a GCP service-account key (set as a secret)
  // GCP_DOCAI_PROCESSOR   — full resource name:
  //                         projects/{project_number}/locations/{location}/processors/{id}
  // GCP_PROJECT           — GCP project id or number (informational; used by scripts)
  GCP_SA_KEY?: string
  GCP_ACCESS_TOKEN?: string // short-lived OAuth token (used where SA-key creation is org-policy-blocked)
  GCP_DOCAI_PROCESSOR?: string
  GCP_PROJECT?: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/cases', cases)
app.route('/api/claims', claims)
app.route('/api/analyze', analyze)
app.route('/api/ingest', ingest)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
