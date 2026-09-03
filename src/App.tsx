import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type HiddenRelicId } from './data/hiddenRelics'
import { STUDIO_ASSETS } from './data/studioAssets'
import publishedScene from './data/publishedScene.json'
import { resolveSceneSnapshot } from './editor/studioSceneSnapshot'
import {
  isSceneInscriptionId,
  SCENE_INSCRIPTION_BY_ID,
  SCENE_INSCRIPTION_COPY_FIELDS,
  SCENE_INSCRIPTION_LAYOUT_ASSETS,
  SCENE_INSCRIPTIONS,
} from './data/sceneInscriptions'
import {
  createDefaultStudioCopy,
  loadStudioCopy,
  saveStudioCopy,
  STUDIO_COPY_FIELD_LIMITS,
  studioCopiesEqual,
  updateStudioAssetLabel,
  updateStudioCopyField,
  type StudioCopy,
  type StudioCopyField,
} from './editor/studioCopy'
import {
  clampStudioScale,
  createDefaultStudioLayout,
  createStudioEditorState,
  layoutsEqual,
  loadStudioLayout,
  saveStudioLayout,
  STUDIO_SCALE_STEP,
  studioEditorReducer,
  type StudioLayout,
  type StudioEditorTool,
  type StudioTransform,
} from './editor/studioLayout'
import {
  cloneStudioLighting,
  DEFAULT_STUDIO_LIGHTING,
  loadStudioLighting,
  saveStudioLighting,
  studioLightingEqual,
  updateStudioLighting,
  type StudioLightingField,
  type StudioLightingSettings,
} from './editor/studioLighting'
import {
  clampStudioTextPosition,
  clampStudioTextRotation,
  clampStudioTextScale,
  createDefaultStudioTextLayout,
  createStudioTextEditorState,
  loadStudioTextLayout,
  saveStudioTextLayout,
  studioTextEditorReducer,
  studioTextLayoutsEqual,
  type StudioTextLayout,
  type StudioTextTransform,
} from './editor/studioTextLayout'
import { hasFoundAllRelics } from './game/mysteryState'
import { useRelicMystery } from './game/useRelicMystery'
import { StudioCanvas, type StudioCanvasHandle } from './scene/StudioCanvas'
import { StormAtmosphere } from './ui/atmosphere/StormAtmosphere'
import { GameHUD } from './ui/game/GameHUD'
import type { StudioEditorSection } from './ui/editor/StudioEditorControl'
import { StudioEditorLauncher } from './ui/editor/StudioEditorLauncher'
import { StudioTextLayerProvider } from './ui/editor/StudioTextLayer'
import { LoadingOverlay } from './ui/LoadingOverlay'

const DEFAULT_STUDIO_LAYOUT = createDefaultStudioLayout([
  ...STUDIO_ASSETS,
  ...SCENE_INSCRIPTION_LAYOUT_ASSETS,
])
const STUDIO_LAYOUT_PREVIOUS_DEFAULTS: StudioLayout = {
  'mysterious-plaque': {
    position: [-3.65, 1.55, -5.53],
    rotation: [0, -0.35, 0],
    scale: [1, 1, 1],
  },
}
const DEFAULT_STUDIO_COPY = createDefaultStudioCopy(STUDIO_ASSETS)
const STUDIO_TEXT_LAYER_IDS = [
  ...Object.keys(STUDIO_COPY_FIELD_LIMITS).filter(
    (field) => !SCENE_INSCRIPTION_COPY_FIELDS.has(field),
  ),
  ...STUDIO_ASSETS.map((asset) => `asset-label:${asset.id}`),
]
const DEFAULT_STUDIO_TEXT_LAYOUT = createDefaultStudioTextLayout(STUDIO_TEXT_LAYER_IDS)
// The published composition is bundled with the site; local drafts still win.
// Keep DEFAULT_STUDIO_LAYOUT as the original attachment coordinate reference.
const PUBLISHED_STUDIO_SCENE = resolveSceneSnapshot(publishedScene, {
  layout: DEFAULT_STUDIO_LAYOUT,
  copy: DEFAULT_STUDIO_COPY,
  textLayout: DEFAULT_STUDIO_TEXT_LAYOUT,
  lighting: DEFAULT_STUDIO_LIGHTING,
})
const STUDIO_ASSET_BY_ID = new Map(STUDIO_ASSETS.map((asset) => [asset.id, asset] as const))
const STUDIO_SCENE_INSCRIPTION_OPTIONS = SCENE_INSCRIPTIONS.map((inscription) => ({
  id: inscription.id,
  label: inscription.label,
  copyField: inscription.copyField,
  rows: inscription.rows,
}))
const LAYOUT_AUTO_SAVE_DELAY_MS = 180
const COPY_AUTO_SAVE_DELAY_MS = 240
const TEXT_LAYOUT_AUTO_SAVE_DELAY_MS = 180
const LIGHTING_AUTO_SAVE_DELAY_MS = 220
const DreamArchive = lazy(() => import('./ui/ideas/DreamArchive'))
const GrimoireMemoryAlbum = lazy(() => import('./ui/grimoire/GrimoireMemoryAlbum'))
const TelevisionTransmission = lazy(() => import('./ui/television/TelevisionTransmission'))
const StudioEditorControl = lazy(() => import('./ui/editor/StudioEditorControl').then(
  (module) => ({ default: module.StudioEditorControl }),
))
const StudioSceneExport = lazy(() => import('./ui/editor/StudioSceneExport').then(
  (module) => ({ default: module.StudioSceneExport }),
))

