import { useEffect, useRef, useState } from 'react'

/** True if the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * Animate a number from 0 to `target` over `duration` ms with an ease-out curve.
 * Respects prefers-reduced-motion (snaps to target). Restarts when target changes.
 */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0)
  const raf = useRef<number>()

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(target * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [target, duration])

  return value
}
