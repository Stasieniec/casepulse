/**
 * Neo4jGraphProvider — reads case data from Neo4j Aura via the HTTP Query API v2.
 *
 * All read queries are the tested Cypher from scratchpad/neo4j/queries.cypher.
 * GDS overlays (PageRank centrality, Louvain communities, gap detector) are
 * materialized from seed/gds-results.json — algorithms ran in Aura Graph Analytics
 * (gds.pageRank, gds.louvain, gds.nodeSimilarity) and results are materialized
 * here to avoid spinning up a serverless GDS session at request time.
 *
 * Connection: POST to NEO4J_QUERY_URL with Basic auth. Creds always read from env —
 * NEVER hardcoded.
 */
import type {
  GraphProvider,
  CaseSummary,
  CaseGraph,
  Claim,
  ClaimDetail,
  Evidence,
  Edge,
  EvidenceLink,
  Stats,
  GdsOverlays,
  RedTeamItem,
  Pleading,
  DocumentText,
  ClaimStatus,
  Relation,
  AttackType,
} from '../../../shared/types'
import type { Env } from '../../index'
import { DOC_TEXTS } from '../docs-data'
import { titleOf, loadSeed } from '../seed-loader'
import gdsResultsJson from '../../../seed/gds-results.json'

// --------------------------------------------------------------------------
// HTTP Query API helper
// --------------------------------------------------------------------------

interface Neo4jResponse {
  data?: { fields: string[]; values: unknown[][] }
  errors?: { code: string; message: string }[]
}

async function cypher(env: Env, statement: string, parameters: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
  const url = env.NEO4J_QUERY_URL!
  const token = btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ statement, parameters }),
  })
  if (!res.ok) {
    throw new Error(`Neo4j HTTP error ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as Neo4jResponse
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Neo4j error: ${json.errors.map(e => e.message).join('; ')}`)
  }
  if (!json.data) return []
  const { fields, values } = json.data
  return values.map(row => {
    const obj: Record<string, unknown> = {}
    fields.forEach((f, i) => { obj[f] = row[i] })
    return obj
  })
}

// --------------------------------------------------------------------------
// Materialized GDS overlays (computed by real Neo4j GDS in Aura, baked at build)
// --------------------------------------------------------------------------

type GdsJson = {
  centralityMap: { id: string; score: number }[]
  communityMap: { id: string; clusterId: number }[]
  missingEvidenceIds: string[]
}

const gdsData = gdsResultsJson as unknown as GdsJson

const MATERIALIZED_GDS: GdsOverlays = (() => {
  const centrality: Record<string, number> = {}
  for (const entry of gdsData.centralityMap) centrality[entry.id] = entry.score

  const communities: Record<string, number> = {}
  for (const entry of gdsData.communityMap) communities[entry.id] = entry.clusterId

  return { centrality, communities, missingEvidence: gdsData.missingEvidenceIds }
})()

// --------------------------------------------------------------------------
// Neo4jGraphProvider
// --------------------------------------------------------------------------

export class Neo4jGraphProvider implements GraphProvider {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  async listCases(): Promise<CaseSummary[]> {
    const rows = await cypher(
      this.env,
      'MATCH (c:Case) RETURN c.id AS id, c.name AS name, c.claimNo AS claimNo',
    )
    return rows.map(r => ({
      id: r.id as string,
      name: (r.name as string) ?? r.id as string,
      parties: 'Meridian Retail Group PLC (Claimant) v TechFlow Solutions Ltd (Defendant)',
      court: 'High Court, TCC (KBD)',
      claimNo: (r.claimNo as string) ?? '',
    }))
  }

