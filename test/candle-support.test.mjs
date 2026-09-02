import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

test('书柜顶烛台落在中央木质承托台而不是外包围盒最高点', async () => {
  const [support, assets, candles] = await Promise.all([
    source('../src/data/candleSupport.ts'),
    source('../src/data/studioAssets.ts'),
    source('../src/scene/CandleSet.tsx'),
  ])

  const ledgeHeight = Number(
    support.match(/BOOKCASE_CENTER_LEDGE_Y = ([\d.]+)/)?.[1],
  )

  assert.equal(ledgeHeight, 2.3065)
  assert.match(
    assets,
    /id: 'floor-left-candelabra'[\s\S]{0,420}position: \[-0\.8, BOOKCASE_CENTER_LEDGE_Y, -2\.8\]/,
  )
  assert.doesNotMatch(
    candles,
    /const CANDLE_PLACEMENTS[\s\S]{0,2500}id: 'floor-left-candelabra'/,
  )
  assert.match(candles, /FLAME_LAYOUTS\.candelabra\.map/)
  assert.match(candles, /name="editable-candelabra-flames"/)
  assert.ok(
    2.5 - ledgeHeight > 0.19 && 2.5 - ledgeHeight < 0.2,
    'candelabra should be lowered from the bookcase crest to its central ledge',
  )
})

test('前排地面蜡烛沿仪式地毯安全弧线排布且完整高于承托面', async () => {
  const candles = await source('../src/scene/CandleSet.tsx')
  const floorBaseY = Number(
    candles.match(/const FLOOR_CANDLE_BASE_Y = ([-\d.]+)/)?.[1],
  )
  const rugTopY = 0.018 + (0.1 + 0.08) * 0.045
  const rugCenter = [-0.1, 0.65]
  const rugRadii = [0.49 * 4.25, 0.49 * 3.2]
  const placements = [
    ['floor-left-pillar', -0.88, 1.92],
    ['floor-center-left-pillar', -0.62, 1.74],
    ['floor-right-pillar', -0.2, 1.78],
    ['floor-far-right-pillar', 0.22, 1.65],
    ['floor-far-right-back-pillar', 0.5, 1.36],
  ]

  assert.ok(floorBaseY >= rugTopY)
  assert.ok(floorBaseY - rugTopY <= 0.006)

  for (const [id, x, z] of placements) {
    assert.match(
      candles,
      new RegExp(`id: '${id}'[\\s\\S]{0,150}position: \\[${x}, FLOOR_CANDLE_BASE_Y, ${z}\\]`),
    )
    const normalizedDistance =
      ((x - rugCenter[0]) / rugRadii[0]) ** 2 +
      ((z - rugCenter[1]) / rugRadii[1]) ** 2
    assert.ok(
      normalizedDistance < 0.85,
      `${id} should retain a full-base safety margin inside the rug`,
    )
  }

  assert.match(
    candles,
    /id: 'floor-back-right-cluster'[\s\S]{0,150}position: \[1\.45, -0\.018, -1\.7\]/,
  )
})
