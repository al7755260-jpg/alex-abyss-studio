import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampStudioLightingValue,
  cloneStudioLighting,
  DEFAULT_STUDIO_LIGHTING,
  loadStudioLighting,
  sanitizeStudioLighting,
  saveStudioLighting,
  STUDIO_LIGHTING_FIELDS,
  STUDIO_LIGHTING_LIMITS,
  STUDIO_LIGHTING_STORAGE_KEY,
  studioLightingEqual,
  updateStudioLighting,
} from '../src/editor/studioLighting.ts'

const createMemoryStorage = () => {
  const entries = new Map()
  return {
    entries,
    getItem(key) {
      return entries.get(key) ?? null
    },
    setItem(key, value) {
      entries.set(key, value)
    },
  }
}

test('默认光照使用版本化键、固定 schema 与独立副本', () => {
  assert.equal(STUDIO_LIGHTING_STORAGE_KEY, 'alex-abyss-studio:lighting:v1')
  assert.deepEqual(STUDIO_LIGHTING_FIELDS, [
    'globalIntensity',
    'ambientIntensity',
    'exposure',
  ])
  assert.deepEqual(DEFAULT_STUDIO_LIGHTING, {
    globalIntensity: 1,
    ambientIntensity: 1,
    exposure: 1.08,
  })
  assert.deepEqual(STUDIO_LIGHTING_LIMITS, {
    globalIntensity: { min: 0, max: 2, step: 0.01 },
    ambientIntensity: { min: 0, max: 2, step: 0.01 },
    exposure: { min: 0.35, max: 1.8, step: 0.01 },
  })

  const first = cloneStudioLighting(DEFAULT_STUDIO_LIGHTING)
  const second = cloneStudioLighting(DEFAULT_STUDIO_LIGHTING)
  assert.notEqual(first, second)
  first.globalIntensity = 0
  assert.equal(second.globalIntensity, 1)
  assert.equal(DEFAULT_STUDIO_LIGHTING.globalIntensity, 1)
})

test('严格投影已存数据，忽略未知键并按字段回退、clamp 与规整小数', () => {
  const storage = createMemoryStorage()
  storage.entries.set(STUDIO_LIGHTING_STORAGE_KEY, JSON.stringify({
    globalIntensity: 9,
    ambientIntensity: 'invalid',
    exposure: 0.123,
    unknownLighting: 42,
  }))

  const restored = loadStudioLighting(storage)
  assert.deepEqual(restored, {
    globalIntensity: 2,
    ambientIntensity: 1,
    exposure: 0.35,
  })
  assert.deepEqual(Object.keys(restored), STUDIO_LIGHTING_FIELDS)
  assert.equal(Object.hasOwn(restored, 'unknownLighting'), false)

  assert.deepEqual(sanitizeStudioLighting({
    globalIntensity: 1.236,
    ambientIntensity: -0.2,
    exposure: 1.799,
  }), {
    globalIntensity: 1.24,
    ambientIntensity: 0,
    exposure: 1.8,
  })
})

test('缺失存储、坏 JSON 与读取异常安全回退到新的默认副本', () => {
  const storage = createMemoryStorage()
  const absent = loadStudioLighting(storage)
  assert.deepEqual(absent, DEFAULT_STUDIO_LIGHTING)
  assert.notEqual(absent, DEFAULT_STUDIO_LIGHTING)

  storage.entries.set(STUDIO_LIGHTING_STORAGE_KEY, '{bad json')
  const malformed = loadStudioLighting(storage)
  assert.deepEqual(malformed, DEFAULT_STUDIO_LIGHTING)
  assert.notEqual(malformed, absent)

  const throwingStorage = {
    getItem() {
      throw new Error('blocked')
    },
  }
  assert.deepEqual(loadStudioLighting(throwingStorage), DEFAULT_STUDIO_LIGHTING)
  assert.deepEqual(loadStudioLighting(null), DEFAULT_STUDIO_LIGHTING)
})

test('保存只写固定 schema，数值会 clamp 并规整到两位小数', () => {
  const storage = createMemoryStorage()
  const source = {
    globalIntensity: 2.718,
    ambientIntensity: -1,
    exposure: 1.234,
    unknownLighting: 99,
  }

  assert.equal(saveStudioLighting(storage, source), true)
  assert.deepEqual(
    JSON.parse(storage.entries.get(STUDIO_LIGHTING_STORAGE_KEY)),
    {
      globalIntensity: 2,
      ambientIntensity: 0,
      exposure: 1.23,
    },
  )
  assert.deepEqual(source, {
    globalIntensity: 2.718,
    ambientIntensity: -1,
    exposure: 1.234,
    unknownLighting: 99,
  })
})

test('保存遇到不完整、非有限数值或存储异常时返回 false 且不抛出', () => {
  const storage = createMemoryStorage()

  assert.equal(saveStudioLighting(storage, {
    globalIntensity: 1,
    ambientIntensity: 1,
  }), false)
  assert.equal(saveStudioLighting(storage, {
    globalIntensity: Number.NaN,
    ambientIntensity: 1,
    exposure: 1.08,
  }), false)
  assert.equal(saveStudioLighting(null, DEFAULT_STUDIO_LIGHTING), false)
  assert.equal(storage.entries.size, 0)

  assert.equal(saveStudioLighting({
    setItem() {
      throw new Error('quota')
    },
  }, DEFAULT_STUDIO_LIGHTING), false)
})

test('字段更新不可变、严格限制字段和值，等值更新保留原引用', () => {
  const defaults = cloneStudioLighting(DEFAULT_STUDIO_LIGHTING)
  const brighter = updateStudioLighting(defaults, 'globalIntensity', 1.236)

  assert.notEqual(brighter, defaults)
  assert.deepEqual(defaults, DEFAULT_STUDIO_LIGHTING)
  assert.equal(brighter.globalIntensity, 1.24)
  assert.equal(updateStudioLighting(brighter, 'globalIntensity', 1.24), brighter)

  const clamped = updateStudioLighting(brighter, 'exposure', 99)
  assert.equal(clamped.exposure, 1.8)
  assert.equal(updateStudioLighting(clamped, 'unknownField', 1), clamped)
  assert.equal(updateStudioLighting(clamped, 'ambientIntensity', Number.POSITIVE_INFINITY), clamped)
  assert.equal(updateStudioLighting(clamped, 'ambientIntensity', '1.5'), clamped)
})

test('字段 clamp 与设置相等比较覆盖三个独立通道', () => {
  assert.equal(clampStudioLightingValue('globalIntensity', -1), 0)
  assert.equal(clampStudioLightingValue('ambientIntensity', 4), 2)
  assert.equal(clampStudioLightingValue('exposure', 0), 0.35)

  const left = cloneStudioLighting(DEFAULT_STUDIO_LIGHTING)
  const right = cloneStudioLighting(DEFAULT_STUDIO_LIGHTING)
  assert.equal(studioLightingEqual(left, right), true)
  right.ambientIntensity = 0.75
  assert.equal(studioLightingEqual(left, right), false)
})
