import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Mesh,
  Object3D,
  Sphere,
  Vector3,
  type InstancedMesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PointLight,
  type ShaderMaterial,
} from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import {
  easeLampGlowLevel,
  isLampGlobeRayAllowed,
  LAMP_GHOST_COUNT,
  LAMP_GHOST_SEGMENTS,
  LAMP_GLOBE_CENTER,
  LAMP_GLOBE_INTERACTION_RADIUS,
  LAMP_GLOBE_RADIUS,
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

const LAMP_GHOST_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;

    vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float instanceScaleX = length(instanceMatrix[0].xyz);
    float instanceScaleY = length(instanceMatrix[1].xyz);
    vec4 viewCenter = modelViewMatrix * instanceCenter;
    viewCenter.xy += position.xy * vec2(instanceScaleX, instanceScaleY);
    gl_Position = projectionMatrix * viewCenter;
  }
`

const LAMP_GHOST_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float head = 1.0 - smoothstep(0.43, 0.68, length(vec2(p.x, p.y - 0.34)));
    float bodyWidth = mix(0.14, 0.52, smoothstep(-0.82, 0.24, p.y));
    float sideWaver = 0.045 * sin(p.y * 7.0 + uTime * 2.1);
    float shoulders = 1.0 - smoothstep(
      bodyWidth,
      bodyWidth + 0.13,
      abs(p.x + sideWaver)
    );
    float taper = smoothstep(-0.92, -0.7, p.y)
      * (1.0 - smoothstep(0.3, 0.5, p.y));
    float tailSplit = 0.72 + 0.28 * sin(p.x * 18.0 - uTime * 2.8);
    float body = shoulders * taper * mix(tailSplit, 1.0, smoothstep(-0.5, -0.12, p.y));
    float silhouette = max(head, body);

    vec2 leftEye = vec2(p.x + 0.16, p.y - 0.38);
    vec2 rightEye = vec2(p.x - 0.16, p.y - 0.38);
    float eyes = 1.0
      - 0.72 * (1.0 - smoothstep(0.045, 0.105, length(leftEye)))
      - 0.72 * (1.0 - smoothstep(0.045, 0.105, length(rightEye)));
    float aura = (1.0 - smoothstep(0.55, 1.08, length(vec2(p.x, p.y * 0.72)))) * 0.14;
    float alpha = max(silhouette * eyes * 0.9, aura) * uOpacity;

    if (alpha < 0.003) discard;
    vec3 spectralColor = uColor * (1.05 + silhouette * 1.35);
    gl_FragColor = vec4(spectralColor, alpha);
  }
`

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

