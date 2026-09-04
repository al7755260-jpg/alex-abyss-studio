import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  DETAIL_INITIAL_CAMERA_DISTANCE,
  detailLightOffsetScale,
} from '../src/scene/artifactDetailLayout.ts'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

function normalize([x, y, z]) {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

test('主场景与遗物详情不使用会随相机距离压黑画面的视深度雾', async () => {
  const [studio, detail] = await Promise.all([
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
    readFile(projectFile('src/scene/ArtifactDetailScene.tsx'), 'utf8'),
  ])

  assert.doesNotMatch(studio, /<fog\b/)
  assert.doesNotMatch(detail, /<fog\b/)
})

test('遗物详情主光在近中远缩放下保持相同的相机空间方向', () => {
  const referenceDirection = normalize([-1.35, 0.85, -DETAIL_INITIAL_CAMERA_DISTANCE])

  for (const cameraDistance of [2.75, DETAIL_INITIAL_CAMERA_DISTANCE, 30]) {
    const scale = detailLightOffsetScale(cameraDistance)
    const direction = normalize([
      -1.35 * scale,
      0.85 * scale,
      -cameraDistance,
    ])

    assert.ok(
      dot(referenceDirection, direction) > 0.999999,
      `key light direction changed at camera distance ${cameraDistance}`,
    )
  }
})

test('详情灯光实现按相机距离等比缩放横纵偏移', async () => {
  const detail = await readFile(
    projectFile('src/scene/ArtifactDetailScene.tsx'),
    'utf8',
  )

  assert.match(detail, /detailLightOffsetScale\([\s\S]{0,100}camera\.position\.distanceTo\(centerRef\.current\)/)
  assert.match(detail, /addScaledVector\(right, -1\.35 \* distanceScale\)/)
  assert.match(detail, /addScaledVector\(up, 0\.85 \* distanceScale\)/)
  assert.match(detail, /addScaledVector\(right, 1\.5 \* distanceScale\)/)
  assert.match(detail, /addScaledVector\(up, -0\.2 \* distanceScale\)/)
})
