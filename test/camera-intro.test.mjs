import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  CAMERA_INTRO_HOLD_SECONDS,
  CAMERA_INTRO_TOTAL_SECONDS,
  cameraIntroPhase,
  cameraIntroProgress,
  shortestAngleDelta,
} from '../src/scene/cameraIntro.ts'

test('开场先停留侧脸，再平滑环绕到脑腔终点', () => {
  assert.equal(cameraIntroProgress(0), 0)
  assert.equal(cameraIntroProgress(CAMERA_INTRO_HOLD_SECONDS), 0)
  assert.equal(cameraIntroProgress(CAMERA_INTRO_TOTAL_SECONDS), 1)
  assert.equal(cameraIntroPhase(0), 'holding')
  assert.equal(cameraIntroPhase(CAMERA_INTRO_HOLD_SECONDS + 0.01), 'orbiting')
  assert.equal(cameraIntroPhase(CAMERA_INTRO_TOTAL_SECONDS), 'complete')

  const midpoint = (
    CAMERA_INTRO_HOLD_SECONDS +
    (CAMERA_INTRO_TOTAL_SECONDS - CAMERA_INTRO_HOLD_SECONDS) / 2
  )
  assert.ok(Math.abs(cameraIntroProgress(midpoint) - 0.5) < 1e-12)
})

test('开场轨迹单调且与帧率无关', () => {
  for (const fps of [30, 60, 144]) {
    let previous = 0
    for (let frame = 0; frame <= Math.ceil(CAMERA_INTRO_TOTAL_SECONDS * fps); frame += 1) {
      const progress = cameraIntroProgress(frame / fps)
      assert.ok(progress >= previous - 1e-12)
      assert.ok(progress >= 0 && progress <= 1)
      previous = progress
    }
  }
  assert.equal(cameraIntroProgress(1.75), cameraIntroProgress(1.75))
})

test('方位角始终沿最短方向环绕', () => {
  const degrees = (value) => value * 180 / Math.PI
  assert.ok(Math.abs(degrees(shortestAngleDelta(179 * Math.PI / 180, -179 * Math.PI / 180)) - 2) < 1e-9)
  assert.ok(Math.abs(degrees(shortestAngleDelta(-179 * Math.PI / 180, 179 * Math.PI / 180)) + 2) < 1e-9)
})

test('减少动态效果时首帧直接落到终点', () => {
  assert.equal(cameraIntroProgress(0, true), 1)
  assert.equal(cameraIntroPhase(0, true), 'complete')
})

test('开场相机等待场景、支持用户打断且首次挂载不被重置覆盖', async () => {
  const [canvas, app] = await Promise.all([
    readFile(new URL('../src/scene/StudioCanvas.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(canvas, /kind: 'intro'; phase: 'waiting'/)
  assert.match(canvas, /function CameraIntroReady/)
  assert.match(canvas, /function CameraTransitionDriver/)
  assert.match(canvas, /INTRO_CAMERA_POSITION = \[-9\.560432, 5\.57, 16\.011449\]/)
  assert.match(canvas, /cameraReturnRef\.current = null[\s\S]{0,220}nativePointerActiveRef\.current = true/)
  assert.match(canvas, /if \(nativePointerActiveRef\.current\) return/)
  assert.match(canvas, /onEnd=\{\(\) => \{[\s\S]{0,80}nativePointerActiveRef\.current = false/)
  assert.match(canvas, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(app, /previousViewKindRef|mystery\.state/)
})
