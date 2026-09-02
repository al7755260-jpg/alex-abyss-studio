import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cloneStudioTextLayout,
  createDefaultStudioTextLayout,
  createStudioTextEditorState,
  loadStudioTextLayout,
  resetStudioTextLayout,
  saveStudioTextLayout,
  STUDIO_TEXT_LAYOUT_HISTORY_LIMIT,
  STUDIO_TEXT_LAYOUT_STORAGE_KEY,
  STUDIO_TEXT_POSITION_MAX,
  STUDIO_TEXT_POSITION_MIN,
  STUDIO_TEXT_ROTATION_MAX,
  STUDIO_TEXT_ROTATION_MIN,
  STUDIO_TEXT_SCALE_MAX,
  STUDIO_TEXT_SCALE_MIN,
  studioTextEditorReducer,
  studioTextLayoutsEqual,
} from '../src/editor/studioTextLayout.ts'

const LAYER_IDS = [
  'brandTitle',
  'objectivePendingDescription',
  'asset-label:desk',
]

const createMemoryStorage = () => {
  const entries = new Map()
  return {
    entries,
    getItem(key) {
      return entries.get(key) ?? null
    },
    setItem(key, value) {
      entries.set(key, value)
    },
  }
}

test('按调用方提供的文案 ID 创建独立默认 transform 深拷贝', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)

  assert.equal(STUDIO_TEXT_LAYOUT_STORAGE_KEY, 'alex-abyss-studio:text-layout:v1')
  assert.deepEqual(defaults, {
    brandTitle: { x: 0, y: 0, rotation: 0, scale: 1 },
    objectivePendingDescription: { x: 0, y: 0, rotation: 0, scale: 1 },
    'asset-label:desk': { x: 0, y: 0, rotation: 0, scale: 1 },
  })
  assert.notEqual(defaults.brandTitle, defaults.objectivePendingDescription)

  const cloned = cloneStudioTextLayout(defaults)
  cloned.brandTitle.x = 0.5
  assert.equal(defaults.brandTitle.x, 0)

  assert.throws(
    () => createDefaultStudioTextLayout(['brandTitle', 'brandTitle']),
    /duplicate studio text layer id/,
  )
  assert.throws(
    () => createDefaultStudioTextLayout(['']),
    /Invalid or duplicate studio text layer id/,
  )
})

test('加载只投影默认 ID，并对所有有限数值按各自范围 clamp', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_TEXT_LAYOUT_STORAGE_KEY, JSON.stringify({
    brandTitle: { x: -9, y: 8, rotation: 720, scale: 12 },
    objectivePendingDescription: { x: 0.25, y: -0.4, rotation: -270, scale: 0 },
    intruder: { x: 0.1, y: 0.2, rotation: 0, scale: 1 },
  }))

  const restored = loadStudioTextLayout(storage, defaults)
  assert.deepEqual(restored, {
    brandTitle: {
      x: STUDIO_TEXT_POSITION_MIN,
      y: STUDIO_TEXT_POSITION_MAX,
      rotation: STUDIO_TEXT_ROTATION_MAX,
      scale: STUDIO_TEXT_SCALE_MAX,
    },
    objectivePendingDescription: {
      x: 0.25,
      y: -0.4,
      rotation: STUDIO_TEXT_ROTATION_MIN,
      scale: STUDIO_TEXT_SCALE_MIN,
    },
    'asset-label:desk': defaults['asset-label:desk'],
  })
  assert.equal(Object.hasOwn(restored, 'intruder'), false)
  assert.notEqual(restored['asset-label:desk'], defaults['asset-label:desk'])
})

test('单个坏 transform、坏 JSON、缺失存储与读取异常安全回退默认', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_TEXT_LAYOUT_STORAGE_KEY, JSON.stringify({
    brandTitle: { x: 0.2, y: null, rotation: 5, scale: 1 },
  }))
  assert.deepEqual(loadStudioTextLayout(storage, defaults), defaults)

  storage.entries.set(STUDIO_TEXT_LAYOUT_STORAGE_KEY, '{bad json')
  const malformed = loadStudioTextLayout(storage, defaults)
  assert.deepEqual(malformed, defaults)
  assert.notEqual(malformed, defaults)

  storage.entries.clear()
  assert.deepEqual(loadStudioTextLayout(storage, defaults), defaults)
  assert.deepEqual(loadStudioTextLayout(null, defaults), defaults)
  assert.deepEqual(loadStudioTextLayout({
    getItem() {
      throw new Error('blocked')
    },
  }, defaults), defaults)
})

test('保存使用 v1 键、保持独立副本，非法 transform 与写入异常返回 false', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  const storage = createMemoryStorage()
  const changed = {
    ...defaults,
    brandTitle: { x: 0.25, y: -0.2, rotation: 15, scale: 1.2 },
  }

  assert.equal(saveStudioTextLayout(storage, changed), true)
  assert.deepEqual(
    JSON.parse(storage.entries.get(STUDIO_TEXT_LAYOUT_STORAGE_KEY)),
    changed,
  )
  const restored = loadStudioTextLayout(storage, defaults)
  assert.deepEqual(restored, changed)
  assert.notEqual(restored, changed)
  assert.notEqual(restored.brandTitle, changed.brandTitle)

  assert.equal(saveStudioTextLayout(storage, {
    brandTitle: { x: Number.NaN, y: 0, rotation: 0, scale: 1 },
  }), false)
  assert.equal(saveStudioTextLayout(null, changed), false)
  assert.equal(saveStudioTextLayout({
    setItem() {
      throw new Error('quota')
    },
  }, changed), false)
})

