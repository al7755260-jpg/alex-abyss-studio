import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three'

import { filterRelicHostProxyIntersections } from '../src/scene/relicPointerEvents.ts'
import { resolveParticleMorphProgress } from '../src/scene/particleMorphPlayback.ts'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)
const particleUrl = projectFile('public/models/particle-morph/lovecraft-particle-morph.bin')

function parsePayload(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const view = new DataView(buffer)
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  const version = view.getUint32(4, true)
  const headerBytes = view.getUint32(8, true)
  const count = view.getUint32(12, true)
  let offset = headerBytes
  const takeFloat = (length) => {
    const values = new Float32Array(buffer, offset, length)
    offset += values.byteLength
    return values
  }
  const takeByte = (length) => {
    const values = new Uint8Array(buffer, offset, length)
    offset += values.byteLength
    return values
  }

  const payload = {
    magic,
    version,
    headerBytes,
    count,
    duration: view.getFloat32(16, true),
    brushWidth: view.getFloat32(20, true),
    particleRadius: view.getFloat32(24, true),
    noiseAmplitude: view.getFloat32(28, true),
    sourcePosition: takeFloat(count * 3),
    targetPosition: takeFloat(count * 3),
    sourceNormal: takeFloat(count * 3),
    targetNormal: takeFloat(count * 3),
    delay: takeFloat(count),
    particleScale: takeFloat(count),
    humanColor: takeByte(count * 3),
    monsterColor: takeByte(count * 3),
    finalOffset: offset,
  }
  return payload
}

function range(values) {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const value of values) {
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  return [minimum, maximum]
}

test('Blender 粒子载荷保留 36,000 个双端点、贴图色和 30–90 帧时长', async () => {
  const bytes = await readFile(particleUrl)
  const data = parsePayload(bytes)

  assert.equal(data.magic, 'CPMF')
  assert.equal(data.version, 1)
  assert.equal(data.headerBytes, 96)
  assert.equal(data.count, 36_000)
  assert.equal(data.finalOffset, bytes.byteLength)
  assert.equal(bytes.byteLength, 2_232_096)
  assert.ok(Math.abs(data.duration - 2.002) < 0.0001)
  assert.ok(Math.abs(data.brushWidth - 0.2) < 1e-6)
  assert.ok(Math.abs(data.particleRadius - 0.0042) < 1e-6)
  assert.ok(Math.abs(data.noiseAmplitude - 0.1) < 1e-6)

  assert.deepEqual(range(data.delay).map((value) => Math.round(value * 1e6) / 1e6), [0, 0.8])
  const scaleRange = range(data.particleScale)
  assert.ok(scaleRange[0] >= 0.82 && scaleRange[1] <= 1.18)
  assert.ok(range(data.humanColor)[1] > 120)
  assert.ok(range(data.monsterColor)[1] > 180)

  let positionDelta = 0
  let colorDelta = 0
  let heightSum = 0
  let delaySum = 0
  let heightSquaredSum = 0
  let delaySquaredSum = 0
  let heightDelaySum = 0
  for (let index = 0; index < data.sourcePosition.length; index += 1) {
    assert.ok(Number.isFinite(data.sourcePosition[index]))
    assert.ok(Number.isFinite(data.targetPosition[index]))
    assert.ok(Number.isFinite(data.sourceNormal[index]))
    assert.ok(Number.isFinite(data.targetNormal[index]))
    positionDelta += Math.abs(data.sourcePosition[index] - data.targetPosition[index])
  }
  for (let index = 0; index < data.count; index += 1) {
    const height = (
      data.sourcePosition[index * 3 + 1]
      + data.targetPosition[index * 3 + 1]
    ) / 2
    const particleDelay = data.delay[index]
    heightSum += height
    delaySum += particleDelay
    heightSquaredSum += height * height
    delaySquaredSum += particleDelay * particleDelay
    heightDelaySum += height * particleDelay
  }
  for (let index = 0; index < data.humanColor.length; index += 1) {
    colorDelta += Math.abs(data.humanColor[index] - data.monsterColor[index])
  }
  assert.ok(positionDelta / data.sourcePosition.length > 0.025)
  assert.ok(colorDelta / data.humanColor.length > 4)
  const heightDelayCorrelation = (
    data.count * heightDelaySum - heightSum * delaySum
  ) / Math.sqrt(
    (data.count * heightSquaredSum - heightSum ** 2)
    * (data.count * delaySquaredSum - delaySum ** 2),
  )
  assert.ok(heightDelayCorrelation < -0.99, 'lower points must receive later print delays')
})

