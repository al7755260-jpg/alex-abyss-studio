import { RUNES, type GameState, type RuneId } from '../../game/gameState'
import type { PuzzleGame } from '../../game/usePuzzleGame'
import {
  CloseIcon,
  EyeRuneIcon,
  FlameRuneIcon,
  MatrixRuneIcon,
} from './GameIcons'

const RUNE_ICONS = {
  gaze: EyeRuneIcon,
  matrix: MatrixRuneIcon,
  flame: FlameRuneIcon,
} as const

const RUNE_LABELS: Record<RuneId, string> = {
  gaze: '凝视',
  matrix: '点阵',
  flame: '烛火',
}

function feedbackFor(state: GameState) {
  if (state.puzzleResult === 'success') return '封印已解开。面具承认了你的顺序。'
  if (state.puzzleResult === 'error') return '顺序不符。猩红凝视夺走了少许理智。'
  if (state.puzzleResult === 'incomplete') return '三重祭位尚未填满。'
  if (state.runeSequence.length > 0) return '符文在低语，但顺序尚未完整。'
  return '选择第一枚符文，开始排列仪式顺序。'
}

type PuzzlePanelProps = {
  game: PuzzleGame
}

export function PuzzlePanel({ game }: PuzzlePanelProps) {
  const { state, actions } = game
  if (!state.puzzleOpen) return null

  return (
    <section
      className={`puzzle-panel occult-frame puzzle-panel--${state.puzzleResult}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="puzzle-title"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <span className="puzzle-panel__skull" aria-hidden="true">◆</span>
      <button
        className="puzzle-panel__close"
        type="button"
        aria-label="关闭谜题面板"
        autoFocus
        onClick={actions.closePuzzle}
      >
        <CloseIcon />
      </button>

      <header className="puzzle-panel__header">
        <h2 id="puzzle-title">猩红凝视</h2>
        <p>依照线索，排列三枚符文。</p>
      </header>

      <div className="puzzle-sockets" aria-label="当前符文顺序">
        {[0, 1, 2].map((index) => {
          const runeId = state.runeSequence[index]
          const Icon = runeId ? RUNE_ICONS[runeId] : null
          return (
            <div
              className={`puzzle-socket ${runeId ? 'puzzle-socket--filled' : ''}`}
              key={index}
            >
              <span>{['Ⅰ', 'Ⅱ', 'Ⅲ'][index]}</span>
              <div className="puzzle-socket__ring">
                {Icon ? <Icon /> : <i aria-hidden="true" />}
              </div>
              <strong>{runeId ? RUNE_LABELS[runeId] : '未置入'}</strong>
            </div>
          )
        })}
      </div>

      <div className="rune-bank" aria-label="可选符文">
        {RUNES.map((rune, index) => {
          const Icon = RUNE_ICONS[rune.id]
          const selected = state.runeSequence.includes(rune.id)
          return (
            <button
              className={`rune-token ${selected ? 'rune-token--selected' : ''}`}
              type="button"
              key={rune.id}
              aria-label={`${index + 1}：选择${rune.label}符文`}
              aria-pressed={selected}
              disabled={state.solved || selected}
              onClick={() => actions.selectRune(rune.id)}
            >
              <span className="rune-token__index">{index + 1}</span>
              <Icon />
              <strong>{rune.label}</strong>
            </button>
          )
        })}
      </div>

      <p className="puzzle-panel__feedback" role="status" aria-live="polite">
        {feedbackFor(state)}
      </p>

      <div className="puzzle-panel__actions">
        <button
          type="button"
          className="ritual-button ritual-button--secondary"
          disabled={state.solved || state.runeSequence.length === 0}
          onClick={actions.undoRune}
        >
          撤回
        </button>
        <button
          type="button"
          className="ritual-button ritual-button--secondary"
          disabled={state.solved || state.runeSequence.length === 0}
          onClick={actions.clearRunes}
        >
          清除
        </button>
        <button
          type="button"
          className="ritual-button ritual-button--primary"
          disabled={state.solved}
          onClick={actions.confirmSequence}
        >
          {state.solved ? '封印已解开' : '确认顺序'}
        </button>
      </div>

      <p className="puzzle-panel__keys">
        <kbd>1–3</kbd> 选择符文 <i /> <kbd>Enter</kbd> 确认 <i /> <kbd>Esc</kbd> 关闭
      </p>
    </section>
  )
}
