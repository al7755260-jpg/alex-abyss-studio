import {
  Component,
  Suspense,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Mesh, Vector3 } from 'three'

type Vector3Tuple = [number, number, number]

type RackSkullSpec = {
  key: string
  label: string
  src: string
  position: Vector3Tuple
  rotation: Vector3Tuple
  maxSize: Vector3Tuple
}

export const RACK_SKULL_SPECS: readonly RackSkullSpec[] = [
  {
    key: 'cyclopean-tide-grazer-skull',
    label: '独眼潮墓兽颅',
    src: `${import.meta.env.BASE_URL}models/display-skulls/cyclopean-tide-grazer-skull-optimized.glb`,
    position: [-0.24, 0.292, 0.05],
    rotation: [0, 0.04, 0],
    maxSize: [0.52, 0.4, 0.33],
  },
  {
    key: 'spiral-antler-oracle-skull',
    label: '螺冠谕骨',
    src: `${import.meta.env.BASE_URL}models/display-skulls/spiral-antler-oracle-skull-optimized.glb`,
    position: [0.22, 0.809, 0.05],
    rotation: [0, -0.035, 0],
    maxSize: [0.58, 0.41, 0.34],
  },
  {
    key: 'chitin-maw-brood-skull',
    label: '裂颚甲母颅',
    src: `${import.meta.env.BASE_URL}models/display-skulls/chitin-maw-brood-skull-optimized.glb`,
    position: [-0.2, 1.306, 0.05],
    rotation: [0, 0.045, 0],
    maxSize: [0.5, 0.39, 0.32],
  },
  {
    key: 'star-devourer-leviathan-skull',
    label: '星噬鲸颅',
    src: `${import.meta.env.BASE_URL}models/display-skulls/star-devourer-leviathan-skull-optimized.glb`,
    position: [0.24, 1.788, 0.05],
    rotation: [0, -0.03, 0],
    maxSize: [0.56, 0.41, 0.34],
  },
] as const

type BoundaryProps = {
  spec: RackSkullSpec
  children: ReactNode
}

type BoundaryState = { failed: boolean }

class RackSkullBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[深渊工作室] 无法加载陈列头骨“${this.props.spec.label}”。`,
      error,
      info.componentStack,
    )
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function LoadedRackSkull({ spec }: { spec: RackSkullSpec }) {
  const gltf = useGLTF(spec.src)

  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = false
      child.receiveShadow = true
    })

    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = Math.min(
      spec.maxSize[0] / Math.max(size.x, 0.0001),
      spec.maxSize[1] / Math.max(size.y, 0.0001),
      spec.maxSize[2] / Math.max(size.z, 0.0001),
    )

    return {
      object,
      scale,
      offset: [-center.x, -bounds.min.y, -center.z] as Vector3Tuple,
    }
  }, [gltf.scene, spec])

  return (
    <group
      name={`lux3d-rack-skull:${spec.key}`}
      position={spec.position}
      rotation={spec.rotation}
    >
      <group scale={prepared.scale}>
        <primitive
          object={prepared.object}
          position={prepared.offset}
          dispose={null}
        />
      </group>
    </group>
  )
}

export function DemonicRackSkulls() {
  return (
    <group name="lux3d-monster-skull-collection">
      {RACK_SKULL_SPECS.map((spec) => (
        <RackSkullBoundary key={spec.key} spec={spec}>
          <Suspense fallback={null}>
            <LoadedRackSkull spec={spec} />
          </Suspense>
        </RackSkullBoundary>
      ))}
    </group>
  )
}
