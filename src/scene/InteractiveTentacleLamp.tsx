import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  Mesh,
  MeshStandardMaterial,
  Sphere,
  Vector3,
  type Object3D,
  type PointLight,
} from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import {
  easeLampGlowLevel,
  isLampGlobeRayAllowed,
  LAMP_GLOBE_CENTER,
  LAMP_GLOBE_INTERACTION_RADIUS,
  LAMP_GLOBE_MATERIAL_NAME,
  LAMP_RELIC_APERTURE_CENTER,
  LAMP_RELIC_APERTURE_RADIUS,
  LampGlowController,
} from './lampGlow'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

type InteractiveTentacleLampProps = {
  asset: StudioAsset
  interactive: boolean
  reducedMotionRef: MutableRefObject<boolean>
  onHoverChange?: (hovered: boolean) => void
}

const lampRaycastSphere = new Sphere()
const lampRaycastPoint = new Vector3()
const lampRaycastScale = new Vector3()
const lampRaycastAperturePoint = new Vector3()
const lampRaycastApertureOffset = new Vector3(
  LAMP_RELIC_APERTURE_CENTER[0] - LAMP_GLOBE_CENTER[0],
  LAMP_RELIC_APERTURE_CENTER[1] - LAMP_GLOBE_CENTER[1],
  LAMP_RELIC_APERTURE_CENTER[2] - LAMP_GLOBE_CENTER[2],
)

const lampGlobeRaycast: Mesh['raycast'] = function lampGlobeRaycast(
  this: Mesh,
  raycaster,
  intersections,
) {
  this.getWorldPosition(lampRaycastSphere.center)
  this.getWorldScale(lampRaycastScale)
  const worldScale = Math.max(
    lampRaycastScale.x,
    lampRaycastScale.y,
    lampRaycastScale.z,
  )
  const globeCenterDistance = Math.sqrt(
    raycaster.ray.distanceSqToPoint(lampRaycastSphere.center),
  ) / Math.max(worldScale, 0.0001)
  lampRaycastAperturePoint.copy(lampRaycastApertureOffset)
  this.localToWorld(lampRaycastAperturePoint)
  const apertureDistance = Math.sqrt(
    raycaster.ray.distanceSqToPoint(lampRaycastAperturePoint),
  ) / Math.max(worldScale, 0.0001)

  // The small central aperture belongs to drowned-dream-core. Its own proxy
  // remains the first and only hit there; the surrounding globe toggles light.
  if (!isLampGlobeRayAllowed(apertureDistance, globeCenterDistance)) return

  lampRaycastSphere.radius = LAMP_GLOBE_INTERACTION_RADIUS * worldScale
  const point = raycaster.ray.intersectSphere(lampRaycastSphere, lampRaycastPoint)
  if (!point) return
  const distance = raycaster.ray.origin.distanceTo(point)
  if (distance < raycaster.near || distance > raycaster.far) return
  intersections.push({ distance, point: point.clone(), object: this })
}

function LampGlobeLight({
  controller,
  globeMaterialsRef,
  reducedMotionRef,
}: {
  controller: LampGlowController
  globeMaterialsRef: MutableRefObject<MeshStandardMaterial[]>
  reducedMotionRef: MutableRefObject<boolean>
}) {
  const { globalIntensity } = useStudioLightingSettings()
  const lightRef = useRef<PointLight>(null)

  useFrame((_, delta) => {
    const reducedMotion = reducedMotionRef.current
    const playback = controller.advance(delta, reducedMotion)
    const level = easeLampGlowLevel(playback.level)

    const light = lightRef.current

    const emissiveIntensity = level * 3.2
    for (const globeMaterial of globeMaterialsRef.current) {
      globeMaterial.emissiveIntensity = emissiveIntensity
    }
    if (light) light.intensity = level * 0.82 * globalIntensity
  })

  return (
    <group name="tentacle-lamp-globe-light">
      <pointLight
        ref={lightRef}
        position={LAMP_GLOBE_CENTER}
        color="#63f5e9"
        intensity={0}
        distance={2.05}
        decay={2}
        castShadow={false}
      />
    </group>
  )
}

