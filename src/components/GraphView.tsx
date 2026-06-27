import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { CaseGraph, ClaimStatus, GdsOverlays, Relation } from '../../shared/types'
import { useGraph, useGds } from '../hooks/queries'
import { prefersReducedMotion } from '../hooks/useCountUp'
import { STATUS_HEX, STATUS_LABEL, statusColor } from '../lib/status'
import {
  buildExpanded,
  buildCollapsed,
  communityColor,
  relationFill,
  truncate,
  type GraphData,
  type GraphNode,
  type GraphLink,
} from '../lib/graphModel'
import { Panel } from './ui/Panel'
import { SectionHeader } from './ui/SectionHeader'
import { EvidenceViewer, type EvidenceTarget } from './EvidenceViewer'
import { cn } from '../lib/cn'

const PARCHMENT = '#C7CCD6'
const DOC_FILL = '#1B2230'
const NEUTRAL_EXTRACT = STATUS_HEX.unaddressed

const RELATION_LABEL: Record<Relation, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  neutral: 'Neutral',
}

/**
 * Force-directed EXTRACT-LEVEL graph. Three tiers:
 *  • Claim squares — colored by proof-status (prominent, labeled).
 *  • Document circles — parchment (prominent, labeled).
 *  • Extract dots — one per finding, colored green/crimson/slate by relation;
 *    small + visually subordinate, labeled only on hover.
 * Links: Document—contains→Extract (faint) and Extract—bears_on→Claim (colored).
 * Collapsing folds each document's extracts into one direct doc→claim edge.
 * Node size tracks Neo4j GDS PageRank; rings group Louvain communities.
 */
