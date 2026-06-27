/**
 * TDD tests for chunkDoc + InMemoryRetriever (Task 2.3).
 * All tests use a fake/mock LlmProvider with deterministic embeddings —
 * fully offline, no API calls.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { chunkDoc } from '../worker/lib/chunk'
import { InMemoryRetriever } from '../worker/lib/providers/retriever.memory'
import type { LlmProvider } from '../shared/types'

// ---------------------------------------------------------------------------
// Fake LlmProvider — deterministic bag-of-words embeddings.
// Embed space is 8 dims. Each dimension represents a topic word:
//   0=contract 1=platform 2=payment 3=downtime 4=expert 5=loss 6=training 7=date
// ---------------------------------------------------------------------------
const VOCAB = ['contract', 'platform', 'payment', 'downtime', 'expert', 'loss', 'training', 'date']
const DIM = VOCAB.length

function bowEmbed(text: string): number[] {
  const lower = text.toLowerCase()
  const vec = new Array(DIM).fill(0)
  for (let i = 0; i < VOCAB.length; i++) {
    // Count how many times the word appears (simple freq).
    const re = new RegExp(`\\b${VOCAB[i]}\\b`, 'g')
    const matches = lower.match(re)
    vec[i] = matches ? matches.length : 0
  }
  // L2-normalize
  const norm = Math.sqrt(vec.reduce((s: number, x: number) => s + x * x, 0))
  if (norm === 0) {
    // All-zero vector — return a small uniform vector
    return new Array(DIM).fill(1 / Math.sqrt(DIM))
  }
  return vec.map(x => x / norm)
}

const fakeLlm: LlmProvider = {
  async extractClaims() {
    throw new Error('not implemented in test')
  },
  async judgeEdge() {
    throw new Error('not implemented in test')
  },
  async redTeam() {
    throw new Error('not implemented in test')
  },
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(bowEmbed)
  },
}

// ---------------------------------------------------------------------------
// chunkDoc tests
// ---------------------------------------------------------------------------
describe('chunkDoc', () => {
  it('returns at least one chunk for short text', () => {
    const chunks = chunkDoc('doc1', 'Short text.', {})
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0]).toHaveProperty('id')
    expect(chunks[0]).toHaveProperty('documentId', 'doc1')
    expect(chunks[0]).toHaveProperty('text')
  })

  it('produces multiple chunks for long text', () => {
    const text = 'The platform was unavailable. '.repeat(50)
    const chunks = chunkDoc('doc2', text, { size: 100, overlap: 20 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('each chunk id is unique within a document', () => {
    const text = 'Lorem ipsum dolor sit amet. '.repeat(40)
    const chunks = chunkDoc('doc3', text, { size: 80, overlap: 10 })
    const ids = chunks.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('chunks cover the full text (no silent drops)', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four.'
    const chunks = chunkDoc('doc4', text, { size: 30, overlap: 5 })
    // All tokens from text should appear in at least one chunk
    const allChunkText = chunks.map(c => c.text).join(' ')
    expect(allChunkText).toContain('Sentence one')
    expect(allChunkText).toContain('Sentence four')
  })
})

// ---------------------------------------------------------------------------
// InMemoryRetriever tests
// ---------------------------------------------------------------------------
describe('InMemoryRetriever', () => {
  let retriever: InMemoryRetriever

  beforeEach(() => {
    retriever = new InMemoryRetriever(fakeLlm)
  })

  it('topK returns the most relevant chunk first', async () => {
    const chunks = [
      { id: 'c1', documentId: 'D01', text: 'The contract sets out payment terms.' },
      { id: 'c2', documentId: 'D02', text: 'Expert report on platform downtime analysis.' },
      { id: 'c3', documentId: 'D03', text: 'Training session materials provided.' },
    ]
    await retriever.index('case1', chunks)

    // Query about downtime/expert should rank c2 first
    const results = await retriever.topK('case1', 'platform downtime expert analysis', 3)
    expect(results.length).toBe(3)
    expect(results[0].id).toBe('c2')
    expect(results[0].score).toBeGreaterThan(0)

    // Scores should be in descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('topK respects k limit', async () => {
    const chunks = [
      { id: 'c1', documentId: 'D01', text: 'Contract terms and payment schedule.' },
      { id: 'c2', documentId: 'D02', text: 'Platform availability and downtime records.' },
      { id: 'c3', documentId: 'D03', text: 'Training manual for users.' },
      { id: 'c4', documentId: 'D04', text: 'Loss of profit calculation and expert evidence.' },
    ]
    await retriever.index('case2', chunks)
    const results = await retriever.topK('case2', 'contract payment', 2)
    expect(results.length).toBe(2)
  })

  it('topK returns all results when k > chunk count', async () => {
    const chunks = [
      { id: 'c1', documentId: 'D01', text: 'Platform performance.' },
      { id: 'c2', documentId: 'D02', text: 'Training documentation.' },
    ]
    await retriever.index('case3', chunks)
    const results = await retriever.topK('case3', 'platform', 10)
    expect(results.length).toBe(2)
  })

  it('indexes and queries different caseIds independently', async () => {
    await retriever.index('caseA', [
      { id: 'a1', documentId: 'DA1', text: 'Contract terms payment.' },
    ])
    await retriever.index('caseB', [
      { id: 'b1', documentId: 'DB1', text: 'Expert report downtime.' },
    ])

    const resA = await retriever.topK('caseA', 'contract', 5)
    const resB = await retriever.topK('caseB', 'expert', 5)
    expect(resA[0].id).toBe('a1')
    expect(resB[0].id).toBe('b1')
  })

  it('result objects have required fields', async () => {
    const chunks = [{ id: 'x1', documentId: 'DX1', text: 'Some text about the platform.' }]
    await retriever.index('case5', chunks)
    const results = await retriever.topK('case5', 'platform', 1)
    expect(results[0]).toHaveProperty('id')
    expect(results[0]).toHaveProperty('documentId')
    expect(results[0]).toHaveProperty('text')
    expect(results[0]).toHaveProperty('score')
  })

  it('throws or returns empty for unknown caseId', async () => {
    const results = await retriever.topK('unknownCase', 'anything', 5)
    expect(results).toHaveLength(0)
  })
})
