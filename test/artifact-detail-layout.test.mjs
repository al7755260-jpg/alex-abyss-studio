import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  DETAIL_CENTER,
  DETAIL_INITIAL_CAMERA_DISTANCE,
  DETAIL_PARCHMENT_SAFE_HEIGHT_RATIO,
  DETAIL_PARCHMENT_SAFE_WIDTH_RATIO,
  measureArtifactDetailReferenceFraming,
  measureArtifactDetailFit,
} from '../src/scene/artifactDetailLayout.ts'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

const RELIC_SOURCE_DIMENSIONS = {
  'tide-index-seal': { x: 0.1197, y: 0.17437, z: 0.04741 },
  'deviant-iris-wheel': { x: 0.11994, y: 0.09706, z: 0.05025 },
  'drowned-dream-core': { x: 0.17967, y: 0.17759, z: 0.16414 },
  'fingerprint-casket': { x: 0.34954, y: 0.34834, z: 0.30017 },
  'voice-hyoid': { x: 0.16211, y: 0.21938, z: 0.05278 },
  'spinal-clasp': { x: 0.27877, y: 0.48758, z: 0.15965 },
}

test('六件遗物在最近缩放与任意旋转下均不穿透卷轴', () => {
  for (const [id, dimensions] of Object.entries(RELIC_SOURCE_DIMENSIONS)) {
    const fit = measureArtifactDetailFit(dimensions)
    assert.ok(
      fit.depthClearance >= 0.24,
      `${id} should keep at least 0.24 scene units of depth clearance; received ${fit.depthClearance}`,
    )
    assert.ok(
      fit.projectedWidthRatio <= DETAIL_PARCHMENT_SAFE_WIDTH_RATIO,
      `${id} should remain inside the parchment safe width at closest zoom`,
    )
    assert.ok(
      fit.projectedHeightRatio <= DETAIL_PARCHMENT_SAFE_HEIGHT_RATIO,
      `${id} should remain inside the parchment safe height at closest zoom`,
    )
  }
})

test('详情初始镜头按参考图呈现卷轴与遗物的近景占比', () => {
  const framing = measureArtifactDetailReferenceFraming(900, 613, 40)

  assert.equal(DETAIL_INITIAL_CAMERA_DISTANCE, 4.8)
  assert.deepEqual(DETAIL_CENTER, [0.36, 1.12, -1.04])
  assert.ok(
    framing.parchmentWidthRatio >= 0.55 && framing.parchmentWidthRatio <= 0.59,
    `parchment width ratio should match the reference; received ${framing.parchmentWidthRatio}`,
  )
  assert.ok(
    framing.parchmentHeightRatio >= 0.74 && framing.parchmentHeightRatio <= 0.79,
    `parchment height ratio should match the reference; received ${framing.parchmentHeightRatio}`,
  )
  assert.ok(
    framing.relicMaxAxisHeightRatio >= 0.41 && framing.relicMaxAxisHeightRatio <= 0.45,
    `relic height ratio should match the reference; received ${framing.relicMaxAxisHeightRatio}`,
  )
})

test('详情模式锁定中心缩放与平移，鼠标轨道控制服从详情最近距离', async () => {
  const source = await readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8')

  assert.match(source, /enablePan=\{!detailRelic\}/)
  assert.match(source, /enableRotate/)
  assert.match(source, /enableZoom/)
  assert.match(source, /zoomToCursor=\{!detailRelic\}/)
  assert.match(source, /minDistance=\{detailRelic \? DETAIL_MIN_CAMERA_DISTANCE : MIN_CAMERA_DISTANCE\}/)
  assert.match(source, /snapCameraToDefault\(controls\)/)
  assert.match(source, /function snapCameraToDetail\(controls: OrbitControlsHandle\)/)
  assert.match(source, /controls\.target\.set\(\.\.\.DETAIL_CENTER\)/)
  assert.match(source, /addScaledVector\(DETAIL_CAMERA_DIRECTION, DETAIL_INITIAL_CAMERA_DISTANCE\)/)
  assert.match(
    source,
    /if \(!detailRelic\) return[\s\S]{0,420}snapCameraToDetail\(controls\)/,
  )
})

test('详情页沿用全局曝光、相机侧主辅光和较弱暗角', async () => {
  const [scene, lighting, postEffects, canvas] = await Promise.all([
    readFile(projectFile('src/scene/ArtifactDetailScene.tsx'), 'utf8'),
    readFile(projectFile('src/scene/StudioLighting.tsx'), 'utf8'),
    readFile(projectFile('src/scene/PostEffects.tsx'), 'utf8'),
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
  ])

  assert.match(scene, /function DetailRenderTuning/)
  assert.match(lighting, /function RendererExposureController/)
  assert.match(lighting, /gl\.toneMappingExposure = exposure/)
  assert.doesNotMatch(scene, /toneMappingExposure = 1\.08|previousExposure/)
  assert.match(scene, /directionalLight[\s\S]{0,260}intensity=\{1\.55 \* globalIntensity\}/)
  assert.match(scene, /color=\{accent\}[\s\S]{0,100}intensity=\{0\.52 \* globalIntensity\}/)
  assert.match(postEffects, /detailMode \? 0\.025 : 0\.03/)
  assert.match(postEffects, /detailMode \? 0\.22 : 0\.34/)
  assert.match(canvas, /<PostEffects[\s\S]{0,140}detailMode=\{Boolean\(detailRelic\)\}/)
})

test('详情页不再生成会与遗物穿模的圆形底座', async () => {
  const scene = await readFile(projectFile('src/scene/ArtifactDetailScene.tsx'), 'utf8')

  assert.doesNotMatch(scene, /<circleGeometry\b/i)
})
