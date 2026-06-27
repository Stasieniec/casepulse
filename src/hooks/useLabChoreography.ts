import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useCountUp'

/**
 * The Extraction Lab phase machine. Drives the cinematic "watch a source become
 * claims → nodes → judged edges → the case graph" sequence over already-loaded
 * seed data (replay) or while a live /api/analyze call is in flight (live).
 *
 * It is purely a timeline orchestrator: the Lab component reads `phase` and the
 * per-phase progress counters and animates accordingly. It is skippable and
 * reduced-motion aware (instant jump to the final state).
 */

export type LabPhase =
  | 'idle' // before the run starts (source picker / intro)
  | 'reading' // Particulars text appears
  | 'extracting' // claims lift out one-by-one
  | 'searching' // evidence documents surface as retrieval candidates
  | 'crossexam' // edges draw to evidence; abstention + kill-shots
  | 'building' // nodes settle, readiness gauge sweeps
  | 'done' // CTAs

/** Pleading-mode phase order. */
export const PLEADING_PHASES: LabPhase[] = [
  'reading',
  'extracting',
  'searching',
  'crossexam',
  'building',
  'done',
]

/** Evidence-mode phase order (classification: fewer beats). */
export const EVIDENCE_PHASES: LabPhase[] = ['reading', 'searching', 'crossexam', 'building', 'done']

export interface LabCounts {
  /** Total claims to extract (pleading mode). */
  claimCount: number
  /** Total evidence docs in the bundle. */
  evidenceCount: number
  /** Total judged (non-neutral) edges to draw. */
  edgeCount: number
}

interface ChoreographyOpts extends LabCounts {
  mode: 'pleading' | 'evidence'
  /** When the data needed to choreograph is ready. The run waits for this. */
  ready: boolean
  /** Optional async work (live analyze). Resolves before/while building. */
  liveRun?: () => Promise<void>
}

export interface Choreography {
  phase: LabPhase
  /** Index into the active phase list, for the rail. */
  phaseIndex: number
  phases: LabPhase[]
  /** Claims revealed so far (0..claimCount) during `extracting`. */
  revealedClaims: number
  /** Evidence docs surfaced so far (0..evidenceCount) during `searching`. */
  surfacedEvidence: number
  /** Judged edges drawn so far (0..edgeCount) during `crossexam`. */
  drawnEdges: number
  /**
   * How many claims should appear "judged" so far, derived from edge progress —
   * lets claim cards resolve in step with the cross-exam. Pass the claim count.
   */
  drawnEdgesPerClaim: (claimCount: number) => number
  /** True once the building gauge should sweep. */
  building: boolean
  running: boolean
  started: boolean
  start: () => void
  skip: () => void
  /** Reset to idle (e.g. when switching source). */
  reset: () => void
}

// Per-phase durations (ms) for the smooth replay. Tuned to feel cinematic but
// fast — the whole pleading run is ~9s, easily skippable.
const DUR = {
  reading: 1400,
  extracting: 3200, // spread across claims
  searching: 1800,
  crossexam: 2600, // spread across edges
  building: 1600,
}