export function GraphView({ caseId, analysisId }: { caseId: string; analysisId?: string }) {
  const { data: graph, isLoading, isError } = useGraph(caseId, analysisId)
  const { data: gds } = useGds(caseId, analysisId)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [hovered, setHovered] = useState<GraphNode | null>(null)
  const [expanded, setExpanded] = useState(true) // default: dense extract view
  const [focusDoc, setFocusDoc] = useState<string | null>(null) // doc whose extracts are isolated
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null)

  const reduced = prefersReducedMotion()

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

  const expandedData = useMemo(() => buildExpanded(graph, gds), [graph, gds])
  const collapsedData = useMemo(() => buildCollapsed(graph, gds), [graph, gds])
  const data = expanded ? expandedData : collapsedData
  const insight = useMemo(() => buildInsight(graph, gds), [graph, gds])

  // Adjacency for hover/focus highlighting (computed per active dataset).
  const adjacency = useMemo(() => buildAdjacency(data), [data])

  // Tune the forces for a legible layout at ~130 nodes. The key move that
  // avoids a hairball: extracts are tight SATELLITES of their document (very
  // short, stiff `contains` links + near-zero repulsion), so each exhibit wears
  // a small corona of its findings. The `bears_on` link to the claim pulls only
  // weakly — it mainly draws the colored spoke and nudges the document toward
  // the allegations it speaks to. Documents repel each other hard so the coronas
  // fan out around the cluster instead of overlapping.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || data.nodes.length === 0) return

    const charge = fg.d3Force('charge') as
      | {
          strength?: (fn: (n: GraphNode) => number) => unknown
          distanceMax?: (n: number) => unknown
        }
      | undefined
    charge?.strength?.((n) => {
      if (n.kind === 'claim') return expanded ? -520 : -360
      if (n.kind === 'document') return expanded ? -460 : -300
      return -26 // extracts: light mutual repulsion so the dot field breathes
    })
    charge?.distanceMax?.(460) // cap repulsion range so distant nodes don't tear out

    const link = fg.d3Force('link') as
      | {
          distance?: (fn: (l: GraphLink) => number) => unknown
          strength?: (fn: (l: GraphLink) => number) => unknown
        }
      | undefined
    // In expanded mode each extract floats BETWEEN its document and its claim,
    // so the dots themselves form colored rivers of findings (the lines are kept
    // faint — the field of dots is the visual). Balanced pull on both ends.
    link?.distance?.((l) => {
      if (l.role === 'contains') return expanded ? 34 : 13
      return expanded ? 46 : 78 // bears_on
    })
    link?.strength?.((l) => {
      if (l.role === 'contains') return expanded ? 0.5 : 1.5
      return expanded ? 0.5 : 0.22 // bears_on
    })

    // (No explicit collide force: d3-force is bundled inside force-graph and not
    // separately importable. Separation comes from the per-tier charge above +
    // the stiff, short `contains` links that bind each corona to its document.)

    fg.d3ReheatSimulation?.()
  }, [data, expanded, reduced])

  // When focusing a document, pin nothing but center on it.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !focusDoc) return
    const node = data.nodes.find((n) => n.id === focusDoc)
    if (node && node.x != null && node.y != null) {
      fg.centerAt?.(node.x, node.y, reduced ? 0 : 600)
      fg.zoom?.(2.2, reduced ? 0 : 600)
    }
  }, [focusDoc, data, reduced])

  function openExtract(node: GraphNode) {
    if (!graph || node.kind !== 'extract') return
    const claim = graph.claims.find((c) => c.id === node.claimId)
    setEvidence({
      docId: node.documentId ?? '',
      quote: node.quote ?? '',
      relation: node.relation ?? 'neutral',
      claimLabel: claim?.label,
      rationale: undefined,
    })
  }

  /** Collapsed-mode / document-mode click: open the dominant finding for a doc→claim pair. */
  function openAggregate(node: GraphNode) {
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

  function handleNodeClick(node: GraphNode) {
    if (node.kind === 'extract') {
      openExtract(node)
      return
    }
    if (node.kind === 'document') {
      // First click on a document focuses/isolates its extracts; second opens it.
      if (expanded) {
        setFocusDoc((cur) => (cur === node.id ? null : node.id))
        return
      }
      openAggregate(node)
      return
    }
    // Claim → its detail (the dominant finding against it).
    openAggregate(node)
  }

  if (isError) return <Panel className="text-status-contradicted">Failed to load the graph.</Panel>

  const nodeCount = data.nodes.length
  const extractCount = expandedData.nodes.filter((n) => n.kind === 'extract').length

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Claim · document · extract graph"
        title="The case, mapped"
        sub="Every finding is its own node: documents contain extracts, and each extract bears on an allegation — crimson where it contradicts, emerald where it supports. Node size tracks PageRank; rings group Louvain communities."
        action={<NeoBadge />}
      />

      {insight && <InsightBar insight={insight} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend expanded={expanded} />
        <DensityToggle
          expanded={expanded}
          extractCount={extractCount}
          onToggle={() => {
            setExpanded((v) => !v)
            setFocusDoc(null)
          }}
        />
      </div>

      <Panel flush className="relative overflow-hidden">
        {expanded && focusDoc && (
          <button
            onClick={() => {
              setFocusDoc(null)
              fgRef.current?.zoomToFit?.(reduced ? 0 : 500, 60)
            }}
            className="absolute left-3 top-3 z-10 rounded-[4px] border border-ink-line bg-ink-panel/90 px-2.5 py-1 font-mono text-[10.5px] text-parchment-muted backdrop-blur-sm transition-colors hover:border-gold-dim hover:text-parchment"
          >
            ← Clear focus · {focusDoc}
          </button>
        )}
        <div ref={wrapRef} className="relative h-[clamp(440px,68vh,780px)] w-full">
          {isLoading || nodeCount === 0 ? (
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
              cooldownTicks={reduced ? 0 : 140}
              warmupTicks={reduced ? 80 : 0}
              onEngineStop={() => {
                if (!focusDoc) fgRef.current?.zoomToFit?.(reduced ? 0 : 500, 56)
              }}
              nodeRelSize={4}
              nodeVal={(n) => n.val}
              nodeLabel={(n) => nodeTooltip(n)}
              linkColor={(l) => linkColor(l, hovered, adjacency, focusDoc)}
              linkWidth={(l) => linkWidth(l, hovered, adjacency)}
              linkDirectionalParticles={(l) =>
                !reduced && l.role === 'bears_on' && l.relation === 'contradicts' ? 2 : 0
              }
              linkDirectionalParticleWidth={1.8}
              linkDirectionalParticleColor={(l) => relationFill(l.relation)}
              onNodeHover={(n) => {
                setHovered(n)
                if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'grab'
              }}
              onNodeClick={handleNodeClick}
              onBackgroundClick={() => setFocusDoc(null)}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={(node, ctx, scale) =>
                drawNode(node, ctx, scale, {
                  isHovered: hovered?.id === node.id,
                  dimmed: isDimmed(node, hovered, adjacency, focusDoc),
                })
              }
            />
          )}
        </div>
      </Panel>
      <EvidenceViewer caseId={caseId} analysisId={analysisId} target={evidence} onClose={() => setEvidence(null)} />
    </div>
  )
}

