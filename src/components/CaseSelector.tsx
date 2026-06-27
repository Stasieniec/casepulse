import type { CaseSummary } from '../../shared/types'
import { cn } from '../lib/cn'

interface CaseSelectorProps {
  cases: CaseSummary[]
  value: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Styled native select for picking the active case. Native <select> keeps
 * keyboard/accessibility for free; we restyle the chrome to match the rail.
 */
export function CaseSelector({ cases, value, onChange, className }: CaseSelectorProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-panel border border-ink-line bg-ink/60 py-2 pl-3 pr-8 font-sans text-[13px] text-parchment-body outline-none transition-colors hover:border-gold-dim/60 focus:border-gold/70"
      >
        {cases.map((c) => (
          <option key={c.id} value={c.id} className="bg-ink-panel text-parchment-body">
            {shortName(c)}
          </option>
        ))}
        {cases.length === 0 && <option value="">Loading…</option>}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-parchment-muted"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Compress the long v-style case name for the narrow rail. */
function shortName(c: CaseSummary): string {
  const m = c.name.match(/^(.*?)\s+(?:PLC|LLC|Ltd|Limited)?\s*v\s+(.*?)\s+(?:PLC|LLC|Ltd|Limited)?$/i)
  if (m) return `${firstWord(m[1])} v ${firstWord(m[2])}`
  return c.name
}
function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0]
}
