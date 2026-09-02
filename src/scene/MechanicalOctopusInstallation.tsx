import type { StudioAsset, Vector3Tuple } from '../data/studioAssets'
import type { Mesh } from 'three'
import { AssetSlot } from './AssetSlot'

type MechanicalOctopusInstallationProps = {
  asset: StudioAsset
}

const OCTOPUS_EYE_GLOW_POSITION: Vector3Tuple = [0.004, 0.604, 0.302]
const ignoreEyeRaycast: Mesh['raycast'] = () => undefined

/** The GLB keeps its original eye; this tiny core supplies glow without restoring the old disc. */
export function MechanicalOctopusInstallation({
  asset,
}: MechanicalOctopusInstallationProps) {
  return (
    <>
      <AssetSlot asset={asset} />
      <mesh
        name="mechanical-octopus-eye-glow-core"
        position={OCTOPUS_EYE_GLOW_POSITION}
        scale={[0.036, 0.036, 0.012]}
        raycast={ignoreEyeRaycast}
      >
        <sphereGeometry args={[1, 16, 10]} />
        <meshStandardMaterial
          color="#183237"
          emissive="#91d8e6"
          emissiveIntensity={1.6}
          roughness={0.62}
          metalness={0.02}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
