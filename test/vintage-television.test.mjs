import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

function countTriangles(document) {
  let triangles = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()?.getCount()
      const vertices = primitive.getAttribute('POSITION')?.getCount() ?? 0
      triangles += Math.floor((indices ?? vertices) / 3)
    }
  }
  return triangles
}

test('老式电视以轻量 GLB 加入场景并保留完整编辑入口', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile('public/models/vintage-television-optimized.glb')
  const [assets, canvas, app, editor, assetFile, document] = await Promise.all([
    readFile(projectFile('src/data/studioAssets.ts'), 'utf8'),
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
    readFile(projectFile('src/App.tsx'), 'utf8'),
    readFile(projectFile('src/ui/editor/StudioEditorControl.tsx'), 'utf8'),
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  const assetBlock = assets.match(
    /id: 'vintage-television'[\s\S]*?(?=\n\s*\},\n\s*\{)/,
  )?.[0]
  assert.ok(assetBlock, 'vintage television asset configuration must exist')
  assert.match(assetBlock, /label: '老式电视'/)
  assert.match(assetBlock, /kind: 'television'/)
  assert.match(assetBlock, /models\/vintage-television-optimized\.glb/)
  assert.match(assetBlock, /position: \[2\.35, 0\.02, 0\.85\]/)
  assert.match(assetBlock, /fit: \{ axis: 'y', size: 0\.9 \}/)

  assert.match(canvas, /STUDIO_ASSETS\.map\(\(asset\) =>/)
  assert.match(canvas, /ref=\{getEditableGroupRef\(asset\.id\)\}/)
  assert.match(canvas, /onSelectAsset\(asset\.id\)/)
  assert.match(app, /assetOptions=\{STUDIO_ASSETS\}/)
  assert.match(editor, /onSelectAsset\(event\.currentTarget\.value \|\| null\)/)
  assert.match(editor, /onToolChange\('translate'\)/)
  assert.match(editor, /onToolChange\('rotate'\)/)
  assert.match(editor, /onToolChange\('scale'\)/)

  assert.ok(assetFile.size < 1.5 * 1024 * 1024, 'optimized television must stay below 1.5MB')
  assert.ok(countTriangles(document) < 150_000, 'optimized television must stay below 150K triangles')

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'optimized television GLB must have a default scene')
  assert.equal(document.getRoot().listMaterials().length, 1)
  assert.equal(document.getRoot().listTextures().length, 1)

  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  assert.ok(bounds.min[1] >= 0, 'television model must remain grounded')
  assert.ok(size[2] > size[1], 'television cabinet should remain wider than it is tall')
  assert.ok(size[1] > size[0], 'television cabinet should remain taller than its depth')
})

test('老式电视屏幕使用贴合曲面的低成本动态雪花并随场景暂停', async () => {
  const [effect, slot, canvas] = await Promise.all([
    readFile(projectFile('src/scene/VintageTelevisionStatic.tsx'), 'utf8'),
    readFile(projectFile('src/scene/AssetSlot.tsx'), 'utf8'),
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
  ])

  assert.match(slot, /asset\.id === 'vintage-television'[\s\S]{0,120}<VintageTelevisionStatic active=\{active\}/)
  assert.match(canvas, /<AssetSlot asset=\{localAsset\} active=\{!detailRelic\} \/>/)
  assert.match(effect, /name="vintage-television-static-screen"/)
  assert.match(effect, /position=\{\[0\.3715, 0\.4406, 0\.049\]\}/)
  assert.match(effect, /<planeGeometry args=\{\[0\.582, 0\.455, 18, 14\]\} \/>/)
  assert.match(effect, /sourceDepth[\s\S]{0,300}-0\.44573875 \* sourceDz \* sourceDz/)
  assert.match(effect, /floor\(uTime \* 22\.0\)/)
  assert.match(effect, /const updateFrame = Math\.floor\(clock\.elapsedTime \* 30\)/)
  assert.match(effect, /if \(!active \|\| !materialRef\.current\) return/)
  assert.match(effect, /raycast=\{ignoreRaycast\}/)
  assert.match(effect, /depthWrite=\{false\}/)
  assert.match(effect, /toneMapped=\{false\}/)
  assert.doesNotMatch(effect, /CanvasTexture|<video|VideoTexture/)
})
