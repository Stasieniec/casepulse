import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { CaseGraph, ClaimStatus, GdsOverlays, Relation } from '../../shared/types'
import { useGraph, useGds } from '../hooks/queries'
import { STATUS_HEX, STATUS_LABEL, statusColor, relationColor } from '../lib/status'
import { Panel } from './ui/Panel'
import { SectionHeader } from './ui/SectionHeader'
import { EvidenceViewer, type EvidenceTarget } from './EvidenceViewer'
import { cn } from '../lib/cn'

// ── Node / link shapes for the force sim ────────────────────────────────────
interface GraphNode {
  id: string
  kind: 'claim' | 'evidence'
  label: string // short label drawn on/near the node (P6 / D19)
  title: string // full title (claim headline / doc title) for tooltip
  status?: ClaimStatus
  val: number // size driver (centrality / PageRank)
  centrality: number // raw GDS centrality (for tooltip)
  community: number | null // Louvain cluster id
  isGap: boolean // flagged by GDS missingEvidence (no/weak support)
  // react-force-graph mutates these:
  x?: number
  y?: number
}
interface GraphLink {
  source: string
  target: string
  relation: Relation
  confidence: number
}

const PARCHMENT = '#C7CCD6'
const EVIDENCE_FILL = '#1B2230'

/**
 * Louvain community → ring color + human label. Communities are cool/neutral so
 * they read as a SECOND channel that never collides with the warm status colors
 * on the claim squares. The cluster ids come straight from Neo4j GDS (Louvain).
 */
const COMMUNITY_COLOR: Record<number, string> = {
  2: '#7FA8C9', // structural (contract / price / formation)
  6: '#B79BD8', // liability (scope, time, performance)
  20: '#5FB6B0', // quantum (loss, defects, expert)
}
const COMMUNITY_LABEL: Record<number, string> = {
  2: 'Structural',
  6: 'Liability',
  20: 'Quantum',
}
const COMMUNITY_FALLBACK = '#5B6675'
function communityColor(id: number | null): string {
  if (id == null) return COMMUNITY_FALLBACK
  return COMMUNITY_COLOR[id] ?? COMMUNITY_FALLBACK
}

/**
 * Force-directed claim–evidence graph. Claims are squares colored by
 * proof-status; evidence are parchment circles. Links are the supporting
 * (emerald) / contradicting (crimson) edges — the crimson edges visibly
 * cluster around the weakest claims (P6/P7/P8). Node size tracks graph
 * centrality. The canvas fills the panel and never causes page scroll.
 */
