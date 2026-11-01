import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { matchSmallPropLodMeshes, smallPropUsesRealtime } from '../src/scene/useSmallPropLod.ts'

// Distance GLBs only provide geometry. This Node check uses Three's real
// GLTF parser and verifies that the original material survives each switch.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
loader.register((parser) => {
  // Intercept image decoding for both the built-in WebP extension and PNGs.
  parser.loadTextureImage = async () => new Texture()
  return { name: 'headless-texture-validation', loadTexture: async () => new Texture() }
})
async function scene(name) {
  const bytes = await readFile(new URL('../public/models/' + name + '.glb', import.meta.url))
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const report = JSON.parse(await readFile(new URL('./studio-prop-lod-report.json', import.meta.url), 'utf8'))
for (const { name } of report.reports) {
  const original = await scene(name + '-optimized')
  const realtime = await scene(name + '-realtime')
  const pairs = matchSmallPropLodMeshes(original, realtime)
  assert.ok(pairs?.length, name + ': real GLTFLoader mesh/attribute matching failed')
  const materials = pairs.map(({ mesh }) => mesh.material)
  assert.equal(smallPropUsesRealtime(20, false), true)
  pairs.forEach(({mesh,realtime}) => { mesh.geometry = realtime })
  pairs.forEach(({mesh,realtime}, index) => {
    assert.equal(mesh.geometry, realtime)
    assert.equal(mesh.material, materials[index])
  })
  assert.equal(smallPropUsesRealtime(7, true), false)
  pairs.forEach(({mesh,original}) => { mesh.geometry = original })
  pairs.forEach(({mesh,original}, index) => {
    assert.equal(mesh.geometry, original, name + ': near geometry identity was not restored')
    assert.equal(mesh.material, materials[index])
  })
  console.log(name + ': ' + pairs.length + ' mesh pair(s), far/near geometry restoration and material identity passed')
}
