import type { Vector3Tuple } from './studioAssets'

// Furniture hover-label anchors and accent colors; no visible point markers are rendered.
export const SCENE_ACCENTS = [
  { id: 'tide-index-seal', hostAssetId: 'forbidden-bookcase', hostLabel: '禁书架', position: [-0.573, 1.397, -2.719] as Vector3Tuple, color: '#c69852', phaseOffset: 1 * 0.87 },
  { id: 'deviant-iris-wheel', hostAssetId: 'mechanical-cthulhu-octopus', hostLabel: '机械深渊章鱼', position: [-0.196, 3.481, -2.534] as Vector3Tuple, color: '#52c6bd', phaseOffset: 2 * 0.87 },
  { id: 'drowned-dream-core', hostAssetId: 'tentacle-lamp', hostLabel: '触须立灯', position: [0.342962, 1.84, 0.425573] as Vector3Tuple, color: '#4dd4c9', phaseOffset: 3 * 0.87 },
  { id: 'fingerprint-casket', hostAssetId: 'maw-cabinet', hostLabel: '巨口边柜', position: [0.979, 0.692, -2.248] as Vector3Tuple, color: '#cf5949', phaseOffset: 4 * 0.87 },
  { id: 'voice-hyoid', hostAssetId: 'cthulhu-wall-mask', hostLabel: '猩红凝视面具', position: [0.998, 1.917, -2.616] as Vector3Tuple, color: '#f04432', phaseOffset: 5 * 0.87 },
  { id: 'spinal-clasp', hostAssetId: 'vertebral-chair', hostLabel: '脊骨座椅', position: [-0.55, 0.854, 0.911] as Vector3Tuple, color: '#d65343', phaseOffset: 6 * 0.87 },
] as const
export type SceneAccentId = typeof SCENE_ACCENTS[number]['id']
export const SCENE_ACCENT_BY_HOST_ASSET_ID = new Map<string, typeof SCENE_ACCENTS[number]>(
  SCENE_ACCENTS.map((accent) => [accent.hostAssetId, accent]),
)
