export const LASER_SEGMENT_SECONDS = 0.45
export const PORTRAIT_REVEAL_SECONDS = 0.7
export const SOURCE_EMITTER_FADE_SECONDS = 0.18
export const HOLOGRAM_FULL_SECONDS = 3 * LASER_SEGMENT_SECONDS + PORTRAIT_REVEAL_SECONDS
export const HOLOGRAM_EXIT_SPEED = 1.25

/** Traverse mask → bust → lamp → mask before the portrait materializes. */
export function hologramSegmentProgress(elapsed: number, index: number, reducedMotion = false) {
  return reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed - index * LASER_SEGMENT_SECONDS) / LASER_SEGMENT_SECONDS))
}

export function hologramPortraitProgress(elapsed: number, reducedMotion = false) {
  return reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed - 3 * LASER_SEGMENT_SECONDS) / PORTRAIT_REVEAL_SECONDS))
}

/** A bounded reversible timeline: no queued timers or per-frame React state.
 * Backward playback removes the portrait first, retracts edges 3→2→1, then
 * fades the source emitter. A complete exit takes about 1.78 seconds.
 */
export class HologramPlayback {
  cursor = -SOURCE_EMITTER_FADE_SECONDS

  advance(delta: number, active: boolean) {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0
    this.cursor = Math.max(-SOURCE_EMITTER_FADE_SECONDS, Math.min(HOLOGRAM_FULL_SECONDS,
      this.cursor + dt * (active ? 1 : -HOLOGRAM_EXIT_SPEED)))
  }

  get hidden() { return this.cursor <= -SOURCE_EMITTER_FADE_SECONDS }
  get reducedMotionOpacity() {
    return Math.max(0, Math.min(1, (this.cursor + SOURCE_EMITTER_FADE_SECONDS)
      / (HOLOGRAM_FULL_SECONDS + SOURCE_EMITTER_FADE_SECONDS)))
  }
  get sourceOpacity() {
    return Math.max(0, Math.min(1, (this.cursor + SOURCE_EMITTER_FADE_SECONDS) / SOURCE_EMITTER_FADE_SECONDS))
  }
}

export type HologramDisplayState = { active: boolean; mounted: boolean; session: number }
export const INITIAL_HOLOGRAM_DISPLAY: HologramDisplayState = { active: false, mounted: false, session: 0 }
export function toggleHologramDisplay(state: HologramDisplayState): HologramDisplayState {
  return { active: !state.active, mounted: true, session: state.session + 1 }
}
export function finishHologramExit(state: HologramDisplayState, session: number): HologramDisplayState {
  return state.active || state.session !== session ? state : { ...state, mounted: false }
}
export function clearHologramDisplay(state: HologramDisplayState): HologramDisplayState {
  return { active: false, mounted: false, session: state.session + 1 }
}
