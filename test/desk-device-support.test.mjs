import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { DESK_DEVICE_BASE_Y } from '../src/data/deskSupport.ts'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

test('机箱、显示器和键鼠的可见承托面贴合真实桌面', () => {
  const contact = {
    monitor: {
      baseY: DESK_DEVICE_BASE_Y.monitor,
      broadSupportOffset: 0.0047,
      deskSupportY: 1.80207,
    },
    computer: {
      baseY: DESK_DEVICE_BASE_Y.computer,
      broadSupportOffset: 0,
      deskSupportY: 1.80064,
    },
    keyboard: {
      baseY: DESK_DEVICE_BASE_Y.keyboard,
      broadSupportOffset: 0.00534,
      deskSupportY: 1.79957,
    },
  }

  for (const [label, measurement] of Object.entries(contact)) {
    const clearance = measurement.baseY
      + measurement.broadSupportOffset
      - measurement.deskSupportY

    assert.ok(
      clearance >= 0 && clearance <= 0.001,
      `${label} broad support must sit within 1mm above the measured desk surface`,
    )
  }
})

test('三件设备保留既有布局，并将键鼠完整收回桌面范围', async () => {
  const assets = await source('../src/data/studioAssets.ts')

  assert.match(
    assets,
    /id: 'watching-monitor'[\s\S]{0,220}position: \[-0\.46, DESK_DEVICE_BASE_Y\.monitor, -1\.54\]/,
  )
  assert.match(
    assets,
    /id: 'reliquary-computer'[\s\S]{0,220}position: \[0\.8, DESK_DEVICE_BASE_Y\.computer, -1\.34\][\s\S]{0,80}rotation: \[0, -Math\.PI \/ 2, 0\]/,
  )
  assert.match(
    assets,
    /id: 'eldritch-keyboard'[\s\S]{0,220}position: \[-0\.2, DESK_DEVICE_BASE_Y\.keyboard, -0\.86\]/,
  )
})

test('设备依附内容跟随新的承托高度且仍使用模型真实最低点对齐', async () => {
  const [assetSlot, candles, hiddenRelics, finalTarget] = await Promise.all([
    source('../src/scene/AssetSlot.tsx'),
    source('../src/scene/CandleSet.tsx'),
    source('../src/scene/HiddenRelics.tsx'),
    source('../src/data/hiddenRelics.ts'),
  ])

  assert.match(assetSlot, /offset: \[-center\.x, -bounds\.min\.y, -center\.z\]/)
  assert.match(
    candles,
    /position: \[0\.8, DESK_DEVICE_BASE_Y\.computer \+ 0\.86, -1\.34\]/,
  )
  assert.match(hiddenRelics, /position = FINAL_MONITOR_TARGET\.position/)
  assert.match(hiddenRelics, /<group position=\{position\}>/)
  assert.match(
    finalTarget,
    /DESK_DEVICE_BASE_Y\.monitor \+ 0\.58/,
  )
})
