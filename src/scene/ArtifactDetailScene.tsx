import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Box3,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
} from 'three'
import type { HiddenRelic } from '../data/hiddenRelics'
import {
  DETAIL_CENTER,
  DETAIL_PARCHMENT_OFFSET as PARCHMENT_OFFSET,
  DETAIL_PARCHMENT_TARGET_WIDTH as PARCHMENT_TARGET_WIDTH,
  DETAIL_RELIC_SIZE,
  detailLightOffsetScale,
} from './artifactDetailLayout'
import { RelicLoadBoundary, RelicModel } from './RelicModel'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

const PARCHMENT_SRC = `${import.meta.env.BASE_URL}models/ui/abyssal-artifact-parchment-optimized.glb`

function DetailRenderTuning({ accent }: { accent: string }) {
  const { globalIntensity } = useStudioLightingSettings()
  const keyRef = useRef<DirectionalLight>(null)
  const fillRef = useRef<DirectionalLight>(null)
  const rightRef = useRef(new Vector3())
  const upRef = useRef(new Vector3())
  const centerRef = useRef(new Vector3(...DETAIL_CENTER))
  const lastCameraPositionRef = useRef(new Vector3(Number.POSITIVE_INFINITY, 0, 0))
  const lastCameraQuaternionRef = useRef(new Quaternion())

  useFrame(({ camera }) => {
    const key = keyRef.current
    const fill = fillRef.current
    if (!key || !fill) return

    const cameraMoved =
      !lastCameraPositionRef.current.equals(camera.position) ||
      1 - Math.abs(lastCameraQuaternionRef.current.dot(camera.quaternion)) > 0.0000001
    if (!cameraMoved) return
    lastCameraPositionRef.current.copy(camera.position)
    lastCameraQuaternionRef.current.copy(camera.quaternion)

    const right = rightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = upRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const distanceScale = detailLightOffsetScale(
      camera.position.distanceTo(centerRef.current),
    )

    key.position
      .copy(camera.position)
      .addScaledVector(right, -1.35 * distanceScale)
      .addScaledVector(up, 0.85 * distanceScale)
    fill.position
      .copy(camera.position)
      .addScaledVector(right, 1.5 * distanceScale)
      .addScaledVector(up, -0.2 * distanceScale)
    key.target.position.copy(centerRef.current)
    fill.target.position.copy(centerRef.current)
    key.target.updateMatrixWorld()
    fill.target.updateMatrixWorld()
  })

  return (
    <>
      <directionalLight
        ref={keyRef}
        color="#e0bd83"
        intensity={1.55 * globalIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight ref={fillRef} color={accent} intensity={0.52 * globalIntensity} />
    </>
  )
}

function LuxParchmentModel() {
  const gltf = useGLTF(PARCHMENT_SRC)

  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const dimensions = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())

    return {
      object,
      scale: PARCHMENT_TARGET_WIDTH / Math.max(dimensions.x, 0.0001),
      offset: [-center.x, -center.y, -center.z] as [number, number, number],
    }
  }, [gltf.scene])

  return (
    <group position={[-0.12, -0.03, 0]} scale={prepared.scale}>
      <primitive object={prepared.object} position={prepared.offset} dispose={null} />
    </group>
  )
}

function AbyssalParchment() {
  const parchmentRef = useRef<Group>(null)
  const centerRef = useRef(new Vector3(...DETAIL_CENTER))
  const viewDirectionRef = useRef(new Vector3())
  const entranceElapsedRef = useRef(0)
  const entranceCompleteRef = useRef(false)
  const placementLockedRef = useRef(false)
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useFrame(({ camera }, delta) => {
    const parchment = parchmentRef.current
    if (!parchment) return

    if (!placementLockedRef.current) {
      const center = centerRef.current
      const viewDirection = viewDirectionRef.current
        .copy(camera.position)
        .sub(center)
        .normalize()

      parchment.position
        .copy(center)
        .addScaledVector(viewDirection, -PARCHMENT_OFFSET)
      parchment.quaternion.copy(camera.quaternion)
      placementLockedRef.current = true
    }

    if (entranceCompleteRef.current) return
    entranceElapsedRef.current += Math.min(delta, 0.05)
    const progress = reducedMotionRef.current
      ? 1
      : MathUtils.clamp(entranceElapsedRef.current / 0.52, 0, 1)
    entranceCompleteRef.current = progress >= 1
    const eased = 1 - Math.pow(1 - progress, 3)
    parchment.scale.setScalar(MathUtils.lerp(0.94, 1, eased))
  }, 1)

  return (
    <group ref={parchmentRef}>
      <RelicLoadBoundary fallback={null}>
        <Suspense fallback={null}>
          <LuxParchmentModel />
        </Suspense>
      </RelicLoadBoundary>
    </group>
  )
}

function RelicEntrance({ relic }: { relic: HiddenRelic }) {
  const entranceRef = useRef<Group>(null)
  const entranceElapsedRef = useRef(0)
  const entranceCompleteRef = useRef(false)
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useFrame((_, delta) => {
    const entrance = entranceRef.current
    if (!entrance || entranceCompleteRef.current) return

    entranceElapsedRef.current += Math.min(delta, 0.05)
    const progress = reducedMotionRef.current
      ? 1
      : MathUtils.clamp(entranceElapsedRef.current / 0.68, 0, 1)
    entranceCompleteRef.current = progress >= 1
    const eased = 1 - Math.pow(1 - progress, 3)
    const scale = MathUtils.lerp(0.76, 1, eased)
    entrance.scale.setScalar(scale)
    entrance.position.y = MathUtils.lerp(0.16, 0, eased)
    entrance.rotation.y = MathUtils.lerp(0.22, 0, eased)
    entrance.rotation.z = MathUtils.lerp(-0.05, 0, eased)
  })

  return (
    <group ref={entranceRef} position={[0, 0.16, 0]} rotation={[0, 0.22, -0.05]} scale={0.76}>
      <RelicModel relic={relic} size={DETAIL_RELIC_SIZE} fitAxisOverride="largest" />
    </group>
  )
}

export function ArtifactDetailScene({ relic }: { relic: HiddenRelic }) {
  const { ambientIntensity, globalIntensity } = useStudioLightingSettings()

  return (
    <>
      <color attach="background" args={['#050708']} />
      {/* Keep zoom photometrically neutral; view-depth fog made distant relics turn black. */}
      <DetailRenderTuning accent={relic.accent} />
      <ambientLight
        color="#718783"
        intensity={0.58 * globalIntensity * ambientIntensity}
      />
      <hemisphereLight
        args={['#9fb3af', '#24100e']}
        intensity={0.88 * globalIntensity * ambientIntensity}
      />
      <spotLight
        position={[3.2, 5.8, 3.4]}
        target-position={DETAIL_CENTER}
        color="#d8aa67"
        intensity={12 * globalIntensity}
        angle={0.62}
        penumbra={0.9}
        distance={13}
      />
      <pointLight
        position={[2.6, 2.8, -3.5]}
        color="#8f3328"
        intensity={2.2 * globalIntensity}
        distance={7}
      />
      <group name="artifact-detail-rotation-root">
        <AbyssalParchment />
        <group position={DETAIL_CENTER} rotation={[0.08, -0.28, 0]}>
          <RelicLoadBoundary key={relic.src}>
            <Suspense fallback={null}>
              <RelicEntrance relic={relic} />
            </Suspense>
          </RelicLoadBoundary>
        </group>
      </group>
    </>
  )
}
