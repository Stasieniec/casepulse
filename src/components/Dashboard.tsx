import { useState } from 'react'
import type { ClaimStatus } from '../../shared/types'
import { useStats } from '../hooks/queries'
import { Panel } from './ui/Panel'
import { SectionHeader } from './ui/SectionHeader'
import { ReadinessGauge } from './ReadinessGauge'
import { StatCounters } from './StatCounters'
import { VulnerabilityFeed } from './VulnerabilityFeed'
import { DrilldownModal } from './DrilldownModal'

/**
 * Trial-readiness dashboard: the readiness gauge + verdict (the consequential
 * hero), the four status counters, and the risk register — an editorial,
 * asymmetric composition.
 */
export function Dashboard({ caseId }: { caseId: string }) {
  const { data: stats, isLoading, isError } = useStats(caseId)
  const [drill, setDrill] = useState<ClaimStatus | null>(null)

  if (isLoading) return <DashboardSkeleton />
  if (isError || !stats)
    return (
      <Panel className="text-status-contradicted">Failed to load case statistics.</Panel>
    )

  return (
    <div className="space-y-8">
      {/* Hero row: gauge + verdict, asymmetric (gauge narrow, verdict wide) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="flex flex-col items-center justify-center py-7">
          <ReadinessGauge score={stats.overallScore} />
        </Panel>

        <Panel className="relative overflow-hidden py-6">
          {/* faint gold rule down the left, like a margin line on a brief */}
          <span className="absolute inset-y-6 left-0 w-px bg-gradient-to-b from-gold/40 via-gold/10 to-transparent" />
          <SectionHeader eyebrow="The verdict" title="Counsel’s assessment" />
          <p className="pr-2 font-serif text-[15px] leading-[1.8] text-parchment-body first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-[3.1rem] first-letter:font-semibold first-letter:leading-[0.82] first-letter:text-gold">
            {stats.verdict}
          </p>
        </Panel>
      </div>

      {/* Counters */}
      <div>
        <SectionHeader
          eyebrow="Allegations by proof-status"
          title="The matrix"
          sub="Click any status to inspect the underlying claims."
        />
        <StatCounters stats={stats} onDrilldown={setDrill} />
      </div>

      {/* Risk register */}
      <VulnerabilityFeed items={stats.biggestVulnerabilities} />

      <DrilldownModal caseId={caseId} status={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="h-64 animate-pulse" />
        <Panel className="h-64 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Panel key={i} className="h-28 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
