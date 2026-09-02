import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)
const source = (relativePath) => readFile(projectFile(relativePath), 'utf8')

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

test('书房由附件机械开颅人头包围，且头壳不拦截交互射线', async () => {
  const [shell, canvas, room] = await Promise.all([
    source('src/scene/BrainStudioShell.tsx'),
    source('src/scene/StudioCanvas.tsx'),
    source('src/scene/RoomShell.tsx'),
  ])

  assert.match(shell, /models\/environment\/alex-mechanical-open-head-optimized\.glb/)
  assert.match(shell, /new Box3\(\)\.setFromObject\(object\)/)
  assert.match(shell, /child\.castShadow\s*=\s*false/)
  assert.match(shell, /child\.raycast\s*=\s*\(\)\s*=>\s*undefined/)
  assert.doesNotMatch(shell, /gestureAnchor|focusRaycastIgnore/)

  assert.match(canvas, /<RoomShell brainMode\s*\/>/)
  assert.match(canvas, /<BrainStudioShell\s*\/>/)
  assert.match(room, /brainMode\s*\?\s*null/)
})

test('发布版机械人头压缩到约4.2MB，并保留附件原生比例', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile(
    'public/models/environment/alex-mechanical-open-head-optimized.glb',
  )
  const [asset, document] = await Promise.all([
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  assert.ok(asset.isFile())
  assert.ok(
    asset.size > 3_900_000 && asset.size < 4_400_000,
    `mechanical head should remain close to the accepted 4.2MB delivery; received ${asset.size} bytes`,
  )

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'mechanical head GLB must have a default scene')

  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  const widthToHeight = size[0] / size[1]
  const depthToHeight = size[2] / size[1]

  // Ratios measured from the unmodified user-supplied GLB.
  assert.ok(Math.abs(widthToHeight - 0.9243044984) < 0.0005)
  assert.ok(Math.abs(depthToHeight - 0.7912831149) < 0.0005)
  assert.equal(document.getRoot().listMeshes().length, 1)
  assert.equal(document.getRoot().listMaterials().length, 1)
  assert.equal(document.getRoot().listTextures().length, 1)
})

