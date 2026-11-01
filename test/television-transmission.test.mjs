import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('电视信号页是可关闭、可恢复焦点的键盘模态层', async () => {
  const component = await source('src/ui/television/TelevisionTransmission.tsx')

  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /aria-labelledby="television-transmission-title"/)
  assert.match(component, /aria-describedby="television-transmission-description"/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /event\.key !== 'Tab'/)
  assert.match(component, /FOCUSABLE_SELECTOR/)
  assert.match(component, /closeButtonRef\.current\?\.focus\(\)/)
  assert.match(component, /previouslyFocused\?\.focus\(\)/)
  assert.match(component, /event\.shiftKey[\s\S]{0,180}last\.focus\(\)/)
  assert.match(component, /active === last[\s\S]{0,120}first\.focus\(\)/)
})

test('电视点击沿用可编辑资产代理，打开页面时暂停三维场景', async () => {
  const [app, canvas] = await Promise.all([
    source('src/App.tsx'),
    source('src/scene/StudioCanvas.tsx'),
  ])

  assert.match(app, /const TelevisionTransmission = lazy\(/)
  assert.match(app, /const \[televisionTransmissionOpen, setTelevisionTransmissionOpen\] = useState\(false\)/)
  assert.match(app, /if \(editingLayout\) return[\s\S]{0,260}setTelevisionTransmissionOpen\(true\)/)
  assert.match(app, /onOpenTelevision=\{openTelevisionTransmission\}/)
  assert.match(app, /renderPaused=\{grimoireMemoryOpen \|\| televisionTransmissionOpen\}/)
  assert.match(app, /<TelevisionTransmission onClose=\{closeTelevisionTransmission\} \/>/)

  assert.match(canvas, /const VINTAGE_TELEVISION_ASSET_ID = 'vintage-television'/)
  assert.match(canvas, /const isVintageTelevision = asset\.id === VINTAGE_TELEVISION_ASSET_ID/)
  assert.match(canvas, /onClick=\{editingLayout \? \(event\) => \{[\s\S]{0,180}onSelectAsset\(asset\.id\)/)
  assert.match(canvas, /: isVintageTelevision \? \(event\) => \{[\s\S]{0,320}onOpenTelevision\(\)/)
  assert.match(canvas, /onPointerEnter=\{!editingLayout && \(isDreamArchiveShelf \|\| isVintageTelevision \|\| isHologramTrigger\)/)
})
