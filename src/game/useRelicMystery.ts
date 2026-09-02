import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { HiddenRelicId } from '../data/hiddenRelics'
import {
  INITIAL_MYSTERY_STATE,
  mysteryReducer,
} from './mysteryState'

const STORAGE_KEY = 'alex-abyss-studio:relic-progress:v1'

type StoredProgress = {
  foundRelicIds?: string[]
  endingCompleted?: boolean
}

function readStoredProgress(): StoredProgress | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) as StoredProgress : null
  } catch {
    return null
  }
}

function consumeRestartRequest() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('restart') !== '1') return false

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // A fresh in-memory run still works when storage is unavailable.
  }

  params.delete('restart')
  const search = params.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  )
  return true
}

export function useRelicMystery() {
  const [state, dispatch] = useReducer(
    mysteryReducer,
    INITIAL_MYSTERY_STATE,
    (initialState) => {
      if (typeof window === 'undefined') return initialState
      if (consumeRestartRequest()) return initialState
      const stored = readStoredProgress()
      if (!stored) return initialState
      const restored = mysteryReducer(initialState, {
        type: 'RESTORE_PROGRESS',
        foundRelicIds: Array.isArray(stored.foundRelicIds) ? stored.foundRelicIds : [],
        endingCompleted: stored.endingCompleted === true,
      })
      return new URLSearchParams(window.location.search).get('view') === 'finale'
        ? mysteryReducer(restored, { type: 'OPEN_FINALE' })
        : restored
    },
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        foundRelicIds: state.foundRelicIds,
        endingCompleted: state.endingCompleted,
      }))
    } catch {
      // Progress persistence is optional when storage is unavailable.
    }
  }, [state.endingCompleted, state.foundRelicIds])

  const openRelic = useCallback((relicId: HiddenRelicId) => {
    dispatch({ type: 'OPEN_RELIC', relicId })
  }, [])
  const returnToStudio = useCallback(() => {
    dispatch({ type: 'RETURN_TO_STUDIO' })
  }, [])
  const openFinale = useCallback(() => {
    dispatch({ type: 'OPEN_FINALE' })
  }, [])
  const completeFinale = useCallback(() => {
    dispatch({ type: 'COMPLETE_FINALE' })
  }, [])
  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET_GAME' })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && state.view.kind === 'relic') {
        event.preventDefault()
        returnToStudio()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [returnToStudio, state.view.kind])

  const actions = useMemo(() => ({
      openRelic,
      returnToStudio,
      openFinale,
      completeFinale,
      resetGame,
  }), [completeFinale, openFinale, openRelic, resetGame, returnToStudio])

  return {
    state,
    actions,
  }
}

export type RelicMystery = ReturnType<typeof useRelicMystery>
