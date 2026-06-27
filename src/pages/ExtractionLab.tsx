import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { CaseGraph, Edge, Relation } from '../../shared/types'
import { useGraph, useStats } from '../hooks/queries'
import { analyze, ingest, type IngestResult } from '../api'
import { useLabChoreography, type LabPhase } from '../hooks/useLabChoreography'
import { prefersReducedMotion } from '../hooks/useCountUp'
import { ReadinessGauge } from '../components/ReadinessGauge'
import { EvidenceViewer, type EvidenceTarget } from '../components/EvidenceViewer'
import { StatusPill } from '../components/ui/StatusPill'
import { STATUS_HEX, relationColor, statusTint } from '../lib/status'
import { DATASET_CASE, GENERALIZES_LINE } from '../lib/framing'
import { cn } from '../lib/cn'

const CASE_ID_FALLBACK = 'meridian'

/** Plain-English stage copy. Keyed by phase; detail used as the live "working" line. */
const STAGE_COPY: Record<LabPhase, { label: string; detail: string }> = {
  idle: { label: 'Ready', detail: '' },
  reading: { label: 'Reading the pleading', detail: 'Loading the Particulars of Claim…' },
  extracting: { label: 'Extracting allegations', detail: 'Isolating every pleaded proposition…' },
  searching: { label: 'Searching the bundle', detail: 'Pulling relevant exhibits from 18 documents…' },
  crossexam: { label: 'Cross-examining the evidence', detail: 'Judging each allegation against the exhibits…' },
  building: { label: 'Building the case graph', detail: 'Scoring trial-readiness…' },
  done: { label: 'Analysis complete', detail: '' },
}

const EVIDENCE_STAGE_COPY: Partial<Record<LabPhase, { label: string; detail: string }>> = {
  reading: { label: 'Reading the exhibit', detail: 'Loading the source document…' },
  searching: { label: 'Aligning to the pleaded case', detail: 'Matching against all 13 allegations…' },
  crossexam: { label: 'Classifying the exhibit', detail: 'Does it support or contradict each claim?' },
  building: { label: 'Recording the verdict', detail: 'Linking the exhibit into the case graph…' },
}

