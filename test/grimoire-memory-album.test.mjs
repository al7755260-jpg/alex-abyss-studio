import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('古书打开动画完成后才触发失落相册', async () => {
  const [component, canvas, app] = await Promise.all([
    source('src/scene/InteractiveGrimoire.tsx'),
    source('src/scene/StudioCanvas.tsx'),
    source('src/App.tsx'),
  ])

  assert.match(
    component,
    /timeline\.active = null[\s\S]{0,260}if \(active\.index === 0\) onOpenAlbum\(\)/,
  )
  assert.match(component, /if \(active\.index === 0\) onOpenAlbum\(\)[\s\S]{0,20}\}, -1\)/)
  assert.doesNotMatch(
    component,
    /const playNextSegment[\s\S]{0,360}onOpenAlbum\(\)/,
  )
  assert.match(canvas, /onOpenAlbum=\{onOpenGrimoireAlbum\}/)
  assert.match(app, /onOpenGrimoireAlbum=\{openGrimoireMemory\}/)
  assert.match(app, /const GrimoireMemoryAlbum = lazy\(/)
  assert.match(app, /const \[grimoireMemoryOpen, setGrimoireMemoryOpen\] = useState\(false\)/)
  assert.match(app, /renderPaused=\{grimoireMemoryOpen \|\| televisionTransmissionOpen/)
  assert.match(app, /const handleKeyDown = \(event: KeyboardEvent\) => \{[\s\S]{0,80}if \(grimoireMemoryOpen\) return/)
  assert.match(app, /<GrimoireMemoryAlbum onClose=\{closeGrimoireMemory\} \/>/)
})

test('失落相册完整展示三张原始照片并提供键盘和焦点保护', async () => {
  const [component, css] = await Promise.all([
    source('src/ui/grimoire/GrimoireMemoryAlbum.tsx'),
    source('src/ui/grimoire/GrimoireMemoryAlbum.css'),
  ])

  assert.match(component, /import\.meta\.env\.BASE_URL/)
  assert.equal((component.match(/src: `\$\{MEMORY_ASSET_ROOT\}\/memory-/g) ?? []).length, 3)
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /event\.key === 'ArrowLeft'/)
  assert.match(component, /event\.key === 'ArrowRight'/)
  assert.match(component, /event\.key !== 'Tab'/)
  assert.match(component, /closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(component, /previouslyFocused\.focus\(\{ preventScroll: true \}\)/)
  assert.match(component, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/)
  assert.match(component, /aria-pressed=\{pageIndex === index\}/)
  assert.match(component, /aria-live="polite"/)
  assert.match(css, /object-fit: contain/)
})

test('ImageGen恶魔书页背景和三张照片都已固化为项目资产', async () => {
  const css = await source('src/ui/grimoire/GrimoireMemoryAlbum.css')
  const assets = [
    'public/images/grimoire-memories/demonic-open-book-v1.webp',
    'public/images/grimoire-memories/memory-01-water.webp',
    'public/images/grimoire-memories/memory-02-rain.jpg',
    'public/images/grimoire-memories/memory-03-city.jpg',
  ]

  await Promise.all(assets.map((asset) => access(new URL(`../${asset}`, import.meta.url))))
  assert.match(css, /demonic-open-book-v1\.webp/)
  assert.match(css, /filter: sepia\(\.28\) saturate\(\.78\)/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /@media \(max-width: 520px\), \(max-height: 560px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})
