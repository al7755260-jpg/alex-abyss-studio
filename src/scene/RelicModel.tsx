import { useGLTF } from '@react-three/drei'
import {
  Component,
  useMemo,
  type ReactNode,
} from 'react'
import { Box3, Mesh, Vector3 } from 'three'
import type { HiddenRelic } from '../data/hiddenRelics'

type RelicModelProps = {
  relic: HiddenRelic
  size: number
  fitAxisOverride?: HiddenRelic['fitAxis']
  castShadow?: boolean
  receiveShadow?: boolean
}

export class RelicLoadBoundary extends Component<{
  children: ReactNode
  fallback?: ReactNode
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children
  }
}

export function RelicModel({
  relic,
  size,
  fitAxisOverride,
  castShadow = true,
  receiveShadow = true,
}: RelicModelProps) {
  const gltf = useGLTF(relic.src)

  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = castShadow
        child.receiveShadow = receiveShadow
      }
    })
    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const dimensions = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const fitAxis = fitAxisOverride ?? relic.fitAxis
    const sourceDimension = fitAxis === 'largest'
      ? Math.max(dimensions.x, dimensions.y, dimensions.z)
      : dimensions[fitAxis]

    return {
      object,
      scale: size / Math.max(sourceDimension, 0.0001),
      offset: [-center.x, -center.y, -center.z] as [number, number, number],
    }
  }, [castShadow, fitAxisOverride, gltf.scene, receiveShadow, relic.fitAxis, size])

  return (
    <group scale={prepared.scale}>
      <primitive object={prepared.object} position={prepared.offset} dispose={null} />
    </group>
  )
}
