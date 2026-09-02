import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

test('场景与 HUD 遗物入口统一经过镜头推进后才打开详情', async () => {
  const [app, hud] = await Promise.all([
    readFile(projectFile('src/App.tsx'), 'utf8'),
    readFile(projectFile('src/ui/game/GameHUD.tsx'), 'utf8'),
  ])

  assert.match(app, /const requestOpenRelic = useCallback/)
  assert.match(app, /studioRef\.current\?\.focusRelic\([\s\S]{0,180}finishRelicOpening/)
  assert.match(app, /if \(openingRelicRef\.current !== relicId\) return[\s\S]{0,180}mystery\.actions\.openRelic\(relicId\)/)
  assert.match(app, /onOpenRelic=\{requestOpenRelic\}/)
  assert.match(hud, /onSelect=\{onOpenRelic\}/)
  assert.doesNotMatch(hud, /onSelect=\{actions\.openRelic\}/)
})

test('镜头推进锁定交互并使用遗物真实命中坐标', async () => {
  const canvas = await readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8')

  assert.match(canvas, /const RELIC_FOCUS_DURATION = 0\.82/)
  assert.match(canvas, /resolveAttachedPoint\(defaultTransform, currentTransform, relic\.hitPosition\)/)
  assert.match(canvas, /toTarget: new Vector3\(\.\.\.resolvedHitPosition\)/)
  assert.match(canvas, /MathUtils\.clamp\(1\.68 \+ relic\.hitRadius \* 1\.3, 1\.9, 2\.1\)/)
  assert.match(canvas, /function smootherStep/)
  assert.match(canvas, /controls\.enabled = false/)
  assert.match(canvas, /if \(relicFocus\) \{[\s\S]{0,100}controls\.enabled = false/)
  assert.match(canvas, /editingLayout[\s\S]{0,120}!controls[\s\S]{0,120}!relic[\s\S]{0,120}relicFocusRef\.current/)
  assert.match(canvas, /if \(reducedMotion\)[\s\S]{0,420}relicFocus\.onComplete\(\)/)
})

test('详情页以暗幕、羊皮卷、遗物和介绍面板分层入场', async () => {
  const [app, canvas, scene, hud, styles] = await Promise.all([
    readFile(projectFile('src/App.tsx'), 'utf8'),
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
    readFile(projectFile('src/scene/ArtifactDetailScene.tsx'), 'utf8'),
    readFile(projectFile('src/ui/game/GameHUD.tsx'), 'utf8'),
    readFile(projectFile('src/styles.css'), 'utf8'),
  ])

  assert.match(app, /relic-transition--\$\{relicTransitionPhase\}/)
  assert.match(canvas, /<ArtifactDetailScene key=\{detailRelic\.id\}/)
  assert.match(hud, /<ArtifactDetailHUD[\s\S]{0,80}key=\{activeRelic\.id\}/)
  assert.match(scene, /function RelicEntrance/)
  assert.match(scene, /entranceElapsedRef/)
  assert.match(styles, /@keyframes relic-transition-close/)
  assert.match(styles, /@keyframes relic-transition-open/)
  assert.match(styles, /@keyframes artifact-detail-panel-in/)
  assert.match(styles, /@keyframes artifact-detail-content-in/)
})
