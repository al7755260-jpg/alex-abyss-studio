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

test('完美暴政句使用紧凑挤出模型并保留用户原文', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile('public/models/perfect-tyranny-note-optimized.glb')
  const [component, fitted, generator, modelStat, document] = await Promise.all([
    source('src/scene/PerfectTyrannyInscription.tsx'),
    source('src/scene/FittedInscription.tsx'),
    source('scripts/create-perfect-tyranny-note.py'),
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  assert.match(component, /PERFECT_TYRANNY_TEXT = '完美，就是一个返自然，用来折磨我们的暴政'/)
  assert.match(generator, /IDEA_TEXT = "完美，就是一个返自然，用来折磨我们的暴政"/)
  assert.match(generator, /LINE_ONE = "完美，就是一个"/)
  assert.match(generator, /LINE_TWO = "返自然，用来折磨"/)
  assert.match(generator, /LINE_THREE = "我们的暴政"/)
  assert.match(generator, /curve\.extrude = 0\.055/)
  assert.match(component, /const TARGET_WIDTH = 2\.15/)
  assert.match(component, /defaultText=\{PERFECT_TYRANNY_TEXT\}/)
  assert.match(component, /maxCharactersPerLine=\{8\}/)
  assert.match(component, /text=\{text\}/)
  assert.match(component, /transform=\{transform\}/)
  assert.match(fitted, /const deferredText = useDeferredValue\(text\)/)
  assert.match(fitted, /const visibleText = deferredText\.trim\(\)/)
  assert.match(fitted, /deferredText === defaultText/)
  assert.match(fitted, /createDynamicTexture\([\s\S]{0,80}visibleText/)
  assert.ok(modelStat.size < 180 * 1024, 'new inscription must stay below 180KB')

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'new inscription GLB must have a default scene')
  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  assert.ok(size[0] > size[2] * 10, 'inscription must keep a shallow 3D profile')
  assert.ok(countTriangles(document) < 13_000, 'inscription must stay below 13k triangles')
  assert.equal(document.getRoot().listMaterials().length, 3)
  assert.equal(document.getRoot().listTextures().length, 0)
  assert.equal(document.getRoot().listAnimations().length, 0)
  assert.equal(document.getRoot().listCameras().length, 0)
})

test('完美暴政句作为第三个可编辑场景文字注册', async () => {
  const [canvas, inscriptions, copy, app] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'),
    source('src/data/sceneInscriptions.ts'),
    source('src/editor/studioCopy.ts'),
    source('src/App.tsx'),
  ])

  assert.match(inscriptions, /PERFECT_TYRANNY_INSCRIPTION_ID = 'inscription:perfect-tyranny'/)
  assert.match(
    inscriptions,
    /id: PERFECT_TYRANNY_INSCRIPTION_ID[\s\S]{0,160}copyField: 'perfectTyrannyText'[\s\S]{0,120}rows: 3[\s\S]{0,120}position: \[-2\.6, 2\.62, -2\.66\]/,
  )
  assert.match(copy, /perfectTyrannyText: '完美，就是一个返自然，用来折磨我们的暴政'/)
  assert.match(app, /perfectTyrannyText: '“完美”三行文字'/)
  assert.match(app, /rows: inscription\.rows/)
  assert.equal((canvas.match(/<PerfectTyrannyInscription\b/g) ?? []).length, 1)

  const mountStart = canvas.indexOf('<PerfectTyrannyInscription')
  const mountEnd = canvas.indexOf('/>', mountStart)
  const mount = canvas.slice(mountStart, mountEnd)
  assert.match(mount, /ref=\{getEditableGroupRef\(PERFECT_TYRANNY_INSCRIPTION_ID\)\}/)
  assert.match(mount, /text=\{studioCopy\.perfectTyrannyText\}/)
  assert.match(mount, /studioLayout\[PERFECT_TYRANNY_INSCRIPTION_ID\]/)
  assert.match(mount, /defaultStudioLayout\[PERFECT_TYRANNY_INSCRIPTION_ID\]/)
  assert.match(mount, /editing=\{editingLayout\}/)
  assert.match(mount, /selected=\{selectedAssetId === PERFECT_TYRANNY_INSCRIPTION_ID\}/)
  assert.match(mount, /onSelect=\{\(\) => onSelectAsset\(PERFECT_TYRANNY_INSCRIPTION_ID\)\}/)
  assert.equal((canvas.match(/<TransformControls\b/g) ?? []).length, 1)
})
