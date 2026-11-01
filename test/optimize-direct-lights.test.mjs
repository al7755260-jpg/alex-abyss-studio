import assert from 'node:assert/strict'
import test from 'node:test'
import { ShaderChunk } from 'three'
import { installDirectLightOptimization } from '../src/scene/optimizeDirectLights.ts'

const original = ShaderChunk.lights_fragment_begin
const marker = '// cthulhu:skip-zero-local-light'

test('实际 Three chunk 只包裹点光与聚光的直接光照，所有阴影与其他 chunk 原样保留', () => {
  const chunks = { ...ShaderChunk }
  const warnings = []
  assert.equal(installDirectLightOptimization(chunks, (message) => warnings.push(message)), true)
  assert.deepEqual(warnings, [])
  assert.equal(chunks.lights_fragment_begin.split(marker).length - 1, 2)
  // Removing only the two added branch wrappers must recover every original
  // byte, including spot maps, shadow conditions, directional/area and IBL code.
  const restored = chunks.lights_fragment_begin.replace(
    /\t\t\/\/ cthulhu:skip-zero-local-light\n\t\tif \( directLight\.visible \) \{\n\t\t\t(RE_Direct\([^\n]+\);)\n\t\t\}/g,
    '\t\t$1',
  )
  assert.equal(restored, original)
  for (const [name, chunk] of Object.entries(ShaderChunk)) {
    if (name !== 'lights_fragment_begin') assert.equal(chunks[name], chunk, name)
  }
  assert.equal(ShaderChunk.lights_fragment_begin, original)
})

test('重复安装及 HMR 式重新调用不会累积条件或改变源码', () => {
  const chunks = { lights_fragment_begin: original }
  assert.equal(installDirectLightOptimization(chunks), true)
  const once = chunks.lights_fragment_begin
  for (let i = 0; i < 10; i++) assert.equal(installDirectLightOptimization(chunks), true)
  assert.equal(chunks.lights_fragment_begin, once)
})

test('聚光结构不匹配时原子回退，点光也不留下半安装补丁，并清楚告警', () => {
  const incompatible = original.replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'changedSpotLightInfo();')
  const chunks = { lights_fragment_begin: incompatible }
  const warnings = []
  assert.equal(installDirectLightOptimization(chunks, (message) => warnings.push(message)), false)
  assert.equal(chunks.lights_fragment_begin, incompatible)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /lights_fragment_begin.*r185/)
  assert.match(warnings[0], /保留原始着色器/)
})

test('缺失或重复的灯光区段被拒绝，不会误改相邻方向光', () => {
  const pointSection = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'
  for (const incompatible of [original.replace(pointSection, ''), original + '\n' + pointSection]) {
    const chunks = { lights_fragment_begin: incompatible }
    let warnings = 0
    assert.equal(installDirectLightOptimization(chunks, () => warnings++), false)
    assert.equal(chunks.lights_fragment_begin, incompatible)
    assert.equal(warnings, 1)
  }
})
