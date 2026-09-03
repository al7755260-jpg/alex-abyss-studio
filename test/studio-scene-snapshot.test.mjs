import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createDefaultStudioCopy } from '../src/editor/studioCopy.ts'
import { createDefaultStudioLayout } from '../src/editor/studioLayout.ts'
import { DEFAULT_STUDIO_LIGHTING } from '../src/editor/studioLighting.ts'
import { createDefaultStudioTextLayout } from '../src/editor/studioTextLayout.ts'
import {
  resolveSceneSnapshot,
  serializeSceneSnapshot,
  STUDIO_SCENE_SNAPSHOT_FILENAME,
  STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION,
} from '../src/editor/studioSceneSnapshot.ts'

function createDefaults() {
  const assets = [
    { id: 'desk', label: '书桌', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'lamp', label: '灯球', position: [1, 0, 0], rotation: [0, 0.5, 0] },
  ]
  return {
    layout: createDefaultStudioLayout(assets),
    copy: createDefaultStudioCopy(assets),
    textLayout: createDefaultStudioTextLayout(['brandTitle', 'asset-label:desk']),
    lighting: { ...DEFAULT_STUDIO_LIGHTING },
  }
}

test('场景快照 schema 固定且只涵盖可发布的四类编辑内容', () => {
  const defaults = createDefaults()
  const result = resolveSceneSnapshot(null, defaults)
  assert.equal(STUDIO_SCENE_SNAPSHOT_SCHEMA_VERSION, 1)
  assert.equal(STUDIO_SCENE_SNAPSHOT_FILENAME, 'alex-abyss-studio-scene-v1.json')
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'layout', 'copy', 'textLayout', 'lighting'])
  assert.deepEqual(result, { schemaVersion: 1, ...defaults })
})

test('已编辑场景可导出再解析，并完整保留位置、文案、文本位置及灯光', () => {
  const defaults = createDefaults()
  const edited = {
    schemaVersion: 1,
    ...defaults,
    layout: {
      ...defaults.layout,
      desk: { position: [1, 2, 3], rotation: [0, 1.1, 0], scale: [1.2, 1.2, 1.2] },
    },
    copy: { ...defaults.copy, brandTitle: '我排好的脑洞', assetLabels: { desk: '旧书桌', lamp: '灯' } },
    textLayout: { ...defaults.textLayout, brandTitle: { x: 0.2, y: -0.3, rotation: 20, scale: 1.4 } },
    lighting: { globalIntensity: 0.7, ambientIntensity: 1.2, exposure: 0.9 },
  }
  const serialized = serializeSceneSnapshot(edited)
  assert.ok(serialized.endsWith('\n'))
  assert.deepEqual(resolveSceneSnapshot(JSON.parse(serialized), defaults), edited)
})

test('错版本、缺失版本及错误根节点都回退独立默认副本', () => {
  const defaults = createDefaults()
  for (const candidate of [undefined, null, [], 'snapshot', 5, {}, { ...defaults, schemaVersion: 2 }]) {
    const result = resolveSceneSnapshot(candidate, defaults)
    assert.deepEqual(result, { schemaVersion: 1, ...defaults })
    assert.notEqual(result.layout, defaults.layout)
    assert.notEqual(result.layout.desk.position, defaults.layout.desk.position)
    assert.notEqual(result.copy.assetLabels, defaults.copy.assetLabels)
    assert.notEqual(result.textLayout.brandTitle, defaults.textLayout.brandTitle)
    assert.notEqual(result.lighting, defaults.lighting)
  }
})

