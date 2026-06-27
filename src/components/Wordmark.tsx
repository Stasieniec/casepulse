import { cn } from '../lib/cn'

/**
 * The CasePulse wordmark: a serif logotype with a pulse/ECG-line glyph.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <PulseMark />
      <span className="font-serif text-[1.55rem] font-semibold leading-none tracking-tight text-parchment">
        Case
        <span className="text-gold">Pulse</span>
      </span>
    </div>
  )
}

/** A simple ECG/pulse-line glyph in gold. */
function PulseMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="cp-pulse" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#C8893F" />
          <stop offset="100%" stopColor="#E0A86A" />
        </linearGradient>
      </defs>
      {/* ECG / pulse-line */}
      <polyline
        points="2,12 6,12 8,6 10,18 12,10 14,14 16,12 22,12"
        stroke="url(#cp-pulse)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
