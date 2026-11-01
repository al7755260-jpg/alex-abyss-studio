import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three'
import {
  PLAQUE_FALL_SECONDS, PLAQUE_EMPTY_HOLD_SECONDS, PLAQUE_RETURN_SECONDS, PLAQUE_FRAGMENT_BATCHES,
  PlaqueFractureController, resolvePlaqueExitPoint, samplePlaqueFragmentMotion,
} from '../src/scene/plaqueFractureMotion.ts'
import { buildPlaqueFractureGeometry } from '../src/scene/plaqueFractureGeometry.ts'

test('每次点击掉一批，五次依次释放4/3/3/3/3块且不重复', () => {
  const controller = new PlaqueFractureController()
  assert.equal(new Set(PLAQUE_FRAGMENT_BATCHES.flat()).size, 16)
  const counts = [4, 7, 10, 13, 16]
  for (let i = 1; i <= 5; i++) {
    assert.equal(controller.hit(), true)
    assert.equal(controller.hits, i)
    assert.equal(controller.fallTimes.filter((age) => age >= 0).length, counts[i - 1])
    controller.advance(0.12)
  }
  assert.equal(controller.hit(), false)
  assert.equal(controller.returning, false)
  // Earlier batches continue falling independently of later clicks.
  assert.ok(controller.fallTimes[PLAQUE_FRAGMENT_BATCHES[0][0]] > controller.fallTimes[PLAQUE_FRAGMENT_BATCHES[4][0]])
})

test('第5批离屏后保持空牌半秒，再自动飞回重组并重新计数', () => {
  const controller = new PlaqueFractureController()
  for (let i = 0; i < 5; i++) controller.hit()
  controller.advance(PLAQUE_FALL_SECONDS)
  assert.equal(controller.returning, false)
  assert.ok(controller.fallTimes.every((age) => age === PLAQUE_FALL_SECONDS))
  controller.advance(PLAQUE_EMPTY_HOLD_SECONDS - .01)
  assert.equal(controller.returning, false)
  controller.advance(.02)
  assert.equal(controller.returning, true)
  assert.equal(controller.hit(), false)
  controller.advance(PLAQUE_RETURN_SECONDS)
  assert.equal(controller.active, false)
  assert.equal(controller.hits, 0)
  assert.ok(controller.fallTimes.every((age) => age === -1))
  assert.equal(controller.hit(), true)
  assert.equal(controller.hits, 1)
})

test('前4批离屏后保持缺口并停止动画，慢点仍累计；编辑取消清零', () => {
  const controller = new PlaqueFractureController()
  for (let i = 0; i < 4; i++) {
    controller.hit()
    controller.advance(20)
  }
  assert.equal(controller.hits, 4)
  assert.equal(controller.active, false)
  assert.equal(controller.returning, false)
  assert.equal(controller.fallTimes.filter((age) => age >= 0).length, 13)
  controller.hit()
  assert.equal(controller.active, true)
  assert.equal(controller.fallTimes.filter((age) => age >= 0).length, 16)
  controller.reset()
  assert.equal(controller.hits, 0)
  assert.equal(controller.active, false)
})

test('碎片从完整原位可见地下落到离屏位置，飞回终点精确重合', () => {
  const exit = new Vector3(0, -14, 0)
  for (let i = 0; i < 16; i++) {
    const start = samplePlaqueFragmentMotion(i, 0, -1, .65, exit)
    for (const value of Object.values(start)) assert.equal(value === 0, true)
    const falling = samplePlaqueFragmentMotion(i, PLAQUE_FALL_SECONDS / 2, -1, .65, exit)
    assert.equal(falling.y, -3.5)
    const gone = samplePlaqueFragmentMotion(i, PLAQUE_FALL_SECONDS, -1, .65, exit)
    assert.equal(gone.y, -14)
    const restored = samplePlaqueFragmentMotion(i, PLAQUE_FALL_SECONDS, PLAQUE_RETURN_SECONDS, .65, exit)
    for (const value of Object.values(restored)) assert.equal(value === 0, true)
  }
})

test('真实相机常规、近景和俯视姿态都将落点投影到画面下方', () => {
  for (const position of [[10.25, 5.57, 15.08], [0, 2, 2], [0, 20, .01]]) {
    const camera = new PerspectiveCamera(45, 16 / 9, .1, 1000)
    camera.position.fromArray(position)
    camera.lookAt(0, 1, 0)
    camera.updateMatrixWorld(true)
    const worldPoint = new Vector3(0, 1, 0)
    const exit = resolvePlaqueExitPoint(camera, worldPoint)
    const projected = exit.clone().project(camera)
    assert.ok(projected.y < -1.59, `${position}: ${projected.toArray()}`)
    assert.ok(projected.z >= -1 && projected.z <= 1)
    assert.deepEqual(worldPoint.toArray(), [0, 1, 0])
  }
})

test('大帧步长与小帧步长会完成相同掉落、停顿、复原周期', () => {
  const fast = new PlaqueFractureController()
  const stepped = new PlaqueFractureController()
  for (let i = 0; i < 5; i++) { fast.hit(); stepped.hit() }
  const duration = PLAQUE_FALL_SECONDS + PLAQUE_EMPTY_HOLD_SECONDS + PLAQUE_RETURN_SECONDS + .1
  fast.advance(duration)
  for (let elapsed = 0; elapsed < duration; elapsed += .016) stepped.advance(.016)
  assert.equal(fast.hits, 0)
  assert.equal(stepped.hits, 0)
  assert.equal(fast.active, false)
  assert.equal(stepped.active, false)
})

test('分片保留每个原始三角面和UV，不修改或销毁共享模型材质', () => {
  const geometry = new BoxGeometry(0.12, 0.65, 1.08, 2, 12, 16)
  const material = new MeshStandardMaterial()
  const source = new Group()
  const mesh = new Mesh(geometry, material)
  mesh.position.y = 0.325
  source.add(mesh)
  const original = geometry.attributes.position.array.slice()
  const generator = buildPlaqueFractureGeometry(source, 1, new Vector3(), 0.65, 1.08)
  let next
  do { next = generator.next() } while (!next.done)
  const result = next.value
  const surfaces = result.pieces.flatMap((piece) => piece.group.children.filter((child) => child.name.startsWith('plaque-original-surface:')))
  assert.equal(result.triangleCount, geometry.index.count / 3)
  assert.equal(surfaces.reduce((sum, surface) => sum + surface.geometry.index.count, 0), geometry.index.count)
  assert.ok(surfaces.length >= 12)
  for (const surface of surfaces) {
    assert.equal(surface.geometry.attributes.uv, geometry.attributes.uv)
    assert.equal(surface.material, material)
  }
  assert.deepEqual(geometry.attributes.position.array, original)
  let materialDisposed = false
  material.addEventListener('dispose', () => { materialDisposed = true })
  result.dispose()
  assert.equal(materialDisposed, false)
  geometry.dispose(); material.dispose()
})
