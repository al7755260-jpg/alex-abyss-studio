import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearHologramDisplay, finishHologramExit, HologramPlayback,
  hologramPortraitProgress, hologramSegmentProgress,
  INITIAL_HOLOGRAM_DISPLAY, toggleHologramDisplay,
} from '../src/scene/hologramPlayback.ts'

const segments = (elapsed, reduced = false) => [0, 1, 2].map((index) => hologramSegmentProgress(elapsed, index, reduced))
const closeTo = (actual, expected) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9))

test('三点激光按mask→bust→lamp→mask依次生长，下一段不提前出现', () => {
  closeTo(segments(0), [0, 0, 0])
  closeTo(segments(.225), [.5, 0, 0])
  closeTo(segments(.45), [1, 0, 0])
  closeTo(segments(.675), [1, .5, 0])
  closeTo(segments(.9), [1, 1, 0])
  closeTo(segments(1.125), [1, 1, .5])
  closeTo(segments(1.35), [1, 1, 1])
})

test('头像等三角闭合后显现，最终完整显示，不在循环中再次截断', () => {
  for (const elapsed of [0, .45, .9, 1.35]) assert.equal(hologramPortraitProgress(elapsed), 0)
  assert.ok(Math.abs(hologramPortraitProgress(1.7) - .5) < 1e-9)
  for (const elapsed of [2.06, 10, 300]) assert.equal(hologramPortraitProgress(elapsed), 1)
})

test('减弱动态偏好直接显示完整三角和头像；重新挂载从时间0开始', () => {
  assert.deepEqual(segments(0, true), [1, 1, 1])
  assert.equal(hologramPortraitProgress(0, true), 1)
  assert.deepEqual(segments(0), [0, 0, 0])
  assert.equal(hologramPortraitProgress(0), 0)
})

test('关闭先消散头像，再逆序收回3→2→1，最后源光淡灭', () => {
  const playback = new HologramPlayback()
  playback.advance(10, true)
  playback.advance(.28, false)
  assert.ok(Math.abs(hologramPortraitProgress(playback.cursor) - .5) < 1e-9)
  closeTo(segments(playback.cursor), [1, 1, 1])
  playback.advance(.28 + .18, false)
  assert.equal(hologramPortraitProgress(playback.cursor), 0)
  closeTo(segments(playback.cursor), [1, 1, .5])
  playback.advance(.36, false)
  closeTo(segments(playback.cursor), [1, .5, 0])
  playback.advance(.36, false)
  closeTo(segments(playback.cursor), [.5, 0, 0])
  playback.advance(.18 + .072, false)
  closeTo(segments(playback.cursor), [0, 0, 0])
  assert.ok(Math.abs(playback.sourceOpacity - .5) < 1e-9)
  assert.equal(playback.hidden, false)
  playback.advance(.08, false)
  assert.equal(playback.sourceOpacity, 0)
  assert.equal(playback.hidden, true)
})

test('中途关闭和立即重开沿当前进度反转，不跳回开头或直接完成', () => {
  const playback = new HologramPlayback()
  playback.advance(.8, true)
  const before = playback.cursor
  playback.advance(0, false)
  assert.equal(playback.cursor, before)
  playback.advance(.1, false)
  assert.ok(Math.abs(playback.cursor - (before - .125)) < 1e-9)
  const reversing = playback.cursor
  playback.advance(0, true)
  assert.equal(playback.cursor, reversing)
  playback.advance(.1, true)
  assert.ok(Math.abs(playback.cursor - (reversing + .1)) < 1e-9)
  assert.ok(playback.cursor < before)
})

test('长时间保持开启不累积退场等待；大步长与逐帧退出一致', () => {
  const playback = new HologramPlayback(), stepped = new HologramPlayback()
  playback.advance(3600, true)
  stepped.advance(3, true)
  playback.advance(1.8, false)
  for (let i = 0; i < 180; i++) stepped.advance(.01, false)
  assert.equal(playback.hidden, true)
  assert.equal(stepped.hidden, true)
  assert.equal(playback.cursor, stepped.cursor)
  assert.equal(new HologramPlayback().hidden, true)
})

test('退出期间组件保持挂载，结束后卸载，陈旧回调不能关闭新一轮', () => {
  let state = toggleHologramDisplay(INITIAL_HOLOGRAM_DISPLAY)
  state = toggleHologramDisplay(state)
  const closingSession = state.session
  assert.equal(state.active, false)
  assert.equal(state.mounted, true)
  const reopened = toggleHologramDisplay(state)
  assert.equal(finishHologramExit(reopened, closingSession), reopened)
  const closingAgain = toggleHologramDisplay(reopened)
  assert.equal(finishHologramExit(closingAgain, closingSession), closingAgain)
  const complete = finishHologramExit(closingAgain, closingAgain.session)
  assert.equal(complete.mounted, false)
  const edited = clearHologramDisplay(reopened)
  assert.equal(edited.active, false)
  assert.equal(edited.mounted, false)
  assert.ok(edited.session > reopened.session)
})

test('减弱动态采用整体淡入淡出，透明度仍连续且不闪灭', () => {
  const playback = new HologramPlayback()
  playback.advance(3, true)
  assert.equal(playback.reducedMotionOpacity, 1)
  playback.advance(.2, false)
  assert.ok(playback.reducedMotionOpacity > 0 && playback.reducedMotionOpacity < 1)
  playback.advance(2, false)
  assert.equal(playback.reducedMotionOpacity, 0)
})
