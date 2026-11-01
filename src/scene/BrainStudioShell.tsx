import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { Box3, Mesh, Vector3 } from 'three'
import { useSmallPropLod } from './useSmallPropLod'
import { HEAD_PATH } from '../data/headDelivery'

const MODEL_URL = `${import.meta.env.BASE_URL}${HEAD_PATH}`
const REALTIME_MODEL_URL = `${import.meta.env.BASE_URL}models/environment/alex-mechanical-open-head-realtime.glb`

// The supplied LUX3D head is intentionally kept at its native aspect ratio.
// Only one scalar is used, so the face, skull opening and machinery can never
// be stretched independently along X, Y or Z.
const UNIFORM_SCALE = 13.5
// The old shell faced almost along world +Z. The supplied head faces local +X,
// so this quarter-turn preserves the established three-quarter portrait view.
const WORLD_YAW = -Math.PI / 2 + 0.08
const PLATFORM_LEVEL_ROLL = 0.1544988577
const WORLD_POSITION = [-1.3, -4.635, -0.55] as const

export function BrainStudioShell() {
  const gltf = useGLTF(MODEL_URL)

  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        // Preserve the supplied model's original material and UV mapping.
        child.castShadow = false
        child.receiveShadow = true
        child.raycast = () => undefined
      }
    })

    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const center = bounds.getCenter(new Vector3())

    return {
      object,
      offset: [-center.x, 0, -center.z] as const,
    }
  }, [gltf.scene])

  // Fit the untouched original, then swap only geometry for distant viewing.
  useSmallPropLod(prepared.object, REALTIME_MODEL_URL)

  return (
    <group
      position={WORLD_POSITION}
      rotation={[0, WORLD_YAW, PLATFORM_LEVEL_ROLL]}
      scale={[UNIFORM_SCALE, UNIFORM_SCALE, UNIFORM_SCALE]}
    >
      <primitive
        object={prepared.object}
        position={prepared.offset}
        dispose={null}
      />
    </group>
  )
}
