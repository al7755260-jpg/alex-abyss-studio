import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)
const source = (relativePath) => readFile(projectFile(relativePath), 'utf8')

const visibleModelInstances = [
  ['models/environment/alex-mechanical-open-head-optimized.glb', 1],
  ['models/desk-optimized.glb', 1],
  ['models/chair-optimized.glb', 1],
  ['models/monitor-optimized.glb', 1],
  ['models/computer-optimized.glb', 1],
  ['models/computer-inspiration-note-optimized.glb', 1],
  ['models/video-beyond-screen-note-optimized.glb', 1],
  ['models/perfect-tyranny-note-optimized.glb', 1],
  ['models/keyboard-optimized.glb', 1],
  ['models/bookcase-optimized.glb', 1],
  ['models/demonic-cthulhu-display-rack-optimized.glb', 1],
  ['models/cthulhu-wall-mask-optimized.glb', 1],
  ['models/cabinet-optimized.glb', 1],
  ['models/lamp-optimized.glb', 1],
  ['models/mechanical-cthulhu-octopus-optimized.glb', 1],
  ['models/mysterious-plaque-optimized.glb', 1],
  ['models/vintage-television-optimized.glb', 1],
  ['models/candles/melted-five-arm-candelabra-optimized.glb', 1],
  ['models/candles/blood-red-pillar-candle-optimized.glb', 7],
  ['models/candles/black-wax-skull-goblet-candle-optimized.glb', 1],
  ['models/candles/staggered-seven-candle-cluster-optimized.glb', 1],
  ['models/display-skulls/cyclopean-tide-grazer-skull-optimized.glb', 1],
  ['models/display-skulls/spiral-antler-oracle-skull-optimized.glb', 1],
  ['models/display-skulls/chitin-maw-brood-skull-optimized.glb', 1],
  ['models/display-skulls/star-devourer-leviathan-skull-optimized.glb', 1],
]

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

function countTriangles(document) {
  let triangles = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indexCount = primitive.getIndices()?.getCount()
      const vertexCount = primitive.getAttribute('POSITION')?.getCount() ?? 0
      triangles += Math.floor((indexCount ?? vertexCount) / 3)
    }
  }
  return triangles
}

test('首屏可见 GLB 保持在发布体积和三角面预算内', async () => {
  await MeshoptDecoder.ready

  let bytes = 0
  let renderedTriangles = 0
  for (const [relativePath, instanceCount] of visibleModelInstances) {
    const url = projectFile(`public/${relativePath}`)
    const [asset, document] = await Promise.all([
      stat(url),
      io.read(fileURLToPath(url)),
    ])
    bytes += asset.size
    renderedTriangles += countTriangles(document) * instanceCount
  }

  assert.ok(bytes < 60 * 1024 * 1024, `visible GLBs exceed 60MB: ${bytes}`)
  assert.ok(
    renderedTriangles < 3_500_000,
    `visible triangle budget exceeds 3.5M: ${renderedTriangles}`,
  )
})

