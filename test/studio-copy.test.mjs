import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultStudioCopy,
  loadStudioCopy,
  saveStudioCopy,
  STUDIO_ASSET_LABEL_MAX_LENGTH,
  STUDIO_COPY_FIELD_LIMITS,
  STUDIO_COPY_STORAGE_KEY,
  studioCopiesEqual,
  updateStudioAssetLabel,
  updateStudioCopyField,
} from '../src/editor/studioCopy.ts'

const ASSETS = [
  { id: 'desk', label: '深渊书桌' },
  { id: 'lamp', label: '触须立灯' },
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

test('默认文案包含完整主画面 schema，并为资产标签创建独立深拷贝', () => {
  const first = createDefaultStudioCopy(ASSETS)
  const second = createDefaultStudioCopy(ASSETS)

  assert.equal(STUDIO_COPY_STORAGE_KEY, 'alex-abyss-studio:copy:v1')
  assert.deepEqual(Object.keys(STUDIO_COPY_FIELD_LIMITS), [
    'brandTitle',
    'brandSubtitle',
    'objectiveLabel',
    'objectivePendingTitle',
    'objectivePendingDescription',
    'objectiveCompleteTitle',
    'objectiveCompleteDescription',
    'sanityLabel',
    'rotateHint',
    'zoomHint',
    'exploreHint',
    'resetCameraLabel',
    'backToStudioLabel',
    'undiscoveredRelicLabel',
    'terminalCalloutLabel',
    'dreamArchiveCalloutLabel',
    'videoBeyondScreenText',
    'computerIdeaText',
    'perfectTyrannyText',
  ])
  assert.equal(first.brandTitle, 'AlexLi的奇怪脑洞')
  assert.equal(first.objectivePendingTitle, '找回六件吞噬遗物')
  assert.equal(first.sanityLabel, '理智')
  assert.equal(first.backToStudioLabel, '返回书房')
  assert.equal(first.undiscoveredRelicLabel, '未归档')
  assert.equal(first.terminalCalloutLabel, '真相终端')
  assert.equal(first.dreamArchiveCalloutLabel, '灵感书架')
  assert.equal(first.videoBeyondScreenText, '视频中50%的内容是隐藏在屏幕之外的')
  assert.equal(first.computerIdeaText, '永远不要扔掉你喜欢的东西')
  assert.equal(first.perfectTyrannyText, '完美，就是一个返自然，用来折磨我们的暴政')
  assert.deepEqual(first.assetLabels, {
    desk: '深渊书桌',
    lamp: '触须立灯',
  })
  assert.notEqual(first, second)
  assert.notEqual(first.assetLabels, second.assetLabels)

  first.assetLabels.desk = '修改不会串到下一份默认值'
  assert.equal(second.assetLabels.desk, '深渊书桌')
})

test('文案和资产标签完整保存，空字符串合法且重新加载后恢复', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const storage = createMemoryStorage()
  let changed = updateStudioCopyField(defaults, 'brandTitle', 'ALEX 可编辑工作室')
  changed = updateStudioCopyField(changed, 'brandSubtitle', '')
  changed = updateStudioCopyField(changed, 'objectivePendingDescription', '新的探索说明')
  changed = updateStudioCopyField(changed, 'perfectTyrannyText', '修改后的第三段文字')
  changed = updateStudioAssetLabel(changed, 'desk', '')

  assert.equal(saveStudioCopy(storage, changed), true)
  assert.deepEqual(
    JSON.parse(storage.entries.get(STUDIO_COPY_STORAGE_KEY)),
    changed,
  )

  const restored = loadStudioCopy(storage, defaults)
  assert.deepEqual(restored, changed)
  assert.equal(restored.brandSubtitle, '')
  assert.equal(restored.assetLabels.desk, '')
  assert.notEqual(restored, changed)
  assert.notEqual(restored.assetLabels, changed.assetLabels)
  assert.equal(studioCopiesEqual(restored, changed), true)
})

test('旧版存储缺少3D场景文字字段时逐项回退新默认文案', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const storage = createMemoryStorage()
  const legacyCopy = Object.fromEntries(
    Object.entries(defaults).filter(([field]) => (
      field !== 'videoBeyondScreenText' && field !== 'computerIdeaText'
      && field !== 'perfectTyrannyText'
    )),
  )

  legacyCopy.brandTitle = '旧版自定义标题'
  storage.entries.set(STUDIO_COPY_STORAGE_KEY, JSON.stringify(legacyCopy))

  const restored = loadStudioCopy(storage, defaults)
  assert.equal(restored.brandTitle, '旧版自定义标题')
  assert.equal(restored.videoBeyondScreenText, defaults.videoBeyondScreenText)
  assert.equal(restored.computerIdeaText, defaults.computerIdeaText)
  assert.equal(restored.perfectTyrannyText, defaults.perfectTyrannyText)
  assert.deepEqual(restored.assetLabels, defaults.assetLabels)
  assert.notEqual(restored.assetLabels, defaults.assetLabels)
})

