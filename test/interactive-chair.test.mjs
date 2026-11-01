import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

import {
  CHAIR_TURN_DURATION_SECONDS,
  CHAIR_TURN_RADIANS,
  ChairRotationController,
  resolveChairSwivelPoint,
} from '../src/scene/chairRotation.ts'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

const assertClose = (actual, expected, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, received ${actual}`,
  )
}

const assertVectorClose = (actual, expected, epsilon = 1e-6) => {
  assert.equal(actual.length, expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    assertClose(actual[index], expected[index], epsilon)
  }
}

const settleActiveTurn = (controller) => {
  assert.equal(controller.snapshot.playing, true)
  return controller.advance(CHAIR_TURN_DURATION_SECONDS + 1)
}

const countTriangles = (document) => {
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

test('转椅每次只前进120度、播放期间锁定且三次正好一圈', () => {
  const controller = new ChairRotationController()

  assertClose(CHAIR_TURN_RADIANS, 2 * Math.PI / 3)
  assert.ok(CHAIR_TURN_DURATION_SECONDS > 0)
  assert.equal(controller.snapshot.angle, 0)
  assert.equal(controller.snapshot.targetAngle, 0)
  assert.equal(controller.snapshot.playing, false)
  assert.equal(controller.snapshot.completedTurns, 0)

  for (let turn = 1; turn <= 3; turn += 1) {
    assert.equal(controller.startTurn(), true)
    const lockedTarget = controller.snapshot.targetAngle
    const lockedTurns = controller.snapshot.completedTurns
    assert.equal(controller.startTurn(), false)
    assert.equal(controller.snapshot.targetAngle, lockedTarget)
    assert.equal(controller.snapshot.completedTurns, lockedTurns)

    const settled = settleActiveTurn(controller)
    assert.equal(settled.playing, false)
    assert.equal(settled.completedTurns, turn)
    assertClose(settled.angle, turn * CHAIR_TURN_RADIANS)
    assertClose(settled.targetAngle, turn * CHAIR_TURN_RADIANS)
  }

  assertClose(controller.snapshot.angle, 2 * Math.PI)
  assertClose(controller.snapshot.angle % (2 * Math.PI), 0)
})

test('完成一圈后的第四次点击仍沿正方向旋转120度', () => {
  const controller = new ChairRotationController()
  for (let turn = 0; turn < 3; turn += 1) {
    assert.equal(controller.startTurn(), true)
    settleActiveTurn(controller)
  }

  assertClose(controller.snapshot.angle, 2 * Math.PI)
  assert.equal(controller.startTurn(), true)

  // The controller may safely normalize the visually identical 2π pose to 0
  // before beginning the next cycle, but the fourth motion must never reverse.
  const samples = [controller.snapshot.angle]
  for (let index = 0; index < 8; index += 1) {
    samples.push(controller.advance(CHAIR_TURN_DURATION_SECONDS / 8).angle)
  }
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(
      samples[index] + 1e-9 >= samples[index - 1],
      `fourth turn reversed between ${samples[index - 1]} and ${samples[index]}`,
    )
  }

  assert.equal(controller.snapshot.playing, false)
  assert.equal(controller.snapshot.completedTurns, 4)
  assertClose(controller.snapshot.angle, CHAIR_TURN_RADIANS)
  assertClose(controller.snapshot.targetAngle, CHAIR_TURN_RADIANS)
})

test('转椅插值与帧切分无关并拒绝非法 delta', () => {
  const singleStep = new ChairRotationController()
  const manySteps = new ChairRotationController()
  assert.equal(singleStep.startTurn(), true)
  assert.equal(manySteps.startTurn(), true)

  const elapsed = CHAIR_TURN_DURATION_SECONDS * 0.63
  singleStep.advance(elapsed)
  for (let index = 0; index < 63; index += 1) {
    manySteps.advance(CHAIR_TURN_DURATION_SECONDS / 100)
  }
  assertClose(singleStep.snapshot.angle, manySteps.snapshot.angle, 1e-10)
  assert.ok(singleStep.snapshot.angle > 0)
  assert.ok(singleStep.snapshot.angle < CHAIR_TURN_RADIANS)

  const beforeZeroDelta = singleStep.snapshot
  assert.deepEqual(singleStep.advance(0), beforeZeroDelta)
  for (const invalidDelta of [-0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => singleStep.advance(invalidDelta), RangeError)
  }

  const settled = singleStep.advance(CHAIR_TURN_DURATION_SECONDS * 10)
  assert.equal(settled.playing, false)
  assertClose(settled.angle, CHAIR_TURN_RADIANS)
})

test('脊索扣随椅面转轴终态换算且三次后回到原位', () => {
  const pivot = [-0.55, 0.438, 0.5]
  const initial = [-0.55, 0.854, 0.911]
  const radius = Math.hypot(initial[0] - pivot[0], initial[2] - pivot[2])

  const afterOne = resolveChairSwivelPoint(initial, pivot, CHAIR_TURN_RADIANS)
  const afterTwo = resolveChairSwivelPoint(initial, pivot, 2 * CHAIR_TURN_RADIANS)
  const afterThree = resolveChairSwivelPoint(initial, pivot, 3 * CHAIR_TURN_RADIANS)

  assertVectorClose(afterOne, [-0.194063, 0.854, 0.2945], 1e-5)
  assertVectorClose(afterTwo, [-0.905937, 0.854, 0.2945], 1e-5)
  assertVectorClose(afterThree, initial, 1e-9)
  for (const point of [afterOne, afterTwo, afterThree]) {
    assertClose(point[1], initial[1])
    assertClose(Math.hypot(point[0] - pivot[0], point[2] - pivot[2]), radius)
  }
})

test('InteractiveChair 只驱动 Chair_Swivel 并保留拟合、阴影和鼠标锁', async () => {
  const component = await source('../src/scene/InteractiveChair.tsx')

  assert.match(component, /Chair_Base/)
  assert.match(component, /Chair_Swivel/)
  assert.match(component, /Chair_Upper/)
  assert.match(
    component,
    /getObjectByName\((?:CHAIR_SWIVEL_NODE_NAME|'Chair_Swivel')\)/,
  )
  assert.match(
    component,
    /swivel\.rotation\.y\s*=\s*(?:baseYawRef\.current \+ )?(?:next|playback)\.angle/,
  )
  assert.doesNotMatch(component, /(?:root|base)\.rotation\.[xyz]\s*=/i)
  assert.doesNotMatch(component, /prepared\.object\.rotation\.[xyz]\s*=/)
  assert.doesNotMatch(component, /AnimationMixer|useAnimations/)

  assert.match(component, /uniformScale: asset\.fit\.size \/ sourceDimension/)
  assert.match(component, /offset: \[-center\.x, -bounds\.min\.y, -center\.z\]/)
  assert.match(component, /child\.castShadow = asset\.castShadow/)
  assert.match(component, /child\.receiveShadow = asset\.receiveShadow/)
  assert.match(component, /gl\.shadowMap\.needsUpdate = true/)

  assert.match(component, /name=\{`chair-interaction-proxy:\$\{asset\.id\}`\}/)
  assert.match(component, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(component, /event\.button !== 0 \|\| event\.delta > 8/)
  assert.match(component, /if \(!controller\.startTurn\(\)\) return/)
  assert.match(
    component,
    /document\.body\.style\.cursor = (?:playing \? 'wait' : 'pointer'|playing \? 'wait' : ready \? 'pointer' : '')/,
  )
  assert.match(component, /const settledAngle = normalizeChairAngle\((?:next|playback)\.angle\)/)
  assert.match(component, /onTurnComplete\?\.\(settledAngle\)/)
})

test('StudioCanvas 为 chair 使用专用代理并在编辑模式恢复布局代理', async () => {
  const canvas = await source('../src/scene/StudioCanvas.tsx')

  assert.match(canvas, /import \{ InteractiveChair \} from '\.\/InteractiveChair'/)
  assert.match(canvas, /const isInteractiveChair = asset\.kind === 'chair'/)
  assert.match(canvas, /asset\.kind === 'chair'[\s\S]{0,180}<InteractiveChair/)
  assert.match(canvas, /<InteractiveChair[\s\S]{0,260}interactive=\{!editingLayout\}/)
  assert.doesNotMatch(canvas, /<ObjectCalloutOverlay\b/)

  const genericProxy = canvas.indexOf('name={`interaction-proxy:${asset.id}`}')
  assert.ok(genericProxy > 0, 'StudioCanvas must retain its generic edit proxy')
  const proxyGuard = canvas.slice(Math.max(0, genericProxy - 700), genericProxy)
  assert.match(proxyGuard, /isInteractiveCabinet/)
  assert.match(proxyGuard, /isInteractiveChair/)
  assert.match(proxyGuard, /editingLayout/)


})

test('发布椅子 GLB 保留固定底座、独立转轴、共享材质和性能预算', async () => {
  await MeshoptDecoder.ready

  const modelUrl = new URL(
    '../public/models/chair-optimized.glb',
    import.meta.url,
  )
  const [asset, document] = await Promise.all([
    stat(modelUrl),
    new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
      .read(fileURLToPath(modelUrl)),
  ])

  assert.ok(asset.isFile())
  assert.ok(asset.size > 1_000_000, 'chair GLB unexpectedly looks like a placeholder')
  assert.ok(asset.size < 5 * 1024 * 1024, `chair GLB exceeds 5MB: ${asset.size}`)
  assert.ok(
    countTriangles(document) < 130_000,
    `chair GLB exceeds 130k triangles: ${countTriangles(document)}`,
  )

  const root = document.getRoot()
  const scene = root.getDefaultScene()
  assert.ok(scene, 'chair GLB must have a default scene')
  const nodeByName = new Map(root.listNodes().map((node) => [node.getName(), node]))
  const chairRoot = nodeByName.get('Chair_Root')
  const base = nodeByName.get('Chair_Base')
  const swivel = nodeByName.get('Chair_Swivel')
  const upper = nodeByName.get('Chair_Upper')

  assert.ok(chairRoot, 'missing Chair_Root')
  assert.ok(base, 'missing Chair_Base')
  assert.ok(swivel, 'missing Chair_Swivel')
  assert.ok(upper, 'missing Chair_Upper')
  assert.ok(scene.listChildren().includes(chairRoot))
  assert.equal(chairRoot.getParentNode(), null)
  assert.equal(base.getParentNode(), chairRoot)
  assert.equal(swivel.getParentNode(), chairRoot)
  assert.equal(upper.getParentNode(), swivel)
  assert.ok(base.getMesh(), 'Chair_Base must own the stationary mesh')
  assert.equal(swivel.getMesh(), null, 'Chair_Swivel must remain a pure pivot')
  assert.ok(upper.getMesh(), 'Chair_Upper must own the rotating mesh')
  assertVectorClose(swivel.getTranslation(), [0, -0.22, 0], 0.002)
  assertVectorClose(swivel.getRotation(), [0, 0, 0, 1], 1e-9)

  const materials = new Set()
  for (const mesh of [base.getMesh(), upper.getMesh()]) {
    for (const primitive of mesh.listPrimitives()) {
      assert.ok(primitive.getMaterial(), `${mesh.getName()} contains an unmaterialed primitive`)
      materials.add(primitive.getMaterial())
    }
  }
  assert.equal(materials.size, 1, 'base and upper must reuse one material/texture set')
  assert.equal(root.listAnimations().length, 0, 'runtime owns swivel motion; GLB must not animate the base')
})
