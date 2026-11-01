import { Vector3, type Camera } from 'three'

export const PLAQUE_HITS_TO_BREAK = 5
export const PLAQUE_FALL_SECONDS = 1.25
export const PLAQUE_EMPTY_HOLD_SECONDS = 0.5
export const PLAQUE_RETURN_FRAGMENT_SECONDS = 1.8
export const PLAQUE_RETURN_STAGGER_SECONDS = 0.035
export const PLAQUE_RETURN_SECONDS = PLAQUE_RETURN_FRAGMENT_SECONDS + 15 * PLAQUE_RETURN_STAGGER_SECONDS
/** Peel upper sections first while keeping all surviving curls attached.
 * A Voronoi cell can contain several islands connected THROUGH its neighbours.
 * This order was verified against all 154,955 original faces after welding UV
 * seams: the remainder has exactly one shared-edge component after hits 1–4.
 * Four fragments fall first, then three per click; every face leaves on hit 5.
 * This is precomputed for the shipped plaque, with no runtime topology scan.
 */
export const PLAQUE_FRAGMENT_BATCHES = [
  [12, 13, 10, 9], [14, 15, 11], [8, 7, 6], [5, 3, 2], [4, 1, 0],
] as const
const returnOrder: readonly number[] = PLAQUE_FRAGMENT_BATCHES.flat()

export type PlaqueMotion = { x: number; y: number; z: number; rx: number; ry: number; rz: number }

export function plaqueNoise(index: number, salt = 0) {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

export function plaqueCellForPoint(y: number, z: number, height: number, width: number) {
  let selected = 0
  let nearest = Infinity
  const normalizedY = y / Math.max(height, 0.00001)
  const normalizedZ = z / Math.max(width, 0.00001) + 0.5
  for (let i = 0; i < 16; i++) {
    const cy = (Math.floor(i / 4) + 0.5 + (plaqueNoise(i, 1) - 0.5) * 0.68) / 4
    const cz = (i % 4 + 0.5 + (plaqueNoise(i, 2) - 0.5) * 0.68) / 4
    const distance = (normalizedY - cy) ** 2 + (normalizedZ - cz) ** 2
    if (distance < nearest) { nearest = distance; selected = i }
  }
  return selected
}

export function samplePlaqueFragmentMotion(
  index: number,
  fallTime: number,
  returnTime: number,
  height: number,
  exitOffset: { x: number; y: number; z: number },
  out: PlaqueMotion = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
) {
  const t = Math.max(0, Math.min(1, fallTime / PLAQUE_FALL_SECONDS))
  const delay = returnOrder.indexOf(index) * PLAQUE_RETURN_STAGGER_SECONDS
  const progress = returnTime < 0 ? 0 : Math.max(0, Math.min(1, (returnTime - delay) / PLAQUE_RETURN_FRAGMENT_SECONDS))
  const remaining = (1 - progress) ** 3
  const descent = t * t * remaining
  const separation = Math.sin(Math.PI * t) * remaining
  out.x = exitOffset.x * descent + height * (0.06 + plaqueNoise(index, 3) * 0.2) * separation
  out.y = exitOffset.y * descent
  out.z = exitOffset.z * descent + height * (plaqueNoise(index, 4) - 0.5) * 0.42 * separation
  out.rx = (plaqueNoise(index, 5) - 0.5) * 1.4 * t * remaining
  out.ry = (plaqueNoise(index, 6) - 0.5) * 0.8 * t * remaining
  out.rz = (plaqueNoise(index, 7) - 0.5) * 1.2 * t * remaining
  return out
}

const projectedExit = new Vector3()
/** Prefer world gravity; camera-down fallback handles an almost overhead view. */
export function resolvePlaqueExitPoint(camera: Camera, worldPoint: Vector3, out = new Vector3()) {
  let distance = Math.max(10, worldPoint.distanceTo(camera.position) * 0.75)
  for (let attempt = 0; attempt < 7; attempt++) {
    out.copy(worldPoint)
    out.y -= distance
    projectedExit.copy(out).project(camera)
    if (Number.isFinite(projectedExit.y) && projectedExit.y < -1.6 && projectedExit.z >= -1 && projectedExit.z <= 1) return out
    distance *= 1.6
  }
  projectedExit.copy(worldPoint).project(camera)
  return out.set(projectedExit.x, -1.7, Math.max(-0.98, Math.min(0.999, projectedExit.z))).unproject(camera)
}

/** Independent batch clocks allow rapid clicks without waiting for each fall. */
export class PlaqueFractureController {
  hits = 0
  readonly fallTimes = new Float64Array(16).fill(-1)
  returning = false
  returnTime = 0
  emptyHoldTime = 0

  get active() {
    return this.returning || this.hits === PLAQUE_HITS_TO_BREAK
      || this.fallTimes.some((time) => time >= 0 && time < PLAQUE_FALL_SECONDS)
  }

  hit() {
    if (this.hits >= PLAQUE_HITS_TO_BREAK || this.returning) return false
    for (const index of PLAQUE_FRAGMENT_BATCHES[this.hits]) this.fallTimes[index] = 0
    this.hits++
    return true
  }

  advance(delta: number) {
    if (!this.active) return
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0
    if (this.returning) {
      this.returnTime += dt
      if (this.returnTime >= PLAQUE_RETURN_SECONDS) this.reset()
      return
    }
    let lastDropRemaining = 0
    for (let index = 0; index < this.fallTimes.length; index++) {
      const previous = this.fallTimes[index]
      if (previous < 0) continue
      lastDropRemaining = Math.max(lastDropRemaining, PLAQUE_FALL_SECONDS - previous)
      this.fallTimes[index] = Math.min(PLAQUE_FALL_SECONDS, previous + dt)
    }
    if (this.hits === PLAQUE_HITS_TO_BREAK) {
      this.emptyHoldTime += Math.max(0, dt - lastDropRemaining)
      if (this.emptyHoldTime >= PLAQUE_EMPTY_HOLD_SECONDS) {
        this.returning = true
        this.returnTime = this.emptyHoldTime - PLAQUE_EMPTY_HOLD_SECONDS
        if (this.returnTime >= PLAQUE_RETURN_SECONDS) this.reset()
      }
    }
  }

  reset() {
    this.hits = 0
    this.fallTimes.fill(-1)
    this.returning = false
    this.returnTime = 0
    this.emptyHoldTime = 0
  }
}
