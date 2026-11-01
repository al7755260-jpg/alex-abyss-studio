export const CLIENT_LOGOS = [
  { id: 'anta', name: '安踏', position: [-1.14, 0.83, -0.2], rotation: [-0.08, 0.13, 0.05], width: 0.93, maxHeight: 0.53 },
  { id: 'shougang-park', name: '首钢园', position: [0.03, 1.48, 0.2], rotation: [0.08, -0.12, -0.02], width: 1.1, maxHeight: 0.86 },
  { id: 'midea', name: '美的', position: [1.2, 0.8, 0.65], rotation: [-0.1, -0.2, -0.04], width: 0.98, maxHeight: 0.46 },
  { id: 'fila', name: '斐乐', position: [-1.15, -0.67, 0.85], rotation: [0.1, 0.19, -0.05], width: 0.96, maxHeight: 0.45 },
  { id: 'descente', name: '迪桑特', position: [0.04, -1.27, 1.18], rotation: [-0.12, -0.14, 0.04], width: 0.7, maxHeight: 0.65 },
  { id: 'kolon', name: '可隆', position: [1.25, -0.67, -0.05], rotation: [0.08, -0.18, 0.04], width: 0.74, maxHeight: 0.65 },
] as const

export type ClientLogo = typeof CLIENT_LOGOS[number]

// Lamp-local yaw: composes the reference's six rays from the opening view.
// Positions are fixed in 3D, never billboarded or repositioned with the camera.
export const HOLOGRAM_LAYOUT_YAW = 0.98
export const HOLOGRAM_CHARGE_SECONDS = 0.35
export const HOLOGRAM_STAGGER_SECONDS = 0.28
export const HOLOGRAM_REVEAL_SECONDS = 0.65
export const HOLOGRAM_TOTAL_SECONDS = HOLOGRAM_CHARGE_SECONDS
  + (CLIENT_LOGOS.length - 1) * HOLOGRAM_STAGGER_SECONDS + HOLOGRAM_REVEAL_SECONDS

/** Reversible sequence, with no timers that can fire after closing/unmounting. */
export class ClientHologramPlayback {
  elapsed = 0

  advance(deltaSeconds: number, open: boolean, reducedMotion = false) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Hologram delta must be finite and non-negative')
    }
    if (reducedMotion) this.elapsed = open ? HOLOGRAM_TOTAL_SECONDS : 0
    else this.elapsed = Math.max(0, Math.min(HOLOGRAM_TOTAL_SECONDS,
      this.elapsed + deltaSeconds * (open ? 1 : -2.5)))
    return this.elapsed
  }

  reveal(index: number) {
    const linear = Math.max(0, Math.min(1,
      (this.elapsed - HOLOGRAM_CHARGE_SECONDS - index * HOLOGRAM_STAGGER_SECONDS)
      / HOLOGRAM_REVEAL_SECONDS))
    return linear * linear * (3 - 2 * linear)
  }
}
