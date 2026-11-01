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





test('详情页不再生成会与遗物穿模的圆形底座', async () => {
  const scene = await readFile(projectFile('src/scene/ArtifactDetailScene.tsx'), 'utf8')

  assert.doesNotMatch(scene, /<circleGeometry\b/i)
})