export function InteractiveTentacleLamp({
  asset,
  interactive,
  reducedMotionRef,
  onHoverChange,
}: InteractiveTentacleLampProps) {
  const controllerRef = useRef<LampGlowController | null>(null)
  if (!controllerRef.current) controllerRef.current = new LampGlowController()
  const controller = controllerRef.current
  const hoveredRef = useRef(false)
  const globeMaterialsRef = useRef<MeshStandardMaterial[]>([])
  const fittedAsset = useMemo<StudioAsset>(() => ({
    ...asset,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    visualScale: [1, 1, 1],
  }), [asset])

  const configureLampObject = useCallback((object: Object3D) => {
    const globeMaterials: MeshStandardMaterial[] = []

    object.traverse((child) => {
      if (!(child instanceof Mesh)) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      let changed = false
      const configuredMaterials = materials.map((material) => {
        if (
          !(material instanceof MeshStandardMaterial)
          || material.name !== LAMP_GLOBE_MATERIAL_NAME
        ) return material

        const globeMaterial = material.clone()
        globeMaterial.name = LAMP_GLOBE_MATERIAL_NAME
        globeMaterial.emissive.set('#5ef4e8')
        globeMaterial.emissiveIntensity = 0
        globeMaterial.needsUpdate = true
        globeMaterials.push(globeMaterial)
        changed = true
        return globeMaterial
      })

      if (changed) {
        child.material = Array.isArray(child.material)
          ? configuredMaterials
          : configuredMaterials[0]
      }
    })

    globeMaterialsRef.current = globeMaterials
  }, [])

  useEffect(() => () => {
    if (hoveredRef.current) document.body.style.cursor = ''
  }, [])

  useEffect(() => {
    if (interactive) return
    hoveredRef.current = false
    document.body.style.cursor = ''
    onHoverChange?.(false)
  }, [interactive, onHoverChange])

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (!interactive || event.button !== 0 || event.delta > 8) return
    controller.toggle()
    if (reducedMotionRef.current) controller.advance(0, true)
  }, [controller, interactive, reducedMotionRef])

  return (
    <group
      name="interactive-tentacle-lamp"
      position={asset.position}
      rotation={asset.rotation}
      userData={{
        assetId: asset.id,
        lampGlowController: true,
        relicApertureRadius: LAMP_RELIC_APERTURE_RADIUS,
      }}
    >
      <group scale={asset.visualScale ?? [1, 1, 1]}>
        <AssetSlot
          asset={fittedAsset}
          configureObject={configureLampObject}
        />
        <LampGlobeLight
          controller={controller}
          globeMaterialsRef={globeMaterialsRef}
          reducedMotionRef={reducedMotionRef}
        />
        {interactive ? (
          <mesh
            name={`lamp-globe-interaction-proxy:${asset.id}`}
            position={LAMP_GLOBE_CENTER}
            raycast={lampGlobeRaycast}
            userData={{
              interactionProxy: true,
              studioAssetId: asset.id,
              lampGlowToggleProxy: true,
              lampGlobeRadius: LAMP_GLOBE_INTERACTION_RADIUS,
              relicApertureRadius: LAMP_RELIC_APERTURE_RADIUS,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleClick}
            onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              hoveredRef.current = true
              document.body.style.cursor = 'pointer'
              onHoverChange?.(true)
            }}
            onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              hoveredRef.current = false
              document.body.style.cursor = ''
              onHoverChange?.(false)
            }}
          >
            <sphereGeometry args={[LAMP_GLOBE_INTERACTION_RADIUS, 18, 12]} />
            <meshBasicMaterial
              visible={false}
              transparent
              opacity={0}
              depthWrite={false}
              colorWrite={false}
            />
          </mesh>
        ) : null}
      </group>
    </group>
  )
}
