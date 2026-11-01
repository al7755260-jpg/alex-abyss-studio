import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createDefaultStudioCopy, studioCopiesEqual } from '../src/editor/studioCopy.ts'
import {
  createDefaultStudioLayout, createStudioEditorState, layoutsEqual, studioEditorReducer,
} from '../src/editor/studioLayout.ts'
import { studioLightingEqual } from '../src/editor/studioLighting.ts'
import {
  createDefaultStudioTextLayout, createStudioTextEditorState,
  studioTextEditorReducer, studioTextLayoutsEqual,
} from '../src/editor/studioTextLayout.ts'
import { saveLocalSceneSnapshot } from '../src/editor/localScenePersistence.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, control, launcher, exportPanel] = await Promise.all([
  source('src/App.tsx'), source('src/ui/editor/StudioEditorControl.tsx'),
  source('src/ui/editor/StudioEditorLauncher.tsx'), source('src/ui/editor/StudioSceneExport.tsx'),
])
const handlerMatch = app.match(/const toggleLayoutEditor = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/)
assert.ok(handlerMatch, 'The actual async save-and-exit event handler exists')
assert.match(handlerMatch[1], /await import\('\.\/editor\/localScenePersistence'\)/)
const handlerBody = handlerMatch[1]
  .replaceAll('import.meta.env.DEV', 'isDevelopment')
  .replace('const snapshot: StudioSceneSnapshot', 'const snapshot')
  .replace("await import('./editor/localScenePersistence')", 'await loadPersistenceClient()')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function createScenes() {
  const assets = [
    { id: 'desk', label: '书桌', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'lamp', label: '灯', position: [1, 0, 0], rotation: [0, 0.2, 0] },
  ]
  const project = {
    schemaVersion: 1,
    layout: createDefaultStudioLayout(assets),
    copy: createDefaultStudioCopy(assets),
    textLayout: createDefaultStudioTextLayout(['brandTitle', 'asset-label:desk']),
    lighting: { globalIntensity: 1, ambientIntensity: 1, exposure: 1 },
  }
  const draft = structuredClone(project)
  draft.layout.desk.position = [1.2, 0.3, -0.4]
  draft.copy.brandTitle = '刚刚编辑的新标题'
  draft.copy.assetLabels.lamp = '回忆之灯'
  draft.textLayout.brandTitle = { x: 0.15, y: -0.1, rotation: 5, scale: 1.2 }
  draft.lighting = { globalIntensity: 1.3, ambientIntensity: 0.8, exposure: 1.1 }
  return { project, draft }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const acknowledgment = () => ({ ok: true, savedAt: '2026-09-03T14:05:06.123Z', unchanged: false })
const response = (payload = acknowledgment(), status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' },
})

