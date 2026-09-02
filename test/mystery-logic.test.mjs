import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import test from 'node:test'

import {
  hasFoundAllRelics,
  INITIAL_MYSTERY_STATE,
  mysteryReducer,
  sanitizeFoundRelicIds,
} from '../src/game/mysteryState.ts'
import { HIDDEN_RELICS } from '../src/data/hiddenRelics.ts'

test('六件不同遗物逐件归档，第六件解锁终局且重复收录幂等', () => {
  const ids = [
    'tide-index-seal',
    'deviant-iris-wheel',
    'drowned-dream-core',
    'fingerprint-casket',
    'voice-hyoid',
    'spinal-clasp',
  ]
  let state = INITIAL_MYSTERY_STATE
  for (const relicId of ids) {
    state = mysteryReducer(state, { type: 'OPEN_RELIC', relicId })
    state = mysteryReducer(state, { type: 'RETURN_TO_STUDIO' })
  }
  assert.equal(state.foundRelicIds.length, 6)
  assert.equal(hasFoundAllRelics(state), true)

  const repeated = mysteryReducer(state, {
    type: 'OPEN_RELIC',
    relicId: 'spinal-clasp',
  })
  assert.equal(repeated.foundRelicIds.length, 6)

  const finale = mysteryReducer(repeated, { type: 'OPEN_FINALE' })
  assert.deepEqual(finale.view, { kind: 'finale' })
})

test('终局在遗物未齐时保持锁定', () => {
  assert.equal(
    mysteryReducer(INITIAL_MYSTERY_STATE, { type: 'OPEN_FINALE' }),
    INITIAL_MYSTERY_STATE,
  )
  assert.equal(
    mysteryReducer(INITIAL_MYSTERY_STATE, { type: 'COMPLETE_FINALE' }),
    INITIAL_MYSTERY_STATE,
  )
})

test('存档恢复会过滤未知ID并去重', () => {
  assert.deepEqual(
    sanitizeFoundRelicIds([
      'tide-index-seal',
      'unknown',
      'tide-index-seal',
      'spinal-clasp',
    ]),
    ['tide-index-seal', 'spinal-clasp'],
  )
})

test('通关后重置会清空六件遗物、终局状态并返回初始书房', () => {
  const completed = {
    foundRelicIds: [
      'tide-index-seal',
      'deviant-iris-wheel',
      'drowned-dream-core',
      'fingerprint-casket',
      'voice-hyoid',
      'spinal-clasp',
    ],
    view: { kind: 'finale' },
    endingCompleted: true,
    lastFoundRelicId: 'spinal-clasp',
  }

  assert.deepEqual(
    mysteryReducer(completed, { type: 'RESET_GAME' }),
    INITIAL_MYSTERY_STATE,
  )
})

