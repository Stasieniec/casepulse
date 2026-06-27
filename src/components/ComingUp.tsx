import { Panel } from './ui/Panel'

/**
 * Styled placeholder for sections built in a later batch (Pleading / Graph /
 * Red-Team). Keeps the editorial tone rather than a bare "TODO".
 */
export function ComingUp({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Panel className="flex min-h-[340px] flex-col items-start justify-center px-10 py-12">
      <div className="eyebrow mb-3 text-gold/70">Coming up</div>
      <h3 className="font-serif text-[1.6rem] font-semibold text-parchment">{title}</h3>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-parchment-muted">{blurb}</p>
      <div className="mt-6 flex items-center gap-2 font-mono text-[11px] text-parchment-muted/70">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold/70" />
        Next implementation batch
      </div>
    </Panel>
  )
}
