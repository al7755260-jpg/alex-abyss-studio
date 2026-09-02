import {
  HIDDEN_RELIC_IDS,
  type HiddenRelicId,
} from '../data/hiddenRelics.ts'

export type MysteryView =
  | { kind: 'studio' }
  | { kind: 'relic'; relicId: HiddenRelicId }
  | { kind: 'finale' }

export type MysteryState = {
  foundRelicIds: HiddenRelicId[]
  view: MysteryView
  endingCompleted: boolean
  lastFoundRelicId: HiddenRelicId | null
}

export type MysteryAction =
  | { type: 'OPEN_RELIC'; relicId: HiddenRelicId }
  | { type: 'RETURN_TO_STUDIO' }
  | { type: 'OPEN_FINALE' }
  | { type: 'COMPLETE_FINALE' }
  | { type: 'RESET_GAME' }
  | { type: 'RESTORE_PROGRESS'; foundRelicIds: string[]; endingCompleted: boolean }

const VALID_RELIC_IDS = new Set<string>(HIDDEN_RELIC_IDS)

export const INITIAL_MYSTERY_STATE: MysteryState = {
  foundRelicIds: [],
  view: { kind: 'studio' },
  endingCompleted: false,
  lastFoundRelicId: null,
}

export function sanitizeFoundRelicIds(ids: readonly string[]) {
  return [...new Set(ids.filter((id): id is HiddenRelicId => VALID_RELIC_IDS.has(id)))]
}

export function hasFoundAllRelics(state: Pick<MysteryState, 'foundRelicIds'>) {
  return state.foundRelicIds.length === HIDDEN_RELIC_IDS.length
}

export function mysteryReducer(
  state: MysteryState,
  action: MysteryAction,
): MysteryState {
  switch (action.type) {
    case 'OPEN_RELIC': {
      if (!VALID_RELIC_IDS.has(action.relicId)) return state
      const alreadyFound = state.foundRelicIds.includes(action.relicId)
      return {
        ...state,
        foundRelicIds: alreadyFound
          ? state.foundRelicIds
          : [...state.foundRelicIds, action.relicId],
        lastFoundRelicId: action.relicId,
        view: { kind: 'relic', relicId: action.relicId },
      }
    }
    case 'RETURN_TO_STUDIO':
      return { ...state, view: { kind: 'studio' } }
    case 'OPEN_FINALE':
      return hasFoundAllRelics(state)
        ? { ...state, view: { kind: 'finale' } }
        : state
    case 'COMPLETE_FINALE':
      return hasFoundAllRelics(state)
        ? { ...state, endingCompleted: true, view: { kind: 'finale' } }
        : state
    case 'RESET_GAME':
      return {
        foundRelicIds: [],
        view: { kind: 'studio' },
        endingCompleted: false,
        lastFoundRelicId: null,
      }
    case 'RESTORE_PROGRESS': {
      const foundRelicIds = sanitizeFoundRelicIds(action.foundRelicIds)
      return {
        ...state,
        foundRelicIds,
        endingCompleted: action.endingCompleted && foundRelicIds.length === HIDDEN_RELIC_IDS.length,
      }
    }
    default:
      return state
  }
}