const STUDIO_TEXT_LAYER_LABELS: Record<StudioCopyField, string> = {
  brandTitle: '主标题',
  brandSubtitle: '副标题',
  objectiveLabel: '当前目标栏目名',
  objectivePendingTitle: '未完成目标标题',
  objectivePendingDescription: '未完成目标说明',
  objectiveCompleteTitle: '完成目标标题',
  objectiveCompleteDescription: '完成目标说明',
  sanityLabel: '理智仪表名称',
  rotateHint: '旋转提示',
  zoomHint: '缩放提示',
  exploreHint: '探索提示',
  resetCameraLabel: '镜头按钮',
  backToStudioLabel: '返回按钮',
  undiscoveredRelicLabel: '未收录遗物',
  terminalCalloutLabel: '终局显示器标签',
  dreamArchiveCalloutLabel: '奇思档案书架标签',
  videoBeyondScreenText: '左侧三行文字',
  computerIdeaText: '右侧两行文字',
  perfectTyrannyText: '“完美”三行文字',
}

export default function App() {
  const studioRef = useRef<StudioCanvasHandle>(null)
  const mystery = useRelicMystery()
  const [relicTransitionPhase, setRelicTransitionPhase] = useState<'idle' | 'zoom' | 'reveal'>('idle')
  const [dreamArchiveOpen, setDreamArchiveOpen] = useState(false)
  const [grimoireMemoryOpen, setGrimoireMemoryOpen] = useState(false)
  const [televisionTransmissionOpen, setTelevisionTransmissionOpen] = useState(false)
  const [editingLayout, setEditingLayout] = useState(false)
  const [editorSection, setEditorSection] = useState<StudioEditorSection>('layout')
  const [layoutSaveState, setLayoutSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [copySaveState, setCopySaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [textLayoutSaveState, setTextLayoutSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [lightingSaveState, setLightingSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [editorState, dispatchEditor] = useReducer(
    studioEditorReducer,
    PUBLISHED_STUDIO_SCENE.layout,
    (defaults) => createStudioEditorState(
      defaults,
      loadStudioLayout(
        typeof window === 'undefined' ? null : window.localStorage,
        defaults,
        STUDIO_LAYOUT_PREVIOUS_DEFAULTS,
      ),
    ),
  )
  const [textEditorState, dispatchTextEditor] = useReducer(
    studioTextEditorReducer,
    PUBLISHED_STUDIO_SCENE.textLayout,
    (defaults) => createStudioTextEditorState(
      defaults,
      loadStudioTextLayout(
        typeof window === 'undefined' ? null : window.localStorage,
        defaults,
      ),
    ),
  )
  const [studioCopy, setStudioCopy] = useState<StudioCopy>(() => loadStudioCopy(
    typeof window === 'undefined' ? null : window.localStorage,
    PUBLISHED_STUDIO_SCENE.copy,
  ))
  const [savedStudioCopy, setSavedStudioCopy] = useState<StudioCopy>(() => studioCopy)
  const studioSceneCopy = useMemo(() => ({
    assetLabels: studioCopy.assetLabels,
    terminalCalloutLabel: studioCopy.terminalCalloutLabel,
    dreamArchiveCalloutLabel: studioCopy.dreamArchiveCalloutLabel,
    videoBeyondScreenText: studioCopy.videoBeyondScreenText,
    computerIdeaText: studioCopy.computerIdeaText,
    perfectTyrannyText: studioCopy.perfectTyrannyText,
  }), [
    studioCopy.assetLabels,
    studioCopy.computerIdeaText,
    studioCopy.dreamArchiveCalloutLabel,
    studioCopy.perfectTyrannyText,
    studioCopy.terminalCalloutLabel,
    studioCopy.videoBeyondScreenText,
  ])
  const [studioLighting, setStudioLighting] = useState<StudioLightingSettings>(() => (
    loadStudioLighting(
      typeof window === 'undefined' ? null : window.localStorage,
      PUBLISHED_STUDIO_SCENE.lighting,
    )
  ))
  const [savedStudioLighting, setSavedStudioLighting] = useState<StudioLightingSettings>(
    () => studioLighting,
  )
  const latestLayoutRef = useRef<StudioLayout>(editorState.draft)
  latestLayoutRef.current = editorState.draft
  const latestCopyRef = useRef<StudioCopy>(studioCopy)
  latestCopyRef.current = studioCopy
  const latestTextLayoutRef = useRef<StudioTextLayout>(textEditorState.draft)
  latestTextLayoutRef.current = textEditorState.draft
  const latestLightingRef = useRef<StudioLightingSettings>(studioLighting)
  latestLightingRef.current = studioLighting
  const openingRelicRef = useRef<HiddenRelicId | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const previousViewKindRef = useRef(mystery.state.view.kind)
  const finaleReady = hasFoundAllRelics(mystery.state)
  const layoutDirty = !layoutsEqual(editorState.draft, editorState.saved)
  const copyDirty = !studioCopiesEqual(studioCopy, savedStudioCopy)
  const textLayoutDirty = !studioTextLayoutsEqual(textEditorState.draft, textEditorState.saved)
  const lightingDirty = !studioLightingEqual(studioLighting, savedStudioLighting)
  const latestLayoutDirtyRef = useRef(layoutDirty)
  latestLayoutDirtyRef.current = layoutDirty
  const latestCopyDirtyRef = useRef(copyDirty)
  latestCopyDirtyRef.current = copyDirty
  const latestTextLayoutDirtyRef = useRef(textLayoutDirty)
  latestTextLayoutDirtyRef.current = textLayoutDirty
  const latestLightingDirtyRef = useRef(lightingDirty)
  latestLightingDirtyRef.current = lightingDirty
  const selectedSceneInscriptionId = isSceneInscriptionId(editorState.selectedAssetId)
    ? editorState.selectedAssetId
    : null
  const editingSceneInscription = editingLayout
    && editorSection === 'copy'
    && selectedSceneInscriptionId !== null
  const editingTransforms = editingLayout
    && (editorSection === 'layout' || editingSceneInscription)
  const editingTextTransforms = editingLayout
    && editorSection === 'copy'
    && !editingSceneInscription
  const selectedAssetLabel = useMemo(
    () => editorState.selectedAssetId
      ? studioCopy.assetLabels[editorState.selectedAssetId]
        ?? STUDIO_ASSET_BY_ID.get(editorState.selectedAssetId)?.label
        ?? SCENE_INSCRIPTION_BY_ID.get(editorState.selectedAssetId)?.label
        ?? null
      : null,
    [editorState.selectedAssetId, studioCopy.assetLabels],
  )
  const selectedTextLabel = useMemo(() => {
    if (selectedSceneInscriptionId) {
      return SCENE_INSCRIPTION_BY_ID.get(selectedSceneInscriptionId)?.label ?? '三维场景文字'
    }
    const layerId = textEditorState.selectedLayerId
    if (!layerId) return null
    if (layerId.startsWith('asset-label:')) {
      const assetId = layerId.slice('asset-label:'.length)
      const assetLabel = studioCopy.assetLabels[assetId]
        ?? STUDIO_ASSET_BY_ID.get(assetId)?.label
      return assetLabel ? `场景标签 · ${assetLabel}` : '场景悬浮标签'
    }
    return STUDIO_TEXT_LAYER_LABELS[layerId as StudioCopyField] ?? null
  }, [selectedSceneInscriptionId, studioCopy.assetLabels, textEditorState.selectedLayerId])

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current === null) return
    window.clearTimeout(revealTimerRef.current)
    revealTimerRef.current = null
  }, [])

  const beginRelicReveal = useCallback(() => {
    clearRevealTimer()
    setRelicTransitionPhase('reveal')
    revealTimerRef.current = window.setTimeout(() => {
      setRelicTransitionPhase('idle')
      revealTimerRef.current = null
    }, 720)
  }, [clearRevealTimer])

  const cancelRelicOpening = useCallback(() => {
    openingRelicRef.current = null
    studioRef.current?.cancelRelicFocus()
    clearRevealTimer()
    setRelicTransitionPhase('idle')
  }, [clearRevealTimer])

  const resetCamera = useCallback(() => {
    cancelRelicOpening()
    studioRef.current?.resetCamera()
  }, [cancelRelicOpening])

  const openDreamArchive = useCallback(() => {
    if (editingLayout) return
    cancelRelicOpening()
    document.body.style.cursor = ''
    setDreamArchiveOpen(true)
  }, [cancelRelicOpening, editingLayout])

  const closeDreamArchive = useCallback(() => {
    setDreamArchiveOpen(false)
    document.body.style.cursor = ''
    if (mystery.state.view.kind === 'studio') {
      window.requestAnimationFrame(() => resetCamera())
    }
  }, [mystery.state.view.kind, resetCamera])

  const exploreBookcaseDreams = useCallback(() => {
    if (editingLayout || dreamArchiveOpen || mystery.state.view.kind !== 'studio') return
    const started = studioRef.current?.focusDreamArchive(openDreamArchive) ?? false
    if (!started) openDreamArchive()
  }, [dreamArchiveOpen, editingLayout, mystery.state.view.kind, openDreamArchive])

  const openGrimoireMemory = useCallback(() => {
    if (
      editingLayout ||
      dreamArchiveOpen ||
      grimoireMemoryOpen ||
      televisionTransmissionOpen ||
      mystery.state.view.kind !== 'studio'
    ) return
    cancelRelicOpening()
    document.body.style.cursor = ''
    setGrimoireMemoryOpen(true)
  }, [
    cancelRelicOpening,
    dreamArchiveOpen,
    editingLayout,
    grimoireMemoryOpen,
    mystery.state.view.kind,
    televisionTransmissionOpen,
  ])

  const closeGrimoireMemory = useCallback(() => {
    setGrimoireMemoryOpen(false)
    document.body.style.cursor = ''
  }, [])

  const openTelevisionTransmission = useCallback(() => {
    if (editingLayout || mystery.state.view.kind !== 'studio') return
    cancelRelicOpening()
    document.body.style.cursor = ''
    setTelevisionTransmissionOpen(true)
  }, [cancelRelicOpening, editingLayout, mystery.state.view.kind])

  const closeTelevisionTransmission = useCallback(() => {
    setTelevisionTransmissionOpen(false)
    document.body.style.cursor = ''
  }, [])

  const finishRelicOpening = useCallback((relicId: HiddenRelicId) => {
    if (openingRelicRef.current !== relicId) return
    openingRelicRef.current = null
    mystery.actions.openRelic(relicId)
    beginRelicReveal()
  }, [beginRelicReveal, mystery.actions])

  const requestOpenRelic = useCallback((relicId: HiddenRelicId) => {
    if (editingLayout) return
    if (mystery.state.view.kind === 'relic') {
      mystery.actions.openRelic(relicId)
      beginRelicReveal()
      return
    }
    if (mystery.state.view.kind !== 'studio' || openingRelicRef.current) return

    openingRelicRef.current = relicId
    setRelicTransitionPhase('zoom')
    const started = studioRef.current?.focusRelic(
      relicId,
      () => finishRelicOpening(relicId),
    ) ?? false
    if (!started) finishRelicOpening(relicId)
  }, [beginRelicReveal, editingLayout, finishRelicOpening, mystery.actions, mystery.state.view.kind])

  const persistLayoutSnapshot = useCallback((layout: StudioLayout) => {
    try {
      return saveStudioLayout(window.localStorage, layout)
    } catch {
      return false
    }
  }, [])

  const persistCopySnapshot = useCallback((copy: StudioCopy) => {
    try {
      return saveStudioCopy(window.localStorage, copy)
    } catch {
      return false
    }
  }, [])

  const persistTextLayoutSnapshot = useCallback((layout: StudioTextLayout) => {
    try {
      return saveStudioTextLayout(window.localStorage, layout)
    } catch {
      return false
    }
  }, [])

  const persistLightingSnapshot = useCallback((lighting: StudioLightingSettings) => {
    try {
      return saveStudioLighting(window.localStorage, lighting)
    } catch {
      return false
    }
  }, [])

  const saveLayout = useCallback(() => {
    const saved = persistLayoutSnapshot(editorState.draft)
    if (!saved) {
      setLayoutSaveState('error')
      return false
    }
    dispatchEditor({ type: 'mark-saved' })
    setLayoutSaveState('saved')
    return true
  }, [editorState.draft, persistLayoutSnapshot])

  const saveCopy = useCallback(() => {
    const saved = persistCopySnapshot(studioCopy)
    if (!saved) {
      setCopySaveState('error')
      return false
    }
    setSavedStudioCopy(studioCopy)
    setCopySaveState('saved')
    return true
  }, [persistCopySnapshot, studioCopy])

  const saveTextLayout = useCallback(() => {
    const saved = persistTextLayoutSnapshot(textEditorState.draft)
    if (!saved) {
      setTextLayoutSaveState('error')
      return false
    }
    dispatchTextEditor({ type: 'mark-saved' })
    setTextLayoutSaveState('saved')
    return true
  }, [persistTextLayoutSnapshot, textEditorState.draft])

  const saveLighting = useCallback(() => {
    const saved = persistLightingSnapshot(studioLighting)
    if (!saved) {
      setLightingSaveState('error')
      return false
    }
    setSavedStudioLighting(studioLighting)
    setLightingSaveState('saved')
    return true
  }, [persistLightingSnapshot, studioLighting])

  const toggleLayoutEditor = useCallback(() => {
    if (editingLayout) {
      if (layoutDirty && !saveLayout()) {
        setEditorSection('layout')
        return
      }
      if (copyDirty && !saveCopy()) {
        setEditorSection('copy')
        return
      }
      if (textLayoutDirty && !saveTextLayout()) {
        setEditorSection('copy')
        return
      }
      if (lightingDirty && !saveLighting()) {
        setEditorSection('lighting')
        return
      }
      dispatchEditor({ type: 'select', assetId: null })
      setEditingLayout(false)
      return
    }

    cancelRelicOpening()
    setLayoutSaveState('idle')
    setCopySaveState('idle')
    setTextLayoutSaveState('idle')
    setLightingSaveState('idle')
    setEditingLayout(true)
  }, [
    cancelRelicOpening,
    copyDirty,
    editingLayout,
    layoutDirty,
    lightingDirty,
    saveCopy,
    saveLayout,
    saveLighting,
    saveTextLayout,
    textLayoutDirty,
  ])

  const changeEditorSection = useCallback((section: StudioEditorSection) => {
    setEditorSection(section)
    if (
      section === 'copy'
      && textEditorState.selectedLayerId === null
      && !isSceneInscriptionId(editorState.selectedAssetId)
    ) {
      dispatchTextEditor({ type: 'select', layerId: 'brandTitle' })
    }
  }, [editorState.selectedAssetId, textEditorState.selectedLayerId])

  const changeStudioCopyField = useCallback((field: StudioCopyField, value: string) => {
    setStudioCopy((current) => updateStudioCopyField(current, field, value))
    setCopySaveState('idle')
  }, [])

  const changeStudioAssetLabel = useCallback((assetId: string, value: string) => {
    setStudioCopy((current) => updateStudioAssetLabel(current, assetId, value))
    setCopySaveState('idle')
  }, [])

  const resetStudioCopy = useCallback(() => {
    setStudioCopy(createDefaultStudioCopy(STUDIO_ASSETS))
    setCopySaveState('idle')
  }, [])

  const changeStudioLighting = useCallback((field: StudioLightingField, value: number) => {
    setStudioLighting((current) => updateStudioLighting(current, field, value))
    setLightingSaveState('idle')
  }, [])

  const resetStudioLighting = useCallback(() => {
    setStudioLighting(cloneStudioLighting(DEFAULT_STUDIO_LIGHTING))
    setLightingSaveState('idle')
  }, [])

  const selectEditorAsset = useCallback((assetId: string | null) => {
    dispatchEditor({ type: 'select', assetId })
    if (isSceneInscriptionId(assetId)) {
      dispatchTextEditor({ type: 'select', layerId: null })
    }
  }, [])

  const setEditorTool = useCallback((tool: StudioEditorTool) => {
    dispatchEditor({ type: 'set-tool', tool })
  }, [])

  const commitAssetTransform = useCallback((assetId: string, transform: StudioTransform) => {
    dispatchEditor({ type: 'commit', assetId, transform })
    setLayoutSaveState('idle')
  }, [])

  const nudgeSelectedAsset = useCallback((
    axis: 'x' | 'y' | 'z',
    direction: -1 | 1,
  ) => {
    const assetId = editorState.selectedAssetId
    if (!assetId) return
    const current = editorState.draft[assetId]
    if (!current) return

    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
    const position = [...current.position] as [number, number, number]
    const rotation = [...current.rotation] as [number, number, number]
    if (editorState.tool === 'translate') {
      position[index] = Number((position[index] + direction * 0.05).toFixed(6))
    } else if (editorState.tool === 'rotate') {
      rotation[index] = Number((rotation[index] + direction * Math.PI / 36).toFixed(6))
    }
    commitAssetTransform(assetId, { position, rotation, scale: current.scale })
  }, [
    commitAssetTransform,
    editorState.draft,
    editorState.selectedAssetId,
    editorState.tool,
  ])

  const scaleSelectedAsset = useCallback((direction: -1 | 1) => {
    const assetId = editorState.selectedAssetId
    if (!assetId) return
    const current = editorState.draft[assetId]
    if (!current) return

    const nextScale = clampStudioScale(
      Number((current.scale[0] + direction * STUDIO_SCALE_STEP).toFixed(6)),
    )
    commitAssetTransform(assetId, {
      position: current.position,
      rotation: current.rotation,
      scale: [nextScale, nextScale, nextScale],
    })
  }, [
    commitAssetTransform,
    editorState.draft,
    editorState.selectedAssetId,
  ])

  const undoLayoutChange = useCallback(() => {
    dispatchEditor({ type: 'undo' })
    setLayoutSaveState('idle')
  }, [])

  const selectTextLayer = useCallback((layerId: string | null) => {
    dispatchTextEditor({ type: 'select', layerId })
    if (layerId && isSceneInscriptionId(editorState.selectedAssetId)) {
      dispatchEditor({ type: 'select', assetId: null })
    }
  }, [editorState.selectedAssetId])

  const setTextEditorTool = useCallback((tool: StudioEditorTool) => {
    dispatchTextEditor({ type: 'set-tool', tool })
  }, [])

  const commitTextTransform = useCallback((
    layerId: string,
    transform: StudioTextTransform,
  ) => {
    dispatchTextEditor({ type: 'commit', layerId, transform })
    setTextLayoutSaveState('idle')
  }, [])

  const nudgeSelectedText = useCallback((
    axis: 'x' | 'y',
    direction: -1 | 1,
  ) => {
    const layerId = textEditorState.selectedLayerId
    if (!layerId) return
    const current = textEditorState.draft[layerId]
    if (!current) return

    commitTextTransform(layerId, {
      ...current,
      [axis]: clampStudioTextPosition(
        Number((current[axis] + direction * 0.005).toFixed(6)),
      ),
    })
  }, [commitTextTransform, textEditorState.draft, textEditorState.selectedLayerId])

  const rotateSelectedText = useCallback((direction: -1 | 1) => {
    const layerId = textEditorState.selectedLayerId
    if (!layerId) return
    const current = textEditorState.draft[layerId]
    if (!current) return

    commitTextTransform(layerId, {
      ...current,
      rotation: clampStudioTextRotation(
        Number((current.rotation + direction * 5).toFixed(6)),
      ),
    })
  }, [commitTextTransform, textEditorState.draft, textEditorState.selectedLayerId])

  const scaleSelectedText = useCallback((direction: -1 | 1) => {
    const layerId = textEditorState.selectedLayerId
    if (!layerId) return
    const current = textEditorState.draft[layerId]
    if (!current) return

    commitTextTransform(layerId, {
      ...current,
      scale: clampStudioTextScale(
        Number((current.scale + direction * 0.05).toFixed(6)),
      ),
    })
  }, [commitTextTransform, textEditorState.draft, textEditorState.selectedLayerId])

  const undoTextLayoutChange = useCallback(() => {
    dispatchTextEditor({ type: 'undo' })
    setTextLayoutSaveState('idle')
  }, [])

  const resetTextLayout = useCallback(() => {
    dispatchTextEditor({ type: 'reset', defaults: DEFAULT_STUDIO_TEXT_LAYOUT })
    setTextLayoutSaveState('idle')
  }, [])

  useEffect(() => {
    if (!layoutDirty) return

    const saveTimer = window.setTimeout(() => {
      const saved = persistLayoutSnapshot(editorState.draft)
      if (!saved) {
        setLayoutSaveState('error')
        return
      }

      dispatchEditor({ type: 'sync-saved' })
      setLayoutSaveState('saved')
    }, LAYOUT_AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimer)
  }, [editorState.draft, layoutDirty, persistLayoutSnapshot])

  useEffect(() => {
    if (!copyDirty) return

    const saveTimer = window.setTimeout(() => {
      const saved = persistCopySnapshot(studioCopy)
      if (!saved) {
        setCopySaveState('error')
        return
      }

      setSavedStudioCopy(studioCopy)
      setCopySaveState('saved')
    }, COPY_AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimer)
  }, [copyDirty, persistCopySnapshot, studioCopy])

  useEffect(() => {
    if (!textLayoutDirty) return

    const saveTimer = window.setTimeout(() => {
      const saved = persistTextLayoutSnapshot(textEditorState.draft)
      if (!saved) {
        setTextLayoutSaveState('error')
        return
      }

      dispatchTextEditor({ type: 'sync-saved' })
      setTextLayoutSaveState('saved')
    }, TEXT_LAYOUT_AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimer)
  }, [persistTextLayoutSnapshot, textEditorState.draft, textLayoutDirty])

  useEffect(() => {
    if (!lightingDirty) return

    const saveTimer = window.setTimeout(() => {
      const saved = persistLightingSnapshot(studioLighting)
      if (!saved) {
        setLightingSaveState('error')
        return
      }

      setSavedStudioLighting(studioLighting)
      setLightingSaveState('saved')
    }, LIGHTING_AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimer)
  }, [lightingDirty, persistLightingSnapshot, studioLighting])

  useEffect(() => {
    const saveLatestLayout = () => {
      if (latestLayoutDirtyRef.current) {
        persistLayoutSnapshot(latestLayoutRef.current)
      }
      if (latestCopyDirtyRef.current) {
        persistCopySnapshot(latestCopyRef.current)
      }
      if (latestTextLayoutDirtyRef.current) {
        persistTextLayoutSnapshot(latestTextLayoutRef.current)
      }
      if (latestLightingDirtyRef.current) {
        persistLightingSnapshot(latestLightingRef.current)
      }
    }

    window.addEventListener('pagehide', saveLatestLayout)
    return () => window.removeEventListener('pagehide', saveLatestLayout)
  }, [
    persistCopySnapshot,
    persistLayoutSnapshot,
    persistLightingSnapshot,
    persistTextLayoutSnapshot,
  ])

  useEffect(() => {
    const previousViewKind = previousViewKindRef.current
    previousViewKindRef.current = mystery.state.view.kind
    if (mystery.state.view.kind !== 'studio') return
    if (previousViewKind === 'studio') return
    const frame = window.requestAnimationFrame(() => studioRef.current?.resetCamera())
    return () => window.cancelAnimationFrame(frame)
  }, [mystery.state.view.kind])

  useEffect(() => {
    if (mystery.state.view.kind === 'studio') return
    if (editingLayout && layoutDirty) saveLayout()
    if (editingLayout && copyDirty) saveCopy()
    if (editingLayout && textLayoutDirty) saveTextLayout()
    if (editingLayout && lightingDirty) saveLighting()
    setEditingLayout(false)
    dispatchEditor({ type: 'select', assetId: null })
    dispatchTextEditor({ type: 'select', layerId: null })
  }, [
    copyDirty,
    editingLayout,
    layoutDirty,
    lightingDirty,
    mystery.state.view.kind,
    saveCopy,
    saveLayout,
    saveLighting,
    saveTextLayout,
    textLayoutDirty,
  ])

  useEffect(() => () => clearRevealTimer(), [clearRevealTimer])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (grimoireMemoryOpen) return
      const target = event.target
      if (
        event.defaultPrevented ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT'))
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (editingTransforms) {
        if ((event.ctrlKey || event.metaKey) && key === 'z') {
          event.preventDefault()
          undoLayoutChange()
        } else if (key === 'g') {
          setEditorTool('translate')
        } else if (key === 'r') {
          setEditorTool('rotate')
        } else if (key === 's') {
          setEditorTool('scale')
        } else if (event.key === 'Escape') {
          if (editorState.selectedAssetId) {
            selectEditorAsset(null)
          } else {
            toggleLayoutEditor()
          }
        }
        return
      }
      if (editingTextTransforms) {
        if ((event.ctrlKey || event.metaKey) && key === 'z') {
          event.preventDefault()
          undoTextLayoutChange()
        } else if (key === 'g') {
          setTextEditorTool('translate')
        } else if (key === 'r') {
          setTextEditorTool('rotate')
        } else if (key === 's') {
          setTextEditorTool('scale')
        } else if (event.key === 'Escape') {
          if (textEditorState.selectedLayerId) {
            selectTextLayer(null)
          } else {
            toggleLayoutEditor()
          }
        }
        return
      }
      if (editingLayout) {
        if (event.key === 'Escape') toggleLayoutEditor()
        return
      }
      if (key === 'r') {
        resetCamera()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    editingLayout,
    editingTextTransforms,
    editingTransforms,
    editorState.selectedAssetId,
    grimoireMemoryOpen,
    resetCamera,
    selectEditorAsset,
    selectTextLayer,
    setEditorTool,
    setTextEditorTool,
    textEditorState.selectedLayerId,
    toggleLayoutEditor,
    undoLayoutChange,
    undoTextLayoutChange,
  ])

  return (
    <main
      className={`viewer${editingLayout ? ` viewer--editing viewer--editing-${editorSection}` : ''}${dreamArchiveOpen ? ' viewer--dreaming' : ''}${grimoireMemoryOpen ? ' viewer--grimoire-memory' : ''}${televisionTransmissionOpen ? ' viewer--transmitting' : ''}`}
      aria-busy={relicTransitionPhase === 'zoom'}
      onContextMenu={(event) => event.preventDefault()}
    >
      <StudioTextLayerProvider
        active={editingTextTransforms}
        layout={textEditorState.draft}
        selectedLayerId={textEditorState.selectedLayerId}
        tool={textEditorState.tool}
        onSelect={selectTextLayer}
        onCommit={commitTextTransform}
      >
      <div
        className="viewer__canvas"
        aria-label="克苏鲁风格三维工作室"
        aria-hidden={dreamArchiveOpen || grimoireMemoryOpen || televisionTransmissionOpen}
      >
        <StudioCanvas
          ref={studioRef}
          view={mystery.state.view}
          foundRelicIds={mystery.state.foundRelicIds}
          finaleReady={finaleReady}
          onOpenRelic={requestOpenRelic}
          onOpenDreamArchive={exploreBookcaseDreams}
          onOpenGrimoireAlbum={openGrimoireMemory}
          onOpenTelevision={openTelevisionTransmission}
          onOpenFinale={mystery.actions.openFinale}
          editingLayout={editingLayout}
          editingTransforms={editingTransforms}
          studioLayout={editorState.draft}
          defaultStudioLayout={DEFAULT_STUDIO_LAYOUT}
          studioCopy={studioSceneCopy}
          studioTextLayout={textEditorState.draft}
          studioLighting={studioLighting}
          selectedAssetId={editorState.selectedAssetId}
          editorTool={editorState.tool}
          onSelectAsset={selectEditorAsset}
          onAssetTransformChange={commitAssetTransform}
          renderPaused={dreamArchiveOpen || grimoireMemoryOpen || televisionTransmissionOpen || mystery.state.view.kind === 'finale'}
        />
        {mystery.state.view.kind === 'studio' &&
        !editingLayout &&
        !dreamArchiveOpen &&
        !grimoireMemoryOpen &&
        !televisionTransmissionOpen &&
        relicTransitionPhase === 'idle' ? (
          <StormAtmosphere />
        ) : null}
      </div>

      <GameHUD
        mystery={mystery}
        copy={studioCopy}
        onOpenRelic={requestOpenRelic}
        editingLayout={editingTransforms}
        editorControl={editingLayout ? (
          <Suspense fallback={<StudioEditorLauncher onOpen={toggleLayoutEditor} loading />}>
          <StudioEditorControl
            enabled={editingLayout}
            section={editorSection}
            copy={studioCopy}
            copyDirty={copyDirty}
            copySaveState={copySaveState}
            copyIsDefault={studioCopiesEqual(studioCopy, DEFAULT_STUDIO_COPY)}
            textLayoutDirty={textLayoutDirty}
            textLayoutSaveState={textLayoutSaveState}
            textLayoutIsDefault={studioTextLayoutsEqual(
              textEditorState.draft,
              DEFAULT_STUDIO_TEXT_LAYOUT,
            )}
            selectedTextLayerId={textEditorState.selectedLayerId}
            selectedTextLabel={selectedTextLabel}
            selectedSceneInscriptionId={selectedSceneInscriptionId}
            sceneInscriptionOptions={STUDIO_SCENE_INSCRIPTION_OPTIONS}
            textTool={textEditorState.tool}
            textCanUndo={textEditorState.history.length > 0}
            lighting={studioLighting}
            lightingDirty={lightingDirty}
            lightingSaveState={lightingSaveState}
            lightingIsDefault={studioLightingEqual(studioLighting, DEFAULT_STUDIO_LIGHTING)}
            selectedAssetId={editorState.selectedAssetId}
            selectedLabel={selectedAssetLabel}
            assetOptions={STUDIO_ASSETS}
            tool={editorState.tool}
            dirty={layoutDirty}
            canUndo={editorState.history.length > 0}
            saveState={layoutSaveState}
            onToggle={toggleLayoutEditor}
            onSectionChange={changeEditorSection}
            onCopyFieldChange={changeStudioCopyField}
            onAssetLabelChange={changeStudioAssetLabel}
            onSelectAsset={selectEditorAsset}
            onResetCopy={resetStudioCopy}
            onSaveCopy={saveCopy}
            onSelectTextLayer={selectTextLayer}
            onTextToolChange={setTextEditorTool}
            onTextNudge={nudgeSelectedText}
            onTextRotate={rotateSelectedText}
            onTextScale={scaleSelectedText}
            onUndoText={undoTextLayoutChange}
            onResetTextLayout={resetTextLayout}
            onSaveTextLayout={saveTextLayout}
            onLightingFieldChange={changeStudioLighting}
            onResetLighting={resetStudioLighting}
            onSaveLighting={saveLighting}
            onToolChange={setEditorTool}
            onNudge={nudgeSelectedAsset}
            onScaleStep={scaleSelectedAsset}
            onUndo={undoLayoutChange}
            onSave={saveLayout}
            sceneExport={(
              <Suspense fallback={null}>
                <StudioSceneExport snapshot={{
                  schemaVersion: 1,
                  layout: editorState.draft,
                  copy: studioCopy,
                  textLayout: textEditorState.draft,
                  lighting: studioLighting,
                }} />
              </Suspense>
            )}
          />
          </Suspense>
        ) : <StudioEditorLauncher onOpen={toggleLayoutEditor} />}
        onResetCamera={resetCamera}
      />

      <LoadingOverlay />
      {dreamArchiveOpen ? (
        <Suspense fallback={null}>
          <DreamArchive
            onClose={closeDreamArchive}
          />
        </Suspense>
      ) : null}
      {grimoireMemoryOpen ? (
        <Suspense fallback={null}>
          <GrimoireMemoryAlbum onClose={closeGrimoireMemory} />
        </Suspense>
      ) : null}
      {televisionTransmissionOpen ? (
        <Suspense fallback={null}>
          <TelevisionTransmission onClose={closeTelevisionTransmission} />
        </Suspense>
      ) : null}
      <div
        className={`relic-transition relic-transition--${relicTransitionPhase}`}
        aria-hidden="true"
      >
        <span className="relic-transition__iris" />
        <span className="relic-transition__grain" />
      </div>
      </StudioTextLayerProvider>
    </main>
  )
}