test('选择、工具与 commit 使用不可变更新，坏值和等值提交不入历史', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  let state = createStudioTextEditorState(defaults)
  state = studioTextEditorReducer(state, { type: 'select', layerId: 'brandTitle' })
  state = studioTextEditorReducer(state, { type: 'set-tool', tool: 'rotate' })
  const beforeCommit = state

  state = studioTextEditorReducer(state, {
    type: 'commit',
    transform: { x: 4, y: -4, rotation: 220, scale: 3 },
  })
  assert.equal(state.tool, 'rotate')
  assert.equal(state.history.length, 1)
  assert.deepEqual(beforeCommit.draft.brandTitle, { x: 0, y: 0, rotation: 0, scale: 1 })
  assert.deepEqual(state.draft.brandTitle, { x: 1, y: -1, rotation: 180, scale: 2 })

  const afterCommit = state
  state = studioTextEditorReducer(state, {
    type: 'commit',
    transform: { x: 1, y: -1, rotation: 180, scale: 2 },
  })
  assert.equal(state, afterCommit)
  assert.equal(studioTextEditorReducer(state, {
    type: 'commit',
    layerId: 'missing',
    transform: { x: 0, y: 0, rotation: 0, scale: 1 },
  }), state)
  assert.equal(studioTextEditorReducer(state, {
    type: 'commit',
    transform: { x: Number.POSITIVE_INFINITY, y: 0, rotation: 0, scale: 1 },
  }), state)
})

test('撤销历史最多保留 30 个快照', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  let state = studioTextEditorReducer(
    createStudioTextEditorState(defaults),
    { type: 'select', layerId: 'brandTitle' },
  )

  for (let index = 1; index <= STUDIO_TEXT_LAYOUT_HISTORY_LIMIT + 5; index += 1) {
    state = studioTextEditorReducer(state, {
      type: 'commit',
      transform: {
        ...state.draft.brandTitle,
        rotation: index,
      },
    })
  }

  assert.equal(state.history.length, STUDIO_TEXT_LAYOUT_HISTORY_LIMIT)
  state = studioTextEditorReducer(state, { type: 'undo' })
  assert.equal(state.draft.brandTitle.rotation, STUDIO_TEXT_LAYOUT_HISTORY_LIMIT + 4)
})

test('sync-saved 保留撤销栈，mark-saved 同步深拷贝并清空历史', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  let state = createStudioTextEditorState(defaults)
  state = studioTextEditorReducer(state, {
    type: 'commit',
    layerId: 'brandTitle',
    transform: { x: 0.1, y: 0, rotation: 0, scale: 1 },
  })
  assert.equal(studioTextLayoutsEqual(state.draft, state.saved), false)

  state = studioTextEditorReducer(state, { type: 'sync-saved' })
  assert.equal(studioTextLayoutsEqual(state.draft, state.saved), true)
  assert.equal(state.history.length, 1)

  state = studioTextEditorReducer(state, {
    type: 'commit',
    layerId: 'brandTitle',
    transform: { x: 0.2, y: 0, rotation: 0, scale: 1 },
  })
  state = studioTextEditorReducer(state, { type: 'mark-saved' })
  assert.equal(studioTextLayoutsEqual(state.draft, state.saved), true)
  assert.equal(state.history.length, 0)
  assert.notEqual(state.draft, state.saved)
  assert.notEqual(state.draft.brandTitle, state.saved.brandTitle)
})

test('reset 恢复默认且可撤销，独立 reset 函数返回深拷贝', () => {
  const defaults = createDefaultStudioTextLayout(LAYER_IDS)
  let state = createStudioTextEditorState(defaults)
  state = studioTextEditorReducer(state, { type: 'select', layerId: 'brandTitle' })
  state = studioTextEditorReducer(state, {
    type: 'commit',
    transform: { x: 0.4, y: 0.1, rotation: 20, scale: 1.4 },
  })

  state = studioTextEditorReducer(state, { type: 'reset', defaults })
  assert.equal(studioTextLayoutsEqual(state.draft, defaults), true)
  assert.equal(state.history.length, 2)
  assert.equal(state.selectedLayerId, 'brandTitle')

  state = studioTextEditorReducer(state, { type: 'undo' })
  assert.deepEqual(state.draft.brandTitle, { x: 0.4, y: 0.1, rotation: 20, scale: 1.4 })

  const reset = resetStudioTextLayout(defaults)
  assert.deepEqual(reset, defaults)
  assert.notEqual(reset, defaults)
  assert.notEqual(reset.brandTitle, defaults.brandTitle)
})

test('相等比较同时检查 ID 集合与四个 transform 字段', () => {
  const left = createDefaultStudioTextLayout(LAYER_IDS)
  const right = createDefaultStudioTextLayout(LAYER_IDS)
  assert.equal(studioTextLayoutsEqual(left, right), true)

  right.brandTitle.scale = 1.1
  assert.equal(studioTextLayoutsEqual(left, right), false)
  assert.equal(studioTextLayoutsEqual(left, {
    ...left,
    intruder: { x: 0, y: 0, rotation: 0, scale: 1 },
  }), false)
})
