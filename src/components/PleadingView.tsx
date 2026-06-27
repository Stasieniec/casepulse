import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CaseGraph, ClaimStatus } from '../../shared/types'
import { usePleading, useGraph } from '../hooks/queries'
import { segment, type HighlightSpan, type Segment } from '../lib/highlight'
import { STATUS_HEX, STATUS_LABEL, statusColor, statusTint } from '../lib/status'
import { prefersReducedMotion } from '../hooks/useCountUp'
import { Panel } from './ui/Panel'
import { SectionHeader } from './ui/SectionHeader'
import { ClaimPopover, type PopoverAnchor } from './ClaimPopover'
import { EvidenceViewer, type EvidenceTarget } from './EvidenceViewer'
import { cn } from '../lib/cn'

// Statuses shown in the legend, in narrative order (worst → best).
const LEGEND_ORDER: ClaimStatus[] = [
  'contradicted',
  'gap',
  'contested',
  'unaddressed',
  'well_supported',
]

/**
 * The pleading, adjudicated. The full Particulars of Claim rendered as a real
 * editorial legal document, with every pleaded allegation x-rayed by its
 * proof-status: a status-tinted background and a solid status-colored underline.
 * Hover a span for its evidence (ClaimPopover); click to open the source
 * (EvidenceViewer). Claims "resolve in" on mount; a deep-linked claim is
 * scrolled to and briefly pulsed.
 */
