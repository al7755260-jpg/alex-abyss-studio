import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)
const source = (relativePath) => readFile(projectFile(relativePath), 'utf8')

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

function countTriangles(document) {
  let triangles = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indexCount = primitive.getIndices()?.getCount()
      const vertexCount = primitive.getAttribute('POSITION')?.getCount() ?? 0
      triangles += Math.floor((indexCount ?? vertexCount) / 3)
    }
  }
  return triangles
}

test('屏幕之外灵感句保留默认立体模型并支持任意可编辑文案', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile('public/models/video-beyond-screen-note-optimized.glb')
  const [component, fitted, generator, modelStat, document] = await Promise.all([
    source('src/scene/VideoBeyondScreenInscription.tsx'),
    source('src/scene/FittedInscription.tsx'),
    source('scripts/create-video-beyond-screen-note.py'),
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  assert.match(component, /VIDEO_BEYOND_SCREEN_TEXT = '视频中50%的内容是隐藏在屏幕之外的'/)
  assert.match(generator, /IDEA_TEXT = "视频中50%的内容是隐藏在屏幕之外的"/)
  assert.match(generator, /LINE_ONE = "视频中 50% 的内容"/)
  assert.match(generator, /LINE_TWO = "是隐藏在"/)
  assert.match(generator, /LINE_THREE = "屏幕之外的"/)
  assert.match(generator, /material_indices=\{4: 1, 5: 1, 6: 1\}/)
  assert.match(generator, /material_indices=\{2: 2, 3: 2\}/)
  assert.doesNotMatch(generator, /Offscreen_Broken_Frame|Offscreen_Escape_Mark/)
  assert.match(component, /const TARGET_WIDTH = 1\.96/)
  assert.match(component, /text: string/)
  assert.match(component, /transform: StudioTransform/)
  assert.match(component, /forwardRef<[\s\S]{0,80}VideoBeyondScreenInscriptionProps/)
  assert.match(component, /defaultText=\{VIDEO_BEYOND_SCREEN_TEXT\}/)
  assert.match(component, /text=\{text\}/)
  assert.match(component, /transform=\{transform\}/)
  assert.match(component, /editing=\{editing\}/)
  assert.match(component, /selected=\{selected\}/)
  assert.match(component, /onSelect=\{onSelect\}/)
  assert.doesNotMatch(component, /position=\{\[/)
  assert.doesNotMatch(component, /rotation=\{\[/)
  assert.match(fitted, /const deferredText = useDeferredValue\(text\)/)
  assert.match(fitted, /const visibleText = deferredText\.trim\(\)/)
  assert.match(fitted, /deferredText === defaultText/)
  assert.match(fitted, /createDynamicTexture\([\s\S]{0,80}visibleText/)
  assert.match(fitted, /position=\{transform\.position\}/)
  assert.match(fitted, /rotation=\{transform\.rotation\}/)
  assert.match(fitted, /scale=\{transform\.scale\}/)
  assert.match(fitted, /name=\{`\$\{name\}:dynamic-text`\}/)
  assert.match(fitted, /name=\{`\$\{name\}:interaction-proxy`\}/)
  assert.match(fitted, /if \(!editing \|\| event\.button !== 0 \|\| event\.delta > 8\) return/)
  assert.match(fitted, /event\.stopPropagation\(\)[\s\S]{0,60}onSelect\?\.\(\)/)
  assert.match(fitted, /child\.castShadow = false/)
  assert.ok(modelStat.size < 220 * 1024, 'offscreen inscription must stay below 220KB')

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'offscreen inscription GLB must have a default scene')
  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  assert.ok(size[0] > size[2] * 15, 'inscription must keep a shallow 3D profile')
  assert.ok(countTriangles(document) < 20_000, 'inscription must stay below 20k triangles')
  const nodeNames = document.getRoot().listNodes().map((node) => node.getName())
  assert.equal(nodeNames.includes('Offscreen_Broken_Frame'), false)
  assert.equal(nodeNames.includes('Offscreen_Escape_Mark'), false)
  assert.equal(document.getRoot().listMaterials().length, 3)
  assert.equal(document.getRoot().listTextures().length, 0)
  assert.equal(document.getRoot().listAnimations().length, 0)
  assert.equal(document.getRoot().listCameras().length, 0)
})

test('第二句在头腔墙体层独立注册为可选的三维布局对象', async () => {
  const [canvas, inscriptions, assets] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'),
    source('src/data/sceneInscriptions.ts'),
    source('src/data/studioAssets.ts'),
  ])

  assert.match(inscriptions, /VIDEO_BEYOND_SCREEN_INSCRIPTION_ID = 'inscription:video-beyond-screen'/)
  assert.match(
    inscriptions,
    /id: VIDEO_BEYOND_SCREEN_INSCRIPTION_ID[\s\S]{0,120}copyField: 'videoBeyondScreenText'[\s\S]{0,120}position: \[-2\.5, 5, -2\.68\][\s\S]{0,100}rotation: \[-0\.08, 0\.44, -0\.09\]/,
  )
  assert.match(inscriptions, /SCENE_INSCRIPTION_LAYOUT_ASSETS[\s\S]{0,180}id,\s*position,\s*rotation,\s*scale/)

  const mountStart = canvas.indexOf('<VideoBeyondScreenInscription')
  const mountEnd = canvas.indexOf('/>', mountStart)
  const mount = canvas.slice(mountStart, mountEnd)
  assert.ok(mountStart >= 0 && mountEnd > mountStart)
  assert.match(
    canvas,
    /<BrainStudioShell \/>[\s\S]{0,120}<CameraIntroReady[\s\S]{0,120}<\/Suspense>\s*<Suspense fallback=\{null\}>\s*<VideoBeyondScreenInscription/,
  )
  assert.equal((canvas.match(/<VideoBeyondScreenInscription\b/g) ?? []).length, 1)
  assert.match(mount, /ref=\{getEditableGroupRef\(VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\)\}/)
  assert.match(mount, /text=\{studioCopy\.videoBeyondScreenText\}/)
  assert.match(mount, /studioLayout\[VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\]/)
  assert.match(mount, /defaultStudioLayout\[VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\]/)
  assert.match(mount, /editing=\{editingLayout\}/)
  assert.match(mount, /selected=\{selectedAssetId === VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\}/)
  assert.match(mount, /onSelect=\{\(\) => onSelectAsset\(VIDEO_BEYOND_SCREEN_INSCRIPTION_ID\)\}/)
  assert.match(canvas, /<boxGeometry args=\{interactionProxySize\} \/>/)
  assert.doesNotMatch(assets, /inscription:video-beyond-screen|screen-inscription|offscreen-inscription/)
})
