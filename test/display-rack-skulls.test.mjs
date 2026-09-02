import assert from 'node:assert/strict'
import { stat, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

const skulls = [
  {
    key: 'cyclopean-tide-grazer-skull',
    shelfY: 0.292,
    centerZ: 0.05,
    yaw: 0.04,
    maxSize: [0.52, 0.4, 0.33],
  },
  {
    key: 'spiral-antler-oracle-skull',
    shelfY: 0.809,
    centerZ: 0.05,
    yaw: -0.035,
    maxSize: [0.58, 0.41, 0.34],
  },
  {
    key: 'chitin-maw-brood-skull',
    shelfY: 1.306,
    centerZ: 0.05,
    yaw: 0.045,
    maxSize: [0.5, 0.39, 0.32],
  },
  {
    key: 'star-devourer-leviathan-skull',
    shelfY: 1.788,
    centerZ: 0.05,
    yaw: -0.03,
    maxSize: [0.56, 0.41, 0.34],
  },
]

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

test('四颗 LUX3D 异兽头骨随站点交付且保留 PBR 实时模型体量', async () => {
  for (const skull of skulls) {
    const modelUrl = projectFile(
      `public/models/display-skulls/${skull.key}-optimized.glb`,
    )
    const asset = await stat(modelUrl)

    assert.ok(asset.isFile(), `${skull.key} must be a GLB file`)
    assert.ok(
      asset.size > 500 * 1024,
      `${skull.key} must not be a lightweight placeholder`,
    )
    assert.ok(
      asset.size < 8 * 1024 * 1024,
      `${skull.key} must remain suitable for real-time browser delivery`,
    )
  }
})

test('头骨使用模型真实下边界贴合四层板，并同时受宽高深三轴约束', async () => {
  const source = await readFile(
    projectFile('src/scene/DemonicRackSkulls.tsx'),
    'utf8',
  )

  assert.match(source, /new Box3\(\)\.setFromObject\(object\)/)
  assert.match(source, /offset: \[-center\.x, -bounds\.min\.y, -center\.z\]/)
  assert.match(
    source,
    /Math\.min\([\s\S]{0,360}spec\.maxSize\[0\][\s\S]{0,180}spec\.maxSize\[1\][\s\S]{0,180}spec\.maxSize\[2\]/,
  )
  assert.match(source, /child\.castShadow = false/)
  assert.match(source, /child\.receiveShadow = true/)

  for (const skull of skulls) {
    assert.match(source, new RegExp(`${skull.key}-optimized\\.glb`))
    assert.match(
      source,
      new RegExp(`position: \\[[-0-9.]+, ${skull.shelfY}, ${skull.centerZ}\\]`),
    )
  }
})

test('优化后头骨在旋转后仍不穿入木背板，也不会顶到上一层板', async () => {
  await MeshoptDecoder.ready

  const shelfClearanceCeilings = [0.789, 1.286, 1.768, 2.245]
  const measuredSupportY = [0.2905, 0.807, 1.3046, 1.7862]

  for (const [index, skull] of skulls.entries()) {
    const document = await io.read(fileURLToPath(projectFile(
      `public/models/display-skulls/${skull.key}-optimized.glb`,
    )))
    const scene = document.getRoot().getDefaultScene()
    assert.ok(scene, `${skull.key} must have a default scene`)

    const bounds = getBounds(scene)
    const rawSize = bounds.max.map((value, axis) => value - bounds.min[axis])
    const scale = Math.min(
      skull.maxSize[0] / rawSize[0],
      skull.maxSize[1] / rawSize[1],
      skull.maxSize[2] / rawSize[2],
    )
    const fitted = rawSize.map((value) => value * scale)
    const rotatedDepth = Math.abs(Math.sin(skull.yaw)) * fitted[0]
      + Math.abs(Math.cos(skull.yaw)) * fitted[2]
    const top = skull.shelfY + fitted[1]
    const backmostZ = skull.centerZ - rotatedDepth / 2
    const frontmostZ = skull.centerZ + rotatedDepth / 2

    assert.ok(
      top < shelfClearanceCeilings[index],
      `${skull.key} must leave clearance below the shelf above`,
    )
    assert.ok(
      backmostZ > -0.13,
      `${skull.key} must stay in front of the wooden back panel at z=-0.14`,
    )
    assert.ok(
      frontmostZ < 0.235,
      `${skull.key} must stay behind the rack's front trim`,
    )
    assert.ok(
      skull.shelfY - measuredSupportY[index] >= 0.0009
        && skull.shelfY - measuredSupportY[index] <= 0.0021,
      `${skull.key} must sit within a 1–2mm anti-z-fighting lift over its shelf`,
    )
  }
})

test('头骨集合挂在陈列架本地坐标组内，随柜体一起移动和高亮', async () => {
  const installation = await readFile(
    projectFile('src/scene/DisplayRackInstallation.tsx'),
    'utf8',
  )

  assert.match(installation, /import \{ DemonicRackSkulls \}/)
  assert.match(installation, /position=\{asset\.position\}/)
  assert.match(installation, /rotation=\{asset\.rotation\}/)
  assert.match(installation, /scale=\{\[0\.7, 0\.7, 0\.7\]\}/)
  assert.match(installation, /<DemonicRackSkulls \/>/)
})
