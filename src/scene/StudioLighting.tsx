import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { PointLight, SpotLight } from 'three'
import { FACE_CANDLE_LIGHT, faceCandleIntensity } from './faceCandleLighting'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

function BrainPulseLights({ active = true }: { active?: boolean }) {
  const { globalIntensity } = useStudioLightingSettings()
  const tissueLightRef = useRef<PointLight | null>(null)
  const rimLightRef = useRef<PointLight | null>(null)
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
      tissueLightRef.current.intensity = (2.35
        + slowPulse * 0.95
        + nervousFlicker * 0.18) * globalIntensity
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = (1.85 + (1 - slowPulse) * 0.42) * globalIntensity
    }
    if (faceCandleLightRef.current) {
      faceCandleLightRef.current.intensity = faceCandleIntensity(time) * globalIntensity
    }
  })

  return (
    <>
      <pointLight
        ref={tissueLightRef}
        color="#8d251f"
        intensity={2.8 * globalIntensity}
        distance={8.5}
        decay={2}
        position={[-3.6, 3.5, -2.6]}
      />
      <pointLight
        ref={rimLightRef}
        color="#2f8f96"
        intensity={2.1 * globalIntensity}
        distance={10}
        decay={2}
        position={[4.5, 5.2, 1.4]}
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

  return (
    <group>
      <ambientLight
        color="#6f797d"
        intensity={0.42 * globalIntensity * ambientIntensity}
      />
      <hemisphereLight
        args={['#4d5b61', '#251516']}
        intensity={0.58 * globalIntensity * ambientIntensity}
        position={[0, 4, 0]}
      />

      <directionalLight
        castShadow
        color="#94a3ae"
        intensity={1.05 * globalIntensity}
        position={[-4.2, 6.2, 5]}
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
        color="#9f978c"
        intensity={0.56 * globalIntensity}
        position={[4.8, 3.1, 6.4]}
      />

      <spotLight
        castShadow={false}
        color="#58747c"
        intensity={11.5 * globalIntensity}
        distance={14}
        angle={0.62}
        penumbra={0.94}
        decay={2}
        position={[3.5, 4.9, 3.8]}
      />
      <pointLight
        color="#23968d"
        intensity={1.65 * globalIntensity}
        distance={3.8}
        decay={2}
        position={[0, 1.62, -1.45]}
      />
      <pointLight
        color="#8d201f"
        intensity={3.6 * globalIntensity}
        distance={4.7}
        decay={2}
        position={[-2.55, 1.34, -1.92]}
      />
      <pointLight
        color="#724335"
        intensity={1.65 * globalIntensity}
        distance={3.8}
        decay={2}
        position={[2.75, 0.82, -2.25]}
      />
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
