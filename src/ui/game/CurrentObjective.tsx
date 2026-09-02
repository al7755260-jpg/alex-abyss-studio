import { HIDDEN_RELICS } from '../../data/hiddenRelics'
import type { StudioCopy } from '../../editor/studioCopy'
import type { MysteryState } from '../../game/mysteryState'
import { StudioTextLayer } from '../editor/StudioTextLayer'

export function CurrentObjective({ state, copy }: { state: MysteryState; copy: StudioCopy }) {
  const progress = state.foundRelicIds.length
  const complete = progress === HIDDEN_RELICS.length

  return (
    <section className="objective-rail occult-frame" aria-labelledby="objective-title">
      <div className="objective-rail__heading">
        <span id="objective-title">
          <StudioTextLayer layerId="objectiveLabel">{copy.objectiveLabel}</StudioTextLayer>
        </span>
        <i aria-hidden="true" />
      </div>
      <h2>
        <StudioTextLayer layerId={complete ? 'objectiveCompleteTitle' : 'objectivePendingTitle'}>
          {complete ? copy.objectiveCompleteTitle : copy.objectivePendingTitle}
        </StudioTextLayer>
      </h2>
      <p>
        <StudioTextLayer layerId={complete ? 'objectiveCompleteDescription' : 'objectivePendingDescription'}>
          {complete
            ? copy.objectiveCompleteDescription
            : copy.objectivePendingDescription}
        </StudioTextLayer>
      </p>
      <strong>{progress} / {HIDDEN_RELICS.length}</strong>
    </section>
  )
}
