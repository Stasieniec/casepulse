/**
 * Retriever factory.
 *
 * Re-exports the Retriever interface from shared types and exposes a factory
 * that selects the correct retriever based on environment.
 *
 * Currently:
 *  - InMemoryRetriever — always used for now (Vectorize is Task 2.4).
 */
export type { Retriever } from '../../../shared/types'
import type { LlmProvider } from '../../../shared/types'
import { InMemoryRetriever } from './retriever.memory'

export function getRetriever(
  _env: unknown,
  llm: LlmProvider,
): import('../../../shared/types').Retriever {
  // TODO Task 2.4: when env.VECTORIZE is bound, return VectorizeRetriever.
  return new InMemoryRetriever(llm)
}
