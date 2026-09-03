import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, TransformControls, useProgress } from '@react-three/drei'
import { Select, Selection } from '@react-three/postprocessing'
import {
  ACESFilmicToneMapping,
  Group,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  FINAL_MONITOR_TARGET,
  HIDDEN_RELIC_BY_HOST_ASSET_ID,
  HIDDEN_RELIC_BY_ID,
  HIDDEN_RELICS,
  type HiddenRelicId,
} from '../data/hiddenRelics'
import { STUDIO_ASSETS } from '../data/studioAssets'
import {
  COMPUTER_IDEA_INSCRIPTION_ID,
  PERFECT_TYRANNY_INSCRIPTION_ID,
  VIDEO_BEYOND_SCREEN_INSCRIPTION_ID,
} from '../data/sceneInscriptions'
import {
  clampStudioScale,
  resolveAttachedPoint,
  type StudioEditorTool,
  type StudioLayout,
  type StudioTransform,
} from '../editor/studioLayout'
import type { StudioCopy } from '../editor/studioCopy'
import type { StudioLightingSettings } from '../editor/studioLighting'
import type { StudioTextLayout } from '../editor/studioTextLayout'
import type { MysteryView } from '../game/mysteryState'
import { StudioTextLayerProvider } from '../ui/editor/StudioTextLayer'
import { AssetSlot } from './AssetSlot'
import {
  DETAIL_CENTER,
  DETAIL_INITIAL_CAMERA_DISTANCE,
  DETAIL_MIN_CAMERA_DISTANCE,
} from './artifactDetailLayout'
import { BrainStudioShell } from './BrainStudioShell'
import { ComputerIdeaInscription } from './ComputerIdeaInscription'
import {
  CAMERA_INTRO_TOTAL_SECONDS,
  cameraIntroProgress,
  shortestAngleDelta,
} from './cameraIntro'
import { CandelabraInstallation, CandleSet } from './CandleSet'
import { CthulhuMaskInstallation } from './CthulhuMaskInstallation'
import { DisplayRackInstallation } from './DisplayRackInstallation'
import { FinalMonitorTarget, HiddenRelics } from './HiddenRelics'
import { InteractiveCabinet } from './InteractiveCabinet'
import { InteractiveChair } from './InteractiveChair'
import { InteractiveGrimoire } from './InteractiveGrimoire'
import { InteractiveTentacleLamp } from './InteractiveTentacleLamp'
import { MechanicalOctopusInstallation } from './MechanicalOctopusInstallation'
import { MonitorInstallation } from './MonitorInstallation'
import {
  ObjectCalloutOverlay,
  type ObjectCalloutTarget,
} from './ObjectCalloutOverlay'
import { PostEffects } from './PostEffects'
import { PerfectTyrannyInscription } from './PerfectTyrannyInscription'
import { RoomShell } from './RoomShell'
import { RendererExposureController, StudioLighting } from './StudioLighting'
import { StudioLightingSettingsProvider } from './StudioLightingSettingsContext'
import { VideoBeyondScreenInscription } from './VideoBeyondScreenInscription'
import { resolveChairSwivelPoint } from './chairRotation'

const ArtifactDetailScene = lazy(() => import('./ArtifactDetailScene').then((module) => ({
  default: module.ArtifactDetailScene,
})))

function markSceneMilestone(name: string) {
  if (typeof performance === 'undefined' || !performance.mark) return
  if (performance.getEntriesByName(name).length === 0) performance.mark(name)
}

export type StudioCanvasHandle = {
  resetCamera: () => void
  focusRelic: (relicId: HiddenRelicId, onComplete: () => void) => boolean
  focusDreamArchive: (onComplete: () => void) => boolean
  cancelRelicFocus: () => void
}

type StudioCanvasProps = {
  view: MysteryView
  foundRelicIds: readonly HiddenRelicId[]
  finaleReady: boolean
  onOpenRelic: (relicId: HiddenRelicId) => void
  onOpenDreamArchive: () => void
  onOpenGrimoireAlbum: () => void
  onOpenTelevision: () => void
  onOpenFinale: () => void
  editingLayout: boolean
  editingTransforms: boolean
  studioLayout: StudioLayout
  defaultStudioLayout: StudioLayout
  studioCopy: StudioSceneCopy
  studioTextLayout: StudioTextLayout
  studioLighting: StudioLightingSettings
  selectedAssetId: string | null
  editorTool: StudioEditorTool
  onSelectAsset: (assetId: string | null) => void
  onAssetTransformChange: (assetId: string, transform: StudioTransform) => void
  renderPaused?: boolean
}

export type StudioSceneCopy = Pick<
  StudioCopy,
  | 'assetLabels'
  | 'terminalCalloutLabel'
  | 'dreamArchiveCalloutLabel'
  | 'videoBeyondScreenText'
  | 'computerIdeaText'
  | 'perfectTyrannyText'
>

const LOCAL_STUDIO_ASSET_BY_ID = new Map(
  STUDIO_ASSETS.map((asset) => [asset.id, {
    ...asset,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
  }] as const),
)

const DREAM_ARCHIVE_SHELF_ASSET_ID = 'demonic-display-rack'
const DREAM_ARCHIVE_SHELF_CALLOUT_ID = 'dream-archive-shelf'
const DREAM_ARCHIVE_SHELF_DEFAULT_ANCHOR = [-1.45, 0.92, 0.7] as const
const VINTAGE_TELEVISION_ASSET_ID = 'vintage-television'
const INTERACTIVE_CHAIR_RELIC_ID: HiddenRelicId = 'spinal-clasp'
const CHAIR_SWIVEL_RENDER_PIVOT = [0, 0.438, 0] as const
const CHAIR_TURNING_SUPPRESSED_RELIC_IDS = [INTERACTIVE_CHAIR_RELIC_ID] as const
const ignoreTextLayerSelection = () => undefined
const ignoreTextLayerCommit = () => undefined
const ignoreStudioProxyRaycast = () => undefined

