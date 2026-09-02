import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import {
  AdditiveBlending,
  Group,
  MeshStandardMaterial,
  PointLight,
} from 'three'
import type { StudioAsset, Vector3Tuple } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

type CthulhuMaskInstallationProps = {
  asset: StudioAsset
  active?: boolean
}

const EYE_POSITIONS: readonly Vector3Tuple[] = [
  [-0.145, 0.57, 0.118],
  [0.145, 0.57, 0.118],
]

function AnimatedRedEyes({ active = true }: { active?: boolean }) {
  const { globalIntensity } = useStudioLightingSettings()
  const eyeGroups = useRef<(Group | null)[]>([])
  const coreMaterials = useRef<(MeshStandardMaterial | null)[]>([])
  const haloMaterials = useRef<(MeshStandardMaterial | null)[]>([])
  const lightRef = useRef<PointLight>(null)

  useFrame(({ clock }) => {
    if (!active) return
    const elapsed = clock.elapsedTime
    const slowPulse = 0.86 + Math.sin(elapsed * 2.15) * 0.12
    const briefDip =
      Math.pow(Math.max(0, Math.sin(elapsed * 0.83 + 2.2)), 24) * 0.34

    EYE_POSITIONS.forEach((_position, index) => {
      const phase = index * 0.31
      const jitter =
        Math.sin(elapsed * 11.7 + phase + 0.4) * 0.065 +
        Math.sin(elapsed * 23.3 + phase + 1.1) * 0.032
      const glow = Math.max(0.42, slowPulse + jitter - briefDip)
      const core = coreMaterials.current[index]
      const halo = haloMaterials.current[index]
      const group = eyeGroups.current[index]

      if (core) core.emissiveIntensity = 9.4 * glow
      if (halo) {
        halo.emissiveIntensity = 5.8 * glow
        halo.opacity = 0.16 + glow * 0.08
      }
      if (group) {
        const scale = 0.985 + glow * 0.025
        group.scale.set(scale, 0.99 + glow * 0.018, 1)
      }
    })

    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0.28, (slowPulse - briefDip) * 0.78)
        * globalIntensity
    }
  })

  return (
    <group name="cthulhu-mask-red-eyes">
      {EYE_POSITIONS.map((position, index) => (
        <group
          key={position[0]}
          ref={(node) => {
            eyeGroups.current[index] = node
          }}
          position={position}
        >
          <mesh scale={[0.073, 0.035, 0.021]}>
            <sphereGeometry args={[1, 28, 16]} />
            <meshStandardMaterial
              ref={(material) => {
                coreMaterials.current[index] = material
              }}
              color="#360000"
              emissive="#ff170d"
              emissiveIntensity={8.2}
              roughness={0.16}
              metalness={0.04}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.021]} scale={[0.011, 0.029, 0.009]}>
            <sphereGeometry args={[1, 18, 12]} />
            <meshBasicMaterial color="#120000" />
          </mesh>
          <mesh position={[0, 0, -0.004]} scale={[0.105, 0.055, 0.014]}>
            <sphereGeometry args={[1, 24, 14]} />
            <meshStandardMaterial
              ref={(material) => {
                haloMaterials.current[index] = material
              }}
              color="#200000"
              emissive="#ff1008"
              emissiveIntensity={5}
              transparent
              opacity={0.21}
              blending={AdditiveBlending}
              depthWrite={false}
              roughness={0.2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight
        ref={lightRef}
        position={[0, 0.57, 0.18]}
        color="#ff2418"
        intensity={0.66 * globalIntensity}
        distance={0.9}
        decay={2}
      />
    </group>
  )
}

export function CthulhuMaskInstallation({
  asset,
  active = true,
}: CthulhuMaskInstallationProps) {
  return (
    <>
      <AssetSlot asset={asset} />
      <group position={asset.position} rotation={asset.rotation}>
        <AnimatedRedEyes active={active} />
      </group>
    </>
  )
}