function LampSpectralGlow({
  controller,
  reducedMotionRef,
}: {
  controller: LampGlowController
  reducedMotionRef: MutableRefObject<boolean>
}) {
  const { globalIntensity } = useStudioLightingSettings()
  const coreRef = useRef<Mesh>(null)
  const haloRef = useRef<Mesh>(null)
  const coreMaterialRef = useRef<MeshStandardMaterial>(null)
  const haloMaterialRef = useRef<MeshBasicMaterial>(null)
  const ghostMaterialRef = useRef<ShaderMaterial>(null)
  const ghostInstancesRef = useRef<InstancedMesh>(null)
  const lightRef = useRef<PointLight>(null)
  const lastGhostLevelRef = useRef(-1)
  const ghostDummy = useMemo(() => new Object3D(), [])
  const ghostUniforms = useMemo(() => ({
    uColor: { value: new Color('#70fff0') },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
  }), [])

  useLayoutEffect(() => {
    ghostInstancesRef.current?.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useFrame((_, delta) => {
    const reducedMotion = reducedMotionRef.current
    const playback = controller.advance(delta, reducedMotion)
    const level = easeLampGlowLevel(playback.level)
    const pulse = reducedMotion
      ? 0.5
      : (Math.sin(playback.orbitAngle * 3.2) + 1) * 0.5

    const core = coreRef.current
    const halo = haloRef.current
    const coreMaterial = coreMaterialRef.current
    const haloMaterial = haloMaterialRef.current
    const ghostMaterial = ghostMaterialRef.current
    const ghosts = ghostInstancesRef.current
    const light = lightRef.current

    if (core) core.scale.setScalar(1 + level * (0.025 + pulse * 0.018))
    if (halo) halo.scale.setScalar(0.94 + level * (0.16 + pulse * 0.035))
    if (coreMaterial) {
      coreMaterial.emissiveIntensity = level * (2.35 + pulse * 0.45)
      coreMaterial.opacity = level * 0.29
    }
    if (haloMaterial) haloMaterial.opacity = level * (0.065 + pulse * 0.03)
    if (ghostMaterial) {
      ghostMaterial.uniforms.uOpacity.value = level * 0.72
      ghostMaterial.uniforms.uTime.value = playback.orbitAngle
    }
    if (light) light.intensity = level * 0.95 * globalIntensity

    const updateGhosts = ghosts && (
      lastGhostLevelRef.current !== playback.level
      || (playback.level > 0 && !reducedMotion)
    )
    if (updateGhosts && ghosts) {
      const radius = 0.62 + (1 - level) * 0.14
      for (let index = 0; index < LAMP_GHOST_COUNT; index += 1) {
        const phase = index / LAMP_GHOST_COUNT * Math.PI * 2
        const angle = playback.orbitAngle + phase
        const heightWave = reducedMotion
          ? Math.sin(phase * 2.1) * 0.045
          : Math.sin(angle * 1.7 + phase * 0.6) * 0.095
        const size = (0.74 + (index % 3) * 0.12) * (0.72 + level * 0.28)
        ghostDummy.position.set(
          Math.cos(angle) * radius,
          heightWave + (index % 2 === 0 ? 0.045 : -0.035),
          Math.sin(angle) * radius,
        )
        ghostDummy.rotation.set(0, 0, 0)
        ghostDummy.scale.set(size, size, size)
        ghostDummy.updateMatrix()
        ghosts.setMatrixAt(index, ghostDummy.matrix)
      }
      ghosts.instanceMatrix.needsUpdate = true
    }
    lastGhostLevelRef.current = playback.level
  })

  return (
    <group name="tentacle-lamp-spectral-effect" position={LAMP_GLOBE_CENTER}>
      <mesh ref={haloRef} raycast={() => undefined} renderOrder={5}>
        <sphereGeometry args={[LAMP_GLOBE_RADIUS * 1.22, 24, 16]} />
        <meshBasicMaterial
          ref={haloMaterialRef}
          color="#63e9df"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={coreRef} raycast={() => undefined} renderOrder={6}>
        <sphereGeometry args={[LAMP_GLOBE_RADIUS, 28, 18]} />
        <meshStandardMaterial
          ref={coreMaterialRef}
          color="#1c6763"
          emissive="#5ef4e8"
          emissiveIntensity={0}
          roughness={0.18}
          metalness={0.02}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <instancedMesh
        ref={ghostInstancesRef}
        args={[undefined, undefined, LAMP_GHOST_COUNT]}
        raycast={() => undefined}
        frustumCulled={false}
        renderOrder={7}
      >
        <planeGeometry args={[0.34, 0.52, LAMP_GHOST_SEGMENTS, LAMP_GHOST_SEGMENTS]} />
        <shaderMaterial
          ref={ghostMaterialRef}
          uniforms={ghostUniforms}
          vertexShader={LAMP_GHOST_VERTEX_SHADER}
          fragmentShader={LAMP_GHOST_FRAGMENT_SHADER}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.07]}
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
  const fittedAsset = useMemo<StudioAsset>(() => ({
    ...asset,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    visualScale: [1, 1, 1],
  }), [asset])

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
        ghostCount: LAMP_GHOST_COUNT,
        relicApertureRadius: LAMP_RELIC_APERTURE_RADIUS,
      }}
    >
      <group scale={asset.visualScale ?? [1, 1, 1]}>
        <AssetSlot asset={fittedAsset} />
        <LampSpectralGlow
          controller={controller}
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