test('机械人头保留附件原材质，不再套用旧头的石膏遮罩或三轴拟合', async () => {
  const shell = await source('src/scene/BrainStudioShell.tsx')

  assert.doesNotMatch(shell, /useTexture|PLASTER_|plaster-mask|onBeforeCompile/)
  assert.doesNotMatch(shell, /material\.clone\(\)|child\.material\s*=/)
  assert.doesNotMatch(shell, /TARGET_SIZE|HEAD_HEIGHT_SCALE|BASE_TARGET_HEIGHT/)
  assert.match(shell, /Preserve the supplied model's original material and UV mapping/)
})

test('新脑腔布局把家具、蜡烛与遗物提示收拢在内置地台范围内', async () => {
  const [shell, assets, candles, relics] = await Promise.all([
    source('src/scene/BrainStudioShell.tsx'),
    source('src/data/studioAssets.ts'),
    source('src/scene/CandleSet.tsx'),
    source('src/data/hiddenRelics.ts'),
  ])

  assert.match(shell, /WORLD_POSITION = \[-1\.3, -4\.635, -0\.55\]/)
  assert.match(shell, /WORLD_YAW = -Math\.PI \/ 2 \+ 0\.08/)
  assert.match(shell, /PLATFORM_LEVEL_ROLL = 0\.1544988577/)

  assert.match(assets, /id: 'abyssal-desk'[\s\S]{0,180}position: \[-0\.2, 0, -1\.2\]/)
  assert.match(assets, /id: 'vertebral-chair'[\s\S]{0,180}position: \[-0\.55, 0, 0\.5\]/)
  assert.match(assets, /id: 'forbidden-bookcase'[\s\S]{0,180}position: \[-0\.8, 0, -2\.8\]/)
  assert.match(assets, /id: 'demonic-display-rack'[\s\S]{0,180}position: \[-1\.45, 0, 0\.7\]/)
  assert.match(assets, /id: 'cthulhu-wall-mask'[\s\S]{0,180}position: \[1\.1, 1\.5, -2\.7\]/)
  assert.match(assets, /id: 'maw-cabinet'[\s\S]{0,240}position: \[1, 0, -2\.5\][\s\S]{0,260}visualScale: \[0\.52, 1, 0\.68\]/)
  assert.match(assets, /id: 'tentacle-lamp'[\s\S]{0,180}position: \[0\.25, 0, 0\.2\]/)
  assert.match(assets, /id: 'mechanical-cthulhu-octopus'[\s\S]{0,320}position: \[-0\.2, 3\.006, -2\.85\][\s\S]{0,80}rotation: \[0, 0, 0\][\s\S]{0,120}visualScale: \[1, 1, 1\]/)
  assert.match(assets, /id: 'mechanical-cthulhu-octopus'[\s\S]{0,520}fit: \{ axis: 'y', size: 0\.975 \}/)
  assert.match(assets, /id: 'ritual-rug'[\s\S]{0,180}position: \[-0\.1, 0\.018, 0\.65\]/)

  assert.doesNotMatch(candles, /const CANDLE_PLACEMENTS[\s\S]{0,2500}id: 'floor-left-candelabra'/)
  assert.match(candles, /id: 'floor-left-pillar'[\s\S]{0,150}position: \[-0\.88, FLOOR_CANDLE_BASE_Y, 1\.92\]/)
  assert.match(candles, /id: 'floor-center-left-pillar'[\s\S]{0,150}position: \[-0\.62, FLOOR_CANDLE_BASE_Y, 1\.74\]/)
  assert.match(candles, /id: 'floor-right-pillar'[\s\S]{0,150}position: \[-0\.2, FLOOR_CANDLE_BASE_Y, 1\.78\]/)
  assert.match(candles, /id: 'floor-far-right-pillar'[\s\S]{0,150}position: \[0\.22, FLOOR_CANDLE_BASE_Y, 1\.65\]/)
  assert.match(candles, /id: 'floor-far-right-back-pillar'[\s\S]{0,150}position: \[0\.5, FLOOR_CANDLE_BASE_Y, 1\.36\]/)
  assert.match(candles, /id: 'floor-back-right-cluster'[\s\S]{0,150}position: \[1\.45, -0\.018, -1\.7\]/)

  assert.match(relics, /id: 'drowned-dream-core'[\s\S]{0,1300}hitPosition: \[0\.246, 1\.782, 0\.244\]/)
  assert.match(relics, /id: 'fingerprint-casket'[\s\S]{0,1300}hitPosition: \[0\.979, 0\.692, -2\.248\]/)
})

test('仪式地毯保留暗色本体与三角织纹，脑腔地面不再绘制任何圆环', async () => {
  const [placeholders, roomShell] = await Promise.all([
    source('src/scene/PlaceholderAsset.tsx'),
    source('src/scene/RoomShell.tsx'),
  ])
  const rugModel = placeholders.match(
    /function RugModel\(\) \{[\s\S]*?\n\}\n\nfunction OctopusModel/,
  )?.[0]

  assert.ok(rugModel, 'RugModel should remain available as the candle support surface')
  assert.match(rugModel, /<cylinderGeometry args=\{\[0\.49, 0\.49, 0\.16, 64\]\} \/>/)
  assert.match(rugModel, /<meshStandardMaterial color="#25171a" roughness=\{0\.94\} \/>/)
  assert.match(rugModel, /Array\.from\(\{ length: 10 \}/)
  assert.match(rugModel, /<coneGeometry args=\{\[0\.035, 0\.13, 3\]\} \/>/)
  assert.match(rugModel, /<GlowMaterial color="#8e3a31" intensity=\{1\.3\} \/>/)
  assert.doesNotMatch(rugModel, /torusGeometry|ringGeometry/)
  assert.match(roomShell, /if \(brainMode\) \{\s*return null\s*\}/)
  assert.doesNotMatch(roomShell, /function FloorSigil|<FloorSigil \/>/)
})

test('附件人头只使用13.5统一缩放并保持已校准的位置与朝向', async () => {
  const shell = await source('src/scene/BrainStudioShell.tsx')
  const uniformScale = Number(shell.match(/UNIFORM_SCALE = ([\d.]+)/)?.[1])

  assert.equal(uniformScale, 13.5)
  assert.match(shell, /scale=\{\[UNIFORM_SCALE, UNIFORM_SCALE, UNIFORM_SCALE\]\}/)
  assert.match(shell, /position=\{WORLD_POSITION\}/)
  assert.match(shell, /rotation=\{\[0, WORLD_YAW, PLATFORM_LEVEL_ROLL\]\}/)
})

test('放大的完整机械人头由后移后的默认镜头完整取景', async () => {
  const canvas = await source('src/scene/StudioCanvas.tsx')

  assert.match(canvas, /DEFAULT_CAMERA_POSITION = \[10\.25, 5\.57, 15\.08\]/)
  assert.match(canvas, /DEFAULT_CAMERA_TARGET = \[-0\.42, 1\.48, -0\.72\]/)
  assert.match(canvas, /MAX_CAMERA_DISTANCE = 30/)
})
