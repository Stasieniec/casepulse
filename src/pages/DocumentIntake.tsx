import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CaseGraph, Edge } from '../../shared/types'
import { useGraph } from '../hooks/queries'
import { ingest, type IngestResult } from '../api'
import { EvidenceViewer, type EvidenceTarget } from '../components/EvidenceViewer'
import { StatusPill } from '../components/ui/StatusPill'
import { STATUS_HEX, relationColor, statusTint } from '../lib/status'
import { DATASET_CASE, GENERALIZES_LINE } from '../lib/framing'
import { prefersReducedMotion } from '../hooks/useCountUp'
import { cn } from '../lib/cn'

// ── Constants ─────────────────────────────────────────────────────────────────

const INGEST_DOCS = [
  { id: 'D07', title: 'Change Order No. 3' },
  { id: 'D08', title: 'Phase-1 UAT Acceptance Certificate' },
  { id: 'D09', title: 'Email — go-live decision' },
  { id: 'D19', title: 'Expert report — Dr Whitfield (IT)' },
] as const

type IngestDocId = (typeof INGEST_DOCS)[number]['id']
type IngestPhase = 'idle' | 'uploading' | 'extracting' | 'done' | 'unconfigured' | 'error'
type SimPhase = 'idle' | 'propositions' | 'nodes' | 'linking' | 'done'

// ── Page ──────────────────────────────────────────────────────────────────────

interface DocumentIntakeProps {
  caseId: string
  analysisId?: string
}