export function GraphView({ caseId, analysisId }: { caseId: string; analysisId?: string }) {
  const { data: graph, isLoading, isError } = useGraph(caseId, analysisId)
  const { data: gds } = useGds(caseId, analysisId)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [hovered, setHovered] = useState<GraphNode | null>(null)
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null)

  // Responsive sizing: the canvas fills its container; page never h-scrolls.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: Math.max(320, Math.floor(r.width)), h: Math.max(420, Math.floor(r.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => buildGraphData(graph, gds), [graph, gds])
  const insight = useMemo(() => buildInsight(graph, gds), [graph, gds])

  // Tune the forces once the graph is mounted for a calm, legible layout.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || data.nodes.length === 0) return
    const charge = fg.d3Force('charge') as unknown as { strength?: (n: number) => unknown } | undefined
    charge?.strength?.(-220)
    const link = fg.d3Force('link') as unknown as { distance?: (n: number) => unknown } | undefined
    link?.distance?.(70)
    // Center then settle.
    fg.d3ReheatSimulation?.()
  }, [data])

  function openEdgeFor(node: GraphNode) {
    if (!graph) return
    const edges = graph.edges.filter((e) =>
      node.kind === 'claim' ? e.claimId === node.id : e.documentId === node.id,
    )
    if (edges.length === 0) return
    const top = [...edges].sort((a, b) => {
      const ar = a.relation === 'contradicts' ? 1 : 0
      const br = b.relation === 'contradicts' ? 1 : 0
      if (ar !== br) return br - ar
      return b.confidence - a.confidence
    })[0]
    const claim = graph.claims.find((c) => c.id === top.claimId)
    setEvidence({
      docId: top.documentId,
      quote: top.quote,
      relation: top.relation,
      claimLabel: claim?.label,
      rationale: top.rationale,
    })
  }

  if (isError) return <Panel className="text-status-contradicted">Failed to load the graph.</Panel>

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Claim–evidence graph"
        title="The case, mapped"
        sub="Allegations linked to the exhibits that prove or break them. Crimson edges are contradictions; node size tracks PageRank centrality; rings group Louvain communities. Click a node to open its source."
        action={<NeoBadge />}
      />

      {insight && <InsightBar insight={insight} />}

      <Legend />

      <Panel flush className="relative overflow-hidden">
        <div ref={wrapRef} className="relative h-[clamp(440px,68vh,760px)] w-full">
          {isLoading || data.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-ink-line border-t-gold" />
            </div>
          ) : (
            <ForceGraph2D<GraphNode, GraphLink>
              ref={fgRef}
              graphData={data}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={120}
              nodeRelSize={5}
              nodeVal={(n) => n.val}
              nodeLabel={(n) => {
                const comm = n.community != null ? COMMUNITY_LABEL[n.community] ?? `Cluster ${n.community}` : '—'
                const gap = n.isGap ? `<div style="color:${STATUS_HEX.gap};margin-top:3px;font-weight:600">⚠ Flagged: no / weak support</div>` : ''
                return `<div style="font-family:Inter,sans-serif;font-size:12px;max-width:260px;color:#ECE7DA;background:#11151F;border:1px solid #1E2533;border-radius:4px;padding:8px 10px">
                  <b>${n.label}</b> — ${escapeHtml(n.title)}
                  <div style="color:#8A93A3;margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:10.5px">
                    centrality ${n.centrality.toFixed(2)} · ${comm}</div>${gap}</div>`
              }}
              linkColor={(l) => `${relationColor(l.relation)}99`}
              linkWidth={(l) => 0.8 + l.confidence * 2.2}
              linkDirectionalParticles={(l) => (l.relation === 'contradicts' ? 2 : 0)}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={(l) => relationColor(l.relation)}
              onNodeHover={(n) => {
                setHovered(n)
                if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'grab'
              }}
              onNodeClick={(n) => openEdgeFor(n)}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={(node, ctx, scale) =>
                drawNode(node, ctx, scale, hovered?.id === node.id)
              }
            />
          )}
        </div>
      </Panel>
      <EvidenceViewer caseId={caseId} analysisId={analysisId} target={evidence} onClose={() => setEvidence(null)} />
    </div>
  )
}

