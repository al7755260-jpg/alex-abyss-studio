export { resolveAttachedPoint } from './resolveAttachedPoint.ts'

export const STUDIO_LAYOUT_STORAGE_KEY = 'alex-abyss-studio:layout:v2'
export const STUDIO_LAYOUT_LEGACY_STORAGE_KEY = 'alex-abyss-studio:layout:v1'
export const STUDIO_LAYOUT_HISTORY_LIMIT = 30
export const STUDIO_SCALE_MIN = 0.35
export const STUDIO_SCALE_MAX = 2
export const STUDIO_SCALE_STEP = 0.1

export type StudioVector3 = [number, number, number]

export type StudioTransform = {
  position: StudioVector3
  rotation: StudioVector3
  scale: StudioVector3
}

export type StudioLayout = Record<string, StudioTransform>

export type StudioLayoutAsset = {
  id: string
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale?: readonly [number, number, number]
}

export type StudioLayoutStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type StudioEditorTool = 'translate' | 'rotate' | 'scale'

export type StudioEditorState = {
  draft: StudioLayout
  saved: StudioLayout
  history: StudioLayout[]
  selectedAssetId: string | null
  tool: StudioEditorTool
}

export type StudioEditorAction =
  | { type: 'select'; assetId: string | null }
  | { type: 'set-tool'; tool: StudioEditorTool }
  | { type: 'commit'; transform: StudioTransform; assetId?: string }
  | { type: 'undo' }
  | { type: 'sync-saved' }
  | { type: 'mark-saved' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteVector3(value: unknown): value is StudioVector3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component))
}

function isFinitePositiveVector3(value: unknown): value is StudioVector3 {
  return isFiniteVector3(value) && value.every((component) => component > 0)
}

function isNormalizedScale(value: unknown): value is StudioVector3 {
  return isFinitePositiveVector3(value)
    && value.every((component) => component >= STUDIO_SCALE_MIN && component <= STUDIO_SCALE_MAX)
}

export function clampStudioScale(value: number) {
  return Math.min(STUDIO_SCALE_MAX, Math.max(STUDIO_SCALE_MIN, value))
}

export function isStudioTransform(value: unknown): value is StudioTransform {
  return isRecord(value)
    && isFiniteVector3(value.position)
    && isFiniteVector3(value.rotation)
    && isNormalizedScale(value.scale)
}

function cloneVector3(vector: readonly [number, number, number]): StudioVector3 {
  return [vector[0], vector[1], vector[2]]
}

function cloneTransform(transform: StudioTransform): StudioTransform {
  return {
    position: cloneVector3(transform.position),
    rotation: cloneVector3(transform.rotation),
    scale: cloneVector3(transform.scale),
  }
}

function normalizeTransform(
  value: unknown,
  fallback?: StudioTransform,
): StudioTransform | null {
  if (
    !isRecord(value)
    || !isFiniteVector3(value.position)
    || !isFiniteVector3(value.rotation)
  ) {
    return null
  }

  const fallbackScale = fallback?.scale ?? [1, 1, 1]
  const sourceScale = value.scale === undefined
    ? fallbackScale
    : isFinitePositiveVector3(value.scale)
      ? value.scale
      : null
  if (!sourceScale) return null

  return {
    position: cloneVector3(value.position),
    rotation: cloneVector3(value.rotation),
    scale: sourceScale.map((component) => clampStudioScale(component)) as StudioVector3,
  }
}

function cloneLayout(layout: StudioLayout): StudioLayout {
  return Object.fromEntries(
    Object.entries(layout).map(([id, transform]) => [id, cloneTransform(transform)]),
  )
}

function transformEquals(left: StudioTransform, right: StudioTransform): boolean {
  return left.position.every((component, index) => component === right.position[index])
    && left.rotation.every((component, index) => component === right.rotation[index])
    && left.scale.every((component, index) => component === right.scale[index])
}

/**
 * Projects an unknown persisted layout onto a trusted default layout. Unknown
 * ids are ignored, while missing or malformed entries retain their defaults.
 */
function sanitizeLayout(value: unknown, defaults: StudioLayout): StudioLayout {
  const stored = isRecord(value) ? value : null

  return Object.fromEntries(
    Object.entries(defaults).map(([id, defaultTransform]) => {
      const candidate = stored?.[id]
      return [id, normalizeTransform(candidate, defaultTransform) ?? cloneTransform(defaultTransform)]
    }),
  )
}

function isSavableLayout(layout: StudioLayout): boolean {
  return isRecord(layout)
    && Object.values(layout).every((transform) => isStudioTransform(transform))
}

function pushHistory(history: StudioLayout[], draft: StudioLayout): StudioLayout[] {
  return [...history, cloneLayout(draft)].slice(-STUDIO_LAYOUT_HISTORY_LIMIT)
}

