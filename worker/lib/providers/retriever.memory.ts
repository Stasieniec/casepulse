/**
 * InMemoryRetriever — implements Retriever using in-memory cosine similarity.
 *
 * Embeddings are computed via the injected LlmProvider.embed, which allows
 * the tests to inject a fake/deterministic embed function without hitting
 * any external API.
 *
 * Index is keyed by caseId so multiple cases can coexist in the same instance.
 */
import type { LlmProvider, Retriever } from '../../../shared/types'

interface IndexedChunk {
  id: string
  documentId: string
  text: string
  vector: number[]
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export class InMemoryRetriever implements Retriever {
  private llm: LlmProvider
  /** caseId -> array of indexed chunks with their embedding vectors */
  private store: Map<string, IndexedChunk[]> = new Map()

  constructor(llm: LlmProvider) {
    this.llm = llm
  }

  async index(caseId: string, chunks: { id: string; documentId: string; text: string }[]): Promise<void> {
    if (chunks.length === 0) {
      this.store.set(caseId, [])
      return
    }

    const texts = chunks.map(c => c.text)
    const vectors = await this.llm.embed(texts)

    const indexed: IndexedChunk[] = chunks.map((c, i) => ({
      id: c.id,
      documentId: c.documentId,
      text: c.text,
      vector: vectors[i],
    }))

    this.store.set(caseId, indexed)
  }

  async topK(
    caseId: string,
    queryText: string,
    k: number,
  ): Promise<{ id: string; documentId: string; text: string; score: number }[]> {
    const indexed = this.store.get(caseId)
    if (!indexed || indexed.length === 0) return []

    const queryVecs = await this.llm.embed([queryText])
    const queryVec = queryVecs[0]

    const scored = indexed.map(chunk => ({
      id: chunk.id,
      documentId: chunk.documentId,
      text: chunk.text,
      score: cosineSimilarity(queryVec, chunk.vector),
    }))

    // Sort descending by score, take top-k.
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k)
  }
}
