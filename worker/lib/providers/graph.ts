// Re-export the GraphProvider interface from shared types.
// The factory returns MockGraphProvider now; D1/Neo4j branches are extension points.
export type { GraphProvider } from '../../../shared/types'
import { MockGraphProvider } from './graph.mock'

export function getGraphProvider(_env: unknown): import('../../../shared/types').GraphProvider {
  // Extension point: add D1 / Neo4j branches here based on env.GRAPH_PROVIDER
  return new MockGraphProvider()
}
