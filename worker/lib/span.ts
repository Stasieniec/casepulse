/**
 * mapClaimSpan — map a claim's text snippet back to its character offsets in
 * the full pleading text.
 *
 * Strategy (in order):
 *  1. Exact indexOf — fastest, most reliable.
 *  2. Whitespace-normalized match — collapses all whitespace to single spaces
 *     and finds the match in the collapsed form, then maps back to original
 *     character offsets.
 *  3. Token-overlap sliding-window fallback — tokenize both the claim text and
 *     the pleading, slide a window of the same token-count across the pleading,
 *     and return the window with the highest Jaccard-like overlap.
 *
 * Returns { spanStart: -1, spanEnd: -1 } only if nothing meaningful is found.
 *
 * This deliberately reuses the same normalization logic as seed-transform.ts
 * (`normalizePleading`) to stay DRY. For per-file quote highlighting the
 * full `findQuoteRange` from src/lib/highlight.ts handles typographic variants
 * and ellipses — this module handles the simpler pleading use-case.
 */

export interface SpanResult {
  spanStart: number
  spanEnd: number
}

/**
 * Collapse all whitespace runs to a single space and trim.
 * Mirrors normalizePleading in seed-transform.ts.
 */
function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Build a collapsed view of a string plus a map from each collapsed-string
 * index to the corresponding index in the original string.
 */
function buildCollapsedMap(text: string): { collapsed: string; map: number[] } {
  const chars: string[] = []
  const map: number[] = []
  let prevSpace = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        chars.push(' ')
        map.push(i)
        prevSpace = true
      }
    } else {
      chars.push(ch)
      map.push(i)
      prevSpace = false
    }
  }
  return { collapsed: chars.join(''), map }
}

/**
 * Tokenize text into lowercase alphanumeric tokens for overlap scoring.
 */
function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9£€]+/g) ?? []
}

export function mapClaimSpan(pleadingText: string, claimText: string): SpanResult {
  const NOT_FOUND: SpanResult = { spanStart: -1, spanEnd: -1 }

  if (!claimText || !pleadingText) return NOT_FOUND

  const needle = claimText.trim()
  if (!needle) return NOT_FOUND

  // -------------------------------------------------------------------------
  // 1. Exact match
  // -------------------------------------------------------------------------
  const exact = pleadingText.indexOf(needle)
  if (exact >= 0) {
    return { spanStart: exact, spanEnd: exact + needle.length }
  }

  // -------------------------------------------------------------------------
  // 2. Whitespace-normalized match
  //    Build a collapsed view of the pleading, search for the collapsed needle
  //    in it, then map the first/last collapsed chars back to original offsets.
  // -------------------------------------------------------------------------
  const normNeedle = collapseWs(needle)
  const { collapsed, map } = buildCollapsedMap(pleadingText)

  const ci = collapsed.indexOf(normNeedle)
  if (ci >= 0) {
    const origStart = map[ci]
    // The end offset in the original should be just after the last matched char.
    // map[ci + normNeedle.length - 1] gives the original index of the last char;
    // we want the position AFTER it in the original string.
    const lastCollapsedIdx = ci + normNeedle.length - 1
    if (lastCollapsedIdx < map.length) {
      // Advance past any trailing whitespace in the original that corresponds to
      // the space in the collapsed string.
      let origEnd = map[lastCollapsedIdx] + 1
      return { spanStart: origStart, spanEnd: origEnd }
    }
    return { spanStart: origStart, spanEnd: origStart + normNeedle.length }
  }

  // -------------------------------------------------------------------------
  // 3. Token-overlap sliding-window fallback
  //    Tokenize both the claim and the pleading. Slide a window of
  //    claimTokenCount over the pleading tokens, compute overlap, pick the
  //    best window. Convert token positions back to character offsets.
  // -------------------------------------------------------------------------
  const claimTokens = tokenize(normNeedle)
  if (claimTokens.length === 0) return NOT_FOUND

  const claimSet = new Set(claimTokens)

  // Build a list of tokens with their original character positions.
  const tokRe = /[a-z0-9£€]+/gi
  type TokenEntry = { token: string; start: number; end: number }
  const tokenEntries: TokenEntry[] = []
  let m: RegExpExecArray | null
  while ((m = tokRe.exec(pleadingText)) !== null) {
    tokenEntries.push({ token: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length })
  }

  if (tokenEntries.length === 0) return NOT_FOUND

  const winSize = claimTokens.length
  let bestScore = 0
  let bestStart = -1
  let bestEnd = -1

  for (let i = 0; i <= tokenEntries.length - winSize; i++) {
    const window = tokenEntries.slice(i, i + winSize)
    const windowSet = new Set(window.map(t => t.token))
    // Jaccard: |intersection| / |union|
    let intersect = 0
    for (const tok of windowSet) {
      if (claimSet.has(tok)) intersect++
    }
    const union = claimSet.size + windowSet.size - intersect
    const score = union > 0 ? intersect / union : 0
    if (score > bestScore) {
      bestScore = score
      bestStart = window[0].start
      bestEnd = window[window.length - 1].end
    }
  }

  // Only accept fuzzy matches with meaningful overlap (> 30% Jaccard).
  if (bestScore > 0.3 && bestStart >= 0) {
    return { spanStart: bestStart, spanEnd: bestEnd }
  }

  return NOT_FOUND
}
