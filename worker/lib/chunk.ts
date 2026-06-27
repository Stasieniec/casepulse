/**
 * chunkDoc — split a document into overlapping text chunks for embedding and
 * retrieval.
 *
 * Strategy: prefer splitting on sentence boundaries ('. ', '? ', '! ') or
 * paragraph breaks ('\n\n'), falling back to a hard sliding-window cut if no
 * suitable boundary is found within the window.
 *
 * Each returned chunk has:
 *   id         — "{docId}-{index}" (zero-based, unique within the document)
 *   documentId — passed through from the caller
 *   text       — the chunk text
 */

export interface Chunk {
  id: string
  documentId: string
  text: string
}

export interface ChunkOptions {
  /** Target chunk size in characters (default 600). */
  size?: number
  /** Overlap between adjacent chunks in characters (default 100). */
  overlap?: number
}

/**
 * Find the index of the last sentence-boundary break within `text[0..limit]`.
 * Looks for '. ', '? ', '! ', '\n\n'.
 * Returns -1 if none found.
 */
function lastBoundaryBefore(text: string, limit: number): number {
  const search = text.slice(0, limit)
  // Check paragraph break first (strongest)
  const para = search.lastIndexOf('\n\n')
  if (para >= 0) return para + 2

  // Sentence-ending punctuation followed by a space or newline
  for (let i = Math.min(limit - 1, search.length - 1); i >= 0; i--) {
    const ch = search[i]
    if ((ch === '.' || ch === '?' || ch === '!') && i + 1 < search.length) {
      const next = search[i + 1]
      if (next === ' ' || next === '\n') return i + 1
    }
  }

  return -1
}

export function chunkDoc(docId: string, text: string, opts: ChunkOptions = {}): Chunk[] {
  const size = opts.size ?? 600
  const overlap = opts.overlap ?? 100

  if (!text || text.length === 0) return []

  // If the text fits in a single chunk, return it directly.
  if (text.length <= size) {
    return [{ id: `${docId}-0`, documentId: docId, text }]
  }

  const chunks: Chunk[] = []
  let start = 0
  let idx = 0

  while (start < text.length) {
    const rawEnd = start + size

    if (rawEnd >= text.length) {
      // Last chunk — take the rest.
      chunks.push({ id: `${docId}-${idx}`, documentId: docId, text: text.slice(start) })
      break
    }

    // Try to find a sentence boundary to cut on (within the window).
    const windowText = text.slice(start, rawEnd)
    const boundary = lastBoundaryBefore(windowText, windowText.length)

    let end: number
    if (boundary > 0 && boundary > size / 4) {
      // Good boundary found — cut there.
      end = start + boundary
    } else {
      // No good boundary — hard cut at size.
      end = rawEnd
    }

    chunks.push({ id: `${docId}-${idx}`, documentId: docId, text: text.slice(start, end) })
    idx++

    // Advance start by (chunkSize - overlap) — ensuring forward progress.
    const advance = end - start - overlap
    start += Math.max(1, advance)
  }

  return chunks
}
