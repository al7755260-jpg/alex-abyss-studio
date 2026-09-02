import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Box3,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three'
import { DESK_DEVICE_BASE_Y } from '../data/deskSupport'
import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

type Vector3Tuple = [number, number, number]

type CandleKind =
  | 'candelabra'
  | 'pillar'
  | 'skull'
  | 'cluster'

type StaticCandleKind = Exclude<CandleKind, 'candelabra'>

type CandlePlacement = {
  id: string
  kind: StaticCandleKind
  position: Vector3Tuple
  rotationY: number
  height: number
  horizontalScale?: number
  castShadow: boolean
  receiveShadow: boolean
  phase: number
  dynamicLight?: boolean
}

type RelativeFlame = readonly [number, number, number]

type FlameDescriptor = {
  id: string
  position: Vector3Tuple
  scale: number
  phase: number
  rate: number
}

type DynamicLightDescriptor = {
  id: string
  position: Vector3Tuple
  baseIntensity: number
  phase: number
}

const CANDLE_MODEL_URLS = {
  candelabra: `${import.meta.env.BASE_URL}models/candles/melted-five-arm-candelabra-optimized.glb`,
  pillar: `${import.meta.env.BASE_URL}models/candles/blood-red-pillar-candle-optimized.glb`,
  skull: `${import.meta.env.BASE_URL}models/candles/black-wax-skull-goblet-candle-optimized.glb`,
  cluster: `${import.meta.env.BASE_URL}models/candles/staggered-seven-candle-cluster-optimized.glb`,
} as const

export const CANDLE_SOURCE_COUNT = Object.keys(CANDLE_MODEL_URLS).length

// The ritual rug's visible top is Y=0.0261. Keep the five front candles a
// hair above it, and inside its safe ellipse, so their complete bases clear
// both the rug and the mechanical skull's rising outer lip.
const FLOOR_CANDLE_BASE_Y = 0.03

const CANDLE_PLACEMENTS: readonly CandlePlacement[] = [
  {
    id: 'tower-pillar',
    kind: 'pillar',
    position: [0.8, DESK_DEVICE_BASE_Y.computer + 0.86, -1.34],
    rotationY: -0.12,
    height: 0.22,
    horizontalScale: 0.4,
    castShadow: false,
    receiveShadow: false,
    phase: 0.4,
  },
  {
    id: 'desk-left-pillar',
    kind: 'pillar',
    position: [-1.46, 1.82, -0.82],
    rotationY: 0.18,
    height: 0.28,
    horizontalScale: 0.36,
    castShadow: false,
    receiveShadow: false,
    phase: 1.15,
  },
  {
    id: 'floor-left-pillar',
    kind: 'pillar',
    position: [-0.88, FLOOR_CANDLE_BASE_Y, 1.92],
    rotationY: -0.34,
    height: 0.34,
    horizontalScale: 0.42,
    castShadow: false,
    receiveShadow: true,
    phase: 2.85,
  },
  {
    id: 'floor-center-left-pillar',
    kind: 'pillar',
    position: [-0.62, FLOOR_CANDLE_BASE_Y, 1.74],
    rotationY: 0.16,
    height: 0.27,
    horizontalScale: 0.38,
    castShadow: false,
    receiveShadow: true,
    phase: 3.4,
  },
  {
    id: 'floor-center-skull',
    kind: 'skull',
    position: [-1.38, 1.82, -1.29],
    rotationY: 0.05,
    height: 0.45,
    castShadow: false,
    receiveShadow: true,
    phase: 4.05,
  },
  {
    id: 'floor-right-pillar',
    kind: 'pillar',
    position: [-0.2, FLOOR_CANDLE_BASE_Y, 1.78],
    rotationY: -0.2,
    height: 0.36,
    horizontalScale: 0.44,
    castShadow: false,
    receiveShadow: true,
    phase: 4.8,
  },
  {
    id: 'floor-far-right-pillar',
    kind: 'pillar',
    position: [0.22, FLOOR_CANDLE_BASE_Y, 1.65],
    rotationY: -0.3,
    height: 0.29,
    horizontalScale: 0.4,
    castShadow: false,
    receiveShadow: true,
    phase: 5.35,
  },
  {
    id: 'floor-far-right-back-pillar',
    kind: 'pillar',
    position: [0.5, FLOOR_CANDLE_BASE_Y, 1.36],
    rotationY: 0.22,
    height: 0.33,
    horizontalScale: 0.42,
    castShadow: false,
    receiveShadow: true,
    phase: 5.9,
  },
  {
    id: 'floor-back-right-cluster',
    kind: 'cluster',
    position: [1.45, -0.018, -1.7],
    rotationY: -0.18,
    height: 0.33,
    castShadow: false,
    receiveShadow: true,
    phase: 6.5,
  },
] as const

