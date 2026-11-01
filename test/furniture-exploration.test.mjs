import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { applyProps } from '@react-three/fiber'
import { Mesh } from 'three'

import {
  HIDDEN_RELIC_BY_HOST_ASSET_ID,
  HIDDEN_RELICS,
} from '../src/data/hiddenRelics.ts'

const projectFile = (path) => new URL(`../${path}`, import.meta.url)

test('六件遗物分别绑定唯一且存在的宿主家具', async () => {
  assert.deepEqual(
    HIDDEN_RELICS.map(({ id, hostAssetId }) => [id, hostAssetId]),
    [
      ['tide-index-seal', 'forbidden-bookcase'],
      ['deviant-iris-wheel', 'mechanical-cthulhu-octopus'],
      ['drowned-dream-core', 'tentacle-lamp'],
      ['fingerprint-casket', 'maw-cabinet'],
      ['voice-hyoid', 'cthulhu-wall-mask'],
      ['spinal-clasp', 'vertebral-chair'],
    ],
  )

  const assetSource = await readFile(projectFile('src/data/studioAssets.ts'), 'utf8')
  const assetIds = new Set(
    [...assetSource.matchAll(/id: '([^']+)'/g)].map((match) => match[1]),
  )
  const hostIds = HIDDEN_RELICS.map(({ hostAssetId }) => hostAssetId)
  assert.equal(new Set(hostIds).size, HIDDEN_RELICS.length)
  assert.ok(hostIds.every((hostAssetId) => assetIds.has(hostAssetId)))
  assert.ok(HIDDEN_RELICS.every(({ hostLabel }) => hostLabel.length >= 3))
  assert.equal(HIDDEN_RELIC_BY_HOST_ASSET_ID.size, HIDDEN_RELICS.length)
})

test('家具保留编辑选择层和独立鼠标代理', async () => {
  const source = await readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8')

  assert.match(source, /<Selection>/)
  assert.match(source, /<Select[\s\S]*?name=\{`relic-host:\$\{asset\.id\}`\}/)
  assert.match(source, /enabled=\{editSelected\}/)
  assert.match(source, /name=\{`interaction-proxy:\$\{asset\.id\}`\}/)
  assert.match(source, /const interactionProxySize = isDreamArchiveShelf[\s\S]{0,120}: asset\.placeholderSize/)
  assert.match(source, /<boxGeometry args=\{interactionProxySize\} \/>/)
  assert.match(source, /<meshBasicMaterial[\s\S]{0,100}visible=\{false\}/)
  assert.match(source, /onPointerEnter=\{!editingLayout && \(isDreamArchiveShelf \|\| isVintageTelevision \|\| isHologramTrigger\)/)
  assert.doesNotMatch(source, /mysteryTargetKind|interactionTargetsRef|faceFocused/)
})

test('家具选择层包住完整安装组件，统一轮廓高亮不遗漏机械眼和面具红眼', async () => {
  const [canvas, effects] = await Promise.all([
    readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8'),
    readFile(projectFile('src/scene/PostEffects.tsx'), 'utf8'),
  ])

  const selectStart = canvas.indexOf('<Select')
  const selectEnd = canvas.indexOf('</Select>', selectStart)
  assert.ok(selectStart >= 0 && selectEnd > selectStart)
  const selectedInstallation = canvas.slice(selectStart, selectEnd)
  assert.match(selectedInstallation, /<MechanicalOctopusInstallation asset=\{localAsset\}/)
  assert.match(selectedInstallation, /<CthulhuMaskInstallation asset=\{localAsset\}/)
  assert.match(selectedInstallation, /<MonitorInstallation/)
  assert.match(selectedInstallation, /<DisplayRackInstallation asset=\{localAsset\}/)
  assert.match(selectedInstallation, /<AssetSlot asset=\{localAsset\}/)
  assert.match(canvas, /name=\{`editable-asset:\$\{asset\.id\}`\}/)
  assert.match(canvas, /position=\{transform\.position\}/)
  assert.match(canvas, /rotation=\{transform\.rotation\}/)

  assert.match(effects, /<Outline/)
  assert.doesNotMatch(effects, /outlineEnabled/)
  assert.match(effects, /autoClear=\{false\}/)
  assert.match(effects, /xRay=\{false\}/)
  assert.match(effects, /edgeStrength=\{4\.6\}/)
  assert.match(effects, /pulseSpeed=\{0\.72\}/)
})

test('编辑相册时恢复家具鼠标代理射线', async () => {
  const source = await readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8')

  assert.match(
    source,
    /raycast=\{[\s\S]{0,100}isInteractiveGrimoire && !editingLayout[\s\S]{0,100}\? ignoreStudioProxyRaycast[\s\S]{0,80}: Mesh\.prototype\.raycast/,
  )
  assert.doesNotMatch(source, /mysteryTargetToken|focusedTargetRef|lastTargetKeyRef/)

  const proxy = new Mesh()
  const originalRaycast = proxy.raycast
  const disabledRaycast = () => undefined
  applyProps(proxy, { raycast: disabledRaycast })
  assert.equal(proxy.raycast, disabledRaycast)

  applyProps(proxy, { raycast: Mesh.prototype.raycast })
  assert.equal(proxy.raycast, originalRaycast)
})

test('场景兴趣点已移除，物体自身发光组件继续挂载', async () => {
  const source = await readFile(projectFile('src/scene/StudioCanvas.tsx'), 'utf8')
  assert.doesNotMatch(source, /SceneAccentLights|<HiddenRelics/)
  for (const component of ['CandleSet', 'CandelabraInstallation', 'MechanicalOctopusInstallation', 'CthulhuMaskInstallation', 'InteractiveTentacleLamp']) {
    assert.ok(source.includes(`<${component}`))
  }
})
