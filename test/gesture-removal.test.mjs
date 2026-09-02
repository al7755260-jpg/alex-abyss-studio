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

test('六件遗物都保留鼠标入口，指纹匣由柜门开启状态显式解锁', async () => {
  const [relics, canvas, cabinet] = await Promise.all([
    source('src/scene/HiddenRelics.tsx'),
    source('src/scene/StudioCanvas.tsx'),
    source('src/scene/InteractiveCabinet.tsx'),
  ])

  assert.equal(HIDDEN_RELICS.length, 6)
  assert.equal(new Set(HIDDEN_RELICS.map(({ id }) => id)).size, 6)
  assert.match(relics, /\{HIDDEN_RELICS\.map\(\(relic\) => \{/)
  assert.match(relics, /onClick=\{pointerEnabled \? \(event\) => \{[\s\S]{0,120}onOpenRelic\(relic\.id\)/)
  assert.match(relics, /onPointerEnter=\{pointerEnabled \? \(event\) =>/)
  assert.match(relics, /onPointerLeave=\{pointerEnabled \? \(event\) =>/)
  assert.match(relics, /const isFingerprintCasket = relic\.id === 'fingerprint-casket'/)
  assert.match(relics, /const pointerEnabled = !isFingerprintCasket \|\| fingerprintCasketAccessible/)
  assert.match(relics, /raycast=\{pointerEnabled \? relicProxyRaycast : ignoreRaycast\}/)

  assert.match(cabinet, /onClick=\{handleClick\}/)
  assert.match(cabinet, /if \(!controller\.toggle\(\)\) return/)
  assert.match(canvas, /const \[cabinetDoorOpen, setCabinetDoorOpen\] = useState\(false\)/)
  assert.match(canvas, /onDoorOpenChange=\{setCabinetDoorOpen\}/)
  assert.match(canvas, /fingerprintCasketAccessible=\{cabinetDoorOpen\}/)
})