const FLAME_LAYOUTS: Readonly<Record<CandleKind, readonly RelativeFlame[]>> = {
  pillar: [[0, 0.86, 0]],
  skull: [[0, 0.94, 0]],
  // Anchored to the five actual wick caps in the fitted LUX3D mesh.
  // Y also lifts each flame by its core half-height so the base, not the
  // flame center, rests on the wick.
  candelabra: [
    [-0.2896, 0.8181, 0.003],
    [-0.1699, 0.9453, 0.0033],
    [0.0028, 1.0256, -0.0033],
    [0.1729, 0.9443, -0.001],
    [0.2943, 0.8121, 0.0015],
  ],
  cluster: [
    [-0.25, 0.42, 0.08],
    [-0.04, 0.26, 0.11],
    [0.25, 0.47, 0.09],
    [-0.23, 0.76, -0.02],
    [-0.02, 0.69, 0.02],
    [0.03, 0.95, -0.09],
    [0.25, 0.86, -0.08],
  ],
}

const FLAME_HALO_GEOMETRY = new SphereGeometry(0.25, 8, 12)
const FLAME_CORE_GEOMETRY = new ConeGeometry(0.12, 0.62, 8)
const FLAME_HALO_LOCAL_MATRIX = new Matrix4().makeScale(1, 1.42, 1)
const FLAME_CORE_LOCAL_MATRIX = new Matrix4().makeTranslation(0, -0.035, 0)

