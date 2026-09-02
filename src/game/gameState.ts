export type RuneId = 'gaze' | 'matrix' | 'flame'

export type Clue = {
  id: RuneId
  title: string
  detail: string
}

export type InventoryIcon = 'key' | 'lens' | 'abyssKey'

export type InventoryItem = {
  id: string
  title: string
  description: string
  icon: InventoryIcon
}

export type PuzzleResult = 'idle' | 'incomplete' | 'error' | 'success'

export type GameState = {
  sanity: number
  clueOpen: boolean
  selectedClueId: RuneId
  selectedItemId: string | null
  puzzleOpen: boolean
  runeSequence: RuneId[]
  puzzleResult: PuzzleResult
  solved: boolean
  inventory: Array<InventoryItem | null>
}

export type GameAction =
  | { type: 'TOGGLE_CLUES' }
  | { type: 'SELECT_CLUE'; clueId: RuneId }
  | { type: 'SELECT_ITEM'; itemId: string }
  | { type: 'OPEN_PUZZLE' }
  | { type: 'CLOSE_PUZZLE' }
  | { type: 'SELECT_RUNE'; runeId: RuneId }
  | { type: 'UNDO_RUNE' }
  | { type: 'CLEAR_RUNES' }
  | { type: 'CONFIRM_SEQUENCE' }

export const RUNES: readonly { id: RuneId; label: string }[] = [
  { id: 'gaze', label: '凝视' },
  { id: 'matrix', label: '点阵' },
  { id: 'flame', label: '烛火' },
]

export const CLUES: readonly Clue[] = [
  {
    id: 'gaze',
    title: '墙上的凝视',
    detail: '最先苏醒的，是墙上没有名字的眼。',
  },
  {
    id: 'matrix',
    title: '血红点阵',
    detail: '名字不是答案，顺序才是。第二个符号藏在点阵间。',
  },
  {
    id: 'flame',
    title: '七支蜡烛',
    detail: '最后一簇火焰熄灭时，封印才会松动。',
  },
]

const COPPER_KEY: InventoryItem = {
  id: 'copper-key',
  title: '铜钥匙',
  description: '一把磨损的旧钥匙，齿口与任何现存锁孔都不吻合。',
  icon: 'key',
}

const ENGRAVED_LENS: InventoryItem = {
  id: 'engraved-lens',
  title: '刻纹镜片',
  description: '镜片背面刻着三个依次缩小的仪式环。',
  icon: 'lens',
}

const ABYSS_KEY: InventoryItem = {
  id: 'abyss-key',
  title: '深渊之钥',
  description: '面具承认正确顺序后凝结出的黑色钥匙。',
  icon: 'abyssKey',
}

const CORRECT_SEQUENCE: readonly RuneId[] = ['gaze', 'matrix', 'flame']

export const INITIAL_GAME_STATE: GameState = {
  sanity: 74,
  clueOpen: true,
  selectedClueId: 'matrix',
  selectedItemId: 'engraved-lens',
  puzzleOpen: false,
  runeSequence: [],
  puzzleResult: 'idle',
  solved: false,
  inventory: [COPPER_KEY, ENGRAVED_LENS, null, null, null],
}

function isCorrectSequence(sequence: readonly RuneId[]) {
  return CORRECT_SEQUENCE.every((rune, index) => sequence[index] === rune)
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'TOGGLE_CLUES':
      return { ...state, clueOpen: !state.clueOpen }
    case 'SELECT_CLUE':
      return { ...state, selectedClueId: action.clueId, clueOpen: true }
    case 'SELECT_ITEM':
      return { ...state, selectedItemId: action.itemId }
    case 'OPEN_PUZZLE':
      return { ...state, puzzleOpen: true, puzzleResult: state.solved ? 'success' : 'idle' }
    case 'CLOSE_PUZZLE':
      return { ...state, puzzleOpen: false, puzzleResult: state.solved ? 'success' : 'idle' }
    case 'SELECT_RUNE':
      if (
        state.solved ||
        state.runeSequence.length >= 3 ||
        state.runeSequence.includes(action.runeId)
      ) {
        return state
      }
      return {
        ...state,
        runeSequence: [...state.runeSequence, action.runeId],
        puzzleResult: 'idle',
      }
    case 'UNDO_RUNE':
      if (state.solved || state.runeSequence.length === 0) return state
      return {
        ...state,
        runeSequence: state.runeSequence.slice(0, -1),
        puzzleResult: 'idle',
      }
    case 'CLEAR_RUNES':
      if (state.solved) return state
      return { ...state, runeSequence: [], puzzleResult: 'idle' }
    case 'CONFIRM_SEQUENCE': {
      if (state.solved) return state
      if (state.runeSequence.length < 3) {
        return { ...state, puzzleResult: 'incomplete' }
      }
      if (!isCorrectSequence(state.runeSequence)) {
        return {
          ...state,
          sanity: Math.max(0, state.sanity - 3),
          runeSequence: [],
          puzzleResult: 'error',
        }
      }

      const inventory = [...state.inventory]
      inventory[2] = ABYSS_KEY
      return {
        ...state,
        solved: true,
        puzzleResult: 'success',
        selectedItemId: ABYSS_KEY.id,
        inventory,
      }
    }
    default:
      return state
  }
}
