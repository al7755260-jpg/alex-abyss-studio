import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Object3D, Vector3 } from 'three'
import { resolveHologramAnchors } from '../src/scene/hologramAnchors.ts'
import { DISPLAY_RACK_INSTALLATION_SCALE } from '../src/scene/displayRackGeometry.ts'
import { LAMP_GLOBE_CENTER } from '../src/scene/lampGlow.ts'

const saved = JSON.parse(await readFile(new URL('../src/data/publishedScene.json', import.meta.url), 'utf8')).layout
const closeTo = (actual, expected) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9))
const objectFor = (transform) => {
  const object = new Object3D()
  object.position.fromArray(transform.position)
  object.rotation.set(...transform.rotation)
  object.scale.fromArray(transform.scale)
  return object
}

test('雕像头锚点与真实rack→安装缩放→独立雕像编辑层一致', () => {
  const layout = structuredClone(saved)
  layout['demonic-display-rack'] = { position: [-3, 1, 2], rotation: [.2, 1.1, -.13], scale: [1.4, .8, 1.7] }
  layout['lovecraft-particle-bust'] = { position: [.3, 2.2, -.1], rotation: [-.2, .6, .18], scale: [.7, .9, .6] }
  const rack = objectFor(layout['demonic-display-rack'])
  const installation = new Object3D()
  installation.scale.setScalar(DISPLAY_RACK_INSTALLATION_SCALE)
  const bust = objectFor(layout['lovecraft-particle-bust'])
  rack.add(installation); installation.add(bust)
  rack.updateMatrixWorld(true)
  const expected = bust.localToWorld(new Vector3(0, .84, -.04)).toArray()
  closeTo(resolveHologramAnchors(layout, saved).anchors[1], expected)
})

test('灯球先应用视觉缩放再应用编辑transform，面具锚点贴合独立红眼', () => {
  const layout = structuredClone(saved)
  layout['tentacle-lamp'] = { position: [2, 3, -1], rotation: [.1, -.8, .25], scale: [1.3, .9, 1.1] }
  const visualScale = [.8, 1.15, .7]
  const lampRoot = objectFor(layout['tentacle-lamp'])
  const visual = new Object3D()
  visual.scale.fromArray(visualScale)
  lampRoot.add(visual)
  lampRoot.updateMatrixWorld(true)
  const actual = resolveHologramAnchors(layout, saved, visualScale)
  closeTo(actual.anchors[2], visual.localToWorld(new Vector3(...LAMP_GLOBE_CENTER)).toArray())
  const maskRoot = objectFor(layout['cthulhu-wall-mask'])
  maskRoot.updateMatrixWorld(true)
  closeTo(actual.anchors[0], maskRoot.localToWorld(new Vector3(0, .57, .18)).toArray())
})

test('缺省资产使用默认布局，头像始终高于三角上沿，不修改布局', () => {
  const before = JSON.stringify(saved)
  const fallback = resolveHologramAnchors({}, saved)
  const explicit = resolveHologramAnchors(saved, {})
  assert.deepEqual(fallback, explicit)
  assert.ok(explicit.position[1] > Math.max(explicit.anchors[0][1], explicit.anchors[1][1]))
  assert.equal(JSON.stringify(saved), before)
  assert.throws(() => resolveHologramAnchors({}, {}), /Missing hologram anchor asset/)
})