  async getCaseGraph(caseId: string): Promise<CaseGraph> {
    // Query (A): list all claims for the case
    const claimRows = await cypher(
      this.env,
      `MATCH (cl:Claim)-[:OF_CASE]->(:Case {id:$caseId})
       RETURN cl.id AS id, cl.label AS label, cl.status AS status,
              cl.riskScore AS riskScore, cl.headline AS headline, cl.text AS text
       ORDER BY cl.id`,
      { caseId },
    )

    const claims: Claim[] = claimRows.map(r => ({
      id: r.id as string,
      label: (r.label as string) ?? r.id as string,
      paragraphRef: (r.label as string) ?? r.id as string,
      text: (r.text as string) ?? (r.headline as string) ?? '',
      spanStart: 0,
      spanEnd: 0,
      status: (r.status as ClaimStatus) ?? 'unaddressed',
      riskScore: (r.riskScore as number) ?? 0,
      headline: (r.headline as string) ?? '',
    }))

    // Query (F): full edge export via two-hop path (extract-level model v2)
    // Reconstructs {id, claimId, documentId, relation, confidence, quote, rationale}
    // from (:Evidence)-[:CONTAINS]->(:Extract)-[:BEARS_ON]->(:Claim)
    const edgeRows = await cypher(
      this.env,
      `MATCH (e:Evidence)-[:CONTAINS]->(x:Extract)-[:BEARS_ON]->(cl:Claim)
       RETURN x.id AS id, e.id AS source, e.title AS sourceTitle, cl.id AS target,
              x.relation AS relation, x.confidence AS confidence,
              x.quote AS quote, x.rationale AS rationale`,
    )

    // Build evidence catalog from edge data
    const evidenceMap = new Map<string, Evidence>()
    const edges: Edge[] = edgeRows.map((r) => {
      const docId = r.source as string
      if (!evidenceMap.has(docId)) {
        evidenceMap.set(docId, {
          id: docId,
          title: (r.sourceTitle as string) ?? titleOf(docId),
          docType: 'document',
          party: 'bundle',
        })
      }
      const relationRaw = (r.relation as string).toLowerCase() as Relation
      return {
        id: r.id as string,
        claimId: r.target as string,
        documentId: docId,
        relation: relationRaw,
        confidence: (r.confidence as number) ?? 0,
        quote: (r.quote as string) ?? '',
        rationale: (r.rationale as string) ?? '',
      }
    })

    const evidence = Array.from(evidenceMap.values())
    return { claims, evidence, edges }
  }

  async getClaim(claimId: string): Promise<ClaimDetail> {
    // Query (A) for single claim
    const claimRows = await cypher(
      this.env,
      `MATCH (cl:Claim {id:$claimId})
       RETURN cl.id AS id, cl.label AS label, cl.status AS status,
              cl.riskScore AS riskScore, cl.headline AS headline, cl.text AS text`,
      { claimId },
    )
    if (claimRows.length === 0) throw new Error(`Claim ${claimId} not found`)
    const r = claimRows[0]

    // Query (B): evidence for this claim via two-hop path (extract-level model v2)
    const evidenceRows = await cypher(
      this.env,
      `MATCH (cl:Claim {id:$claimId})
       OPTIONAL MATCH (e:Evidence)-[:CONTAINS]->(x:Extract)-[:BEARS_ON]->(cl)
       RETURN x.relation AS relation, e.id AS evidenceId, e.title AS title,
              x.confidence AS confidence, x.quote AS quote, x.rationale AS rationale,
              x.id AS extractId`,
      { claimId },
    )

    const toEdge = (ev: Record<string, unknown>): Edge => ({
      id: ev.extractId as string,
      claimId,
      documentId: ev.evidenceId as string,
      relation: ((ev.relation as string) ?? 'neutral').toLowerCase() as Relation,
      confidence: (ev.confidence as number) ?? 0,
      quote: (ev.quote as string) ?? '',
      rationale: (ev.rationale as string) ?? '',
    })

    const validEdges = evidenceRows.filter(e => e.evidenceId != null)
    const supporting = validEdges.filter(e => (e.relation as string) === 'supports').map(toEdge)
    const contradicting = validEdges.filter(e => (e.relation as string) === 'contradicts').map(toEdge)
    const neutral = validEdges.filter(e => (e.relation as string) === 'neutral').map(toEdge)

    return {
      id: r.id as string,
      label: (r.label as string) ?? r.id as string,
      paragraphRef: (r.label as string) ?? r.id as string,
      text: (r.text as string) ?? (r.headline as string) ?? '',
      spanStart: 0,
      spanEnd: 0,
      status: (r.status as ClaimStatus) ?? 'unaddressed',
      riskScore: (r.riskScore as number) ?? 0,
      headline: (r.headline as string) ?? '',
      supporting,
      contradicting,
      neutral,
    }
  }

