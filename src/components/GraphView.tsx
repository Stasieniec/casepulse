import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { CaseGraph, ClaimStatus, Relation } from '../../shared/types'
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
  val: number // size driver (centrality)
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
 * Force-directed claim–evidence graph. Claims are squares colored by
 * proof-status; evidence are parchment circles. Links are the supporting
 * (emerald) / contradicting (crimson) edges — the crimson edges visibly
 * cluster around the weakest claims (P6/P7/P8). Node size tracks graph
 * centrality. The canvas fills the panel and never causes page scroll.
 */
export function GraphView({ caseId }: { caseId: string }) {
  const { data: graph, isLoading, isError } = useGraph(caseId)
  const { data: gds } = useGds(caseId)

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

  const data = useMemo(() => buildGraphData(graph, gds?.centrality), [graph, gds])

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
        sub="Allegations linked to the exhibits that prove or break them. Crimson edges are contradictions; node size tracks centrality. Click a node to open its source."
        action={<Legend />}
      />

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
              nodeLabel={(n) => `<div style="font-family:Inter,sans-serif;font-size:12px;max-width:240px;color:#ECE7DA">
                <b>${n.label}</b> — ${escapeHtml(n.title)}</div>`}
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
      <EvidenceViewer caseId={caseId} target={evidence} onClose={() => setEvidence(null)} />
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
  // Radius from val (centrality), gently compressed so big nodes don't dominate.
  const r = (4 + Math.sqrt(node.val) * 2.6) * 1
  const color = node.kind === 'claim' && node.status ? statusColor(node.status) : PARCHMENT

  ctx.save()

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
  centrality: Record<string, number> | undefined,
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (!graph) return { nodes: [], links: [] }

  const val = (id: string) => {
    const c = centrality?.[id]
    return c && c > 0 ? c : 1
  }

  const nodes: GraphNode[] = [
    ...graph.claims.map(
      (c): GraphNode => ({
        id: c.id,
        kind: 'claim',
        label: c.label,
        title: c.headline,
        status: c.status,
        val: val(c.id),
      }),
    ),
    ...graph.evidence.map(
      (e): GraphNode => ({
        id: e.id,
        kind: 'evidence',
        label: e.id,
        title: e.title,
        val: val(e.id),
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

// ── Legend ──────────────────────────────────────────────────────────────────
const STATUS_LEGEND: ClaimStatus[] = ['contradicted', 'gap', 'contested', 'well_supported']

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-3">
        {STATUS_LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_HEX[s] }} />
            <span className="font-sans text-[11px] text-parchment-muted">{STATUS_LABEL[s]}</span>
          </span>
        ))}
      </div>
      <span className="h-3 w-px bg-ink-line" aria-hidden />
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: PARCHMENT, backgroundColor: EVIDENCE_FILL }} />
        <span className="font-sans text-[11px] text-parchment-muted">Evidence</span>
      </span>
      <span className="h-3 w-px bg-ink-line" aria-hidden />
      <span className="flex items-center gap-3">
        <EdgeKey relation="contradicts" label="Contradicts" />
        <EdgeKey relation="supports" label="Supports" />
      </span>
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
