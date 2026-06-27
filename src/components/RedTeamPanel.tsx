import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AttackType, ClaimStatus, RedTeamItem } from '../../shared/types'
import { useRedTeam, useGraph, useClaim } from '../hooks/queries'
import { Panel } from './ui/Panel'
import { SectionHeader } from './ui/SectionHeader'
import { StatusPill } from './ui/StatusPill'
import { EvidenceViewer, type EvidenceTarget } from './EvidenceViewer'
import { cn } from '../lib/cn'
import { STATUS_HEX, statusTint } from '../lib/status'

const ATTACK_LABEL: Record<AttackType, string> = {
  cross_exam: 'CROSS-EXAMINATION',
  strike_out: 'STRIKE-OUT',
  credibility: 'CREDIBILITY',
}

const CRIMSON = '#E5484D'
const GOLD = '#E0A86A'

/**
 * The red-team panel: opposing counsel's adversarial attack lines against
 * Meridian's own case, sorted by risk. Each card is an adversarial memo —
 * attack text, kill-shot quote, and Crucible's remediation advice.
 */
export function RedTeamPanel({ caseId }: { caseId: string }) {
  const { data: attacks, isLoading: loadingAttacks } = useRedTeam(caseId)
  const { data: graph, isLoading: loadingGraph } = useGraph(caseId)
  const [searchParams] = useSearchParams()
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null)

  const deepLinkedClaim = searchParams.get('claim') // e.g. "P6"

  if (loadingAttacks || loadingGraph) return <RedTeamSkeleton />
  if (!attacks || !graph) return null

  // Build a lookup map: claimId → Claim
  const claimMap = new Map(graph.claims.map((c) => [c.id, c]))

  // Sort attacks by their claim's riskScore (highest first)
  const sorted = [...attacks].sort((a, b) => {
    const ra = claimMap.get(a.claimId)?.riskScore ?? 0
    const rb = claimMap.get(b.claimId)?.riskScore ?? 0
    return rb - ra
  })

  return (
    <div className="space-y-8">
      {/* Adversarial section header */}
      <div>
        <div className="eyebrow mb-1.5 text-status-contradicted/80">THE OTHER SIDE</div>
        <h2 className="font-serif text-[1.8rem] font-semibold leading-tight text-parchment">
          How they'll take you apart
        </h2>
        <p className="mt-2 max-w-xl font-sans text-[13.5px] leading-relaxed text-parchment-muted">
          These are the attacks TechFlow's counsel can make using Meridian's own bundle — the
          documents, admissions, and signatures that cut against the case you've pleaded.
        </p>
        <div
          className="mt-4 h-px w-full"
          style={{
            background: `linear-gradient(90deg, ${CRIMSON}55 0%, ${CRIMSON}11 60%, transparent 100%)`,
          }}
        />
      </div>

      {/* Attack cards */}
      <div className="space-y-5">
        {sorted.map((item, i) => {
          const claim = claimMap.get(item.claimId)
          return (
            <AttackCard
              key={item.id}
              item={item}
              claimStatus={claim?.status}
              claimLabel={claim?.label ?? item.claimId}
              paragraphRef={claim?.paragraphRef}
              caseId={caseId}
              index={i}
              deepLinked={deepLinkedClaim === item.claimId}
              onOpenEvidence={setEvidenceTarget}
            />
          )
        })}
      </div>

      {/* Evidence drawer (shared) */}
      <EvidenceViewer
        caseId={caseId}
        target={evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
      />
    </div>
  )
}

// ─── Attack card ──────────────────────────────────────────────────────────────

interface AttackCardProps {
  item: RedTeamItem
  claimStatus: ClaimStatus | undefined
  claimLabel: string
  paragraphRef: string | undefined
  caseId: string
  index: number
  deepLinked: boolean
  onOpenEvidence: (t: EvidenceTarget) => void
}