test('加载只投影默认 schema，未知键被忽略且单个坏字段回退默认', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_COPY_STORAGE_KEY, JSON.stringify({
    brandTitle: '',
    brandSubtitle: 42,
    objectiveLabel: '新的目标标签',
    rotateHint: 'x'.repeat(STUDIO_COPY_FIELD_LIMITS.rotateHint + 1),
    unknownCopy: '不得进入结果',
    assetLabels: {
      desk: '',
      lamp: 'x'.repeat(STUDIO_ASSET_LABEL_MAX_LENGTH + 1),
      intruder: '不得进入结果',
    },
  }))

  const restored = loadStudioCopy(storage, defaults)
  assert.equal(restored.brandTitle, '')
  assert.equal(restored.brandSubtitle, defaults.brandSubtitle)
  assert.equal(restored.objectiveLabel, '新的目标标签')
  assert.equal(restored.rotateHint, defaults.rotateHint)
  assert.equal(Object.hasOwn(restored, 'unknownCopy'), false)
  assert.deepEqual(restored.assetLabels, {
    desk: '',
    lamp: defaults.assetLabels.lamp,
  })
  assert.equal(Object.hasOwn(restored.assetLabels, 'intruder'), false)
})

test('缺失存储、坏 JSON 与读取异常都安全回退到独立默认副本', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const storage = createMemoryStorage()

  const absent = loadStudioCopy(storage, defaults)
  assert.deepEqual(absent, defaults)
  assert.notEqual(absent, defaults)
  assert.notEqual(absent.assetLabels, defaults.assetLabels)

  storage.entries.set(STUDIO_COPY_STORAGE_KEY, '{bad json')
  assert.deepEqual(loadStudioCopy(storage, defaults), defaults)

  const throwingStorage = {
    getItem() {
      throw new Error('blocked')
    },
  }
  const recovered = loadStudioCopy(throwingStorage, defaults)
  assert.deepEqual(recovered, defaults)
  assert.notEqual(recovered.assetLabels, defaults.assetLabels)
})

test('保存拒绝超长或非法内容，存储写入异常返回 false', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const storage = createMemoryStorage()
  const overlongField = {
    ...defaults,
    brandTitle: 'x'.repeat(STUDIO_COPY_FIELD_LIMITS.brandTitle + 1),
  }
  const overlongAsset = {
    ...defaults,
    assetLabels: {
      ...defaults.assetLabels,
      desk: 'x'.repeat(STUDIO_ASSET_LABEL_MAX_LENGTH + 1),
    },
  }

  assert.equal(saveStudioCopy(storage, overlongField), false)
  assert.equal(saveStudioCopy(storage, overlongAsset), false)
  assert.equal(storage.entries.size, 0)
  assert.equal(saveStudioCopy(null, defaults), false)
  assert.equal(saveStudioCopy({
    setItem() {
      throw new Error('quota')
    },
  }, defaults), false)
})

test('字段更新不可变、按各自限制截断，等值更新保持原引用', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const longTitle = '甲'.repeat(STUDIO_COPY_FIELD_LIMITS.brandTitle + 12)
  const changed = updateStudioCopyField(defaults, 'brandTitle', longTitle)

  assert.notEqual(changed, defaults)
  assert.equal(defaults.brandTitle, 'AlexLi的奇怪脑洞')
  assert.equal(changed.brandTitle.length, STUDIO_COPY_FIELD_LIMITS.brandTitle)
  assert.equal(studioCopiesEqual(changed, defaults), false)
  assert.equal(updateStudioCopyField(changed, 'brandTitle', changed.brandTitle), changed)

  const emptied = updateStudioCopyField(changed, 'brandTitle', '')
  assert.equal(emptied.brandTitle, '')
  assert.equal(defaults.brandTitle, 'AlexLi的奇怪脑洞')
})

test('资产标签更新不可变并截断，未知资产 id 保持原状态', () => {
  const defaults = createDefaultStudioCopy(ASSETS)
  const longLabel = '乙'.repeat(STUDIO_ASSET_LABEL_MAX_LENGTH + 10)
  const changed = updateStudioAssetLabel(defaults, 'desk', longLabel)

  assert.notEqual(changed, defaults)
  assert.notEqual(changed.assetLabels, defaults.assetLabels)
  assert.equal(defaults.assetLabels.desk, '深渊书桌')
  assert.equal(changed.assetLabels.desk.length, STUDIO_ASSET_LABEL_MAX_LENGTH)
  assert.equal(updateStudioAssetLabel(changed, 'missing', '未知'), changed)
  assert.equal(updateStudioAssetLabel(changed, 'desk', changed.assetLabels.desk), changed)
  assert.equal(studioCopiesEqual(changed, defaults), false)
})

test('默认资产标签限制长度，并拒绝空 id、重复 id 与非字符串标签', () => {
  const defaults = createDefaultStudioCopy([
    { id: 'long', label: '丙'.repeat(STUDIO_ASSET_LABEL_MAX_LENGTH + 1) },
  ])
  assert.equal(defaults.assetLabels.long.length, STUDIO_ASSET_LABEL_MAX_LENGTH)

  assert.throws(
    () => createDefaultStudioCopy([{ id: '', label: '空 id' }]),
    /Invalid or duplicate studio asset id/,
  )
  assert.throws(
    () => createDefaultStudioCopy([ASSETS[0], ASSETS[0]]),
    /Invalid or duplicate studio asset id/,
  )
  assert.throws(
    () => createDefaultStudioCopy([{ id: 'bad-label', label: 42 }]),
    /must use a string label/,
  )
})
