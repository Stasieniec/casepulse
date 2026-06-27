import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface SectionHeaderProps {
  /** Small-caps eyebrow above the title. */
  eyebrow?: string
  title: ReactNode
  /** Optional supporting line under the title. */
  sub?: ReactNode
  /** Right-aligned slot (e.g. controls, counts). */
  action?: ReactNode
  className?: string
}

/**
 * Editorial section header: small-caps eyebrow, serif title, hairline rule.
 * Establishes the "premium legal brief" hierarchy everywhere it's used.
 */
export function SectionHeader({ eyebrow, title, sub, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h2 className="font-serif text-[1.35rem] font-semibold leading-tight text-parchment">
            {title}
          </h2>
          {sub && <p className="mt-1 text-sm text-parchment-muted">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
