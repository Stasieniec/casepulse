import type { ClaimStatus } from '../../../shared/types'
import { STATUS_LABEL, statusColor, statusTint } from '../../lib/status'
import { cn } from '../../lib/cn'

interface StatusPillProps {
  status: ClaimStatus
  /** Compact dot-only mode for dense rows. */
  dot?: boolean
  className?: string
}

/**
 * Canonical status chip. Low-alpha tinted fill + a solid status-colored dot and
 * 1px ring in the full color — the visual grammar used across the whole app.
 */
export function StatusPill({ status, dot, className }: StatusPillProps) {
  const color = statusColor(status)
  if (dot) {
    return (
      <span
        className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
        style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${statusTint(status, 0.18)}` }}
        title={STATUS_LABEL[status]}
      />
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-sans text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap',
        className,
      )}
      style={{
        color,
        backgroundColor: statusTint(status, 0.12),
        boxShadow: `inset 0 0 0 1px ${statusTint(status, 0.4)}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABEL[status]}
    </span>
  )
}
