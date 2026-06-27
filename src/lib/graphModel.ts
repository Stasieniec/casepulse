import type { CaseGraph, ClaimStatus, GdsOverlays, Relation } from '../../shared/types'
import { STATUS_HEX } from './status'

// ── Node / link shapes for the force sim ────────────────────────────────────
export type NodeKind = 'claim' | 'document' | 'extract'

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string // short label drawn on/near the node (P6 / D19)
  title: string // full title (claim headline / doc title) for tooltip
  status?: ClaimStatus // claims only
  relation?: Relation // extracts only
  confidence?: number // extracts only
  quote?: string // extracts only (truncated)
  claimId?: string // extracts only — for EvidenceViewer mapping
  documentId?: string // extracts only — for EvidenceViewer mapping
  val: number // size driver (centrality / PageRank)
  centrality: number // raw GDS centrality (for tooltip)
  community: number | null // Louvain cluster id
  isGap: boolean // flagged by GDS missingEvidence (no/weak support)
  // react-force-graph mutates these:
  x?: number
  y?: number
  fx?: number
  fy?: number
}

export type LinkRole = 'contains' | 'bears_on'
export interface GraphLink {
  source: string
  target: string
  relation: Relation
  confidence: number
  role: LinkRole
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/**
 * Louvain communities come straight from Neo4j GDS and there are ~12 of them in
 * the live Meridian graph. We map each cluster id to a cool/neutral hue so the
 * community channel never collides with the warm status / relation colors. The
 * mapping is deterministic (sorted cluster ids → fixed palette) so a given
 * cluster keeps its color across renders.
 */
const COMMUNITY_PALETTE = [
  '#7FA8C9', // steel blue
  '#B79BD8', // muted violet
  '#5FB6B0', // teal
  '#9AB07A', // sage
  '#C9A26B', // sand (dim, distinct from gold accent)
  '#8FA0C2', // periwinkle
  '#7CC0A6', // seafoam
  '#C18FB0', // dusty rose
  '#6FACC9', // sky
  '#A6A6B8', // slate-lilac
  '#88B89A', // jade
  '#B0A0C9', // lavender
]

let _communityIndex: Map<number, number> | null = null
let _communityKey = ''

/** Build (and cache) a stable cluster-id → palette-index map for a set of ids. */
function communityIndexFor(ids: number[]): Map<number, number> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',')
  if (_communityIndex && _communityKey === key) return _communityIndex
  const unique = [...new Set(ids)].sort((a, b) => a - b)
  const map = new Map<number, number>()
  unique.forEach((id, i) => map.set(id, i))
  _communityIndex = map
  _communityKey = key
  return map
}

export function communityColor(id: number | null, allIds?: number[]): string {
  if (id == null) return '#5B6675'
  const map = allIds ? communityIndexFor(allIds) : _communityIndex
  const idx = map?.get(id)
  if (idx == null) return '#5B6675'
  return COMMUNITY_PALETTE[idx % COMMUNITY_PALETTE.length]
}

export function relationFill(relation: Relation | undefined): string {
  if (relation === 'supports') return STATUS_HEX.well_supported
  if (relation === 'contradicts') return STATUS_HEX.contradicted
  return STATUS_HEX.unaddressed // neutral → slate
}

