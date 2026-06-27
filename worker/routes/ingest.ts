import { Hono } from 'hono'
import type { Env } from '../index'
import { DOC_PDFS } from '../lib/pdf-data'
import { extractTextFromPdf } from '../lib/docai'

/** Human-readable titles for the 4 exhibit PDFs. */
const DOC_TITLES: Record<string, string> = {
  D07: 'Change Order No. 3',
  D08: 'Phase-1 UAT Acceptance Certificate',
  D09: 'Email — go-live decision',
  D19: 'Expert report — Dr Whitfield (IT)',
}

export const ingest = new Hono<{ Bindings: Env }>()

/**
 * POST /api/ingest
 * Body: { docId: 'D07' | 'D08' | 'D09' | 'D19' }
 *
 * Sends the matching exhibit PDF to Google Document AI and returns the
 * extracted text.
 *
 * Returns 503 when GCP credentials are not configured — no fake fallback.
 */
ingest.post('/', async (c) => {
  // Guard: both env vars must be set — return 503 if not (no fake fallback)
  if (!c.env.GCP_SA_KEY || !c.env.GCP_DOCAI_PROCESSOR) {
    return c.json({ error: 'Document AI not configured' }, 503)
  }

  let body: { docId?: string }
  try {
    body = await c.req.json<{ docId?: string }>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { docId } = body
  if (!docId) {
    return c.json({ error: 'docId is required' }, 400)
  }

  const pdfBase64 = DOC_PDFS[docId]
  if (!pdfBase64) {
    return c.json(
      {
        error: `Unknown docId "${docId}". Valid values: ${Object.keys(DOC_PDFS).join(', ')}`,
      },
      400,
    )
  }

  try {
    const text = await extractTextFromPdf(c.env, pdfBase64)
    const title = DOC_TITLES[docId] ?? docId
    return c.json({ docId, title, text, charCount: text.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/ingest]', msg)
    return c.json({ error: msg }, 500)
  }
})
