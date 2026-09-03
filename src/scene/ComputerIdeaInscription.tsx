import { forwardRef } from 'react'
import type { Group } from 'three'
import type { StudioTransform } from '../editor/studioLayout'
import { FittedInscription } from './FittedInscription'

export const COMPUTER_IDEA_TEXT = '永远不要扔掉你喜欢的东西'

const MODEL_URL = `${import.meta.env.BASE_URL}models/computer-inspiration-note-optimized.glb?v=idea-2`
// Keep the glyphs at their approved size after removing the wider spark ornament.
const TARGET_WIDTH = 1.81
const DYNAMIC_COLORS = ['#c4c8b8', '#a83c2f'] as const

export type ComputerIdeaInscriptionProps = {
  text: string
  transform: StudioTransform
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
}

export const ComputerIdeaInscription = forwardRef<Group, ComputerIdeaInscriptionProps>(
  function ComputerIdeaInscription(
    {
      text,
      transform,
      editing = false,
      selected = false,
      onSelect,
    },
    ref,
  ) {
    return (
      <FittedInscription
        ref={ref}
        name="alex-sudden-idea-inscription"
        modelUrl={MODEL_URL}
        targetWidth={TARGET_WIDTH}
        defaultText={COMPUTER_IDEA_TEXT}
        text={text}
        transform={transform}
        editing={editing}
        selected={selected}
        onSelect={onSelect}
        maxCharactersPerLine={7}
        dynamicColors={DYNAMIC_COLORS}
      />
    )
  },
)