// The 1.44× head silhouette needs enough breathing room at 1280×720. Move
// the camera about 33% back along the approved sight line without changing its
// target, so the taller cranium and shoulders remain inside the frame.
const DEFAULT_CAMERA_POSITION = [10.25, 5.57, 15.08] as const
const DEFAULT_CAMERA_TARGET = [-0.42, 1.48, -0.72] as const
// Establish the intact profile first, then orbit around the same focal point
// to reveal the open studio without a distracting dolly or vertical drift.
const INTRO_CAMERA_POSITION = [-9.560432, 5.57, 16.011449] as const
const MIN_CAMERA_DISTANCE = 1.45
const MAX_CAMERA_DISTANCE = 30
const MIN_POLAR_ANGLE = 0.18
const MAX_POLAR_ANGLE = 1.48
const CAMERA_RETURN_DURATION = 0.68
const RELIC_FOCUS_DURATION = 0.82
const DEFAULT_CAMERA_TARGET_VECTOR = new Vector3(...DEFAULT_CAMERA_TARGET)
const DEFAULT_CAMERA_SPHERICAL = new Spherical().setFromVector3(
  new Vector3(...DEFAULT_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET_VECTOR),
)
const INTRO_CAMERA_SPHERICAL = new Spherical().setFromVector3(
  new Vector3(...INTRO_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET_VECTOR),
)
const DETAIL_CAMERA_DIRECTION = new Vector3(...DEFAULT_CAMERA_POSITION)
  .sub(DEFAULT_CAMERA_TARGET_VECTOR)
  .normalize()

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

type CameraReturnState =
  | { kind: 'intro'; phase: 'waiting' }
  | { kind: 'intro'; phase: 'running'; elapsed: number }
  | { kind: 'reset'; phase: 'pending' }
  | {
      kind: 'reset'
      phase: 'running'
      elapsed: number
      fromTarget: Vector3
      fromTheta: number
      fromPhi: number
      fromRadius: number
      fromZoom: number
    }

type RelicFocusState =
  | {
      phase: 'pending'
      toTarget: Vector3
      distance: number
      onComplete: () => void
    }
  | {
      phase: 'running'
      startedAt: number
      fromPosition: Vector3
      fromTarget: Vector3
      toPosition: Vector3
      toTarget: Vector3
      fromZoom: number
      onComplete: () => void
    }

function smootherStep(progress: number) {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10)
}

function clearOrbitMomentum(controls: OrbitControlsHandle) {
  const position = controls.object.position.clone()
  const target = controls.target.clone()
  const zoom = controls.object.zoom
  const damping = controls.enableDamping

  controls.enableDamping = false
  controls.update()
  controls.object.position.copy(position)
  controls.target.copy(target)
  controls.object.zoom = zoom
  controls.object.updateProjectionMatrix()
  controls.update()
  controls.enableDamping = damping
}

function snapCameraToDefault(controls: OrbitControlsHandle) {
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.object.position.set(...DEFAULT_CAMERA_POSITION)
  controls.target.set(...DEFAULT_CAMERA_TARGET)
  if (controls.object instanceof PerspectiveCamera) {
    controls.object.zoom = 1
  }
  controls.object.updateProjectionMatrix()
  controls.update()
  controls.enableDamping = damping
  controls.saveState()
}

function snapCameraToDetail(controls: OrbitControlsHandle) {
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.target.set(...DETAIL_CENTER)
  controls.object.position
    .copy(controls.target)
    .addScaledVector(DETAIL_CAMERA_DIRECTION, DETAIL_INITIAL_CAMERA_DISTANCE)
  if (controls.object instanceof PerspectiveCamera) {
    controls.object.zoom = 1
  }
  controls.object.updateProjectionMatrix()
  controls.update()
  controls.enableDamping = damping
  controls.saveState()
}

function CameraIntroReady({
  cameraReturnRef,
}: {
  cameraReturnRef: MutableRefObject<CameraReturnState | null>
}) {
  useEffect(() => {
    markSceneMilestone('studio:head-committed')
    const intro = cameraReturnRef.current
    if (intro?.kind === 'intro' && intro.phase === 'waiting') {
      cameraReturnRef.current = { kind: 'intro', phase: 'running', elapsed: 0 }
    }
  }, [cameraReturnRef])

  return null
}