// ── Highlight / focus helpers ────────────────────────────────────────────────
type Adjacency = Map<string, Set<string>>

function buildAdjacency(data: GraphData): Adjacency {
  const adj: Adjacency = new Map()
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a)!.add(b)
  }
  for (const l of data.links) {
    const s = typeof l.source === 'object' ? (l.source as GraphNode).id : (l.source as string)
    const t = typeof l.target === 'object' ? (l.target as GraphNode).id : (l.target as string)
    add(s, t)
    add(t, s)
  }
  return adj
}

function linkEndIds(l: GraphLink): [string, string] {
  const s = typeof l.source === 'object' ? (l.source as GraphNode).id : (l.source as string)
  const t = typeof l.target === 'object' ? (l.target as GraphNode).id : (l.target as string)
  return [s, t]
}

function isDimmed(
  node: GraphNode,
  hovered: GraphNode | null,
  adj: Adjacency,
  focusDoc: string | null,
): boolean {
  if (focusDoc) {
    // In focus mode keep the focused doc, its extracts, and their claims bright.
    if (node.id === focusDoc) return false
    const neighbors = adj.get(focusDoc)
    if (node.kind === 'extract') return !(neighbors?.has(node.id) ?? false)
    if (node.kind === 'claim') {
      // Bright if any extract of the focused doc bears on this claim.
      const docExtracts = neighbors ?? new Set<string>()
      for (const ex of docExtracts) {
        if (adj.get(ex)?.has(node.id)) return false
      }
      return true
    }
    return node.id !== focusDoc
  }
  if (!hovered) return false
  if (node.id === hovered.id) return false
  return !(adj.get(hovered.id)?.has(node.id) ?? false)
}

function linkColor(
  l: GraphLink,
  hovered: GraphNode | null,
  adj: Adjacency,
  focusDoc: string | null,
): string {
  const [s, t] = linkEndIds(l)
  const base = l.role === 'contains' ? '#2A3344' : relationFill(l.relation)
  // Faint at rest so the colored extract DOTS carry the signal, not the lines;
  // they snap to full strength on hover / focus.
  const baseAlpha = l.role === 'contains' ? '3a' : '5e'

  if (focusDoc) {
    const inFocus =
      s === focusDoc || t === focusDoc || (adj.get(focusDoc)?.has(s) ?? false) || (adj.get(focusDoc)?.has(t) ?? false)
    return inFocus ? `${base}e6` : `${base}14`
  }
  if (hovered) {
    const touches = s === hovered.id || t === hovered.id
    return touches ? `${base}f2` : `${base}12`
  }
  return `${base}${baseAlpha}`
}

function linkWidth(l: GraphLink, hovered: GraphNode | null, adj: Adjacency): number {
  const [s, t] = linkEndIds(l)
  const base = l.role === 'contains' ? 0.5 : 0.7 + l.confidence * 1.9
  if (hovered && (s === hovered.id || t === hovered.id || (adj.get(hovered.id)?.has(s) ?? false))) {
    return base + 0.8
  }
  return base
}

// ── Canvas node renderer ────────────────────────────────────────────────────
function nodeRadius(node: GraphNode): number {
  if (node.kind === 'extract') return 2.4 + Math.sqrt(node.val) * 1.25
  if (node.kind === 'document') return 4 + Math.sqrt(node.val) * 2.9
  return 4.5 + Math.sqrt(node.val) * 3.1 // claim
}

function drawNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  state: { isHovered: boolean; dimmed: boolean },
) {
  const { isHovered, dimmed } = state
  const x = node.x ?? 0
  const y = node.y ?? 0
  const r = nodeRadius(node)

  ctx.save()
  ctx.globalAlpha = dimmed ? 0.16 : 1

  // ── Extracts: tiny relation-colored dots, subordinate ──────────────────────
  if (node.kind === 'extract') {
    const fill = relationFill(node.relation)
    ctx.beginPath()
    ctx.arc(x, y, isHovered ? r + 1.4 : r, 0, 2 * Math.PI)
    ctx.fillStyle = node.relation === 'neutral' ? `${NEUTRAL_EXTRACT}cc` : fill
    if (isHovered) {
      ctx.shadowColor = fill
      ctx.shadowBlur = 12
    }
    ctx.fill()
    ctx.shadowBlur = 0
    if (isHovered) {
      ctx.lineWidth = 1.2 / globalScale
      ctx.strokeStyle = '#ECE7DA'
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  // ── Claims + Documents: prominent, ringed by community, always labeled ──────
  const color = node.kind === 'claim' && node.status ? statusColor(node.status) : PARCHMENT
  const comm = communityColor(node.community)

  if (node.community != null) {
    ctx.beginPath()
    ctx.arc(x, y, r + 3.5, 0, 2 * Math.PI)
    ctx.lineWidth = 2 / globalScale
    ctx.strokeStyle = `${comm}${dimmed ? '40' : 'cc'}`
    ctx.stroke()
  }

  if (isHovered) {
    ctx.shadowColor = color
    ctx.shadowBlur = 18
  }

  if (node.kind === 'claim') {
    const s = r * 1.7
    roundRect(ctx, x - s / 2, y - s / 2, s, s, 3)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 1.2 / globalScale
    ctx.strokeStyle = '#0B0E14'
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = DOC_FILL
    ctx.fill()
    ctx.lineWidth = 1.6 / globalScale
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // GDS missing-evidence marker on flagged claims.
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
    if (globalScale > 1.3) {
      ctx.fillStyle = '#0B0E14'
      ctx.font = `700 ${gr * 1.6}px 'IBM Plex Mono', monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('!', gx, gy + 0.3)
    }
  }

  // Labels: always on claims + documents (the prominent tiers).
  const fontSize = Math.max(8.5, 11 / globalScale)
  ctx.font = `${node.kind === 'claim' ? '600 ' : ''}${fontSize}px 'IBM Plex Mono', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (node.kind === 'claim') {
    ctx.fillStyle = '#0B0E14'
    ctx.fillText(node.label, x, y)
  } else {
    const ly = y + r + fontSize
    ctx.fillStyle = PARCHMENT
    ctx.fillText(node.label, x, ly)
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

// ── Tooltip (HTML) ───────────────────────────────────────────────────────────
function nodeTooltip(n: GraphNode): string {
  if (n.kind === 'extract') {
    const rel = n.relation ?? 'neutral'
    const relColor = relationFill(rel)
    const conf = n.confidence != null ? `${Math.round(n.confidence * 100)}%` : '—'
    return `<div style="font-family:Inter,sans-serif;font-size:12px;max-width:300px;color:#ECE7DA;background:#11151F;border:1px solid #1E2533;border-radius:5px;padding:9px 11px;box-shadow:0 6px 24px rgba(0,0,0,.5)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${relColor}"></span>
        <span style="font-weight:700;color:${relColor};text-transform:uppercase;letter-spacing:.06em;font-size:10.5px">${RELATION_LABEL[rel]}</span>
        <span style="color:#8A93A3;font-family:'IBM Plex Mono',monospace;font-size:10px">conf ${conf} · ${escapeHtml(n.documentId ?? '')}→${escapeHtml(n.claimId ?? '')}</span>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;line-height:1.5;color:#C7CCD6;border-left:2px solid ${relColor};padding-left:8px">“${escapeHtml(truncate(n.quote ?? '', 180))}”</div>
      <div style="color:#8A93A3;margin-top:6px;font-size:10px">Click to open in the source document</div>
    </div>`
  }
  const comm = n.community != null ? `Cluster ${n.community}` : '—'
  const gap = n.isGap
    ? `<div style="color:${STATUS_HEX.gap};margin-top:3px;font-weight:600">⚠ Flagged: no / weak support</div>`
    : ''
  const kindLabel = n.kind === 'claim' ? 'Allegation' : 'Document'
  const action =
    n.kind === 'document' ? 'Click to focus its extracts' : 'Click to inspect the key finding'
  return `<div style="font-family:Inter,sans-serif;font-size:12px;max-width:280px;color:#ECE7DA;background:#11151F;border:1px solid #1E2533;border-radius:5px;padding:9px 11px;box-shadow:0 6px 24px rgba(0,0,0,.5)">
    <div style="color:#8A93A3;font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">${kindLabel}</div>
    <b>${escapeHtml(n.label)}</b> — ${escapeHtml(n.title)}
    <div style="color:#8A93A3;margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:10.5px">centrality ${n.centrality.toFixed(2)} · ${comm}</div>${gap}
    <div style="color:#8A93A3;margin-top:5px;font-size:10px">${action}</div>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Density toggle ────────────────────────────────────────────────────────────
function DensityToggle({
  expanded,
  extractCount,
  onToggle,
}: {
  expanded: boolean
  extractCount: number
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="group inline-flex items-center gap-2.5 rounded-[5px] border border-ink-line bg-ink-panel/70 px-3 py-1.5 transition-colors hover:border-gold-dim"
      aria-pressed={expanded}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center transition-colors',
          expanded ? 'text-gold' : 'text-parchment-muted',
        )}
        aria-hidden
      >
        {expanded ? <IconExpanded /> : <IconCollapsed />}
      </span>
      <span className="font-sans text-[11.5px] font-medium text-parchment-body">
        {expanded ? (
          <>
            Showing <span className="text-parchment">{extractCount} extracts</span> · collapse to
            documents
          </>
        ) : (
          <>
            Collapsed to documents · <span className="text-parchment">show extracts</span>
          </>
        )}
      </span>
    </button>
  )
}

function IconExpanded() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="3" cy="3" r="1.4" fill="currentColor" />
      <circle cx="11" cy="3" r="1.4" fill="currentColor" />
      <circle cx="3" cy="11" r="1.4" fill="currentColor" />
      <circle cx="11" cy="11" r="1.4" fill="currentColor" />
      <circle cx="7" cy="7" r="2" fill="currentColor" />
      <path d="M7 7 L3 3 M7 7 L11 3 M7 7 L3 11 M7 7 L11 11" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
    </svg>
  )
}
function IconCollapsed() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="4" cy="7" r="2.4" fill="currentColor" />
      <circle cx="10" cy="7" r="2.4" fill="currentColor" />
      <path d="M6.4 7 H7.6" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
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

// ── GDS insight bar ───────────────────────────────────────────────────────────
interface Insight {
  pivotalLabel: string
  pivotalTitle: string
  pivotalKind: string
  communityCount: number
  gapCount: number
  extractCount: number
}

function buildInsight(graph: CaseGraph | undefined, gds: GdsOverlays | undefined): Insight | null {
  if (!graph || !gds) return null

  const docIds = new Set(graph.evidence.map((e) => e.id))
  // Most pivotal DOCUMENT by centrality (the exhibit doing the most work) —
  // reflects the new extract-level ranking projected back to its document.
  let pivotalId = ''
  let max = -Infinity
  for (const [id, score] of Object.entries(gds.centrality ?? {})) {
    if (docIds.has(id) && score > max) {
      max = score
      pivotalId = id
    }
  }
  const ev = graph.evidence.find((e) => e.id === pivotalId)

  const clusters = new Set(Object.values(gds.communities ?? {}))

  return {
    pivotalLabel: pivotalId,
    pivotalTitle: ev?.title ?? '',
    pivotalKind: 'Most-pivotal exhibit',
    communityCount: clusters.size,
    gapCount: (gds.missingEvidence ?? []).length,
    extractCount: graph.edges.length,
  }
}

function InsightBar({ insight }: { insight: Insight }) {
  return (
    <Panel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <InsightStat
        label={insight.pivotalKind}
        value={insight.pivotalLabel}
        sub={truncate(insight.pivotalTitle, 56)}
        valueColor="#E0A86A"
      />
      <span className="hidden h-7 w-px bg-ink-line sm:block" aria-hidden />
      <InsightStat
        label="Extracts"
        value={String(insight.extractCount)}
        sub="findings mapped to allegations"
      />
      <span className="hidden h-7 w-px bg-ink-line sm:block" aria-hidden />
      <InsightStat
        label="Communities"
        value={String(insight.communityCount)}
        sub="Louvain clusters"
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

// ── Legend ──────────────────────────────────────────────────────────────────
const STATUS_LEGEND: ClaimStatus[] = ['contradicted', 'gap', 'contested', 'well_supported']

function Legend({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-panel border border-ink-line bg-ink-panel/50 px-4 py-2.5">
      <LegendGroup title="Tiers">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_HEX.contradicted }} />
          <span className="font-sans text-[11px] text-parchment-muted">Claim</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: PARCHMENT, backgroundColor: DOC_FILL }} />
          <span className="font-sans text-[11px] text-parchment-muted">Document</span>
        </span>
        {expanded && (
          <span className="flex items-center gap-1.5" title="One per finding; colored by relation">
            <span className="flex items-center gap-px">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_HEX.contradicted }} />
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_HEX.well_supported }} />
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_HEX.unaddressed }} />
            </span>
            <span className="font-sans text-[11px] text-parchment-muted">Extract</span>
          </span>
        )}
      </LegendGroup>

      <span className="hidden h-6 w-px bg-ink-line lg:block" aria-hidden />

      <LegendGroup title="Claim status">
        {STATUS_LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_HEX[s] }} />
            <span className="font-sans text-[11px] text-parchment-muted">{STATUS_LABEL[s]}</span>
          </span>
        ))}
      </LegendGroup>

      <span className="hidden h-6 w-px bg-ink-line lg:block" aria-hidden />

      <LegendGroup title="Neo4j GDS">
        <span className="flex items-center gap-1.5" title="Node size ∝ PageRank centrality">
          <span className="flex items-end gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-parchment-muted" />
            <span className="h-2.5 w-2.5 rounded-full bg-parchment-muted" />
          </span>
          <span className="font-sans text-[11px] text-parchment-muted">Size = centrality</span>
        </span>
        <span className="flex items-center gap-1.5" title="Louvain community ring">
          <span className="h-2.5 w-2.5 rounded-full border-2 bg-transparent" style={{ borderColor: communityColor(0) }} />
          <span className="font-sans text-[11px] text-parchment-muted">Community ring</span>
        </span>
        <span className="flex items-center gap-1.5" title="GDS: no / weak support">
          <span className="flex h-3 w-3 items-center justify-center rounded-full" style={{ backgroundColor: STATUS_HEX.gap }}>
            <span className="font-mono text-[8px] font-bold leading-none text-ink">!</span>
          </span>
          <span className="font-sans text-[11px] text-parchment-muted">Evidence gap</span>
        </span>
      </LegendGroup>

      <span className="hidden h-6 w-px bg-ink-line lg:block" aria-hidden />

      <LegendGroup title="Edges">
        <EdgeKey color={STATUS_HEX.contradicted} label="Contradicts" />
        <EdgeKey color={STATUS_HEX.well_supported} label="Supports" />
        {expanded && <EdgeKey color="#2A3344" label="Contains" thin />}
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

function EdgeKey({ color, label, thin }: { color: string; label: string; thin?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-5 rounded-full"
        style={{ backgroundColor: color, height: thin ? '1px' : '2px', opacity: thin ? 0.7 : 1 }}
      />
      <span className="font-sans text-[11px] text-parchment-muted">{label}</span>
    </span>
  )
}
