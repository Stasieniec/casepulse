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
 * Fold typographic variants to a canonical ASCII form so a quote captured with
 * straight quotes/hyphens still matches a source that uses curly quotes / en-
 * dashes (and vice-versa). Length is preserved (one char in → one char out) so
 * index maps stay aligned.
 */
function canon(ch: string): string {
  switch (ch) {
    case '‘': // ‘
    case '’': // ’
    case '‛':
    case 'ʼ':
      return "'"
    case '“': // “
    case '”': // ”
      return '"'
    case '–': // –
    case '—': // —
    case '−': // −
      return '-'
    case ' ': // nbsp
      return ' '
    default:
      return ch
  }
}

/**
 * Find the character range of `quote` inside `docText`, tolerant of differing
 * whitespace (newlines, runs of spaces), typographic quote/dash variants, and
 * elided quotes containing "..." / "…". Returns `null` if not locatable.
 *
 * The cited quotes in the matrix are whitespace-collapsed and occasionally
 * elide a middle section with an ellipsis, while the source documents are
 * line-wrapped with curly punctuation — so a naive `indexOf` usually fails. We
 * build a whitespace-collapsed, punctuation-canonicalised view of the doc
 * (remembering the original index of each kept char) and locate the canonical
 * quote in it. For ellipsised quotes we anchor on the lead phrase (the text
 * before the first ellipsis), which is the most reliable signal.
 */
export function findQuoteRange(
  docText: string,
  quote: string,
): { start: number; end: number } | null {
  if (!quote) return null

  // 1) Cheap exact hit on the raw text.
  const exact = docText.indexOf(quote)
  if (exact >= 0) return { start: exact, end: exact + quote.length }

  // 2) Collapsed + canonicalised view of the doc with an index map back to the
  //    original string.
  const collapsed: string[] = []
  const map: number[] = [] // collapsed index -> original index
  let prevWasSpace = false
  for (let i = 0; i < docText.length; i++) {
    const raw = docText[i]
    const ch = canon(raw)
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

  // Canonicalise the quote the same way.
  const normQuote = Array.from(quote, canon).join('').replace(/\s+/g, ' ').trim()
  if (!normQuote) return null

  // 3) Whole-quote match.
  const whole = collapsedDoc.indexOf(normQuote)
  if (whole >= 0) {
    return {
      start: map[whole],
      end: map[whole + normQuote.length - 1] + 1,
    }
  }

  // 4) Anchor on the lead phrase: the text before the first "..."/"…", or — for
  //    a quote that spans a paragraph boundary the doc interleaves (e.g. a "3."
  //    numbered heading the quote omits) — its first sentence. This highlights
  //    the meaningful start of the cited passage rather than nothing.
  const beforeEllipsis = normQuote.split(/\s*(?:\.{3,}|…)\s*/)[0].trim()
  const firstSentence = (beforeEllipsis.match(/^.*?[.;:](?=\s|$)/)?.[0] ?? beforeEllipsis).trim()
  for (const anchor of dedupe([beforeEllipsis, firstSentence])) {
    if (anchor.length < 8) continue
    const ai = collapsedDoc.indexOf(anchor)
    if (ai >= 0) {
      return {
        start: map[ai],
        end: map[ai + anchor.length - 1] + 1,
      }
    }
  }

  return null
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}