// ── Canvas node renderer ────────────────────────────────────────────────────
function drawNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  isHovered: boolean,
) {
  const x = node.x ?? 0
  const y = node.y ?? 0
  // Radius from centrality (PageRank), gently compressed so big nodes don't dominate.
  const r = 4 + Math.sqrt(node.val) * 3.4
  const color = node.kind === 'claim' && node.status ? statusColor(node.status) : PARCHMENT
  const comm = communityColor(node.community)

  ctx.save()

  // GDS community ring: a colored halo around every node, keyed to its Louvain
  // cluster — the second analytic channel beneath the status fill.
  if (node.community != null) {
    ctx.beginPath()
    ctx.arc(x, y, r + 3.5, 0, 2 * Math.PI)
    ctx.lineWidth = 2 / globalScale
    ctx.strokeStyle = `${comm}cc`
    ctx.stroke()
  }

  if (isHovered) {
    ctx.shadowColor = color
    ctx.shadowBlur = 16
  }

  if (node.kind === 'claim') {
    // Rounded square for claims, filled with status color.
    const s = r * 1.7
    roundRect(ctx, x - s / 2, y - s / 2, s, s, 3)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 1.2 / globalScale
    ctx.strokeStyle = '#0B0E14'
    ctx.stroke()
  } else {
    // Circle for evidence, dark fill with a parchment ring.
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = EVIDENCE_FILL
    ctx.fill()
    ctx.lineWidth = 1.5 / globalScale
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // GDS missing-evidence marker: a small burnt-orange warning pip on claims the
  // graph flags as having no / weak support — the structural evidence gaps.
  if (node.isGap) {
    const gx = x + r * 0.95
    const gy = y - r * 0.95
    const gr = Math.max(2.4, 4 / globalScale)
    ctx.beginPath()
    ctx.arc(gx, gy, gr, 0, 2 * Math.PI)
    ctx.fillStyle = STATUS_HEX.gap
    ctx.fill()
    ctx.lineWidth = 1 / globalScale
    ctx.strokeStyle = '#0B0E14'
    ctx.stroke()
    // a tiny "!" for legibility when zoomed in
    if (globalScale > 1.3) {
      ctx.fillStyle = '#0B0E14'
      ctx.font = `700 ${gr * 1.6}px 'IBM Plex Mono', monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('!', gx, gy + 0.3)
    }
  }

  // Labels: always for claims; for evidence only when zoomed in enough or hovered.
  const showLabel = node.kind === 'claim' || isHovered || globalScale > 1.6
  if (showLabel) {
    const fontSize = Math.max(9, 11 / globalScale)
    ctx.font = `${node.kind === 'claim' ? '600 ' : ''}${fontSize}px 'IBM Plex Mono', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (node.kind === 'claim') {
      // Label inside the square, ink-on-color for contrast.
      ctx.fillStyle = '#0B0E14'
      ctx.fillText(node.label, x, y)
    } else {
      // Label below the circle.
      const ly = y + r + fontSize
      ctx.fillStyle = PARCHMENT
      ctx.fillText(node.label, x, ly)
    }
  }

  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const rr = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ── Data shaping ────────────────────────────────────────────────────────────
function buildGraphData(
  graph: CaseGraph | undefined,
  gds: GdsOverlays | undefined,
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (!graph) return { nodes: [], links: [] }

  const centrality = gds?.centrality
  const communities = gds?.communities
  const gapSet = new Set(gds?.missingEvidence ?? [])

  const raw = (id: string) => {
    const c = centrality?.[id]
    return c && c > 0 ? c : 0.4
  }

  const nodes: GraphNode[] = [
    ...graph.claims.map(
      (c): GraphNode => ({
        id: c.id,
        kind: 'claim',
        label: c.label,
        title: c.headline,
        status: c.status,
        val: raw(c.id),
        centrality: raw(c.id),
        community: communities?.[c.id] ?? null,
        isGap: gapSet.has(c.id),
      }),
    ),
    ...graph.evidence.map(
      (e): GraphNode => ({
        id: e.id,
        kind: 'evidence',
        label: e.id,
        title: e.title,
        val: raw(e.id),
        centrality: raw(e.id),
        community: communities?.[e.id] ?? null,
        isGap: false,
      }),
    ),
  ]

  const nodeIds = new Set(nodes.map((n) => n.id))
  const links: GraphLink[] = graph.edges
    .filter((e) => e.relation !== 'neutral')
    .filter((e) => nodeIds.has(e.claimId) && nodeIds.has(e.documentId))
    .map((e) => ({
      source: e.claimId,
      target: e.documentId,
      relation: e.relation,
      confidence: e.confidence,
    }))

  return { nodes, links }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Neo4j Aura credit badge ──────────────────────────────────────────────────
function NeoBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-panel/70 px-3 py-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: 'radial-gradient(circle at 30% 30%, #4fd1c5, #0e7490)' }}
        aria-hidden
      />
      <span className="font-sans text-[11px] font-medium text-parchment-body">
        Graph + Graph Data Science computed in{' '}
        <span className="text-parchment">Neo4j Aura</span>
      </span>
      <span className="font-mono text-[9.5px] text-parchment-muted/70">PageRank · Louvain · node-similarity</span>
    </span>
  )
}

// ── One-line GDS insight ─────────────────────────────────────────────────────
interface Insight {
  pivotalLabel: string
  pivotalTitle: string
  communityCount: number
  communityNames: string[]
  gapCount: number
}

function buildInsight(graph: CaseGraph | undefined, gds: GdsOverlays | undefined): Insight | null {
  if (!graph || !gds) return null
  // Most pivotal node by centrality.
  let pivotalId = ''
  let max = -Infinity
  for (const [id, score] of Object.entries(gds.centrality ?? {})) {
    if (score > max) {
      max = score
      pivotalId = id
    }
  }
  const claim = graph.claims.find((c) => c.id === pivotalId)
  const ev = graph.evidence.find((e) => e.id === pivotalId)
  const pivotalTitle = claim?.headline ?? ev?.title ?? ''

  const clusters = new Set(Object.values(gds.communities ?? {}))
  const communityNames = [...clusters]
    .map((id) => COMMUNITY_LABEL[id])
    .filter(Boolean) as string[]

  return {
    pivotalLabel: pivotalId,
    pivotalTitle,
    communityCount: clusters.size,
    communityNames,
    gapCount: (gds.missingEvidence ?? []).length,
  }
}

