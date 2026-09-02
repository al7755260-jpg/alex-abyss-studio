import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

test('遗物详情使用 Lux3D 羊皮卷 GLB，并让卷轴与遗物共同参与三维旋转', async () => {
  const scene = await readFile(
    projectFile('src/scene/ArtifactDetailScene.tsx'),
    'utf8',
  )
  const parchment = scene.slice(
    scene.indexOf('function AbyssalParchment'),
    scene.indexOf('function RelicEntrance'),
  )

  assert.match(
    scene,
    /models\/ui\/abyssal-artifact-parchment-optimized\.glb/,
    'ArtifactDetailScene must load the Lux3D parchment asset from /models/ui/',
  )
  assert.match(scene, /useFrame\s*\(\s*\(\{\s*camera\s*\}\)\s*=>/)
  assert.match(
    scene,
    /<group name="artifact-detail-rotation-root">[\s\S]{0,160}<AbyssalParchment \/>[\s\S]{0,320}<RelicEntrance relic=\{relic\} \/>/,
    'the parchment and relic must share the detail rotation root',
  )
  assert.match(
    scene,
    /if \(!placementLockedRef\.current\) \{[\s\S]{0,520}parchment\.quaternion\.copy\(camera\.quaternion\)[\s\S]{0,100}placementLockedRef\.current = true/,
    'the parchment may use the first detail camera pose for framing but must lock it afterwards',
  )
  assert.doesNotMatch(parchment, /const cameraMoved =/)
  assert.doesNotMatch(parchment, /entranceCompleteRef\.current && !cameraMoved/)
  assert.doesNotMatch(scene, /gestureAnchor|focusRaycastIgnore/)
})

test('遗物详情不再回退到程序化 Shape、Tube 或 Cylinder 卷轴', async () => {
  const scene = await readFile(
    projectFile('src/scene/ArtifactDetailScene.tsx'),
    'utf8',
  )

  assert.doesNotMatch(scene, /\bShape\b/)
  assert.doesNotMatch(scene, /\bCatmullRomCurve3\b/)
  assert.doesNotMatch(scene, /<(?:shape|tube|cylinder)Geometry\b/i)
})

test('Lux3D 羊皮卷 GLB 已随站点交付且不是轻量占位文件', async () => {
  const asset = await stat(projectFile(
    'public/models/ui/abyssal-artifact-parchment-optimized.glb',
  ))

  assert.ok(asset.isFile(), 'the Lux3D parchment asset must be a file')
  assert.ok(
    asset.size > 500 * 1024,
    `the Lux3D parchment asset must be larger than 500KB; received ${asset.size} bytes`,
  )
})
