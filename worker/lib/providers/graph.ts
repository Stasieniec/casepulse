/**
 * GraphProvider factory.
 *
 * Selects the right provider based on context:
 *  - analysisId provided → LiveGraphProvider (reads D1 for that analysis)
 *  - env.GRAPH_PROVIDER==='neo4j' and Neo4j creds present → Neo4jGraphProvider (Aura HTTP Query API)
 *  - otherwise → MockGraphProvider (seed data, instant; default for demo)
 */
export type { GraphProvider } from '../../../shared/types'
import { MockGraphProvider } from './graph.mock'
import { LiveGraphProvider } from './graph.d1'
import { Neo4jGraphProvider } from './graph.neo4j'
import type { Env } from '../../index'

export function getGraphProvider(
  env: Env | null,
  analysisId?: string | null,
): import('../../../shared/types').GraphProvider {
  if (analysisId && env?.DB) {
    return new LiveGraphProvider(env.DB, analysisId)
  }
  if (env?.GRAPH_PROVIDER === 'neo4j' && env?.NEO4J_QUERY_URL && env?.NEO4J_USER && env?.NEO4J_PASSWORD) {
    return new Neo4jGraphProvider(env)
  }
  return new MockGraphProvider()
}
