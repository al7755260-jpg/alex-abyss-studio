import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  createStudioEditorState,
  layoutsEqual,
  studioEditorReducer,
} from '../src/editor/studioLayout.ts'
import { cloneStudioLighting } from '../src/editor/studioLighting.ts'
import {
  createStudioTextEditorState,
  studioTextEditorReducer,
  studioTextLayoutsEqual,
} from '../src/editor/studioTextLayout.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, component, projectJson] = await Promise.all([
  source('src/App.tsx'),
  source('src/ui/editor/StudioSceneExport.tsx'),
  source('src/data/publishedScene.json'),
])
const project = JSON.parse(projectJson)
const handlerMatch = app.match(/const loadProjectScene = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\)/)
assert.ok(handlerMatch, 'The explicit project-load handler exists')

function loadHarness(isDevelopment = true) {
  const oldLayout = structuredClone(project.layout)
  for (const transform of Object.values(oldLayout)) transform.position[0] += 0.5
  const oldTextLayout = structuredClone(project.textLayout)
  for (const transform of Object.values(oldTextLayout)) transform.x = transform.x === 0.1 ? 0.2 : 0.1
  const state = {
    layout: createStudioEditorState(project.layout, oldLayout),
    text: createStudioTextEditorState(project.textLayout, oldTextLayout),
    copy: { ...project.copy, brandTitle: '浏览器中的旧稿' },
    lighting: { globalIntensity: 0.5, ambientIntensity: 0.2, exposure: 0.4 },
    saveStates: { layout: 'error', copy: 'error', textLayout: 'error', lighting: 'error' },
  }
  const dependencies = {
    isDevelopment,
    PUBLISHED_STUDIO_SCENE: project,
    latestProjectSceneRef: { current: project },
    dispatchEditor: (action) => { state.layout = studioEditorReducer(state.layout, action) },
    dispatchTextEditor: (action) => { state.text = studioTextEditorReducer(state.text, action) },
    setStudioCopy: (value) => { state.copy = value },
    setStudioLighting: (value) => { state.lighting = value },
    cloneStudioLighting,
    setLayoutSaveState: (value) => { state.saveStates.layout = value },
    setCopySaveState: (value) => { state.saveStates.copy = value },
    setTextLayoutSaveState: (value) => { state.saveStates.textLayout = value },
    setLightingSaveState: (value) => { state.saveStates.lighting = value },
  }
  // Execute the actual App event body with real reducers and no browser/storage API.
  const invoke = new Function(
    ...Object.keys(dependencies),
    handlerMatch[1].replace('import.meta.env.DEV', 'isDevelopment'),
  )
  return { state, oldLayout, oldTextLayout, invoke: () => invoke(...Object.values(dependencies)) }
}

test('项目场景载入由开发模式显式确认触发，公开版不暴露按钮', () => {
  assert.match(app, /onLoadProjectScene=\{import\.meta\.env\.DEV \? loadProjectScene : undefined\}/)
  assert.match(handlerMatch[1], /if \(!import\.meta\.env\.DEV\) return/)
  assert.match(component, /\{onLoadProjectScene \? \(/)
  assert.match(component, /onClick=\{\(\) => setConfirmProjectLoad\(true\)\}/)
  assert.match(component, /role="group" aria-label="确认载入项目场景"/)
  assert.match(component, /onClick=\{confirmLoadProjectScene\}>已备份，确认载入/)
  assert.match(component, /请先导出当前场景作为备份。游戏进度不变/)
  assert.match(component, /onClick=\{\(\) => setConfirmProjectLoad\(false\)\}>取消/)
  assert.doesNotMatch(handlerMatch[1], /localStorage|sessionStorage|removeItem|clear\(|mystery|mark-saved|sync-saved/)

  const harness = loadHarness(false)
  const before = structuredClone(harness.state)
  harness.invoke()
  assert.deepEqual(harness.state, before)
})

test('载入四个编辑分区且保留旧保存快照与变换撤销历史，交给既有自动保存', () => {
  const harness = loadHarness()
  harness.invoke()
  assert.deepEqual(harness.state.layout.draft, project.layout)
  assert.deepEqual(harness.state.text.draft, project.textLayout)
  assert.deepEqual(harness.state.copy, project.copy)
  assert.deepEqual(harness.state.lighting, project.lighting)
  assert.notEqual(harness.state.lighting, project.lighting)
  assert.deepEqual(harness.state.layout.saved, harness.oldLayout)
  assert.deepEqual(harness.state.text.saved, harness.oldTextLayout)
  assert.deepEqual(harness.state.layout.history[0], harness.oldLayout)
  assert.deepEqual(harness.state.text.history[0], harness.oldTextLayout)
  assert.equal(layoutsEqual(harness.state.layout.draft, harness.state.layout.saved), false)
  assert.equal(studioTextLayoutsEqual(harness.state.text.draft, harness.state.text.saved), false)
  assert.equal(harness.state.layout.selectedAssetId, null)
  assert.equal(harness.state.text.selectedLayerId, null)
  assert.deepEqual(harness.state.saveStates, { layout: 'idle', copy: 'idle', textLayout: 'idle', lighting: 'idle' })
})

test('载入状态覆盖四类保存失败及待保存状态，不用确认点击冒充写入成功', () => {
  assert.match(app, /\[layoutSaveState, copySaveState, textLayoutSaveState, lightingSaveState\]\.includes\('error'\)/)
  assert.match(app, /layoutDirty \|\| copyDirty \|\| textLayoutDirty \|\| lightingDirty\s*\? 'pending'\s*:\s*'saved'/)
  assert.match(component, /projectSceneSaveState === 'error'[\s\S]*?部分内容保存失败/)
  assert.match(component, /projectSceneSaveState === 'saved'[\s\S]*?已载入并保存到当前浏览器/)
  assert.match(component, /正在自动保存，请稍候/)
  const confirmBody = component.match(/function confirmLoadProjectScene\(\) \{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(confirmBody)
  assert.match(confirmBody, /setExportJson\(null\)/)
  assert.doesNotMatch(confirmBody, /setStatus\('[^']*(?:成功|已保存)/)
})
