export const STUDIO_LIGHTING_STORAGE_KEY = 'alex-abyss-studio:lighting:v1'

export const STUDIO_LIGHTING_FIELDS = [
  'globalIntensity',
  'ambientIntensity',
  'exposure',
] as const

export type StudioLightingField = typeof STUDIO_LIGHTING_FIELDS[number]

export type StudioLightingSettings = {
  globalIntensity: number
  ambientIntensity: number
  exposure: number
}

export type StudioLighting = StudioLightingSettings

export type StudioLightingStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type StudioLightingLimit = {
  min: number
  max: number
  step: number
}

export const STUDIO_LIGHTING_LIMITS = {
  globalIntensity: { min: 0, max: 2, step: 0.01 },
  ambientIntensity: { min: 0, max: 2, step: 0.01 },
  exposure: { min: 0.35, max: 1.8, step: 0.01 },
} as const satisfies Record<StudioLightingField, StudioLightingLimit>

export const DEFAULT_STUDIO_LIGHTING: Readonly<StudioLightingSettings> = Object.freeze({
  globalIntensity: 1,
  ambientIntensity: 1,
  exposure: 1.08,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStudioLightingField(value: unknown): value is StudioLightingField {
  return typeof value === 'string'
    && (STUDIO_LIGHTING_FIELDS as readonly string[]).includes(value)
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function clampStudioLightingValue(
  field: StudioLightingField,
  value: number,
): number {
  const limit = STUDIO_LIGHTING_LIMITS[field]
  return roundToTwoDecimals(Math.min(limit.max, Math.max(limit.min, value)))
}

export function cloneStudioLighting(
  lighting: Readonly<StudioLightingSettings>,
): StudioLightingSettings {
  return {
    globalIntensity: lighting.globalIntensity,
    ambientIntensity: lighting.ambientIntensity,
    exposure: lighting.exposure,
  }
}

function fallbackValue(
  field: StudioLightingField,
  defaults: Readonly<StudioLightingSettings>,
): number {
  const candidate = defaults[field]
  return isFiniteNumber(candidate)
    ? clampStudioLightingValue(field, candidate)
    : DEFAULT_STUDIO_LIGHTING[field]
}

/**
 * Projects untrusted data onto the fixed lighting schema. Extra keys are
 * discarded, malformed fields fall back independently, and valid numbers are
 * clamped to the editor's safe ranges.
 */
export function sanitizeStudioLighting(
  value: unknown,
  defaults: Readonly<StudioLightingSettings> = DEFAULT_STUDIO_LIGHTING,
): StudioLightingSettings {
  const stored = isRecord(value) ? value : null

  return {
    globalIntensity: isFiniteNumber(stored?.globalIntensity)
      ? clampStudioLightingValue('globalIntensity', stored.globalIntensity)
      : fallbackValue('globalIntensity', defaults),
    ambientIntensity: isFiniteNumber(stored?.ambientIntensity)
      ? clampStudioLightingValue('ambientIntensity', stored.ambientIntensity)
      : fallbackValue('ambientIntensity', defaults),
    exposure: isFiniteNumber(stored?.exposure)
      ? clampStudioLightingValue('exposure', stored.exposure)
      : fallbackValue('exposure', defaults),
  }
}

function hasCompleteFiniteSchema(value: unknown): value is StudioLightingSettings {
  return isRecord(value)
    && STUDIO_LIGHTING_FIELDS.every((field) => isFiniteNumber(value[field]))
}

export function loadStudioLighting(
  storage: Pick<StudioLightingStorage, 'getItem'> | null | undefined,
  defaults: Readonly<StudioLightingSettings> = DEFAULT_STUDIO_LIGHTING,
): StudioLightingSettings {
  if (!storage) return sanitizeStudioLighting(null, defaults)

  try {
    const serialized = storage.getItem(STUDIO_LIGHTING_STORAGE_KEY)
    if (serialized === null) return sanitizeStudioLighting(null, defaults)
    return sanitizeStudioLighting(JSON.parse(serialized) as unknown, defaults)
  } catch {
    return sanitizeStudioLighting(null, defaults)
  }
}

export function saveStudioLighting(
  storage: Pick<StudioLightingStorage, 'setItem'> | null | undefined,
  lighting: unknown,
): boolean {
  if (!storage || !hasCompleteFiniteSchema(lighting)) return false

  try {
    storage.setItem(
      STUDIO_LIGHTING_STORAGE_KEY,
      JSON.stringify(sanitizeStudioLighting(lighting)),
    )
    return true
  } catch {
    return false
  }
}

export function updateStudioLighting(
  lighting: StudioLightingSettings,
  field: StudioLightingField,
  value: number,
): StudioLightingSettings {
  if (!isStudioLightingField(field) || !isFiniteNumber(value)) return lighting

  const nextValue = clampStudioLightingValue(field, value)
  if (lighting[field] === nextValue) return lighting

  return {
    ...lighting,
    [field]: nextValue,
  }
}

export function studioLightingEqual(
  left: Readonly<StudioLightingSettings>,
  right: Readonly<StudioLightingSettings>,
): boolean {
  return STUDIO_LIGHTING_FIELDS.every((field) => left[field] === right[field])
}