export default function DocumentIntake({ caseId, analysisId }: DocumentIntakeProps) {
  const navigate = useNavigate()
  const { data: graph } = useGraph(caseId, analysisId)

  // Ingest state
  const [selected, setSelected] = useState<IngestDocId | null>(null)
  const [ingestPhase, setIngestPhase] = useState<IngestPhase>('idle')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Simulation state
  const [simPhase, setSimPhase] = useState<SimPhase>('idle')
  const [shownProps, setShownProps] = useState(0)
  const simTimers = useRef<number[]>([])

  // EvidenceViewer state
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null)

  // Auto-advance uploading → extracting
  useEffect(() => {
    if (ingestPhase !== 'uploading') return
    const t = window.setTimeout(() => setIngestPhase('extracting'), 1800)
    return () => window.clearTimeout(t)
  }, [ingestPhase])

  // Consolidated simulation trigger: fires for both 'done' and 'unconfigured' states.
  // 'done' uses the freshly-extracted text (confirmed pipeline step).
  // 'unconfigured' still shows the simulation using the real seed graph edges
  // — demonstrating the graph structure even without live GCP credentials.
  useEffect(() => {
    const shouldSim = ingestPhase === 'done' || ingestPhase === 'unconfigured'
    if (!shouldSim || !selected || !graph || simPhase !== 'idle') return

    simTimers.current.forEach(window.clearTimeout)
    simTimers.current = []
    setShownProps(0)

    const reduced = prefersReducedMotion()
    const docEdges = graph.edges.filter(
      (e) => e.documentId === selected && e.relation !== 'neutral',
    )
    if (docEdges.length === 0) return

    if (reduced) {
      setShownProps(docEdges.length)
      setSimPhase('done')
      return
    }

    // Beat 1: detecting propositions — cards appear one by one
    const t1 = window.setTimeout(() => {
      setSimPhase('propositions')
      docEdges.forEach((_, i) => {
        const t = window.setTimeout(() => setShownProps(i + 1), i * 280)
        simTimers.current.push(t)
      })
    }, 400)
    simTimers.current.push(t1)

    // Beat 2: creating nodes
    const propsDur = 400 + docEdges.length * 280 + 600
    const t2 = window.setTimeout(() => setSimPhase('nodes'), propsDur)
    simTimers.current.push(t2)

    // Beat 3: linking to case
    const t3 = window.setTimeout(() => setSimPhase('linking'), propsDur + 1000)
    simTimers.current.push(t3)

    // Beat 4: done
    const t4 = window.setTimeout(() => setSimPhase('done'), propsDur + 2800)
    simTimers.current.push(t4)

    return () => simTimers.current.forEach(window.clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestPhase, selected, graph])

  async function run(docId: IngestDocId) {
    setSelected(docId)
    setResult(null)
    setErrorMsg(null)
    setSimPhase('idle')
    setShownProps(0)
    simTimers.current.forEach(window.clearTimeout)
    setIngestPhase('uploading')

    try {
      const data = await ingest(docId)
      setResult(data)
      setIngestPhase('done')
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 503 || e.message?.includes('not configured')) {
        setIngestPhase('unconfigured')
      } else {
        setErrorMsg(e.message ?? String(err))
        setIngestPhase('error')
      }
    }
  }

  const docEdges = useMemo(() => {
    if (!selected || !graph) return []
    return graph.edges
      .filter((e) => e.documentId === selected && e.relation !== 'neutral')
      .sort((a, b) => {
        const r = (x: Edge) => (x.relation === 'contradicts' ? 1 : 0)
        if (r(a) !== r(b)) return r(b) - r(a)
        return b.confidence - a.confidence
      })
  }, [selected, graph])

  const claimsById = useMemo(() => {
    const m = new Map<string, CaseGraph['claims'][number]>()
    graph?.claims.forEach((c) => m.set(c.id, c))
    return m
  }, [graph])

  const docInfo = INGEST_DOCS.find((d) => d.id === selected)

  return (
    <div className="px-0 py-0">
      {/* Framing banner */}
      <div className="mb-8 rounded-panel border border-gold/20 bg-gold/[0.04] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="text-gold">
              <path d="M8 2 V10 M8 10 L5 7.5 M8 10 L11 7.5 M2.5 13 H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-gold/80">Document Intake — pipeline entry point</div>
            <p className="mt-1 font-serif text-[13.5px] leading-relaxed text-parchment-body">
              Not the core of CasePulse — but every bundle starts somewhere. This is how a raw PDF
              is ingested and turned into graph nodes. In this demo/MVP we operate on the provided
              Meridian dataset; this page is a worked example of{' '}
              <em>upload &amp; initial processing</em>.
            </p>
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-parchment-muted/80">
              Upload → Google Cloud Document AI text extraction → proposition detection → node
              creation → linked into the case graph.
            </p>
          </div>
        </div>
        <div className="mt-3 border-t border-gold/10 pt-3 font-mono text-[10px] text-parchment-muted/60">
          {DATASET_CASE} — <span>{GENERALIZES_LINE}</span>
        </div>
      </div>

      {/* Step 1: Upload & Extract */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 bg-gold/10 font-mono text-[11px] font-semibold text-gold">
          1
        </span>
        <h2 className="font-serif text-[1.1rem] font-semibold text-parchment">Upload &amp; extract</h2>
        <span className="eyebrow text-parchment-muted/60">Google Cloud Document AI</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Exhibit picker */}
        <section>
          <div className="eyebrow border-b border-ink-line pb-2">Choose an exhibit PDF</div>
          <div className="mt-3 flex flex-col gap-2.5">
            {INGEST_DOCS.map((doc) => {
              const active = selected === doc.id
              const running = active && (ingestPhase === 'uploading' || ingestPhase === 'extracting')
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
                      active
                        ? 'bg-gold/20 text-gold'
                        : 'bg-ink-raised text-parchment-muted group-hover:bg-gold/10 group-hover:text-gold',
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
                  {active && ingestPhase === 'done' && (
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-status-supported" />
                  )}
                </button>
              )
            })}
          </div>

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

        {/* Extraction result panel */}
        <section>
          <div className="eyebrow border-b border-ink-line pb-2">Extraction result</div>
          <div className="mt-3">
            {ingestPhase === 'idle' && (
              <div className="flex h-48 items-center justify-center rounded-panel border border-dashed border-ink-line bg-ink-panel/40">
                <p className="font-sans text-[13px] text-parchment-muted/60">Select an exhibit to begin</p>
              </div>
            )}

            {(ingestPhase === 'uploading' || ingestPhase === 'extracting') && (
              <div className="rounded-panel border border-gold/30 bg-gold/[0.04] px-5 py-5 animate-fade-rise">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-gold">
                      <path d="M8 2 V9 M8 9 L5 6.5 M8 9 L11 6.5 M2 13 H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="font-sans text-[13px] font-semibold text-parchment">
                      {ingestPhase === 'uploading'
                        ? 'Uploading to Google Document AI…'
                        : 'Extracting text…'}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-parchment-muted/80">
                      {ingestPhase === 'uploading'
                        ? 'Sending PDF bytes to the Document AI process endpoint'
                        : 'Document AI is parsing the PDF layout and extracting content'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-ink-line">
                  <div
                    className={cn(
                      'h-full rounded-full bg-gold transition-all duration-[1800ms] ease-out',
                      ingestPhase === 'uploading' ? 'w-[30%]' : 'w-[85%]',
                    )}
                  />
                </div>
                <div className="mt-2 font-mono text-[9.5px] text-parchment-muted/60">
                  {selected && INGEST_DOCS.find((d) => d.id === selected)?.title}
                </div>
              </div>
            )}

            {ingestPhase === 'done' && result && (
              <div className="animate-fade-rise">
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
                <div className="relative max-h-[320px] overflow-hidden rounded-panel border border-status-supported/20 bg-ink-panel/80">
                  <span className="pointer-events-none absolute inset-y-5 left-0 w-px bg-gradient-to-b from-status-supported/30 via-status-supported/05 to-transparent" />
                  <div className="h-full max-h-[320px] overflow-y-auto px-5 py-4">
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.75] text-parchment-body/90">
                      {result.text}
                    </pre>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-panel to-transparent" />
                </div>
                <div className="mt-2 font-mono text-[10px] text-parchment-muted/60">
                  {result.docId} · {result.title}
                </div>
              </div>
            )}

            {ingestPhase === 'unconfigured' && (
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
                      This worker is not yet wired to a Google Cloud project. Once the controller
                      provisions a service-account key and a Document AI processor, extraction will
                      run live here.
                    </p>
                    <div className="mt-3 space-y-1 font-mono text-[10.5px] text-parchment-muted/70">
                      <div>
                        <span className="text-gold/70">GCP_SA_KEY</span>
                        {' '}— service-account JSON (set as a secret)
                      </div>
                      <div>
                        <span className="text-gold/70">GCP_DOCAI_PROCESSOR</span>
                        {' '}— projects/&#123;num&#125;/locations/&#123;loc&#125;/processors/&#123;id&#125;
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {ingestPhase === 'error' && errorMsg && (
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

      {/* Step 2: Graph simulation — shown after extraction result or unconfigured message */}
      {(ingestPhase === 'done' || ingestPhase === 'unconfigured') && simPhase !== 'idle' && selected && (
        <GraphSimulation
          docId={selected}
          docTitle={docInfo?.title ?? selected}
          docEdges={docEdges}
          claimsById={claimsById}
          simPhase={simPhase}
          shownProps={shownProps}
          onOpenEvidence={(t) => setEvidenceTarget(t)}
          onGotoGraph={() => navigate(`/case/${caseId}/graph`)}
          onOpenSource={(docId, edge) =>
            setEvidenceTarget({
              docId,
              quote: edge?.quote ?? '',
              relation: edge?.relation ?? 'neutral',
              claimLabel: edge ? claimsById.get(edge.claimId)?.label : undefined,
              rationale: edge?.rationale,
            })
          }
        />
      )}

      <EvidenceViewer
        caseId={caseId}
        analysisId={analysisId}
        target={evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
      />
    </div>
  )
}

// ── GraphSimulation component ─────────────────────────────────────────────────

interface GraphSimulationProps {
  docId: string
  docTitle: string
  docEdges: Edge[]
  claimsById: Map<string, CaseGraph['claims'][number]>
  simPhase: SimPhase
  shownProps: number
  onOpenEvidence: (t: EvidenceTarget) => void
  onGotoGraph: () => void
  onOpenSource: (docId: string, edge?: Edge) => void
}

const SIM_PHASE_LABELS: Record<SimPhase, string> = {
  idle: '',
  propositions: 'Detecting propositions',
  nodes: 'Creating nodes',
  linking: 'Linking to the case',
  done: 'Ingestion complete',
}

function GraphSimulation({
  docId,
  docTitle,
  docEdges,
  claimsById,
  simPhase,
  shownProps,
  onOpenEvidence,
  onGotoGraph,
  onOpenSource,
}: GraphSimulationProps) {
  const contradictCount = docEdges.filter((e) => e.relation === 'contradicts').length
  const supportsCount = docEdges.filter((e) => e.relation === 'supports').length
  const linkedClaims = [...new Set(docEdges.map((e) => e.claimId))].length

  return (
    <div className="mt-10 animate-fade-rise">
      {/* Section divider */}
      <div className="mb-6 flex items-center gap-4 border-t border-ink-line pt-6">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 bg-gold/10 font-mono text-[11px] font-semibold text-gold">
          2
        </span>
        <h2 className="font-serif text-[1.1rem] font-semibold text-parchment">
          Process into the case graph
        </h2>
        <span className="eyebrow text-parchment-muted/60">
          worked example · real Meridian extracts
        </span>
      </div>

      {/* Stage rail */}
      <SimRail simPhase={simPhase} />

      {/* Phase content */}
      <div className="mt-6">
        {/* Beats 1–4: proposition cards + node chips + subgraph */}
        {(simPhase === 'propositions' ||
          simPhase === 'nodes' ||
          simPhase === 'linking' ||
          simPhase === 'done') && (
          <div>
            <div className="eyebrow mb-3 border-b border-ink-line pb-2">
              Propositions detected
              <span className="ml-2 font-mono text-[11px] tabular-nums text-gold">
                {Math.min(shownProps, docEdges.length)}/{docEdges.length}
              </span>
            </div>

            <div
              className={cn(
                'grid gap-2.5',
                simPhase === 'linking' || simPhase === 'done'
                  ? 'grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]'
                  : 'grid-cols-1',
              )}
            >
              {/* Left: proposition cards / node chips */}
              <div className="space-y-2">
                {docEdges.map((edge, i) => {
                  const claim = claimsById.get(edge.claimId)
                  const visible = i < shownProps
                  const isNode =
                    simPhase === 'nodes' || simPhase === 'linking' || simPhase === 'done'
                  const relColor = relationColor(edge.relation)

                  if (isNode) {
                    // Compact Extract node chip
                    return (
                      <div
                        key={edge.id}
                        className={cn(
                          'flex items-center gap-2.5 rounded-[3px] border px-3 py-2 transition-all duration-300',
                          visible ? 'opacity-100' : 'opacity-0',
                        )}
                        style={{
                          borderColor: `${relColor}55`,
                          boxShadow: `inset 3px 0 0 ${relColor}`,
                        }}
                      >
                        <span
                          className="shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide"
                          style={{ color: relColor, backgroundColor: `${relColor}18` }}
                        >
                          Extract
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] italic text-parchment-muted">
                          &ldquo;{edge.quote.slice(0, 80)}
                          {edge.quote.length > 80 ? '…' : ''}&rdquo;
                        </span>
                        {claim && (
                          <span
                            className="shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                            style={{
                              color: STATUS_HEX[claim.status],
                              backgroundColor: statusTint(claim.status, 0.12),
                            }}
                          >
                            {claim.label}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[9.5px] text-parchment-muted/60 tabular-nums">
                          {Math.round(edge.confidence * 100)}%
                        </span>
                      </div>
                    )
                  }

                  // Full proposition card (propositions beat)
                  return (
                    <button
                      key={edge.id}
                      onClick={() =>
                        onOpenEvidence({
                          docId,
                          quote: edge.quote,
                          relation: edge.relation,
                          claimLabel: claim?.label,
                          rationale: edge.rationale,
                        })
                      }
                      className={cn(
                        'block w-full rounded-panel border bg-ink-panel/70 px-3.5 py-3 text-left transition-all duration-300 hover:bg-ink-raised',
                        visible
                          ? 'translate-y-0 opacity-100'
                          : 'pointer-events-none translate-y-2 opacity-0',
                      )}
                      style={{
                        borderColor: `${relColor}55`,
                        boxShadow: `inset 3px 0 0 ${relColor}`,
                        transitionDelay: visible ? `${i * 40}ms` : '0ms',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="font-sans text-[10.5px] font-semibold uppercase tracking-wide"
                          style={{ color: relColor }}
                        >
                          {edge.relation === 'contradicts' ? 'Contradicts' : 'Supports'}
                          {claim && ` ${claim.label}`}
                        </span>
                        {claim && <StatusPill status={claim.status} className="scale-90" />}
                        <span className="font-mono text-[9.5px] text-parchment-muted/70 tabular-nums">
                          {Math.round(edge.confidence * 100)}%
                        </span>
                      </div>
                      {claim && (
                        <p className="mt-0.5 font-serif text-[12.5px] leading-snug text-parchment-body line-clamp-1">
                          {claim.text}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[10.5px] italic text-parchment-muted line-clamp-2">
                        &ldquo;{edge.quote}&rdquo;
                      </p>
                    </button>
                  )
                })}
              </div>

              {/* Right: animated subgraph diagram (linking + done only) */}
              {(simPhase === 'linking' || simPhase === 'done') && (
                <SubgraphDiagram
                  docId={docId}
                  docTitle={docTitle}
                  docEdges={docEdges}
                  claimsById={claimsById}
                  animate={simPhase === 'linking'}
                />
              )}
            </div>
          </div>
        )}

        {/* Done summary */}
        {simPhase === 'done' && (
          <div className="mt-6 rounded-panel border border-status-supported/30 bg-status-supported/[0.05] px-5 py-4 animate-fade-rise">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-status-supported" />
                  <span className="font-sans text-[12px] font-semibold text-status-supported">
                    Ingestion complete
                  </span>
                </div>
                <p className="mt-1.5 font-serif text-[14px] leading-relaxed text-parchment-body">
                  <span className="font-semibold text-parchment">{docTitle}:</span>{' '}
                  {docEdges.length} proposition{docEdges.length !== 1 ? 's' : ''} detected →{' '}
                  {docEdges.length} node{docEdges.length !== 1 ? 's' : ''} created → linked to{' '}
                  {linkedClaims} allegation{linkedClaims !== 1 ? 's' : ''}
                  {contradictCount > 0 && (
                    <span className="font-semibold text-status-contradicted">
                      {' '}
                      ({contradictCount} contradiction{contradictCount !== 1 ? 's' : ''})
                    </span>
                  )}
                  {supportsCount > 0 && (
                    <span className="font-semibold text-status-supported">
                      {' '}
                      · {supportsCount} support{supportsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  .
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenSource(docId, docEdges[0])}
                  className="rounded-panel border border-ink-line px-3.5 py-2 font-sans text-[12px] font-medium text-parchment-muted transition-colors hover:border-gold-dim/50 hover:text-parchment-body"
                >
                  Open source
                </button>
                <button
                  onClick={onGotoGraph}
                  className="flex items-center gap-1.5 rounded-panel bg-gradient-to-b from-gold to-gold-deep px-4 py-2 font-sans text-[12.5px] font-semibold text-ink transition-all hover:brightness-105"
                >
                  View in the full graph
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M3 8 H12 M9 5 L12 8 L9 11"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SimRail — phase progress indicator ────────────────────────────────────────

const SIM_PHASES: SimPhase[] = ['propositions', 'nodes', 'linking', 'done']

function SimRail({ simPhase }: { simPhase: SimPhase }) {
  const visiblePhases = SIM_PHASES.filter((p) => p !== 'done')
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {visiblePhases.map((p, i) => {
        const idx = SIM_PHASES.indexOf(p)
        const currentIdx = SIM_PHASES.indexOf(simPhase)
        const done = currentIdx > idx || simPhase === 'done'
        const active = simPhase === p
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
              {SIM_PHASE_LABELS[p]}
            </span>
            {i < visiblePhases.length - 1 && <span className="h-px w-3 bg-ink-line" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

// ── SubgraphDiagram — animated SVG showing Document → Extracts → Claims ───────

function SubgraphDiagram({
  docId,
  docTitle,
  docEdges,
  claimsById,
  animate,
}: {
  docId: string
  docTitle: string
  docEdges: Edge[]
  claimsById: Map<string, CaseGraph['claims'][number]>
  animate: boolean
}) {
  const uniqueClaimIds = [...new Set(docEdges.map((e) => e.claimId))]
  const maxExtract = Math.min(docEdges.length, 6)
  const maxClaims = Math.min(uniqueClaimIds.length, 6)

  const W = 420
  const H = 200
  const docX = W / 2
  const docY = 32
  const extractY = 100
  const claimY = 170

  const extractXs = docEdges.slice(0, maxExtract).map((_, i, arr) => {
    const total = arr.length
    return (W / (total + 1)) * (i + 1)
  })

  const claimXs = uniqueClaimIds.slice(0, maxClaims).map((_, i, arr) => {
    const total = arr.length
    return (W / (total + 1)) * (i + 1)
  })

  return (
    <div className="rounded-panel border border-ink-line bg-ink-panel/70 px-4 py-4 animate-fade-rise">
      <div className="eyebrow mb-3">Document subgraph</div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible"
        aria-label="Subgraph: document → extract nodes → claim nodes"
      >
        {/* Doc → Extract edges */}
        {extractXs.map((ex, i) => {
          const edge = docEdges[i]
          const col = edge ? relationColor(edge.relation) : '#5B6675'
          return (
            <line
              key={`doc-ex-${i}`}
              x1={docX}
              y1={docY + 10}
              x2={ex}
              y2={extractY - 8}
              stroke={col}
              strokeWidth="1.2"
              strokeOpacity="0.5"
              strokeDasharray={animate ? '60' : undefined}
              strokeDashoffset={animate ? '60' : undefined}
              style={
                animate
                  ? { animation: `dash-in 0.6s ease-out ${i * 100}ms forwards` }
                  : undefined
              }
            />
          )
        })}

        {/* Extract → Claim edges */}
        {docEdges.slice(0, maxExtract).map((edge, i) => {
          const claimIdx = uniqueClaimIds.indexOf(edge.claimId)
          if (claimIdx < 0 || claimIdx >= maxClaims) return null
          const col = relationColor(edge.relation)
          return (
            <line
              key={`ex-cl-${i}`}
              x1={extractXs[i]}
              y1={extractY + 8}
              x2={claimXs[claimIdx]}
              y2={claimY - 8}
              stroke={col}
              strokeWidth="1.2"
              strokeOpacity="0.5"
              strokeDasharray={animate ? '60' : undefined}
              strokeDashoffset={animate ? '60' : undefined}
              style={
                animate
                  ? { animation: `dash-in 0.6s ease-out ${200 + i * 100}ms forwards` }
                  : undefined
              }
            />
          )
        })}

        {/* Document node */}
        <rect
          x={docX - 38}
          y={docY - 10}
          width="76"
          height="20"
          rx="3"
          fill="#E0A86A22"
          stroke="#E0A86A88"
          strokeWidth="1"
        />
        <text
          x={docX}
          y={docY + 4}
          textAnchor="middle"
          fill="#E0A86A"
          fontSize="8"
          fontFamily="monospace"
          fontWeight="600"
        >
          {docId}
        </text>

        {/* Extract nodes */}
        {extractXs.map((ex, i) => {
          const edge = docEdges[i]
          const col = edge ? relationColor(edge.relation) : '#5B6675'
          return (
            <g key={`ex-node-${i}`}>
              <rect
                x={ex - 22}
                y={extractY - 8}
                width="44"
                height="16"
                rx="3"
                fill={`${col}18`}
                stroke={`${col}88`}
                strokeWidth="1"
              />
              <text
                x={ex}
                y={extractY + 4}
                textAnchor="middle"
                fill={col}
                fontSize="7"
                fontFamily="monospace"
                fontWeight="600"
              >
                Extract
              </text>
            </g>
          )
        })}

        {/* Claim nodes */}
        {uniqueClaimIds.slice(0, maxClaims).map((cId, i) => {
          const claim = claimsById.get(cId)
          const col = claim ? STATUS_HEX[claim.status] : '#5B6675'
          return (
            <g key={`cl-node-${i}`}>
              <rect
                x={claimXs[i] - 18}
                y={claimY - 8}
                width="36"
                height="16"
                rx="3"
                fill={`${col}18`}
                stroke={`${col}88`}
                strokeWidth="1"
              />
              <text
                x={claimXs[i]}
                y={claimY + 4}
                textAnchor="middle"
                fill={col}
                fontSize="7"
                fontFamily="monospace"
                fontWeight="600"
              >
                {claim?.label ?? cId.slice(0, 6)}
              </text>
            </g>
          )
        })}

        {/* Row labels */}
        <text x={docX + 42} y={docY + 4} fill="#8A93A3" fontSize="7.5" fontFamily="monospace">
          Document
        </text>
        <text x="2" y={extractY + 4} fill="#8A93A3" fontSize="7.5" fontFamily="monospace">
          Extracts
        </text>
        <text x="2" y={claimY + 4} fill="#8A93A3" fontSize="7.5" fontFamily="monospace">
          Claims
        </text>
      </svg>

      <p className="mt-2 font-mono text-[9.5px] text-parchment-muted/60">
        {docTitle} · {docEdges.length} extract node{docEdges.length !== 1 ? 's' : ''} →{' '}
        {uniqueClaimIds.length} claim{uniqueClaimIds.length !== 1 ? 's' : ''}
        {' · '}
        <span style={{ color: STATUS_HEX.contradicted }}>crimson = contradicts</span>
        {' · '}
        <span style={{ color: STATUS_HEX.well_supported }}>emerald = supports</span>
      </p>

      <style>{`
        @keyframes dash-in {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
