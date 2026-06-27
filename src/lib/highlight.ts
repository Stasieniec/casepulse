import type { ClaimStatus } from '../../shared/types'

/**
 * A claim span to be highlighted within the pleading text. Offsets are
 * half-open [spanStart, spanEnd) into the SAME normalized string passed to
 * `segment`. `riskScore` breaks ties when spans overlap (higher wins).
 */
export interface HighlightSpan {
  id: string
  spanStart: number
  spanEnd: number
  status: ClaimStatus
  riskScore: number
}

/**
 * An ordered, non-overlapping slice of the pleading. Plain text has
 * `claimId === null`; a highlighted slice carries the winning claim's id +
 * status. Concatenating every segment's `text` reproduces the input exactly.
 */
export interface Segment {
  text: string
  claimId: string | null
  status: ClaimStatus | null
}

/**
 * Turn the full pleading text plus a set of (possibly overlapping) claim spans
 * into an ordered list of non-overlapping segments covering the whole string.
 *
 * Overlaps are resolved deterministically: at every character position the
 * span with the **higher riskScore** wins. Ties are broken by earlier start,
 * then by id, so the output is stable. Plain (un-highlighted) runs are emitted
 * as segments with `claimId: null`. Zero-width and out-of-range spans are
 * ignored.
 */
export function segment(text: string, spans: HighlightSpan[]): Segment[] {
  if (text.length === 0) return []

  const len = text.length

  // Keep only spans that intersect the string and have positive width, clamped
  // to the string's bounds.
  const valid = spans
    .map((s) => ({
      ...s,
      spanStart: Math.max(0, s.spanStart),
      spanEnd: Math.min(len, s.spanEnd),
    }))
    .filter((s) => s.spanEnd > s.spanStart)

  if (valid.length === 0) {
    return [{ text, claimId: null, status: null }]
  }

  // Owner of each character: the highest-priority span covering it (or null).
  // Priority: higher riskScore, then earlier start, then lexicographic id.
  const owner: (HighlightSpan | null)[] = new Array(len).fill(null)

  const beats = (a: HighlightSpan, b: HighlightSpan): boolean => {
    if (a.riskScore !== b.riskScore) return a.riskScore > b.riskScore
    if (a.spanStart !== b.spanStart) return a.spanStart < b.spanStart
    return a.id < b.id
  }

  for (const s of valid) {
    for (let i = s.spanStart; i < s.spanEnd; i++) {
      const cur = owner[i]
      if (cur === null || beats(s, cur)) owner[i] = s
    }
  }

  // Sweep the owner array, coalescing consecutive positions with the same owner
  // into one segment.
  const segments: Segment[] = []
  let runStart = 0
  let runOwner = owner[0]

  const push = (start: number, end: number, o: HighlightSpan | null) => {
    if (end <= start) return
    segments.push({
      text: text.slice(start, end),
      claimId: o ? o.id : null,
      status: o ? o.status : null,
    })
  }

  for (let i = 1; i < len; i++) {
    if (owner[i] !== runOwner) {
      push(runStart, i, runOwner)
      runStart = i
      runOwner = owner[i]
    }
  }
  push(runStart, len, runOwner)

  return segments
}

/**
 * Find the character range of `quote` inside `docText`, tolerant of differing
 * whitespace (newlines, runs of spaces). Returns `null` if not locatable.
 *
 * The cited verbatim quotes in the matrix are whitespace-collapsed, while the
 * source documents are line-wrapped — so an exact `indexOf` usually fails. We
 * first try the exact substring; failing that, we collapse whitespace on both
 * sides, locate the quote in the collapsed doc, then map that collapsed range
 * back to offsets in the original doc text.
 */
export function findQuoteRange(
  docText: string,
  quote: string,
): { start: number; end: number } | null {
  if (!quote) return null

  const exact = docText.indexOf(quote)
  if (exact >= 0) return { start: exact, end: exact + quote.length }

  // Build a whitespace-collapsed view of docText, remembering the original
  // index each collapsed character came from.
  const collapsed: string[] = []
  const map: number[] = [] // collapsed index -> original index
  let prevWasSpace = false
  for (let i = 0; i < docText.length; i++) {
    const ch = docText[i]
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        collapsed.push(' ')
        map.push(i)
        prevWasSpace = true
      }
    } else {
      collapsed.push(ch)
      map.push(i)
      prevWasSpace = false
    }
  }
  const collapsedDoc = collapsed.join('')
  const normQuote = quote.replace(/\s+/g, ' ').trim()
  if (!normQuote) return null

  const ci = collapsedDoc.indexOf(normQuote)
  if (ci < 0) return null

  const start = map[ci]
  // End maps from the last collapsed char of the match; +1 to make it half-open
  // against the original text.
  const lastCollapsed = ci + normQuote.length - 1
  const end = map[lastCollapsed] + 1
  return { start, end }
}