export function createDefaultStudioLayout(
  assets: readonly StudioLayoutAsset[],
): StudioLayout {
  const layout: StudioLayout = {}

  for (const asset of assets) {
    if (!asset.id || Object.hasOwn(layout, asset.id)) {
      throw new TypeError(`Invalid or duplicate studio asset id: ${asset.id}`)
    }
    if (!isFiniteVector3(asset.position) || !isFiniteVector3(asset.rotation)) {
      throw new TypeError(`Studio asset ${asset.id} must use finite position and rotation tuples`)
    }

    const scale = asset.scale ?? [1, 1, 1]
    if (!isFinitePositiveVector3(scale)) {
      throw new TypeError(`Studio asset ${asset.id} must use a finite positive scale tuple`)
    }

    layout[asset.id] = {
      position: cloneVector3(asset.position),
      rotation: cloneVector3(asset.rotation),
      scale: scale.map((component) => clampStudioScale(component)) as StudioVector3,
    }
  }

  return layout
}

export function loadStudioLayout(
  storage: Pick<StudioLayoutStorage, 'getItem'> | null | undefined,
  defaults: StudioLayout,
  previousDefaults: StudioLayout = {},
): StudioLayout {
  if (!storage) return cloneLayout(defaults)

  try {
    for (const key of [STUDIO_LAYOUT_STORAGE_KEY, STUDIO_LAYOUT_LEGACY_STORAGE_KEY]) {
      const serialized = storage.getItem(key)
      if (serialized === null) continue
      try {
        const restored = sanitizeLayout(JSON.parse(serialized) as unknown, defaults)

        // Move an asset to its revised default only when the saved transform is
        // still exactly the former default. Any user-authored placement wins.
        for (const [id, previousDefault] of Object.entries(previousDefaults)) {
          const currentDefault = defaults[id]
          const restoredTransform = restored[id]
          const normalizedPreviousDefault = normalizeTransform(previousDefault)
          if (
            currentDefault
            && restoredTransform
            && normalizedPreviousDefault
            && transformEquals(restoredTransform, normalizedPreviousDefault)
          ) {
            restored[id] = cloneTransform(currentDefault)
          }
        }

        return restored
      } catch {
        // A malformed v2 entry must not prevent recovery from a valid v1 save.
      }
    }
    return cloneLayout(defaults)
  } catch {
    return cloneLayout(defaults)
  }
}

export function saveStudioLayout(
  storage: Pick<StudioLayoutStorage, 'setItem'> | null | undefined,
  layout: StudioLayout,
): boolean {
  if (!storage || !isSavableLayout(layout)) return false

  try {
    storage.setItem(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
    return true
  } catch {
    return false
  }
}

export function layoutsEqual(left: StudioLayout, right: StudioLayout): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  if (leftIds.length !== rightIds.length) return false

  return leftIds.every((id) => {
    const leftTransform = left[id]
    const rightTransform = right[id]
    return rightTransform !== undefined && transformEquals(leftTransform, rightTransform)
  })
}

export function createStudioEditorState(
  defaults: StudioLayout,
  loadedLayout: StudioLayout = defaults,
): StudioEditorState {
  const initialLayout = sanitizeLayout(loadedLayout, defaults)

  return {
    draft: cloneLayout(initialLayout),
    saved: cloneLayout(initialLayout),
    history: [],
    selectedAssetId: null,
    tool: 'translate',
  }
}

export function studioEditorReducer(
  state: StudioEditorState,
  action: StudioEditorAction,
): StudioEditorState {
  switch (action.type) {
    case 'select': {
      const selectedAssetId = action.assetId !== null && Object.hasOwn(state.draft, action.assetId)
        ? action.assetId
        : null
      return selectedAssetId === state.selectedAssetId
        ? state
        : { ...state, selectedAssetId }
    }

    case 'set-tool':
      return action.tool === state.tool ? state : { ...state, tool: action.tool }

    case 'commit': {
      const assetId = action.assetId ?? state.selectedAssetId
      const normalizedTransform = assetId === null
        ? null
        : normalizeTransform(action.transform, state.draft[assetId])
      if (
        assetId === null
        || !Object.hasOwn(state.draft, assetId)
        || !normalizedTransform
        || transformEquals(state.draft[assetId], normalizedTransform)
      ) {
        return state
      }

      return {
        ...state,
        draft: {
          ...state.draft,
          [assetId]: normalizedTransform,
        },
        history: pushHistory(state.history, state.draft),
      }
    }

    case 'undo': {
      const previousDraft = state.history.at(-1)
      if (!previousDraft) return state

      return {
        ...state,
        draft: cloneLayout(previousDraft),
        history: state.history.slice(0, -1),
      }
    }

    case 'sync-saved':
      if (layoutsEqual(state.draft, state.saved)) return state
      return {
        ...state,
        saved: cloneLayout(state.draft),
      }

    case 'mark-saved':
      if (layoutsEqual(state.draft, state.saved) && state.history.length === 0) return state
      return {
        ...state,
        saved: cloneLayout(state.draft),
        history: [],
      }
  }
}