test('六件遗物都具有长篇连续故事和详情页LUX3D模型地址', async () => {
  const source = await readFile(
    new URL('../src/data/hiddenRelics.ts', import.meta.url),
    'utf8',
  )
  assert.equal((source.match(/story: '/g) ?? []).length, 6)
  assert.equal((source.match(/-optimized\.glb/g) ?? []).length, 6)
  assert.match(source, /ALEXLI\.echo/)
})

test('书房场景只渲染提示光点、不加载遗物GLB并保留鼠标命中入口', async () => {
  const source = await readFile(
    new URL('../src/scene/HiddenRelics.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /function RelicHintLight/)
  assert.match(source, /const hitPosition = hitPositions\?\.get\(relic\.id\) \?\? relic\.hitPosition/)
  assert.match(source, /position=\{hitPosition\}/)
  assert.match(
    source,
    /if \(found\.has\(relic\.id\) \|\| suppressed\.has\(relic\.id\)\) return null/,
  )
  assert.doesNotMatch(source, /discovered=\{discovered\}/)
  assert.match(source, /<group ref=\{groupRef\}>/)
  assert.equal((source.match(/raycast=\{ignoreRaycast\}/g) ?? []).length, 2)
  assert.match(source, /raycast=\{pointerEnabled \? relicProxyRaycast : ignoreRaycast\}/)
  assert.match(source, /onClick=\{pointerEnabled \? \(event\) =>/)
  assert.match(source, /event\.delta <= 10/)
  assert.match(source, /onOpenRelic\(relic\.id\)/)
  assert.doesNotMatch(source, /RelicModel|RelicLoadBoundary|useGLTF|Suspense/)
  assert.doesNotMatch(source, /relic\.src|relic\.position/)
})

test('遗物鼠标命中半径按类型设定，光点、数据半径和镜头推进距离不变', async () => {
  const [hints, canvas] = await Promise.all([
    readFile(new URL('../src/scene/HiddenRelics.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/scene/StudioCanvas.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(hints, /const RELIC_ACTIVATION_RADIUS_SCALE = 2/)
  assert.match(hints, /import \{ LAMP_RELIC_APERTURE_RADIUS \} from '\.\/lampGlow'/)
  assert.match(hints, /const isDrownedDreamCore = relic\.id === 'drowned-dream-core'/)
  assert.match(
    hints,
    /const activationRadiusScale = isFingerprintCasket[\s\S]{0,80}\? 0\.75[\s\S]{0,100}: isDrownedDreamCore[\s\S]{0,100}\? LAMP_RELIC_APERTURE_RADIUS \/ relic\.hitRadius[\s\S]{0,80}: RELIC_ACTIVATION_RADIUS_SCALE/,
  )
  assert.match(
    hints,
    /args=\{\[relic\.hitRadius \* activationRadiusScale, 18, 12\]\}/,
  )
  assert.match(hints, /args=\{\[0\.055, 14, 10\]\}/)
  assert.match(hints, /args=\{\[0\.021, 14, 10\]\}/)

  assert.deepEqual(
    HIDDEN_RELICS.map(({ id, hitRadius }) => [id, hitRadius]),
    [
      ['tide-index-seal', 0.22],
      ['deviant-iris-wheel', 0.27],
      ['drowned-dream-core', 0.3],
      ['fingerprint-casket', 0.24],
      ['voice-hyoid', 0.2],
      ['spinal-clasp', 0.26],
    ],
  )
  assert.match(
    canvas,
    /MathUtils\.clamp\(1\.68 \+ relic\.hitRadius \* 1\.3, 1\.9, 2\.1\)/,
  )
})

test('六个遗物提示点贴近宿主表面且收录后不再渲染', async () => {
  const [relics, hints] = await Promise.all([
    readFile(new URL('../src/data/hiddenRelics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/scene/HiddenRelics.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(
    relics,
    /id: 'tide-index-seal'[\s\S]*?hitPosition: \[-0\.573, 1\.397, -2\.719\]/,
  )
  assert.match(
    relics,
    /id: 'deviant-iris-wheel'[\s\S]*?hitPosition: \[-0\.196, 3\.481, -2\.534\]/,
  )
  assert.match(
    relics,
    /id: 'voice-hyoid'[\s\S]*?hitPosition: \[0\.998, 1\.917, -2\.616\]/,
  )
  assert.match(
    relics,
    /id: 'spinal-clasp'[\s\S]*?hitPosition: \[-0\.55, 0\.854, 0\.911\]/,
  )
  assert.match(
    hints,
    /if \(found\.has\(relic\.id\) \|\| suppressed\.has\(relic\.id\)\) return null/,
  )
})

test('详情页使用的六件LUX3D浏览器模型均已落盘且不是空壳', async () => {
  const modelDirectory = new URL('../public/models/hidden-relics/', import.meta.url)
  const files = (await readdir(modelDirectory))
    .filter((name) => name.endsWith('-optimized.glb'))
    .sort()
  assert.equal(files.length, 6)
  for (const file of files) {
    const info = await stat(new URL(file, modelDirectory))
    assert.ok(info.size > 500_000, `${file} should contain a complete Lux3D model`)
  }
})