function CameraTransitionDriver({
  controlsRef,
  nativePointerActiveRef,
  cameraReturnRef,
  relicFocusRef,
  reducedMotionRef,
}: {
  controlsRef: RefObject<OrbitControlsHandle | null>
  nativePointerActiveRef: MutableRefObject<boolean>
  cameraReturnRef: MutableRefObject<CameraReturnState | null>
  relicFocusRef: MutableRefObject<RelicFocusState | null>
  reducedMotionRef: MutableRefObject<boolean>
}) {
  const targetScratchRef = useRef(new Vector3())
  const offsetScratchRef = useRef(new Vector3())
  const sphericalScratchRef = useRef(new Spherical())
  const positionScratchRef = useRef(new Vector3())

  useFrame((_, frameDelta) => {
    const controls = controlsRef.current
    if (!controls) return

    const dt = Math.min(frameDelta, 0.05)
    const cameraReturn = cameraReturnRef.current
    const relicFocus = relicFocusRef.current
    const reducedMotion = reducedMotionRef.current

    if (relicFocus) {
      clearOrbitMomentum(controls)
      controls.enabled = false

      if (relicFocus.phase === 'pending') {
        const approachDirection = offsetScratchRef.current
          .copy(controls.object.position)
          .sub(relicFocus.toTarget)
        if (approachDirection.lengthSq() < 0.000001) {
          controls.object.getWorldDirection(approachDirection).multiplyScalar(-1)
        }
        approachDirection.normalize()
        const toPosition = positionScratchRef.current
          .copy(relicFocus.toTarget)
          .addScaledVector(approachDirection, relicFocus.distance)

        if (reducedMotion) {
          controls.target.copy(relicFocus.toTarget)
          controls.object.position.copy(toPosition)
          controls.object.zoom = 1
          controls.object.updateProjectionMatrix()
          controls.update()
          relicFocusRef.current = null
          controls.enabled = true
          relicFocus.onComplete()
          return
        }

        relicFocusRef.current = {
          phase: 'running',
          startedAt: performance.now(),
          fromPosition: controls.object.position.clone(),
          fromTarget: controls.target.clone(),
          toPosition: toPosition.clone(),
          toTarget: relicFocus.toTarget.clone(),
          fromZoom: controls.object.zoom,
          onComplete: relicFocus.onComplete,
        }
        return
      }

      const elapsedSeconds = (performance.now() - relicFocus.startedAt) / 1000
      const progress = MathUtils.clamp(elapsedSeconds / RELIC_FOCUS_DURATION, 0, 1)
      const eased = smootherStep(progress)
      controls.target.lerpVectors(relicFocus.fromTarget, relicFocus.toTarget, eased)
      controls.object.position.lerpVectors(
        relicFocus.fromPosition,
        relicFocus.toPosition,
        eased,
      )
      controls.object.zoom = MathUtils.lerp(relicFocus.fromZoom, 1, eased)
      controls.object.updateProjectionMatrix()
      controls.update()

      if (progress >= 1) {
        controls.target.copy(relicFocus.toTarget)
        controls.object.position.copy(relicFocus.toPosition)
        controls.object.zoom = 1
        controls.object.updateProjectionMatrix()
        controls.update()
        relicFocusRef.current = null
        controls.enabled = true
        relicFocus.onComplete()
      }
      return
    }

    if (cameraReturn?.kind === 'intro') {
      if (nativePointerActiveRef.current) return

      if (reducedMotion) {
        snapCameraToDefault(controls)
        cameraReturnRef.current = null
        return
      }
      if (cameraReturn.phase === 'waiting') return

      cameraReturn.elapsed += dt
      const progress = cameraIntroProgress(cameraReturn.elapsed)
      const theta = INTRO_CAMERA_SPHERICAL.theta + shortestAngleDelta(
        INTRO_CAMERA_SPHERICAL.theta,
        DEFAULT_CAMERA_SPHERICAL.theta,
      ) * progress
      const phi = MathUtils.lerp(
        INTRO_CAMERA_SPHERICAL.phi,
        DEFAULT_CAMERA_SPHERICAL.phi,
        progress,
      )
      const radius = Math.exp(MathUtils.lerp(
        Math.log(INTRO_CAMERA_SPHERICAL.radius),
        Math.log(DEFAULT_CAMERA_SPHERICAL.radius),
        progress,
      ))
      const offset = offsetScratchRef.current.setFromSpherical(
        sphericalScratchRef.current.set(radius, phi, theta),
      )
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.target.copy(DEFAULT_CAMERA_TARGET_VECTOR)
      controls.object.position.copy(DEFAULT_CAMERA_TARGET_VECTOR).add(offset)
      controls.object.zoom = 1
      controls.object.updateProjectionMatrix()
      controls.update()
      controls.enableDamping = damping

      if (cameraReturn.elapsed >= CAMERA_INTRO_TOTAL_SECONDS) {
        snapCameraToDefault(controls)
        cameraReturnRef.current = null
      }
      return
    }

    if (cameraReturn) {
      if (nativePointerActiveRef.current) return

      if (cameraReturn.phase === 'pending') {
        clearOrbitMomentum(controls)
        if (reducedMotion) {
          snapCameraToDefault(controls)
          cameraReturnRef.current = null
          return
        }

        const currentSpherical = sphericalScratchRef.current.setFromVector3(
          offsetScratchRef.current
            .copy(controls.object.position)
            .sub(controls.target),
        )
        cameraReturnRef.current = {
          kind: 'reset',
          phase: 'running',
          elapsed: 0,
          fromTarget: controls.target.clone(),
          fromTheta: currentSpherical.theta,
          fromPhi: currentSpherical.phi,
          fromRadius: currentSpherical.radius,
          fromZoom: controls.object.zoom,
        }
        return
      }

      if (reducedMotion) {
        snapCameraToDefault(controls)
        cameraReturnRef.current = null
        return
      }

      cameraReturn.elapsed += dt
      const progress = MathUtils.clamp(
        cameraReturn.elapsed / CAMERA_RETURN_DURATION,
        0,
        1,
      )
      const eased = progress * progress * (3 - 2 * progress)
      const thetaDelta = MathUtils.euclideanModulo(
        DEFAULT_CAMERA_SPHERICAL.theta - cameraReturn.fromTheta + Math.PI,
        Math.PI * 2,
      ) - Math.PI
      const theta = cameraReturn.fromTheta + thetaDelta * eased
      const phi = MathUtils.lerp(
        cameraReturn.fromPhi,
        DEFAULT_CAMERA_SPHERICAL.phi,
        eased,
      )
      const radius = Math.exp(MathUtils.lerp(
        Math.log(Math.max(cameraReturn.fromRadius, 0.0001)),
        Math.log(DEFAULT_CAMERA_SPHERICAL.radius),
        eased,
      ))
      const target = targetScratchRef.current.lerpVectors(
        cameraReturn.fromTarget,
        DEFAULT_CAMERA_TARGET_VECTOR,
        eased,
      )
      const offset = offsetScratchRef.current.setFromSpherical(
        sphericalScratchRef.current.set(radius, phi, theta),
      )
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.target.copy(target)
      controls.object.position.copy(target).add(offset)
      controls.object.zoom = MathUtils.lerp(cameraReturn.fromZoom, 1, eased)
      controls.object.updateProjectionMatrix()
      controls.update()
      controls.enableDamping = damping

      if (progress >= 1) {
        snapCameraToDefault(controls)
        cameraReturnRef.current = null
      }
      return
    }

  })

  return null
}

function CameraPerformanceRegressor() {
  const lastPositionRef = useRef(new Vector3(Number.POSITIVE_INFINITY, 0, 0))
  const lastQuaternionRef = useRef<[number, number, number, number]>([
    Number.POSITIVE_INFINITY,
    0,
    0,
    0,
  ])
  const lastZoomRef = useRef(Number.POSITIVE_INFINITY)
  const lastRegressAtRef = useRef(-1)

  useFrame(({ camera, clock, performance: performanceState }) => {
    const quaternion = camera.quaternion
    const lastQuaternion = lastQuaternionRef.current
    const cameraChanged =
      camera.position.distanceToSquared(lastPositionRef.current) > 0.0000001 ||
      Math.abs(quaternion.x - lastQuaternion[0]) > 0.00001 ||
      Math.abs(quaternion.y - lastQuaternion[1]) > 0.00001 ||
      Math.abs(quaternion.z - lastQuaternion[2]) > 0.00001 ||
      Math.abs(quaternion.w - lastQuaternion[3]) > 0.00001 ||
      Math.abs(camera.zoom - lastZoomRef.current) > 0.00001

    if (
      cameraChanged &&
      clock.elapsedTime - lastRegressAtRef.current >= 0.24
    ) {
      performanceState.regress()
      lastRegressAtRef.current = clock.elapsedTime
    }

    lastPositionRef.current.copy(camera.position)
    lastQuaternion[0] = quaternion.x
    lastQuaternion[1] = quaternion.y
    lastQuaternion[2] = quaternion.z
    lastQuaternion[3] = quaternion.w
    lastZoomRef.current = camera.zoom
  })

  return null
}