/** Pick the "dominant" relation for an aggregate doc→claim edge. */
export function dominantRelation(relations: Relation[]): Relation {
  let supports = 0
  let contradicts = 0
  for (const r of relations) {
    if (r === 'contradicts') contradicts++
    else if (r === 'supports') supports++
  }
  if (contradicts === 0 && supports === 0) return 'neutral'
  return contradicts >= supports ? 'contradicts' : 'supports'
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

/**
 * Build the EXPANDED 3-tier graph: Claim nodes, Document nodes, and one Extract
 * node per edge. Links are Document—contains→Extract (thin/neutral) and
 * Extract—bears_on→Claim (colored by relation).
 */
export function buildExpanded(
  graph: CaseGraph | undefined,
  gds: GdsOverlays | undefined,
): GraphData {
  if (!graph) return { nodes: [], links: [] }

  const centrality = gds?.centrality
  const communities = gds?.communities
  const gapSet = new Set(gds?.missingEvidence ?? [])
  const allCommunityIds = Object.values(communities ?? {})

  const cen = (id: string) => {
    const c = centrality?.[id]
    return c && c > 0 ? c : 0.4
  }
  const comm = (id: string) => communities?.[id] ?? null

  const docIds = new Set(graph.evidence.map((e) => e.id))
  const claimIds = new Set(graph.claims.map((c) => c.id))

  const nodes: GraphNode[] = [
    ...graph.claims.map(
      (c): GraphNode => ({
        id: c.id,
        kind: 'claim',
        label: c.label,
        title: c.headline,
        status: c.status,
        val: cen(c.id),
        centrality: cen(c.id),
        community: comm(c.id),
        isGap: gapSet.has(c.id),
      }),
    ),
    ...graph.evidence.map(
      (e): GraphNode => ({
        id: e.id,
        kind: 'document',
        label: e.id,
        title: e.title,
        val: cen(e.id),
        centrality: cen(e.id),
        community: comm(e.id),
        isGap: false,
      }),
    ),
    ...graph.edges
      .filter((e) => docIds.has(e.documentId) && claimIds.has(e.claimId))
      .map(
        (e): GraphNode => ({
          id: e.id,
          kind: 'extract',
          label: e.id,
          title: truncate(e.quote, 90),
          relation: e.relation,
          confidence: e.confidence,
          quote: e.quote,
          claimId: e.claimId,
          documentId: e.documentId,
          val: cen(e.id),
          centrality: cen(e.id),
          community: comm(e.id),
          isGap: false,
        }),
      ),
  ]

  const links: GraphLink[] = []
  for (const e of graph.edges) {
    if (!docIds.has(e.documentId) || !claimIds.has(e.claimId)) continue
    // Document contains this extract.
    links.push({
      source: e.documentId,
      target: e.id,
      relation: 'neutral',
      confidence: e.confidence,
      role: 'contains',
    })
    // Extract bears on the claim.
    links.push({
      source: e.id,
      target: e.claimId,
      relation: e.relation,
      confidence: e.confidence,
      role: 'bears_on',
    })
  }

  // Touch the palette cache so communityColor() resolves without passing ids.
  communityColor(0, allCommunityIds)

  return { nodes, links }
}

/**
 * Build the COLLAPSED 2-tier graph: Claim ↔ Document, with each document's
 * extracts aggregated into a single direct doc→claim edge colored by the
 * dominant relation. (The previous "wow but calm" view.)
 */
export function buildCollapsed(
  graph: CaseGraph | undefined,
  gds: GdsOverlays | undefined,
): GraphData {
  if (!graph) return { nodes: [], links: [] }

  const centrality = gds?.centrality
  const communities = gds?.communities
  const gapSet = new Set(gds?.missingEvidence ?? [])
  const allCommunityIds = Object.values(communities ?? {})

  const cen = (id: string) => {
    const c = centrality?.[id]
    return c && c > 0 ? c : 0.4
  }
  const comm = (id: string) => communities?.[id] ?? null

  const nodes: GraphNode[] = [
    ...graph.claims.map(
      (c): GraphNode => ({
        id: c.id,
        kind: 'claim',
        label: c.label,
        title: c.headline,
        status: c.status,
        val: cen(c.id),
        centrality: cen(c.id),
        community: comm(c.id),
        isGap: gapSet.has(c.id),
      }),
    ),
    ...graph.evidence.map(
      (e): GraphNode => ({
        id: e.id,
        kind: 'document',
        label: e.id,
        title: e.title,
        val: cen(e.id),
        centrality: cen(e.id),
        community: comm(e.id),
        isGap: false,
      }),
    ),
  ]

  const docIds = new Set(graph.evidence.map((e) => e.id))
  const claimIds = new Set(graph.claims.map((c) => c.id))

  // Aggregate edges by (documentId, claimId).
  const groups = new Map<
    string,
    { documentId: string; claimId: string; relations: Relation[]; maxConfidence: number }
  >()
  for (const e of graph.edges) {
    if (!docIds.has(e.documentId) || !claimIds.has(e.claimId)) continue
    const key = `${e.documentId}→${e.claimId}`
    const g = groups.get(key)
    if (g) {
      g.relations.push(e.relation)
      g.maxConfidence = Math.max(g.maxConfidence, e.confidence)
    } else {
      groups.set(key, {
        documentId: e.documentId,
        claimId: e.claimId,
        relations: [e.relation],
        maxConfidence: e.confidence,
      })
    }
  }

  const links: GraphLink[] = []
  for (const g of groups.values()) {
    const rel = dominantRelation(g.relations)
    if (rel === 'neutral') continue // hide pure-neutral aggregates for legibility
    links.push({
      source: g.documentId,
      target: g.claimId,
      relation: rel,
      confidence: g.maxConfidence,
      role: 'bears_on',
    })
  }

  communityColor(0, allCommunityIds)

  return { nodes, links }
}
