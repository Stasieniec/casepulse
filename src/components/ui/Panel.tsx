import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes inner padding when you want to control it yourself. */
  flush?: boolean
  /** Subtle interactive affordance (hover lift of the border). */
  interactive?: boolean
}

/**
 * A surface panel: 1px hairline border over the ink-panel fill — never a heavy
 * drop shadow. The atmospheric building block of the whole UI.
 */
export function Panel({ className, flush, interactive, children, ...rest }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-panel border border-ink-line bg-ink-panel/80 backdrop-blur-sm',
        !flush && 'p-5',
        interactive &&
          'transition-colors duration-150 hover:border-ink-line/0 hover:bg-ink-raised cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
