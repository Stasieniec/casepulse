import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCases, usePleading } from '../hooks/queries'
import { analyze } from '../api'
import { CaseSelector } from '../components/CaseSelector'
import { Processing } from '../components/Processing'
import { cn } from '../lib/cn'

const DEFAULT_CASE = 'meridian'

/** Available example pleadings to prefill the editor (just Meridian for now). */
const EXAMPLES = [{ id: 'meridian', label: 'Meridian v TechFlow — Particulars of Claim' }]

export default function Home() {
  const navigate = useNavigate()
  const { data: cases } = useCases()
  const [caseId, setCaseId] = useState(DEFAULT_CASE)
  const [example, setExample] = useState('meridian')
  const { data: pleading } = usePleading(example)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill the editor from the selected example pleading until the user edits.
  useEffect(() => {
    if (pleading?.fullText && !edited) setText(pleading.fullText)
  }, [pleading?.fullText, edited])

  /** "Use seed (instant)" — navigate directly to the seeded dashboard. */
  function onSeed() {
    navigate(`/case/${caseId}/dashboard`)
  }

  /** "Run live" — POST to the real pipeline, show processing animation, then navigate with analysisId. */
  async function onRunLive() {
    if (!text.trim()) return
    setError(null)
    setProcessing(true)
    try {
      const result = await analyze(caseId, text)
      navigate(`/case/${caseId}/dashboard?analysis=${encodeURIComponent(result.analysisId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProcessing(false)
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  // Processing screen — shown while the live API call is in-flight
  if (processing) {
    return (
      <div className="min-h-screen px-10 py-12 lg:px-16 xl:px-24">
        <header className="mb-8 max-w-3xl">
          <div className="eyebrow mb-4 text-gold/80">The crucible · live analysis running</div>
          <h1 className="font-serif text-[2rem] font-semibold leading-[1.1] text-parchment">
            Putting your pleading
            <br />
            <span className="italic text-gold">to the fire…</span>
          </h1>
        </header>
        <Processing onCancel={() => setProcessing(false)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-10 py-12 lg:px-16 xl:px-24">
      {/* Masthead */}
      <header className="mb-10 max-w-3xl">
        <div className="eyebrow mb-4 text-gold/80">The crucible · case theory under heat</div>
        <h1 className="font-serif text-[2.9rem] font-semibold leading-[1.05] text-parchment lg:text-[3.4rem]">
          Put your pleading
          <br />
          <span className="italic text-gold">to the fire.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-parchment-body">
          Crucible maps every allegation in a statement of case against the litigation
          bundle — marking each as <Em c="#2FBF8F">supported</Em>, <Em c="#E5484D">contradicted</Em>,
          or an <Em c="#D9772B">evidence gap</Em> — scores trial-readiness, and plays opposing
          counsel against your own file before the other side does.
        </p>
      </header>

      {/* Two-column editorial layout: editor (wide) + controls (narrow) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Pleading editor */}
        <section className="order-2 lg:order-1">
          <div className="mb-2 flex items-end justify-between">
            <label htmlFor="pleading" className="eyebrow">
              Statement of case
            </label>
            <span className="font-mono text-[11px] text-parchment-muted">
              {wordCount.toLocaleString()} words
            </span>
          </div>
          <div className="relative rounded-panel border border-ink-line bg-ink-panel/70 focus-within:border-gold-dim/70 transition-colors">
            <textarea
              id="pleading"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setEdited(true)
              }}
              spellCheck={false}
              placeholder="Paste the Particulars of Claim, Defence, or any statement of case…"
              className="h-[58vh] min-h-[420px] w-full resize-none rounded-panel bg-transparent px-6 py-5 font-serif text-[15px] leading-[1.75] text-parchment-body outline-none placeholder:text-parchment-muted/50"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-panel bg-gradient-to-t from-ink-panel to-transparent" />
          </div>
        </section>

        {/* Controls column */}
        <aside className="order-1 flex flex-col gap-6 lg:order-2">
          <div>
            <div className="eyebrow mb-2">Matter</div>
            <CaseSelector cases={cases ?? []} value={caseId} onChange={setCaseId} />
          </div>

          <div>
            <div className="eyebrow mb-2">Example pleading</div>
            <div className="relative">
              <select
                value={example}
                onChange={(e) => {
                  setExample(e.target.value)
                  setEdited(false)
                }}
                className="w-full appearance-none rounded-panel border border-ink-line bg-ink/60 py-2 pl-3 pr-8 font-sans text-[13px] text-parchment-body outline-none transition-colors hover:border-gold-dim/60 focus:border-gold/70"
              >
                {EXAMPLES.map((e) => (
                  <option key={e.id} value={e.id} className="bg-ink-panel">
                    {e.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-parchment-muted"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2.5 4.5 L6 8 L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-parchment-muted">
              Prefilled with the real Meridian Particulars. Edit freely.
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-panel border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
              {error}
            </div>
          )}

          {/* Two-path action buttons */}
          <div className="mt-1 flex flex-col gap-3">
            <button
              onClick={onRunLive}
              disabled={!text.trim()}
              className={cn(
                'group relative w-full overflow-hidden rounded-panel px-5 py-3.5 font-sans text-[14px] font-semibold tracking-wide text-ink transition-all duration-200',
                'bg-gradient-to-b from-gold to-gold-deep',
                'hover:shadow-[0_8px_30px_-8px_rgba(224,168,106,0.55)] hover:brightness-105',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Run live
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3 8 H12 M9 5 L12 8 L9 11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            <button
              onClick={onSeed}
              className="w-full rounded-panel border border-ink-line px-5 py-3 font-sans text-[13px] font-medium text-parchment-muted transition-colors hover:border-gold-dim/50 hover:text-parchment-body"
            >
              Use seed (instant)
            </button>
          </div>

          <div className="hairline" />

          <div className="space-y-3">
            <Bullet
              n="01"
              label="Extract"
              body="Every pleaded proposition is isolated and mapped to its paragraph."
            />
            <Bullet
              n="02"
              label="Retrieve & judge"
              body="High-recall search over the bundle, then an LLM-judge with abstention."
            />
            <Bullet
              n="03"
              label="Score & attack"
              body="Trial-readiness, the risk register, and an opposing-counsel memo."
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Em({ c, children }: { c: string; children: React.ReactNode }) {
  return (
    <span className="font-medium" style={{ color: c }}>
      {children}
    </span>
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
