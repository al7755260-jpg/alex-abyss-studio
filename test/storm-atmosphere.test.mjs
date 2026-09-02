import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('雨夜氛围只在主场景空闲态挂载并保持纯装饰语义', async () => {
  const [app, weather] = await Promise.all([
    source('src/App.tsx'),
    source('src/ui/atmosphere/StormAtmosphere.tsx'),
  ])

  assert.match(app, /mystery\.state\.view\.kind === 'studio'[\s\S]{0,180}!editingLayout[\s\S]{0,180}!dreamArchiveOpen[\s\S]{0,180}relicTransitionPhase === 'idle'[\s\S]{0,120}<StormAtmosphere \/>/)
  assert.match(weather, /className="storm-atmosphere" aria-hidden="true"/)
  assert.equal((weather.match(/<span\b/g) ?? []).length, 1)
})

test('雨幕固定为两个 CSS 合成层且不会拦截 3D 交互', async () => {
  const [weather, css] = await Promise.all([
    source('src/ui/atmosphere/StormAtmosphere.tsx'),
    source('src/styles.css'),
  ])

  assert.match(css, /\.storm-atmosphere \{[\s\S]{0,260}z-index: 1;[\s\S]{0,400}pointer-events: none;/)
  assert.match(css, /\.storm-atmosphere::before,[\s\S]{0,80}\.storm-atmosphere::after/)
  assert.match(css, /@keyframes storm-rain-far \{[\s\S]{0,180}translate3d/)
  assert.match(css, /@keyframes storm-rain-near \{[\s\S]{0,180}translate3d/)
  assert.doesNotMatch(weather, /useFrame|Canvas|Points|InstancedMesh|Light|Math\.random|setInterval/)
})

test('闪电只用低频透明度双闪，不触发布局或滤镜重绘', async () => {
  const css = await source('src/styles.css')
  const lightningKeyframes = css.match(/@keyframes storm-lightning \{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.match(css, /\.storm-atmosphere__lightning \{[\s\S]{0,700}animation: storm-lightning 16\.8s/)
  assert.match(lightningKeyframes, /72\.12% \{ opacity: \.4; \}/)
  assert.match(lightningKeyframes, /72\.52% \{ opacity: \.025; \}/)
  assert.match(lightningKeyframes, /72\.92% \{ opacity: \.22; \}/)
  assert.doesNotMatch(lightningKeyframes, /filter|brightness|transform|box-shadow/)
})

test('移动端降为单层雨，弱动效模式关闭天气动画', async () => {
  const css = await source('src/styles.css')

  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]{0,260}\.storm-atmosphere::after \{[\s\S]{0,40}display: none;/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,180}\.storm-atmosphere__lightning[\s\S]{0,80}display: none;/)
})
