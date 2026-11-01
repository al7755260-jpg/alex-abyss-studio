import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { matchSmallPropLodMeshes, smallPropUsesRealtime } from '../src/scene/useSmallPropLod.ts'

test('小物件远近LOD在8至8.8米间保持当前层级，拒绝非法距离', () => {
  assert.equal(smallPropUsesRealtime(20, false), true)
  assert.equal(smallPropUsesRealtime(8.8, false), true)
  assert.equal(smallPropUsesRealtime(8.5, false), false)
  assert.equal(smallPropUsesRealtime(8.5, true), true)
  assert.equal(smallPropUsesRealtime(8, true), false)
  assert.equal(smallPropUsesRealtime(3, true), false)
  assert.equal(smallPropUsesRealtime(Number.NaN, true), true)
  assert.equal(smallPropUsesRealtime(Number.POSITIVE_INFINITY, false), false)
})

test('几何LOD配对保留原网格、材质、贴图、UV与变换引用', () => {
  const material = new MeshStandardMaterial({ map: new Texture() })
  const source = new Group()
  const high = new Mesh(new BoxGeometry(1, 2, 1, 4, 4, 4), material)
  high.name = 'small-prop'
  high.position.set(0.25, 0.5, -0.1)
  source.add(high)
  const lowScene = new Group()
  const low = new Mesh(new BoxGeometry(1, 2, 1))
  low.name = high.name
  lowScene.add(low)
  const highGeometry = high.geometry
  const highMap = material.map
  const pairs = matchSmallPropLodMeshes(source, lowScene)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].mesh, high)
  assert.equal(pairs[0].original, highGeometry)
  assert.equal(pairs[0].realtime, low.geometry)
  assert.equal(high.geometry, highGeometry, 'preparing the LOD must not change the near model')
  assert.equal(high.material, material)
  assert.equal(high.material.map, highMap)
  assert.deepEqual(high.position.toArray(), [0.25, 0.5, -0.1])
  assert.ok(pairs[0].realtime.getAttribute('uv'))
  assert.ok(pairs[0].realtime.index.count < pairs[0].original.index.count)
})

test('不兼容节点、缺少UV或primitive数量不一致时整件保留原几何', () => {
  const original = new Group()
  const high = new Mesh(new BoxGeometry())
  high.name = 'expected'
  original.add(high)
  const realtime = new Group()
  const low = new Mesh(new BoxGeometry())
  low.name = 'wrong'
  realtime.add(low)
  const geometry = high.geometry
  assert.equal(matchSmallPropLodMeshes(original, realtime), null)
  low.name = high.name
  low.geometry.deleteAttribute('uv')
  assert.equal(matchSmallPropLodMeshes(original, realtime), null)
  realtime.add(new Mesh(new BoxGeometry()))
  assert.equal(matchSmallPropLodMeshes(original, realtime), null)
  assert.equal(high.geometry, geometry)
})

test('交付的7份低模经浏览器同款GLTFLoader解析后均能匹配原模型并实际减面', async () => {
  const report = JSON.parse(await readFile(new URL('../scripts/small-prop-lod-report.json', import.meta.url), 'utf8'))
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  // This checks actual runtime geometry/naming. Source PBR maps stay on the
  // original mesh; no DOM image decoder is needed for this geometry check.
  loader.register(() => ({ name: 'HEADLESS_GEOMETRY_CHECK', loadMaterial: async () => new MeshStandardMaterial() }))
  const load = async (name) => {
    const bytes = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url))
    return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
  }
  let sourceCount = 0
  let realtimeCount = 0
  for (const item of report.reports) {
    const [original, realtime] = await Promise.all([load(`${item.name}-optimized`), load(`${item.name}-realtime`)])
    const pairs = matchSmallPropLodMeshes(original.clone(true), realtime)
    assert.ok(pairs?.length, `${item.name} must not silently fall back to full geometry`)
    const count = (geometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
    const high = pairs.reduce((sum, pair) => sum + count(pair.original), 0)
    const low = pairs.reduce((sum, pair) => sum + count(pair.realtime), 0)
    assert.equal(high, item.originalTriangles)
    assert.equal(low, item.realtimeTriangles)
    sourceCount += high * item.instances
    realtimeCount += low * item.instances
  }
  assert.equal(sourceCount, 797_988)
  assert.ok(realtimeCount < sourceCount * 0.2, `expected >80% fewer triangles, received ${realtimeCount}`)
})
