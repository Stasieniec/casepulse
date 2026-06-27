import { describe, it, expect } from 'vitest'
import { segment, type HighlightSpan } from '../src/lib/highlight'

describe('segment', () => {
  it('returns a single plain segment when there are no spans', () => {
    expect(segment('abcdefgh', [])).toEqual([
      { text: 'abcdefgh', claimId: null, status: null },
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(segment('', [])).toEqual([])
  })

  it('splits text into before / claim / after for a single span', () => {
    const spans: HighlightSpan[] = [
      { id: 'P1', spanStart: 2, spanEnd: 4, status: 'contradicted', riskScore: 90 },
    ]
    expect(segment('abcdefgh', spans)).toEqual([
      { text: 'ab', claimId: null, status: null },
      { text: 'cd', claimId: 'P1', status: 'contradicted' },
      { text: 'efgh', claimId: null, status: null },
    ])
  })

  it('emits a claim segment at the very start with no leading plain segment', () => {
    const spans: HighlightSpan[] = [
      { id: 'P1', spanStart: 0, spanEnd: 3, status: 'well_supported', riskScore: 10 },
    ]
    expect(segment('abcdef', spans)).toEqual([
      { text: 'abc', claimId: 'P1', status: 'well_supported' },
      { text: 'def', claimId: null, status: null },
    ])
  })

  it('emits a claim segment at the very end with no trailing plain segment', () => {
    const spans: HighlightSpan[] = [
      { id: 'P1', spanStart: 3, spanEnd: 6, status: 'gap', riskScore: 10 },
    ]
    expect(segment('abcdef', spans)).toEqual([
      { text: 'abc', claimId: null, status: null },
      { text: 'def', claimId: 'P1', status: 'gap' },
    ])
  })

  it('handles two adjacent (touching, non-overlapping) spans with no gap between', () => {
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 0, spanEnd: 2, status: 'well_supported', riskScore: 10 },
      { id: 'B', spanStart: 2, spanEnd: 4, status: 'contradicted', riskScore: 90 },
    ]
    expect(segment('abcdef', spans)).toEqual([
      { text: 'ab', claimId: 'A', status: 'well_supported' },
      { text: 'cd', claimId: 'B', status: 'contradicted' },
      { text: 'ef', claimId: null, status: null },
    ])
  })

  it('handles two separated spans with a plain gap between them', () => {
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 1, spanEnd: 3, status: 'well_supported', riskScore: 10 },
      { id: 'B', spanStart: 5, spanEnd: 7, status: 'contradicted', riskScore: 90 },
    ]
    expect(segment('abcdefgh', spans)).toEqual([
      { text: 'a', claimId: null, status: null },
      { text: 'bc', claimId: 'A', status: 'well_supported' },
      { text: 'de', claimId: null, status: null },
      { text: 'fg', claimId: 'B', status: 'contradicted' },
      { text: 'h', claimId: null, status: null },
    ])
  })

  it('resolves overlapping spans so the higher-risk claim wins the contested region', () => {
    // 'abcdef'  A:[0,3) risk 50 ; B:[2,5) risk 90  → B wins the overlap [2,3)
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 0, spanEnd: 3, status: 'gap', riskScore: 50 },
      { id: 'B', spanStart: 2, spanEnd: 5, status: 'contradicted', riskScore: 90 },
    ]
    const segs = segment('abcdef', spans)
    expect(segs).toEqual([
      { text: 'ab', claimId: 'A', status: 'gap' },
      { text: 'cde', claimId: 'B', status: 'contradicted' },
      { text: 'f', claimId: null, status: null },
    ])
  })

  it('lets a fully-enveloped higher-risk span carve out the middle of a lower-risk span', () => {
    // A:[0,6) risk 20 ; B:[2,4) risk 99 → A, B, A
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 0, spanEnd: 6, status: 'contested', riskScore: 20 },
      { id: 'B', spanStart: 2, spanEnd: 4, status: 'contradicted', riskScore: 99 },
    ]
    const segs = segment('abcdef', spans)
    expect(segs).toEqual([
      { text: 'ab', claimId: 'A', status: 'contested' },
      { text: 'cd', claimId: 'B', status: 'contradicted' },
      { text: 'ef', claimId: 'A', status: 'contested' },
    ])
  })

  it('covers the entire string (concatenated segment text === input)', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 4, spanEnd: 9, status: 'well_supported', riskScore: 10 },
      { id: 'B', spanStart: 7, spanEnd: 19, status: 'contradicted', riskScore: 80 },
      { id: 'C', spanStart: 30, spanEnd: 38, status: 'gap', riskScore: 40 },
    ]
    const segs = segment(text, spans)
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })

  it('is deterministic for equal-risk overlaps (resolves without crashing)', () => {
    const spans: HighlightSpan[] = [
      { id: 'A', spanStart: 0, spanEnd: 3, status: 'gap', riskScore: 50 },
      { id: 'B', spanStart: 2, spanEnd: 5, status: 'contradicted', riskScore: 50 },
    ]
    const segs = segment('abcdef', spans)
    // full coverage preserved, single claim owns the contested char
    expect(segs.map((s) => s.text).join('')).toBe('abcdef')
    const contested = segs.find((s) => s.text.includes('c'))!
    expect(contested.claimId).toBeTruthy()
  })

  it('ignores zero-width and out-of-range spans gracefully', () => {
    const spans: HighlightSpan[] = [
      { id: 'Z', spanStart: 3, spanEnd: 3, status: 'gap', riskScore: 50 }, // zero width
      { id: 'O', spanStart: 10, spanEnd: 20, status: 'gap', riskScore: 50 }, // out of range
    ]
    expect(segment('abcdef', spans)).toEqual([
      { text: 'abcdef', claimId: null, status: null },
    ])
  })
})