function StudioShadowMapController({
  dynamic,
  studioLayout,
}: {
  dynamic: boolean
  studioLayout: StudioLayout
}) {
  const gl = useThree(({ gl: renderer }) => renderer)
  const lastCameraPositionRef = useRef(new Vector3(Number.POSITIVE_INFINITY, 0, 0))
  const lastCameraQuaternionRef = useRef(new Quaternion())
  const shadowRefreshUntilRef = useRef(0)
  const pendingShadowFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const previousAutoUpdate = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = previousAutoUpdate
      gl.shadowMap.needsUpdate = true
    }
  }, [gl])

  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    shadowRefreshUntilRef.current = dynamic
      ? window.performance.now() + 850
      : 0
    lastCameraPositionRef.current.set(Number.POSITIVE_INFINITY, 0, 0)
  }, [dynamic, gl])

  // Asset completion is event-driven. Detail assets get a short refresh window
  // for their entrance animation; the studio refreshes only on completed loads.
  useEffect(() => {
    const unsubscribe = useProgress.subscribe((state, previousState) => {
      if (!dynamic && !state.active && state.total > 0 && state.loaded === state.total) {
        markSceneMilestone('studio:assets-loaded')
      }
      if (
        state.loaded === previousState.loaded &&
        state.total === previousState.total
      ) return

      gl.shadowMap.needsUpdate = true
      if (dynamic) {
        shadowRefreshUntilRef.current = window.performance.now() + 750
      }
      if (pendingShadowFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingShadowFrameRef.current)
      }
      pendingShadowFrameRef.current = window.requestAnimationFrame(() => {
        gl.shadowMap.needsUpdate = true
        pendingShadowFrameRef.current = null
      })
    })

    return () => {
      unsubscribe()
      if (pendingShadowFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingShadowFrameRef.current)
        pendingShadowFrameRef.current = null
      }
    }
  }, [dynamic, gl])

  useEffect(() => {
    gl.shadowMap.needsUpdate = true
  }, [gl, studioLayout])

  useFrame(({ camera }) => {
    if (!dynamic) return

    const cameraMoved =
      !lastCameraPositionRef.current.equals(camera.position) ||
      1 - Math.abs(lastCameraQuaternionRef.current.dot(camera.quaternion)) > 0.0000001
    if (cameraMoved || window.performance.now() < shadowRefreshUntilRef.current) {
      gl.shadowMap.needsUpdate = true
    }
    lastCameraPositionRef.current.copy(camera.position)
    lastCameraQuaternionRef.current.copy(camera.quaternion)
  })

  return null
}

function cleanTransformValue(value: number) {
  const rounded = Number(value.toFixed(6))
  return Math.abs(rounded) < 0.000001 ? 0 : rounded
}

function snapshotAssetTransform(group: Group): StudioTransform {
  return {
    position: [
      cleanTransformValue(group.position.x),
      cleanTransformValue(group.position.y),
      cleanTransformValue(group.position.z),
    ],
    rotation: [
      cleanTransformValue(group.rotation.x),
      cleanTransformValue(group.rotation.y),
      cleanTransformValue(group.rotation.z),
    ],
    scale: [
      cleanTransformValue(group.scale.x),
      cleanTransformValue(group.scale.y),
      cleanTransformValue(group.scale.z),
    ],
  }
}

