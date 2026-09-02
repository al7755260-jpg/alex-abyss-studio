import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

import { FINAL_MONITOR_TARGET } from '../src/data/hiddenRelics.ts'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

const componentBody = (fileSource, exportName) => {
  const start = fileSource.indexOf(`export function ${exportName}`)
  assert.notEqual(start, -1, `${exportName} must remain an exported component`)
  return fileSource.slice(start)
}

test('终局保留多阶段演出、明确跳过入口和压缩背景资源', async () => {
  const [finale, styles, background] = await Promise.all([
    source('../src/ui/game/FinaleSequence.tsx'),
    source('../src/styles.css'),
    stat(new URL('../public/images/finale-abyss-bg-v2.webp', import.meta.url)),
  ])

  const transitionCount = (
    finale.match(/set(?:Phase|RevealStep)\s*\(/g) ?? []
  ).length
  assert.ok(
    transitionCount >= 3,
    'finale should expose at least three phase/reveal-step transitions',
  )
  assert.match(finale, /跳过(?:重构|演出|解码|读取|终局|演算)/)
  assert.match(finale, /(?:skip|handleSkip|onSkip)/i)

  assert.match(
    `${finale}\n${styles}`,
    /\/images\/finale-abyss-bg-v2\.webp/,
    'the finale must reference the optimized WebP background',
  )
  assert.ok(background.size > 50_000, 'finale background should not be an empty placeholder')
  assert.ok(background.size < 500_000, 'finale background should stay web-delivery sized')
})

test('终局只在 complete 后显示返回 CTA，reduced-motion 直接进入稳态', async () => {
  const finale = await source('../src/ui/game/FinaleSequence.tsx')

  assert.match(
    finale,
    /\{\s*(?:complete|phase\s*===\s*['"]complete['"])\s*(?:&&|\?)[\s\S]{0,900}返回书房/,
    'return CTA must be gated by the completed state',
  )
  assert.match(finale, /matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)/)
  assert.match(finale, /motionPreference\(\)\s*\?\s*['"]complete['"]/)

  const reducedMotionBranch = finale.slice(finale.indexOf('if (reducedMotion)'), finale.indexOf('if (reducedMotion)') + 1_200)
  assert.match(
    reducedMotionBranch,
    /set(?:Phase|RevealStep)\s*\(\s*['"]complete['"]\s*\)/,
    'reduced-motion should reveal the final phase/content immediately',
  )
  assert.match(finale, /phase\s*!==\s*['"]complete['"][\s\S]{0,160}onComplete\(\)/)
})

test('终局完成后显示双击确认式重置按钮并连接完整重置动作', async () => {
  const [finale, gameHud, mysteryHook, styles] = await Promise.all([
    source('../src/ui/game/FinaleSequence.tsx'),
    source('../src/ui/game/GameHUD.tsx'),
    source('../src/game/useRelicMystery.ts'),
    source('../src/styles.css'),
  ])

  assert.match(finale, /\{phase\s*===\s*['"]complete['"]\s*\?\s*\([\s\S]*重置游戏/)
  assert.match(finale, /restartArmed/)
  assert.match(finale, /确认重置/)
  assert.match(finale, /onRestart\(\)/)
  assert.match(gameHud, /onRestart=\{actions\.resetGame\}/)
  assert.match(mysteryHook, /dispatch\(\{ type: 'RESET_GAME' \}\)/)
  assert.match(styles, /\.finale__restart--armed/)
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.finale__return,\s*\.finale__restart\s*\{\s*opacity:\s*1;\s*transform:\s*none;/,
  )
})

test('终局显示器点击命中区沿用唯一坐标源且不再绘制红色 aura', async () => {
  assert.equal(FINAL_MONITOR_TARGET.position[0], -0.46)
  assert.ok(Math.abs(FINAL_MONITOR_TARGET.position[1] - 2.378) < 1e-12)
  assert.equal(FINAL_MONITOR_TARGET.position[2], -1.31)
  assert.deepEqual(FINAL_MONITOR_TARGET.size, [1.08, 0.58])

  const hiddenRelics = await source('../src/scene/HiddenRelics.tsx')
  const target = componentBody(hiddenRelics, 'FinalMonitorTarget')

  assert.match(target, /position = FINAL_MONITOR_TARGET\.position/)
  assert.match(target, /<group position=\{position\}>/)
  assert.match(target, /args=\{\[1\.08,\s*0\.58\]\}/)
  assert.match(target, /onClick=\{\(event\) => \{[\s\S]{0,120}event\.delta <= 10[\s\S]{0,80}onOpenFinale\(\)/)
  assert.match(target, /onPointerEnter=\{\(event\) => \{[\s\S]{0,160}onHoverChange\?\.\(true\)/)
  assert.match(target, /onPointerLeave=\{\(event\) => \{[\s\S]{0,160}onHoverChange\?\.\(false\)/)
  assert.match(target, /colorWrite=\{false\}/)
  assert.equal((target.match(/<planeGeometry\b/g) ?? []).length, 1)

  assert.doesNotMatch(target, /auraRef|AdditiveBlending|<pointLight\b/i)
  assert.doesNotMatch(target, /#[a-f\d]{6}/i)
})

test('显示器以独立 FinalMonitorDisplay 呈现可辨识的终局语义', async () => {
  const [installation, display] = await Promise.all([
    source('../src/scene/MonitorInstallation.tsx'),
    source('../src/scene/FinalMonitorDisplay.tsx'),
  ])

  assert.match(installation, /import\s+\{\s*FinalMonitorDisplay\s*\}/)
  assert.match(
    installation,
    /finaleReady[\s\S]{0,700}<FinalMonitorDisplay|<FinalMonitorDisplay[\s\S]{0,700}finaleReady/,
    'the semantic display must be tied to finaleReady',
  )
  assert.match(display, /export function FinalMonitorDisplay/)

  assert.match(display, /uniform float uTime/)
  assert.doesNotMatch(display, /uniform float uFocus|uFocusRef|focused:/)
  assert.match(display, /float eyeReveal/)
  assert.match(display, /float relicGlyphs/)
  assert.match(display, /nameDotMatrix\(\)/)
  assert.match(display, /raycast=\{ignoreRaycast\}/)
})
