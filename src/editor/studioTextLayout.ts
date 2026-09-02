export const STUDIO_TEXT_LAYOUT_STORAGE_KEY = 'alex-abyss-studio:text-layout:v1'
export const STUDIO_TEXT_LAYOUT_HISTORY_LIMIT = 30
export const STUDIO_TEXT_POSITION_MIN = -1
export const STUDIO_TEXT_POSITION_MAX = 1
export const STUDIO_TEXT_ROTATION_MIN = -180
export const STUDIO_TEXT_ROTATION_MAX = 180
export const STUDIO_TEXT_SCALE_MIN = 0.35
export const STUDIO_TEXT_SCALE_MAX = 2

export type StudioTextTransform = {
  x: number
  y: number
  rotation: number
  scale: number
}

export type StudioTextLayout = Record<string, StudioTextTransform>

export type StudioTextLayoutStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type StudioTextEditorTool = 'translate' | 'rotate' | 'scale'

export type StudioTextEditorState = {
  draft: StudioTextLayout
  saved: StudioTextLayout
  history: StudioTextLayout[]
  selectedLayerId: string | null
  tool: StudioTextEditorTool
}

export type StudioTextEditorAction =
  | { type: 'select'; layerId: string | null }
  | { type: 'set-tool'; tool: StudioTextEditorTool }
  | { type: 'commit'; transform: StudioTextTransform; layerId?: string }
  | { type: 'undo' }
  | { type: 'sync-saved' }
  | { type: 'mark-saved' }
  | { type: 'reset'; defaults: StudioTextLayout }

export const DEFAULT_STUDIO_TEXT_TRANSFORM: Readonly<StudioTextTransform> = Object.freeze({
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, minimum: number, maximum: number): number {
  const clamped = Math.min(maximum, Math.max(minimum, value))
  return Object.is(clamped, -0) ? 0 : clamped
}

export function clampStudioTextPosition(value: number): number {
  return clamp(value, STUDIO_TEXT_POSITION_MIN, STUDIO_TEXT_POSITION_MAX)
}

export function clampStudioTextRotation(value: number): number {
  return clamp(value, STUDIO_TEXT_ROTATION_MIN, STUDIO_TEXT_ROTATION_MAX)
}

export function clampStudioTextScale(value: number): number {
  return clamp(value, STUDIO_TEXT_SCALE_MIN, STUDIO_TEXT_SCALE_MAX)
}

function normalizeTextTransform(value: unknown): StudioTextTransform | null {
  if (
    !isRecord(value)
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.rotation)
    || !isFiniteNumber(value.scale)
  ) {
    return null
  }

  return {
    x: clampStudioTextPosition(value.x),
    y: clampStudioTextPosition(value.y),
    rotation: clampStudioTextRotation(value.rotation),
    scale: clampStudioTextScale(value.scale),
  }
}

function cloneTextTransform(transform: StudioTextTransform): StudioTextTransform {
  return {
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
    scale: transform.scale,
  }
}

export function cloneStudioTextLayout(layout: StudioTextLayout): StudioTextLayout {
  return Object.fromEntries(
    Object.entries(layout).map(([id, transform]) => [id, cloneTextTransform(transform)]),
  )
}

function transformEquals(left: StudioTextTransform, right: StudioTextTransform): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.rotation === right.rotation
    && left.scale === right.scale
}

/**
 * Projects persisted data onto the caller's trusted list of text layer ids.
 * Unknown ids are discarded; missing or malformed layers retain defaults.
 */
function sanitizeStudioTextLayout(
  value: unknown,
  defaults: StudioTextLayout,
): StudioTextLayout {
  const stored = isRecord(value) ? value : null

  return Object.fromEntries(
    Object.entries(defaults).map(([id, defaultTransform]) => {
      const fallback = normalizeTextTransform(defaultTransform)
      if (!fallback) {
        throw new TypeError(`Studio text layer ${id} must use finite transform values`)
      }
      return [id, normalizeTextTransform(stored?.[id]) ?? fallback]
    }),
  )
}

function isSavableStudioTextLayout(value: unknown): value is StudioTextLayout {
  return isRecord(value)
    && Object.entries(value).every(([id, transform]) => (
      id.length > 0 && normalizeTextTransform(transform) !== null
    ))
}

function pushHistory(
  history: StudioTextLayout[],
  draft: StudioTextLayout,
): StudioTextLayout[] {
  return [...history, cloneStudioTextLayout(draft)].slice(-STUDIO_TEXT_LAYOUT_HISTORY_LIMIT)
}

