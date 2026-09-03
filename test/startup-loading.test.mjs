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

test('遗物详情代码仅在打开时加载，独立 Suspense 不阻塞主场景', async () => {
  const canvas = await source('src/scene/StudioCanvas.tsx')
  assert.match(canvas, /const ArtifactDetailScene = lazy\(\(\) => import\('\.\/ArtifactDetailScene'\)/)
  assert.doesNotMatch(canvas, /import \{ ArtifactDetailScene \} from/)
  assert.match(canvas, /detailRelic \? \(\s*<Suspense fallback=\{null\}>\s*<ArtifactDetailScene/)
  assert.match(canvas, /<group visible=\{!detailRelic\} name="persistent-studio-world">/)
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