export default function ExtractionLab() {
  const navigate = useNavigate()
  const { id } = useParams()
  const caseId = id ?? CASE_ID_FALLBACK
  const [params] = useSearchParams()
  const sourceParam = params.get('source') // undefined => pleading mode; else an evidence id

  const modeParam = params.get('mode') // 'ingest' → ingest beat
  const mode: 'pleading' | 'evidence' | 'ingest' = modeParam === 'ingest'
    ? 'ingest'
    : sourceParam
      ? 'evidence'
      : 'pleading'

  // Live mode state. Default = replay (no network).
  const [live, setLive] = useState(false)
  const [liveId, setLiveId] = useState<string | null>(null)
  const [liveScore, setLiveScore] = useState<number | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  // The choreography ALWAYS animates over the seed graph/stats — instant,
  // stable, and honest (the seed IS real analysis output). A live run genuinely
  // re-runs the engine and produces `liveId`, which is threaded into navigation
  // and the explore views so they show the live analysis. Reading seed here (not
  // the live query) keeps the timeline from tearing down while the live result
  // loads, and the curated case is identical either way.
  const { data: graph } = useGraph(caseId)
  const { data: stats } = useStats(caseId)

  const ready = !!graph && !!stats

  const claimCount = graph?.claims.length ?? 13
  const evidenceCount = graph?.evidence.length ?? 18
  const judgedEdges = useMemo(
    () => (graph?.edges ?? []).filter((e) => e.relation !== 'neutral'),
    [graph],
  )

  // The live work: POST /api/analyze on the curated pleading, thread the id.
  // A generation token discards results from a run the user has switched away from.
  const livePleadingText = useRef<string | null>(null)
  const runGen = useRef(0)
  async function runLive(): Promise<void> {
    const gen = ++runGen.current
    try {
      // Use the seed pleading text as the input (the curated bundle); the API
      // accepts any text — this is our "works on any bundle" proof.
      let text = livePleadingText.current
      if (text == null) {
        const p = (await (await fetch(`/api/cases/${caseId}/pleading`)).json()) as { fullText: string }
        text = p.fullText
      }
      livePleadingText.current = text
      const result = await analyze(caseId, text)
      if (gen === runGen.current) {
        setLiveId(result.analysisId)
        setLiveScore(result.stats.overallScore)
      }
    } catch (err) {
      if (gen === runGen.current) setLiveError(err instanceof Error ? err.message : String(err))
      // Fall back to replay: do not set liveId, choreography proceeds on seed.
    }
  }

  const choreo = useLabChoreography({
    mode: mode === 'ingest' ? 'pleading' : mode,
    ready,
    claimCount,
    evidenceCount,
    edgeCount: judgedEdges.length,
    liveRun: live ? runLive : undefined,
  })

  // Auto-start once data is ready (the cinematic run is the whole point).
  useEffect(() => {
    if (ready && !choreo.started) choreo.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, choreo.started])

  /**
   * Switch Replay <-> Live. Resets the timeline and replays it in the chosen
   * mode — clicking "Run it live" mid-demo genuinely re-runs the engine; the
   * auto-start effect re-fires once `started` is back to false.
   */
  function switchMode(toLive: boolean) {
    if (toLive === live) return
    runGen.current++ // invalidate any in-flight live run
    setLiveId(null)
    setLiveScore(null)
    setLiveError(null)
    setLive(toLive)
    choreo.reset()
  }

  function gotoDashboard() {
    const q = liveId ? `?analysis=${encodeURIComponent(liveId)}` : ''
    navigate(`/case/${caseId}/dashboard${q}`)
  }
  function gotoSection(section: string) {
    const q = liveId ? `?analysis=${encodeURIComponent(liveId)}` : ''
    navigate(`/case/${caseId}/${section}${q}`)
  }

  function gotoIngest() {
    navigate(`/case/${caseId}/lab?mode=ingest`)
  }
  function gotoLabDefault() {
    navigate(`/case/${caseId}/lab`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <LabTopBar
        live={live}
        onReplay={() => switchMode(false)}
        onLive={() => switchMode(true)}
        onSkip={choreo.skip}
        showSkip={choreo.started && choreo.phase !== 'done' && mode !== 'ingest'}
        onExit={() => navigate('/')}
        liveActive={live && !!liveId}
        ingestMode={mode === 'ingest'}
        onIngest={gotoIngest}
        onLabDefault={gotoLabDefault}
      />

      {liveError && (
        <div className="mx-auto mt-4 w-full max-w-[1200px] px-8">
          <div className="rounded-panel border border-status-contested/40 bg-status-contested/10 px-4 py-2.5 font-sans text-[12px] text-status-contested">
            Live run unavailable — replaying the precomputed analysis instead.
            <span className="ml-2 font-mono text-[10.5px] text-parchment-muted/70">{liveError.slice(0, 120)}</span>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 pb-10 pt-4 lg:px-10 xl:px-14">
        {mode !== 'ingest' && (
          <StageHeader mode={mode} choreo={choreo} sourceId={sourceParam} live={live} liveId={liveId} />
        )}

        {mode === 'pleading' ? (
          <PleadingStage caseId={caseId} graph={graph} stats={stats} choreo={choreo} liveId={liveId} liveScore={liveScore} />
        ) : mode === 'evidence' ? (
          <EvidenceStage
            caseId={caseId}
            graph={graph}
            stats={stats}
            choreo={choreo}
            sourceId={sourceParam!}
            liveId={liveId}
            liveScore={liveScore}
          />
        ) : (
          <IngestStage />
        )}

        {mode !== 'ingest' && choreo.phase === 'done' && (
          <DoneCtas onDashboard={gotoDashboard} onSection={gotoSection} live={!!liveId} />
        )}
      </div>
    </div>
  )
}

// ── Top bar ──────────────────────────────────────────────────────────────────
function LabTopBar({
  live,
  onReplay,
  onLive,
  onSkip,
  showSkip,
  onExit,
  liveActive,
  ingestMode,
  onIngest,
  onLabDefault,
}: {
  live: boolean
  onReplay: () => void
  onLive: () => void
  onSkip: () => void
  showSkip: boolean
  onExit: () => void
  liveActive: boolean
  ingestMode: boolean
  onIngest: () => void
  onLabDefault: () => void
}) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-ink-line bg-ink/85 px-6 py-3 backdrop-blur-md lg:px-10 xl:px-14">
      <div className="flex items-center gap-3">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-sans text-[12px] text-parchment-muted transition-colors hover:text-parchment-body"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M13 8 H4 M7 5 L4 8 L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Exit
        </button>
        <span className="h-4 w-px bg-ink-line" aria-hidden />
        <span className="eyebrow text-gold/80">Extraction Lab</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Lab mode: Analysis vs Ingest */}
        <div className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-panel/70 p-0.5">
          <SegBtn active={!ingestMode} onClick={onLabDefault}>
            Analysis
          </SegBtn>
          <SegBtn active={ingestMode} onClick={onIngest} accent>
            <span className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 1 V8 M6 8 L3.5 5.5 M6 8 L8.5 5.5 M1.5 10.5 H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ingest
            </span>
          </SegBtn>
        </div>

        {!ingestMode && (
          <>
            {/* Replay / Live toggle — only shown in analysis modes */}
            <div className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-panel/70 p-0.5">
              <SegBtn active={!live} onClick={onReplay}>
                Replay
              </SegBtn>
              <SegBtn active={live} onClick={onLive} accent>
                <span className="flex items-center gap-1.5">
                  {live && liveActive && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-supported" />}
                  Run it live
                </span>
              </SegBtn>
            </div>

            {showSkip && (
              <button
                onClick={onSkip}
                className="rounded-panel border border-ink-line px-3 py-1.5 font-sans text-[12px] font-medium text-parchment-muted transition-colors hover:border-gold-dim/50 hover:text-parchment-body"
              >
                Skip to results
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SegBtn({
  active,
  disabled,
  onClick,
  accent,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition-colors duration-150',
        active
          ? accent
            ? 'bg-gold/20 text-gold'
            : 'bg-ink-raised text-parchment'
          : 'text-parchment-muted hover:text-parchment-body',
        disabled && !active && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  )
}

// ── Stage header (title + replay/live note) ──────────────────────────────────
function StageHeader({
  mode,
  choreo,
  sourceId,
  live,
  liveId,
}: {
  mode: 'pleading' | 'evidence'
  choreo: ReturnType<typeof useLabChoreography>
  sourceId: string | null
  live: boolean
  liveId: string | null
}) {
  const copy =
    (mode === 'evidence' ? EVIDENCE_STAGE_COPY[choreo.phase] : undefined) ?? STAGE_COPY[choreo.phase]
  const honesty = live
    ? liveId
      ? 'Live run — real Gemini + Neo4j Aura'
      : 'Running the live engine…'
    : 'Replay of the actual analysis'

  return (
    <div className="mt-5 mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="eyebrow text-gold/70">{honesty}</span>
            {live && (
              <span className="inline-flex items-center gap-1 rounded-full border border-status-supported/40 bg-status-supported/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-status-supported">
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full bg-status-supported', !liveId && 'animate-pulse')} />
                Live
              </span>
            )}
          </div>
          <h1 className="mt-1.5 font-serif text-[1.9rem] font-semibold leading-tight text-parchment">
            {copy.label}
            {choreo.phase !== 'done' && choreo.phase !== 'idle' && (
              <span className="ml-1 inline-flex w-6 text-gold">
                <Dots />
              </span>
            )}
          </h1>
          {copy.detail && choreo.phase !== 'done' && (
            <p className="mt-1 font-sans text-[13px] text-parchment-muted">{copy.detail}</p>
          )}
        </div>

        {/* Stage rail */}
        <StageRail choreo={choreo} mode={mode} />
      </div>

      {/* Framing line under the header */}
      <p className="mt-4 border-t border-ink-line pt-3 font-mono text-[10.5px] text-parchment-muted/75">
        {mode === 'evidence' && sourceId ? `Classifying ${sourceId} · ` : ''}
        {DATASET_CASE} — <span className="text-parchment-muted">{GENERALIZES_LINE}</span>
      </p>
    </div>
  )
}

function StageRail({
  choreo,
  mode,
}: {
  choreo: ReturnType<typeof useLabChoreography>
  mode: 'pleading' | 'evidence'
}) {
  const list = choreo.phases.filter((p) => p !== 'done')
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {list.map((p, i) => {
        const idx = choreo.phases.indexOf(p)
        const done = choreo.phaseIndex > idx || choreo.phase === 'done'
        const active = choreo.phaseIndex === idx
        const copy = (mode === 'evidence' ? EVIDENCE_STAGE_COPY[p] : undefined) ?? STAGE_COPY[p]
        return (
          <li key={p} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium transition-colors duration-300',
                done
                  ? 'border-status-supported/30 bg-status-supported/10 text-status-supported'
                  : active
                    ? 'border-gold/50 bg-gold/10 text-gold'
                    : 'border-ink-line text-parchment-muted/60',
              )}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full transition-colors duration-300',
                  done ? 'bg-status-supported' : active ? 'animate-pulse bg-gold' : 'bg-ink-line',
                )}
              />
              {copy.label}
            </span>
            {i < list.length - 1 && <span className="h-px w-3 bg-ink-line" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 animate-pulse rounded-full bg-gold"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  )
}

// ── Pleading stage (the main choreography) ───────────────────────────────────
function PleadingStage({
  caseId,
  graph,
  stats,
  choreo,
  liveId,
  liveScore,
}: {
  caseId: string
  graph: CaseGraph | undefined
  stats: { overallScore: number; contradicted: number; wellSupported: number; gaps: number } | undefined
  choreo: ReturnType<typeof useLabChoreography>
  liveId: string | null
  liveScore: number | null
}) {
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null)

  const claims = useMemo(
    () => [...(graph?.claims ?? [])].sort((a, b) => labelNum(a.label) - labelNum(b.label)),
    [graph],
  )
  const evidence = graph?.evidence ?? []

  // Top judged edge per claim (prefer the highest-confidence contradiction —
  // the kill-shot — else the strongest support).
  const topEdgeByClaim = useMemo(() => topEdges(graph), [graph])

  const reading = choreo.phase === 'reading'
  const extracting = choreo.phase === 'extracting'
  const searching = choreo.phase === 'searching'
  const crossexam = choreo.phase === 'crossexam'
  const building = choreo.building

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.6fr)_minmax(0,220px)]">
      {/* Source column: the pleading */}
      <SourceColumn caseId={caseId} liveId={liveId} dim={!reading && choreo.phase !== 'idle'} />

      {/* Extraction stream: claim node cards lift out, then get judged */}
      <section>
        <ColumnLabel
          n={claims.length}
          shown={Math.min(choreo.revealedClaims, claims.length)}
          label="Allegations extracted"
        />
        <div className="mt-3 space-y-2.5">
          {claims.map((c, i) => {
            const revealed = i < choreo.revealedClaims || building
            const judged = (crossexam || building) && i < choreo.drawnEdgesPerClaim(claims.length)
            const top = topEdgeByClaim.get(c.id)
            return (
              <ClaimNodeCard
                key={c.id}
                claim={c}
                index={i}
                revealed={revealed}
                judged={judged || building}
                topEdge={top}
                onOpenEvidence={(t) => setEvidenceTarget(t)}
              />
            )
          })}
        </div>
      </section>

      {/* Bundle column: evidence docs surface + the gauge at the end */}
      <aside>
        {!building ? (
          <>
            <ColumnLabel
              n={evidence.length}
              shown={Math.min(choreo.surfacedEvidence, evidence.length)}
              label="Exhibits retrieved"
            />
            <div className="mt-3 flex flex-col gap-1.5">
              {evidence.map((e, i) => (
                <EvidenceChip
                  key={e.id}
                  id={e.id}
                  title={e.title}
                  surfaced={i < choreo.surfacedEvidence || searching || crossexam || building}
                  pulsing={searching}
                />
              ))}
            </div>
            {(crossexam || searching) && <AbstentionBeat active={crossexam} />}
          </>
        ) : (
          <BuildingPanel stats={stats} liveScore={liveScore} />
        )}
      </aside>

      <EvidenceViewer
        caseId={caseId}
        analysisId={liveId ?? undefined}
        target={evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
      />
    </div>
  )
}

/**
 * The source document column. Reuses the read-only pleading preview; while
 * "reading" it appears with a typewriter-ish reveal, then dims as the engine
 * moves on.
 */
function SourceColumn({ caseId, liveId, dim }: { caseId: string; liveId: string | null; dim: boolean }) {
  const [text, setText] = useState<string>('')
  useEffect(() => {
    let alive = true
    fetch(`/api/cases/${caseId}/pleading${liveId ? `?analysis=${liveId}` : ''}`)
      .then((r) => r.json() as Promise<{ fullText?: string }>)
      .then((p) => {
        if (alive) setText(p.fullText ?? '')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [caseId, liveId])

  const body = useMemo(() => {
    const idx = text.indexOf('The parties')
    return (idx >= 0 ? text.slice(idx) : text) || 'Loading the Particulars of Claim…'
  }, [text])

  return (
    <section className={cn('transition-opacity duration-500', dim ? 'opacity-50' : 'opacity-100')}>
      <ColumnLabel label="Particulars of Claim" sub="from the bundle" />
      <div className="relative mt-3 h-[clamp(420px,62vh,720px)] overflow-hidden rounded-panel border border-ink-line bg-ink-panel/70">
        <span className="pointer-events-none absolute inset-y-5 left-0 w-px bg-gradient-to-b from-gold/30 via-gold/5 to-transparent" />
        <div className="h-full overflow-y-auto px-6 py-5">
          <pre className="whitespace-pre-wrap break-words font-serif text-[13.5px] leading-[1.85] text-parchment-body/90 animate-fade-in">
            {body}
          </pre>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-ink-panel to-transparent" />
      </div>
    </section>
  )
}

function ColumnLabel({ n, shown, label, sub }: { n?: number; shown?: number; label: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
      <div className="eyebrow">
        {label}
        {sub && <span className="ml-1.5 font-normal normal-case tracking-normal text-parchment-muted/70">· {sub}</span>}
      </div>
      {typeof n === 'number' && (
        <span className="font-mono text-[11px] tabular-nums text-gold">
          {shown ?? 0}
          <span className="text-parchment-muted/60">/{n}</span>
        </span>
      )}
    </div>
  )
}

// ── Claim node card ──────────────────────────────────────────────────────────
function ClaimNodeCard({
  claim,
  index,
  revealed,
  judged,
  topEdge,
  onOpenEvidence,
}: {
  claim: CaseGraph['claims'][number]
  index: number
  revealed: boolean
  judged: boolean
  topEdge: { edge: Edge; title: string } | undefined
  onOpenEvidence: (t: EvidenceTarget) => void
}) {
  const reduced = prefersReducedMotion()
  const color = STATUS_HEX[claim.status]
  const relColor = topEdge ? relationColor(topEdge.edge.relation) : color
  const isKill = topEdge?.edge.relation === 'contradicts'

  return (
    <div
      className={cn(
        'rounded-panel border bg-ink-panel/70 px-3.5 py-3 transition-all',
        revealed ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
      style={{
        borderColor: judged ? statusTint(claim.status, 0.45) : '#1E2533',
        boxShadow: judged ? `inset 3px 0 0 ${color}` : undefined,
        transitionDuration: reduced ? '0ms' : '420ms',
        transitionDelay: revealed && !judged && !reduced ? `${(index % 14) * 30}ms` : '0ms',
      }}
    >
      <div className="flex items-start gap-3">
        {/* ID chip */}
        <span
          className="mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold"
          style={{ color, backgroundColor: statusTint(claim.status, 0.14) }}
        >
          {claim.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-parchment-muted/80">{claim.paragraphRef}</span>
            {judged && <StatusPill status={claim.status} className="scale-90" />}
          </div>
          <p className="mt-1 font-serif text-[13px] leading-snug text-parchment-body line-clamp-2">
            {claim.text}
          </p>

          {/* Verdict line (cross-exam): the top edge + kill-shot quote */}
          {judged && topEdge && (
            <button
              onClick={() =>
                onOpenEvidence({
                  docId: topEdge.edge.documentId,
                  quote: topEdge.edge.quote,
                  relation: topEdge.edge.relation,
                  claimLabel: claim.label,
                  rationale: topEdge.edge.rationale,
                })
              }
              className="group mt-2 flex w-full items-start gap-2 rounded-[3px] border-l-2 bg-ink/40 px-2.5 py-1.5 text-left transition-colors hover:bg-ink-raised"
              style={{ borderColor: relColor }}
            >
              <RelationGlyph relation={topEdge.edge.relation} color={relColor} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-sans text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: relColor }}>
                    {topEdge.edge.relation === 'contradicts' ? 'Contradicted by' : 'Supported by'} {topEdge.edge.documentId}
                  </span>
                  {isKill && (
                    <span className="rounded-[2px] bg-status-contradicted/15 px-1 py-px font-mono text-[8.5px] font-semibold uppercase text-status-contradicted">
                      kill-shot
                    </span>
                  )}
                  <span className="font-mono text-[9.5px] text-parchment-muted/70">{Math.round(topEdge.edge.confidence * 100)}%</span>
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10.5px] italic text-parchment-muted group-hover:text-parchment-body">
                  &ldquo;{topEdge.edge.quote}&rdquo;
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Evidence chip ────────────────────────────────────────────────────────────
function EvidenceChip({
  id,
  title,
  surfaced,
  pulsing,
}: {
  id: string
  title: string
  surfaced: boolean
  pulsing: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5 transition-all duration-300',
        surfaced ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
        pulsing ? 'border-gold/40 bg-gold/[0.06]' : 'border-ink-line bg-ink-panel/50',
      )}
    >
      <span className="font-mono text-[10.5px] font-semibold text-parchment-muted">{id}</span>
      <span className="min-w-0 flex-1 truncate font-sans text-[11px] text-parchment-body/80">{title}</span>
      {pulsing && <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gold" />}
    </div>
  )
}

/** The credibility beat: abstention. Low-confidence candidates are withheld. */
function AbstentionBeat({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'mt-4 rounded-panel border border-dashed border-ink-line bg-ink/30 px-3 py-2.5 transition-opacity duration-500',
        active ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-unaddressed" />
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-muted">
          Inconclusive — withheld
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-parchment-muted/75">
        Candidate links below the confidence threshold are abstained, not forced
        into a verdict. Rigor over recall.
      </p>
    </div>
  )
}

/** Final building panel: the readiness gauge sweeps + counts tally. */
function BuildingPanel({
  stats,
  liveScore,
}: {
  stats: { overallScore: number; contradicted: number; wellSupported: number; gaps: number } | undefined
  liveScore?: number | null
}) {
  // In live mode, use the real score returned by analyze(); fall back to seed.
  const gaugeScore = liveScore ?? stats?.overallScore ?? 28
  return (
    <div className="rounded-panel border border-ink-line bg-ink-panel/70 px-4 py-6 animate-fade-rise">
      <div className="eyebrow mb-3 text-center text-gold/70">Trial-readiness</div>
      <ReadinessGauge score={gaugeScore} />
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-line pt-4">
        <Tally value={stats?.contradicted ?? 8} label="Contradicted" color={STATUS_HEX.contradicted} />
        <Tally value={stats?.gaps ?? 1} label="Gaps" color={STATUS_HEX.gap} />
        <Tally value={stats?.wellSupported ?? 3} label="Supported" color={STATUS_HEX.well_supported} />
      </div>
    </div>
  )
}

function Tally({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className="font-serif text-[1.6rem] font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-parchment-muted">{label}</div>
    </div>
  )
}

// ── Evidence mode stage ──────────────────────────────────────────────────────
function EvidenceStage({
  caseId,
  graph,
  stats,
  choreo,
  sourceId,
  liveId,
  liveScore,
}: {
  caseId: string
  graph: CaseGraph | undefined
  stats: { overallScore: number; contradicted: number; wellSupported: number; gaps: number } | undefined
  choreo: ReturnType<typeof useLabChoreography>
  sourceId: string
  liveId: string | null
  liveScore: number | null
}) {
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null)
  const doc = graph?.evidence.find((e) => e.id === sourceId)
  const docTitle = doc?.title ?? sourceId

  // Edges this exhibit bears on, judged (non-neutral), sorted contradict-first.
  const links = useMemo(() => {
    const es = (graph?.edges ?? []).filter((e) => e.documentId === sourceId && e.relation !== 'neutral')
    return es.sort((a, b) => {
      const r = (x: Edge) => (x.relation === 'contradicts' ? 1 : 0)
      if (r(a) !== r(b)) return r(b) - r(a)
      return b.confidence - a.confidence
    })
  }, [graph, sourceId])

  const claimsById = useMemo(() => {
    const m = new Map<string, CaseGraph['claims'][number]>()
    graph?.claims.forEach((c) => m.set(c.id, c))
    return m
  }, [graph])

  const building = choreo.building
  const shown = building ? links.length : Math.min(choreo.drawnEdges, links.length)

  const contradicts = [...new Set(links.filter((l) => l.relation === 'contradicts').map((l) => l.claimId))]
  const supports = [...new Set(links.filter((l) => l.relation === 'supports').map((l) => l.claimId))]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {/* The exhibit + verdict summary */}
      <section>
        <ColumnLabel label="The exhibit" sub={sourceId} />
        <div className="mt-3 rounded-panel border border-ink-line bg-ink-panel/70 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="rounded-[3px] bg-gold/12 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gold">
              {sourceId}
            </span>
            <h3 className="font-serif text-[1.05rem] font-semibold text-parchment">{docTitle}</h3>
          </div>

          {building && (
            <div className="mt-4 space-y-2 border-t border-ink-line pt-4 animate-fade-rise">
              <div className="eyebrow mb-1">Verdict</div>
              <p className="font-serif text-[13.5px] leading-relaxed text-parchment-body">
                This document{' '}
                {contradicts.length > 0 && (
                  <>
                    <span className="font-semibold text-status-contradicted">contradicts</span>{' '}
                    {contradicts.join(', ')}
                  </>
                )}
                {contradicts.length > 0 && supports.length > 0 && '; '}
                {supports.length > 0 && (
                  <>
                    <span className="font-semibold text-status-supported">supports</span>{' '}
                    {supports.join(', ')}
                  </>
                )}
                {links.length === 0 && 'bears on no pleaded allegation above threshold.'}
                {(contradicts.length > 0 || supports.length > 0) && '.'}
              </p>
            </div>
          )}

          <button
            onClick={() => {
              const top = links[0]
              setEvidenceTarget({
                docId: sourceId,
                quote: top?.quote ?? '',
                relation: top?.relation ?? 'neutral',
                claimLabel: top ? claimsById.get(top.claimId)?.label : undefined,
                rationale: top?.rationale,
              })
            }}
            className="mt-4 flex items-center gap-1.5 rounded-panel border border-ink-line px-3 py-2 font-sans text-[12px] font-medium text-parchment-muted transition-colors hover:border-gold-dim/50 hover:text-parchment-body"
          >
            Open source document
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8 H12 M9 5 L12 8 L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {building && <div className="mt-4"><BuildingPanel stats={stats} liveScore={liveScore} /></div>}
      </section>

      {/* Edges forming to the claims it judges */}
      <section>
        <ColumnLabel
          n={links.length}
          shown={shown}
          label="Allegations this exhibit judges"
        />
        <div className="mt-3 space-y-2.5">
          {links.map((edge, i) => {
            const claim = claimsById.get(edge.claimId)
            if (!claim) return null
            const visible = i < shown
            const relColor = relationColor(edge.relation)
            return (
              <button
                key={edge.id}
                onClick={() =>
                  setEvidenceTarget({
                    docId: sourceId,
                    quote: edge.quote,
                    relation: edge.relation,
                    claimLabel: claim.label,
                    rationale: edge.rationale,
                  })
                }
                className={cn(
                  'block w-full rounded-panel border bg-ink-panel/70 px-3.5 py-3 text-left transition-all hover:bg-ink-raised',
                  visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
                )}
                style={{ borderColor: `${relColor}55`, boxShadow: `inset 3px 0 0 ${relColor}`, transitionDuration: '380ms' }}
              >
                <div className="flex items-center gap-2">
                  <RelationGlyph relation={edge.relation} color={relColor} />
                  <span className="font-sans text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: relColor }}>
                    {edge.relation === 'contradicts' ? 'Contradicts' : 'Supports'} {claim.label}
                  </span>
                  <span className="font-mono text-[9.5px] text-parchment-muted/70">{Math.round(edge.confidence * 100)}%</span>
                </div>
                <p className="mt-1 font-serif text-[12.5px] leading-snug text-parchment-body line-clamp-1">
                  {claim.text}
                </p>
                <p className="mt-1 font-mono text-[10.5px] italic text-parchment-muted line-clamp-1">
                  &ldquo;{edge.quote}&rdquo;
                </p>
              </button>
            )
          })}
        </div>
      </section>

      <EvidenceViewer
        caseId={caseId}
        analysisId={liveId ?? undefined}
        target={evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
      />
    </div>
  )
}

// ── Ingest beat ──────────────────────────────────────────────────────────────

/** The 4 exhibit PDFs the ingest beat can process. */
const INGEST_DOCS = [
  { id: 'D07', title: 'Change Order No. 3' },
  { id: 'D08', title: 'Phase-1 UAT Acceptance Certificate' },
  { id: 'D09', title: 'Email — go-live decision' },
  { id: 'D19', title: 'Expert report — Dr Whitfield (IT)' },
] as const

type IngestDocId = (typeof INGEST_DOCS)[number]['id']

type IngestPhase = 'idle' | 'uploading' | 'extracting' | 'done' | 'unconfigured' | 'error'

/**
 * IngestStage — send an exhibit PDF to Google Document AI and reveal the
 * extracted text with an animated pipeline beat.
 */
function IngestStage() {
  const [selected, setSelected] = useState<IngestDocId | null>(null)
  const [phase, setPhase] = useState<IngestPhase>('idle')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Auto-advance from 'uploading' to 'extracting' after a brief pause
  // so the two states are each visible.
  useEffect(() => {
    if (phase !== 'uploading') return
    const t = setTimeout(() => setPhase('extracting'), 1800)
    return () => clearTimeout(t)
  }, [phase])

  async function run(docId: IngestDocId) {
    setSelected(docId)
    setResult(null)
    setErrorMsg(null)
    setPhase('uploading')

    try {
      const data = await ingest(docId)
      setResult(data)
      setPhase('done')
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 503 || e.message?.includes('not configured')) {
        setPhase('unconfigured')
      } else {
        setErrorMsg(e.message ?? String(err))
        setPhase('error')
      }
    }
  }

  return (
    <div className="mx-auto mt-5 w-full max-w-[900px] animate-fade-rise">
      {/* Section header */}
      <div className="mb-6">
        <div className="eyebrow text-gold/70">Google Cloud Document AI</div>
        <h1 className="mt-1.5 font-serif text-[1.9rem] font-semibold leading-tight text-parchment">
          Ingest an exhibit
        </h1>
        <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-parchment-muted">
          Select one of the 4 exhibit PDFs. CasePulse will send the raw PDF bytes to Google
          Document AI, extract the full text, and return it for the analysis pipeline.
        </p>
        <p className="mt-3 border-t border-ink-line pt-3 font-mono text-[10.5px] text-parchment-muted/70">
          {DATASET_CASE} — <span className="text-parchment-muted">{GENERALIZES_LINE}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left: exhibit picker */}
        <section>
          <div className="eyebrow border-b border-ink-line pb-2">Choose an exhibit</div>
          <div className="mt-3 flex flex-col gap-2.5">
            {INGEST_DOCS.map((doc) => {
              const active = selected === doc.id
              const running = active && (phase === 'uploading' || phase === 'extracting')
              return (
                <button
                  key={doc.id}
                  onClick={() => {
                    if (!running) run(doc.id)
                  }}
                  disabled={running}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-panel border px-3.5 py-3.5 text-left transition-all',
                    active
                      ? 'border-gold/50 bg-gold/[0.06]'
                      : 'border-ink-line bg-ink-panel/70 hover:border-gold-dim/50 hover:bg-ink-raised',
                    running && 'cursor-wait',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold transition-colors',
                      active ? 'bg-gold/20 text-gold' : 'bg-ink-raised text-parchment-muted group-hover:bg-gold/10 group-hover:text-gold',
                    )}
                  >
                    {doc.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block font-serif text-[13.5px] font-medium leading-snug text-parchment-body">
                      {doc.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-parchment-muted/70">
                      PDF · exhibit bundle
                    </span>
                  </div>
                  {running && (
                    <span className="mt-1 inline-flex shrink-0 gap-0.5" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="inline-block h-1 w-1 animate-pulse rounded-full bg-gold"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </span>
                  )}
                  {active && phase === 'done' && (
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-status-supported" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Pipeline feed affordance */}
          <div className="mt-5 rounded-panel border border-dashed border-ink-line bg-ink/30 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-gold/70">
                <path d="M3 8 H12 M9 5 L12 8 L9 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-muted">
                Feeds the analysis pipeline
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-parchment-muted/75">
              Extracted text flows into chunk indexing → vector retrieval → claim–evidence
              cross-examination. Ingest is the first step of the real pipeline.
            </p>
          </div>
        </section>

        {/* Right: status + result panel */}
        <section>
          <div className="eyebrow border-b border-ink-line pb-2">Extraction result</div>
          <div className="mt-3">
            {phase === 'idle' && (
              <div className="flex h-48 items-center justify-center rounded-panel border border-dashed border-ink-line bg-ink-panel/40">
                <p className="font-sans text-[13px] text-parchment-muted/60">
                  Select an exhibit to begin
                </p>
              </div>
            )}

            {(phase === 'uploading' || phase === 'extracting') && (
              <div className="rounded-panel border border-gold/30 bg-gold/[0.04] px-5 py-5 animate-fade-rise">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-gold">
                      <path d="M8 2 V9 M8 9 L5 6.5 M8 9 L11 6.5 M2 13 H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="font-sans text-[13px] font-semibold text-parchment">
                      {phase === 'uploading'
                        ? 'Uploading to Google Document AI…'
                        : 'Extracting text…'}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-parchment-muted/80">
                      {phase === 'uploading'
                        ? 'Sending PDF bytes to the Document AI process endpoint'
                        : 'Document AI is parsing the PDF layout and extracting content'}
                    </div>
                  </div>
                </div>
                {/* Animated progress bar */}
                <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-ink-line">
                  <div
                    className={cn(
                      'h-full rounded-full bg-gold transition-all duration-[1800ms] ease-out',
                      phase === 'uploading' ? 'w-[30%]' : 'w-[85%]',
                    )}
                  />
                </div>
                <div className="mt-2 font-mono text-[9.5px] text-parchment-muted/60">
                  {selected && INGEST_DOCS.find((d) => d.id === selected)?.title}
                </div>
              </div>
            )}

            {phase === 'done' && result && (
              <div className="animate-fade-rise">
                {/* Attribution caption */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-supported" />
                    <span className="font-sans text-[11px] font-semibold text-status-supported">
                      Extracted by Google Cloud Document AI
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-parchment-muted/70 tabular-nums">
                    {result.charCount.toLocaleString()} chars
                  </span>
                </div>

                {/* Extracted text panel */}
                <div className="relative max-h-[480px] overflow-hidden rounded-panel border border-status-supported/20 bg-ink-panel/80">
                  <span className="pointer-events-none absolute inset-y-5 left-0 w-px bg-gradient-to-b from-status-supported/30 via-status-supported/05 to-transparent" />
                  <div className="h-full max-h-[480px] overflow-y-auto px-5 py-4">
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.75] text-parchment-body/90">
                      {result.text}
                    </pre>
                  </div>
                  {/* Fade out at bottom */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-panel to-transparent" />
                </div>

                <div className="mt-2 font-mono text-[10px] text-parchment-muted/60">
                  {result.docId} · {result.title}
                </div>
              </div>
            )}

            {phase === 'unconfigured' && (
              <div className="rounded-panel border border-ink-line bg-ink-panel/60 px-5 py-6 animate-fade-rise">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-dim/40 bg-ink-raised">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="text-gold-dim">
                      <path d="M8 5 V8.5 M8 10.5 V11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                  <div>
                    <div className="font-serif text-[1rem] font-semibold text-parchment">
                      Connect Google Cloud to run live extraction
                    </div>
                    <p className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-parchment-muted">
                      This worker is not yet wired to a Google Cloud project. Once
                      the controller provisions a service-account key and a Document AI
                      processor, extraction will run live here.
                    </p>
                    <div className="mt-3 space-y-1 font-mono text-[10.5px] text-parchment-muted/70">
                      <div>
                        <span className="text-gold/70">GCP_SA_KEY</span>
                        {' '}— service-account JSON (set as a secret)
                      </div>
                      <div>
                        <span className="text-gold/70">GCP_DOCAI_PROCESSOR</span>
                        {' '}— projects/{'{num}'}/locations/{'{loc}'}/processors/{'{id}'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === 'error' && errorMsg && (
              <div className="rounded-panel border border-status-contradicted/40 bg-status-contradicted/[0.07] px-5 py-4 animate-fade-rise">
                <div className="font-sans text-[12.5px] font-semibold text-status-contradicted">
                  Extraction failed
                </div>
                <p className="mt-1 font-mono text-[10.5px] text-parchment-muted/80 break-words">
                  {errorMsg.slice(0, 400)}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Done CTAs ────────────────────────────────────────────────────────────────
function DoneCtas({
  onDashboard,
  onSection,
  live,
}: {
  onDashboard: () => void
  onSection: (s: string) => void
  live: boolean
}) {
  return (
    <div className="mt-8 animate-fade-rise border-t border-ink-line pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow text-gold/70">{live ? 'Live analysis ready' : 'Analysis ready'}</div>
          <h2 className="mt-1 font-serif text-[1.5rem] font-semibold text-parchment">
            Explore the adjudicated case
          </h2>
        </div>
        <button
          onClick={onDashboard}
          className="group flex items-center gap-2 rounded-panel bg-gradient-to-b from-gold to-gold-deep px-5 py-3 font-sans text-[14px] font-semibold text-ink transition-all hover:brightness-105"
        >
          Open the dashboard
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform group-hover:translate-x-0.5">
            <path d="M3 8 H12 M9 5 L12 8 L9 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ExploreCard
          title="The pleading, x-rayed"
          body="Every clause highlighted by proof-status; hover a crimson span for the kill-shot."
          onClick={() => onSection('pleading')}
        />
        <ExploreCard
          title="The case graph"
          body="Neo4j force-graph with GDS overlays — centrality, communities, evidence gaps."
          onClick={() => onSection('graph')}
        />
        <ExploreCard
          title="Opposing counsel"
          body="The red-team memo: how the other side cross-examines your weakest claims."
          onClick={() => onSection('redteam')}
        />
      </div>
    </div>
  )
}

function ExploreCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-panel border border-ink-line bg-ink-panel/60 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold-dim/50"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-[1.05rem] font-semibold text-parchment">{title}</h3>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-parchment-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100">
          <path d="M3 8 H12 M9 5 L12 8 L9 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-parchment-muted">{body}</p>
    </button>
  )
}

// ── shared bits ──────────────────────────────────────────────────────────────
function RelationGlyph({ relation, color }: { relation: Relation; color: string }) {
  if (relation === 'contradicts') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="mt-0.5 shrink-0" style={{ color }}>
        <path d="M6 2 V10 M6 10 L3 7 M6 10 L9 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (relation === 'supports') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="mt-0.5 shrink-0" style={{ color }}>
        <path d="M6 10 V2 M6 2 L3 5 M6 2 L9 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return null
}

function labelNum(label: string): number {
  const m = label.match(/\d+/)
  return m ? parseInt(m[0], 10) : 999
}

/** Top judged edge per claim: highest-confidence contradiction, else support. */
function topEdges(graph: CaseGraph | undefined): Map<string, { edge: Edge; title: string }> {
  const m = new Map<string, { edge: Edge; title: string }>()
  if (!graph) return m
  const titleById = new Map(graph.evidence.map((e) => [e.id, e.title]))
  for (const c of graph.claims) {
    const es = graph.edges.filter((e) => e.claimId === c.id && e.relation !== 'neutral')
    if (es.length === 0) continue
    const top = [...es].sort((a, b) => {
      const r = (x: Edge) => (x.relation === 'contradicts' ? 1 : 0)
      if (r(a) !== r(b)) return r(b) - r(a)
      return b.confidence - a.confidence
    })[0]
    m.set(c.id, { edge: top, title: titleById.get(top.documentId) ?? top.documentId })
  }
  return m
}