test('网页端是一批 GPU 粒子，并复现逐粒子 smootherstep 与中段噪波包络', async () => {
  const component = await readFile(
    projectFile('src/scene/LovecraftParticleMorphBust.tsx'),
    'utf8',
  )

  assert.equal((component.match(/<points\b/g) ?? []).length, 1)
  assert.match(component, /smootherstep01\(\(uProgress - aDelay\) \/ uBrushWidth\)/)
  assert.match(component, /4\.0 \* localProgress \* \(1\.0 - localProgress\)/)
  assert.match(component, /if \(uProgress >= 0\.999999\) localProgress = 1\.0/)
  assert.match(component, /setResponseType\('arraybuffer'\)/)
  assert.match(component, /phase === 'morphing-to-monster' \? 'forward' : 'reverse'/)
  assert.match(component, /uTime\.value = progress \* data\.duration/)
  assert.match(component, /setPhase\(phase === 'morphing-to-monster' \? 'monster' : 'human'\)/)
  assert.match(component, /setPhase\(phase === 'human' \? 'morphing-to-monster' : 'morphing-to-human'\)/)
  assert.match(component, /event\.stopPropagation\(\)/)
})

test('怪物端点把原贴图明暗映射为低明度墨绿色并在反向 morph 时还原人形材质', async () => {
  const component = await readFile(
    projectFile('src/scene/LovecraftParticleMorphBust.tsx'),
    'utf8',
  )

  assert.match(component, /float monsterLuma = dot\(aMonsterColor/)
  assert.match(component, /vec3\(0\.0091, 0\.0123, 0\.0103\)/)
  assert.match(component, /vec3\(0\.0176, 0\.0252, 0\.0232\)/)
  assert.match(component, /vec3\(0\.0452, 0\.1221, 0\.1070\)/)
  assert.match(component, /mix\(aHumanColor, monsterInkColor, localProgress\)/)
  assert.match(component, /vMonsterMix = localProgress/)
  assert.match(component, /rimTint[\s\S]{0,180}vMonsterMix/)
})

test('怪物材质使用目标表面法线形成雕塑级明暗并保留人形端点', async () => {
  const component = await readFile(
    projectFile('src/scene/LovecraftParticleMorphBust.tsx'),
    'utf8',
  )

  assert.match(component, /varying vec2 vMonsterLight/)
  assert.match(component, /normalMatrix \* aTargetNormal/)
  assert.match(component, /monsterKey \* 0\.63/)
  assert.match(component, /monsterFill \* 0\.13/)
  assert.match(component, /monsterHalf12 \* smoothstep/)
  assert.match(component, /float monsterAmount = vMonsterMix \* vMonsterMix/)
  assert.match(component, /mix\(particleDiffuse, monsterDiffuse, monsterAmount\)/)
  assert.match(component, /roughPatinaSpecular[\s\S]{0,120}stableMonster/)
  assert.match(component, /mix\(0\.26, 0\.07, vMonsterMix\)/)
})

test('粒子雕塑作为陈列架子对象进入统一编辑、选择和保存链路', async () => {
  const [assets, app, control, canvas, component, installation] = await Promise.all([
    readFile(projectFile('src/data/studioAssets.ts'), 'utf8'),
    readFile(projectFile('src/App.tsx'), 'utf8'),
    readFile(projectFile('src/ui/editor/StudioEditorControl.tsx'), 'utf8'),
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
    readFile(projectFile('src/scene/LovecraftParticleMorphBust.tsx'), 'utf8'),
    readFile(projectFile('src/scene/DisplayRackInstallation.tsx'), 'utf8'),
  ])

  assert.match(assets, /LOVECRAFT_PARTICLE_BUST_ASSET_ID = 'lovecraft-particle-bust'/)
  assert.match(assets, /label: '洛夫克拉夫特粒子雕塑'/)
  assert.match(assets, /position: \[0, 2\.433, -0\.045\]/)
  assert.match(assets, /rotation: \[0, -0\.603, 0\]/)
  assert.match(assets, /scale: \[0\.62, 0\.62, 0\.62\]/)
  assert.match(assets, /STUDIO_EDITABLE_ASSETS[\s\S]{0,160}LOVECRAFT_PARTICLE_BUST_ASSET/)

  assert.match(app, /createDefaultStudioLayout\(\[[\s\S]{0,100}\.\.\.STUDIO_EDITABLE_ASSETS/)
  assert.match(app, /layoutAssetOptions=\{STUDIO_EDITABLE_ASSETS\}/)
  assert.match(app, /assetOptions=\{STUDIO_ASSETS\}/)
  assert.match(control, /layoutAssetOptions\.map\(\(asset\) =>/)
  assert.match(control, /assetOptions\.some\(\(\{ id \}\) => id === selectedAssetId\)/)

  assert.match(canvas, /studioLayout\[LOVECRAFT_PARTICLE_BUST_ASSET_ID\][\s\S]{0,100}defaultStudioLayout\[LOVECRAFT_PARTICLE_BUST_ASSET_ID\]/)
  assert.match(canvas, /name="lovecraft-particle-bust-rack-space"[\s\S]{0,100}scale=\{DISPLAY_RACK_INSTALLATION_SCALE\}/)
  assert.match(canvas, /ref=\{getEditableGroupRef\(LOVECRAFT_PARTICLE_BUST_ASSET_ID\)\}/)
  assert.match(canvas, /transform=\{lovecraftParticleBustTransform\}/)
  assert.match(canvas, /editing=\{editingLayout\}/)
  assert.match(canvas, /onSelect=\{\(\) => onSelectAsset\(LOVECRAFT_PARTICLE_BUST_ASSET_ID\)\}/)

  assert.match(component, /forwardRef<[\s\S]{0,80}Group,[\s\S]{0,80}LovecraftParticleMorphBustProps/)
  assert.match(component, /position=\{transform\.position\}/)
  assert.match(component, /rotation=\{transform\.rotation\}/)
  assert.match(component, /scale=\{transform\.scale\}/)
  assert.match(component, /if \(editing\) \{[\s\S]{0,80}onSelect\?\.\(\)/)
  assert.match(component, /\{interactive \|\| editing \? \(/)
  assert.doesNotMatch(installation, /LovecraftParticleMorphBust/)
})

test('第二次点击按相同 2.002 秒时间轴精确倒放粒子轨迹', () => {
  const duration = 2.002
  const samples = [0, 0.143, 0.577, 1.001, 1.619, duration]

  for (const elapsed of samples) {
    const forward = resolveParticleMorphProgress('forward', elapsed, duration)
    const reverse = resolveParticleMorphProgress('reverse', elapsed, duration)
    assert.ok(Math.abs(forward + reverse - 1) < Number.EPSILON)
  }

  assert.equal(resolveParticleMorphProgress('forward', 0, duration), 0)
  assert.equal(resolveParticleMorphProgress('forward', duration, duration), 1)
  assert.equal(resolveParticleMorphProgress('reverse', 0, duration), 1)
  assert.equal(resolveParticleMorphProgress('reverse', duration, duration), 0)
})

test('胸像命中时只让同一陈列架的整柜代理让路', () => {
  const rackProxy = {
    object: {
      userData: {
        studioAssetId: 'demonic-display-rack',
        hostChildOcclusionProxy: true,
      },
    },
  }
  const bustProxy = {
    object: {
      userData: {
        hostChildActivationProxy: true,
        hostChildAssetId: 'demonic-display-rack',
      },
    },
  }
  const otherFurniture = {
    object: {
      userData: {
        studioAssetId: 'reliquary-computer',
        hostChildOcclusionProxy: true,
      },
    },
  }
  const hits = [rackProxy, otherFurniture, bustProxy]
  const filtered = filterRelicHostProxyIntersections(hits)

  assert.deepEqual(filtered, [otherFurniture, bustProxy])
  assert.deepEqual(hits, [rackProxy, otherFurniture, bustProxy], 'filter must not mutate hit order')
})

test('当前发布镜头射向胸像下部时，真实代理相交且胸像优先', async () => {
  const publishedScene = JSON.parse(await readFile(
    projectFile('src/data/publishedScene.json'),
    'utf8',
  ))
  const rackTransform = publishedScene.layout['demonic-display-rack']
  const bustTransform = publishedScene.layout['lovecraft-particle-bust']
  const host = new Group()
  host.position.fromArray(rackTransform.position)
  host.rotation.fromArray(rackTransform.rotation)
  host.scale.fromArray(rackTransform.scale)

  const rackProxy = new Mesh(
    new BoxGeometry(1.435, 1.834, 0.336),
    new MeshBasicMaterial(),
  )
  rackProxy.position.y = 1.834 / 2
  rackProxy.userData = {
    studioAssetId: 'demonic-display-rack',
    hostChildOcclusionProxy: true,
  }
  host.add(rackProxy)

  const installation = new Group()
  installation.scale.setScalar(0.7)
  host.add(installation)

  const bust = new Group()
  bust.position.fromArray(bustTransform.position)
  bust.rotation.fromArray(bustTransform.rotation)
  bust.scale.fromArray(bustTransform.scale)
  installation.add(bust)

  const bustProxy = new Mesh(
    new BoxGeometry(1.06, 1.04, 0.96),
    new MeshBasicMaterial(),
  )
  bustProxy.position.set(0, 0.49, -0.04)
  bustProxy.userData = {
    hostChildActivationProxy: true,
    hostChildAssetId: 'demonic-display-rack',
  }
  bust.add(bustProxy)
  host.updateMatrixWorld(true)

  const cameraPosition = new Vector3(10.25, 5.57, 15.08)
  const lowerBustPoint = bust.localToWorld(new Vector3(0, 0.16, -0.04))
  const hits = new Raycaster(
    cameraPosition,
    lowerBustPoint.clone().sub(cameraPosition).normalize(),
  ).intersectObjects([rackProxy, bustProxy], false)

  try {
    assert.ok(hits.some(({ object }) => object === rackProxy))
    assert.ok(hits.some(({ object }) => object === bustProxy))
    const filtered = filterRelicHostProxyIntersections(hits)
    assert.equal(filtered[0].object, bustProxy)
    assert.ok(!filtered.some(({ object }) => object === rackProxy))
  } finally {
    rackProxy.geometry.dispose()
    rackProxy.material.dispose()
    bustProxy.geometry.dispose()
    bustProxy.material.dispose()
  }
})
