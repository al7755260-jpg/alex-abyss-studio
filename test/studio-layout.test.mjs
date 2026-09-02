import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultStudioLayout,
  createStudioEditorState,
  layoutsEqual,
  loadStudioLayout,
  resolveAttachedPoint,
  saveStudioLayout,
  STUDIO_LAYOUT_HISTORY_LIMIT,
  STUDIO_LAYOUT_LEGACY_STORAGE_KEY,
  STUDIO_LAYOUT_STORAGE_KEY,
  STUDIO_SCALE_MAX,
  STUDIO_SCALE_MIN,
  studioEditorReducer,
} from '../src/editor/studioLayout.ts'

const ASSETS = [
  { id: 'desk', position: [0, 0, 0], rotation: [0, 0, 0] },
  { id: 'lamp', position: [2, 0, -1], rotation: [0, 0.25, 0] },
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

const assertVectorClose = (actual, expected, epsilon = 1e-9) => {
  assert.equal(actual.length, expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= epsilon,
      `component ${index}: expected ${expected[index]}, received ${actual[index]}`,
    )
  }
}

test('默认布局复制资产变换并拒绝无效三元数组与重复 ID', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  assert.deepEqual(defaults, {
    desk: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    lamp: { position: [2, 0, -1], rotation: [0, 0.25, 0], scale: [1, 1, 1] },
  })
  assert.notEqual(defaults.desk.position, ASSETS[0].position)

  assert.throws(
    () => createDefaultStudioLayout([
      { id: 'broken', position: [0, Number.NaN, 0], rotation: [0, 0, 0] },
    ]),
    /finite position and rotation tuples/,
  )
  assert.throws(
    () => createDefaultStudioLayout([ASSETS[0], ASSETS[0]]),
    /duplicate studio asset id/,
  )
})

test('布局按固定键完整保存，并能恢复已知资产变换', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  const storage = createMemoryStorage()
  const changed = {
    ...defaults,
    desk: { position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [1.2, 1.2, 1.2] },
  }

  assert.equal(saveStudioLayout(storage, changed), true)
  assert.equal(STUDIO_LAYOUT_STORAGE_KEY, 'alex-abyss-studio:layout:v2')
  assert.deepEqual(
    JSON.parse(storage.entries.get(STUDIO_LAYOUT_STORAGE_KEY)),
    changed,
  )
  const restored = loadStudioLayout(storage, defaults)
  assert.deepEqual(restored, changed)

  const reloadedEditor = createStudioEditorState(defaults, restored)
  assert.deepEqual(reloadedEditor.draft, changed)
  assert.deepEqual(reloadedEditor.saved, changed)
  assert.equal(layoutsEqual(reloadedEditor.draft, reloadedEditor.saved), true)
  assert.equal(reloadedEditor.history.length, 0)
  assert.equal(reloadedEditor.selectedAssetId, null)
})

test('新增资产只补入自己的默认值，不覆盖同 ID 的已保存布局', () => {
  const originalDefaults = createDefaultStudioLayout(ASSETS)
  const storage = createMemoryStorage()
  const saved = {
    ...originalDefaults,
    desk: { position: [4, 1, -2], rotation: [0, 0.8, 0], scale: [1.4, 1.4, 1.4] },
  }
  assert.equal(saveStudioLayout(storage, saved), true)

  const expandedDefaults = createDefaultStudioLayout([
    { id: 'desk', position: [99, 99, 99], rotation: [1, 1, 1] },
    { id: 'lamp', position: [88, 88, 88], rotation: [2, 2, 2] },
    { id: 'haunted-frame', position: [-3, 2.5, -1], rotation: [0, 0.7, 0] },
  ])
  const restored = loadStudioLayout(storage, expandedDefaults)

  assert.deepEqual(restored.desk, saved.desk)
  assert.deepEqual(restored.lamp, saved.lamp)
  assert.deepEqual(restored['haunted-frame'], expandedDefaults['haunted-frame'])
  assert.deepEqual(Object.keys(restored), ['desk', 'lamp', 'haunted-frame'])
  assert.notEqual(restored.desk, saved.desk)
  assert.notEqual(restored['haunted-frame'], expandedDefaults['haunted-frame'])
})