function StudioScene({
  controlsRef,
  nativePointerActiveRef,
  cameraReturnRef,
  relicFocusRef,
  reducedMotionRef,
  view,
  foundRelicIds,
  finaleReady,
  onOpenRelic,
  onOpenDreamArchive,
  onOpenGrimoireAlbum,
  onOpenTelevision,
  onOpenFinale,
  editingLayout,
  editingTransforms,
  studioLayout,
  defaultStudioLayout,
  studioCopy,
  selectedAssetId,
  editorTool,
  onSelectAsset,
  onAssetTransformChange,
}: {
  controlsRef: RefObject<OrbitControlsHandle | null>
  nativePointerActiveRef: MutableRefObject<boolean>
  cameraReturnRef: MutableRefObject<CameraReturnState | null>
  relicFocusRef: MutableRefObject<RelicFocusState | null>
  reducedMotionRef: MutableRefObject<boolean>
  view: MysteryView
  foundRelicIds: readonly HiddenRelicId[]
  finaleReady: boolean
  onOpenRelic: (relicId: HiddenRelicId) => void
  onOpenDreamArchive: () => void
  onOpenGrimoireAlbum: () => void
  onOpenTelevision: () => void
  onOpenFinale: () => void
  editingLayout: boolean
  editingTransforms: boolean
  studioLayout: StudioLayout
  defaultStudioLayout: StudioLayout
  studioCopy: StudioSceneCopy
  selectedAssetId: string | null
  editorTool: StudioEditorTool
  onSelectAsset: (assetId: string | null) => void
  onAssetTransformChange: (assetId: string, transform: StudioTransform) => void
}) {
  const assetGroupRefs = useRef(new Map<string, Group>())
  const editableGroupCallbacksRef = useRef(
    new Map<string, (group: Group | null) => void>(),
  )
  const [hoveredCalloutId, setHoveredCalloutId] = useState<string | null>(null)
  const [cabinetDoorOpen, setCabinetDoorOpen] = useState(false)
  const [chairTurnAngle, setChairTurnAngle] = useState(0)
  const [chairTurning, setChairTurning] = useState(false)
  const transformDraggingRef = useRef(false)
  const scaleDragStartRef = useRef<[number, number, number] | null>(null)
  const normalizingScaleRef = useRef(false)
  const pendingTransformRef = useRef<{ assetId: string } | null>(null)
  const registerEditableGroup = useCallback((id: string, group: Group | null) => {
    if (group) assetGroupRefs.current.set(id, group)
    else assetGroupRefs.current.delete(id)
  }, [])
  const getEditableGroupRef = useCallback((id: string) => {
    const cached = editableGroupCallbacksRef.current.get(id)
    if (cached) return cached
    const callback = (group: Group | null) => registerEditableGroup(id, group)
    editableGroupCallbacksRef.current.set(id, callback)
    return callback
  }, [registerEditableGroup])
  const detailRelic = view.kind === 'relic'
    ? HIDDEN_RELIC_BY_ID.get(view.relicId) ?? null
    : null
  const resolvedRelicHitPositions = useMemo(() => new Map(
    HIDDEN_RELICS.map((relic) => {
      const defaultTransform = defaultStudioLayout[relic.hostAssetId]
      const currentTransform = studioLayout[relic.hostAssetId] ?? defaultTransform
      const position = defaultTransform && currentTransform
        ? relic.id === 'spinal-clasp'
          ? resolveChairSwivelPoint(
              relic.hitPosition,
              CHAIR_SWIVEL_RENDER_PIVOT,
              chairTurnAngle,
              { defaultTransform, currentTransform },
            )
          : resolveAttachedPoint(defaultTransform, currentTransform, relic.hitPosition)
        : [...relic.hitPosition] as [number, number, number]
      return [relic.id, position] as const
    }),
  ), [chairTurnAngle, defaultStudioLayout, studioLayout])
  const finalMonitorPosition = useMemo(() => {
    const defaultTransform = defaultStudioLayout['watching-monitor']
    const currentTransform = studioLayout['watching-monitor'] ?? defaultTransform
    return defaultTransform && currentTransform
      ? resolveAttachedPoint(defaultTransform, currentTransform, FINAL_MONITOR_TARGET.position)
      : [...FINAL_MONITOR_TARGET.position] as [number, number, number]
  }, [defaultStudioLayout, studioLayout])
  const dreamArchiveShelfPosition = useMemo(() => {
    const defaultTransform = defaultStudioLayout[DREAM_ARCHIVE_SHELF_ASSET_ID]
    const currentTransform = studioLayout[DREAM_ARCHIVE_SHELF_ASSET_ID] ?? defaultTransform
    return defaultTransform && currentTransform
      ? resolveAttachedPoint(defaultTransform, currentTransform, DREAM_ARCHIVE_SHELF_DEFAULT_ANCHOR)
      : [...DREAM_ARCHIVE_SHELF_DEFAULT_ANCHOR] as [number, number, number]
  }, [defaultStudioLayout, studioLayout])
  const calloutTargetById = useMemo(() => new Map<string, ObjectCalloutTarget>([
    ...HIDDEN_RELICS.map((relic) => [relic.id, {
      id: relic.id,
      label: studioCopy.assetLabels[relic.hostAssetId] ?? relic.hostLabel,
      textLayerId: `asset-label:${relic.hostAssetId}`,
      position: resolvedRelicHitPositions.get(relic.id) ?? relic.hitPosition,
      accent: relic.accent,
    }] as const),
    [FINAL_MONITOR_TARGET.id, {
      id: FINAL_MONITOR_TARGET.id,
      label: studioCopy.terminalCalloutLabel,
      textLayerId: 'terminalCalloutLabel',
      position: finalMonitorPosition,
      accent: '#d16a31',
    }] as const,
    [DREAM_ARCHIVE_SHELF_CALLOUT_ID, {
      id: DREAM_ARCHIVE_SHELF_CALLOUT_ID,
      label: studioCopy.dreamArchiveCalloutLabel,
      textLayerId: 'dreamArchiveCalloutLabel',
      position: dreamArchiveShelfPosition,
      accent: '#c9a86a',
    }] as const,
  ]), [
    dreamArchiveShelfPosition,
    finalMonitorPosition,
    resolvedRelicHitPositions,
    studioCopy,
  ])
  const activeCalloutTarget = calloutTargetById.get(
    hoveredCalloutId ?? '',
  ) ?? null
  const selectedAssetObject = selectedAssetId
    ? assetGroupRefs.current.get(selectedAssetId) ?? null
    : null

  useEffect(() => {
    if (editingLayout) {
      cameraReturnRef.current = null
      relicFocusRef.current = null
      const controls = controlsRef.current
      if (controls) {
        clearOrbitMomentum(controls)
        controls.enabled = true
      }
      return
    }

    transformDraggingRef.current = false
    pendingTransformRef.current = null
  }, [
    cameraReturnRef,
    controlsRef,
    editingLayout,
    relicFocusRef,
  ])

  useEffect(() => {
    if (view.kind !== 'studio') {
      cameraReturnRef.current = null
      setHoveredCalloutId(null)
    }
  }, [cameraReturnRef, view.kind])

  useEffect(() => {
    if (editingLayout) setHoveredCalloutId(null)
  }, [editingLayout])

  useLayoutEffect(() => {
    if (!detailRelic) return
    const controls = controlsRef.current
    if (!controls) return

    cameraReturnRef.current = null
    relicFocusRef.current = null
    clearOrbitMomentum(controls)
    controls.enabled = true
    snapCameraToDetail(controls)
  }, [cameraReturnRef, controlsRef, detailRelic, relicFocusRef])

  return (
    <>
      <RendererExposureController />
      {detailRelic ? (
        <Suspense fallback={null}>
          <ArtifactDetailScene key={detailRelic.id} relic={detailRelic} />
        </Suspense>
      ) : (
        <>
          <color attach="background" args={['#030506']} />
          <fog attach="fog" args={['#080b0d', 12, 30]} />
        </>
      )}

      <group visible={!detailRelic} name="persistent-studio-world">
          <StudioLighting active={!detailRelic} />
          <RoomShell brainMode />

          <Suspense fallback={null}>
            <BrainStudioShell />
            <CameraIntroReady cameraReturnRef={cameraReturnRef} />
          </Suspense>
          <Suspense fallback={null}>
            <VideoBeyondScreenInscription
              ref={getEditableGroupRef(VIDEO_BEYOND_SCREEN_INSCRIPTION_ID)}
              text={studioCopy.videoBeyondScreenText}
              transform={
                studioLayout[VIDEO_BEYOND_SCREEN_INSCRIPTION_ID]
                ?? defaultStudioLayout[VIDEO_BEYOND_SCREEN_INSCRIPTION_ID]
              }
              editing={editingLayout}
              selected={selectedAssetId === VIDEO_BEYOND_SCREEN_INSCRIPTION_ID}
              onSelect={() => onSelectAsset(VIDEO_BEYOND_SCREEN_INSCRIPTION_ID)}
            />
          </Suspense>
          <Suspense fallback={null}>
            <PerfectTyrannyInscription
              ref={getEditableGroupRef(PERFECT_TYRANNY_INSCRIPTION_ID)}
              text={studioCopy.perfectTyrannyText}
              transform={
                studioLayout[PERFECT_TYRANNY_INSCRIPTION_ID]
                ?? defaultStudioLayout[PERFECT_TYRANNY_INSCRIPTION_ID]
              }
              editing={editingLayout}
              selected={selectedAssetId === PERFECT_TYRANNY_INSCRIPTION_ID}
              onSelect={() => onSelectAsset(PERFECT_TYRANNY_INSCRIPTION_ID)}
            />
          </Suspense>
          {STUDIO_ASSETS.map((asset) => {
              const transform = studioLayout[asset.id] ?? defaultStudioLayout[asset.id]
              const localAsset = LOCAL_STUDIO_ASSET_BY_ID.get(asset.id) ?? asset
              const hostRelic = HIDDEN_RELIC_BY_HOST_ASSET_ID.get(asset.id)
              const editSelected = editingLayout && selectedAssetId === asset.id
              const isDreamArchiveShelf = asset.id === DREAM_ARCHIVE_SHELF_ASSET_ID
              const isVintageTelevision = asset.id === VINTAGE_TELEVISION_ASSET_ID
              const isInteractiveCabinet = asset.kind === 'cabinet'
              const isInteractiveChair = asset.kind === 'chair'
              const isInteractiveGrimoire = asset.kind === 'grimoire'
              const isInteractiveLamp = asset.kind === 'lamp'
              if (!transform) return null

              const proxyCalloutId = isDreamArchiveShelf
                ? DREAM_ARCHIVE_SHELF_CALLOUT_ID
                : hostRelic?.id ?? null

              return (
                <group
                  key={`${asset.id}:${asset.src ?? 'placeholder'}`}
                  ref={getEditableGroupRef(asset.id)}
                  name={`editable-asset:${asset.id}`}
                  position={transform.position}
                  rotation={transform.rotation}
                  scale={transform.scale}
                  userData={{ studioAssetId: asset.id }}
                  onClick={!editingLayout && isVintageTelevision ? (event) => {
                    if (event.button !== 0 || event.delta > 8) return
                    event.stopPropagation()
                    setHoveredCalloutId(null)
                    onOpenTelevision()
                  } : undefined}
                  onPointerEnter={!editingLayout && isVintageTelevision ? (event) => {
                    event.stopPropagation()
                    document.body.style.cursor = 'pointer'
                  } : undefined}
                  onPointerLeave={!editingLayout && isVintageTelevision ? (event) => {
                    event.stopPropagation()
                    document.body.style.cursor = ''
                  } : undefined}
                >
                  <Select
                    name={`relic-host:${asset.id}`}
                    enabled={editSelected}
                  >
                    {asset.kind === 'octopus' ? (
                      <MechanicalOctopusInstallation asset={localAsset} />
                    ) : asset.kind === 'candelabra' ? (
                      <CandelabraInstallation asset={localAsset} active={!detailRelic} />
                    ) : asset.kind === 'lamp' ? (
                      <InteractiveTentacleLamp
                        asset={localAsset}
                        interactive={!detailRelic && !editingLayout}
                        reducedMotionRef={reducedMotionRef}
                        onHoverChange={(hovered) => {
                          if (!proxyCalloutId) return
                          setHoveredCalloutId((current) => hovered
                            ? proxyCalloutId
                            : current === proxyCalloutId ? null : current)
                        }}
                      />
                    ) : asset.kind === 'chair' ? (
                      <InteractiveChair
                        asset={localAsset}
                        interactive={!detailRelic && !editingLayout}
                        onHoverChange={(hovered) => {
                          if (!proxyCalloutId) return
                          setHoveredCalloutId((current) => hovered
                            ? proxyCalloutId
                            : current === proxyCalloutId ? null : current)
                        }}
                        onTurnStart={() => {
                          setChairTurning(true)
                          setHoveredCalloutId(null)
                        }}
                        onTurnComplete={(angle) => {
                          setChairTurnAngle(angle)
                          setChairTurning(false)
                        }}
                      />
                    ) : asset.kind === 'monitor' ? (
                      <MonitorInstallation
                        asset={localAsset}
                        finaleReady={finaleReady}
                        active={!detailRelic}
                      />
                    ) : asset.kind === 'displayRack' ? (
                      <DisplayRackInstallation asset={localAsset} />
                    ) : asset.kind === 'wallMask' ? (
                      <CthulhuMaskInstallation asset={localAsset} active={!detailRelic} />
                    ) : asset.kind === 'cabinet' ? (
                      <InteractiveCabinet
                        asset={localAsset}
                        interactive={!detailRelic && !editingLayout}
                        onDoorOpenChange={setCabinetDoorOpen}
                        onHoverChange={(hovered) => {
                          if (!proxyCalloutId) return
                          setHoveredCalloutId((current) => hovered
                            ? proxyCalloutId
                            : current === proxyCalloutId ? null : current)
                        }}
                      />
                    ) : asset.kind === 'grimoire' ? (
                      <InteractiveGrimoire
                        asset={localAsset}
                        editing={editingLayout}
                        label={studioCopy.assetLabels[asset.id] ?? asset.label}
                        onOpenAlbum={onOpenGrimoireAlbum}
                      />
                    ) : (
                      <AssetSlot asset={localAsset} active={!detailRelic} />
                    )}
                  </Select>
                  {asset.id === 'reliquary-computer' ? (
                    <Suspense fallback={null}>
                      <ComputerIdeaInscription
                        ref={getEditableGroupRef(COMPUTER_IDEA_INSCRIPTION_ID)}
                        text={studioCopy.computerIdeaText}
                        transform={
                          studioLayout[COMPUTER_IDEA_INSCRIPTION_ID]
                          ?? defaultStudioLayout[COMPUTER_IDEA_INSCRIPTION_ID]
                        }
                        editing={editingLayout}
                        selected={selectedAssetId === COMPUTER_IDEA_INSCRIPTION_ID}
                        onSelect={() => onSelectAsset(COMPUTER_IDEA_INSCRIPTION_ID)}
                      />
                    </Suspense>
                  ) : null}
                  {(
                    !isInteractiveCabinet
                    && !isInteractiveChair
                    && !isInteractiveLamp
                  ) || editingLayout ? (
                    <mesh
                    raycast={
                      detailRelic || (isInteractiveGrimoire && !editingLayout)
                        ? ignoreStudioProxyRaycast
                        : Mesh.prototype.raycast
                    }
                    name={`interaction-proxy:${asset.id}`}
                    position={[0, asset.placeholderSize[1] / 2, 0]}
                    userData={{
                      interactionProxy: true,
                      studioAssetId: asset.id,
                    }}
                    onClick={editingLayout ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      onSelectAsset(asset.id)
                    } : isDreamArchiveShelf ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      setHoveredCalloutId(null)
                      onOpenDreamArchive()
                    } : isVintageTelevision ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      setHoveredCalloutId(null)
                      onOpenTelevision()
                    } : undefined}
                    onPointerEnter={!editingLayout && (proxyCalloutId || isVintageTelevision) ? (event) => {
                      if (isDreamArchiveShelf || isVintageTelevision) event.stopPropagation()
                      if (proxyCalloutId) setHoveredCalloutId(proxyCalloutId)
                      if (isDreamArchiveShelf || isVintageTelevision) document.body.style.cursor = 'pointer'
                    } : undefined}
                    onPointerLeave={!editingLayout && (proxyCalloutId || isVintageTelevision) ? (event) => {
                      if (isDreamArchiveShelf || isVintageTelevision) event.stopPropagation()
                      if (proxyCalloutId) {
                        setHoveredCalloutId((current) => current === proxyCalloutId ? null : current)
                      }
                      if (isDreamArchiveShelf || isVintageTelevision) document.body.style.cursor = ''
                    } : undefined}
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
          })}
            {!detailRelic && editingTransforms && selectedAssetObject ? (
              <TransformControls
                object={selectedAssetObject}
                mode={editorTool}
                space={editorTool === 'translate' ? 'world' : 'local'}
                translationSnap={0.025}
                rotationSnap={MathUtils.degToRad(5)}
                scaleSnap={0.05}
                size={0.82}
                onMouseDown={() => {
                  if (!selectedAssetId) return
                  transformDraggingRef.current = true
                  pendingTransformRef.current = {
                    assetId: selectedAssetId,
                  }
                  scaleDragStartRef.current = editorTool === 'scale'
                    ? [
                        selectedAssetObject.scale.x,
                        selectedAssetObject.scale.y,
                        selectedAssetObject.scale.z,
                      ]
                    : null
                  cameraReturnRef.current = null
                  relicFocusRef.current = null
                  const controls = controlsRef.current
                  if (controls) controls.enabled = false
                }}
                onObjectChange={() => {
                  if (!selectedAssetId) return
                  const scaleStart = scaleDragStartRef.current
                  if (
                    editorTool === 'scale'
                    && scaleStart
                    && !normalizingScaleRef.current
                  ) {
                    const ratios = [
                      selectedAssetObject.scale.x / scaleStart[0],
                      selectedAssetObject.scale.y / scaleStart[1],
                      selectedAssetObject.scale.z / scaleStart[2],
                    ]
                    const ratio = ratios.reduce((selected, candidate) =>
                      Math.abs(candidate - 1) > Math.abs(selected - 1)
                        ? candidate
                        : selected,
                    1)
                    const uniformScale = clampStudioScale(scaleStart[0] * ratio)
                    normalizingScaleRef.current = true
                    selectedAssetObject.scale.setScalar(uniformScale)
                    normalizingScaleRef.current = false
                  }
                }}
                onMouseUp={() => {
                  transformDraggingRef.current = false
                  scaleDragStartRef.current = null
                  const pending = pendingTransformRef.current
                  pendingTransformRef.current = null
                  if (pending) {
                    onAssetTransformChange(
                      pending.assetId,
                      snapshotAssetTransform(selectedAssetObject),
                    )
                  }
                  const controls = controlsRef.current
                  if (controls) controls.enabled = true
                }}
              />
            ) : null}
            {!detailRelic && !editingLayout ? (
              <>
                <HiddenRelics
                  foundRelicIds={foundRelicIds}
                  suppressedRelicIds={chairTurning ? CHAIR_TURNING_SUPPRESSED_RELIC_IDS : undefined}
                  fingerprintCasketAccessible={cabinetDoorOpen}
                  hitPositions={resolvedRelicHitPositions}
                  onOpenRelic={onOpenRelic}
                />
                <FinalMonitorTarget
                  enabled={finaleReady}
                  position={finalMonitorPosition}
                  onOpenFinale={onOpenFinale}
                  onHoverChange={(hovered) => {
                    setHoveredCalloutId(hovered ? FINAL_MONITOR_TARGET.id : null)
                  }}
                />
              </>
            ) : null}
          <CandleSet active={!detailRelic} />
          <ObjectCalloutOverlay
            target={!editingLayout && view.kind === 'studio' ? activeCalloutTarget : null}
          />
      </group>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={DEFAULT_CAMERA_TARGET}
        enableDamping
        dampingFactor={0.055}
        enablePan={!detailRelic}
        enableRotate
        enableZoom
        zoomToCursor={!detailRelic}
        rotateSpeed={0.72}
        panSpeed={0.76}
        zoomSpeed={0.82}
        minDistance={detailRelic ? DETAIL_MIN_CAMERA_DISTANCE : MIN_CAMERA_DISTANCE}
        maxDistance={MAX_CAMERA_DISTANCE}
        minPolarAngle={MIN_POLAR_ANGLE}
        maxPolarAngle={MAX_POLAR_ANGLE}
        onStart={() => {
          if (transformDraggingRef.current) {
            const controls = controlsRef.current
            if (controls) controls.enabled = false
            return
          }
          if (relicFocusRef.current) {
            const controls = controlsRef.current
            if (controls) controls.enabled = false
            return
          }
          cameraReturnRef.current = null
          nativePointerActiveRef.current = true
        }}
        onEnd={() => {
          nativePointerActiveRef.current = false
        }}
      />
      <CameraTransitionDriver
        controlsRef={controlsRef}
        nativePointerActiveRef={nativePointerActiveRef}
        cameraReturnRef={cameraReturnRef}
        relicFocusRef={relicFocusRef}
        reducedMotionRef={reducedMotionRef}
      />
      <CameraPerformanceRegressor />
      <StudioShadowMapController
        dynamic={Boolean(detailRelic)}
        studioLayout={studioLayout}
      />
      <PostEffects detailMode={Boolean(detailRelic)} />
    </>
  )
}

