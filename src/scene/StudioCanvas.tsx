import {
  forwardRef,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { Canvas, events, useFrame, type RootStore } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, useProgress } from '@react-three/drei'
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
  LOVECRAFT_PARTICLE_BUST_ASSET_ID,
  STUDIO_ASSETS,
} from '../data/studioAssets'
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
import { StudioTextLayerProvider } from '../ui/editor/StudioTextLayer'
import { AssetSlot } from './AssetSlot'
import { AlexHologramProjection } from './AlexHologramProjection'
import { clearHologramDisplay, finishHologramExit, INITIAL_HOLOGRAM_DISPLAY, toggleHologramDisplay } from './hologramPlayback'
import { resolveHologramAnchors } from './hologramAnchors'
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
import {
  DISPLAY_RACK_INSTALLATION_SCALE,
  DISPLAY_RACK_INTERACTION_SIZE,
} from './displayRackGeometry'
import { InteractiveCabinet } from './InteractiveCabinet'
import { InteractiveChair } from './InteractiveChair'
import { InteractiveGrimoire } from './InteractiveGrimoire'
import { InteractivePlaque } from './InteractivePlaque'
import { InteractiveTentacleLamp } from './InteractiveTentacleLamp'
import { LovecraftParticleMorphBust } from './LovecraftParticleMorphBust'
import { MechanicalOctopusInstallation } from './MechanicalOctopusInstallation'
import { MonitorInstallation } from './MonitorInstallation'
import { PostEffects } from './PostEffects'
import { PerfectTyrannyInscription } from './PerfectTyrannyInscription'
import { RoomShell } from './RoomShell'
import { RendererExposureController, StudioLighting } from './StudioLighting'
import { StudioLightingSettingsProvider } from './StudioLightingSettingsContext'
import { VideoBeyondScreenInscription } from './VideoBeyondScreenInscription'
import { filterRelicHostProxyIntersections } from './relicPointerEvents'
import { StudioPerformanceProbe } from './StudioPerformanceProbe'
import { AdaptiveRenderBudget } from './AdaptiveRenderBudget'
import { installDirectLightOptimization } from './optimizeDirectLights'

installDirectLightOptimization()

/** Compose inside a full-page render surface. A smaller CSS canvas would clip
 * zoomed/rotated models at an artificial rectangle in the middle of the page. */
function StudioViewportComposition() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const mobile = size.width <= 720
    const wide = size.width / size.height >= 1.5
    const heightFraction = mobile ? 0.63 : wide ? 0.84 : 0.71
    const centerY = mobile ? 0.565 : wide ? 0.52 : 0.575
    camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(22)) / heightFraction))
    camera.setViewOffset(size.width, size.height, 0, (0.5 - centerY) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    return () => { camera.clearViewOffset() }
  }, [camera, size.width, size.height])
  return null
}

function markSceneMilestone(name: string) {
  if (typeof performance === 'undefined' || !performance.mark) return
  if (performance.getEntriesByName(name).length === 0) performance.mark(name)
}

export type StudioCanvasHandle = {
  resetCamera: () => void
  focusDreamArchive: (onComplete: () => void) => boolean
  cancelFocus: () => void
}

