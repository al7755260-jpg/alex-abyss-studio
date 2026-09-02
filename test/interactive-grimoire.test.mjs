import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

test('深渊古书注册在桌面并自动进入现有布局编辑链路', async () => {
  const [assets, app, canvas, control] = await Promise.all([
    source('../src/data/studioAssets.ts'),
    source('../src/App.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/ui/editor/StudioEditorControl.tsx'),
  ])

  assert.match(assets, /\| 'grimoire'/)
  assert.match(assets, /id: 'abyss-grimoire'[\s\S]{0,80}label: '深渊三页古书'/)
  assert.match(assets, /kind: 'grimoire'/)
  assert.match(assets, /models\/abyss-grimoire-animated\.glb/)
  assert.match(assets, /position: \[0\.72, 1\.8, -0\.7\]/)
  assert.match(app, /createDefaultStudioLayout\(\[[\s\S]{0,100}\.\.\.STUDIO_ASSETS/)
  assert.match(app, /assetOptions=\{STUDIO_ASSETS\}/)
  assert.match(control, /onSelectAsset\(event\.currentTarget\.value \|\| null\)/)
  assert.match(canvas, /ref=\{getEditableGroupRef\(asset\.id\)\}/)
  assert.match(canvas, /asset\.kind === 'grimoire'[\s\S]{0,180}<InteractiveGrimoire/)
})

test('古书严格按单片段的三段时间轴逐击播放且播放中忽略重复点击', async () => {
  const component = await source('../src/scene/InteractiveGrimoire.tsx')

  assert.match(component, /GRIMOIRE_ANIMATION_CLIP = 'Grimoire_3Click_Cycle'/)
  assert.match(component, /\{ start: 0, end: 1\.5, cue:/)
  assert.match(component, /\{ start: 1\.5, end: 4\.5, cue:/)
  assert.match(component, /\{ start: 4\.5, end: 6, cue:/)
  assert.match(component, /gltf\.animations\.find\(\(\{ name \}\) => name === GRIMOIRE_ANIMATION_CLIP\)/)
  assert.match(component, /if \(timeline\.active\) return/)
  assert.match(component, /const nextIndex = \(active\.index \+ 1\) % GRIMOIRE_SEGMENTS\.length/)
  assert.match(component, /timeline\.time = segment\.start/)
  assert.match(component, /timeline\.active = \{ index, end: segment\.end \}/)
  assert.match(component, /timeline\.time = Math\.min\(active\.end, timeline\.time \+ delta\)/)
})

test('古书点击不冒泡并有悬浮提示、无椭圆光环与加载失败 fallback', async () => {
  const [component, canvas, styles] = await Promise.all([
    source('../src/scene/InteractiveGrimoire.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/styles.css'),
  ])

  assert.ok((component.match(/event\.stopPropagation\(\)/g) ?? []).length >= 3)
  assert.match(component, /<GrimoireAura active=\{hovered\} playing=\{playing\} \/>/)
  assert.doesNotMatch(component, /<ringGeometry args=\{\[0\.43, 0\.56, 48\]\} \/>/)
  assert.match(component, /<pointLight[\s\S]{0,180}active \? 0\.82 : 0\.32/)
  assert.match(component, /className="grimoire-callout"/)
  assert.match(component, /name="grimoire-interaction-surface"/)
  assert.match(component, /<boxGeometry args=\{\[0\.96, 0\.34, 0\.64\]\} \/>/)
  assert.match(component, /document\.body\.style\.cursor = playing \? 'wait' : 'pointer'/)
  assert.match(component, /class GrimoireErrorBoundary extends Component/)
  assert.match(component, /<Suspense fallback=\{fallback\}>/)
  assert.ok((component.match(/<ProceduralGrimoire/g) ?? []).length >= 1)
  assert.match(component, /PAGE_TURN_WINDOWS = \[[\s\S]{0,160}\[3\.36, 4\.34\]/)
  assert.match(canvas, /isInteractiveGrimoire && !editingLayout[\s\S]{0,120}ignoreStudioProxyRaycast/)
  assert.match(styles, /\.grimoire-callout/)
  assert.match(styles, /@keyframes grimoire-callout-enter/)
})

test('古书召唤提示只在第一次有效点击前显示', async () => {
  const component = await source('../src/scene/InteractiveGrimoire.tsx')

  assert.match(component, /\{ start: 0, end: 1\.5, cue: '召唤回忆的幽灵' \}/)
  assert.doesNotMatch(component, /点击唤醒封皮/)
  assert.match(
    component,
    /const \[initialPromptDismissed, setInitialPromptDismissed\] = useState\(false\)/,
  )
  assert.match(
    component,
    /if \(timeline\.active\) return[\s\S]{0,260}timeline\.active = \{ index, end: segment\.end \}[\s\S]{0,80}setInitialPromptDismissed\(true\)[\s\S]{0,80}setPlaying\(true\)/,
  )
  assert.match(component, /\{!initialPromptDismissed && hovered && !editing \? \(/)
  assert.equal((component.match(/setInitialPromptDismissed\(true\)/g) ?? []).length, 1)
  assert.doesNotMatch(component, /setInitialPromptDismissed\(false\)/)
})
