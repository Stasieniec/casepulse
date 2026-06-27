import { cn } from '../lib/cn'

/**
 * The Crucible wordmark: a serif logotype with a molten-gold crucible mark.
 * The dot of the 'i' becomes a drop of molten metal.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <CrucibleMark />
      <span className="font-serif text-[1.55rem] font-semibold leading-none tracking-tight text-parchment">
        Cruc
        <span className="text-gold">i</span>
        ble
      </span>
    </div>
  )
}

/** A small crucible/heat glyph — a vessel with a rising ember. */
function CrucibleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="cm-heat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E0A86A" />
          <stop offset="100%" stopColor="#C8893F" />
        </linearGradient>
      </defs>
      {/* the vessel */}
      <path
        d="M5 9 H19 L17 18.5 A2 2 0 0 1 15 20 H9 A2 2 0 0 1 7 18.5 Z"
        stroke="url(#cm-heat)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* lip */}
      <path d="M4 9 H20" stroke="url(#cm-heat)" strokeWidth="1.5" strokeLinecap="round" />
      {/* rising ember */}
      <path
        d="M12 7.5 C12 6 13 5.5 12.6 4 C13.8 4.7 14 6 13.2 7"
        stroke="#E0A86A"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="14" r="1.2" fill="url(#cm-heat)" />
    </svg>
  )
}