  async getEvidenceForClaim(claimId: string): Promise<EvidenceLink[]> {
    // Query (B): evidence links via two-hop path (extract-level model v2)
    const rows = await cypher(
      this.env,
      `MATCH (cl:Claim {id:$claimId})
       OPTIONAL MATCH (e:Evidence)-[:CONTAINS]->(x:Extract)-[:BEARS_ON]->(cl)
       RETURN x.relation AS relation, e.id AS evidenceId, e.title AS title,
              x.confidence AS confidence, x.quote AS quote, x.rationale AS rationale
       ORDER BY relation, confidence DESC`,
      { claimId },
    )
    return rows
      .filter(r => r.evidenceId != null)
      .map(r => ({
        documentId: r.evidenceId as string,
        title: (r.title as string) ?? titleOf(r.evidenceId as string),
        relation: ((r.relation as string) ?? 'neutral').toLowerCase() as Relation,
        confidence: (r.confidence as number) ?? 0,
        quote: (r.quote as string) ?? '',
        rationale: (r.rationale as string) ?? '',
      }))
  }

  async getStats(caseId: string): Promise<Stats> {
    // Query (C): status counts
    const countRows = await cypher(
      this.env,
      'MATCH (cl:Claim) RETURN cl.status AS status, count(*) AS n ORDER BY n DESC',
    )

    let wellSupported = 0, contested = 0, contradicted = 0, gaps = 0, unaddressed = 0
    for (const r of countRows) {
      const n = r.n as number
      switch (r.status as string) {
        case 'well_supported': wellSupported = n; break
        case 'contested': contested = n; break
        case 'contradicted': contradicted = n; break
        case 'gap': gaps = n; break
        case 'unaddressed': unaddressed = n; break
      }
    }

    const total = wellSupported + contested + contradicted + gaps + unaddressed
    const STATUS_WEIGHT: Record<string, number> = {
      well_supported: 100, contested: 50, gap: 30, unaddressed: 20, contradicted: 0,
    }
    const totalPoints =
      wellSupported * STATUS_WEIGHT.well_supported +
      contested * STATUS_WEIGHT.contested +
      contradicted * STATUS_WEIGHT.contradicted +
      gaps * STATUS_WEIGHT.gap +
      unaddressed * STATUS_WEIGHT.unaddressed
    const overallScore = total > 0 ? Math.round(totalPoints / total) : 0

    // Use the seed's richer pre-written verdict/vulnerabilities for case-level narrative
    const seed = loadSeed()
    return {
      wellSupported,
      contested,
      contradicted,
      gaps,
      unaddressed,
      overallScore,
      verdict: seed.stats.verdict,
      biggestVulnerabilities: seed.stats.biggestVulnerabilities,
    }
  }

  async getGdsOverlays(_caseId: string): Promise<GdsOverlays> {
    // GDS algorithms (gds.pageRank, gds.louvain, gds.nodeSimilarity) ran in Aura
    // Graph Analytics and results are materialized — no session needed at request time.
    return MATERIALIZED_GDS
  }

  async getRedTeam(_caseId: string): Promise<RedTeamItem[]> {
    // Query (E): all red-team items across all claims (via ATTACKED_BY edges)
    const rows = await cypher(
      this.env,
      `MATCH (cl:Claim)-[:ATTACKED_BY]->(rt:RedTeam)
       RETURN cl.id AS claimId, rt.id AS id, rt.attackType AS attackType,
              rt.attackText AS attackText, rt.killshotQuote AS killshotQuote,
              rt.fixSuggestion AS fixSuggestion`,
    )
    return rows.map(r => ({
      id: r.id as string,
      claimId: r.claimId as string,
      attackType: (r.attackType as AttackType) ?? 'cross_exam',
      attackText: (r.attackText as string) ?? '',
      killshotQuote: (r.killshotQuote as string) ?? '',
      fixSuggestion: (r.fixSuggestion as string) ?? '',
    }))
  }

  async getPleading(caseId: string): Promise<Pleading> {
    // Pleading text is not stored in Neo4j; serve from the bundled seed
    const seed = loadSeed()
    return {
      caseId,
      title: 'Particulars of Claim',
      fullText: seed.normalizedPleading,
    }
  }

  async getDocument(_caseId: string, docId: string): Promise<DocumentText> {
    // Documents are embedded in DOC_TEXTS (same as mock and D1 provider)
    const text = DOC_TEXTS[docId]
    if (text === undefined) throw new Error(`Document ${docId} not found`)
    return {
      docId,
      title: titleOf(docId),
      text,
    }
  }
}
