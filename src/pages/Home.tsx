import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCases, usePleading, useGraph, useStats } from '../hooks/queries'
import { CaseHeader } from '../components/CaseHeader'
import { Panel } from '../components/ui/Panel'
import { DATASET_CASE, GENERALIZES_LINE } from '../lib/framing'
import { STATUS_HEX } from '../lib/status'
import { cn } from '../lib/cn'

const DEFAULT_CASE = 'meridian'

/**
 * The entry flow, reframed as a confident "case file" rather than an input
 * form. No free-text textarea, no upload: the demo runs on the curated
 * Meridian bundle. The reader is presented with the matter, a synopsis, a
 * read-only Particulars preview, and a source to stress-test — then sent into
 * the Extraction Lab (the cinematic run) or straight to the results.
 */
export default function Home() {
  const navigate = useNavigate()
  const caseId = DEFAULT_CASE
  const { data: cases } = useCases()
  const summary = cases?.find((c) => c.id === caseId) ?? cases?.[0]
  const { data: pleading } = usePleading(caseId)
  const { data: graph } = useGraph(caseId)
  const { data: stats } = useStats(caseId)

  // Source to stress-test: the pleading (default) or a specific exhibit.
  const [source, setSource] = useState<string>('pleading')

  function toLab() {
    const q = source === 'pleading' ? '' : `?source=${encodeURIComponent(source)}`
    navigate(`/case/${caseId}/lab${q}`)
  }
  function toDashboard() {
    navigate(`/case/${caseId}/dashboard`)
  }

  const claimCount = graph?.claims.length ?? 13
  const evidenceCount = graph?.evidence.length ?? 18
  const contradicted = stats?.contradicted ?? 8
  const score = stats?.overallScore ?? 28

  return (
    <div className="min-h-screen px-10 py-12 lg:px-16 xl:px-24">
      {/* Eyebrow + framing */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-panel/60 px-3 py-1 font-mono text-[11px] text-parchment-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/80" aria-hidden />
          Litigation stress-test · curated bundle
        </span>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:gap-14">
        {/* ── Left: the case file ─────────────────────────────────────── */}
        <section className="order-2 lg:order-1">
          {/* Masthead */}
          <div className="border-b border-ink-line pb-6">
            {summary ? (
              <CaseHeader summary={summary} />
            ) : (
              <h1 className="font-serif text-[1.7rem] font-semibold text-parchment">{DATASET_CASE}</h1>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] text-parchment-muted">
              <span>{summary?.parties ?? 'Claimant v Defendant'}</span>
            </div>
          </div>

          {/* Synopsis */}
          <div className="relative mt-7 max-w-[64ch]">
            <span className="absolute -left-4 top-1.5 hidden h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-gold/40 via-gold/10 to-transparent sm:block" />
            <div className="eyebrow mb-2 text-gold/70">The matter</div>
            <p className="font-serif text-[16px] leading-[1.85] text-parchment-body [text-wrap:pretty]">
              A £2.4m cloud platform build gone wrong. Meridian sues for late
              delivery, defects and lost profit; TechFlow says the timetable
              slipped because Meridian itself demanded an out-of-scope loyalty
              module and overruled written advice to defer go-live. Crucible
              reads the Particulars of Claim, judges every pleaded allegation
              against the {evidenceCount}-document bundle, and surfaces where
              the case is built on the client&rsquo;s <Em c={STATUS_HEX.contradicted}>own contradicting evidence</Em>.
            </p>
          </div>

          {/* The result, previewed honestly (this is real analysis output) */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(claimCount)} label="Allegations" />
            <Stat value={String(evidenceCount)} label="Exhibits" />
            <Stat value={String(contradicted)} label="Contradicted" color={STATUS_HEX.contradicted} />
            <Stat value={`${score}`} suffix="/100" label="Trial-readiness" color={STATUS_HEX.contradicted} />
          </div>

          {/* Read-only Particulars preview */}
          <div className="mt-8">
            <div className="mb-2 flex items-end justify-between">
              <div className="eyebrow">Particulars of Claim — from the bundle</div>
              <span className="font-mono text-[10.5px] text-parchment-muted/70">read-only</span>
            </div>
            <Panel flush className="relative overflow-hidden">
              <div className="max-h-[240px] overflow-hidden px-6 py-5">
                <pre className="whitespace-pre-wrap break-words font-serif text-[13.5px] leading-[1.8] text-parchment-body/90">
                  {previewOf(pleading?.fullText)}
                </pre>
              </div>
              {/* fade-out + lock affordance: this is not editable */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center bg-gradient-to-t from-ink-panel via-ink-panel/80 to-transparent pb-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-parchment-muted/80">
                  <LockGlyph /> source document · stress-tested verbatim in the Lab
                </span>
              </div>
            </Panel>
          </div>
        </section>

        {/* ── Right: the actions ──────────────────────────────────────── */}
        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-12">
            {/* Hero line */}
            <h2 className="font-serif text-[2.6rem] font-semibold leading-[1.04] text-parchment xl:text-[3rem]">
              Put this pleading
              <br />
              <span className="italic text-gold">to the fire.</span>
            </h2>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-parchment-muted">
              Watch a source document become claims, evidence links and verdicts
              — then explore the adjudicated case.
            </p>

            {/* Source selector */}
            <div className="mt-7">
              <div className="eyebrow mb-2">Stress-test which source</div>
              <SourcePicker
                value={source}
                onChange={setSource}
                evidence={graph?.evidence ?? []}
              />
            </div>

            {/* Primary + secondary CTAs */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={toLab}
                className={cn(
                  'group relative w-full overflow-hidden rounded-panel px-5 py-4 font-sans text-[15px] font-semibold tracking-wide text-ink transition-all duration-200',
                  'bg-gradient-to-b from-gold to-gold-deep',
                  'hover:shadow-[0_10px_36px_-10px_rgba(224,168,106,0.6)] hover:brightness-[1.06]',
                )}
              >
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  Stress-test the case
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                    <path d="M3 8 H12 M9 5 L12 8 L9 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {/* subtle sweep */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </button>

              <button
                onClick={toDashboard}
                className="w-full rounded-panel border border-ink-line px-5 py-3 font-sans text-[13px] font-medium text-parchment-muted transition-colors hover:border-gold-dim/50 hover:text-parchment-body"
              >
                Skip to results
              </button>
            </div>

            {/* Framing */}
            <div className="mt-7 rounded-panel border border-ink-line bg-ink-panel/50 px-4 py-3.5">
              <p className="font-serif text-[12.5px] italic leading-snug text-parchment-body">
                {DATASET_CASE}
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-parchment-muted/85">
                {GENERALIZES_LINE} The /api/analyze pipeline accepts any pleading
                text; this demo runs the curated bundle for reliability.
              </p>
            </div>

            {/* Pipeline at a glance */}
            <div className="mt-7 space-y-3 border-t border-ink-line pt-5">
              <Bullet n="01" label="Extract" body="Every pleaded proposition isolated and mapped to its paragraph." />
              <Bullet n="02" label="Retrieve & judge" body="High-recall search over the bundle, then an LLM-judge with abstention." />
              <Bullet n="03" label="Score & attack" body="Trial-readiness, the risk register, and an opposing-counsel memo." />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** First ~12 lines of the pleading, skipping the docket header block. */
function previewOf(text: string | undefined): string {
  if (!text) return 'Loading the Particulars of Claim…'
  const idx = text.indexOf('The parties')
  const body = idx >= 0 ? text.slice(idx) : text
  return body.split('\n').slice(0, 14).join('\n').trim()
}

function Em({ c, children }: { c: string; children: React.ReactNode }) {
  return (
    <span className="font-medium" style={{ color: c }}>
      {children}
    </span>
  )
}

function Stat({
  value,
  suffix,
  label,
  color,
}: {
  value: string
  suffix?: string
  label: string
  color?: string
}) {
  return (
    <div className="rounded-panel border border-ink-line bg-ink-panel/50 px-3.5 py-3">
      <div className="flex items-baseline">
        <span
          className="font-serif text-[1.9rem] font-semibold leading-none tabular-nums"
          style={{ color: color ?? '#ECE7DA' }}
        >
          {value}
        </span>
        {suffix && <span className="ml-0.5 font-serif text-sm text-parchment-muted">{suffix}</span>}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-parchment-muted">
        {label}
      </div>
    </div>
  )
}

function SourcePicker({
  value,
  onChange,
  evidence,
}: {
  value: string
  onChange: (v: string) => void
  evidence: { id: string; title: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-panel border border-ink-line bg-ink/60 py-2.5 pl-3 pr-9 font-sans text-[13px] text-parchment-body outline-none transition-colors hover:border-gold-dim/60 focus:border-gold/70"
      >
        <option value="pleading" className="bg-ink-panel">
          Particulars of Claim — extract & judge all 13 allegations
        </option>
        <optgroup label="Classify a single exhibit" className="bg-ink-panel">
          {evidence.map((e) => (
            <option key={e.id} value={e.id} className="bg-ink-panel">
              {e.id} — {e.title}
            </option>
          ))}
        </optgroup>
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-parchment-muted"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4 5 V3.6 A2 2 0 0 1 8 3.6 V5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function Bullet({ n, label, body }: { n: string; label: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-[1px] font-mono text-[11px] text-gold/70">{n}</span>
      <div>
        <div className="font-sans text-[13px] font-semibold text-parchment">{label}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-parchment-muted">{body}</p>
      </div>
    </div>
  )
}
