import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('模块求值阶段不再发起绕过调度器的 GLB preload', async () => {
  for (const filename of [
    'BrainStudioShell',
    'ComputerIdeaInscription',
    'VideoBeyondScreenInscription',
    'PerfectTyrannyInscription',
    'DemonicRackSkulls',
  ]) {
    assert.doesNotMatch(await source(`src/scene/${filename}.tsx`), /useGLTF\.preload/)
  }
})

test('展示站启动不加载遗物详情与结局组件', async () => {
  const [canvas, app, hud] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'), source('src/App.tsx'), source('src/ui/StudioHUD.tsx'),
  ])
  assert.doesNotMatch(`${canvas}\n${app}\n${hud}`, /ArtifactDetailScene|ArtifactDetailHUD|FinaleSequence|useRelicMystery|<HiddenRelics/)
  assert.match(canvas, /<group name="persistent-studio-world">/)
})


test('新增性能标记区分脑壳实际挂载与全部资产下载，不伪装完成进度', async () => {
  const [canvas, loading] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'),
    source('src/ui/LoadingOverlay.tsx'),
  ])
  assert.match(canvas, /markSceneMilestone\('studio:head-committed'\)/)
  assert.match(canvas, /!state\.active && state\.total > 0 && state\.loaded === state\.total/)
  assert.match(canvas, /markSceneMilestone\('studio:assets-loaded'\)/)
  assert.match(loading, /const \{ active, progress, loaded, total, item \} = useProgress\(\)/)
  assert.match(loading, /if \(!active\)/)
})
