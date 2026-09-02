import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sphere,
  Vector3,
} from 'three'
import {
  FINAL_MONITOR_TARGET,
  HIDDEN_RELICS,
  type HiddenRelicId,
} from '../data/hiddenRelics'
import type { Vector3Tuple } from '../data/studioAssets'
import { LAMP_RELIC_APERTURE_RADIUS } from './lampGlow'

type HiddenRelicsProps = {
  foundRelicIds: readonly HiddenRelicId[]
  suppressedRelicIds?: readonly HiddenRelicId[]
  fingerprintCasketAccessible: boolean
  hitPositions?: ReadonlyMap<HiddenRelicId, Vector3Tuple>
  onOpenRelic: (relicId: HiddenRelicId) => void
  onHoverRelic?: (relicId: HiddenRelicId | null) => void
}

const ignoreRaycast: Mesh['raycast'] = () => undefined
const NO_SUPPRESSED_RELIC_IDS: readonly HiddenRelicId[] = []
const RELIC_ACTIVATION_RADIUS_SCALE = 2
const relicRaycastSphere = new Sphere()
const relicRaycastPoint = new Vector3()
const relicRaycastScale = new Vector3()
const relicProxyRaycast: Mesh['raycast'] = function relicProxyRaycast(
  this: Mesh,
  raycaster,
  intersections,
) {
  const localRadius = Number(this.userData.relicHitRadius)
  if (!Number.isFinite(localRadius) || localRadius <= 0) return

  this.getWorldPosition(relicRaycastSphere.center)
  this.getWorldScale(relicRaycastScale)
  relicRaycastSphere.radius = localRadius * Math.max(
    relicRaycastScale.x,
    relicRaycastScale.y,
    relicRaycastScale.z,
  )
  const point = raycaster.ray.intersectSphere(relicRaycastSphere, relicRaycastPoint)
  if (!point) return
  const distance = raycaster.ray.origin.distanceTo(point)
  if (distance < raycaster.near || distance > raycaster.far) return
  intersections.push({ distance, point: point.clone(), object: this })
}

function RelicHintLight({
  color,
  phaseOffset,
}: {
  color: string
  phaseOffset: number
}) {
  const groupRef = useRef<Group>(null)
  const coreRef = useRef<Mesh>(null)
  const haloRef = useRef<Mesh>(null)
  const coreMaterialRef = useRef<MeshBasicMaterial>(null)
  const haloMaterialRef = useRef<MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    const group = groupRef.current
    const core = coreRef.current
    const halo = haloRef.current
    const coreMaterial = coreMaterialRef.current
    const haloMaterial = haloMaterialRef.current
    if (!group || !core || !halo || !coreMaterial || !haloMaterial) return

    const wave = (Math.sin(clock.elapsedTime * 3.05 + phaseOffset) + 1) / 2

    core.scale.setScalar(0.92 + wave * 0.16)
    halo.scale.setScalar(0.94 + wave * 0.28)
    group.rotation.z = clock.elapsedTime * 0.11
    coreMaterial.opacity = 0.68 + wave * 0.16
    haloMaterial.opacity = 0.1 + wave * 0.09
  })

  return (
    <group ref={groupRef}>
      <mesh ref={haloRef} raycast={ignoreRaycast} renderOrder={4}>
        <sphereGeometry args={[0.055, 14, 10]} />
        <meshBasicMaterial
          ref={haloMaterialRef}
          color={color}
          transparent
          opacity={0.14}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={coreRef} raycast={ignoreRaycast} renderOrder={5}>
        <sphereGeometry args={[0.021, 14, 10]} />
        <meshBasicMaterial
          ref={coreMaterialRef}
          color={color}
          transparent
          opacity={0.76}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function HiddenRelics({
  foundRelicIds,
  suppressedRelicIds = NO_SUPPRESSED_RELIC_IDS,
  fingerprintCasketAccessible,
  hitPositions,
  onOpenRelic,
  onHoverRelic,
}: HiddenRelicsProps) {
  const found = useMemo(() => new Set(foundRelicIds), [foundRelicIds])
  const suppressed = useMemo(() => new Set(suppressedRelicIds), [suppressedRelicIds])

  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  return (
    <group name="hidden-relics">
      {HIDDEN_RELICS.map((relic) => {
        if (found.has(relic.id) || suppressed.has(relic.id)) return null
        const hitPosition = hitPositions?.get(relic.id) ?? relic.hitPosition
        const isFingerprintCasket = relic.id === 'fingerprint-casket'
        const isDrownedDreamCore = relic.id === 'drowned-dream-core'
        const pointerEnabled = !isFingerprintCasket || fingerprintCasketAccessible
        const activationRadiusScale = isFingerprintCasket
          ? 0.75
          : isDrownedDreamCore
            ? LAMP_RELIC_APERTURE_RADIUS / relic.hitRadius
          : RELIC_ACTIVATION_RADIUS_SCALE
        return (
          <group key={relic.id} position={hitPosition}>
            <RelicHintLight
              color={relic.accent}
              phaseOffset={relic.order * 0.87}
            />
            <mesh
              raycast={pointerEnabled ? relicProxyRaycast : ignoreRaycast}
              userData={{
                relicHitRadius: relic.hitRadius * activationRadiusScale,
              }}
              onClick={pointerEnabled ? (event) => {
                event.stopPropagation()
                if (event.delta <= 10) onOpenRelic(relic.id)
              } : undefined}
              onPointerEnter={pointerEnabled ? (event) => {
                event.stopPropagation()
                document.body.style.cursor = 'crosshair'
                onHoverRelic?.(relic.id)
              } : undefined}
              onPointerLeave={pointerEnabled ? (event) => {
                event.stopPropagation()
                document.body.style.cursor = ''
                onHoverRelic?.(null)
              } : undefined}
            >
              <sphereGeometry
                args={[relic.hitRadius * activationRadiusScale, 18, 12]}
              />
              <meshBasicMaterial
                color={relic.accent}
                visible={false}
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function FinalMonitorTarget({
  enabled,
  position = FINAL_MONITOR_TARGET.position,
  onOpenFinale,
  onHoverChange,
}: {
  enabled: boolean
  position?: Vector3Tuple
  onOpenFinale: () => void
  onHoverChange?: (hovered: boolean) => void
}) {
  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  if (!enabled) return null

  return (
    <group position={position}>
      <mesh
        position={[0, 0, 0.06]}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= 10) onOpenFinale()
        }}
        onPointerEnter={(event) => {
          event.stopPropagation()
          document.body.style.cursor = 'crosshair'
          onHoverChange?.(true)
        }}
        onPointerLeave={(event) => {
          event.stopPropagation()
          document.body.style.cursor = ''
          onHoverChange?.(false)
        }}
      >
        <planeGeometry args={[1.08, 0.58]} />
        <meshBasicMaterial
          visible={false}
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
    </group>
  )
}
