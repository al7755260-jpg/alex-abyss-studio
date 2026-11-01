import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** GPU-bound scenes need a sustained budget, not only a short drag downgrade.
 * DOM typography stays at native resolution. Hysteresis avoids resolution pumping. */
export function AdaptiveRenderBudget() {
  const setDpr = useThree((state) => state.setDpr)
  const performanceLevel = useThree((state) => state.performance.current)
  const budget = useRef(0.9)
  const applied = useRef(0)
  const elapsed = useRef(0)
  const frames = useRef(0)
  const recovery = useRef(0)
  const warmup = useRef(3)

  const apply = () => {
    const device = Math.min(window.devicePixelRatio || 1, 1.1)
    const target = Math.min(device, Math.max(0.55, budget.current * (performanceLevel < 1 ? 0.8 : 1)))
    if (Math.abs(target - applied.current) < 0.01) return
    applied.current = target
    setDpr(target)
  }
  useEffect(apply, [performanceLevel, setDpr])

  useFrame((_, delta) => {
    // Background throttling and shader compilation must not drive the budget.
    if (document.hidden || delta > 0.25) {
      elapsed.current = 0
      frames.current = 0
      recovery.current = 0
      return
    }
    if (warmup.current > 0) { warmup.current -= delta; return }
    elapsed.current += delta
    frames.current += 1
    if (elapsed.current < 1.25) return
    const frameMs = elapsed.current * 1000 / frames.current
    if (frameMs > 30) {
      budget.current = Math.max(0.65, budget.current - 0.1)
      recovery.current = 0
    } else if (frameMs < 18 && performanceLevel === 1) {
      recovery.current += elapsed.current
      if (recovery.current >= 8) {
        budget.current = Math.min(1.1, budget.current + 0.05)
        recovery.current = 0
      }
    } else recovery.current = 0
    elapsed.current = 0
    frames.current = 0
    apply()
  })
  return null
}