test('坏字段独立回退、有效值有界且未知 ID 与私密附加字段不会进入结果', () => {
  const defaults = createDefaults()
  const result = resolveSceneSnapshot({
    schemaVersion: 1,
    gameProgress: { found: ['private'] },
    browserId: 'private-browser',
    token: 'private-token',
    layout: {
      desk: { position: [3, 2, 1], rotation: [0, 0, 0], scale: [20, 0.01, 1], secret: 'hidden' },
      lamp: { position: [Infinity, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      unknown: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
    copy: { brandTitle: '合法标题', brandSubtitle: 'x'.repeat(1000), private: 'hidden', assetLabels: { desk: '', unknown: 'hidden' } },
    textLayout: { brandTitle: { x: 99, y: -99, rotation: 999, scale: 99 }, private: { x: 0, y: 0, rotation: 0, scale: 1 } },
    lighting: { globalIntensity: 50, ambientIntensity: 'bad', exposure: -3, private: 'hidden' },
  }, defaults)
  assert.deepEqual(result.layout.desk, { position: [3, 2, 1], rotation: [0, 0, 0], scale: [2, 0.35, 1] })
  assert.deepEqual(result.layout.lamp, defaults.layout.lamp)
  assert.deepEqual(Object.keys(result.layout), ['desk', 'lamp'])
  assert.equal(result.copy.brandTitle, '合法标题')
  assert.equal(result.copy.brandSubtitle, defaults.copy.brandSubtitle)
  assert.deepEqual(result.copy.assetLabels, { desk: '', lamp: '灯球' })
  assert.deepEqual(result.textLayout.brandTitle, { x: 1, y: -1, rotation: 180, scale: 2 })
  assert.deepEqual(result.lighting, { globalIntensity: 2, ambientIntensity: 1, exposure: 0.35 })
  assert.doesNotMatch(JSON.stringify(result), /private|secret|unknown|hidden|token|browserId|gameProgress/)
})

test('保留缺失 scale 的旧式合法变换，但拒绝错误 scale 与超长向量', () => {
  const defaults = createDefaults()
  const result = resolveSceneSnapshot({
    schemaVersion: 1,
    layout: {
      desk: { position: [3, 0, 0], rotation: [0, 1, 0] },
      lamp: { position: [3, 0, 0], rotation: [0, 1, 0], scale: { invalid: true } },
    },
  }, defaults)
  assert.deepEqual(result.layout.desk, { position: [3, 0, 0], rotation: [0, 1, 0], scale: [1, 1, 1] })
  assert.deepEqual(result.layout.lamp, defaults.layout.lamp)
  assert.deepEqual(resolveSceneSnapshot({ schemaVersion: 1, layout: { desk: { position: [1, 2, 3, 4], rotation: [0, 0, 0] } } }, defaults).layout, defaults.layout)
})

test('投影不序列化未知循环字段或执行输入的 toJSON', () => {
  const defaults = createDefaults()
  const cyclic = {}
  cyclic.self = cyclic
  const result = resolveSceneSnapshot({
    schemaVersion: 1,
    layout: { ...defaults.layout, cyclic, toJSON() { throw new Error('must not run') } },
    copy: { ...defaults.copy, cyclic, toJSON() { throw new Error('must not run') } },
    textLayout: { ...defaults.textLayout, cyclic },
    lighting: { ...defaults.lighting, cyclic },
    cyclic,
  }, defaults)
  assert.deepEqual(result, { schemaVersion: 1, ...defaults })
})

test('规范化不修改输入或默认快照，返回值也不会反向修改原数据', () => {
  const defaults = createDefaults()
  const candidate = { schemaVersion: 1, ...structuredClone(defaults) }
  const before = JSON.stringify({ candidate, defaults })
  const result = resolveSceneSnapshot(candidate, defaults)
  assert.equal(JSON.stringify({ candidate, defaults }), before)
  result.layout.desk.position[0] = 99
  result.copy.assetLabels.desk = '改动'
  result.textLayout.brandTitle.x = 1
  result.lighting.exposure = 1.8
  assert.equal(JSON.stringify({ candidate, defaults }), before)
})

test('导出模块不读取浏览器存储、不上传；只在用户点击时生成 JSON', () => {
  const module = readFileSync(new URL('../src/editor/studioSceneSnapshot.ts', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../src/ui/editor/StudioSceneExport.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(module, /window\.|localStorage|sessionStorage|fetch\(/)
  assert.doesNotMatch(component, /localStorage|sessionStorage|fetch\(|useEffect|useMemo/)
  assert.match(component, /function generateSnapshot\(\)[\s\S]*?setExportJson\(serializeSceneSnapshot\(snapshot\)\)/)
  assert.match(component, /aria-label="发布场景 JSON"[\s\S]*?readOnly/)
  assert.match(component, /本地保存不等于全站发布/)
  assert.match(component, /navigator\.clipboard\.writeText\(exportJson\)/)
  assert.match(component, /link\.download = STUDIO_SCENE_SNAPSHOT_FILENAME/)
})
