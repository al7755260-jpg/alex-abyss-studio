export type CabinetPlaybackSnapshot = {
  ready: boolean
  playing: boolean
  open: boolean
  targetOpen: boolean
  direction: -1 | 0 | 1
  time: number
  duration: number
}

const CLIP_DURATION_TOLERANCE = 0.001

export function resolveCabinetClipDuration(
  durations: readonly number[],
  tolerance = CLIP_DURATION_TOLERANCE,
) {
  if (durations.length === 0) return null
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('动画时长容差必须是非负有限数')
  }

  const duration = durations[0]
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('柜门动画片段必须具有正的有限时长')
  }

  for (const candidate of durations.slice(1)) {
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new RangeError('柜门动画片段必须具有正的有限时长')
    }
    if (Math.abs(candidate - duration) > tolerance) {
      throw new Error('柜门动画片段时长不一致，无法同步播放')
    }
  }

  return duration
}

export class CabinetPlaybackController {
  private duration = 0
  private time = 0
  private direction: -1 | 0 | 1 = 0
  private open = false
  private targetOpen = false

  get snapshot(): CabinetPlaybackSnapshot {
    return {
      ready: this.duration > 0,
      playing: this.direction !== 0,
      open: this.open,
      targetOpen: this.targetOpen,
      direction: this.direction,
      time: this.time,
      duration: this.duration,
    }
  }

  configureDuration(duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('柜门动画时长必须是正的有限数')
    }
    this.duration = duration
    this.time = this.open ? duration : 0
    this.direction = 0
    this.targetOpen = this.open
    return this.snapshot
  }

  clearDuration() {
    this.duration = 0
    this.time = 0
    this.direction = 0
    this.targetOpen = this.open
    return this.snapshot
  }

  toggle() {
    if (this.duration <= 0 || this.direction !== 0) return false

    this.targetOpen = !this.open
    this.direction = this.targetOpen ? 1 : -1
    return true
  }

  advance(deltaSeconds: number) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('动画步长必须是非负有限数')
    }
    if (this.direction === 0 || deltaSeconds === 0) return this.snapshot

    this.time = Math.min(
      this.duration,
      Math.max(0, this.time + deltaSeconds * this.direction),
    )

    const reachedEnd = this.direction > 0 && this.time >= this.duration
    const reachedStart = this.direction < 0 && this.time <= 0
    if (reachedEnd || reachedStart) {
      this.open = this.targetOpen
      this.direction = 0
    }

    return this.snapshot
  }
}
