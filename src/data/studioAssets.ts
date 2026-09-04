import { DESK_DEVICE_BASE_Y } from './deskSupport'
import { BOOKCASE_CENTER_LEDGE_Y } from './candleSupport'

export type Vector3Tuple = [number, number, number]

export type AssetKind =
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'computer'
  | 'keyboard'
  | 'bookcase'
  | 'candelabra'
  | 'displayRack'
  | 'wallMask'
  | 'cabinet'
  | 'lamp'
  | 'octopus'
  | 'plaque'
  | 'television'
  | 'grimoire'
  | 'rug'

export type FitAxis = 'x' | 'y' | 'z'

export type StudioAsset = {
  id: string
  label: string
  kind: AssetKind
  /** Set this to a GLB URL such as `${import.meta.env.BASE_URL}models/desk.glb`. */
  src: string | null
  position: Vector3Tuple
  rotation: Vector3Tuple
  /** Optional art-direction scale applied after automatic uniform fitting. */
  visualScale?: Vector3Tuple
  placeholderSize: Vector3Tuple
  fit: {
    axis: FitAxis
    size: number
  }
  castShadow: boolean
  receiveShadow: boolean
}

/**
 * The scene uses metres and Y-up coordinates. Keep transforms here so that
 * replacing a procedural placeholder with a LUX3D GLB never requires editing
 * the scene component itself.
 */
