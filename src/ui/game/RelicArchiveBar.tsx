import {
  HIDDEN_RELICS,
  type HiddenRelicId,
} from '../../data/hiddenRelics'
import { StudioTextLayer } from '../editor/StudioTextLayer'

type RelicArchiveBarProps = {
  foundRelicIds: readonly HiddenRelicId[]
  selectedRelicId: HiddenRelicId | null
  undiscoveredLabel: string
  onSelect: (relicId: HiddenRelicId) => void
}

export function RelicArchiveBar({
  foundRelicIds,
  selectedRelicId,
  undiscoveredLabel,
  onSelect,
}: RelicArchiveBarProps) {
  const found = new Set(foundRelicIds)

  return (
    <section className="relic-archive" aria-label="六件吞噬遗物">
      <span className="relic-archive__ornament" aria-hidden="true" />
      <div className="relic-archive__slots">
        {HIDDEN_RELICS.map((relic) => {
          const discovered = found.has(relic.id)
          const selected = selectedRelicId === relic.id
          return (
            <button
              key={relic.id}
              type="button"
              className={`relic-slot ${discovered ? 'relic-slot--found' : ''} ${selected ? 'relic-slot--selected' : ''}`}
              disabled={!discovered}
              aria-label={discovered
                ? `${relic.name}：${relic.location}`
                : `${undiscoveredLabel || '未发现的遗物'} ${relic.order}`}
              aria-pressed={selected}
              onClick={() => discovered && onSelect(relic.id)}
            >
              <span className="relic-slot__number">0{relic.order}</span>
              <strong>{discovered ? relic.glyph : '·'}</strong>
              <small>
                {discovered
                  ? relic.name
                  : <StudioTextLayer layerId="undiscoveredRelicLabel">{undiscoveredLabel}</StudioTextLayer>}
              </small>
            </button>
          )
        })}
      </div>
      <span className="relic-archive__ornament relic-archive__ornament--right" aria-hidden="true" />
    </section>
  )
}
