import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

import {
  CabinetPlaybackController,
  resolveCabinetClipDuration,
} from '../src/scene/cabinetPlayback.ts'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

test('柜门首次点击正放、第二次点击倒放且播放期间锁定', () => {
  const controller = new CabinetPlaybackController()
  controller.configureDuration(2)

  assert.equal(controller.toggle(), true)
  assert.deepEqual(controller.snapshot, {
    ready: true,
    playing: true,
    open: false,
    targetOpen: true,
    direction: 1,
    time: 0,
    duration: 2,
  })
  assert.equal(controller.toggle(), false)

  assert.equal(controller.advance(0.75).time, 0.75)
  assert.equal(controller.advance(1.25).open, true)
  assert.equal(controller.snapshot.playing, false)

  assert.equal(controller.toggle(), true)
  assert.equal(controller.snapshot.direction, -1)
  assert.equal(controller.toggle(), false)
  assert.equal(controller.advance(2).open, false)
  assert.equal(controller.snapshot.time, 0)
})

test('全部柜门片段必须同长度才能同步播放', () => {
  assert.equal(resolveCabinetClipDuration([]), null)
  assert.equal(resolveCabinetClipDuration([1.8]), 1.8)
  assert.equal(resolveCabinetClipDuration([1.8, 1.8005, 1.8]), 1.8)
  assert.throws(
    () => resolveCabinetClipDuration([1.8, 2.1]),
    /时长不一致/,
  )
  assert.throws(() => resolveCabinetClipDuration([0]), RangeError)
})

test('柜子复用 AssetSlot 的 fit/offset 并通过 Mixer 同步全部 clips', async () => {
  const component = await source('../src/scene/InteractiveCabinet.tsx')

  assert.match(component, /cloneSkeleton\(gltf\.scene\)/)
  assert.match(component, /uniformScale: asset\.fit\.size \/ sourceDimension/)
  assert.match(component, /offset: \[-center\.x, -bounds\.min\.y, -center\.z\]/)
  assert.match(component, /gltf\.animations\.map\(\(clip\) => \{/)
  assert.match(component, /mixer\.clipAction\(clip\)/)
  assert.match(component, /action\.setLoop\(LoopOnce, 1\)/)
  assert.match(component, /action\.time = Math\.min\(time, action\.getClip\(\)\.duration\)/)
  assert.match(component, /mixer\.update\(0\)/)
  assert.match(component, /mixer\.uncacheRoot\(prepared\.object\)/)
})

test('StudioCanvas 为 cabinet 使用唯一的鼠标开合代理', async () => {
  const canvas = await source('../src/scene/StudioCanvas.tsx')

  assert.match(canvas, /const isInteractiveCabinet = asset\.kind === 'cabinet'/)
  assert.match(canvas, /asset\.kind === 'cabinet'[\s\S]{0,120}<InteractiveCabinet/)
  assert.match(
    canvas,
    /\{\(\s*!isInteractiveCabinet\s*&&\s*!isInteractiveChair\s*&&\s*!isInteractiveLamp\s*&&\s*!isInteractivePlaque\s*\)\s*\|\|\s*editingLayout\s*\?\s*\(/,
  )
  assert.doesNotMatch(canvas, /getInteractionTargetRef|mysteryTargetKind|mysteryTargetId/)
})



test('发布柜子 GLB 保留双门节点、闭合初始姿态和 1.3 秒开门动画', async () => {
  await MeshoptDecoder.ready

  const modelUrl = new URL(
    '../public/models/cabinet-optimized.glb',
    import.meta.url,
  )
  const [asset, document] = await Promise.all([
    stat(modelUrl),
    io.read(fileURLToPath(modelUrl)),
  ])

  assert.ok(asset.isFile())
  assert.ok(asset.size > 1_000_000 && asset.size < 9_000_000)

  const root = document.getRoot()
  const scene = root.getDefaultScene()
  assert.ok(scene, '柜子 GLB 必须有默认场景')
  assert.equal(scene.getName(), 'Maw_Cabinet_Authoring')

  const nodeByName = new Map(root.listNodes().map((node) => [node.getName(), node]))
  const leftHinge = nodeByName.get('Cabinet_Door_L_Hinge')
  const rightHinge = nodeByName.get('Cabinet_Door_R_Hinge')
  assert.ok(leftHinge)
  assert.ok(rightHinge)
  assert.deepEqual(leftHinge.getRotation(), [0, 0, 0, 1])
  assert.deepEqual(rightHinge.getRotation(), [0, 0, 0, 1])

  const meshNames = new Set(root.listMeshes().map((mesh) => mesh.getName()))
  assert.ok(meshNames.has('Cabinet_Body_Mesh'))
  assert.ok(meshNames.has('Cabinet_Door_L_Surface_Mesh'))
  assert.ok(meshNames.has('Cabinet_Door_R_Surface_Mesh'))

  const animations = root.listAnimations()
  assert.equal(animations.length, 1)
  assert.equal(animations[0].getName(), 'CabinetDoorOpen')
  const channels = animations[0].listChannels()
  assert.equal(channels.length, 2)
  assert.deepEqual(
    new Set(channels.map((channel) => channel.getTargetNode()?.getName())),
    new Set(['Cabinet_Door_L_Hinge', 'Cabinet_Door_R_Hinge']),
  )
  for (const channel of channels) {
    assert.equal(channel.getTargetPath(), 'rotation')
    const keyTimes = Array.from(channel.getSampler().getInput().getArray())
    const duration = Math.max(...keyTimes) - Math.min(...keyTimes)
    assert.ok(Math.abs(duration - 1.3) < 0.002)
  }
})
