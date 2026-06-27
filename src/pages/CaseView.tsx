import { NavLink, useParams, useSearchParams } from 'react-router-dom'
import { useCases } from '../hooks/queries'
import { CaseHeader } from '../components/CaseHeader'
import { SECTIONS, type SectionKey } from '../components/AppShell'
import { Dashboard } from '../components/Dashboard'
import { PleadingView } from '../components/PleadingView'
import { GraphView } from '../components/GraphView'
import { RedTeamPanel } from '../components/RedTeamPanel'
import EvidenceRepository from './EvidenceRepository'
import { cn } from '../lib/cn'

export default function CaseView() {
  const { id, section } = useParams()
  const [searchParams] = useSearchParams()
  const caseId = id ?? 'meridian'
  const active = (section ?? 'dashboard') as SectionKey

  // If ?analysis= is present, all data endpoints use LiveGraphProvider (D1).
  // If absent, MockGraphProvider (seed, instant) is used — the default.
  const analysisId = searchParams.get('analysis') ?? undefined

  const { data: cases } = useCases(analysisId)
  const summary = cases?.find((c) => c.id === caseId) ?? cases?.[0]

  /** Build tab URL, preserving ?analysis= so the live session survives tab switches. */
  function tabUrl(key: string) {
    const base = `/case/${caseId}/${key}`
    return analysisId ? `${base}?analysis=${encodeURIComponent(analysisId)}` : base
  }

  return (
    <div className="px-10 py-9 lg:px-12 xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink-line pb-6">
        <CaseHeader summary={summary} />

        <div className="flex items-center gap-3">
          {/* Live analysis badge */}
          {analysisId && (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-mono text-[11px] text-gold">
              Live analysis
            </span>
          )}

          {/* Section tabs */}
          <nav
            className="flex items-center gap-1 rounded-panel border border-ink-line bg-ink-panel/60 p-1"
            aria-label="Case sections"
          >
            {SECTIONS.map((s) => (
              <NavLink
                key={s.key}
                to={tabUrl(s.key)}
                className={cn(
                  'rounded-[3px] px-3.5 py-1.5 font-sans text-[12.5px] font-medium transition-colors duration-150',
                  s.key === active
                    ? 'bg-gold/15 text-gold'
                    : 'text-parchment-muted hover:text-parchment-body',
                )}
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div key={active} className="mt-8 animate-fade-in">
        {active === 'dashboard' && <Dashboard caseId={caseId} analysisId={analysisId} />}
        {active === 'pleading' && <PleadingView caseId={caseId} analysisId={analysisId} />}
        {active === 'graph' && <GraphView caseId={caseId} analysisId={analysisId} />}
        {active === 'redteam' && <RedTeamPanel caseId={caseId} analysisId={analysisId} />}
        {active === 'evidence' && <EvidenceRepository caseId={caseId} analysisId={analysisId} />}
      </div>
    </div>
  )
}