export const StudioCanvas = memo(forwardRef<StudioCanvasHandle, StudioCanvasProps>(function StudioCanvas(
  {
    view,
    foundRelicIds,
    finaleReady,
    onOpenRelic,
    onOpenDreamArchive,
    onOpenGrimoireAlbum,
    onOpenTelevision,
    onOpenFinale,
    editingLayout,
    editingTransforms,
    studioLayout,
    defaultStudioLayout,
    studioCopy,
    studioTextLayout,
    studioLighting,
    selectedAssetId,
    editorTool,
    onSelectAsset,
    onAssetTransformChange,
    renderPaused = false,
  }: StudioCanvasProps,
  ref,
) {
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const initialIntroEnabledRef = useRef(
    view.kind === 'studio' && !reducedMotionRef.current,
  )
  const controlsRef = useRef<OrbitControlsHandle>(null)
  const nativePointerActiveRef = useRef(false)
  const cameraReturnRef = useRef<CameraReturnState | null>(
    initialIntroEnabledRef.current
      ? { kind: 'intro', phase: 'waiting' }
      : null,
  )
  const relicFocusRef = useRef<RelicFocusState | null>(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      reducedMotionRef.current = mediaQuery.matches
    }
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => {
        const controls = controlsRef.current
        if (!controls) return

        relicFocusRef.current = null
        controls.enabled = true
        cameraReturnRef.current = { kind: 'reset', phase: 'pending' }
      },
      focusRelic: (relicId, onComplete) => {
        const controls = controlsRef.current
        const relic = HIDDEN_RELIC_BY_ID.get(relicId)
        if (
          editingLayout
          || !controls
          || !relic
          || view.kind !== 'studio'
          || relicFocusRef.current
        ) {
          return false
        }

        const defaultTransform = defaultStudioLayout[relic.hostAssetId]
        const currentTransform = studioLayout[relic.hostAssetId] ?? defaultTransform
        const resolvedHitPosition = defaultTransform && currentTransform
          ? resolveAttachedPoint(defaultTransform, currentTransform, relic.hitPosition)
          : relic.hitPosition

        cameraReturnRef.current = null
        clearOrbitMomentum(controls)
        nativePointerActiveRef.current = false
        controls.enabled = false
        relicFocusRef.current = {
          phase: 'pending',
          toTarget: new Vector3(...resolvedHitPosition),
          distance: MathUtils.clamp(1.68 + relic.hitRadius * 1.3, 1.9, 2.1),
          onComplete,
        }
        return true
      },
      focusDreamArchive: (onComplete) => {
        const controls = controlsRef.current
        const defaultTransform = defaultStudioLayout[DREAM_ARCHIVE_SHELF_ASSET_ID]
        const currentTransform = studioLayout[DREAM_ARCHIVE_SHELF_ASSET_ID] ?? defaultTransform
        if (
          editingLayout
          || !controls
          || !defaultTransform
          || !currentTransform
          || view.kind !== 'studio'
          || relicFocusRef.current
        ) {
          return false
        }

        const resolvedTarget = resolveAttachedPoint(
          defaultTransform,
          currentTransform,
          DREAM_ARCHIVE_SHELF_DEFAULT_ANCHOR,
        )
        cameraReturnRef.current = null
        clearOrbitMomentum(controls)
        nativePointerActiveRef.current = false
        controls.enabled = false
        relicFocusRef.current = {
          phase: 'pending',
          toTarget: new Vector3(...resolvedTarget),
          distance: 1.95,
          onComplete,
        }
        return true
      },
      cancelRelicFocus: () => {
        relicFocusRef.current = null
        const controls = controlsRef.current
        if (controls) controls.enabled = true
      },
    }),
    [
      defaultStudioLayout,
      editingLayout,
      studioLayout,
      view.kind,
    ],
  )

  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      frameloop={renderPaused ? 'never' : 'always'}
      dpr={[0.75, 1.25]}
      performance={{ min: 0.6, max: 1, debounce: 480 }}
      camera={{
        position: initialIntroEnabledRef.current
          ? INTRO_CAMERA_POSITION
          : DEFAULT_CAMERA_POSITION,
        fov: 40,
        near: 0.05,
        far: 80,
      }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = SRGBColorSpace
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = studioLighting.exposure
        gl.shadowMap.type = PCFShadowMap
      }}
      onPointerMissed={() => {
        if (editingLayout) onSelectAsset(null)
      }}
    >
      <AdaptiveDpr />
      <StudioLightingSettingsProvider settings={studioLighting}>
        <StudioTextLayerProvider
          active={false}
          layout={studioTextLayout}
          selectedLayerId={null}
          tool="translate"
          onSelect={ignoreTextLayerSelection}
          onCommit={ignoreTextLayerCommit}
        >
          <Selection>
            <StudioScene
              controlsRef={controlsRef}
              nativePointerActiveRef={nativePointerActiveRef}
              cameraReturnRef={cameraReturnRef}
              relicFocusRef={relicFocusRef}
              reducedMotionRef={reducedMotionRef}
              view={view}
              foundRelicIds={foundRelicIds}
              finaleReady={finaleReady}
              onOpenRelic={onOpenRelic}
              onOpenDreamArchive={onOpenDreamArchive}
              onOpenGrimoireAlbum={onOpenGrimoireAlbum}
              onOpenTelevision={onOpenTelevision}
              onOpenFinale={onOpenFinale}
              editingLayout={editingLayout}
              editingTransforms={editingTransforms}
              studioLayout={studioLayout}
              defaultStudioLayout={defaultStudioLayout}
              studioCopy={studioCopy}
              selectedAssetId={selectedAssetId}
              editorTool={editorTool}
              onSelectAsset={onSelectAsset}
              onAssetTransformChange={onAssetTransformChange}
            />
          </Selection>
        </StudioTextLayerProvider>
      </StudioLightingSettingsProvider>
    </Canvas>
  )
}))