export function PleadingView({ caseId, analysisId }: { caseId: string; analysisId?: string }) {
  const { data: pleading, isLoading: loadingPleading, isError: pleadingError } = usePleading(caseId, analysisId)
  const { data: graph, isLoading: loadingGraph } = useGraph(caseId, analysisId)
  const [params] = useSearchParams()
  const deepLinkClaim = params.get('claim')

  // Popover (hover) + evidence drawer (click) state.
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null)
  const closeTimer = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const segments = useMemo<Segment[]>(() => {
    if (!pleading?.fullText || !graph) return []
    const spans: HighlightSpan[] = graph.claims
      .filter((c) => c.spanEnd > c.spanStart)
      .map((c) => ({
        id: c.id,
        spanStart: c.spanStart,
        spanEnd: c.spanEnd,
        status: c.status,
        riskScore: c.riskScore,
      }))
    return segment(pleading.fullText, spans)
  }, [pleading?.fullText, graph])

  // Index claims by id for fast lookup (status, top-evidence on click).
  const claimsById = useMemo(() => {
    const m = new Map<string, CaseGraph['claims'][number]>()
    graph?.claims.forEach((c) => m.set(c.id, c))
    return m
  }, [graph])

  // Assign each highlighted claim a stagger order for the resolve-in animation.
  const resolveOrder = useMemo(() => {
    const order = new Map<string, number>()
    let i = 0
    for (const s of segments) {
      if (s.claimId && !order.has(s.claimId)) order.set(s.claimId, i++)
    }
    return order
  }, [segments])

  function openPopover(claimId: string, el: HTMLElement) {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setAnchor({ claimId, rect: el.getBoundingClientRect() })
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setAnchor(null), 140)
  }

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function openEvidenceForClaim(claimId: string) {
    // Open the drawer for this claim's most consequential edge: prefer the
    // highest-confidence contradiction, else any edge.
    const edges = (graph?.edges ?? []).filter((e) => e.claimId === claimId)
    if (edges.length === 0) return
    const sorted = [...edges].sort((a, b) => {
      const ar = a.relation === 'contradicts' ? 1 : 0
      const br = b.relation === 'contradicts' ? 1 : 0
      if (ar !== br) return br - ar
      return b.confidence - a.confidence
    })
    const top = sorted[0]
    const claim = claimsById.get(claimId)
    setAnchor(null)
    setEvidence({
      docId: top.documentId,
      quote: top.quote,
      relation: top.relation,
      claimLabel: claim?.label,
      rationale: top.rationale,
    })
  }

  // Deep-link: scroll the target claim into view + pulse it once data is ready.
  useEffect(() => {
    if (!deepLinkClaim || segments.length === 0) return
    const t = window.setTimeout(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-claim-id="${CSS.escape(deepLinkClaim)}"]`,
      )
      if (!el) return
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
      el.setAttribute('data-pulse', 'true')
      window.setTimeout(() => el.removeAttribute('data-pulse'), 2800)
    }, 350)
    return () => window.clearTimeout(t)
  }, [deepLinkClaim, segments.length])

  if (pleadingError)
    return <Panel className="text-status-contradicted">Failed to load the pleading.</Panel>
  if (loadingPleading || loadingGraph || !pleading) return <PleadingSkeleton />

  const reduced = prefersReducedMotion()

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="The pleading, adjudicated"
        title={pleading.title}
        sub="Every pleaded allegation, x-rayed by its proof-status. Hover a span for the evidence; click to open the source document."
        action={<Legend />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
        {/* The document column */}
        <Panel className="relative overflow-hidden px-7 py-8 sm:px-10 sm:py-10">
          {/* faint gold margin rule, like a printed brief */}
          <span className="pointer-events-none absolute inset-y-8 left-0 w-px bg-gradient-to-b from-gold/30 via-gold/5 to-transparent" />
          <div
            ref={containerRef}
            className="mx-auto max-w-[68ch] font-serif text-[16.5px] leading-[1.95] text-parchment-body [text-wrap:pretty]"
          >
            {segments.map((seg, i) => {
              if (!seg.claimId || !seg.status) {
                return <span key={i}>{seg.text}</span>
              }
              return (
                <ClaimMark
                  key={i}
                  text={seg.text}
                  claimId={seg.claimId}
                  status={seg.status}
                  order={resolveOrder.get(seg.claimId) ?? 0}
                  reduced={reduced}
                  active={anchor?.claimId === seg.claimId}
                  onEnter={openPopover}
                  onLeave={scheduleClose}
                  onClick={openEvidenceForClaim}
                />
              )
            })}
          </div>
        </Panel>

        {/* Side rail: reading guide */}
        <aside className="hidden xl:block">
          <div className="sticky top-8 space-y-4">
            <SideLegend graph={graph} />
          </div>
        </aside>
      </div>

      {anchor && (
        <ClaimPopover
          caseId={caseId}
          analysisId={analysisId}
          anchor={anchor}
          onJumpToSource={(t) => {
            setAnchor(null)
            setEvidence(t)
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}

      <EvidenceViewer caseId={caseId} analysisId={analysisId} target={evidence} onClose={() => setEvidence(null)} />
    </div>
  )
}

interface ClaimMarkProps {
  text: string
  claimId: string
  status: ClaimStatus
  order: number
  reduced: boolean
  active: boolean
  onEnter: (claimId: string, el: HTMLElement) => void
  onLeave: () => void
  onClick: (claimId: string) => void
}

function ClaimMark({
  text,
  claimId,
  status,
  order,
  reduced,
  active,
  onEnter,
  onLeave,
  onClick,
}: ClaimMarkProps) {
  const color = statusColor(status)
  const bg = statusTint(status, 0.14)
  const underline = `inset 0 -2px 0 ${color}`
  const pulse = statusTint(status, 0.5)

  return (
    <mark
      data-claim-id={claimId}
      tabIndex={0}
      role="button"
      aria-label={`${claimId}: ${STATUS_LABEL[status]} — open evidence`}
      onMouseEnter={(e) => onEnter(claimId, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onEnter(claimId, e.currentTarget)}
      onBlur={onLeave}
      onClick={() => onClick(claimId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(claimId)
        }
      }}
      className={cn(
        'cursor-pointer rounded-[2px] bg-transparent px-[1px] text-parchment transition-all duration-150',
        'hover:brightness-110 focus:outline-none focus-visible:ring-1',
        !reduced && 'animate-claim-resolve',
        active && 'brightness-110',
      )}
      style={
        {
          color: '#ECE7DA',
          // Resolved (static) state + the animation target both reference these.
          backgroundColor: bg,
          boxShadow: active ? `${underline}, 0 1px 0 ${color}` : underline,
          '--claim-bg': bg,
          '--claim-underline': underline,
          '--pulse-color': pulse,
          // Stagger the resolve so claims adjudicate one after another.
          animationDelay: reduced ? '0ms' : `${120 + order * 70}ms`,
        } as React.CSSProperties
      }
    >
      {text}
    </mark>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {LEGEND_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: statusTint(s, 0.2), boxShadow: `inset 0 -1.5px 0 ${STATUS_HEX[s]}` }}
          />
          <span className="font-sans text-[11px] text-parchment-muted">{STATUS_LABEL[s]}</span>
        </span>
      ))}
    </div>
  )
}

function SideLegend({ graph }: { graph: CaseGraph | undefined }) {
  // Count claims per status so the rail doubles as an at-a-glance tally.
  const counts = useMemo(() => {
    const c: Partial<Record<ClaimStatus, number>> = {}
    graph?.claims.forEach((cl) => {
      c[cl.status] = (c[cl.status] ?? 0) + 1
    })
    return c
  }, [graph])

  return (
    <Panel className="px-4 py-4">
      <div className="eyebrow mb-3">Proof-status key</div>
      <ul className="space-y-2.5">
        {LEGEND_ORDER.map((s) => (
          <li key={s} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-3.5 rounded-[2px]"
                style={{ backgroundColor: statusTint(s, 0.2), boxShadow: `inset 0 -1.5px 0 ${STATUS_HEX[s]}` }}
              />
              <span className="font-sans text-[12px] text-parchment-body">{STATUS_LABEL[s]}</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-parchment-muted">{counts[s] ?? 0}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-ink-line pt-3 font-mono text-[10.5px] leading-relaxed text-parchment-muted/80">
        Hover any highlighted clause for the evidence; click to open the source
        in the bundle.
      </p>
    </Panel>
  )
}

function PleadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-12 w-72 animate-pulse rounded bg-ink-raised" />
      <Panel className="space-y-3 px-10 py-10">
        {[...Array(14)].map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-ink-raised"
            style={{ width: `${78 + ((i * 17) % 22)}%` }}
          />
        ))}
      </Panel>
    </div>
  )
}
