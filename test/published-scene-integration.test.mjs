import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveSceneSnapshot } from '../src/editor/studioSceneSnapshot.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('公开版包含真实编辑快照，而非仅依赖访客浏览器保存', async () => {
  const snapshot = JSON.parse(await source('src/data/publishedScene.json'))
  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(Object.keys(snapshot.layout).length, 19)
  assert.equal(Object.keys(snapshot.textLayout).length, 32)
  assert.equal(snapshot.copy.objectivePendingTitle, '找到ALEX消失的秘密')
  assert.deepEqual(Object.keys(snapshot).sort(), ['copy', 'layout', 'lighting', 'schemaVersion', 'textLayout'])
  assert.deepEqual(resolveSceneSnapshot(snapshot, snapshot), snapshot)
})

test('启动读取公开摆放、文字和灯光，同时保留原始遗物附着坐标参照', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /import publishedScene from '\.\/data\/publishedScene\.json'/)
  assert.match(app, /const PUBLISHED_STUDIO_SCENE = resolveSceneSnapshot\(publishedScene,/)
  assert.match(app, /studioEditorReducer,\s*PUBLISHED_STUDIO_SCENE\.layout/)
  assert.match(app, /studioTextEditorReducer,\s*PUBLISHED_STUDIO_SCENE\.textLayout/)
  assert.match(app, /loadStudioCopy\([\s\S]{0,120}PUBLISHED_STUDIO_SCENE\.copy/)
  assert.match(app, /loadStudioLighting\([\s\S]{0,130}PUBLISHED_STUDIO_SCENE\.lighting/)
  assert.match(app, /defaultStudioLayout=\{DEFAULT_STUDIO_LAYOUT\}/)
  assert.match(app, /sceneExport=\{\([\s\S]{0,500}<StudioSceneExport snapshot=/)
})

test('编辑器与终局界面只在用户触发时下载，不增加首屏代码负担', async () => {
  const [app, hud] = await Promise.all([source('src/App.tsx'), source('src/ui/game/GameHUD.tsx')])
  assert.match(app, /const StudioEditorControl = lazy\(/)
  assert.match(app, /const StudioSceneExport = lazy\(/)
  assert.match(app, /editorControl=\{editingLayout \? \(/)
  assert.match(hud, /const ArtifactDetailHUD = lazy\(/)
  assert.match(hud, /const FinaleSequence = lazy\(/)
})
