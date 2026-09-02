import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { StudioTransform, StudioVector3 } from '../editor/studioLayout'

export const CHAIR_TURN_RADIANS = (Math.PI * 2) / 3
export const CHAIR_TURN_DURATION_SECONDS = 0.86

const FULL_TURN_RADIANS = Math.PI * 2
const ANGLE_EPSILON = 0.000001

export type ChairRotationSnapshot = {
  angle: number
  targetAngle: number
  playing: boolean
  completedTurns: number
}

type ChairPoint = readonly [number, number, number]

export type ChairSwivelTransformContext = {
  defaultTransform: StudioTransform
  currentTransform: StudioTransform
}

function isFinitePoint(value: unknown): value is ChairPoint {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component))
}

function transformMatrix(transform: StudioTransform) {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ')),
    new Vector3(...transform.scale),
  )
}

function assertTransform(transform: StudioTransform, label: string) {
  if (
    !isFinitePoint(transform.position)
    || !isFinitePoint(transform.rotation)
    || !isFinitePoint(transform.scale)
    || transform.scale.some((component) => component <= 0)
  ) {
    throw new TypeError(`${label} must contain finite position, rotation, and positive scale tuples`)
  }
}

export function normalizeChairAngle(angle: number) {
  if (!Number.isFinite(angle)) {
    throw new TypeError('Chair angle must be finite')
  }

  const normalized = ((angle % FULL_TURN_RADIANS) + FULL_TURN_RADIANS) % FULL_TURN_RADIANS
  return Math.abs(normalized) < ANGLE_EPSILON
    || Math.abs(normalized - FULL_TURN_RADIANS) < ANGLE_EPSILON
    ? 0
    : normalized
}

export function easeChairTurn(progress: number) {
  if (!Number.isFinite(progress)) {
    throw new TypeError('Chair animation progress must be finite')
  }

  const clamped = Math.min(1, Math.max(0, progress))
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

/**
 * Rotates a point around the chair's local, vertical swivel axis. When the
 * optional layout context is supplied, `point` begins in the default world
 * layout, is moved into chair-local space, rotated around the render pivot,
 * and then returned through the current editor transform.
 */
export function resolveChairSwivelPoint(
  point: ChairPoint,
  pivot: ChairPoint,
  angle: number,
  context?: ChairSwivelTransformContext,
): StudioVector3 {
  if (!isFinitePoint(point) || !isFinitePoint(pivot) || !Number.isFinite(angle)) {
    throw new TypeError('Chair swivel point, pivot, and angle must be finite')
  }

  const resolved = new Vector3(...point)
  if (context) {
    assertTransform(context.defaultTransform, 'Default chair transform')
    assertTransform(context.currentTransform, 'Current chair transform')
    resolved.applyMatrix4(transformMatrix(context.defaultTransform).invert())
  }

  const x = resolved.x - pivot[0]
  const z = resolved.z - pivot[2]
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  resolved.set(
    pivot[0] + x * cosine + z * sine,
    resolved.y,
    pivot[2] - x * sine + z * cosine,
  )

  if (context) {
    resolved.applyMatrix4(transformMatrix(context.currentTransform))
  }

  return [resolved.x, resolved.y, resolved.z]
}

export class ChairRotationController {
  private readonly duration: number
  private angle = 0
  private targetAngle = 0
  private startAngle = 0
  private elapsed = 0
  private playing = false
  private completedTurns = 0

  constructor(duration = CHAIR_TURN_DURATION_SECONDS) {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Chair turn duration must be a positive finite number')
    }
    this.duration = duration
  }

  get snapshot(): ChairRotationSnapshot {
    return {
      angle: this.angle,
      targetAngle: this.targetAngle,
      playing: this.playing,
      completedTurns: this.completedTurns,
    }
  }

  startTurn() {
    if (this.playing) return false

    // Keep the third settled pose numerically at 2π for exact cycle checks.
    // Before the following click, fold it back to the equivalent zero pose so
    // the next interpolation still travels forward by +120°.
    const normalized = normalizeChairAngle(this.angle)
    if (Math.abs(normalized - this.angle) > ANGLE_EPSILON) {
      this.angle = normalized
      this.targetAngle = normalized
    }

    this.startAngle = this.angle
    this.targetAngle = this.startAngle + CHAIR_TURN_RADIANS
    this.elapsed = 0
    this.playing = true
    return true
  }

  advance(deltaSeconds: number) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Chair animation step must be a non-negative finite number')
    }
    if (!this.playing || deltaSeconds === 0) return this.snapshot

    this.elapsed = Math.min(this.duration, this.elapsed + deltaSeconds)
    const progress = this.elapsed / this.duration
    const eased = easeChairTurn(progress)
    this.angle = this.startAngle + (this.targetAngle - this.startAngle) * eased

    if (this.elapsed >= this.duration) {
      this.angle = this.targetAngle
      this.playing = false
      this.completedTurns += 1
    }

    return this.snapshot
  }
}
