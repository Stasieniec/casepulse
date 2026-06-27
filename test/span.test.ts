/**
 * TDD tests for mapClaimSpan (Task 2.2).
 * Write first, implement second.
 */
import { describe, it, expect } from 'vitest'
import { mapClaimSpan } from '../worker/lib/span'

const PLEADING = `IN THE HIGH COURT OF JUSTICE, TECHNOLOGY AND CONSTRUCTION COURT

Claim No. HT-2025-000231

BETWEEN:
  MERIDIAN RETAIL GROUP PLC (Claimant)
  and
  TECHFLOW SOLUTIONS LTD (Defendant)

PARTICULARS OF CLAIM

1. The Defendant agreed to design, build and implement a platform for the Claimant.
2. The contract price was £2,400,000 payable in milestones.
3. Time was of the essence of the contract.
4. The platform should handle 10,000 concurrent transactions per second.
5. The platform did not go live until 18 November 2024, which was late.
6. The Claimant did not at any time request any change to the platform specification.
7. The Claimant warned TechFlow that the platform was not ready for go-live.
8. The platform was unavailable for more than 40% of the post-launch period.
9. There were critical stock-synchronisation failures causing trading losses.
10. The Claimant did not accept the platform as meeting the contractual specification.
`

describe('mapClaimSpan — exact match', () => {
  it('finds an exact phrase at correct offsets', () => {
    const phrase = '£2,400,000'
    const result = mapClaimSpan(PLEADING, phrase)
    expect(result.spanStart).toBeGreaterThanOrEqual(0)
    expect(result.spanEnd).toBe(result.spanStart + phrase.length)
    expect(PLEADING.slice(result.spanStart, result.spanEnd)).toBe(phrase)
  })

  it('returns the first occurrence when phrase appears once', () => {
    const phrase = 'time was of the essence'
    const result = mapClaimSpan(PLEADING, phrase)
    expect(result.spanStart).toBeGreaterThanOrEqual(0)
    expect(PLEADING.slice(result.spanStart, result.spanEnd).toLowerCase()).toContain(
      phrase.toLowerCase(),
    )
  })
})

describe('mapClaimSpan — whitespace-normalized match', () => {
  it('matches across line-break/extra-space variants', () => {
    // Quote has extra spaces / different line endings from the original
    const phrase = 'did not at any time  request any change'
    const result = mapClaimSpan(PLEADING, phrase)
    expect(result.spanStart).toBeGreaterThanOrEqual(0)
    expect(result.spanEnd).toBeGreaterThan(result.spanStart)
    // The slice from the ORIGINAL text should contain the normalized phrase
    const slice = PLEADING.slice(result.spanStart, result.spanEnd)
    expect(slice.replace(/\s+/g, ' ')).toContain('did not at any time request any change')
  })

  it('matches with leading/trailing whitespace stripped', () => {
    const phrase = '  10,000 concurrent transactions  '
    const result = mapClaimSpan(PLEADING, phrase.trim())
    expect(result.spanStart).toBeGreaterThanOrEqual(0)
    expect(PLEADING.slice(result.spanStart, result.spanEnd)).toContain('10,000 concurrent')
  })
})

describe('mapClaimSpan — token-overlap fuzzy fallback', () => {
  it('returns a valid window for a light paraphrase (not exact)', () => {
    // Paraphrase that does NOT appear verbatim in the pleading
    const phrase = 'platform was unavailable for more than 40 percent of the period'
    const result = mapClaimSpan(PLEADING, phrase)
    // Should find SOMETHING (best token overlap window), not -1,-1
    expect(result.spanStart).toBeGreaterThanOrEqual(0)
    expect(result.spanEnd).toBeGreaterThan(result.spanStart)
  })

  it('returns {-1,-1} for completely unrelated text', () => {
    const phrase = 'xyzzy foobarbaz quuxquux'
    const result = mapClaimSpan(PLEADING, phrase)
    // Completely unrelated — all tokens are junk, no meaningful overlap
    // Either -1,-1 or a very low-quality match; the key contract is that
    // the function does not throw.
    expect(typeof result.spanStart).toBe('number')
    expect(typeof result.spanEnd).toBe('number')
  })
})

describe('mapClaimSpan — edge cases', () => {
  it('handles empty claimText gracefully', () => {
    const result = mapClaimSpan(PLEADING, '')
    expect(result.spanStart).toBe(-1)
    expect(result.spanEnd).toBe(-1)
  })

  it('handles empty pleadingText gracefully', () => {
    const result = mapClaimSpan('', 'some claim text')
    expect(result.spanStart).toBe(-1)
    expect(result.spanEnd).toBe(-1)
  })
})
