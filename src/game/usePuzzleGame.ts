import { useCallback, useEffect, useReducer } from 'react'
import {
  gameReducer,
  INITIAL_GAME_STATE,
  type RuneId,
} from './gameState'

const RUNE_KEYS: Record<string, RuneId> = {
  '1': 'gaze',
  '2': 'matrix',
  '3': 'flame',
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function usePuzzleGame() {
  const [state, dispatch] = useReducer(
    gameReducer,
    INITIAL_GAME_STATE,
    (initialState) => ({
      ...initialState,
      clueOpen:
        typeof window === 'undefined' ||
        !window.matchMedia('(max-width: 720px)').matches,
    }),
  )

  const toggleClues = useCallback(() => dispatch({ type: 'TOGGLE_CLUES' }), [])
  const selectClue = useCallback(
    (clueId: RuneId) => dispatch({ type: 'SELECT_CLUE', clueId }),
    [],
  )
  const selectItem = useCallback(
    (itemId: string) => dispatch({ type: 'SELECT_ITEM', itemId }),
    [],
  )
  const openPuzzle = useCallback(() => dispatch({ type: 'OPEN_PUZZLE' }), [])
  const closePuzzle = useCallback(() => dispatch({ type: 'CLOSE_PUZZLE' }), [])
  const selectRune = useCallback(
    (runeId: RuneId) => dispatch({ type: 'SELECT_RUNE', runeId }),
    [],
  )
  const undoRune = useCallback(() => dispatch({ type: 'UNDO_RUNE' }), [])
  const clearRunes = useCallback(() => dispatch({ type: 'CLEAR_RUNES' }), [])
  const confirmSequence = useCallback(
    () => dispatch({ type: 'CONFIRM_SEQUENCE' }),
    [],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return

      const key = event.key.toLowerCase()
      if (key === 'j') {
        event.preventDefault()
        toggleClues()
        return
      }
      if (key === 'e' && !state.puzzleOpen) {
        event.preventDefault()
        openPuzzle()
        return
      }
      if (!state.puzzleOpen) return

      if (key === 'escape') {
        event.preventDefault()
        closePuzzle()
      } else if (key === 'backspace') {
        event.preventDefault()
        undoRune()
      } else if (key === 'enter') {
        event.preventDefault()
        confirmSequence()
      } else if (key === 'r') {
        event.preventDefault()
        clearRunes()
      } else if (RUNE_KEYS[key]) {
        event.preventDefault()
        selectRune(RUNE_KEYS[key])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    clearRunes,
    closePuzzle,
    confirmSequence,
    openPuzzle,
    selectRune,
    state.puzzleOpen,
    toggleClues,
    undoRune,
  ])

  return {
    state,
    actions: {
      toggleClues,
      selectClue,
      selectItem,
      openPuzzle,
      closePuzzle,
      selectRune,
      undoRune,
      clearRunes,
      confirmSequence,
    },
  }
}

export type PuzzleGame = ReturnType<typeof usePuzzleGame>
