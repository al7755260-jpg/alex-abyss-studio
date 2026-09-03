import {
  loadStudioCopy,
  STUDIO_ASSET_LABEL_MAX_LENGTH,
  STUDIO_COPY_FIELD_LIMITS,
  STUDIO_COPY_STORAGE_KEY,
  type StudioCopy,
  type StudioCopyField,
} from './studioCopy.ts'
import {
  loadStudioLayout,
  STUDIO_LAYOUT_STORAGE_KEY,
  type StudioLayout,
} from './studioLayout.ts'
import {
  sanitizeStudioLighting,
  type StudioLightingSettings,
} from './studioLighting.ts'
import {
  loadStudioTextLayout,
  STUDIO_TEXT_LAYOUT_STORAGE_KEY,
  type StudioTextLayout,
} from './studioTextLayout.ts'

export const STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION = 1 as const
export const STUDIO_SCENE_SNAPSHOT_FILENAME = 'alex-abyss-studio-scene-v1.json'

/** Only authored scene presentation belongs in a published snapshot. */
export type StudioSceneSnapshot = {
  schemaVersion: typeof STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION
  layout: StudioLayout
  copy: StudioCopy
  textLayout: StudioTextLayout
  lighting: StudioLightingSettings
}

export type StudioSceneSnapshotDefaults = Omit<StudioSceneSnapshot, 'schemaVersion'>

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function numericTuple(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length === 3
    && value.every((component) => typeof component === 'number')
    ? [value[0], value[1], value[2]]
    : undefined
}

function boundedText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.length <= maximum ? value : undefined
}

/** Project before serialization: unknown keys, nested payloads and toJSON are not read. */
function projectLayout(value: unknown, defaults: StudioLayout) {
  const stored = asRecord(value)
  return Object.fromEntries(Object.keys(defaults).map((id) => {
    const transform = asRecord(stored?.[id])
    return [id, {
      position: numericTuple(transform?.position),
      rotation: numericTuple(transform?.rotation),
      // An invalid supplied scale must not be mistaken for an absent legacy scale.
      scale: transform?.scale === undefined ? undefined : numericTuple(transform.scale) ?? null,
    }]
  }))
}

function projectCopy(value: unknown, defaults: StudioCopy) {
  const stored = asRecord(value)
  const labels = asRecord(stored?.assetLabels)
  return {
    ...Object.fromEntries((Object.keys(STUDIO_COPY_FIELD_LIMITS) as StudioCopyField[]).map(
      (field) => [field, boundedText(stored?.[field], STUDIO_COPY_FIELD_LIMITS[field])],
    )),
    assetLabels: Object.fromEntries(Object.keys(defaults.assetLabels).map(
      (id) => [id, boundedText(labels?.[id], STUDIO_ASSET_LABEL_MAX_LENGTH)],
    )),
  }
}

function projectTextLayout(value: unknown, defaults: StudioTextLayout) {
  const stored = asRecord(value)
  return Object.fromEntries(Object.keys(defaults).map((id) => {
    const transform = asRecord(stored?.[id])
    return [id, Object.fromEntries(['x', 'y', 'rotation', 'scale'].map(
      (field) => [field, typeof transform?.[field] === 'number' ? transform[field] : undefined],
    ))]
  }))
}

function memoryValue(key: string, value: unknown) {
  return {
    getItem(requestedKey: string): string | null {
      return requestedKey === key ? JSON.stringify(value) ?? null : null
    },
  }
}

/**
 * Resolve an untrusted published snapshot against trusted code defaults.
 * Reuses editor validation through in-memory adapters, never browser storage.
 * Game progress, account data and other browser state are deliberately excluded.
 */
export function resolveSceneSnapshot(
  candidate: unknown,
  defaults: StudioSceneSnapshotDefaults,
): StudioSceneSnapshot {
  const record = asRecord(candidate)
  const stored = record?.schemaVersion === STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION ? record : null

  return {
    schemaVersion: STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION,
    layout: loadStudioLayout(
      memoryValue(STUDIO_LAYOUT_STORAGE_KEY, projectLayout(stored?.layout, defaults.layout)),
      defaults.layout,
    ),
    copy: loadStudioCopy(
      memoryValue(STUDIO_COPY_STORAGE_KEY, projectCopy(stored?.copy, defaults.copy)),
      defaults.copy,
    ),
    textLayout: loadStudioTextLayout(
      memoryValue(STUDIO_TEXT_LAYOUT_STORAGE_KEY, projectTextLayout(stored?.textLayout, defaults.textLayout)),
      defaults.textLayout,
    ),
    lighting: sanitizeStudioLighting(stored?.lighting, defaults.lighting),
  }
}

/** Call only at explicit export time, not on each editor render. */
export function serializeSceneSnapshot(snapshot: StudioSceneSnapshot): string {
  return `${JSON.stringify(resolveSceneSnapshot(snapshot, snapshot), null, 2)}\n`
}
