export const LAMP_GLOW_DURATION_SECONDS = 0.96
export const LAMP_GLOBE_MATERIAL_NAME = 'Lamp_Glass_Globe'
export const LAMP_GLOBE_CENTER = [0.00319, 1.96228, -0.00477] as const
export const LAMP_GLOBE_RADIUS = 0.2081
export const LAMP_GLOBE_INTERACTION_RADIUS = 0.255
export const LAMP_RELIC_APERTURE_RADIUS = 0.12
// drowned-dream-core expressed in the lamp's default local coordinates.
export const LAMP_RELIC_APERTURE_CENTER = [0.0126, 1.782, 0.04235] as const

export type LampGlowSnapshot = Readonly<{
  level: number
  targetOn: boolean
  transitioning: boolean
}>

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function isLampGlobeRayAllowed(
  apertureDistance: number,
  globeCenterDistance = apertureDistance,
) {
  return Number.isFinite(apertureDistance)
    && Number.isFinite(globeCenterDistance)
    && apertureDistance > LAMP_RELIC_APERTURE_RADIUS
    && globeCenterDistance <= LAMP_GLOBE_INTERACTION_RADIUS
}

/** A soft S-curve with zero velocity at both ends. */
export function easeLampGlowLevel(level: number) {
  const clamped = clampUnit(level)
  return clamped * clamped * clamped * (
    clamped * (clamped * 6 - 15) + 10
  )
}

/**
 * Keeps the lamp transition independent from React renders and frame rate.
 * Reversing the target never resets `level`, so a second click during either
 * fade continues smoothly from the currently visible result.
 */
export class LampGlowController {
  private level = 0
  private targetOn = false
  private transitioning = false

  get snapshot(): LampGlowSnapshot {
    return {
      level: this.level,
      targetOn: this.targetOn,
      transitioning: this.transitioning,
    }
  }

  toggle(): LampGlowSnapshot {
    this.targetOn = !this.targetOn
    this.transitioning = Math.abs(this.level - Number(this.targetOn)) > 0.000001
    return this.snapshot
  }

  advance(deltaSeconds: number, reducedMotion = false): LampGlowSnapshot {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Lamp glow deltaSeconds must be a finite non-negative number')
    }

    if (reducedMotion) {
      this.level = this.targetOn ? 1 : 0
      this.transitioning = false
      return this.snapshot
    }

    if (this.transitioning && deltaSeconds > 0) {
      const direction = this.targetOn ? 1 : -1
      this.level = clampUnit(
        this.level + direction * deltaSeconds / LAMP_GLOW_DURATION_SECONDS,
      )
      if (this.level === Number(this.targetOn)) this.transitioning = false
    }

    return this.snapshot
  }
}
