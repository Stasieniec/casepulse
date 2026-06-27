import { NavLink, useParams } from 'react-router-dom'
import { useCases } from '../hooks/queries'
import { CaseHeader } from '../components/CaseHeader'
import { SECTIONS, type SectionKey } from '../components/AppShell'
import { Dashboard } from '../components/Dashboard'
import { PleadingView } from '../components/PleadingView'
import { GraphView } from '../components/GraphView'
import { RedTeamPanel } from '../components/RedTeamPanel'
import { cn } from '../lib/cn'

export default function CaseView() {
  const { id, section } = useParams()
  const caseId = id ?? 'meridian'
  const active = (section ?? 'dashboard') as SectionKey
  const { data: cases } = useCases()
  const summary = cases?.find((c) => c.id === caseId) ?? cases?.[0]

  return (
    <div className="px-10 py-9 lg:px-12 xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink-line pb-6">
        <CaseHeader summary={summary} />
        <nav className="flex items-center gap-1 rounded-panel border border-ink-line bg-ink-panel/60 p-1" aria-label="Case sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.key}
              to={`/case/${caseId}/${s.key}`}
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

      <div key={active} className="mt-8 animate-fade-in">
        {active === 'dashboard' && <Dashboard caseId={caseId} />}
        {active === 'pleading' && <PleadingView caseId={caseId} />}
        {active === 'graph' && <GraphView caseId={caseId} />}
        {active === 'redteam' && <RedTeamPanel caseId={caseId} />}
      </div>
    </div>
  )
}