type StudioCanvasProps = {
  onOpenDreamArchive: () => void
  onOpenGrimoireAlbum: () => void
  onOpenTelevision: () => void
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
const DREAM_ARCHIVE_SHELF_DEFAULT_ANCHOR = [-1.45, 0.92, 0.7] as const
const VINTAGE_TELEVISION_ASSET_ID = 'vintage-television'
const ignoreTextLayerSelection = () => undefined
const ignoreTextLayerCommit = () => undefined
const ignoreStudioProxyRaycast = () => undefined
const studioPointerEvents = (store: RootStore) => ({
  ...events(store),
  filter: filterRelicHostProxyIntersections,
})

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
const SCENE_FOCUS_DURATION = 0.82
const DEFAULT_CAMERA_TARGET_VECTOR = new Vector3(...DEFAULT_CAMERA_TARGET)
const DEFAULT_CAMERA_SPHERICAL = new Spherical().setFromVector3(
  new Vector3(...DEFAULT_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET_VECTOR),
)
const INTRO_CAMERA_SPHERICAL = new Spherical().setFromVector3(
  new Vector3(...INTRO_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET_VECTOR),
)
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

type SceneFocusState =
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
  sceneFocusRef,
  reducedMotionRef,
}: {
  controlsRef: RefObject<OrbitControlsHandle | null>
  nativePointerActiveRef: MutableRefObject<boolean>
  cameraReturnRef: MutableRefObject<CameraReturnState | null>
  sceneFocusRef: MutableRefObject<SceneFocusState | null>
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
    const sceneFocus = sceneFocusRef.current
    const reducedMotion = reducedMotionRef.current

    if (sceneFocus) {
      clearOrbitMomentum(controls)
      controls.enabled = false

      if (sceneFocus.phase === 'pending') {
        const approachDirection = offsetScratchRef.current
          .copy(controls.object.position)
          .sub(sceneFocus.toTarget)
        if (approachDirection.lengthSq() < 0.000001) {
          controls.object.getWorldDirection(approachDirection).multiplyScalar(-1)
        }
        approachDirection.normalize()
        const toPosition = positionScratchRef.current
          .copy(sceneFocus.toTarget)
          .addScaledVector(approachDirection, sceneFocus.distance)

        if (reducedMotion) {
          controls.target.copy(sceneFocus.toTarget)
          controls.object.position.copy(toPosition)
          controls.object.zoom = 1
          controls.object.updateProjectionMatrix()
          controls.update()
          sceneFocusRef.current = null
          controls.enabled = true
          sceneFocus.onComplete()
          return
        }

        sceneFocusRef.current = {
          phase: 'running',
          startedAt: performance.now(),
          fromPosition: controls.object.position.clone(),
          fromTarget: controls.target.clone(),
          toPosition: toPosition.clone(),
          toTarget: sceneFocus.toTarget.clone(),
          fromZoom: controls.object.zoom,
          onComplete: sceneFocus.onComplete,
        }
        return
      }

      const elapsedSeconds = (performance.now() - sceneFocus.startedAt) / 1000
      const progress = MathUtils.clamp(elapsedSeconds / SCENE_FOCUS_DURATION, 0, 1)
      const eased = smootherStep(progress)
      controls.target.lerpVectors(sceneFocus.fromTarget, sceneFocus.toTarget, eased)
      controls.object.position.lerpVectors(
        sceneFocus.fromPosition,
        sceneFocus.toPosition,
        eased,
      )
      controls.object.zoom = MathUtils.lerp(sceneFocus.fromZoom, 1, eased)
      controls.object.updateProjectionMatrix()
      controls.update()

      if (progress >= 1) {
        controls.target.copy(sceneFocus.toTarget)
        controls.object.position.copy(sceneFocus.toPosition)
        controls.object.zoom = 1
        controls.object.updateProjectionMatrix()
        controls.update()
        sceneFocusRef.current = null
        controls.enabled = true
        sceneFocus.onComplete()
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
  sceneFocusRef,
  reducedMotionRef,
  onOpenDreamArchive,
  onOpenGrimoireAlbum,
  onOpenTelevision,
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
  sceneFocusRef: MutableRefObject<SceneFocusState | null>
  reducedMotionRef: MutableRefObject<boolean>
  onOpenDreamArchive: () => void
  onOpenGrimoireAlbum: () => void
  onOpenTelevision: () => void
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
  const regressPerformance = useThree((state) => state.performance.regress)
  const [hologramDisplay, setHologramDisplay] = useState(INITIAL_HOLOGRAM_DISPLAY)
  const handleHologramExited = useCallback((session: number) => {
    setHologramDisplay((current) => finishHologramExit(current, session))
  }, [])
  const hologram = useMemo(
    () => resolveHologramAnchors(studioLayout, defaultStudioLayout),
    [studioLayout, defaultStudioLayout],
  )
  useEffect(() => {
    if (editingLayout) setHologramDisplay(clearHologramDisplay)
  }, [editingLayout])
  const assetGroupRefs = useRef(new Map<string, Group>())
  const editableGroupCallbacksRef = useRef(
    new Map<string, (group: Group | null) => void>(),
  )
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
  const lovecraftParticleBustTransform = studioLayout[LOVECRAFT_PARTICLE_BUST_ASSET_ID]
    ?? defaultStudioLayout[LOVECRAFT_PARTICLE_BUST_ASSET_ID]
  const selectedAssetObject = selectedAssetId
    ? assetGroupRefs.current.get(selectedAssetId) ?? null
    : null

  useEffect(() => {
    if (editingLayout) {
      cameraReturnRef.current = null
      sceneFocusRef.current = null
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
    sceneFocusRef,
  ])

  return (
    <>
      <RendererExposureController />

      <group name="persistent-studio-world">
          <StudioLighting active />
          <RoomShell brainMode />

          <Suspense fallback={null}>
            <BrainStudioShell />
            <CameraIntroReady cameraReturnRef={cameraReturnRef} />
          </Suspense>
          {editingLayout ? <Suspense fallback={null}>
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
          </Suspense> : null}
          {editingLayout ? <Suspense fallback={null}>
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
          </Suspense> : null}
          {STUDIO_ASSETS.map((asset) => {
              const transform = studioLayout[asset.id] ?? defaultStudioLayout[asset.id]
              const localAsset = LOCAL_STUDIO_ASSET_BY_ID.get(asset.id) ?? asset
              const editSelected = editingLayout && selectedAssetId === asset.id
              const isDreamArchiveShelf = asset.id === DREAM_ARCHIVE_SHELF_ASSET_ID
              const isVintageTelevision = asset.id === VINTAGE_TELEVISION_ASSET_ID
              const isHologramTrigger = asset.id === 'cthulhu-wall-mask'
              const isInteractiveCabinet = asset.kind === 'cabinet'
              const isInteractiveChair = asset.kind === 'chair'
              const isInteractiveGrimoire = asset.kind === 'grimoire'
              const isInteractiveLamp = asset.kind === 'lamp'
              const isInteractivePlaque = asset.kind === 'plaque'
              const interactionProxySize = isDreamArchiveShelf
                ? DISPLAY_RACK_INTERACTION_SIZE
                : asset.placeholderSize
              if (!transform) return null

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
                      <CandelabraInstallation asset={localAsset} active />
                    ) : asset.kind === 'lamp' ? (
                      <InteractiveTentacleLamp
                        asset={localAsset}
                        interactive={!editingLayout}
                        reducedMotionRef={reducedMotionRef}
                      />
                    ) : asset.kind === 'chair' ? (
                      <InteractiveChair
                        asset={localAsset}
                        interactive={!editingLayout}
                      />
                    ) : asset.kind === 'monitor' ? (
                      <MonitorInstallation
                        asset={localAsset}
                        active
                      />
                    ) : asset.kind === 'displayRack' ? (
                      <DisplayRackInstallation asset={localAsset} />
                    ) : asset.kind === 'wallMask' ? (
                      <CthulhuMaskInstallation asset={localAsset} active />
                    ) : asset.kind === 'cabinet' ? (
                      <InteractiveCabinet
                        asset={localAsset}
                        interactive={!editingLayout}
                      />
                    ) : asset.kind === 'plaque' ? (
                      <InteractivePlaque
                        asset={localAsset}
                        interactive={!editingLayout}
                      />
                    ) : asset.kind === 'grimoire' ? (
                      <InteractiveGrimoire
                        asset={localAsset}
                        editing={editingLayout}
                        label={studioCopy.assetLabels[asset.id] ?? asset.label}
                        onOpenAlbum={onOpenGrimoireAlbum}
                      />
                    ) : (
                      <AssetSlot asset={localAsset} active />
                    )}
                  </Select>
                  {isDreamArchiveShelf && lovecraftParticleBustTransform ? (
                    <group
                      name="lovecraft-particle-bust-rack-space"
                      scale={DISPLAY_RACK_INSTALLATION_SCALE}
                    >
                      <Select
                        name={`relic-host:${LOVECRAFT_PARTICLE_BUST_ASSET_ID}`}
                        enabled={
                          editingLayout
                          && selectedAssetId === LOVECRAFT_PARTICLE_BUST_ASSET_ID
                        }
                      >
                        <LovecraftParticleMorphBust
                          ref={getEditableGroupRef(LOVECRAFT_PARTICLE_BUST_ASSET_ID)}
                          transform={lovecraftParticleBustTransform}
                          editing={editingLayout}
                          interactive={!editingLayout}
                          onSelect={() => onSelectAsset(LOVECRAFT_PARTICLE_BUST_ASSET_ID)}
                        />
                      </Select>
                    </group>
                  ) : null}
                  {editingLayout && asset.id === 'reliquary-computer' ? (
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
                    && !isInteractivePlaque
                  ) || editingLayout ? (
                    <mesh
                    raycast={
                      isInteractiveGrimoire && !editingLayout
                        ? ignoreStudioProxyRaycast
                        : Mesh.prototype.raycast
                    }
                    name={`interaction-proxy:${asset.id}`}
                    position={[0, interactionProxySize[1] / 2, 0]}
                    userData={{
                      interactionProxy: true,
                      studioAssetId: asset.id,
                      hostChildOcclusionProxy: isDreamArchiveShelf,
                    }}
                    onClick={editingLayout ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      onSelectAsset(asset.id)
                    } : isDreamArchiveShelf ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      onOpenDreamArchive()
                    } : isVintageTelevision ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      onOpenTelevision()
                    } : isHologramTrigger ? (event) => {
                      if (event.button !== 0 || event.delta > 8) return
                      event.stopPropagation()
                      setHologramDisplay(toggleHologramDisplay)
                    } : undefined}
                    onPointerEnter={!editingLayout && (isDreamArchiveShelf || isVintageTelevision || isHologramTrigger) ? (event) => {
                      event.stopPropagation()
                      document.body.style.cursor = 'pointer'
                    } : undefined}
                    onPointerLeave={!editingLayout && (isDreamArchiveShelf || isVintageTelevision || isHologramTrigger) ? (event) => {
                      event.stopPropagation()
                      document.body.style.cursor = ''
                    } : undefined}
                  >
                    <boxGeometry args={interactionProxySize} />
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
            {editingTransforms && selectedAssetObject ? (
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
                  sceneFocusRef.current = null
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
          <CandleSet active />
          {hologramDisplay.mounted && !editingLayout ? (
            <Suspense fallback={null}>
              <AlexHologramProjection anchors={hologram.anchors} position={hologram.position}
                active={hologramDisplay.active} session={hologramDisplay.session} onExited={handleHologramExited} />
            </Suspense>
          ) : null}
      </group>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={DEFAULT_CAMERA_TARGET}
        enableDamping
        dampingFactor={0.12}
        enablePan
        enableRotate
        enableZoom
        zoomToCursor
        rotateSpeed={0.8}
        panSpeed={0.76}
        zoomSpeed={0.82}
        minDistance={MIN_CAMERA_DISTANCE}
        maxDistance={MAX_CAMERA_DISTANCE}
        minPolarAngle={MIN_POLAR_ANGLE}
        maxPolarAngle={MAX_POLAR_ANGLE}
        onStart={() => {
          if (transformDraggingRef.current) {
            const controls = controlsRef.current
            if (controls) controls.enabled = false
            return
          }
          if (sceneFocusRef.current) {
            const controls = controlsRef.current
            if (controls) controls.enabled = false
            return
          }
          cameraReturnRef.current = null
          nativePointerActiveRef.current = true
          regressPerformance()
        }}
        onEnd={() => {
          nativePointerActiveRef.current = false
        }}
      />
      <CameraTransitionDriver
        controlsRef={controlsRef}
        nativePointerActiveRef={nativePointerActiveRef}
        cameraReturnRef={cameraReturnRef}
        sceneFocusRef={sceneFocusRef}
        reducedMotionRef={reducedMotionRef}
      />
      <CameraPerformanceRegressor />
      <StudioShadowMapController
        dynamic={false}
        studioLayout={studioLayout}
      />
      <PostEffects editing={editingLayout} />
    </>
  )
}

export const StudioCanvas = memo(forwardRef<StudioCanvasHandle, StudioCanvasProps>(function StudioCanvas(
  {
            onOpenDreamArchive,
    onOpenGrimoireAlbum,
    onOpenTelevision,
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
    !reducedMotionRef.current,
  )
  const controlsRef = useRef<OrbitControlsHandle>(null)
  const nativePointerActiveRef = useRef(false)
  const cameraReturnRef = useRef<CameraReturnState | null>(
    initialIntroEnabledRef.current
      ? { kind: 'intro', phase: 'waiting' }
      : null,
  )
  const sceneFocusRef = useRef<SceneFocusState | null>(null)

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

        sceneFocusRef.current = null
        controls.enabled = true
        cameraReturnRef.current = { kind: 'reset', phase: 'pending' }
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
          || sceneFocusRef.current
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
        sceneFocusRef.current = {
          phase: 'pending',
          toTarget: new Vector3(...resolvedTarget),
          distance: 1.95,
          onComplete,
        }
        return true
      },
      cancelFocus: () => {
        sceneFocusRef.current = null
        const controls = controlsRef.current
        if (controls) controls.enabled = true
      },
    }),
    [
      defaultStudioLayout,
      editingLayout,
      studioLayout,
    ],
  )

  return (
    <Canvas
      events={studioPointerEvents}
      shadows={{ type: PCFShadowMap }}
      frameloop={renderPaused ? 'never' : 'always'}
      dpr={[0.75, 1.1]}
      performance={{ min: 0.6, max: 1, debounce: 480 }}
      camera={{
        position: initialIntroEnabledRef.current
          ? INTRO_CAMERA_POSITION
          : DEFAULT_CAMERA_POSITION,
        fov: 59.3,
        near: 0.05,
        far: 80,
      }}
      gl={{
        antialias: false,
        alpha: true,
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
      <AdaptiveRenderBudget />
      <StudioViewportComposition />
      <StudioPerformanceProbe />
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
              sceneFocusRef={sceneFocusRef}
              reducedMotionRef={reducedMotionRef}
              onOpenDreamArchive={onOpenDreamArchive}
              onOpenGrimoireAlbum={onOpenGrimoireAlbum}
              onOpenTelevision={onOpenTelevision}
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
