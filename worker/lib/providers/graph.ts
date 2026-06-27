/**
 * GraphProvider factory.
 *
 * Selects the right provider based on context:
 *  - analysisId provided → LiveGraphProvider (reads D1 for that analysis)
 *  - no analysisId       → MockGraphProvider (seed data, instant)
 *
 * Extension point (Task 3.2):
 *  - GRAPH_PROVIDER=neo4j in env → Neo4jGraphProvider via Aura HTTP Query API
 */
export type { GraphProvider } from '../../../shared/types'
import { MockGraphProvider } from './graph.mock'
import { LiveGraphProvider } from './graph.d1'
import type { Env } from '../../index'

export function getGraphProvider(
  env: Env | null,
  analysisId?: string | null,
): import('../../../shared/types').GraphProvider {
  if (analysisId && env?.DB) {
    return new LiveGraphProvider(env.DB, analysisId)
  }
  // TODO Task 3.2: if env?.GRAPH_PROVIDER === 'neo4j' && env?.NEO4J_QUERY_URL → Neo4jGraphProvider
  return new MockGraphProvider()
}