function harness({ isDevelopment = true, browserClean = false, browserFailure = null, editing = true } = {}) {
  const { project, draft } = createScenes()
  let layout = createStudioEditorState(project.layout)
  layout = studioEditorReducer(layout, { type: 'commit', assetId: 'desk', transform: draft.layout.desk })
  let text = createStudioTextEditorState(project.textLayout)
  text = studioTextEditorReducer(text, { type: 'commit', layerId: 'brandTitle', transform: draft.textLayout.brandTitle })
  if (browserClean) {
    layout = studioEditorReducer(layout, { type: 'sync-saved' })
    text = studioTextEditorReducer(text, { type: 'sync-saved' })
  }
  const state = {
    layout, text, copy: draft.copy, lighting: draft.lighting,
    savedCopy: browserClean ? draft.copy : project.copy,
    savedLighting: browserClean ? draft.lighting : project.lighting,
    editing, section: 'copy', localState: 'idle', message: '', cancelCount: 0,
    saveStates: { layout: 'idle', copy: 'idle', textLayout: 'idle', lighting: 'idle' },
  }
  const refs = {
    latestLayoutRef: { current: state.layout.draft },
    latestCopyRef: { current: state.copy },
    latestTextLayoutRef: { current: state.text.draft },
    latestLightingRef: { current: state.lighting },
    latestProjectSceneRef: { current: project },
    localFileSavePendingRef: { current: false },
  }
  const browserWrites = []
  const posts = []
  const actions = []
  const started = deferred()
  const backend = deferred()
  let importCount = 0
  const syncRefs = () => {
    refs.latestLayoutRef.current = state.layout.draft
    refs.latestCopyRef.current = state.copy
    refs.latestTextLayoutRef.current = state.text.draft
    refs.latestLightingRef.current = state.lighting
  }
  const persist = (kind, value) => {
    browserWrites.push({ kind, value: structuredClone(value) })
    return browserFailure !== kind
  }
  const dispatchEditor = (action) => {
    actions.push({ kind: 'layout', action })
    state.layout = studioEditorReducer(state.layout, action)
    syncRefs()
  }
  const dispatchTextEditor = (action) => {
    actions.push({ kind: 'text', action })
    state.text = studioTextEditorReducer(state.text, action)
    syncRefs()
  }
  const dependencies = () => ({
    isDevelopment,
    editingLayout: state.editing,
    layoutDirty: !layoutsEqual(state.layout.draft, state.layout.saved),
    copyDirty: !studioCopiesEqual(state.copy, state.savedCopy),
    textLayoutDirty: !studioTextLayoutsEqual(state.text.draft, state.text.saved),
    lightingDirty: !studioLightingEqual(state.lighting, state.savedLighting),
    ...refs,
    persistLayoutSnapshot: (value) => persist('layout', value),
    persistCopySnapshot: (value) => persist('copy', value),
    persistTextLayoutSnapshot: (value) => persist('textLayout', value),
    persistLightingSnapshot: (value) => persist('lighting', value),
    setLocalFileSaveState: (value) => { state.localState = value },
    setLocalFileSaveMessage: (value) => { state.message = value },
    setLayoutSaveState: (value) => { state.saveStates.layout = value },
    setCopySaveState: (value) => { state.saveStates.copy = value },
    setTextLayoutSaveState: (value) => { state.saveStates.textLayout = value },
    setLightingSaveState: (value) => { state.saveStates.lighting = value },
    setSavedStudioCopy: (value) => { state.savedCopy = value },
    setSavedStudioLighting: (value) => { state.savedLighting = value },
    setEditorSection: (value) => { state.section = value },
    setEditingLayout: (value) => { state.editing = value },
    cancelSceneFocus: () => { state.cancelCount += 1 },
    dispatchEditor, dispatchTextEditor,
    layoutsEqual, studioCopiesEqual, studioTextLayoutsEqual, studioLightingEqual,
    loadPersistenceClient: async () => {
      importCount += 1
      return {
        saveLocalSceneSnapshot: (snapshot) => saveLocalSceneSnapshot(snapshot, {
          timeoutMs: 2_000,
          fetch: (url, init) => {
            posts.push({ url, init, snapshot: JSON.parse(init.body) })
            started.resolve()
            return backend.promise
          },
        }),
      }
    },
    saveLayout: () => {
      if (!persist('layout', state.layout.draft)) return false
      dispatchEditor({ type: 'mark-saved' })
      return true
    },
    saveCopy: () => {
      if (!persist('copy', state.copy)) return false
      state.savedCopy = state.copy
      return true
    },
    saveTextLayout: () => {
      if (!persist('textLayout', state.text.draft)) return false
      dispatchTextEditor({ type: 'mark-saved' })
      return true
    },
    saveLighting: () => {
      if (!persist('lighting', state.lighting)) return false
      state.savedLighting = state.lighting
      return true
    },
  })
  return {
    project, draft, state, refs, browserWrites, posts, actions,
    started: started.promise,
    get importCount() { return importCount },
    invoke() {
      const deps = dependencies()
      return new AsyncFunction(...Object.keys(deps), handlerBody)(...Object.values(deps))
    },
    acknowledge(payload = acknowledgment(), status = 200) { backend.resolve(response(payload, status)) },
    reject(error = new TypeError('network unavailable')) { backend.reject(error) },
    edit(kind) {
      if (kind === 'layout') dispatchEditor({ type: 'commit', assetId: 'desk', transform: {
        ...state.layout.draft.desk, position: [2, 0.3, -0.4],
      } })
      if (kind === 'textLayout') dispatchTextEditor({ type: 'commit', layerId: 'brandTitle', transform: {
        ...state.text.draft.brandTitle, x: 0.25,
      } })
      if (kind === 'copy') state.copy = { ...state.copy, brandTitle: '请求发出后的新改动' }
      if (kind === 'lighting') state.lighting = { ...state.lighting, exposure: 1.2 }
      syncRefs()
    },
  }
}

