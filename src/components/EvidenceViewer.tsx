import { useEffect, useMemo, useRef } from 'react'
import type { Relation } from '../../shared/types'
import { useDocument } from '../hooks/queries'
import { findQuoteRange } from '../lib/highlight'
import { relationColor, statusTint } from '../lib/status'
import { cn } from '../lib/cn'

export interface EvidenceTarget {
  /** Document being opened. */
  docId: string
  /** The verbatim quote to locate + highlight in the document text. */
  quote: string
  /** Relation of this evidence to the originating claim. */
  relation: Relation
  /** Claim this evidence speaks to (for the header context line). */
  claimLabel?: string
  /** Optional rationale shown above the document. */
  rationale?: string
}

interface EvidenceViewerProps {
  caseId: string
  analysisId?: string
  target: EvidenceTarget | null
  onClose: () => void
}

const RELATION_VERB: Record<Relation, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  neutral: 'Bears on',
}

/**
 * Source-grounded, click-to-verify proof: a right-hand drawer that shows the
 * full text of the cited document with the verbatim quote highlighted in
 * context. This is the evidence the judges came to see.
 */
export function EvidenceViewer({ caseId, analysisId, target, onClose }: EvidenceViewerProps) {
  const open = target !== null
  const { data: doc, isLoading, isError } = useDocument(caseId, target?.docId, analysisId)
  const quoteRef = useRef<HTMLSpanElement | null>(null)

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Scroll the highlighted quote into view once the doc has rendered.
  useEffect(() => {
    if (!open || !doc || !target?.quote) return
    const t = window.setTimeout(() => {
      quoteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [open, doc, target?.quote])

  const accent = target ? relationColor(target.relation) : '#5B6675'

  // Split the document into [before, quote, after] around the located quote.
  const parts = useMemo(() => {
    if (!doc || !target?.quote) return null
    const range = findQuoteRange(doc.text, target.quote)
    if (!range) return null
    return {
      before: doc.text.slice(0, range.start),
      quote: doc.text.slice(range.start, range.end),
      after: doc.text.slice(range.end),
    }
  }, [doc, target?.quote])

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink/60 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onMouseDown={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={doc ? `Source document ${doc.docId}` : 'Source document'}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col border-l border-ink-line bg-ink-panel shadow-popover',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <header
          className="shrink-0 border-b border-ink-line px-6 py-4"
          style={{ background: `linear-gradient(90deg, ${statusTint('contradicted', 0)}, transparent)` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span
                  className="rounded-[3px] px-2 py-[3px] font-mono text-[11px] font-semibold"
                  style={{ color: accent, backgroundColor: `${accent}1f` }}
                >
                  {target?.docId}
                </span>
                {target && (
                  <span
                    className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: accent }}
                  >
                    <RelationGlyph relation={target.relation} />
                    {RELATION_VERB[target.relation]}
                    {target.claimLabel ? ` ${target.claimLabel}` : ''}
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 truncate font-serif text-[1.2rem] font-semibold text-parchment">
                {doc?.title ?? (isLoading ? 'Loading…' : target?.docId)}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-[3px] p-1.5 text-parchment-muted transition-colors hover:bg-ink-raised hover:text-parchment"
              aria-label="Close source document"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {target?.rationale && (
            <p className="mt-3 border-l-2 pl-3 font-sans text-[12.5px] leading-relaxed text-parchment-muted" style={{ borderColor: `${accent}66` }}>
              {target.rationale}
            </p>
          )}
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading && <DocSkeleton />}
          {isError && (
            <p className="font-mono text-[13px] text-status-contradicted">
              Could not load this document.
            </p>
          )}
          {doc && (
            <article className="font-mono text-[12.5px] leading-[1.85] text-parchment-body">
              {parts ? (
                <pre className="whitespace-pre-wrap break-words font-mono">
                  {parts.before}
                  <mark
                    ref={quoteRef}
                    className="rounded-[2px] px-0.5 py-px"
                    style={{
                      backgroundColor: `${accent}26`,
                      color: '#ECE7DA',
                      boxShadow: `inset 2px 0 0 ${accent}`,
                    }}
                  >
                    {parts.quote}
                  </mark>
                  {parts.after}
                </pre>
              ) : (
                <>
                  {target?.quote && (
                    <p className="mb-4 rounded-[3px] border border-dashed border-ink-line bg-ink-raised/50 px-3 py-2 font-sans text-[11.5px] text-parchment-muted">
                      The cited passage could not be located verbatim in the
                      source text; the full document is shown below.
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap break-words font-mono">{doc.text}</pre>
                </>
              )}
            </article>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-ink-line px-6 py-3">
          <p className="font-mono text-[10.5px] text-parchment-muted/80">
            Verbatim from the litigation bundle · click-to-verify
          </p>
        </footer>
      </aside>
    </>
  )
}

function RelationGlyph({ relation }: { relation: Relation }) {
  if (relation === 'contradicts') {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 2 V10 M6 10 L3 7 M6 10 L9 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (relation === 'supports') {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 10 V2 M6 2 L3 5 M6 2 L9 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return null
}

function DocSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-ink-raised"
          style={{ width: `${70 + ((i * 13) % 30)}%` }}
        />
      ))}
    </div>
  )
}
