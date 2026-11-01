import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  FINAL_MONITOR_TARGET,
  HIDDEN_RELICS,
} from '../src/data/hiddenRelics.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('历史遗物配置保留六件家具与一个终局显示器目标', () => {
  assert.equal(HIDDEN_RELICS.length, 6)
  assert.equal(new Set(HIDDEN_RELICS.map(({ hostAssetId }) => hostAssetId)).size, 6)
  assert.equal(new Set(HIDDEN_RELICS.map(({ hostLabel }) => hostLabel)).size, 6)
  assert.equal(FINAL_MONITOR_TARGET.id, 'final-monitor')
})

test('callout 使用单实例无引导线 DOM 覆盖层跟随 3D 投影且不拦截场景操作', async () => {
  const overlay = await source('src/scene/ObjectCalloutOverlay.tsx')

  assert.match(overlay, /<Html[\s\S]{0,220}fullscreen/)
  assert.match(overlay, /pointerEvents="none"/)
  assert.match(overlay, /zIndexRange=\{\[3, 3\]\}/)
  assert.match(overlay, /calculatePosition=\{calculateCalloutPosition\}/)
  assert.match(overlay, /calloutScreenCenter = \[x, y\]/)
  assert.match(overlay, /useFrame\(\(\{ camera, size \}, delta\) =>/)
  assert.match(overlay, /\.project\(camera\)/)
  assert.match(overlay, /MathUtils\.lerp/)
  assert.match(overlay, /panel\.style\.setProperty\('--callout-panel-x'/)
  assert.match(overlay, /!displayedTarget \|\| !target\) return/)
  assert.match(overlay, /if \(rendered\.panelX !== panelXValue\)/)
  assert.doesNotMatch(overlay, /<svg|<path|object-callout__linework|object-callout__anchor/)
  assert.match(overlay, /window\.setTimeout\(\(\) => setRetainedTarget\(null\), 360\)/)
})

test('遗物内部鼠标代理保留悬停隔离', async () => {
  const relics = await source('src/scene/HiddenRelics.tsx')

  assert.match(relics, /const pointerEnabled = !isFingerprintCasket \|\| fingerprintCasketAccessible/)
  assert.match(relics, /onPointerEnter=\{pointerEnabled \? \(event\) => \{[\s\S]{0,80}event\.stopPropagation\(\)[\s\S]{0,120}onHoverRelic\?\.\(relic\.id\)/)
  assert.match(relics, /onHoverChange\?\.\(true\)/)
  assert.doesNotMatch(relics, /faceFocused|interactionTargetsRef|mysteryTargetKind/)
})

test('callout 铭牌采用紧凑哥特字体、视口避让、移动端与弱动效样式', async () => {
  const [overlay, css] = await Promise.all([
    source('src/scene/ObjectCalloutOverlay.tsx'),
    source('src/styles.css'),
  ])

  assert.match(overlay, /safeTop = compact \? 94 : 118/)
  assert.match(overlay, /safeBottom = compact \? 116 : 112/)
  assert.match(overlay, /MathUtils\.clamp\([\s\S]{0,200}size\.width - safeX - panelWidth/)
  assert.match(css, /\.object-callout \{[\s\S]{0,260}pointer-events: none;/)
  assert.match(overlay, /MathUtils\.clamp\(size\.width \* 0\.17, 190, 244\)/)
  assert.match(overlay, /const panelHeight = compact \? 52 : 58/)
  assert.match(css, /\.object-callout__panel strong \{[\s\S]{0,220}font-size: clamp\(17px, 1\.45vw, 21px\);/)
  assert.match(css, /clip-path: polygon\(/)
  assert.match(css, /var\(--font-display\)/)
  assert.match(css, /\.viewer--dreaming \.object-callout/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('callout 铭牌只在最终坐标渐显，不再从左上角位移或缩放飞入', async () => {
  const css = await source('src/styles.css')
  const panelRule = css.match(/\.object-callout__panel \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const activeRule = css.match(
    /\.object-callout--active\[data-projected="true"\] \.object-callout__panel \{([\s\S]*?)\n\}/,
  )?.[1] ?? ''

  assert.match(panelRule, /opacity: 0;/)
  assert.match(panelRule, /transform: translate3d\(var\(--callout-panel-x\), var\(--callout-panel-y\), 0\);/)
  assert.match(panelRule, /transition: opacity 220ms ease;/)
  assert.match(activeRule, /opacity: 1;/)
  assert.match(activeRule, /transform: translate3d\(var\(--callout-panel-x\), var\(--callout-panel-y\), 0\);/)
  assert.doesNotMatch(panelRule, /scale|transition:[\s\S]*transform/)
  assert.doesNotMatch(activeRule, /scale/)
})
