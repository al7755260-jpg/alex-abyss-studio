import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { PointLight, SpotLight } from 'three'
import { FACE_CANDLE_LIGHT, faceCandleIntensity } from './faceCandleLighting'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'
import { StudioEnvironment } from './StudioEnvironment'

function BrainPulseLights({ active = true }: { active?: boolean }) {
  const { globalIntensity } = useStudioLightingSettings()
  const tissueLightRef = useRef<PointLight | null>(null)
  const faceCandleLightRef = useRef<SpotLight | null>(null)

  useEffect(() => {
    const light = faceCandleLightRef.current
    if (!light) return

    light.target.position.set(...FACE_CANDLE_LIGHT.target)
    light.target.updateMatrixWorld()
  }, [])

  useFrame(({ clock }) => {
    if (!active) return
    const time = clock.elapsedTime
    const slowPulse = Math.sin(time * 1.08) * 0.5 + 0.5
    const nervousFlicker = Math.sin(time * 3.7 + 0.9) * 0.5 + 0.5

    if (tissueLightRef.current) {
      tissueLightRef.current.intensity = (5.9
        + slowPulse * 0.65
        + nervousFlicker * 0.1) * globalIntensity
    }
    if (faceCandleLightRef.current) {
      faceCandleLightRef.current.intensity = faceCandleIntensity(time) * globalIntensity
    }
  })

  return (
    <>
      <pointLight
        name="brain-warm-bounce"
        ref={tissueLightRef}
        color="#c65b35"
        intensity={6.25 * globalIntensity}
        distance={8.5}
        decay={2}
        position={[-2.65, 2.9, -2.3]}
        castShadow={false}
      />
      <spotLight
        name="face-candle-reflection"
        ref={faceCandleLightRef}
        color={FACE_CANDLE_LIGHT.color}
        intensity={FACE_CANDLE_LIGHT.baseIntensity * globalIntensity}
        distance={FACE_CANDLE_LIGHT.distance}
        angle={FACE_CANDLE_LIGHT.angle}
        penumbra={FACE_CANDLE_LIGHT.penumbra}
        decay={FACE_CANDLE_LIGHT.decay}
        position={FACE_CANDLE_LIGHT.position}
        castShadow={false}
      />
    </>
  )
}

export function StudioLighting({ active = true }: { active?: boolean }) {
  const { ambientIntensity, globalIntensity } = useStudioLightingSettings()
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    // Refresh the cached key shadow once after this lighting rig is mounted.
    gl.shadowMap.needsUpdate = true
  }, [gl])

  return (
    <group>
      <StudioEnvironment />
      <ambientLight
        color="#b5b0a7"
        intensity={0.12 * globalIntensity * ambientIntensity}
      />
      <hemisphereLight
        args={['#9daeb3', '#352014']}
        intensity={0.22 * globalIntensity * ambientIntensity}
        position={[0, 4, 0]}
      />

      <directionalLight
        castShadow
        name="portrait-soft-key"
        color="#ffe5cc"
        intensity={1.3 * globalIntensity}
        position={[-5.2, 7, 7]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.00025}
        shadow-normalBias={0.025}
      />

      <directionalLight
        name="portrait-cool-fill"
        castShadow={false}
        color="#91b7c7"
        intensity={0.28 * globalIntensity}
        position={[5, 3.1, 5.5]}
      />

      {/* Four direct lights total. The baked HDR supplies the copper rim;
          the single cavity point replaces the overlapping colored fills. */}
      <BrainPulseLights active={active} />
    </group>
  )
}

export function RendererExposureController() {
  const gl = useThree(({ gl: renderer }) => renderer)
  const { exposure } = useStudioLightingSettings()

  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [exposure, gl])

  return null
}
