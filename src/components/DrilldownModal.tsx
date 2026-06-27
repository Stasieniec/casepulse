import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ClaimStatus, Claim } from '../../shared/types'
import { useGraph } from '../hooks/queries'
import { STATUS_LABEL, STATUS_HEX, statusTint } from '../lib/status'
import { StatusPill } from './ui/StatusPill'
import { cn } from '../lib/cn'

interface DrilldownModalProps {
  caseId: string
  status: ClaimStatus | null
  onClose: () => void
}

/**
 * Modal opened from a status counter: lists the claims of that status and deep-
 * links each into the Pleading section.
 */
export function DrilldownModal({ caseId, status, onClose }: DrilldownModalProps) {
  const navigate = useNavigate()
  const { data: graph } = useGraph(caseId)

  // Close on Escape.
  useEffect(() => {
    if (!status) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, onClose])

  if (!status) return null

  const claims: Claim[] = (graph?.claims ?? [])
    .filter((c) => c.status === status)
    .sort((a, b) => b.riskScore - a.riskScore)

  const color = STATUS_HEX[status]

  function openClaim(claim: Claim) {
    // TODO(Task 1.5): deep-scroll the Pleading view to the target span. For now
    // we pass the claim id as a query param the Pleading view will consume.
    navigate(`/case/${caseId}/pleading?claim=${claim.id}`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/70 px-4 py-[8vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl animate-pop-in rounded-panel border border-ink-line bg-ink-panel shadow-popover"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${STATUS_LABEL[status]} claims`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-ink-line px-5 py-4" style={{ background: `linear-gradient(90deg, ${statusTint(status, 0.1)}, transparent)` }}>
          <div className="flex items-center gap-3">
            <StatusPill status={status} />
            <span className="font-serif text-lg font-semibold text-parchment">
              {claims.length} {claims.length === 1 ? 'allegation' : 'allegations'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] p-1 text-parchment-muted transition-colors hover:bg-ink-raised hover:text-parchment"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* rows */}
        {claims.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-parchment-muted">
            No allegations in this category.
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-ink-line/70 overflow-y-auto">
            {claims.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openClaim(c)}
                  className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-ink-raised"
                >
                  <div className="flex w-16 shrink-0 flex-col items-start gap-1 pt-0.5">
                    <span className="font-mono text-[12px] font-semibold text-parchment">{c.label}</span>
                    <span className="font-mono text-[11px] text-parchment-muted">{c.paragraphRef}</span>
                  </div>
                  <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-parchment-body">
                    {c.headline}
                  </p>
                  <RiskBadge score={c.riskScore} color={color} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-ink-line px-5 py-3">
          <p className="font-mono text-[11px] text-parchment-muted">
            Select an allegation to open it in the pleading.
          </p>
        </div>
      </div>
    </div>
  )
}

function RiskBadge({ score, color }: { score: number; color: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center rounded-[3px] px-2.5 py-1',
      )}
      style={{ backgroundColor: `${color}1a`, color }}
      title="Risk score"
    >
      <span className="font-serif text-base font-semibold leading-none tabular-nums">{score}</span>
      <span className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide opacity-70">risk</span>
    </div>
  )
}
