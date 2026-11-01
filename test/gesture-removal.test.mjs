import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

import { HIDDEN_RELICS } from '../src/data/hiddenRelics.ts'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)
const source = (relativePath) => readFile(projectFile(relativePath), 'utf8')

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return sourceFiles(url)
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [url] : []
  }))
  return nested.flat()
}

test('业务源码、公开资源和直接依赖均已移除手势模块', async () => {
  const files = await sourceFiles(projectFile('src/'))
  const contents = await Promise.all(files.map(async (file) => ({
    file: file.pathname,
    text: await readFile(file, 'utf8'),
  })))
  const forbiddenBusinessCode = /\b(?:GestureControl|FaceLandmarker|HandLandmarker)\b|getUserMedia|navigator\.mediaDevices|@mediapipe\/tasks-vision|gesture-control|gesture-preview|gesture-reticle|data-dream-gesture|hand-landmark|手势(?:控制|交互|识别|追踪)/i

  for (const { file, text } of contents) {
    assert.doesNotMatch(text, forbiddenBusinessCode, `${file} must not restore gesture code or UI`)
  }

  await assert.rejects(access(projectFile('src/ui/gesture/GestureControl.tsx')), { code: 'ENOENT' })
  await assert.rejects(access(projectFile('src/gesture/handGestures.ts')), { code: 'ENOENT' })
  await assert.rejects(access(projectFile('public/mediapipe/')), { code: 'ENOENT' })

  const packageJson = JSON.parse(await source('package.json'))
  const directDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
    ...packageJson.peerDependencies,
  }
  assert.equal(directDependencies['@mediapipe/tasks-vision'], undefined)
  assert.equal(
    Object.keys(directDependencies).some((name) => name.startsWith('@mediapipe/')),
    false,
  )
})

test('梦境档案保留鼠标点击、Esc 返回与 Tab 焦点循环', async () => {
  const archive = await source('src/ui/ideas/DreamArchive.tsx')

  assert.match(archive, /role="dialog"/)
  assert.match(archive, /onKeyDown=\{handleDialogKeyDown\}/)
  assert.match(archive, /event\.key === 'Escape'[\s\S]{0,120}closeOrStepBack\(\)/)
  assert.match(archive, /if \(event\.key !== 'Tab'\) return/)
  assert.match(archive, /querySelectorAll<HTMLElement>\(FOCUSABLE_SELECTOR\)/)
  assert.match(archive, /onClick=\{\(\) => selectIdea\(idea\.id\)\}/)
  assert.match(archive, /onClick=\{\(\) => setDeepDiveOpen\(true\)\}/)
  assert.match(archive, /onClick=\{toggleSavedIdea\}/)
  assert.match(archive, /鼠标点击选择 · Esc 返回上一层 · Tab 切换控件/)
})

test('展示站不再挂载遗物入口，但保留家具鼠标交互', async () => {
  const canvas = await readFile(new URL('../src/scene/StudioCanvas.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(canvas, /HiddenRelics|FinalMonitorTarget|onOpenRelic/)
  assert.match(canvas, /<InteractiveCabinet/)
  assert.match(canvas, /<InteractiveChair/)
  assert.doesNotMatch(canvas, /SceneAccentLights/)
})
