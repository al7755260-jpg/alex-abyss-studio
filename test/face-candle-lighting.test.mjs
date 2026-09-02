import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  FACE_CANDLE_LIGHT,
  faceCandleIntensity,
} from '../src/scene/faceCandleLighting.ts'

const FACE_PROBES = [
  [-1.97, 5.37, 3.19],
  [-1.86, 3.89, 3.16],
  [-1.2, 2.65, 3.55],
  [-1.1, 4.58, 3.2],
]

const CAVITY_GUARDS = [
  [-4.02, 4.84, -3.55],
  [-3.53, 3.3, -5.78],
  [-2.2, 0.94, -7.07],
  [-3.67, 3.23, -0.96],
]

function subtract(a, b) {
  return a.map((value, index) => value - b[index])
}

function length(vector) {
  return Math.hypot(...vector)
}

function normalized(vector) {
  const magnitude = length(vector)
  return vector.map((value) => value / magnitude)
}

function angleBetween(a, b) {
  const unitA = normalized(a)
  const unitB = normalized(b)
  const dot = unitA.reduce((sum, value, index) => sum + value * unitB[index], 0)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

function receivesFaceCandle(point) {
  const fromLight = subtract(point, FACE_CANDLE_LIGHT.position)
  const lightDirection = subtract(FACE_CANDLE_LIGHT.target, FACE_CANDLE_LIGHT.position)
  return length(fromLight) <= FACE_CANDLE_LIGHT.distance &&
    angleBetween(fromLight, lightDirection) <= FACE_CANDLE_LIGHT.angle
}

test('局部烛光锥覆盖完整外脸且在到达脑腔前截止', () => {
  assert.ok(FACE_PROBES.every(receivesFaceCandle))
  assert.ok(CAVITY_GUARDS.every((point) => !receivesFaceCandle(point)))

  const nearestCavityDistance = Math.min(
    ...CAVITY_GUARDS.map((point) => length(subtract(point, FACE_CANDLE_LIGHT.position))),
  )
  assert.ok(nearestCavityDistance - FACE_CANDLE_LIGHT.distance >= 0.8)
})

test('烛火闪烁平滑、克制且完全确定', () => {
  const samples = Array.from({ length: 601 }, (_, index) =>
    faceCandleIntensity(index / 60),
  )
  const base = FACE_CANDLE_LIGHT.baseIntensity
  assert.ok(Math.min(...samples) >= base * 0.9)
  assert.ok(Math.max(...samples) <= base * 1.1)

  const maxFrameDelta = Math.max(
    ...samples.slice(1).map((value, index) => Math.abs(value - samples[index])),
  )
  assert.ok(maxFrameDelta <= base * 0.015)
  assert.equal(faceCandleIntensity(2.75), faceCandleIntensity(2.75))
})

test('外脸烛光复用既有动画循环且不创建阴影或随机噪声', async () => {
  const source = await readFile(
    new URL('../src/scene/StudioLighting.tsx', import.meta.url),
    'utf8',
  )
  const flicker = await readFile(
    new URL('../src/scene/faceCandleLighting.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /name="face-candle-reflection"/)
  assert.match(source, /castShadow=\{false\}/)
  assert.equal((source.match(/useFrame\(/g) ?? []).length, 1)
  assert.doesNotMatch(`${source}\n${flicker}`, /Math\.random/)
})
