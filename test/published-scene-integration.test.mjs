import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveSceneSnapshot } from '../src/editor/studioSceneSnapshot.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('公开版包含真实编辑快照，而非仅依赖访客浏览器保存', async () => {
  const snapshot = JSON.parse(await source('src/data/publishedScene.json'))
  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(Object.keys(snapshot.layout).length, 20)
  assert.equal(Object.keys(snapshot.textLayout).length, 32)
  const bustTransform = snapshot.layout['lovecraft-particle-bust']
  assert.deepEqual(Object.keys(bustTransform).sort(), ['position', 'rotation', 'scale'])
  assert.ok([
    ...bustTransform.position,
    ...bustTransform.rotation,
    ...bustTransform.scale,
  ].every(Number.isFinite))
  assert.ok(bustTransform.scale.every((value) => value === bustTransform.scale[0]))
  assert.ok(bustTransform.scale[0] > 0)
  assert.equal(snapshot.copy.objectivePendingTitle, '找到ALEX消失的秘密')
  assert.deepEqual(Object.keys(snapshot).sort(), ['copy', 'layout', 'lighting', 'schemaVersion', 'textLayout'])
  assert.deepEqual(resolveSceneSnapshot(snapshot, snapshot), snapshot)
})

test('公开版只读取发布快照，DEV 才允许浏览器草稿覆盖', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /import publishedScene from '\.\/data\/publishedScene\.json'/)
  assert.match(app, /const PUBLISHED_STUDIO_SCENE = resolveSceneSnapshot\(publishedScene,/)
  assert.match(app, /const editorStorage = import\.meta\.env\.DEV && typeof window !== 'undefined'\s*\? window\.localStorage\s*: null/)
  assert.match(app, /studioEditorReducer,\s*PUBLISHED_STUDIO_SCENE\.layout/)
  assert.match(app, /studioTextEditorReducer,\s*PUBLISHED_STUDIO_SCENE\.textLayout/)
  assert.match(app, /loadStudioLayout\(\s*editorStorage,/)
  assert.match(app, /loadStudioTextLayout\(\s*editorStorage,/)
  assert.match(app, /loadStudioCopy\(\s*editorStorage,\s*PUBLISHED_STUDIO_SCENE\.copy/)
  assert.match(app, /loadStudioLighting\(\s*editorStorage,\s*PUBLISHED_STUDIO_SCENE\.lighting/)
  assert.match(app, /defaultStudioLayout=\{DEFAULT_STUDIO_LAYOUT\}/)
})

test('编辑器仅存在于 DEV 构建，公开版无法激活且不挂载入口', async () => {
  const [app, hud] = await Promise.all([source('src/App.tsx'), source('src/ui/game/GameHUD.tsx')])
  assert.match(app, /const StudioEditorControl = import\.meta\.env\.DEV\s*\? lazy\(/)
  assert.match(app, /const StudioSceneExport = import\.meta\.env\.DEV\s*\? lazy\(/)
  assert.match(app, /const \[editingLayoutRequested, setEditingLayout\] = useState\(false\)/)
  assert.match(app, /const editingLayout = import\.meta\.env\.DEV && editingLayoutRequested/)
  assert.match(app, /if \(!import\.meta\.env\.DEV \|\| localFileSavePendingRef\.current\) return/)
  assert.equal((app.match(/if \(!import\.meta\.env\.DEV\) return false/g) ?? []).length, 4)
  assert.match(app, /editorControl=\{import\.meta\.env\.DEV && StudioEditorControl && StudioSceneExport/)
  assert.match(app, /savedMessage=\{localFileSaveState === 'saved'[\s\S]{0,120}: null\}/)
  assert.match(hud, /const ArtifactDetailHUD = lazy\(/)
  assert.match(hud, /const FinaleSequence = lazy\(/)
})
