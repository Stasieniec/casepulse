import type { CaseSummary } from '../../shared/types'

/**
 * The case masthead shown atop every section: parties as a serif title with a
 * monospace docket line (court · claim no) beneath — like the head of a brief.
 */
export function CaseHeader({ summary }: { summary: CaseSummary | undefined }) {
  if (!summary) {
    return (
      <div className="h-[58px] animate-pulse">
        <div className="h-6 w-96 rounded bg-ink-line/60" />
        <div className="mt-2 h-3 w-64 rounded bg-ink-line/40" />
      </div>
    )
  }
  const [claimant, defendant] = splitParties(summary.name)
  return (
    <div>
      <h1 className="font-serif text-[1.7rem] font-semibold leading-tight text-parchment">
        {claimant}
        <span className="px-2 font-normal italic text-parchment-muted">v</span>
        {defendant}
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-parchment-muted">
        <span>{summary.court}</span>
        <span className="text-ink-line">·</span>
        <span>Claim No. {summary.claimNo}</span>
      </div>
    </div>
  )
}

function splitParties(name: string): [string, string] {
  const m = name.split(/\s+v\s+/i)
  if (m.length === 2) return [m[0].trim(), m[1].trim()]
  return [name, '']
}
