import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

test('编辑模式通过统一根组提供单一移动、旋转或等比缩放操纵器', async () => {
  const canvas = await source('../src/scene/StudioCanvas.tsx')

  assert.match(canvas, /import \{ AdaptiveDpr, OrbitControls, TransformControls, useProgress \}/)
  assert.equal((canvas.match(/<TransformControls\b/g) ?? []).length, 1)
  assert.match(canvas, /name=\{`editable-asset:\$\{asset\.id\}`\}/)
  assert.match(canvas, /position=\{transform\.position\}/)
  assert.match(canvas, /rotation=\{transform\.rotation\}/)
  assert.match(canvas, /scale=\{transform\.scale\}/)
  assert.match(canvas, /LOCAL_STUDIO_ASSET_BY_ID/)
  assert.match(canvas, /position: \[0, 0, 0\]/)
  assert.match(canvas, /rotation: \[0, 0, 0\]/)
  assert.match(canvas, /mode=\{editorTool\}/)
  assert.match(canvas, /editorTool === 'translate' \? 'world' : 'local'/)
  assert.match(canvas, /scaleSnap=\{0\.05\}/)
  assert.match(canvas, /editorTool === 'scale'/)
  assert.match(canvas, /selectedAssetObject\.scale\.setScalar\(uniformScale\)/)
  assert.match(canvas, /clampStudioScale/)
  assert.match(canvas, /onMouseUp=\{\(\) => \{[\s\S]{0,420}onAssetTransformChange/)
  const objectChangeStart = canvas.indexOf('onObjectChange={() => {')
  const objectChangeEnd = canvas.indexOf('onMouseUp={() => {', objectChangeStart)
  assert.doesNotMatch(canvas.slice(objectChangeStart, objectChangeEnd), /snapshotAssetTransform/)
})

test('五臂烛台进入统一可编辑资产根组，模型、火焰和灯光同步变换', async () => {
  const [assets, canvas, candles] = await Promise.all([
    source('../src/data/studioAssets.ts'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/scene/CandleSet.tsx'),
  ])

  assert.match(assets, /id: 'floor-left-candelabra'[\s\S]{0,100}label: '五臂熔蜡烛台'/)
  assert.match(assets, /kind: 'candelabra'/)
  assert.match(canvas, /asset\.kind === 'candelabra'[\s\S]{0,100}<CandelabraInstallation asset=\{localAsset\}/)
  assert.match(candles, /lux3d-editable-candelabra-installation/)
  assert.match(candles, /<AssetSlot asset=\{asset\} \/>/)
  assert.match(candles, /name="editable-candelabra-flames"/)
  assert.match(candles, /baseIntensity: 3\.25/)
})

test('编辑模式暂停鼠标探索，退出后仍保留原探索组件', async () => {
  const [app, canvas] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
  ])

  assert.match(app, /const requestOpenRelic = useCallback[\s\S]{0,120}if \(editingLayout\) return/)
  assert.match(app, /const exploreBookcaseDreams = useCallback[\s\S]{0,120}if \(editingLayout \|\| dreamArchiveOpen/)
  assert.match(canvas, /\{!detailRelic && !editingLayout \? \([\s\S]{0,220}<HiddenRelics/)
  assert.match(canvas, /onPointerMissed=\{\(\) => \{[\s\S]{0,80}onSelectAsset\(null\)/)
  assert.doesNotMatch(`${app}\n${canvas}`, /GestureControl|SceneFocusDriver|beginCameraGesture/)
})

test('移动家具后遗物提示、推进镜头和终局命中区共用附着点换算', async () => {
  const [canvas, relics] = await Promise.all([
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/scene/HiddenRelics.tsx'),
  ])

  assert.match(canvas, /HIDDEN_RELICS\.map\(\(relic\) => \{/)
  assert.ok((canvas.match(/resolveAttachedPoint\(/g) ?? []).length >= 3)
  assert.match(canvas, /hitPositions=\{resolvedRelicHitPositions\}/)
  assert.match(canvas, /position=\{finalMonitorPosition\}/)
  assert.match(canvas, /toTarget: new Vector3\(\.\.\.resolvedHitPosition\)/)
  assert.match(relics, /hitPositions\?: ReadonlyMap<HiddenRelicId, Vector3Tuple>/)
  assert.match(relics, /position = FINAL_MONITOR_TARGET\.position/)
})

test('编辑器提供选择、移动旋转缩放和自动保存，但不再暴露归位入口', async () => {
  const [control, styles] = await Promise.all([
    source('../src/ui/editor/StudioEditorControl.tsx'),
    source('../src/styles.css'),
  ])

  for (const label of ['编辑画面', '保存并退出', '移动', '旋转', '缩放', '缩小', '放大', '撤销', '自动保存']) {
    assert.match(control, new RegExp(label))
  }
  assert.doesNotMatch(control, /当前归位|全部归位|onResetSelected|onResetAll/)
  assert.match(control, /aria-label="画面编辑器"/)
  assert.match(control, /aria-label="选择要调整的场景对象"/)
  assert.match(control, /onSelectAsset\(event\.currentTarget\.value \|\| null\)/)
  assert.match(control, /aria-label="精确微调"/)
  assert.match(control, /aria-pressed=\{tool === 'translate'\}/)
  assert.match(control, /aria-pressed=\{tool === 'rotate'\}/)
  assert.match(control, /aria-pressed=\{tool === 'scale'\}/)
  assert.match(control, /onNudge\(axis, -1\)/)
  assert.match(control, /onNudge\(axis, 1\)/)
  assert.match(control, /onScaleStep\(-1\)/)
  assert.match(control, /onScaleStep\(1\)/)
  assert.match(styles, /\.studio-editor__panel/)
  assert.match(styles, /\.studio-editor__scale-step/)
  assert.match(styles, /\.studio-editor__layout-object-picker/)
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.studio-editor__panel/)
})

test('光照页签统一调节场景灯、环境光与曝光并独立自动保存', async () => {
  const [app, control, canvas, lighting, candles, mask, relics, styles] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/ui/editor/StudioEditorControl.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/scene/StudioLighting.tsx'),
    source('../src/scene/CandleSet.tsx'),
    source('../src/scene/CthulhuMaskInstallation.tsx'),
    source('../src/scene/HiddenRelics.tsx'),
    source('../src/styles.css'),
  ])

  for (const label of ['光照', '整体光照', '环境光', '画面曝光', '恢复默认光照']) {
    assert.match(control, new RegExp(label))
  }
  assert.match(control, /StudioEditorSection = 'layout' \| 'copy' \| 'lighting'/)
  assert.match(control, /type="range"/)
  assert.match(control, /STUDIO_LIGHTING_LIMITS\[field\]/)
  assert.match(control, /onLightingFieldChange\(field, Number\(event\.currentTarget\.value\)\)/)

  assert.match(app, /loadStudioLighting\([\s\S]{0,140}window\.localStorage/)
  assert.match(app, /saveStudioLighting\(window\.localStorage, lighting\)/)
  assert.match(app, /const LIGHTING_AUTO_SAVE_DELAY_MS = 220/)
  assert.match(app, /if \(!lightingDirty\) return[\s\S]{0,520}persistLightingSnapshot\(studioLighting\)/)
  assert.match(app, /if \(latestLightingDirtyRef\.current\)[\s\S]{0,140}persistLightingSnapshot\(latestLightingRef\.current\)/)
  assert.match(app, /studioLighting=\{studioLighting\}/)
  assert.match(app, /setEditorSection\('lighting'\)/)

  assert.match(canvas, /StudioLightingSettingsProvider settings=\{studioLighting\}/)
  assert.match(canvas, /<RendererExposureController \/>/)
  assert.match(lighting, /gl\.toneMappingExposure = exposure/)
  assert.match(lighting, /intensity=\{0\.42 \* globalIntensity \* ambientIntensity\}/)
  assert.match(lighting, /faceCandleIntensity\(time\) \* globalIntensity/)
  assert.match(candles, /descriptor\.baseIntensity \* \(1 \+ flicker\) \* globalIntensity/)
  assert.match(mask, /Math\.max\(0\.28, \(slowPulse - briefDip\) \* 0\.78\)[\s\S]{0,60}\* globalIntensity/)
  assert.doesNotMatch(relics, /<pointLight|focusLightRef|focusedRelic/)
  assert.match(styles, /\.viewer--editing-lighting/)
  assert.match(styles, /\.studio-editor__lighting-control input\[type="range"\]/)
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
})

test('文字页签可编辑内容并独立选择、变换和保存每个文字图层', async () => {
  const [
    app,
    control,
    hud,
    objective,
    sanity,
    archive,
    canvas,
    callout,
    textLayer,
    textLayout,
    styles,
  ] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/ui/editor/StudioEditorControl.tsx'),
    source('../src/ui/game/GameHUD.tsx'),
    source('../src/ui/game/CurrentObjective.tsx'),
    source('../src/ui/game/SanityMeter.tsx'),
    source('../src/ui/game/RelicArchiveBar.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/scene/ObjectCalloutOverlay.tsx'),
    source('../src/ui/editor/StudioTextLayer.tsx'),
    source('../src/editor/studioTextLayout.ts'),
    source('../src/styles.css'),
  ])

  for (const label of ['布局', '文字', '主标题', '副标题', '未完成标题', '未完成说明', '理智仪表名称', '旋转提示', '缩放提示', '探索提示', '恢复默认文字', '立即保存']) {
    assert.match(control, new RegExp(label))
  }
  assert.match(control, /value=\{copy\[field\]\}/)
  assert.match(control, /maxLength=\{STUDIO_COPY_FIELD_LIMITS\[field\]\}/)
  assert.match(control, /onCopyFieldChange\(field, event\.currentTarget\.value\)/)
  assert.match(control, /aria-label="选择要修改名称的场景对象"/)
  assert.match(control, /onAssetLabelChange\(selectedAssetId, event\.currentTarget\.value\)/)
  assert.match(control, /aria-label="文字变换工具"/)
  assert.match(control, /aria-pressed=\{activeTextTool === 'translate'\}/)
  assert.match(control, /aria-pressed=\{activeTextTool === 'rotate'\}/)
  assert.match(control, /aria-pressed=\{activeTextTool === 'scale'\}/)
  assert.match(control, /<kbd>G<\/kbd>移动/)
  assert.match(control, /<kbd>R<\/kbd>旋转/)
  assert.match(control, /<kbd>S<\/kbd>缩放/)
  assert.match(control, /onFocus=\{\(\) => \{[\s\S]{0,100}onSelectAsset\(null\)[\s\S]{0,100}onSelectTextLayer\(field\)/)
  assert.match(control, /data-selected=\{selectedTextLayerId === field/)
  assert.match(control, /onSelectTextLayer\(assetId \? `asset-label:\$\{assetId\}` : null\)/)
  assert.match(control, /onTextNudge\(axis, -1\)/)
  assert.match(control, /onTextRotate\(-1\)/)
  assert.match(control, /onTextScale\(1\)/)
  assert.match(control, /onUndoText/)
  assert.match(control, /恢复文字位置/)

  assert.match(app, /loadStudioCopy\([\s\S]{0,120}window\.localStorage/)
  assert.match(app, /saveStudioCopy\(window\.localStorage, copy\)/)
  assert.match(app, /const COPY_AUTO_SAVE_DELAY_MS = 240/)
  assert.match(app, /if \(!copyDirty\) return[\s\S]{0,460}persistCopySnapshot\(studioCopy\)/)
  assert.match(app, /if \(latestCopyDirtyRef\.current\)[\s\S]{0,120}persistCopySnapshot\(latestCopyRef\.current\)/)
  assert.match(app, /editingTransforms = editingLayout[\s\S]{0,100}editorSection === 'layout'/)
  assert.match(app, /if \(editingTransforms\) \{[\s\S]{0,320}undoLayoutChange\(\)/)
  assert.match(app, /if \(editingLayout\) \{[\s\S]{0,100}toggleLayoutEditor\(\)/)
  assert.match(app, /if \(layoutDirty && !saveLayout\(\)\) \{[\s\S]{0,100}setEditorSection\('layout'\)/)
  assert.match(app, /if \(copyDirty && !saveCopy\(\)\) \{[\s\S]{0,100}setEditorSection\('copy'\)/)
  assert.match(app, /copy=\{studioCopy\}/)

  assert.match(app, /Object\.keys\(STUDIO_COPY_FIELD_LIMITS\)/)
  assert.match(app, /STUDIO_ASSETS\.map\(\(asset\) => `asset-label:\$\{asset\.id\}`\)/)
  assert.match(app, /createDefaultStudioTextLayout\(STUDIO_TEXT_LAYER_IDS\)/)
  assert.match(app, /useReducer\([\s\S]{0,80}studioTextEditorReducer/)
  assert.match(app, /loadStudioTextLayout\([\s\S]{0,140}window\.localStorage/)
  assert.match(app, /saveStudioTextLayout\(window\.localStorage, layout\)/)
  assert.match(app, /const TEXT_LAYOUT_AUTO_SAVE_DELAY_MS = 180/)
  assert.match(app, /if \(!textLayoutDirty\) return[\s\S]{0,480}persistTextLayoutSnapshot\(textEditorState\.draft\)/)
  assert.match(app, /if \(latestTextLayoutDirtyRef\.current\)[\s\S]{0,140}persistTextLayoutSnapshot\(latestTextLayoutRef\.current\)/)
  assert.match(app, /editingTextTransforms = editingLayout[\s\S]{0,100}editorSection === 'copy'[\s\S]{0,80}!editingSceneInscription/)
  assert.match(app, /if \(editingTextTransforms\) \{[\s\S]{0,360}setTextEditorTool\('translate'\)[\s\S]{0,160}setTextEditorTool\('rotate'\)[\s\S]{0,160}setTextEditorTool\('scale'\)/)
  assert.match(app, /<StudioTextLayerProvider[\s\S]{0,240}active=\{editingTextTransforms\}[\s\S]{0,240}layout=\{textEditorState\.draft\}/)
  assert.match(app, /selectedLayerId=\{textEditorState\.selectedLayerId\}/)
  assert.match(app, /tool=\{textEditorState\.tool\}/)
  assert.match(app, /onSelect=\{selectTextLayer\}/)
  assert.match(app, /onCommit=\{commitTextTransform\}/)
  assert.match(app, /textLayoutDirty=\{textLayoutDirty\}/)
  assert.match(app, /onSelectTextLayer=\{selectTextLayer\}/)
  assert.match(app, /onTextToolChange=\{setTextEditorTool\}/)

  assert.match(textLayout, /STUDIO_TEXT_LAYOUT_STORAGE_KEY = 'alex-abyss-studio:text-layout:v1'/)
  assert.match(textLayout, /storage\.setItem\(STUDIO_TEXT_LAYOUT_STORAGE_KEY/)
  assert.doesNotMatch(textLayout, /alex-abyss-studio:copy:v1/)
  assert.match(textLayer, /export function StudioTextLayerProvider/)
  assert.match(textLayer, /export function StudioTextLayer/)
  assert.match(textLayer, /data-text-layer-id=\{layerId\}/)
  assert.match(textLayer, /data-text-tool=\{active \? tool : undefined\}/)
  assert.match(textLayer, /onSelect\(layerId\)/)
  assert.match(textLayer, /onCommit\(layerId, drag\.next\)/)

  assert.match(hud, /<StudioTextLayer layerId="brandTitle">\{copy\.brandTitle\}<\/StudioTextLayer>/)
  assert.match(hud, /<StudioTextLayer layerId="brandSubtitle">\{copy\.brandSubtitle\}<\/StudioTextLayer>/)
  assert.match(hud, /<StudioTextLayer layerId=\{state\.view\.kind === 'relic' \? 'backToStudioLabel' : 'resetCameraLabel'\}>/)
  assert.match(hud, /<StudioTextLayer layerId="rotateHint">\{copy\.rotateHint\}<\/StudioTextLayer>/)
  assert.match(hud, /<StudioTextLayer layerId="zoomHint">\{copy\.zoomHint\}<\/StudioTextLayer>/)
  assert.match(hud, /<StudioTextLayer layerId="exploreHint">\{copy\.exploreHint\}<\/StudioTextLayer>/)
  assert.match(objective, /<StudioTextLayer layerId="objectiveLabel">\{copy\.objectiveLabel\}<\/StudioTextLayer>/)
  assert.match(objective, /layerId=\{complete \? 'objectiveCompleteTitle' : 'objectivePendingTitle'\}/)
  assert.match(objective, /layerId=\{complete \? 'objectiveCompleteDescription' : 'objectivePendingDescription'\}/)
  assert.match(sanity, /<StudioTextLayer layerId="sanityLabel">\{label\}<\/StudioTextLayer>/)
  assert.match(archive, /<StudioTextLayer layerId="undiscoveredRelicLabel">\{undiscoveredLabel\}<\/StudioTextLayer>/)
  assert.match(callout, /<StudioTextLayer layerId=\{displayedTarget\.textLayerId\}>/)
  assert.match(canvas, /textLayerId: `asset-label:\$\{relic\.hostAssetId\}`/)
  assert.match(canvas, /textLayerId: 'terminalCalloutLabel'/)
  assert.match(canvas, /textLayerId: 'dreamArchiveCalloutLabel'/)
  assert.match(canvas, /label: studioCopy\.terminalCalloutLabel/)
  assert.match(canvas, /studioCopy\.assetLabels\[relic\.hostAssetId\]/)
  assert.match(styles, /\.studio-editor__tabs/)
  assert.match(styles, /\.studio-editor__copy-field input/)
  assert.match(styles, /\.viewer--editing-copy/)
})

test('三段3D场景文字排除2D图层并复用唯一 G R S 变换链路', async () => {
  const [app, control, canvas, inscriptions] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/ui/editor/StudioEditorControl.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/data/sceneInscriptions.ts'),
  ])

  assert.match(inscriptions, /VIDEO_BEYOND_SCREEN_INSCRIPTION_ID = 'inscription:video-beyond-screen'/)
  assert.match(inscriptions, /COMPUTER_IDEA_INSCRIPTION_ID = 'inscription:computer-idea'/)
  assert.match(inscriptions, /PERFECT_TYRANNY_INSCRIPTION_ID = 'inscription:perfect-tyranny'/)
  assert.match(inscriptions, /copyField: 'videoBeyondScreenText'/)
  assert.match(inscriptions, /copyField: 'computerIdeaText'/)
  assert.match(inscriptions, /copyField: 'perfectTyrannyText'/)
  assert.match(inscriptions, /SCENE_INSCRIPTION_COPY_FIELDS[\s\S]{0,140}map\(\(\{ copyField \}\) => copyField\)/)
  assert.match(inscriptions, /SCENE_INSCRIPTION_LAYOUT_ASSETS[\s\S]{0,180}id,\s*position,\s*rotation,\s*scale/)

  assert.match(app, /createDefaultStudioLayout\(\[[\s\S]{0,100}\.\.\.STUDIO_EDITABLE_ASSETS,[\s\S]{0,80}\.\.\.SCENE_INSCRIPTION_LAYOUT_ASSETS/)
  assert.match(
    app,
    /Object\.keys\(STUDIO_COPY_FIELD_LIMITS\)\.filter\([\s\S]{0,100}!SCENE_INSCRIPTION_COPY_FIELDS\.has\(field\)/,
  )
  assert.match(app, /STUDIO_SCENE_INSCRIPTION_OPTIONS = SCENE_INSCRIPTIONS\.map/)
  assert.match(app, /copyField: inscription\.copyField/)
  assert.match(app, /rows: inscription\.rows/)
  assert.match(app, /selectedSceneInscriptionId = isSceneInscriptionId\(editorState\.selectedAssetId\)/)
  assert.match(app, /editingSceneInscription = editingLayout[\s\S]{0,100}editorSection === 'copy'[\s\S]{0,100}selectedSceneInscriptionId !== null/)
  assert.match(app, /editingTransforms = editingLayout[\s\S]{0,120}editorSection === 'layout' \|\| editingSceneInscription/)
  assert.match(app, /editingTextTransforms = editingLayout[\s\S]{0,100}editorSection === 'copy'[\s\S]{0,80}!editingSceneInscription/)
  assert.match(app, /sceneInscriptionOptions=\{STUDIO_SCENE_INSCRIPTION_OPTIONS\}/)
  assert.match(app, /selectedSceneInscriptionId=\{selectedSceneInscriptionId\}/)

  const transformKeyStart = app.indexOf('if (editingTransforms) {')
  const textKeyStart = app.indexOf('if (editingTextTransforms) {', transformKeyStart)
  const layoutOnlyKeyStart = app.indexOf('if (editingLayout) {', textKeyStart)
  assert.ok(transformKeyStart >= 0 && textKeyStart > transformKeyStart)
  assert.ok(layoutOnlyKeyStart > textKeyStart)
  const transformKeyBlock = app.slice(transformKeyStart, textKeyStart)
  const textKeyBlock = app.slice(textKeyStart, layoutOnlyKeyStart)
  assert.match(transformKeyBlock, /key === 'g'[\s\S]{0,80}setEditorTool\('translate'\)/)
  assert.match(transformKeyBlock, /key === 'r'[\s\S]{0,80}setEditorTool\('rotate'\)/)
  assert.match(transformKeyBlock, /key === 's'[\s\S]{0,80}setEditorTool\('scale'\)/)
  assert.doesNotMatch(transformKeyBlock, /setTextEditorTool/)
  assert.match(textKeyBlock, /key === 'g'[\s\S]{0,80}setTextEditorTool\('translate'\)/)
  assert.match(textKeyBlock, /key === 'r'[\s\S]{0,80}setTextEditorTool\('rotate'\)/)
  assert.match(textKeyBlock, /key === 's'[\s\S]{0,80}setTextEditorTool\('scale'\)/)

  assert.match(control, /selectedSceneInscription = sceneInscriptionOptions\.find/)
  assert.match(control, /editingSceneInscription = selectedSceneInscription !== null/)
  assert.match(control, /activeTextTool = editingSceneInscription \? tool : textTool/)
  assert.match(control, /sceneInscriptionOptions\.map\(\(inscription\) =>/)
  assert.match(control, /value=\{copy\[inscription\.copyField\]\}/)
  assert.match(control, /data-selected=\{selectedSceneInscriptionId === inscription\.id \? 'true' : 'false'\}/)
  assert.match(control, /onFocus=\{\(\) => onSelectAsset\(inscription\.id\)\}/)
  assert.match(control, /editingSceneInscription \? onToolChange\('translate'\) : onTextToolChange\('translate'\)/)
  assert.match(control, /editingSceneInscription \? onToolChange\('rotate'\) : onTextToolChange\('rotate'\)/)
  assert.match(control, /editingSceneInscription \? onToolChange\('scale'\) : onTextToolChange\('scale'\)/)
  assert.match(control, /editingSceneInscription && activeTextTool !== 'scale'/)
  assert.match(control, /onClick=\{\(\) => onNudge\(axis, -1\)\}/)
  assert.match(control, /onClick=\{\(\) => onNudge\(axis, 1\)\}/)
  assert.match(control, /onClick=\{\(\) => onScaleStep\(-1\)\}/)
  assert.match(control, /onClick=\{\(\) => onScaleStep\(1\)\}/)
  assert.match(control, /disabled=\{!canUndo\} onClick=\{onUndo\}>撤销变换/)
  assert.match(control, /onClick=\{onSave\}[\s\S]{0,100}保存位置/)

  assert.equal((canvas.match(/<TransformControls\b/g) ?? []).length, 1)
  assert.match(canvas, /selectedAssetObject = selectedAssetId[\s\S]{0,100}assetGroupRefs\.current\.get\(selectedAssetId\)/)
  assert.match(canvas, /getEditableGroupRef\(VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\)/)
  assert.match(canvas, /getEditableGroupRef\(COMPUTER_IDEA_INSCRIPTION_ID\)/)
  assert.match(canvas, /getEditableGroupRef\(PERFECT_TYRANNY_INSCRIPTION_ID\)/)
  assert.match(canvas, /text=\{studioCopy\.videoBeyondScreenText\}/)
  assert.match(canvas, /text=\{studioCopy\.computerIdeaText\}/)
  assert.match(canvas, /text=\{studioCopy\.perfectTyrannyText\}/)
  assert.match(canvas, /object=\{selectedAssetObject\}/)
  assert.match(canvas, /mode=\{editorTool\}/)
  assert.match(canvas, /onAssetTransformChange\([\s\S]{0,100}pending\.assetId/)
})

test('布局改动会自动持久化，离页前补存且镜头归中不接触布局状态', async () => {
  const [app, canvas, hud] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/ui/game/GameHUD.tsx'),
  ])

  assert.match(app, /const persistLayoutSnapshot = useCallback/)
  assert.match(app, /if \(!layoutDirty\) return[\s\S]{0,420}saveStudioLayout|if \(!layoutDirty\) return[\s\S]{0,420}persistLayoutSnapshot/)
  assert.match(app, /dispatchEditor\(\{ type: 'sync-saved' \}\)/)
  assert.match(app, /const LAYOUT_AUTO_SAVE_DELAY_MS = 180/)
  assert.match(app, /window\.setTimeout\([\s\S]{0,420}LAYOUT_AUTO_SAVE_DELAY_MS\)/)
  assert.match(app, /return \(\) => window\.clearTimeout\(saveTimer\)/)
  assert.match(app, /window\.addEventListener\('pagehide', saveLatestLayout\)/)
  assert.match(app, /if \(latestLayoutDirtyRef\.current\)[\s\S]{0,120}persistLayoutSnapshot\(latestLayoutRef\.current\)/)
  assert.match(app, /if \(editingLayout && layoutDirty\) saveLayout\(\)/)
  assert.doesNotMatch(app, /resetSelectedAsset|resetAllAssets|type: 'reset-selected'|type: 'reset-all'/)

  const appResetStart = app.indexOf('const resetCamera = useCallback')
  const appResetEnd = app.indexOf('const openDreamArchive', appResetStart)
  const appResetBlock = app.slice(appResetStart, appResetEnd)
  assert.match(appResetBlock, /studioRef\.current\?\.resetCamera\(\)/)
  assert.doesNotMatch(appResetBlock, /dispatchEditor|saveStudioLayout|DEFAULT_STUDIO_LAYOUT|setEditingLayout/)

  const canvasResetStart = canvas.indexOf('resetCamera: () => {')
  const canvasResetEnd = canvas.indexOf('focusRelic:', canvasResetStart)
  const canvasResetBlock = canvas.slice(canvasResetStart, canvasResetEnd)
  assert.doesNotMatch(canvasResetBlock, /onAssetTransformChange|studioLayout|defaultStudioLayout/)

  assert.match(hud, /镜头归中/)
  assert.match(hud, /只调整镜头，不会移动或缩放任何物体/)
})
