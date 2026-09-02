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

test('电脑旁的 Alex 灵感句保留默认立体模型并支持任意可编辑文案', async () => {
  await MeshoptDecoder.ready

  const modelUrl = projectFile('public/models/computer-inspiration-note-optimized.glb')
  const [component, fitted, generator, modelStat, document] = await Promise.all([
    source('src/scene/ComputerIdeaInscription.tsx'),
    source('src/scene/FittedInscription.tsx'),
    source('scripts/create-computer-idea-note.py'),
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  assert.match(component, /COMPUTER_IDEA_TEXT = '永远不要扔掉你喜欢的东西'/)
  assert.match(generator, /IDEA_TEXT = "永远不要扔掉你喜欢的东西"/)
  assert.match(generator, /LINE_ONE = "永远不要扔掉"/)
  assert.match(generator, /LINE_TWO = "你喜欢的东西"/)
  assert.match(generator, /ember_indices=\(1, 2\)/)
  assert.doesNotMatch(generator, /Idea_Underline|Idea_Spark/)
  assert.match(component, /const TARGET_WIDTH = 1\.81/)
  assert.match(component, /text: string/)
  assert.match(component, /transform: StudioTransform/)
  assert.match(component, /forwardRef<Group, ComputerIdeaInscriptionProps>/)
  assert.match(component, /defaultText=\{COMPUTER_IDEA_TEXT\}/)
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
  assert.ok(modelStat.size < 300 * 1024, 'idea inscription must stay below 300KB')

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'idea inscription GLB must have a default scene')
  const bounds = getBounds(scene)
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  assert.ok(size[0] > size[2] * 10, 'inscription must keep a shallow 3D profile')
  assert.ok(countTriangles(document) < 30_000, 'inscription must stay below 30k triangles')
  const nodeNames = document.getRoot().listNodes().map((node) => node.getName())
  assert.equal(nodeNames.includes('Idea_Underline'), false)
  assert.equal(nodeNames.includes('Idea_Spark'), false)
  assert.equal(document.getRoot().listMaterials().length, 2)
  assert.equal(document.getRoot().listTextures().length, 0)
  assert.equal(document.getRoot().listAnimations().length, 0)
})

test('灵感句在电脑内独立注册为可选的三维布局对象', async () => {
  const [canvas, inscriptions, assets] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'),
    source('src/data/sceneInscriptions.ts'),
    source('src/data/studioAssets.ts'),
  ])

  assert.match(inscriptions, /COMPUTER_IDEA_INSCRIPTION_ID = 'inscription:computer-idea'/)
  assert.match(
    inscriptions,
    /id: COMPUTER_IDEA_INSCRIPTION_ID[\s\S]{0,120}copyField: 'computerIdeaText'[\s\S]{0,120}position: \[-0\.19, 1\.16, -1\.13\][\s\S]{0,100}rotation: \[-0\.03, 2\.03, -0\.035\]/,
  )
  assert.match(inscriptions, /SCENE_INSCRIPTION_LAYOUT_ASSETS[\s\S]{0,180}id,\s*position,\s*rotation,\s*scale/)

  const mountStart = canvas.indexOf('<ComputerIdeaInscription')
  const mountEnd = canvas.indexOf('/>', mountStart)
  const mount = canvas.slice(mountStart, mountEnd)
  assert.ok(mountStart >= 0 && mountEnd > mountStart)
  assert.match(canvas, /asset\.id === 'reliquary-computer'[\s\S]{0,180}<ComputerIdeaInscription/)
  assert.match(mount, /ref=\{getEditableGroupRef\(COMPUTER_IDEA_INSCRIPTION_ID\)\}/)
  assert.match(mount, /text=\{studioCopy\.computerIdeaText\}/)
  assert.match(mount, /studioLayout\[COMPUTER_IDEA_INSCRIPTION_ID\]/)
  assert.match(mount, /defaultStudioLayout\[COMPUTER_IDEA_INSCRIPTION_ID\]/)
  assert.match(mount, /editing=\{editingLayout\}/)
  assert.match(mount, /selected=\{selectedAssetId === COMPUTER_IDEA_INSCRIPTION_ID\}/)
  assert.match(mount, /onSelect=\{\(\) => onSelectAsset\(COMPUTER_IDEA_INSCRIPTION_ID\)\}/)
  assert.match(
    assets,
    /id: 'reliquary-computer'[\s\S]{0,240}position: \[0\.8, DESK_DEVICE_BASE_Y\.computer, -1\.34\][\s\S]{0,90}rotation: \[0, -Math\.PI \/ 2, 0\]/,
  )
  assert.equal((assets.match(/id: 'reliquary-computer'/g) ?? []).length, 1)
  assert.doesNotMatch(assets, /inscription:computer-idea|alex-sudden-idea/)
})
