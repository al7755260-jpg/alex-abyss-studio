import type { StudioLayoutAsset } from '../editor/studioLayout'

export const VIDEO_BEYOND_SCREEN_INSCRIPTION_ID = 'inscription:video-beyond-screen'
export const COMPUTER_IDEA_INSCRIPTION_ID = 'inscription:computer-idea'
export const PERFECT_TYRANNY_INSCRIPTION_ID = 'inscription:perfect-tyranny'

export const SCENE_INSCRIPTIONS = [
  {
    id: VIDEO_BEYOND_SCREEN_INSCRIPTION_ID,
    label: '左侧三行文字',
    copyField: 'videoBeyondScreenText',
    rows: 3,
    position: [-2.5, 5, -2.68],
    rotation: [-0.08, 0.44, -0.09],
    scale: [1, 1, 1],
  },
  {
    id: COMPUTER_IDEA_INSCRIPTION_ID,
    label: '右侧两行文字',
    copyField: 'computerIdeaText',
    rows: 2,
    position: [-0.19, 1.16, -1.13],
    rotation: [-0.03, 2.03, -0.035],
    scale: [1, 1, 1],
  },
  {
    id: PERFECT_TYRANNY_INSCRIPTION_ID,
    label: '“完美”三行文字',
    copyField: 'perfectTyrannyText',
    rows: 3,
    position: [-2.6, 2.62, -2.66],
    rotation: [-0.06, 0.44, -0.045],
    scale: [1, 1, 1],
  },
] as const

export type SceneInscriptionId = typeof SCENE_INSCRIPTIONS[number]['id']
export type SceneInscriptionCopyField = typeof SCENE_INSCRIPTIONS[number]['copyField']

export const SCENE_INSCRIPTION_IDS = new Set<string>(
  SCENE_INSCRIPTIONS.map(({ id }) => id),
)

export const SCENE_INSCRIPTION_COPY_FIELDS = new Set<string>(
  SCENE_INSCRIPTIONS.map(({ copyField }) => copyField),
)

export const SCENE_INSCRIPTION_BY_ID = new Map<
  string,
  typeof SCENE_INSCRIPTIONS[number]
>(
  SCENE_INSCRIPTIONS.map((inscription) => [inscription.id, inscription] as const),
)

export const SCENE_INSCRIPTION_LAYOUT_ASSETS: readonly StudioLayoutAsset[] =
  SCENE_INSCRIPTIONS.map(({ id, position, rotation, scale }) => ({
    id,
    position,
    rotation,
    scale,
  }))

export function isSceneInscriptionId(value: string | null): value is SceneInscriptionId {
  return value !== null && SCENE_INSCRIPTION_IDS.has(value)
}