export const STUDIO_ASSETS: readonly StudioAsset[] = [
  {
    id: 'abyssal-desk',
    label: '深渊书桌',
    kind: 'desk',
    src: `${import.meta.env.BASE_URL}models/desk-optimized.glb`,
    position: [-0.2, 0, -1.2],
    rotation: [0, 0, 0],
    visualScale: [1, 1, 0.92],
    placeholderSize: [2.72, 0.9, 1.02],
    fit: { axis: 'x', size: 2.92 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'vertebral-chair',
    label: '脊骨座椅',
    kind: 'chair',
    src: `${import.meta.env.BASE_URL}models/chair-optimized.glb?v=swivel-3772648`,
    position: [-0.55, 0, 0.5],
    rotation: [0, Math.PI, 0],
    visualScale: [0.96, 1, 0.96],
    placeholderSize: [1.08, 1.52, 1.08],
    fit: { axis: 'y', size: 1.46 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'watching-monitor',
    label: '凝视显示器',
    kind: 'monitor',
    src: `${import.meta.env.BASE_URL}models/monitor-optimized.glb?v=pbr-1`,
    position: [-0.46, DESK_DEVICE_BASE_Y.monitor, -1.54],
    rotation: [0, 0, 0],
    placeholderSize: [1.18, 0.76, 0.22],
    fit: { axis: 'x', size: 1.18 },
    castShadow: false,
    receiveShadow: false,
  },
  {
    id: 'reliquary-computer',
    label: '圣骸主机',
    kind: 'computer',
    src: `${import.meta.env.BASE_URL}models/computer-optimized.glb`,
    position: [0.8, DESK_DEVICE_BASE_Y.computer, -1.34],
    rotation: [0, -Math.PI / 2, 0],
    placeholderSize: [0.66, 1.13, 0.72],
    fit: { axis: 'y', size: 0.86 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'eldritch-keyboard',
    label: '深渊键鼠控制台',
    kind: 'keyboard',
    src: `${import.meta.env.BASE_URL}models/keyboard-optimized.glb?v=pbr-1`,
    position: [-0.2, DESK_DEVICE_BASE_Y.keyboard, -0.86],
    rotation: [0, 0, 0],
    placeholderSize: [1.04, 0.14, 0.42],
    fit: { axis: 'x', size: 1.04 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'forbidden-bookcase',
    label: '禁书架',
    kind: 'bookcase',
    src: `${import.meta.env.BASE_URL}models/bookcase-optimized.glb`,
    position: [-0.8, 0, -2.8],
    rotation: [0, 0.28, 0],
    placeholderSize: [1.48, 2.62, 0.54],
    fit: { axis: 'y', size: 2.5 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'floor-left-candelabra',
    label: '五臂熔蜡烛台',
    kind: 'candelabra',
    src: `${import.meta.env.BASE_URL}models/candles/melted-five-arm-candelabra-optimized.glb`,
    position: [-0.8, BOOKCASE_CENTER_LEDGE_Y, -2.8],
    rotation: [0, 0.08, 0],
    placeholderSize: [0.82, 1.28, 0.44],
    fit: { axis: 'y', size: 1.28 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'demonic-display-rack',
    label: '恶魔圣物陈列架',
    kind: 'displayRack',
    src: `${import.meta.env.BASE_URL}models/demonic-cthulhu-display-rack-optimized.glb`,
    position: [-1.45, 0, 0.7],
    rotation: [0, 1.2, 0],
    visualScale: [0.927, 1, 0.571],
    placeholderSize: [2.05, 2.62, 0.48],
    fit: { axis: 'y', size: 2.62 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'cthulhu-wall-mask',
    label: '猩红凝视面具',
    kind: 'wallMask',
    src: `${import.meta.env.BASE_URL}models/cthulhu-wall-mask-optimized.glb`,
    position: [1.1, 1.5, -2.7],
    rotation: [0, -0.2, 0],
    visualScale: [1.39, 1, 0.75],
    placeholderSize: [0.8, 0.94, 0.2],
    fit: { axis: 'y', size: 0.94 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'maw-cabinet',
    label: '巨口边柜',
    kind: 'cabinet',
    src: `${import.meta.env.BASE_URL}models/cabinet-optimized.glb`,
    position: [1, 0, -2.5],
    rotation: [0, -Math.PI / 2, 0],
    // The cabinet is quarter-turned, so local Z becomes its world-space width.
    // Keep that axis narrow enough to clear both the desk and cranial wall.
    visualScale: [0.52, 1, 0.68],
    placeholderSize: [1.42, 1.34, 0.62],
    fit: { axis: 'y', size: 1.34 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'tentacle-lamp',
    label: '触须立灯',
    kind: 'lamp',
    src: `${import.meta.env.BASE_URL}models/lamp-optimized.glb`,
    position: [0.25, 0, 0.2],
    rotation: [0, -0.38, 0],
    placeholderSize: [0.76, 2.22, 0.76],
    fit: { axis: 'y', size: 2.22 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'mechanical-cthulhu-octopus',
    label: '机械深渊章鱼',
    kind: 'octopus',
    src: `${import.meta.env.BASE_URL}models/mechanical-cthulhu-octopus-optimized.glb?v=pbr-1`,
    // Preserve the native LUX3D proportions. The wall-normal offset keeps the
    // rear housing mounted while leaving clearance at the crown and monitor.
    position: [-0.2, 3.006, -2.85],
    rotation: [0, 0, 0],
    visualScale: [1, 1, 1],
    placeholderSize: [0.5, 1.2, 1],
    fit: { axis: 'y', size: 0.975 },
    castShadow: false,
    receiveShadow: false,
  },
  {
    id: 'mysterious-plaque',
    label: '神秘牌匾',
    kind: 'plaque',
    src: `${import.meta.env.BASE_URL}models/mysterious-plaque-optimized.glb`,
    // Stand the plaque on the front-left of the real desk surface. Its native
    // front faces +X, so a quarter turn presents the inscription to the
    // default camera while leaving enough clearance for the keyboard.
    position: [-1.05, 1.81, -0.56],
    rotation: [0, -Math.PI / 2, 0],
    placeholderSize: [0.15, 0.65, 1.085],
    fit: { axis: 'y', size: 0.65 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'vintage-television',
    label: '老式电视',
    kind: 'television',
    src: `${import.meta.env.BASE_URL}models/vintage-television-optimized.glb`,
    // Keep the newly imported television on the open front-right floor so it
    // is immediately visible and easy to grab before the user places it.
    position: [2.35, 0.02, 0.85],
    rotation: [0, -Math.PI / 3, 0],
    placeholderSize: [0.86, 0.9, 1.07],
    fit: { axis: 'y', size: 0.9 },
    castShadow: false,
    receiveShadow: true,
  },
  {
    id: 'abyss-grimoire',
    label: '深渊三页古书',
    kind: 'grimoire',
    src: `${import.meta.env.BASE_URL}models/abyss-grimoire-animated.glb`,
    // The open front-right desk corner clears both the keyboard and tower.
    // Keeping Y at the real desktop height also makes editor translation sane.
    position: [0.72, 1.8, -0.7],
    rotation: [0, -0.18, 0],
    placeholderSize: [0.78, 0.16, 0.52],
    fit: { axis: 'x', size: 0.78 },
    castShadow: true,
    receiveShadow: true,
  },
  {
    id: 'ritual-rug',
    label: '仪式地毯',
    kind: 'rug',
    src: null,
    position: [-0.1, 0.018, 0.65],
    rotation: [0, 0, 0],
    placeholderSize: [4.25, 0.045, 3.2],
    fit: { axis: 'x', size: 4.25 },
    castShadow: false,
    receiveShadow: true,
  },
] as const

export const LOVECRAFT_PARTICLE_BUST_ASSET_ID = 'lovecraft-particle-bust'

/**
 * This asset is edited in the display rack's local space so it keeps following
 * the rack while retaining an independent position, rotation, and scale.
 */
export type StudioEditableAsset = {
  id: string
  label: string
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale?: readonly [number, number, number]
}

export const LOVECRAFT_PARTICLE_BUST_ASSET: StudioEditableAsset = {
  id: LOVECRAFT_PARTICLE_BUST_ASSET_ID,
  label: '洛夫克拉夫特粒子雕塑',
  position: [0, 2.433, -0.045],
  rotation: [0, -0.603, 0],
  scale: [0.62, 0.62, 0.62],
}

export const STUDIO_EDITABLE_ASSETS: readonly StudioEditableAsset[] = [
  ...STUDIO_ASSETS,
  LOVECRAFT_PARTICLE_BUST_ASSET,
]

export const REAL_ASSET_COUNT = STUDIO_ASSETS.reduce(
  (count, asset) => count + (asset.src ? 1 : 0),
  0,
)