test('旧默认位置只迁移未编辑的牌匾并保留其它用户布局', () => {
  const oldPlaque = {
    position: [-3.65, 1.55, -5.53],
    rotation: [0, -0.35, 0],
    scale: [1, 1, 1],
  }
  const newDefaults = createDefaultStudioLayout([
    ...ASSETS,
    {
      id: 'mysterious-plaque',
      position: [-1.05, 1.81, -0.56],
      rotation: [0, -Math.PI / 2, 0],
    },
  ])
  const storage = createMemoryStorage()
  const savedDesk = {
    position: [4, 1, -2],
    rotation: [0, 0.8, 0],
    scale: [1.4, 1.4, 1.4],
  }
  storage.entries.set(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify({
    ...newDefaults,
    desk: savedDesk,
    'mysterious-plaque': oldPlaque,
  }))

  const migrated = loadStudioLayout(storage, newDefaults, {
    'mysterious-plaque': oldPlaque,
  })
  assert.deepEqual(migrated['mysterious-plaque'], newDefaults['mysterious-plaque'])
  assert.deepEqual(migrated.desk, savedDesk)

  const userPlaque = {
    position: [-0.7, 1.9, -0.8],
    rotation: [0, -1.2, 0],
    scale: [0.8, 0.8, 0.8],
  }
  storage.entries.set(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify({
    ...newDefaults,
    'mysterious-plaque': userPlaque,
  }))
  const preserved = loadStudioLayout(storage, newDefaults, {
    'mysterious-plaque': oldPlaque,
  })
  assert.deepEqual(preserved['mysterious-plaque'], userPlaque)
})

test('加载只采纳默认 ID 与有限三元数组，坏条目和坏 JSON 回退默认', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify({
    desk: { position: [5, 0, 0], rotation: [0, 1, 0], scale: [1.5, 1.5, 1.5] },
    lamp: { position: [2, null, -1], rotation: [0, 0.8, 0], scale: [1, 1, 1] },
    intruder: { position: [9, 9, 9], rotation: [9, 9, 9] },
  }))

  assert.deepEqual(loadStudioLayout(storage, defaults), {
    desk: { position: [5, 0, 0], rotation: [0, 1, 0], scale: [1.5, 1.5, 1.5] },
    lamp: defaults.lamp,
  })

  storage.entries.set(STUDIO_LAYOUT_STORAGE_KEY, '{bad json')
  assert.deepEqual(loadStudioLayout(storage, defaults), defaults)
  assert.notEqual(loadStudioLayout(storage, defaults), defaults)
})

test('存储访问失败和待保存布局含无限值时返回安全结果而不抛出', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  const throwingStorage = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('quota')
    },
  }

  assert.deepEqual(loadStudioLayout(throwingStorage, defaults), defaults)
  assert.equal(saveStudioLayout(throwingStorage, defaults), false)
  assert.equal(saveStudioLayout(createMemoryStorage(), {
    desk: { position: [Number.POSITIVE_INFINITY, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }), false)
})

test('选择、工具切换、提交和撤销保持不可变历史，等值提交不入历史', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  let state = createStudioEditorState(defaults)
  state = studioEditorReducer(state, { type: 'select', assetId: 'desk' })
  state = studioEditorReducer(state, { type: 'set-tool', tool: 'rotate' })
  const beforeCommit = state

  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { position: [1, 0, 0], rotation: [0, 0.5, 0], scale: [1, 1, 1] },
  })
  assert.equal(state.tool, 'rotate')
  assert.equal(state.history.length, 1)
  assert.deepEqual(beforeCommit.draft.desk.position, [0, 0, 0])

  const afterCommit = state
  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { position: [1, 0, 0], rotation: [0, 0.5, 0], scale: [1, 1, 1] },
  })
  assert.equal(state, afterCommit)

  state = studioEditorReducer(state, { type: 'undo' })
  assert.equal(layoutsEqual(state.draft, defaults), true)
  assert.equal(state.history.length, 0)
})