test('运行时使用自适应 DPR、单阴影灯和轻量鼠标代理', async () => {
  const [canvas, lighting, effects, relics, detail, candles, callout, app] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'),
    source('src/scene/StudioLighting.tsx'),
    source('src/scene/PostEffects.tsx'),
    source('src/scene/HiddenRelics.tsx'),
    source('src/scene/ArtifactDetailScene.tsx'),
    source('src/scene/CandleSet.tsx'),
    source('src/scene/ObjectCalloutOverlay.tsx'),
    source('src/App.tsx'),
  ])

  assert.match(canvas, /dpr=\{\[0\.75, 1\.25\]\}/)
  assert.match(canvas, /performance=\{\{ min: 0\.6, max: 1, debounce: 480 \}\}/)
  assert.match(canvas, /<AdaptiveDpr \/>/)
  assert.match(canvas, /frameloop=\{renderPaused \? 'never' : 'always'\}/)
  assert.match(canvas, /<group visible=\{!detailRelic\} name="persistent-studio-world">/)
  assert.match(canvas, /function CameraPerformanceRegressor/)
  assert.match(canvas, /performanceState\.regress\(\)/)
  assert.doesNotMatch(canvas, /<OrbitControls[\s\S]{0,500}\bregress\b/)
  assert.match(canvas, /function StudioShadowMapController/)
  assert.match(canvas, /gl\.shadowMap\.autoUpdate = false/)
  assert.doesNotMatch(canvas, /gl\.shadowMap\.autoUpdate = dynamic/)
  assert.match(canvas, /gl\.shadowMap\.needsUpdate = true/)
  assert.match(canvas, /useProgress\.subscribe\(\(state, previousState\) =>/)
  assert.match(canvas, /window\.performance\.now\(\) < shadowRefreshUntilRef\.current/)
  assert.doesNotMatch(canvas, /useProgress\.getState\(\)\.active/)
  assert.match(canvas, /name=\{`interaction-proxy:\$\{asset\.id\}`\}/)
  assert.match(canvas, /onPointerEnter=\{!editingLayout && \(proxyCalloutId \|\| isVintageTelevision\)/)
  assert.doesNotMatch(canvas, /interactionTargetsRef|intersectObjects\(/)
  assert.match(canvas, /antialias: false/)
  assert.match(canvas, /toneMappingExposure = studioLighting\.exposure/)
  assert.match(canvas, /onClick=\{editingLayout \? \(event\) => \{/)
  assert.doesNotMatch(canvas, /<Preload all \/>/)

  assert.equal((lighting.match(/\bcastShadow(?=\s|>)/g) ?? []).length, 1)
  assert.match(lighting, /intensity=\{0\.42 \* globalIntensity \* ambientIntensity\}/)
  assert.match(lighting, /args=\{\['#4d5b61', '#251516'\]\}[\s\S]{0,100}intensity=\{0\.58 \* globalIntensity \* ambientIntensity\}/)
  assert.match(lighting, /color="#9f978c"[\s\S]{0,100}intensity=\{0\.56 \* globalIntensity\}/)
  assert.doesNotMatch(lighting, /shadow-mapSize-(?:width|height)=\{2048\}/)
  assert.match(effects, /blur=\{false\}/)
  assert.match(effects, /levels=\{5\}/)
  assert.equal((effects.match(/resolutionScale=\{0\.5\}/g) ?? []).length, 2)
  assert.match(effects, /brightness=\{detailMode \? 0\.025 : 0\.03\}/)
  assert.match(effects, /darkness=\{detailMode \? 0\.22 : 0\.34\}/)
  assert.match(effects, /<Outline/)
  assert.doesNotMatch(effects, /outlineEnabled/)
  assert.equal((relics.match(/<pointLight/g) ?? []).length, 0)
  assert.match(relics, /const relicProxyRaycast: Mesh\['raycast'\]/)
  assert.match(relics, /raycast=\{pointerEnabled \? relicProxyRaycast : ignoreRaycast\}/)
  assert.match(relics, /relicHitRadius/)
  assert.doesNotMatch(detail, /useGLTF\.preload\(PARCHMENT_SRC\)/)
  assert.match(detail, /const placementLockedRef = useRef\(false\)/)
  assert.match(detail, /if \(entranceCompleteRef\.current\) return/)
  assert.match(detail, /if \(!entrance \|\| entranceCompleteRef\.current\) return/)

  assert.match(candles, /useGLTF\(STATIC_CANDLE_MODEL_URLS\)/)
  assert.match(candles, /class CandleModelsErrorBoundary extends Component/)
  assert.match(candles, /static getDerivedStateFromError\(\): CandleModelsBoundaryState/)
  assert.match(candles, /if \(this\.hasWarned\) return/)
  assert.match(
    candles,
    /console\.warn\(\s*'\[深渊工作室\] 无法加载蜡烛模型，已跳过模型并保留程序化火焰。'/,
  )
  assert.match(
    candles,
    /<CandleModelsErrorBoundary>\s*<Suspense fallback=\{null\}>\s*<CandleModels \/>\s*<\/Suspense>\s*<\/CandleModelsErrorBoundary>\s*<CandleFlames active=\{active\} \/>/,
  )
  assert.equal((candles.match(/<instancedMesh/g) ?? []).length, 2)
  assert.doesNotMatch(candles, /cloneMaterial/)

  assert.match(callout, /window\.setTimeout\(\(\) => setRetainedTarget\(null\), 360\)/)
  assert.match(callout, /calculatePosition=\{calculateCalloutPosition\}/)
  assert.doesNotMatch(callout, /calculatePosition=\{\(_, __, size\) => \[/)

  assert.match(app, /const studioSceneCopy = useMemo\(/)
  assert.match(app, /studioCopy=\{studioSceneCopy\}/)
  assert.match(
    app,
    /renderPaused=\{dreamArchiveOpen \|\| grimoireMemoryOpen \|\| televisionTransmissionOpen \|\| mystery\.state\.view\.kind === 'finale'\}/,
  )
})
