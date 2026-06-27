import { useEffect, useState } from 'react'

const STAGES = [
  { id: 'extract', label: 'Extracting allegations', detail: 'Mapping every pleaded proposition…' },
  {
    id: 'index',
    label: 'Indexing the bundle',
    detail: 'Chunking and embedding 18 evidence documents…',
  },
  {
    id: 'retrieve',
    label: 'Retrieving evidence',
    detail: 'High-recall search over the bundle…',
  },
  {
    id: 'judge',
    label: 'Judging each edge',
    detail: 'LLM-judge with abstention: supports / contradicts / neutral…',
  },
  {
    id: 'redteam',
    label: 'Playing opposing counsel',
    detail: 'Generating cross-exam attacks on weak claims…',
  },
  {
    id: 'persist',
    label: 'Saving the analysis',
    detail: 'Persisting results to the case graph…',
  },
]

interface ProcessingProps {
  onCancel?: () => void
}

export function Processing({ onCancel }: ProcessingProps) {
  const [stage, setStage] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  // Advance through stages for animation (actual completion comes from the API promise)
  useEffect(() => {
    const interval = setInterval(() => {
      setStage(s => (s < STAGES.length - 1 ? s + 1 : s))
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const current = STAGES[stage]
  const progress = Math.round(((stage + 1) / STAGES.length) * 100)
  // SVG circle circumference for r=40: 2π×40 ≈ 251.2
  const circumference = 251.2
  const dashArray = `${(circumference * (stage + 1)) / STAGES.length} ${circumference}`

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      {/* Animated progress ring */}
      <div className="relative mb-8 h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96" aria-hidden>
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-ink-line"
          />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={dashArray}
            strokeLinecap="round"
            className="text-gold transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[13px] text-gold">{progress}%</span>
        </div>
      </div>

      {/* Current stage label */}
      <h2 className="mb-2 font-serif text-[1.5rem] font-semibold text-parchment">
        {current.label}
      </h2>
      <p className="mb-1 max-w-sm text-[13px] leading-relaxed text-parchment-muted">
        {current.detail}
      </p>
      <p className="font-mono text-[11px] text-parchment-muted/60">{elapsed}s elapsed</p>

      {/* Stage checklist */}
      <div className="mt-8 space-y-2">
        {STAGES.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={[
                'h-2 w-2 rounded-full transition-colors duration-500',
                i < stage
                  ? 'bg-green-500'
                  : i === stage
                    ? 'animate-pulse bg-gold'
                    : 'bg-ink-line',
              ].join(' ')}
            />
            <span
              className={[
                'text-[12px] transition-colors duration-300',
                i < stage
                  ? 'text-green-400'
                  : i === stage
                    ? 'text-parchment'
                    : 'text-parchment-muted/50',
              ].join(' ')}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Cancel link */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-8 text-[12px] text-parchment-muted underline-offset-2 hover:text-parchment hover:underline"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
