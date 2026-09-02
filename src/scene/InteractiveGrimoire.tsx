import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Html, RoundedBox, useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  AnimationMixer,
  Box3,
  Group,
  MathUtils,
  Mesh,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { StudioAsset } from '../data/studioAssets'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

export const GRIMOIRE_ANIMATION_CLIP = 'Grimoire_3Click_Cycle'
export const GRIMOIRE_SEGMENTS = [
  { start: 0, end: 1.5, cue: '召唤回忆的幽灵' },
  { start: 1.5, end: 4.5, cue: '再次点击 · 连翻三页' },
  { start: 4.5, end: 6, cue: '再次点击 · 合上禁书' },
] as const

type TimelineState = {
  time: number
  active: {
    index: number
    end: number
  } | null
}

type TimelineRef = MutableRefObject<TimelineState>

type InteractiveGrimoireProps = {
  asset: StudioAsset
  editing: boolean
  label: string
  onOpenAlbum: () => void
}

type BoundaryProps = {
  asset: StudioAsset
  fallback: ReactNode
  children: ReactNode
}

type BoundaryState = {
  failed: boolean
}

class GrimoireErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[深渊工作室] 无法加载 ${this.props.asset.label} 的动画，已启用可交互的临时程序化占位；正式封皮仍需使用 Tripo GLB。`,
      error,
      info.componentStack,
    )
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function LoadedAnimatedGrimoire({
  asset,
  timelineRef,
}: {
  asset: StudioAsset
  timelineRef: TimelineRef
}) {
  const gltf = useGLTF(asset.src!)
  const clip = gltf.animations.find(({ name }) => name === GRIMOIRE_ANIMATION_CLIP)

  if (!clip) {
    throw new Error(`GLB 中缺少动画片段 ${GRIMOIRE_ANIMATION_CLIP}`)
  }

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
  const lastTimeRef = useRef(-1)

  useEffect(() => {
    const action = mixer.clipAction(clip)
    action.enabled = true
    action.clampWhenFinished = true
    action.play()
    mixer.setTime(Math.min(timelineRef.current.time, clip.duration))

    return () => {
      action.stop()
      mixer.stopAllAction()
      mixer.uncacheRoot(prepared.object)
    }
  }, [clip, mixer, prepared.object, timelineRef])

  useFrame(() => {
    const nextTime = Math.min(timelineRef.current.time, clip.duration)
    if (Math.abs(nextTime - lastTimeRef.current) < 0.0001) return
    lastTimeRef.current = nextTime
    mixer.setTime(nextTime)
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

const BOOK_WIDTH = 0.78
const BOOK_DEPTH = 0.52
const PAGE_TURN_WINDOWS = [
  [1.58, 2.34],
  [2.45, 3.24],
  [3.36, 4.34],
] as const

// Loading/error fallback only. The published Tripo/Blender GLB remains the
// final visual asset and replaces this entire branch as soon as it is ready.
function ProceduralGrimoire({ timelineRef }: { timelineRef: TimelineRef }) {
  const topCoverRef = useRef<Group>(null)
  const pageRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const time = timelineRef.current.time
    const opened = MathUtils.smoothstep(time, 0, 1.5)
    const closing = MathUtils.smoothstep(time, 4.5, 6)
    const openEnvelope = opened * (1 - closing)

    if (topCoverRef.current) {
      topCoverRef.current.rotation.z = openEnvelope * (Math.PI - 0.14)
    }

    PAGE_TURN_WINDOWS.forEach(([start, end], index) => {
      const page = pageRefs.current[index]
      if (!page) return
      const turned = MathUtils.smoothstep(time, start, end) * (1 - closing)
      page.rotation.z = turned * (Math.PI - 0.1)
    })
  })

  return (
    <group name="procedural-grimoire-fallback" userData={{ proceduralFallback: true }}>
      <RoundedBox
        args={[BOOK_WIDTH, 0.045, BOOK_DEPTH]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.028, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#251315" roughness={0.66} metalness={0.18} />
      </RoundedBox>

      <RoundedBox
        args={[BOOK_WIDTH - 0.055, 0.07, BOOK_DEPTH - 0.055]}
        radius={0.014}
        smoothness={2}
        position={[0.005, 0.074, 0]}
        castShadow
      >
        <meshStandardMaterial color="#998567" roughness={0.9} metalness={0.01} />
      </RoundedBox>

      <RoundedBox
        args={[0.065, 0.115, BOOK_DEPTH + 0.015]}
        radius={0.022}
        smoothness={3}
        position={[-BOOK_WIDTH / 2 - 0.005, 0.07, 0]}
        castShadow
      >
        <meshStandardMaterial color="#160d0f" roughness={0.54} metalness={0.28} />
      </RoundedBox>

      {PAGE_TURN_WINDOWS.map((_, index) => (
        <group
          key={`forbidden-page-${index + 1}`}
          ref={(group) => {
            pageRefs.current[index] = group
          }}
          position={[-BOOK_WIDTH / 2 + 0.012, 0.112 + index * 0.006, 0]}
        >
          <mesh position={[BOOK_WIDTH / 2 - 0.018, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[BOOK_WIDTH - 0.036, 0.007, BOOK_DEPTH - 0.045]} />
            <meshStandardMaterial
              color={index === 1 ? '#a18a69' : '#ad9876'}
              roughness={0.94}
              metalness={0}
            />
          </mesh>
          <mesh
            position={[BOOK_WIDTH * 0.18, 0.005, (index - 1) * 0.055]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.035, 0.052, 18]} />
            <meshBasicMaterial color="#5b231f" transparent opacity={0.72} />
          </mesh>
        </group>
      ))}

      <group ref={topCoverRef} position={[-BOOK_WIDTH / 2, 0.13, 0]}>
        <RoundedBox
          args={[BOOK_WIDTH, 0.045, BOOK_DEPTH]}
          radius={0.025}
          smoothness={3}
          position={[BOOK_WIDTH / 2, 0, 0]}
          castShadow
        >
          <meshStandardMaterial color="#291316" roughness={0.6} metalness={0.22} />
        </RoundedBox>
        <mesh
          position={[BOOK_WIDTH / 2, 0.026, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.115, 0.018, 7, 28]} />
          <meshStandardMaterial
            color="#80623a"
            emissive="#552018"
            emissiveIntensity={0.24}
            roughness={0.4}
            metalness={0.66}
          />
        </mesh>
        <mesh position={[BOOK_WIDTH / 2, 0.03, 0]} scale={[0.065, 0.012, 0.095]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshStandardMaterial
            color="#92b199"
            emissive="#3c9d91"
            emissiveIntensity={1.8}
            roughness={0.28}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

function GrimoireAura({ active, playing }: { active: boolean; playing: boolean }) {
  const { globalIntensity } = useStudioLightingSettings()

  return (
    <group visible={active || playing}>
      <pointLight
        position={[0, 0.34, 0]}
        color="#56b9aa"
        intensity={(active ? 0.82 : 0.32) * globalIntensity}
        distance={1.55}
        decay={2}
      />
    </group>
  )
}

export function InteractiveGrimoire({
  asset,
  editing,
  label,
  onOpenAlbum,
}: InteractiveGrimoireProps) {
  const timelineRef = useRef<TimelineState>({ time: 0, active: null })
  const nextSegmentRef = useRef(0)
  const [hovered, setHovered] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [nextSegmentIndex, setNextSegmentIndex] = useState(0)
  const [initialPromptDismissed, setInitialPromptDismissed] = useState(false)

  useFrame((_, delta) => {
    const timeline = timelineRef.current
    const active = timeline.active
    if (!active) return

    timeline.time = Math.min(active.end, timeline.time + delta)
    if (timeline.time < active.end - 0.0001) return

    timeline.active = null
    const nextIndex = (active.index + 1) % GRIMOIRE_SEGMENTS.length
    nextSegmentRef.current = nextIndex
    setNextSegmentIndex(nextIndex)
    setPlaying(false)
    if (active.index === 0) onOpenAlbum()
  }, -1)

  useEffect(() => {
    if (!hovered || editing) {
      document.body.style.cursor = ''
      return
    }
    document.body.style.cursor = playing ? 'wait' : 'pointer'

    return () => {
      document.body.style.cursor = ''
    }
  }, [editing, hovered, playing])

  useEffect(() => {
    if (editing) setHovered(false)
  }, [editing])

  const playNextSegment = useCallback(() => {
    const timeline = timelineRef.current
    if (timeline.active) return

    const index = nextSegmentRef.current
    const segment = GRIMOIRE_SEGMENTS[index]
    timeline.time = segment.start
    timeline.active = { index, end: segment.end }
    setInitialPromptDismissed(true)
    setPlaying(true)
  }, [])

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (editing || event.button !== 0 || event.delta > 8) return
    playNextSegment()
  }, [editing, playNextSegment])

  const fallback = <ProceduralGrimoire timelineRef={timelineRef} />

  return (
    <group
      name="interactive-grimoire"
      position={asset.position}
      rotation={asset.rotation}
      scale={asset.visualScale ?? [1, 1, 1]}
      userData={{
        assetId: asset.id,
        animationClip: GRIMOIRE_ANIMATION_CLIP,
        clickCycleSegments: GRIMOIRE_SEGMENTS.length,
      }}
    >
      <GrimoireAura active={hovered} playing={playing} />
      <mesh
        name="grimoire-interaction-surface"
        position={[0, 0.15, 0]}
        userData={{ interactionProxy: true, studioAssetId: asset.id }}
        onPointerDown={!editing ? (event) => event.stopPropagation() : undefined}
        onClick={!editing ? handleClick : undefined}
        onPointerEnter={!editing ? (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        } : undefined}
        onPointerLeave={!editing ? (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        } : undefined}
      >
        <boxGeometry args={[0.96, 0.34, 0.64]} />
        <meshBasicMaterial
          visible={false}
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
      {asset.src ? (
        <GrimoireErrorBoundary asset={asset} fallback={fallback}>
          <Suspense fallback={fallback}>
            <LoadedAnimatedGrimoire asset={asset} timelineRef={timelineRef} />
          </Suspense>
        </GrimoireErrorBoundary>
      ) : fallback}

      {!initialPromptDismissed && hovered && !editing ? (
        <Html
          center
          position={[0, 0.46, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="grimoire-callout" data-playing={playing ? 'true' : 'false'}>
            <span>{label} · 0{nextSegmentIndex + 1}/03</span>
            <strong>{playing ? '禁书正在回应…' : GRIMOIRE_SEGMENTS[nextSegmentIndex].cue}</strong>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
