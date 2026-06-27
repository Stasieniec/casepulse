import type { ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import { CaseSelector } from './CaseSelector'
import { useCases } from '../hooks/queries'
import { cn } from '../lib/cn'
import { DATASET_CASE, GENERALIZES_LINE } from '../lib/framing'

export const SECTIONS = [
  { key: 'intake', label: 'Intake' },
  { key: 'lab', label: 'Extraction Lab' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pleading', label: 'Pleading' },
  { key: 'graph', label: 'Graph' },
  { key: 'redteam', label: 'Red-Team' },
  { key: 'evidence', label: 'Evidence' },
] as const

export type SectionKey = (typeof SECTIONS)[number]['key']

const NAV_GLYPH: Record<SectionKey, ReactNode> = {
  intake: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2 V10 M8 10 L5 7.5 M8 10 L11 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 13 H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  evidence: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 6.5 H11 M5 9 H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.5 9.5 L13 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="10.5" cy="9" r="1.8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  lab: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6.5 2 V6.2 L3.4 12 A1.2 1.2 0 0 0 4.5 13.8 H11.5 A1.2 1.2 0 0 0 12.6 12 L9.5 6.2 V2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.5 2 H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 9.5 H11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.6" />
    </svg>
  ),
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8 A6 6 0 0 1 14 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 8 L11 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  pleading: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 5.5 H10.5 M5.5 8 H10.5 M5.5 10.5 H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  graph: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 5.2 L10.6 5.6 M5 5.6 L5.6 10.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  redteam: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2 L13 4 V8 C13 11 10.5 13 8 14 C5.5 13 3 11 3 8 V4 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 8 L10 8 M8 6 L8 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
}

/**
 * The persistent application frame: a fixed left rail (wordmark, case selector,
 * section nav, sponsor credit) and a scrollable main canvas.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const caseId = id ?? 'meridian'
  const { data: cases } = useCases()
  const onCase = Boolean(id)

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[256px] flex-col border-r border-ink-line bg-ink-panel/60 backdrop-blur-md">
        <div className="px-6 pb-6 pt-7">
          <NavLink to="/" className="block">
            <Wordmark />
          </NavLink>
          <div className="eyebrow mt-2 pl-[2px] text-gold/70">Litigation stress-test</div>
        </div>

        <div className="px-5">
          <div className="eyebrow mb-2 pl-1">Matter</div>
          <CaseSelector
            cases={cases ?? []}
            value={caseId}
            onChange={(nextId) => navigate(`/case/${nextId}/dashboard`)}
          />
        </div>

        <nav className="mt-7 flex flex-col gap-0.5 px-3" aria-label="Sections">
          <div className="eyebrow mb-1 px-3">Analysis</div>
          {SECTIONS.map((s) => (
            <NavLink
              key={s.key}
              to={`/case/${caseId}/${s.key}`}
              aria-disabled={!onCase}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-panel px-3 py-2 font-sans text-[13.5px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-ink-raised text-parchment'
                    : 'text-parchment-muted hover:bg-ink-raised/60 hover:text-parchment-body',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-full bg-gold transition-all duration-200',
                      isActive ? 'w-[3px] opacity-100' : 'w-0 opacity-0',
                    )}
                  />
                  <span className={cn('transition-colors', isActive ? 'text-gold' : 'text-parchment-muted group-hover:text-parchment-body')}>
                    {NAV_GLYPH[s.key]}
                  </span>
                  {s.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-6 pb-6 pt-8">
          {/* Persistent framing: this is the curated demo dataset, but the
              engine generalizes to any bundle. */}
          <div className="mb-4 rounded-panel border border-ink-line bg-ink/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/80" aria-hidden />
              <span className="eyebrow text-gold/70">Demo dataset</span>
            </div>
            <p className="mt-1.5 font-serif text-[11.5px] italic leading-snug text-parchment-body">
              {DATASET_CASE}
            </p>
            <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-parchment-muted/80">
              {GENERALIZES_LINE}
            </p>
          </div>
          <div className="hairline mb-3" />
          <p className="font-mono text-[10px] leading-relaxed text-parchment-muted/70">
            Two-stage retrieval + LLM-judge with abstention (threshold 0.55). Judge agrees with{' '}
            <span className="text-parchment-muted">13/15 hand-labeled relations</span>; abstains
            below 0.55 confidence. Validated against{' '}
            <span className="text-parchment-muted">Bates v Post Office</span>.
          </p>

          <div className="hairline mt-4 mb-3" />
          <div className="eyebrow mb-1.5 text-parchment-muted/50">Powered by</div>
          <ul className="space-y-1 font-mono text-[9px] leading-relaxed text-parchment-muted/50">
            <li>Neo4j Aura · Graph Data Science</li>
            <li>Google Gemini</li>
            <li>Cloudflare · Workers / D1</li>
            <li>Anthropic Claude Code</li>
            {/* Nvidia: not yet wired — enable once API key is live */}
          </ul>
        </div>
      </aside>

      <main className="ml-[256px] flex-1">{children}</main>
    </div>
  )
}
