import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Edge, Relation } from '../../shared/types'
import { useClaim } from '../hooks/queries'
import { STATUS_HEX, relationColor } from '../lib/status'
import { StatusPill } from './ui/StatusPill'
import { cn } from '../lib/cn'
import type { EvidenceTarget } from './EvidenceViewer'

export interface PopoverAnchor {
  claimId: string
  rect: DOMRect
}

interface ClaimPopoverProps {
  caseId: string
  anchor: PopoverAnchor
  /** Open the evidence drawer for a specific edge. */
  onJumpToSource: (target: EvidenceTarget) => void
  /** Keep the popover open while the cursor is over it. */
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const GAP = 10 // px between anchor and popover
const WIDTH = 380

/**
 * Hover popover anchored to a claim span in the pleading. Shows the claim's
 * headline, status + risk, and its supporting/contradicting evidence, each a
 * row with a relation indicator and a verbatim quote. Self-positions to stay
 * inside the viewport (flips above/below, clamps horizontally).
 */
export function ClaimPopover({
  caseId,
  anchor,
  onJumpToSource,
  onMouseEnter,
  onMouseLeave,
}: ClaimPopoverProps) {
  const navigate = useNavigate()
  const { data: claim, isLoading } = useClaim(anchor.claimId)
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>(() =>
    initialPos(anchor.rect),
  )

  // Measure after render and re-place so it never spills off-screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { rect } = anchor
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    const spaceBelow = vh - rect.bottom
    const placement: 'top' | 'bottom' = spaceBelow < h + GAP + 12 && rect.top > h + GAP ? 'top' : 'bottom'
    const top = placement === 'bottom' ? rect.bottom + GAP : rect.top - h - GAP

    // Center horizontally on the anchor, then clamp into the viewport.
    let left = rect.left + rect.width / 2 - WIDTH / 2
    left = Math.max(12, Math.min(left, vw - WIDTH - 12))

    setPos({ top, left, placement })
  }, [anchor, claim, isLoading])

  const supporting = claim?.supporting ?? []
  const contradicting = claim?.contradicting ?? []
  const neutral = claim?.neutral ?? []
  // Lead with the kill-shots: contradicting first, then supporting, then neutral.
  const ordered: Edge[] = [...contradicting, ...supporting, ...neutral].slice(0, 5)

  function jump(e: Edge) {
    onJumpToSource({
      docId: e.documentId,
      quote: e.quote,
      relation: e.relation,
      claimLabel: claim?.label,
      rationale: e.rationale,
    })
  }

  function seeAttack() {
    // TODO(Task 3.1 / Red-Team batch): deep-link to the specific attack for this
    // claim. Red-Team content lands in a later batch; for now route to the section.
    navigate(`/case/${caseId}/redteam?claim=${anchor.claimId}`)
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Evidence for ${claim?.label ?? anchor.claimId}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 animate-pop-in"
      style={{ top: pos.top, left: pos.left, width: WIDTH }}
    >
      <div className="overflow-hidden rounded-panel border border-ink-line bg-ink-panel shadow-popover">
        {/* Header */}
        <div className="border-b border-ink-line px-4 pb-3 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-semibold text-parchment">
                {claim?.label ?? anchor.claimId}
              </span>
              {claim && (
                <span className="font-mono text-[11px] text-parchment-muted">{claim.paragraphRef}</span>
              )}
            </div>
            {claim && (
              <div className="flex items-center gap-2.5">
                <StatusPill status={claim.status} />
                <RiskChip score={claim.riskScore} status={claim.status} />
              </div>
            )}
          </div>
          {claim && (
            <p className="mt-2 font-serif text-[14px] leading-snug text-parchment">{claim.headline}</p>
          )}
        </div>

        {/* Evidence rows */}
        <div className="max-h-[300px] overflow-y-auto">
          {isLoading && <RowSkeleton />}
          {!isLoading && ordered.length === 0 && (
            <p className="px-4 py-5 text-center font-sans text-[12px] text-parchment-muted">
              No evidence retrieved for this allegation.
            </p>
          )}
          <ul className="divide-y divide-ink-line/70">
            {ordered.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => jump(e)}
                  className="group flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-raised"
                >
                  <RelationMark relation={e.relation} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-sans text-[12.5px] font-medium text-parchment-body">
                        {titleFor(e)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-parchment-muted">
                        {Math.round(e.confidence * 100)}%
                      </span>
                    </div>
                    <p
                      className="mt-1 line-clamp-2 border-l-2 pl-2 font-mono text-[11px] italic leading-snug text-parchment-muted"
                      style={{ borderColor: `${relationColor(e.relation)}66` }}
                    >
                      “{e.quote}”
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-ink-line bg-ink-panel/80 px-4 py-2.5">
          <button
            onClick={() => ordered[0] && jump(ordered[0])}
            disabled={ordered.length === 0}
            className={cn(
              'flex-1 rounded-[3px] border border-gold/30 bg-gold/10 px-3 py-1.5 font-sans text-[12px] font-semibold text-gold transition-colors',
              'hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            Jump to source
          </button>
          <button
            onClick={seeAttack}
            className="flex-1 rounded-[3px] border border-status-contradicted/30 bg-status-contradicted/10 px-3 py-1.5 font-sans text-[12px] font-semibold text-status-contradicted transition-colors hover:bg-status-contradicted/20"
          >
            See the attack
          </button>
        </div>
      </div>

      {/* Little connector arrow */}
      <Connector placement={pos.placement} anchorRect={anchor.rect} left={pos.left} />
    </div>
  )
}

function initialPos(rect: DOMRect) {
  return { top: rect.bottom + GAP, left: rect.left, placement: 'bottom' as const }
}

function titleFor(e: Edge): string {
  // The popover edges only carry documentId; show it as the document reference.
  // The full title is shown in the EvidenceViewer header.
  return e.documentId
}

function RiskChip({ score, status }: { score: number; status: import('../../shared/types').ClaimStatus }) {
  const color = STATUS_HEX[status]
  return (
    <span
      className="rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums"
      style={{ color, backgroundColor: `${color}1a` }}
      title="Risk score"
    >
      {score}
    </span>
  )
}

function RelationMark({ relation }: { relation: Relation }) {
  const color = relationColor(relation)
  const up = relation === 'supports'
  return (
    <span
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `${color}1f` }}
      title={relation}
    >
      {relation === 'neutral' ? (
        <span className="h-1 w-2 rounded-full bg-current opacity-70" />
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          {up ? (
            <path d="M6 10 V2 M6 2 L3 5 M6 2 L9 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M6 2 V10 M6 10 L3 7 M6 10 L9 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      )}
    </span>
  )
}

function Connector({
  placement,
  anchorRect,
  left,
}: {
  placement: 'top' | 'bottom'
  anchorRect: DOMRect
  left: number
}) {
  const cx = Math.max(16, Math.min(anchorRect.left + anchorRect.width / 2 - left, WIDTH - 16))
  return (
    <span
      className="absolute h-2.5 w-2.5 rotate-45 border border-ink-line bg-ink-panel"
      style={{
        left: cx - 5,
        [placement === 'bottom' ? 'top' : 'bottom']: -5.5,
        borderRight: placement === 'bottom' ? 'none' : undefined,
        borderBottom: placement === 'bottom' ? 'none' : undefined,
        borderLeft: placement === 'top' ? 'none' : undefined,
        borderTop: placement === 'top' ? 'none' : undefined,
      }}
      aria-hidden
    />
  )
}

function RowSkeleton() {
  return (
    <div className="space-y-2 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-ink-raised" />
      ))}
    </div>
  )
}