function InsightBar({ insight }: { insight: Insight }) {
  return (
    <Panel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <InsightStat
        label="Most pivotal"
        value={insight.pivotalLabel}
        sub={truncate(insight.pivotalTitle, 64)}
      />
      <span className="hidden h-7 w-px bg-ink-line sm:block" aria-hidden />
      <InsightStat
        label="Communities"
        value={String(insight.communityCount)}
        sub={insight.communityNames.join(' · ') || 'Louvain clusters'}
      />
      <span className="hidden h-7 w-px bg-ink-line sm:block" aria-hidden />
      <InsightStat
        label="Evidence gaps"
        value={String(insight.gapCount)}
        sub="claims with no / weak support"
        valueColor={STATUS_HEX.gap}
      />
    </Panel>
  )
}

function InsightStat({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  return (
    <div className="min-w-0">
      <div className="eyebrow text-[10px]">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span
          className="font-serif text-[1.15rem] font-semibold leading-none tabular-nums"
          style={{ color: valueColor ?? '#ECE7DA' }}
        >
          {value}
        </span>
        <span className="truncate font-sans text-[11.5px] text-parchment-muted">{sub}</span>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

// ── Legend ──────────────────────────────────────────────────────────────────
const STATUS_LEGEND: ClaimStatus[] = ['contradicted', 'gap', 'contested', 'well_supported']
const COMMUNITY_LEGEND: number[] = [2, 6, 20]

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-panel border border-ink-line bg-ink-panel/50 px-4 py-2.5">
      {/* Status (claim fill) */}
      <LegendGroup title="Claim status">
        {STATUS_LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_HEX[s] }} />
            <span className="font-sans text-[11px] text-parchment-muted">{STATUS_LABEL[s]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: PARCHMENT, backgroundColor: EVIDENCE_FILL }} />
          <span className="font-sans text-[11px] text-parchment-muted">Evidence</span>
        </span>
      </LegendGroup>

      <span className="hidden h-6 w-px bg-ink-line lg:block" aria-hidden />

      {/* GDS overlays */}
      <LegendGroup title="Neo4j GDS overlays">
        <span className="flex items-center gap-1.5" title="Node size ∝ PageRank centrality">
          <span className="flex items-end gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-parchment-muted" />
            <span className="h-2.5 w-2.5 rounded-full bg-parchment-muted" />
          </span>
          <span className="font-sans text-[11px] text-parchment-muted">Size = centrality</span>
        </span>
        {COMMUNITY_LEGEND.map((id) => (
          <span key={id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full border-2 bg-transparent"
              style={{ borderColor: communityColor(id) }}
            />
            <span className="font-sans text-[11px] text-parchment-muted">{COMMUNITY_LABEL[id]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5" title="GDS: no / weak support">
          <span className="flex h-3 w-3 items-center justify-center rounded-full" style={{ backgroundColor: STATUS_HEX.gap }}>
            <span className="font-mono text-[8px] font-bold leading-none text-ink">!</span>
          </span>
          <span className="font-sans text-[11px] text-parchment-muted">Evidence gap</span>
        </span>
      </LegendGroup>

      <span className="hidden h-6 w-px bg-ink-line lg:block" aria-hidden />

      <LegendGroup title="Edges">
        <EdgeKey relation="contradicts" label="Contradicts" />
        <EdgeKey relation="supports" label="Supports" />
      </LegendGroup>
    </div>
  )
}

function LegendGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[9.5px] uppercase tracking-wide text-parchment-muted/60">{title}</span>
      {children}
    </div>
  )
}

function EdgeKey({ relation, label }: { relation: Relation; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[2px] w-5 rounded-full" style={{ backgroundColor: relationColor(relation) }} />
      <span className={cn('font-sans text-[11px] text-parchment-muted')}>{label}</span>
    </span>
  )
}