test('开发版保存完整四分区，浏览器草稿已clean也必须POST本地项目', async () => {
  const h = harness({ browserClean: true })
  assert.ok(h.state.layout.history.length > 0, 'autosave may be clean while preserving undo history')
  const originalHistory = structuredClone(h.state.layout.history)
  const pending = h.invoke()
  await h.started
  assert.equal(h.importCount, 1)
  assert.equal(h.posts.length, 1)
  assert.equal(h.posts[0].url, '/__studio/local-scene')
  assert.equal(h.posts[0].init.method, 'POST')
  assert.deepEqual(h.posts[0].snapshot, h.draft)
  assert.deepEqual(h.browserWrites.map(({ kind }) => kind), ['layout', 'copy', 'textLayout', 'lighting'])
  assert.equal(h.state.localState, 'saving')
  assert.equal(h.state.editing, true)
  assert.equal(h.refs.localFileSavePendingRef.current, true)
  assert.deepEqual(h.state.layout.history, originalHistory)
  assert.equal(h.actions.some(({ action }) => action.type === 'mark-saved'), false)
  h.acknowledge()
  await pending
  assert.equal(h.state.editing, false)
  assert.equal(h.state.localState, 'saved')
  assert.equal(h.state.message, '已保存到本地文件')
  assert.equal(h.refs.localFileSavePendingRef.current, false)
  assert.deepEqual(h.state.layout.history, [])
  assert.deepEqual(h.state.text.history, [])
  assert.deepEqual(h.refs.latestProjectSceneRef.current, h.draft)
  assert.notDeepEqual(h.refs.latestProjectSceneRef.current, h.project)
})

test('只有本地服务器ACK后才退出并标记四分区已保存', async () => {
  const h = harness()
  const savedBefore = structuredClone({ layout: h.state.layout.saved, text: h.state.text.saved,
    copy: h.state.savedCopy, lighting: h.state.savedLighting })
  const pending = h.invoke()
  await h.started
  assert.equal(h.state.editing, true)
  assert.deepEqual({ layout: h.state.layout.saved, text: h.state.text.saved,
    copy: h.state.savedCopy, lighting: h.state.savedLighting }, savedBefore)
  assert.deepEqual(h.refs.latestProjectSceneRef.current, h.project)
  h.acknowledge()
  await pending
  assert.deepEqual(h.state.layout.saved, h.draft.layout)
  assert.deepEqual(h.state.text.saved, h.draft.textLayout)
  assert.deepEqual(h.state.savedCopy, h.draft.copy)
  assert.deepEqual(h.state.savedLighting, h.draft.lighting)
  assert.deepEqual(h.state.saveStates, { layout: 'saved', copy: 'saved', textLayout: 'saved', lighting: 'saved' })
  assert.equal(h.state.editing, false)
})

test('网络或后端拒绝保存时保留编辑、当前稿和撤销历史，释放singleflight锁', async () => {
  for (const failure of ['network', 'http', 'false-success']) {
    const h = harness()
    const before = structuredClone({ layout: h.state.layout, text: h.state.text,
      copy: h.state.copy, lighting: h.state.lighting })
    const pending = h.invoke()
    await h.started
    if (failure === 'network') h.reject()
    else if (failure === 'http') h.acknowledge({ ok: false, error: '磁盘写入失败' }, 500)
    else h.acknowledge({ ok: false, error: '快照被拒绝' }, 200)
    await pending
    assert.equal(h.state.editing, true)
    assert.equal(h.state.localState, 'error')
    assert.match(h.state.message, /保存|连接/)
    assert.deepEqual({ layout: h.state.layout, text: h.state.text,
      copy: h.state.copy, lighting: h.state.lighting }, before)
    assert.deepEqual(h.refs.latestProjectSceneRef.current, h.project)
    assert.equal(h.refs.localFileSavePendingRef.current, false)
    assert.equal(h.posts.length, 1)
  }
})

test('浏览器恢复副本写入失败时不发本地请求、不退出、不清空撤销', async () => {
  const h = harness({ browserFailure: 'copy' })
  const before = structuredClone(h.state.layout.history)
  await h.invoke()
  assert.equal(h.importCount, 0)
  assert.equal(h.posts.length, 0)
  assert.equal(h.state.localState, 'error')
  assert.match(h.state.message, /浏览器草稿保存失败/)
  assert.equal(h.state.editing, true)
  assert.deepEqual(h.state.layout.history, before)
  assert.equal(h.refs.localFileSavePendingRef.current, false)
})

test('双击在React禁用按钮提交前也只导入和发送一次', async () => {
  const h = harness()
  const first = h.invoke()
  const second = h.invoke()
  await second
  await h.started
  assert.equal(h.importCount, 1)
  assert.equal(h.posts.length, 1)
  assert.equal(h.browserWrites.length, 4)
  assert.equal(h.state.editing, true)
  h.acknowledge()
  await first
  assert.equal(h.state.editing, false)
})

