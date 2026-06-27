import { useEffect, useState } from 'react'
import { scoreZoneColor } from '../lib/status'
import { useCountUp, prefersReducedMotion } from '../hooks/useCountUp'

interface ReadinessGaugeProps {
  score: number // 0–100
  label?: string
}

// Geometry: a 180° arc. We work in a 0..1 fraction of the semicircle.
const R = 130 // arc radius
const CX = 150
const CY = 150
const STROKE = 16
const START = 180 // degrees (left)
const SWEEP = 180 // total degrees

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) }
}

/** Build an SVG arc path between two fractions (0..1) of the semicircle. */
function arcPath(f0: number, f1: number, radius: number) {
  const a0 = START - f0 * SWEEP
  const a1 = START - f1 * SWEEP
  const p0 = polar(a0, radius)
  const p1 = polar(a1, radius)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  // sweep-flag 1 (clockwise) as angle decreases from 180→0
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${large} 1 ${p1.x} ${p1.y}`
}

/**
 * Semicircular trial-readiness gauge. The arc is a red→amber→green ramp; the
 * needle sweeps to `score` on mount and the hero number counts up, both
 * respecting prefers-reduced-motion.
 */
export function ReadinessGauge({ score, label = 'Trial-readiness' }: ReadinessGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const animatedScore = useCountUp(clamped, 1200)
  const [needleFrac, setNeedleFrac] = useState(prefersReducedMotion() ? clamped / 100 : 0)
  const zone = scoreZoneColor(clamped)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setNeedleFrac(clamped / 100)
      return
    }
    // next frame so the CSS transition animates from 0
    const r = requestAnimationFrame(() => setNeedleFrac(clamped / 100))
    return () => cancelAnimationFrame(r)
  }, [clamped])

  const needleAngle = START - needleFrac * SWEEP
  const needleTip = polar(needleAngle, R - STROKE - 6)

  // Three color zones along the ramp (matches scoreZoneColor thresholds).
  const segments = [
    { f0: 0, f1: 0.4, color: '#E5484D' },
    { f0: 0.4, f1: 0.7, color: '#E8A13A' },
    { f0: 0.7, f1: 1, color: '#2FBF8F' },
  ]

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 300 178" className="w-full max-w-[340px]" role="img" aria-label={`${label}: ${Math.round(clamped)} out of 100`}>
        {/* track */}
        <path d={arcPath(0, 1, R)} fill="none" stroke="#1E2533" strokeWidth={STROKE} strokeLinecap="round" />
        {/* colored zones */}
        {segments.map((s, i) => (
          <path
            key={i}
            d={arcPath(s.f0, s.f1, R)}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            opacity={0.92}
          />
        ))}
        {/* tick marks at zone boundaries */}
        {[0.4, 0.7].map((f) => {
          const inner = polar(START - f * SWEEP, R - STROKE / 2 - 3)
          const outer = polar(START - f * SWEEP, R + STROKE / 2 + 3)
          return (
            <line
              key={f}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#0B0E14"
              strokeWidth={2}
            />
          )
        })}
        {/* needle — sweeps as needleTip coords transition from the 0 position */}
        <g>
          <line
            x1={CX}
            y1={CY}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke={zone}
            strokeWidth={3}
            strokeLinecap="round"
            style={{
              transition: prefersReducedMotion() ? undefined : 'all 1.2s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
          <circle cx={CX} cy={CY} r={7} fill="#0B0E14" stroke={zone} strokeWidth={2.5} />
        </g>
        {/* end labels */}
        <text x={polar(START, R).x - 2} y={CY + 18} fill="#5B6675" fontSize="11" fontFamily="'IBM Plex Mono', monospace" textAnchor="middle">
          0
        </text>
        <text x={polar(0, R).x + 2} y={CY + 18} fill="#5B6675" fontSize="11" fontFamily="'IBM Plex Mono', monospace" textAnchor="middle">
          100
        </text>
      </svg>

      {/* Hero number, pulled up into the gauge's open center */}
      <div className="-mt-[92px] flex flex-col items-center">
        <div className="flex items-baseline">
          <span className="font-serif text-[4.6rem] font-semibold leading-none text-gold tabular-nums" style={{ textShadow: '0 2px 30px rgba(224,168,106,0.25)' }}>
            {Math.round(animatedScore)}
          </span>
          <span className="ml-1 font-serif text-2xl text-parchment-muted">/100</span>
        </div>
        <div
          className="mt-2 rounded-full px-3 py-1 font-sans text-[10.5px] font-semibold uppercase tracking-label"
          style={{ color: zone, backgroundColor: `${zone}1f` }}
        >
          {zoneWord(clamped)}
        </div>
        <div className="eyebrow mt-3">{label}</div>
      </div>
    </div>
  )
}

function zoneWord(score: number): string {
  if (score < 40) return 'Not trial-ready'
  if (score < 70) return 'Needs work'
  return 'Trial-ready'
}
