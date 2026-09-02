import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Box3, Mesh, Object3D, Vector3 } from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { PlaceholderAsset } from './PlaceholderAsset'
import {
  CHAIR_TURN_RADIANS,
  ChairRotationController,
  normalizeChairAngle,
} from './chairRotation'

export const CHAIR_BASE_NODE_NAME = 'Chair_Base'
export const CHAIR_ROOT_NODE_NAME = 'Chair_Root'
export const CHAIR_SWIVEL_NODE_NAME = 'Chair_Swivel'
export const CHAIR_UPPER_NODE_NAME = 'Chair_Upper'

type InteractiveChairProps = {
  asset: StudioAsset
  interactive: boolean
  onHoverChange?: (hovered: boolean) => void
  onTurnStart?: () => void
  onTurnComplete?: (angle: number) => void
}

type BoundaryProps = {
  asset: StudioAsset
  fallback: ReactNode
  children: ReactNode
}

type BoundaryState = {
  failed: boolean
}

class ChairErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[深渊工作室] ${this.props.asset.label} 缺少可用的分件转轴，已保持静态占位模型。`,
      error,
      info.componentStack,
    )
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function isDescendantOf(object: Object3D, ancestor: Object3D) {
  let parent = object.parent
  while (parent) {
    if (parent === ancestor) return true
    parent = parent.parent
  }
  return false
}

function LoadedInteractiveChair({
  asset,
  swivelRef,
  onReadyChange,
}: {
  asset: StudioAsset
  swivelRef: MutableRefObject<Object3D | null>
  onReadyChange: (ready: boolean) => void
}) {
  const gltf = useGLTF(asset.src!)
  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)
    const root = object.getObjectByName('Chair_Root')
    const base = object.getObjectByName('Chair_Base')
    const swivel = object.getObjectByName('Chair_Swivel')
    const upper = object.getObjectByName('Chair_Upper')

    if (!root || !base || !swivel || !upper) {
      throw new Error(
        `GLB must contain ${CHAIR_ROOT_NODE_NAME}, ${CHAIR_BASE_NODE_NAME}, ${CHAIR_SWIVEL_NODE_NAME}, and ${CHAIR_UPPER_NODE_NAME}`,
      )
    }
    if (
      base.parent !== root
      || swivel.parent !== root
      || isDescendantOf(base, swivel)
      || !isDescendantOf(upper, swivel)
    ) {
      throw new Error('Chair_Base must stay outside Chair_Swivel and Chair_Upper must be its child')
    }

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = asset.castShadow
        child.receiveShadow = asset.receiveShadow
      }
    })

    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const sourceDimension = Math.max(size[asset.fit.axis], 0.0001)

    return {
      object,
      swivel,
      uniformScale: asset.fit.size / sourceDimension,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [asset, gltf.scene])

  useLayoutEffect(() => {
    swivelRef.current = prepared.swivel
    onReadyChange(true)

    return () => {
      if (swivelRef.current === prepared.swivel) swivelRef.current = null
      onReadyChange(false)
    }
  }, [onReadyChange, prepared, swivelRef])

  return (
    <group scale={prepared.uniformScale}>
      <primitive
        object={prepared.object}
        position={prepared.offset}
        dispose={null}
      />
    </group>
  )
}

export function InteractiveChair({
  asset,
  interactive,
  onHoverChange,
  onTurnStart,
  onTurnComplete,
}: InteractiveChairProps) {
  const controllerRef = useRef<ChairRotationController | null>(null)
  if (!controllerRef.current) controllerRef.current = new ChairRotationController()
  const controller = controllerRef.current
  const swivelRef = useRef<Object3D | null>(null)
  const hoveredRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [playing, setPlaying] = useState(false)

  const handleReadyChange = useCallback((nextReady: boolean) => {
    setReady(nextReady)
    const swivel = swivelRef.current
    if (nextReady && swivel) {
      swivel.rotation.y = controller.snapshot.angle
    }
  }, [controller])

  useFrame(({ gl }, delta) => {
    const before = controller.snapshot
    if (!before.playing) return

    const playback = controller.advance(delta)
    const swivel = swivelRef.current
    if (swivel) {
      swivel.rotation.y = playback.angle
    }
    gl.shadowMap.needsUpdate = true

    if (playback.playing) return
    setPlaying(false)
    const settledAngle = normalizeChairAngle(playback.angle)
    onTurnComplete?.(settledAngle)
    if (hoveredRef.current && interactive) onHoverChange?.(true)
  })

  useEffect(() => {
    if (!hovered || !interactive) {
      document.body.style.cursor = ''
      return
    }
    document.body.style.cursor = playing ? 'wait' : 'pointer'

    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered, interactive, playing])

  useEffect(() => {
    if (interactive) return
    hoveredRef.current = false
    setHovered(false)
  }, [interactive])

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (!interactive || !ready || event.button !== 0 || event.delta > 8) return
    if (!controller.startTurn()) return
    setPlaying(true)
    onTurnStart?.()
  }, [controller, interactive, onTurnStart, ready])

  const fallback = <PlaceholderAsset asset={asset} />

  return (
    <group
      name="interactive-chair"
      position={asset.position}
      rotation={asset.rotation}
      userData={{
        assetId: asset.id,
        swivelNode: CHAIR_SWIVEL_NODE_NAME,
        clickTurnRadians: CHAIR_TURN_RADIANS,
      }}
    >
      {interactive && ready ? (
        <mesh
          name={`chair-interaction-proxy:${asset.id}`}
          position={[0, asset.placeholderSize[1] / 2, 0]}
          userData={{
            interactionProxy: true,
            studioAssetId: asset.id,
            chairTurnProxy: true,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleClick}
          onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
            hoveredRef.current = true
            setHovered(true)
            if (!controller.snapshot.playing) onHoverChange?.(true)
          }}
          onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
            hoveredRef.current = false
            setHovered(false)
            onHoverChange?.(false)
          }}
        >
          <boxGeometry args={asset.placeholderSize} />
          <meshBasicMaterial
            visible={false}
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
      ) : null}

      <group scale={asset.visualScale ?? [1, 1, 1]}>
        {asset.src ? (
          <ChairErrorBoundary asset={asset} fallback={fallback}>
            <Suspense fallback={<PlaceholderAsset asset={asset} loading />}>
              <LoadedInteractiveChair
                asset={asset}
                swivelRef={swivelRef}
                onReadyChange={handleReadyChange}
              />
            </Suspense>
          </ChairErrorBoundary>
        ) : fallback}
      </group>
    </group>
  )
}