const FLAME_HALO_MATERIAL = new MeshStandardMaterial({
  color: '#210200',
  emissive: '#ff2a0b',
  emissiveIntensity: 8.5,
  roughness: 0.15,
  metalness: 0,
  transparent: true,
  opacity: 0.55,
  blending: AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

const FLAME_CORE_MATERIAL = new MeshStandardMaterial({
  color: '#fff0b0',
  emissive: '#ffb02d',
  emissiveIntensity: 12,
  roughness: 0.1,
  metalness: 0,
  transparent: true,
  opacity: 0.92,
  blending: AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

function toWorldPosition(
  placement: CandlePlacement,
  localPosition: RelativeFlame,
): Vector3Tuple {
  const [localX, localY, localZ] = localPosition
  const cos = Math.cos(placement.rotationY)
  const sin = Math.sin(placement.rotationY)
  const scaledX = localX * placement.height
  const scaledZ = localZ * placement.height

  return [
    placement.position[0] + scaledX * cos + scaledZ * sin,
    placement.position[1] + localY * placement.height,
    placement.position[2] - scaledX * sin + scaledZ * cos,
  ]
}

const CANDLE_FLAMES: readonly FlameDescriptor[] = CANDLE_PLACEMENTS.flatMap(
  (placement) =>
    FLAME_LAYOUTS[placement.kind].map((localPosition, flameIndex) => ({
      id: `${placement.id}-flame-${flameIndex}`,
      position: toWorldPosition(placement, localPosition),
      scale: Math.min(Math.max(placement.height * 0.12, 0.065), 0.095),
      phase: placement.phase + flameIndex * 0.71,
      rate: 4.5 + ((flameIndex + placement.id.length) % 4) * 0.37,
    })),
)

const DYNAMIC_LIGHTS: readonly DynamicLightDescriptor[] = CANDLE_PLACEMENTS.flatMap(
  (placement) => {
    if (!placement.dynamicLight) return []

    const layout = FLAME_LAYOUTS[placement.kind]
    const centralFlame = layout[Math.floor(layout.length / 2)]

    return [
      {
        id: `${placement.id}-light`,
        position: toWorldPosition(placement, centralFlame),
        baseIntensity: 3.25,
        phase: placement.phase,
      },
    ]
  },
)

function CandleModel({
  placement,
  source,
}: {
  placement: CandlePlacement
  source: Group
}) {
  const prepared = useMemo(() => {
    const object = source.clone(true)

    object.traverse((child) => {
      if (!(child instanceof Mesh)) return

      child.castShadow = placement.castShadow
      child.receiveShadow = placement.receiveShadow
    })

    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const uniformScale = placement.height / Math.max(size.y, 0.0001)

    return {
      object,
      uniformScale,
      offset: [-center.x, -bounds.min.y, -center.z] as Vector3Tuple,
    }
  }, [placement, source])

  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      scale={[
        placement.horizontalScale ?? 1,
        1,
        placement.horizontalScale ?? 1,
      ]}
    >
      <group scale={prepared.uniformScale}>
        <group position={prepared.offset}>
          <primitive object={prepared.object} dispose={null} />
        </group>
      </group>
    </group>
  )
}

function AnimatedFlames({
  flames,
  lights,
  name,
  active = true,
}: {
  flames: readonly FlameDescriptor[]
  lights: readonly DynamicLightDescriptor[]
  name: string
  active?: boolean
}) {
  const { globalIntensity } = useStudioLightingSettings()
  const haloRef = useRef<InstancedMesh>(null)
  const coreRef = useRef<InstancedMesh>(null)
  const lightRefs = useRef<(PointLight | null)[]>([])
  const groupScratchRef = useRef(new Object3D())
  const haloMatrixRef = useRef(new Matrix4())
  const coreMatrixRef = useRef(new Matrix4())

  useEffect(() => {
    haloRef.current?.instanceMatrix.setUsage(DynamicDrawUsage)
    coreRef.current?.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useFrame(({ clock }) => {
    if (!active) return
    const elapsed = clock.elapsedTime
    const halo = haloRef.current
    const core = coreRef.current
    const groupScratch = groupScratchRef.current

    for (let index = 0; index < flames.length; index += 1) {
      const flame = flames[index]

      const wave = Math.sin(elapsed * flame.rate + flame.phase)
      const detail = Math.sin(elapsed * (flame.rate * 2.17) + flame.phase * 1.43)
      const sideways = 1 + wave * 0.055 + detail * 0.018
      const vertical = 1 + wave * 0.11 + detail * 0.035

      groupScratch.position.set(
        flame.position[0],
        flame.position[1] + wave * 0.0035,
        flame.position[2],
      )
      groupScratch.rotation.set(0, 0, wave * 0.055)
      groupScratch.scale.set(
        flame.scale * sideways,
        flame.scale * vertical,
        flame.scale * (2 - sideways),
      )
      groupScratch.updateMatrix()

      if (halo) {
        haloMatrixRef.current.multiplyMatrices(
          groupScratch.matrix,
          FLAME_HALO_LOCAL_MATRIX,
        )
        halo.setMatrixAt(index, haloMatrixRef.current)
      }
      if (core) {
        coreMatrixRef.current.multiplyMatrices(
          groupScratch.matrix,
          FLAME_CORE_LOCAL_MATRIX,
        )
        core.setMatrixAt(index, coreMatrixRef.current)
      }
    }

    if (halo) halo.instanceMatrix.needsUpdate = true
    if (core) core.instanceMatrix.needsUpdate = true

    for (let index = 0; index < lights.length; index += 1) {
      const descriptor = lights[index]
      const light = lightRefs.current[index]
      if (!light) continue

      const flicker =
        Math.sin(elapsed * 5.1 + descriptor.phase) * 0.12 +
        Math.sin(elapsed * 11.7 + descriptor.phase * 1.8) * 0.045
      light.intensity = descriptor.baseIntensity * (1 + flicker) * globalIntensity
    }
  })

  return (
    <group name={name}>
      <instancedMesh
        ref={haloRef}
        args={[FLAME_HALO_GEOMETRY, FLAME_HALO_MATERIAL, flames.length]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={coreRef}
        args={[FLAME_CORE_GEOMETRY, FLAME_CORE_MATERIAL, flames.length]}
        frustumCulled={false}
        renderOrder={3}
      />

      {lights.map((light, index) => (
        <pointLight
          key={light.id}
          ref={(node) => {
            lightRefs.current[index] = node
          }}
          color="#e5481b"
          intensity={light.baseIntensity * globalIntensity}
          distance={2.25}
          decay={2}
          position={light.position}
        />
      ))}
    </group>
  )
}

function CandleFlames({ active = true }: { active?: boolean }) {
  return (
    <AnimatedFlames
      flames={CANDLE_FLAMES}
      lights={DYNAMIC_LIGHTS}
      name="candle-flames"
      active={active}
    />
  )
}

export function CandelabraInstallation({
  asset,
  active = true,
}: {
  asset: StudioAsset
  active?: boolean
}) {
  const height = asset.fit.size
  const flames = useMemo<readonly FlameDescriptor[]>(
    () => FLAME_LAYOUTS.candelabra.map((position, index) => ({
      id: `${asset.id}-flame-${index}`,
      position: [
        position[0] * height,
        position[1] * height,
        position[2] * height,
      ],
      scale: Math.min(Math.max(height * 0.12, 0.065), 0.095),
      phase: 2.1 + index * 0.71,
      rate: 4.5 + ((index + asset.id.length) % 4) * 0.37,
    })),
    [asset.id, height],
  )
  const lights = useMemo<readonly DynamicLightDescriptor[]>(() => {
    const centre = FLAME_LAYOUTS.candelabra[Math.floor(FLAME_LAYOUTS.candelabra.length / 2)]
    return [{
      id: `${asset.id}-light`,
      position: [centre[0] * height, centre[1] * height, centre[2] * height],
      baseIntensity: 3.25,
      phase: 2.1,
    }]
  }, [asset.id, height])

  return (
    <group name="lux3d-editable-candelabra-installation">
      <AssetSlot asset={asset} />
      <AnimatedFlames
        flames={flames}
        lights={lights}
        name="editable-candelabra-flames"
        active={active}
      />
    </group>
  )
}

const STATIC_CANDLE_MODEL_URLS: [string, string, string] = [
  CANDLE_MODEL_URLS.pillar,
  CANDLE_MODEL_URLS.skull,
  CANDLE_MODEL_URLS.cluster,
]

function CandleModels() {
  const [pillar, skull, cluster] = useGLTF(STATIC_CANDLE_MODEL_URLS)

  const sources = useMemo<Readonly<Record<StaticCandleKind, Group>>>(
    () => ({
      pillar: pillar.scene,
      skull: skull.scene,
      cluster: cluster.scene,
    }),
    [cluster.scene, pillar.scene, skull.scene],
  )

  return (
    <>
      {CANDLE_PLACEMENTS.map((placement) => (
        <CandleModel
          key={placement.id}
          placement={placement}
          source={sources[placement.kind]}
        />
      ))}
    </>
  )
}

export function CandleSet({ active = true }: { active?: boolean }) {
  return (
    <group name="lux3d-candle-set">
      <Suspense fallback={null}>
        <CandleModels />
      </Suspense>
      <CandleFlames active={active} />
    </group>
  )
}
