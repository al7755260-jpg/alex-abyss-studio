import { useGLTF } from '@react-three/drei'
import { forwardRef } from 'react'
import type { Group } from 'three'
import type { StudioTransform } from '../editor/studioLayout'
import { FittedInscription } from './FittedInscription'

export const VIDEO_BEYOND_SCREEN_TEXT = '视频中50%的内容是隐藏在屏幕之外的'

const MODEL_URL = `${import.meta.env.BASE_URL}models/video-beyond-screen-note-optimized.glb?v=idea-2`
// Keep the glyphs at their approved size after removing the wider frame marks.
const TARGET_WIDTH = 1.96
const DYNAMIC_COLORS = ['#b9bfb0', '#2f9296', '#a23c30'] as const

export type VideoBeyondScreenInscriptionProps = {
  text: string
  transform: StudioTransform
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
}

export const VideoBeyondScreenInscription = forwardRef<
  Group,
  VideoBeyondScreenInscriptionProps
>(function VideoBeyondScreenInscription(
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
      name="alex-video-beyond-screen-inscription"
      modelUrl={MODEL_URL}
      targetWidth={TARGET_WIDTH}
      defaultText={VIDEO_BEYOND_SCREEN_TEXT}
      text={text}
      transform={transform}
      editing={editing}
      selected={selected}
      onSelect={onSelect}
      maxCharactersPerLine={9}
      dynamicColors={DYNAMIC_COLORS}
    />
  )
})

useGLTF.preload(MODEL_URL)
