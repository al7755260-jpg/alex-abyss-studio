import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  AnimationMixer,
  Box3,
  LoopOnce,
  Mesh,
  Vector3,
  type AnimationAction,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { StudioAsset } from '../data/studioAssets'
import { PlaceholderAsset } from './PlaceholderAsset'
import {
  CabinetPlaybackController,
  resolveCabinetClipDuration,
} from './cabinetPlayback'

type InteractiveCabinetProps = {
  asset: StudioAsset
  interactive: boolean
  onHoverChange?: (hovered: boolean) => void
  onDoorOpenChange?: (open: boolean) => void
}

type LoadedCabinetProps = {
  asset: StudioAsset
  controller: CabinetPlaybackController
  onReadyChange: (ready: boolean) => void
}

type BoundaryProps = {
  asset: StudioAsset
  children: ReactNode
}

type BoundaryState = {
  failed: boolean
}

class CabinetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[深渊工作室] 无法加载 ${this.props.asset.label} 的柜门动画，已使用程序化占位模型。`,
      error,
      info.componentStack,
    )
  }

  render() {
    return this.state.failed
      ? <PlaceholderAsset asset={this.props.asset} />
      : this.props.children
  }
}

function applySynchronizedTime(
  mixer: AnimationMixer,
  actions: readonly AnimationAction[],
  time: number,
) {
  for (const action of actions) {
    action.time = Math.min(time, action.getClip().duration)
  }
  mixer.update(0)
}

function LoadedAnimatedCabinet({
  asset,
  controller,
  onReadyChange,
}: LoadedCabinetProps) {
  const gltf = useGLTF(asset.src!)
  const duration = useMemo(
    () => resolveCabinetClipDuration(gltf.animations.map((clip) => clip.duration)),
    [gltf.animations],
  )
  const prepared = useMemo(() => {
    const object = cloneSkeleton(gltf.scene)

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
      uniformScale: asset.fit.size / sourceDimension,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [asset, gltf.scene])
  const mixer = useMemo(() => new AnimationMixer(prepared.object), [prepared.object])
  const actionsRef = useRef<AnimationAction[]>([])
  const lastTimeRef = useRef(Number.NaN)

  useEffect(() => {
    if (duration === null) {
      controller.clearDuration()
      onReadyChange(false)
      return
    }

    const actions = gltf.animations.map((clip) => {
      const action = mixer.clipAction(clip)
      action.reset()
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.enabled = true
      action.play()
      action.paused = true
      return action
    })
    actionsRef.current = actions
    const playback = controller.configureDuration(duration)
    applySynchronizedTime(mixer, actions, playback.time)
    lastTimeRef.current = playback.time
    onReadyChange(true)

    return () => {
      actionsRef.current = []
      for (const action of actions) action.stop()
      mixer.stopAllAction()
      mixer.uncacheRoot(prepared.object)
      controller.clearDuration()
      onReadyChange(false)
    }
  }, [controller, duration, gltf.animations, mixer, onReadyChange, prepared.object])

  useFrame(() => {
    const time = controller.snapshot.time
    if (Math.abs(time - lastTimeRef.current) < 0.0001) return
    lastTimeRef.current = time
    applySynchronizedTime(mixer, actionsRef.current, time)
  })

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

export function InteractiveCabinet({
  asset,
  interactive,
  onHoverChange,
  onDoorOpenChange,
}: InteractiveCabinetProps) {
  const controllerRef = useRef<CabinetPlaybackController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new CabinetPlaybackController()
  }
  const controller = controllerRef.current
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [doorOpen, setDoorOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    if (!controller.snapshot.playing) return
    const playback = controller.advance(delta)
    if (playback.playing) return
    setPlaying(false)
    setDoorOpen(playback.open)
    onDoorOpenChange?.(playback.open)
  }, -1)

  useEffect(() => {
    if (!hovered || !interactive) {
      document.body.style.cursor = ''
      return
    }
    document.body.style.cursor = playing ? 'wait' : ready ? 'pointer' : ''

    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered, interactive, playing, ready])

  useEffect(() => {
    if (interactive) return
    setHovered(false)
  }, [interactive])

  const handleReadyChange = useCallback((nextReady: boolean) => {
    setReady(nextReady)
    if (nextReady) {
      const playback = controller.snapshot
      setPlaying(playback.playing)
      setDoorOpen(playback.open)
    } else {
      setPlaying(false)
      setDoorOpen(false)
      onDoorOpenChange?.(false)
    }
  }, [controller, onDoorOpenChange])

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.button !== 0 || event.delta > 8) return
    if (!controller.toggle()) return
    setPlaying(true)
    if (!controller.snapshot.targetOpen) {
      onDoorOpenChange?.(false)
    }
  }, [controller, onDoorOpenChange])

  return (
    <group
      name="interactive-cabinet"
      position={asset.position}
      rotation={asset.rotation}
      userData={{
        assetId: asset.id,
        synchronizedClipCount: asset.src ? 'all' : 0,
        cabinetDoorState: playing
          ? controller.snapshot.targetOpen ? 'opening' : 'closing'
          : doorOpen ? 'open' : 'closed',
      }}
    >
      <group scale={asset.visualScale ?? [1, 1, 1]}>
        {asset.src ? (
          <CabinetErrorBoundary asset={asset}>
            <Suspense fallback={<PlaceholderAsset asset={asset} loading />}>
              <LoadedAnimatedCabinet
                asset={asset}
                controller={controller}
                onReadyChange={handleReadyChange}
              />
            </Suspense>
          </CabinetErrorBoundary>
        ) : (
          <PlaceholderAsset asset={asset} />
        )}
      </group>

      {interactive ? (
        <mesh
          name={`cabinet-interaction-proxy:${asset.id}`}
          position={[0, asset.placeholderSize[1] / 2, 0]}
          userData={{
            interactionProxy: true,
            studioAssetId: asset.id,
            cabinetToggleProxy: true,
            relicHostOcclusionProxy: true,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleClick}
          onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
            setHovered(true)
            onHoverChange?.(true)
          }}
          onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
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
    </group>
  )
}
