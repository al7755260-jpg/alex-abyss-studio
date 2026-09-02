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

test('电视信号页锁定七条抖音竖屏来源并一次只挂载一个记忆残片', async () => {
  const component = await source('src/ui/television/TelevisionTransmission.tsx')

  assert.doesNotMatch(component, /TelevisionChannel|role="tablist"|role="tab"/)
  assert.equal((component.match(/<iframe/g) ?? []).length, 1)
  assert.match(
    component,
    /https:\/\/open\.douyin\.com\/player\/video\?vid=7646446323129994534&autoplay=0/,
  )
  assert.match(
    component,
    /https:\/\/open\.douyin\.com\/player\/video\?vid=7655263012642622763&autoplay=0/,
  )
  for (const videoId of [
    '7657219695199800627',
    '7666136052129697060',
    '7647585532972682523',
    '7642270012888568745',
    '7641169512897793491',
  ]) {
    assert.match(
      component,
      new RegExp(`https://open\\.douyin\\.com/player/video\\?vid=${videoId}&autoplay=0`),
    )
  }
  assert.equal((component.match(/videoId:/g) ?? []).length, 7)
  assert.equal((component.match(/selectorLabel: '残片 /g) ?? []).length, 7)
  assert.match(component, /useState<\(typeof DOUYIN_SIGNALS\)\[number\]>/)
  assert.match(component, /key=\{activeSignal\.videoId\}/)
  assert.match(component, /src=\{activeSignal\.playerUrl\}/)
  assert.match(component, /aria-controls="television-transmission-player"/)
  assert.match(component, /aria-pressed=\{signal\.id === activeSignal\.id\}/)
  assert.match(component, /role="group"/)
  assert.match(component, /const DOUYIN_PLAYER_BASE_WIDTH = 324/)
  assert.match(component, /const DOUYIN_PLAYER_BASE_HEIGHT = 672/)
  assert.match(component, /width=\{DOUYIN_PLAYER_BASE_WIDTH\}/)
  assert.match(component, /height=\{DOUYIN_PLAYER_BASE_HEIGHT\}/)
  assert.match(component, /scrolling="no"/)
  assert.match(component, /new ResizeObserver\(syncPlayerScale\)/)
  assert.match(component, /Math\.min\([\s\S]{0,180}screenWidth \/ DOUYIN_PLAYER_BASE_WIDTH[\s\S]{0,120}screenHeight \/ DOUYIN_PLAYER_BASE_HEIGHT/)
  assert.match(component, /--douyin-player-scale/)
  assert.match(component, /loading="lazy"/)
  assert.match(component, /allow="autoplay; fullscreen"/)
  assert.match(component, /allowFullScreen/)
  assert.match(component, /referrerPolicy="unsafe-url"/)
  assert.match(component, /DOUYIN VERTICAL SIGNAL \/ 09:16/)
  assert.match(component, /label: '记忆残片'/)
  assert.doesNotMatch(component, /抖音残片/)
  assert.doesNotMatch(
    component,
    /WEIXIN_SOURCE_URL|weixin\.qq\.com|微信视频号|television-transmission__blocked/,
  )
})

test('每条记忆残片都有与当前视频同步切换的公开高赞评论快照', async () => {
  const component = await source('src/ui/television/TelevisionTransmission.tsx')

  assert.equal((component.match(/comments: \[/g) ?? []).length, 7)
  assert.equal((component.match(/likes: /g) ?? []).length, 21)
  assert.match(component, /activeSignal\.comments\.map\(\(comment\) =>/)
  assert.match(component, /className="television-transmission__comments"/)
  assert.match(component, /id="television-transmission-comments-title">高赞评论/)
  assert.match(component, /TOP COMMENTS \/ PUBLIC SNAPSHOT/)
  assert.match(component, /aria-label=\{`获赞 \$\{comment\.likes\}`\}/)
  assert.match(component, /不是完整评论区排名/)
  assert.match(component, /晓颜动漫/)
  assert.match(component, /HAWEO/)
  assert.match(component, /9磅十五便士/)
  assert.doesNotMatch(component, /<dl>|<blockquote>/)
})

test('电视信号页具备全屏 CRT 表现、移动端安全区与弱动效模式', async () => {
  const css = await source('src/ui/television/TelevisionTransmission.css')

  assert.match(css, /\.television-transmission \{[\s\S]{0,160}position: fixed;[\s\S]{0,80}inset: 0;/)
  assert.match(css, /min-height: 100dvh;/)
  assert.match(css, /repeating-linear-gradient/)
  assert.match(css, /\.television-transmission__screen \{[\s\S]{0,180}aspect-ratio: 9 \/ 16;/)
  assert.match(css, /width: min\(300px, 31\.5dvh, calc\(100dvw - 140px\)\);/)
  assert.match(css, /\.television-transmission__screen iframe \{[\s\S]{0,180}width: 324px;[\s\S]{0,100}height: 672px;/)
  assert.match(css, /height: 672px;[\s\S]{0,60}overflow: hidden;/)
  assert.match(css, /top: 50%;[\s\S]{0,80}left: 50%;/)
  assert.match(css, /transform: translate\(-50%, -50%\) scale\(var\(--douyin-player-scale\)\);/)
  assert.match(css, /transform-origin: center;/)
  assert.match(css, /\.television-transmission__fragments \{[\s\S]{0,160}grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
  assert.match(css, /\.television-transmission__fragments button \{[\s\S]{0,140}min-height: 44px;/)
  assert.match(css, /button\[aria-pressed="true"\]/)
  assert.match(css, /\.television-transmission__comments ol \{[\s\S]{0,180}overflow-y: auto;/)
  assert.match(css, /\.television-transmission__comments li p/)
  assert.match(css, /@media \(max-width: 520px\)[\s\S]{0,160}grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/)
  assert.doesNotMatch(css, /\.television-transmission__blocked|\.television-transmission__channel/)
  assert.match(css, /@media \(max-width: 820px\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation: none !important;/)
  assert.match(css, /\.television-transmission__tracking,[\s\S]{0,100}display: none;/)
})

test('电视点击沿用可编辑资产代理，打开页面时暂停三维场景', async () => {
  const [app, canvas] = await Promise.all([
    source('src/App.tsx'),
    source('src/scene/StudioCanvas.tsx'),
  ])

  assert.match(app, /const TelevisionTransmission = lazy\(/)
  assert.match(app, /const \[televisionTransmissionOpen, setTelevisionTransmissionOpen\] = useState\(false\)/)
  assert.match(app, /if \(editingLayout \|\| mystery\.state\.view\.kind !== 'studio'\) return[\s\S]{0,260}setTelevisionTransmissionOpen\(true\)/)
  assert.match(app, /onOpenTelevision=\{openTelevisionTransmission\}/)
  assert.match(app, /renderPaused=\{dreamArchiveOpen \|\| grimoireMemoryOpen \|\| televisionTransmissionOpen \|\| mystery\.state\.view\.kind === 'finale'\}/)
  assert.match(app, /<TelevisionTransmission onClose=\{closeTelevisionTransmission\} \/>/)

  assert.match(canvas, /const VINTAGE_TELEVISION_ASSET_ID = 'vintage-television'/)
  assert.match(canvas, /const isVintageTelevision = asset\.id === VINTAGE_TELEVISION_ASSET_ID/)
  assert.match(canvas, /onClick=\{editingLayout \? \(event\) => \{[\s\S]{0,180}onSelectAsset\(asset\.id\)/)
  assert.match(canvas, /: isVintageTelevision \? \(event\) => \{[\s\S]{0,320}onOpenTelevision\(\)/)
  assert.match(canvas, /onPointerEnter=\{!editingLayout && \(proxyCalloutId \|\| isVintageTelevision\)/)
})
