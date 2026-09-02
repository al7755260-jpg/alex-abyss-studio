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

test('神秘牌匾使用轻量 GLB 并立放在桌面默认可见位置', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile('public/models/mysterious-plaque-optimized.glb')
  const [assets, assetFile, document] = await Promise.all([
    readFile(projectFile('src/data/studioAssets.ts'), 'utf8'),
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  const assetBlock = assets.match(
    /id: 'mysterious-plaque'[\s\S]*?(?=\n\s*\},\n\s*\{)/,
  )?.[0]
  assert.ok(assetBlock, 'mysterious plaque asset configuration must exist')
  assert.match(assetBlock, /label: '神秘牌匾'/)
  assert.match(assetBlock, /kind: 'plaque'/)
  assert.match(assetBlock, /models\/mysterious-plaque-optimized\.glb/)
  assert.match(assetBlock, /position: \[-1\.05, 1\.81, -0\.56\]/)
  assert.match(assetBlock, /rotation: \[0, -Math\.PI \/ 2, 0\]/)
  assert.match(assetBlock, /placeholderSize: \[0\.15, 0\.65, 1\.085\]/)
  assert.match(assetBlock, /fit: \{ axis: 'y', size: 0\.65 \}/)
  assert.match(assetBlock, /castShadow: false/)
  assert.doesNotMatch(assetBlock, /visualScale:/)

  const measuredDeskSurfaceY = 1.807
  const plaqueBaseY = 1.81
  assert.ok(plaqueBaseY >= measuredDeskSurfaceY)
  assert.ok(plaqueBaseY - measuredDeskSurfaceY <= 0.0035)

  assert.ok(assetFile.size < 2 * 1024 * 1024, 'optimized plaque must stay below 2MB')

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'optimized plaque GLB must have a default scene')
  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])

  assert.ok(size[2] > size[1], 'plaque must remain wider than it is tall')
  assert.ok(size[1] > size[0] * 3, 'plaque must keep its thin wall-mounted profile')
})
