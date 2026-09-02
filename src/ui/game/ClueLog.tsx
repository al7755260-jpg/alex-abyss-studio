import { CLUES, type RuneId } from '../../game/gameState'
import {
  ChevronIcon,
  EyeRuneIcon,
  FlameRuneIcon,
  MatrixRuneIcon,
} from './GameIcons'

const CLUE_ICONS = {
  gaze: EyeRuneIcon,
  matrix: MatrixRuneIcon,
  flame: FlameRuneIcon,
} as const

type ClueLogProps = {
  open: boolean
  selectedClueId: RuneId
  onToggle: () => void
  onSelect: (clueId: RuneId) => void
}

export function ClueLog({
  open,
  selectedClueId,
  onToggle,
  onSelect,
}: ClueLogProps) {
  return (
    <aside
      className={`clue-log occult-frame ${open ? 'clue-log--open' : ''}`}
      id="clue-log"
      aria-label="线索日志"
    >
      <button
        className="clue-log__header"
        type="button"
        aria-expanded={open}
        aria-controls="clue-log-list"
        onClick={onToggle}
      >
        <span>线索日志</span>
        <ChevronIcon className="clue-log__chevron" />
      </button>

      <div className="clue-log__body" id="clue-log-list" aria-hidden={!open}>
        {CLUES.map((clue) => {
          const Icon = CLUE_ICONS[clue.id]
          const selected = clue.id === selectedClueId
          return (
            <button
              className={`clue-entry ${selected ? 'clue-entry--selected' : ''}`}
              type="button"
              key={clue.id}
              aria-pressed={selected}
              onClick={() => onSelect(clue.id)}
            >
              <span className="clue-entry__icon">
                <Icon />
              </span>
              <span className="clue-entry__copy">
                <strong>{clue.title}</strong>
                {selected ? <small>{clue.detail}</small> : null}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
