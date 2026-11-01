import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  DEFAULT_DREAM_IDEA_ID,
  DREAM_IDEA_BY_ID,
  DREAM_IDEAS,
} from '../src/data/dreamIdeas.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('书架梦境档案提供四个完整且唯一的 AI 短视频灵感 Demo', () => {
  assert.equal(DREAM_IDEAS.length, 4)
  assert.equal(new Set(DREAM_IDEAS.map(({ id }) => id)).size, DREAM_IDEAS.length)
  assert.ok(DREAM_IDEA_BY_ID.has(DEFAULT_DREAM_IDEA_ID))
  for (const idea of DREAM_IDEAS) {
    assert.ok(idea.title.length >= 6)
    assert.ok(idea.summary.length >= 24)
    assert.equal(idea.beats.length, 3)
    assert.equal(idea.production.length, 3)
    assert.ok(idea.promptSeed.length >= 45)
  }
})

test('书架主体进入奇思档案，同时保留提示球的遗物探索隔离', async () => {
  const [app, canvas, rack, relics] = await Promise.all([
    source('src/App.tsx'),
    source('src/scene/StudioCanvas.tsx'),
    source('src/scene/DisplayRackInstallation.tsx'),
    source('src/scene/HiddenRelics.tsx'),
  ])

  assert.match(rack, /<DemonicRackSkulls \/>/)
  assert.match(canvas, /const DREAM_ARCHIVE_SHELF_ASSET_ID = 'demonic-display-rack'/)
  assert.match(canvas, /isDreamArchiveShelf \? \(event\) => \{[\s\S]{0,220}onOpenDreamArchive\(\)/)
  assert.doesNotMatch(canvas, /asset\.id === 'forbidden-bookcase'[\s\S]{0,260}onOpenDreamArchive\(\)/)
  assert.match(canvas, /onClick=\{editingLayout \? \(event\) => \{/)
  assert.match(canvas, /event\.button !== 0 \|\| event\.delta > 8/)
  assert.match(app, /window\.location\.assign\(FEATURED_PROJECT_URL\)/)
  assert.match(canvas, /focusDreamArchive: \(onComplete\) => \{/)
  assert.match(relics, /event\.stopPropagation\(\)[\s\S]{0,80}onOpenRelic\(relic\.id\)/)
})

test('灵感书架保留独立鼠标代理和可点击光标', async () => {
  const [app, canvas] = await Promise.all([
    source('src/App.tsx'),
    source('src/scene/StudioCanvas.tsx'),
  ])

  assert.match(canvas, /const isDreamArchiveShelf = asset\.id === DREAM_ARCHIVE_SHELF_ASSET_ID/)
  assert.match(canvas, /isDreamArchiveShelf \? \(event\) => \{[\s\S]{0,320}onOpenDreamArchive\(\)/)
  assert.match(canvas, /if \(event\.button !== 0 \|\| event\.delta > 8\) return/)
  assert.match(canvas, /onPointerEnter=\{!editingLayout && \(isDreamArchiveShelf \|\| isVintageTelevision \|\| isHologramTrigger\)/)
  assert.match(canvas, /enabled=\{editSelected\}/)
  assert.match(app, /onOpenDreamArchive=\{exploreBookcaseDreams\}/)
  assert.doesNotMatch(`${app}\n${canvas}`, /GestureControl|mysteryTargetKind|faceFocused/)
})

test('书架直接打开外部作品，编辑模式不跳转', async () => {
  const app = await source('src/App.tsx')
  const { FEATURED_PROJECT_URL } = await import('../src/data/portfolioLinks.ts')
  const body = app.match(/const exploreBookcaseDreams = useCallback\(\(\) => \{([\s\S]*?)\n  \},/)?.[1]
  assert.ok(body)
  const navigate = new Function('editingLayout', 'cancelSceneFocus', 'document', 'window', 'FEATURED_PROJECT_URL', body)
  const visits = []; let cancels = 0
  const document = { body: { style: { cursor: 'pointer' } } }
  const window = { location: { assign: (url) => visits.push(url) } }
  navigate(true, () => cancels++, document, window, FEATURED_PROJECT_URL)
  assert.equal(visits.length, 0)
  navigate(false, () => cancels++, document, window, FEATURED_PROJECT_URL)
  assert.deepEqual(visits, ['https://al7755260-jpg.github.io/tianhou-palace-client-demo/?v=2e05b07'])
  assert.equal(cancels, 1)
  assert.equal(document.body.style.cursor, '')
  assert.doesNotMatch(app, /<DreamArchive|setDreamArchiveOpen|import\('\.\/ui\/ideas\/DreamArchive'\)/)
})

test('梦境档案保留鼠标操作、键盘后退与焦点循环', async () => {
  const [archive, css] = await Promise.all([
    source('src/ui/ideas/DreamArchive.tsx'),
    source('src/ui/ideas/DreamArchive.css'),
  ])

  assert.match(archive, /event\.key === 'Escape'[\s\S]{0,120}closeOrStepBack\(\)/)
  assert.match(archive, /if \(event\.key !== 'Tab'\) return/)
  assert.match(archive, /querySelectorAll<HTMLElement>\(FOCUSABLE_SELECTOR\)/)
  assert.match(archive, /closeButtonRef\.current\?\.focus\(\)/)
  assert.match(archive, /previouslyFocused\?\.focus\(\)/)
  assert.equal((archive.match(/onClick=/g) ?? []).length, 5)
  assert.match(archive, /onClick=\{\(\) => selectIdea\(idea\.id\)\}/)
  assert.match(archive, /onClick=\{\(\) => setDeepDiveOpen\(true\)\}/)
  assert.match(archive, /onClick=\{toggleSavedIdea\}/)
  assert.match(archive, /鼠标点击选择 · Esc 返回上一层 · Tab 切换控件/)
  assert.match(css, /\.viewer--dreaming \.game-ui \{[\s\S]{0,120}z-index: 90;[\s\S]{0,120}visibility: hidden;/)
  assert.doesNotMatch(`${archive}\n${css}`, /gesture-control|data-dream-gesture|hand-landmark/i)
})

test('梦境档案具备独立滚动、移动端安全区与弱动效模式', async () => {
  const css = await source('src/ui/ideas/DreamArchive.css')

  assert.match(css, /position: fixed;[\s\S]{0,100}inset: 0;/)
  assert.match(css, /min-height: 100dvh;/)
  assert.match(css, /overflow: hidden;/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /dream-archive-city-v1\.webp/)
})

test('梦境档案与书脊 Tab 只做透明度渐显，不再带位移、缩放或模糊飞入', async () => {
  const css = await source('src/ui/ideas/DreamArchive.css')
  const archiveArrival = css.match(/@keyframes dream-archive-arrive \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const tabArrival = css.match(/@keyframes dream-tab-fade \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const copyArrival = css.match(/@keyframes dream-copy-arrive \{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.match(css, /\.dream-chapter \{[\s\S]{0,900}animation: dream-tab-fade 320ms ease-out both;/)
  assert.match(css, /\.dream-chapter:nth-child\(4\) \{ animation-delay: 135ms; \}/)
  for (const keyframes of [archiveArrival, tabArrival, copyArrival]) {
    assert.match(keyframes, /from \{ opacity: 0; \}/)
    assert.match(keyframes, /to \{ opacity: 1; \}/)
    assert.doesNotMatch(keyframes, /transform|translate|scale|filter|blur/)
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,260}\.dream-chapter,/)
})
