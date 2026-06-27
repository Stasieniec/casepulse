import type { ClaimStatus } from '../../shared/types'
import type { Stats } from '../../shared/types'
import { STATUS_HEX, STATUS_SHORT, statusTint } from '../lib/status'
import { useCountUp } from '../hooks/useCountUp'
import { cn } from '../lib/cn'

interface StatCountersProps {
  stats: Stats
  onDrilldown: (status: ClaimStatus) => void
}

// The four headline counters in priority order, plus contested as a quieter fifth.
const PRIMARY: { status: ClaimStatus; pick: (s: Stats) => number }[] = [
  { status: 'well_supported', pick: (s) => s.wellSupported },
  { status: 'contradicted', pick: (s) => s.contradicted },
  { status: 'gap', pick: (s) => s.gaps },
  { status: 'unaddressed', pick: (s) => s.unaddressed },
]

/**
 * Four clickable status counters (with contested folded in as a fifth, quieter
 * chip). Each ticks up on mount; clicking drills into the matching claims.
 */
export function StatCounters({ stats, onDrilldown }: StatCountersProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PRIMARY.map((m) => (
          <CounterCard
            key={m.status}
            status={m.status}
            value={m.pick(stats)}
            onClick={() => onDrilldown(m.status)}
          />
        ))}
      </div>
      <button
        onClick={() => onDrilldown('contested')}
        className="mt-3 flex w-full items-center justify-between rounded-panel border border-ink-line bg-ink-panel/50 px-4 py-2.5 text-left transition-colors hover:bg-ink-raised"
      >
        <span className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_HEX.contested }} />
          <span className="font-sans text-[13px] text-parchment-body">{STATUS_SHORT.contested}</span>
          <span className="font-mono text-[11px] text-parchment-muted">— partly proven, partly disputed</span>
        </span>
        <span className="font-serif text-lg font-semibold tabular-nums" style={{ color: STATUS_HEX.contested }}>
          {stats.contested}
        </span>
      </button>
    </div>
  )
}

function CounterCard({
  status,
  value,
  onClick,
}: {
  status: ClaimStatus
  value: number
  onClick: () => void
}) {
  const color = STATUS_HEX[status]
  const animated = useCountUp(value, 900)
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-panel border border-ink-line bg-ink-panel/70 px-4 py-4 text-left',
        'transition-all duration-150 hover:-translate-y-0.5 hover:border-transparent',
      )}
      style={{ '--accent': color } as React.CSSProperties}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${statusTint(status, 0.55)}, 0 10px 30px -16px ${color}`)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
    >
      {/* left status bar */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} />
      <div className="flex items-baseline justify-between">
        <span className="font-serif text-[2.4rem] font-semibold leading-none tabular-nums text-parchment">
          {Math.round(animated)}
        </span>
        <Arrow color={color} />
      </div>
      <div className="mt-2.5 font-sans text-[12.5px] font-semibold" style={{ color }}>
        {STATUS_SHORT[status]}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-parchment-muted">
        {value === 1 ? '1 claim' : `${value} claims`}
      </div>
    </button>
  )
}

function Arrow({ color }: { color: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className="translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
      style={{ color }}
      aria-hidden
    >
      <path d="M4 8 H11 M8 5 L11 8 L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