export function createDefaultStudioTextLayout(
  ids: readonly string[],
): StudioTextLayout {
  const layout: StudioTextLayout = {}

  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || Object.hasOwn(layout, id)) {
      throw new TypeError(`Invalid or duplicate studio text layer id: ${String(id)}`)
    }
    layout[id] = cloneTextTransform(DEFAULT_STUDIO_TEXT_TRANSFORM)
  }

  return layout
}

export function resetStudioTextLayout(defaults: StudioTextLayout): StudioTextLayout {
  return sanitizeStudioTextLayout(null, defaults)
}

export function loadStudioTextLayout(
  storage: Pick<StudioTextLayoutStorage, 'getItem'> | null | undefined,
  defaults: StudioTextLayout,
): StudioTextLayout {
  if (!storage) return resetStudioTextLayout(defaults)

  try {
    const serialized = storage.getItem(STUDIO_TEXT_LAYOUT_STORAGE_KEY)
    if (serialized === null) return resetStudioTextLayout(defaults)
    return sanitizeStudioTextLayout(JSON.parse(serialized) as unknown, defaults)
  } catch {
    return resetStudioTextLayout(defaults)
  }
}

export function saveStudioTextLayout(
  storage: Pick<StudioTextLayoutStorage, 'setItem'> | null | undefined,
  layout: StudioTextLayout,
): boolean {
  if (!storage || !isSavableStudioTextLayout(layout)) return false

  try {
    const normalized = sanitizeStudioTextLayout(layout, layout)
    storage.setItem(STUDIO_TEXT_LAYOUT_STORAGE_KEY, JSON.stringify(normalized))
    return true
  } catch {
    return false
  }
}

export function studioTextLayoutsEqual(
  left: StudioTextLayout,
  right: StudioTextLayout,
): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  if (leftIds.length !== rightIds.length) return false

  return leftIds.every((id) => {
    const leftTransform = left[id]
    const rightTransform = right[id]
    return rightTransform !== undefined && transformEquals(leftTransform, rightTransform)
  })
}

export const textLayoutsEqual = studioTextLayoutsEqual

export function createStudioTextEditorState(
  defaults: StudioTextLayout,
  loadedLayout: StudioTextLayout = defaults,
): StudioTextEditorState {
  const initialLayout = sanitizeStudioTextLayout(loadedLayout, defaults)

  return {
    draft: cloneStudioTextLayout(initialLayout),
    saved: cloneStudioTextLayout(initialLayout),
    history: [],
    selectedLayerId: null,
    tool: 'translate',
  }
}

export function studioTextEditorReducer(
  state: StudioTextEditorState,
  action: StudioTextEditorAction,
): StudioTextEditorState {
  switch (action.type) {
    case 'select': {
      const selectedLayerId = action.layerId !== null && Object.hasOwn(state.draft, action.layerId)
        ? action.layerId
        : null
      return selectedLayerId === state.selectedLayerId
        ? state
        : { ...state, selectedLayerId }
    }

    case 'set-tool':
      return action.tool === state.tool ? state : { ...state, tool: action.tool }

    case 'commit': {
      const layerId = action.layerId ?? state.selectedLayerId
      const normalizedTransform = normalizeTextTransform(action.transform)
      if (
        layerId === null
        || !Object.hasOwn(state.draft, layerId)
        || !normalizedTransform
        || transformEquals(state.draft[layerId], normalizedTransform)
      ) {
        return state
      }

      return {
        ...state,
        draft: {
          ...state.draft,
          [layerId]: normalizedTransform,
        },
        history: pushHistory(state.history, state.draft),
      }
    }

    case 'undo': {
      const previousDraft = state.history.at(-1)
      if (!previousDraft) return state

      return {
        ...state,
        draft: cloneStudioTextLayout(previousDraft),
        history: state.history.slice(0, -1),
      }
    }

    case 'sync-saved':
      if (studioTextLayoutsEqual(state.draft, state.saved)) return state
      return {
        ...state,
        saved: cloneStudioTextLayout(state.draft),
      }

    case 'mark-saved':
      if (studioTextLayoutsEqual(state.draft, state.saved) && state.history.length === 0) return state
      return {
        ...state,
        saved: cloneStudioTextLayout(state.draft),
        history: [],
      }

    case 'reset': {
      const resetDraft = resetStudioTextLayout(action.defaults)
      if (studioTextLayoutsEqual(state.draft, resetDraft)) return state

      return {
        ...state,
        draft: resetDraft,
        history: pushHistory(state.history, state.draft),
        selectedLayerId: state.selectedLayerId !== null
          && Object.hasOwn(resetDraft, state.selectedLayerId)
          ? state.selectedLayerId
          : null,
      }
    }
  }
}