function AttackCard({
  item,
  claimStatus,
  claimLabel,
  paragraphRef,
  caseId,
  deepLinked,
  onOpenEvidence,
}: AttackCardProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pulsing, setPulsing] = useState(false)

  // Deep-link: scroll + pulse on mount if this card matches ?claim=…
  useEffect(() => {
    if (!deepLinked) return
    const el = ref.current
    if (!el) return
    // Small delay so the layout has settled
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPulsing(true)
      window.setTimeout(() => setPulsing(false), 1800)
    }, 220)
    return () => window.clearTimeout(t)
  }, [deepLinked])

  return (
    <div
      ref={ref}
      className={cn(
        'overflow-hidden rounded-panel border transition-all duration-300',
        pulsing
          ? 'border-status-contradicted/70 shadow-[0_0_0_3px_rgba(229,72,77,0.18)]'
          : 'border-ink-line',
      )}
      style={{ backgroundColor: '#11151F' }}
    >
      {/* ── Card header: claim ref + attack type badge ── */}
      <div
        className="flex items-center justify-between gap-4 border-b border-ink-line px-5 py-3.5"
        style={{
          background: `linear-gradient(90deg, ${CRIMSON}0d 0%, transparent 100%)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[13px] font-semibold text-parchment">{claimLabel}</span>
          {paragraphRef && (
            <span className="font-mono text-[11px] text-parchment-muted">{paragraphRef}</span>
          )}
          {claimStatus && <StatusPill status={claimStatus} />}
        </div>
        <AttackBadge type={item.attackType} />
      </div>

      <div className="p-5 space-y-4">
        {/* ── Attack text: courtroom-ready, serif, gravitas ── */}
        <div>
          <div
            className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: `${CRIMSON}bb` }}
          >
            The attack
          </div>
          <p className="font-serif text-[14.5px] leading-[1.85] text-parchment-body">
            {item.attackText}
          </p>
        </div>

        {/* ── Kill-shot quote: crimson left-bar, clickable ── */}
        <KillshotBlock
          claimId={item.claimId}
          killshotQuote={item.killshotQuote}
          caseId={caseId}
          onOpenEvidence={onOpenEvidence}
        />

        {/* ── Fix suggestion: gold/amber accent, constructive ── */}
        <div
          className="rounded-[3px] border p-4"
          style={{
            borderColor: `${GOLD}33`,
            backgroundColor: `${GOLD}0a`,
          }}
        >
          <div
            className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: GOLD }}
          >
            Crucible's advice — fix before trial
          </div>
          <p className="font-sans text-[13px] leading-[1.75] text-parchment-body">
            {item.fixSuggestion}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Kill-shot block (with lazy claim data for linking) ───────────────────────

interface KillshotBlockProps {
  claimId: string
  killshotQuote: string
  caseId: string
  onOpenEvidence: (t: EvidenceTarget) => void
}

function KillshotBlock({ claimId, killshotQuote, onOpenEvidence }: KillshotBlockProps) {
  const { data: claim } = useClaim(claimId)

  function handleClick() {
    if (!claim) return
    // Find the contradicting edge whose quote best matches the killshotQuote,
    // falling back to the first contradicting edge.
    const contradicting = claim.contradicting
    if (contradicting.length === 0) return

    // Prefer edges whose quote overlaps significantly with the killshotQuote.
    const kLower = killshotQuote.toLowerCase()
    const best =
      contradicting.find((e) => {
        const eLower = e.quote.toLowerCase()
        // Check if the kill-shot is a substring of the edge quote (or vice-versa,
        // trimmed to 40 chars for robustness).
        const snippet = kLower.slice(0, 40)
        return eLower.includes(snippet) || kLower.includes(eLower.slice(0, 40))
      }) ?? contradicting[0]

    onOpenEvidence({
      docId: best.documentId,
      quote: best.quote,
      relation: 'contradicts',
      claimLabel: claim.label,
      rationale: best.rationale,
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={!claim || claim.contradicting.length === 0}
      className={cn(
        'w-full rounded-[3px] border-l-2 p-4 text-left transition-colors duration-150',
        'disabled:cursor-default',
        claim && claim.contradicting.length > 0
          ? 'hover:bg-status-contradicted/8 cursor-pointer'
          : '',
      )}
      style={{
        borderLeftColor: CRIMSON,
        backgroundColor: `${CRIMSON}0d`,
      }}
      title={claim ? 'Click to open source document' : undefined}
    >
      <div
        className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: `${CRIMSON}cc` }}
      >
        Their kill-shot — from your own bundle
      </div>
      <p
        className="font-serif text-[13.5px] italic leading-[1.75]"
        style={{ color: '#ECE7DA' }}
      >
        "{killshotQuote}"
      </p>
      {claim && claim.contradicting.length > 0 && (
        <div
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          style={{ color: `${CRIMSON}88` }}
        >
          Click to verify in source ↗
        </div>
      )}
    </button>
  )
}

// ─── Attack type badge ────────────────────────────────────────────────────────

function AttackBadge({ type }: { type: AttackType }) {
  return (
    <span
      className="shrink-0 rounded-[3px] border px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]"
      style={{
        color: CRIMSON,
        borderColor: `${CRIMSON}55`,
        backgroundColor: `${CRIMSON}0f`,
      }}
    >
      {ATTACK_LABEL[type]}
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RedTeamSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1, 2].map((i) => (
        <Panel key={i} className="h-56 animate-pulse" />
      ))}
    </div>
  )
}