export function useLabChoreography(opts: ChoreographyOpts): Choreography {
  const { mode, ready, claimCount, evidenceCount, edgeCount, liveRun } = opts
  const phases = mode === 'pleading' ? PLEADING_PHASES : EVIDENCE_PHASES

  const [phaseIndex, setPhaseIndex] = useState(-1) // -1 = idle
  const [revealedClaims, setRevealedClaims] = useState(0)
  const [surfacedEvidence, setSurfacedEvidence] = useState(0)
  const [drawnEdges, setDrawnEdges] = useState(0)
  const [started, setStarted] = useState(false)
  const [running, setRunning] = useState(false)

  const timers = useRef<number[]>([])
  const rafs = useRef<number[]>([])
  const cancelled = useRef(false)

  const clearAll = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    rafs.current.forEach((r) => cancelAnimationFrame(r))
    timers.current = []
    rafs.current = []
  }, [])

  const after = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(fn, ms)
    timers.current.push(t)
  }, [])

  /** Animate a counter from 0..total over `ms`, calling setN each step. */
  const ramp = useCallback((total: number, ms: number, setN: (n: number) => void, done?: () => void) => {
    if (total <= 0) {
      setN(0)
      done?.()
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      if (cancelled.current) return
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 2)
      setN(Math.round(eased * total))
      if (t < 1) {
        rafs.current.push(requestAnimationFrame(step))
      } else {
        setN(total)
        done?.()
      }
    }
    rafs.current.push(requestAnimationFrame(step))
  }, [])

  const finishInstant = useCallback(() => {
    clearAll()
    setRevealedClaims(claimCount)
    setSurfacedEvidence(evidenceCount)
    setDrawnEdges(edgeCount)
    setPhaseIndex(phases.length - 1) // done
    setRunning(false)
  }, [clearAll, claimCount, evidenceCount, edgeCount, phases.length])

  const skip = useCallback(() => {
    cancelled.current = true
    // For live mode, the await may still be pending; that's fine — skip just
    // jumps the visuals to the final state. The liveRun promise resolution is
    // handled in start().
    finishInstant()
  }, [finishInstant])

  const reset = useCallback(() => {
    cancelled.current = true
    clearAll()
    setStarted(false)
    setRunning(false)
    setPhaseIndex(-1)
    setRevealedClaims(0)
    setSurfacedEvidence(0)
    setDrawnEdges(0)
  }, [clearAll])

  const start = useCallback(() => {
    if (started) return
    setStarted(true)
    setRunning(true)
    cancelled.current = false
  }, [started])

  // The actual timeline runs once started AND data is ready.
  useEffect(() => {
    if (!started || !ready) return
    cancelled.current = false
    const reduced = prefersReducedMotion()

    // Kick off the (optional) live work immediately, in parallel with the
    // intro beats; we hold at the searching/cross-exam stage until it resolves.
    let liveDone = !liveRun
    let liveError = false
    const livePromise = liveRun
      ? liveRun()
          .then(() => {
            liveDone = true
          })
          .catch(() => {
            liveDone = true
            liveError = true
          })
      : Promise.resolve()
    void livePromise
    void liveError // surfaced by the caller via its own state; here we only gate timing

    if (reduced) {
      finishInstant()
      return () => {
        cancelled.current = true
        clearAll()
      }
    }

    const idxOf = (p: LabPhase) => phases.indexOf(p)
    const go = (p: LabPhase) => {
      if (cancelled.current) return
      const i = idxOf(p)
      if (i >= 0) setPhaseIndex(i)
    }

    // ── Timeline ──────────────────────────────────────────────────────────
    let cursor = 0
    const at = (ms: number, fn: () => void) => {
      cursor = ms
      after(ms, fn)
    }

    // 1. reading
    go('reading')
    let t = DUR.reading

    // 2. extracting (pleading only)
    if (mode === 'pleading') {
      at(t, () => {
        go('extracting')
        ramp(claimCount, DUR.extracting, setRevealedClaims)
      })
      t += DUR.extracting
    } else {
      setRevealedClaims(claimCount)
    }

    // 3. searching
    at(t, () => {
      go('searching')
      ramp(evidenceCount, DUR.searching, setSurfacedEvidence)
    })
    t += DUR.searching

    // 4. crossexam — but if live, hold here until the analyze resolves.
    at(t, () => {
      go('crossexam')
      const beginEdges = () => ramp(edgeCount, DUR.crossexam, setDrawnEdges, () => {
        // 5. building
        after(300, () => {
          go('building')
          // 6. done
          after(DUR.building, () => {
            if (!cancelled.current) {
              setPhaseIndex(phases.length - 1)
              setRunning(false)
            }
          })
        })
      })
      if (liveDone) {
        beginEdges()
      } else {
        // Poll for the live work to complete (label stays on cross-exam,
        // presented as the engine working). Then draw the real result.
        const poll = () => {
          if (cancelled.current) return
          if (liveDone) {
            beginEdges()
          } else {
            after(400, poll)
          }
        }
        poll()
      }
    })
    void cursor

    return () => {
      cancelled.current = true
      clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, ready])

  return {
    phase: phaseIndex < 0 ? 'idle' : phases[phaseIndex],
    phaseIndex,
    phases,
    revealedClaims,
    surfacedEvidence,
    drawnEdges,
    drawnEdgesPerClaim: (claimCount: number) =>
      edgeCount <= 0 ? claimCount : Math.ceil((drawnEdges / edgeCount) * claimCount),
    building: phaseIndex >= phases.indexOf('building'),
    running,
    started,
    start,
    skip,
    reset,
  }
}