test('历史最多保留 30 个可撤销快照', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  let state = studioEditorReducer(
    createStudioEditorState(defaults),
    { type: 'select', assetId: 'desk' },
  )

  for (let index = 1; index <= STUDIO_LAYOUT_HISTORY_LIMIT + 5; index += 1) {
    state = studioEditorReducer(state, {
      type: 'commit',
      transform: { position: [index, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
  }

  assert.equal(state.history.length, STUDIO_LAYOUT_HISTORY_LIMIT)
  state = studioEditorReducer(state, { type: 'undo' })
  assert.deepEqual(state.draft.desk.position, [STUDIO_LAYOUT_HISTORY_LIMIT + 4, 0, 0])
})

test('自动保存同步保存快照但保留撤销历史', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  let state = studioEditorReducer(
    createStudioEditorState(defaults),
    { type: 'select', assetId: 'desk' },
  )
  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { position: [4, 0, 0], rotation: [0, 0.4, 0], scale: [1.2, 1.2, 1.2] },
  })
  assert.equal(state.history.length, 1)
  assert.equal(layoutsEqual(state.draft, state.saved), false)

  state = studioEditorReducer(state, { type: 'sync-saved' })
  assert.equal(layoutsEqual(state.draft, state.saved), true)
  assert.equal(state.history.length, 1)

  state = studioEditorReducer(state, { type: 'undo' })
  assert.equal(layoutsEqual(state.draft, defaults), true)
  assert.equal(state.history.length, 0)
})

test('mark-saved 更新保存快照并清空撤销历史', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  let state = studioEditorReducer(
    createStudioEditorState(defaults),
    { type: 'select', assetId: 'desk' },
  )
  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { position: [3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  })
  assert.equal(layoutsEqual(state.draft, state.saved), false)

  state = studioEditorReducer(state, { type: 'mark-saved' })
  assert.equal(layoutsEqual(state.draft, state.saved), true)
  assert.equal(state.history.length, 0)
  assert.notEqual(state.draft, state.saved)
})

test('附着点随资产平移保持局部偏移', () => {
  const point = resolveAttachedPoint(
    { position: [1, 0, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    { position: [4, 2, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    [1.5, 0.25, 2.75],
  )
  assertVectorClose(point, [4.5, 2.25, -0.25])
})

test('附着点随资产绕 Y 轴旋转', () => {
  const point = resolveAttachedPoint(
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    { position: [0, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] },
    [1, 0, 0],
  )
  assertVectorClose(point, [0, 0, -1])
})

test('旧 v1 布局保留位置和旋转，并为每个对象补齐单位缩放', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_LAYOUT_LEGACY_STORAGE_KEY, JSON.stringify({
    desk: { position: [3, 1, -2], rotation: [0, 0.75, 0] },
    lamp: { position: [2, 0, -1], rotation: [0, 0.25, 0] },
  }))

  const migrated = loadStudioLayout(storage, defaults)
  assert.deepEqual(migrated.desk, {
    position: [3, 1, -2],
    rotation: [0, 0.75, 0],
    scale: [1, 1, 1],
  })
})

test('等比缩放进入撤销历史并被限制在安全范围内', () => {
  const defaults = createDefaultStudioLayout(ASSETS)
  let state = studioEditorReducer(
    createStudioEditorState(defaults),
    { type: 'select', assetId: 'desk' },
  )

  state = studioEditorReducer(state, {
    type: 'set-tool',
    tool: 'scale',
  })
  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { ...state.draft.desk, scale: [99, 99, 99] },
  })
  assert.equal(state.tool, 'scale')
  assert.deepEqual(state.draft.desk.scale, [STUDIO_SCALE_MAX, STUDIO_SCALE_MAX, STUDIO_SCALE_MAX])

  state = studioEditorReducer(state, { type: 'undo' })
  assert.deepEqual(state.draft.desk.scale, [1, 1, 1])

  state = studioEditorReducer(state, {
    type: 'commit',
    transform: { ...state.draft.desk, scale: [0.001, 0.001, 0.001] },
  })
  assert.deepEqual(state.draft.desk.scale, [STUDIO_SCALE_MIN, STUDIO_SCALE_MIN, STUDIO_SCALE_MIN])
})

test('附着点跟随家具缩放，局部偏移不会与模型脱离', () => {
  const point = resolveAttachedPoint(
    { position: [1, 0, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    { position: [1, 0, 2], rotation: [0, 0, 0], scale: [2, 2, 2] },
    [1.5, 0.25, 2.75],
  )
  assertVectorClose(point, [2, 0.5, 3.5])
})