test('pending期间任一分区出现新改动时不退出，项目引用只指向实际ACK的快照', async () => {
  for (const kind of ['layout', 'copy', 'textLayout', 'lighting']) {
    const h = harness()
    const pending = h.invoke()
    await h.started
    h.edit(kind)
    const latestHistory = structuredClone({ layout: h.state.layout.history, text: h.state.text.history })
    h.acknowledge()
    await pending
    assert.equal(h.state.editing, true, `${kind} must not exit with an unpersisted change`)
    assert.equal(h.state.localState, 'error')
    assert.match(h.state.message, /保存期间又有新修改/)
    assert.deepEqual(h.refs.latestProjectSceneRef.current, h.posts[0].snapshot)
    assert.deepEqual(h.refs.latestProjectSceneRef.current, h.draft)
    assert.deepEqual({ layout: h.state.layout.history, text: h.state.text.history }, latestHistory)
    assert.equal(h.refs.localFileSavePendingRef.current, false)
    assert.equal(h.actions.some(({ action }) => action.type === 'mark-saved'), false)
  }
})

test('公开模式的编辑入口完全无操作，不读写草稿也不POST本地端点', async () => {
  const h = harness({ isDevelopment: false, browserClean: false, editing: false })
  await h.invoke()
  assert.equal(h.importCount, 0)
  assert.equal(h.posts.length, 0)
  assert.equal(h.browserWrites.length, 0)
  assert.equal(h.state.editing, false)
  assert.equal(h.state.cancelCount, 0)
  assert.equal(h.state.localState, 'idle')
  assert.deepEqual(h.refs.latestProjectSceneRef.current, h.project)
})

test('打开编辑器不进行磁盘写入，项目载入入口使用最近ACK的新稿', async () => {
  const h = harness({ editing: false })
  await h.invoke()
  assert.equal(h.state.editing, true)
  assert.equal(h.state.cancelCount, 1)
  assert.equal(h.posts.length, 0)
  assert.equal(h.importCount, 0)
  assert.equal(h.browserWrites.length, 0)
  const loadBody = app.match(/const loadProjectScene = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\)/)?.[1]
  assert.ok(loadBody)
  assert.match(loadBody, /const projectScene = latestProjectSceneRef\.current/)
  assert.doesNotMatch(loadBody, /PUBLISHED_STUDIO_SCENE/)
})

test('UI保存中禁用退出和编辑控件、关闭变换快捷键，显示明确DEV保存和失败/成功状态', () => {
  assert.match(control, /aria-busy=\{savingToLocalFile\}\s*disabled=\{savingToLocalFile\}\s*onClick=\{onToggle\}/)
  assert.match(control, /savingToLocalFile \? '正在保存…'/)
  assert.match(control, /<fieldset className="studio-editor__fields" disabled=\{savingToLocalFile\}/)
  assert.match(control, /\{sceneExport\}\s*<\/fieldset>/)
  assert.match(control, /localFileSaveError \? \([\s\S]{0,180}role="alert"[\s\S]{0,70}\{localFileSaveError\}/)
  assert.match(control, /import\.meta\.env\.DEV \? \([\s\S]{0,300}将物体、文字和光照保存到本地项目文件/)
  assert.match(app, /savingToLocalFile=\{localFileSaveState === 'saving'\}/)
  assert.match(app, /localFileSaveError=\{localFileSaveState === 'error' \? localFileSaveMessage : undefined\}/)
  assert.match(app, /const editingTransforms = editingLayout\s*&& localFileSaveState !== 'saving'/)
  assert.match(app, /const editingTextTransforms = editingLayout\s*&& localFileSaveState !== 'saving'/)
  assert.match(app, /const handleKeyDown = \(event: KeyboardEvent\) => \{\s*if \(localFileSavePendingRef\.current\) return/)
  assert.match(app, /savedMessage=\{localFileSaveState === 'saved' \? localFileSaveMessage : undefined\}/)
  assert.match(launcher, /savedMessage \? \([\s\S]{0,120}role="status">\{savedMessage\}/)
  assert.match(exportPanel, /import\.meta\.env\.DEV[\s\S]{0,200}点击“保存并退出”会写入本地项目文件/)
  assert.match(exportPanel, /公开网站仍需重新部署/)
})
