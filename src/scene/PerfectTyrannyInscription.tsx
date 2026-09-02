import { useGLTF } from '@react-three/drei'
import { forwardRef } from 'react'
import type { Group } from 'three'
import type { StudioTransform } from '../editor/studioLayout'
import { FittedInscription } from './FittedInscription'

export const PERFECT_TYRANNY_TEXT = '完美，就是一个返自然，用来折磨我们的暴政'

const MODEL_URL = `${import.meta.env.BASE_URL}models/perfect-tyranny-note-optimized.glb?v=idea-1`
const TARGET_WIDTH = 2.15
const DYNAMIC_COLORS = ['#2f9296', '#a23c30', '#b9bfb0'] as const

export type PerfectTyrannyInscriptionProps = {
  text: string
  transform: StudioTransform
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
}

export const PerfectTyrannyInscription = forwardRef<
  Group,
  PerfectTyrannyInscriptionProps
>(function PerfectTyrannyInscription(
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
      name="alex-perfect-tyranny-inscription"
      modelUrl={MODEL_URL}
      targetWidth={TARGET_WIDTH}
      defaultText={PERFECT_TYRANNY_TEXT}
      text={text}
      transform={transform}
      editing={editing}
      selected={selected}
      onSelect={onSelect}
      maxCharactersPerLine={8}
      dynamicColors={DYNAMIC_COLORS}
    />
  )
})

useGLTF.preload(MODEL_URL)
