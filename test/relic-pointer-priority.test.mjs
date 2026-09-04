import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { BoxGeometry, Group, Mesh, Raycaster, SphereGeometry, Vector3 } from 'three'

import { HIDDEN_RELICS } from '../src/data/hiddenRelics.ts'
import { createDefaultStudioLayout, resolveAttachedPoint } from '../src/editor/studioLayout.ts'
import { resolveChairSwivelPoint } from '../src/scene/chairRotation.ts'
import { filterRelicHostProxyIntersections } from '../src/scene/relicPointerEvents.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
// Import the real Vite-authored asset data, substituting only its URL prefix and
// resolving its two extensionless imports for Node. No duplicate geometry sizes.
const assetSource = stripTypeScriptTypes((await source('src/data/studioAssets.ts'))
  .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))
  .replaceAll("'./deskSupport'", JSON.stringify(new URL('../src/data/deskSupport.ts', import.meta.url).href))
  .replaceAll("'./candleSupport'", JSON.stringify(new URL('../src/data/candleSupport.ts', import.meta.url).href)))
const { STUDIO_ASSETS } = await import(`data:text/javascript;base64,${Buffer.from(assetSource).toString('base64')}`)
const defaults = createDefaultStudioLayout(STUDIO_ASSETS)
const published = JSON.parse(await source('src/data/publishedScene.json')).layout
const defaultCamera = new Vector3(10.25, 5.57, 15.08)

function createTargetFixture(relicId, { angle = 0, active = true, layout = published } = {}) {
  const relic = HIDDEN_RELICS.find(({ id }) => id === relicId)
  const asset = STUDIO_ASSETS.find(({ id }) => id === relic.hostAssetId)
  const currentTransform = layout[asset.id]
  const defaultTransform = defaults[asset.id]
  const point = new Vector3(...(relicId === 'spinal-clasp'
    ? resolveChairSwivelPoint(relic.hitPosition, [0, 0.438, 0], angle, { defaultTransform, currentTransform })
    : resolveAttachedPoint(defaultTransform, currentTransform, relic.hitPosition)))

  const hostRoot = new Group()
  hostRoot.position.fromArray(currentTransform.position)
  hostRoot.rotation.fromArray(currentTransform.rotation)
  hostRoot.scale.fromArray(currentTransform.scale)
  const body = new Mesh(new BoxGeometry(...asset.placeholderSize))
  body.position.y = asset.placeholderSize[1] / 2
  body.userData = {
    studioAssetId: asset.id,
    interactionProxy: true,
    relicHostOcclusionProxy: true,
  }
  hostRoot.add(body)
  hostRoot.updateMatrixWorld(true)

  const radius = relic.hitRadius * (relicId === 'fingerprint-casket' ? 0.75 : 2)
  const marker = new Mesh(new SphereGeometry(radius, 36, 24))
  marker.position.copy(point)
  marker.userData = { relicActivationProxy: active, relicHostAssetId: asset.id }
  marker.updateMatrixWorld(true)

  return {
    relic, asset, point, marker, body, hostRoot,
    raycast(target = point, objects = [body, marker]) {
      return new Raycaster(defaultCamera, target.clone().sub(defaultCamera).normalize())
        .intersectObjects(objects, false)
    },
    dispose() {
      body.geometry.dispose()
      body.material.dispose()
      marker.geometry.dispose()
      marker.material.dispose()
    },
  }
}

for (const relicId of ['fingerprint-casket', 'spinal-clasp']) {
  test(`${relicId}：当前发布摆放的真实中心射线不再被同宿主整盒截获`, () => {
    const fixture = createTargetFixture(relicId)
    try {
      const hits = fixture.raycast()
      assert.equal(hits[0].object, fixture.body, 'fixture must reproduce the original coarse-box obstruction')
      assert.ok(hits.some(({ object }) => object === fixture.marker))
      const originalOrder = hits.slice()
      const filtered = filterRelicHostProxyIntersections(hits)
      assert.equal(filtered[0].object, fixture.marker)
      assert.ok(!filtered.some(({ object }) => object === fixture.body))
      assert.deepEqual(hits, originalOrder, 'filter must not mutate R3F intersections')
    } finally {
      fixture.dispose()
    }
  })
}

test('非光点区域仍命中家具，未开启或已隐藏的遗物不能抢走家具点击', () => {
  const fixture = createTargetFixture('fingerprint-casket')
  try {
    const topOfCabinet = fixture.hostRoot.localToWorld(new Vector3(0, 1.25, 0))
    const outsideHits = fixture.raycast(topOfCabinet)
    assert.ok(outsideHits.some(({ object }) => object === fixture.body))
    assert.ok(!outsideHits.some(({ object }) => object === fixture.marker))
    assert.equal(filterRelicHostProxyIntersections(outsideHits), outsideHits)

    // A closed cabinet ignores relic raycasts; found and moving-chair markers
    // are unmounted. Both states leave only the host's ordinary click target.
    const hiddenHits = fixture.raycast(fixture.point, [fixture.body])
    assert.equal(filterRelicHostProxyIntersections(hiddenHits), hiddenHits)
    fixture.marker.userData.relicActivationProxy = false
    const inactiveHits = fixture.raycast()
    assert.equal(filterRelicHostProxyIntersections(inactiveHits), inactiveHits)
    assert.equal(inactiveHits[0].object, fixture.body)
  } finally {
    fixture.dispose()
  }
})

test('仅同宿主粗盒被移除：其它家具、真实表面和原始遮挡顺序保持不变', () => {
  const fixture = createTargetFixture('spinal-clasp')
  const otherHost = new Mesh(new BoxGeometry(0.5, 0.5, 0.5))
  const realSurface = new Mesh(new BoxGeometry(0.2, 0.2, 0.2))
  try {
    otherHost.position.copy(defaultCamera).lerp(fixture.point, 0.5)
    otherHost.userData = { studioAssetId: 'maw-cabinet', relicHostOcclusionProxy: true }
    otherHost.updateMatrixWorld(true)
    realSurface.position.copy(defaultCamera).lerp(fixture.point, 0.6)
    realSurface.userData = { studioAssetId: fixture.asset.id }
    realSurface.updateMatrixWorld(true)
    const hits = fixture.raycast(fixture.point, [fixture.body, fixture.marker, otherHost, realSurface])
    const expected = hits.filter(({ object }) => object !== fixture.body)
    const filtered = filterRelicHostProxyIntersections(hits)
    assert.deepEqual(filtered, expected)
    assert.equal(filtered[0].object, otherHost, 'a relic must not jump through another interactive host')
    assert.ok(filtered.some(({ object }) => object === realSurface))
  } finally {
    fixture.dispose()
    otherHost.geometry.dispose()
    otherHost.material.dispose()
    realSurface.geometry.dispose()
    realSurface.material.dispose()
  }
})

test('椅子每次120度转动后，实际射线仍能命中旋转后的光点', () => {
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3, Math.PI * 2]) {
    const fixture = createTargetFixture('spinal-clasp', { angle })
    try {
      const filtered = filterRelicHostProxyIntersections(fixture.raycast())
      assert.equal(filtered[0].object, fixture.marker)
      if (angle > 0 && angle < Math.PI * 2) {
        const unrotated = new Vector3(...resolveAttachedPoint(
          defaults[fixture.asset.id], published[fixture.asset.id], fixture.relic.hitPosition,
        ))
        assert.ok(unrotated.distanceTo(fixture.point) > 0.9, 'old camera-focus target must differ significantly')
      }
    } finally {
      fixture.dispose()
    }
  }
})

test('改变宿主位置、缩放、角度后仅针对当前命中点让出家具粗盒', () => {
  const layout = {
    ...published,
    'vertebral-chair': {
      position: [1.5, 0.2, -0.4],
      rotation: [0.1, -0.7, 0.04],
      scale: [1.7, 1.7, 1.7],
    },
  }
  const fixture = createTargetFixture('spinal-clasp', { layout, angle: Math.PI * 2 / 3 })
  try {
    const filtered = filterRelicHostProxyIntersections(fixture.raycast())
    assert.equal(filtered[0].object, fixture.marker)
  } finally {
    fixture.dispose()
  }
})

test('R3F连接稳定事件过滤器，柜门/转动门控保留，镜头与可见光点共用已提交坐标', async () => {
  const [canvas, relics, cabinet, chair] = await Promise.all([
    source('src/scene/StudioCanvas.tsx'), source('src/scene/HiddenRelics.tsx'),
    source('src/scene/InteractiveCabinet.tsx'), source('src/scene/InteractiveChair.tsx'),
  ])
  assert.match(canvas, /const studioPointerEvents = \(store: RootStore\) => \(\{[\s\S]{0,160}filter: filterRelicHostProxyIntersections/)
  assert.match(canvas, /events=\{studioPointerEvents\}/)
  assert.match(relics, /relicActivationProxy: pointerEnabled/)
  assert.match(relics, /relicHostAssetId: relic\.hostAssetId/)
  assert.match(relics, /const pointerEnabled = !isFingerprintCasket \|\| fingerprintCasketAccessible/)
  assert.match(relics, /if \(found\.has\(relic\.id\) \|\| suppressed\.has\(relic\.id\)\) return null/)
  assert.match(canvas, /suppressedRelicIds=\{chairTurning \? CHAIR_TURNING_SUPPRESSED_RELIC_IDS : undefined\}/)
  assert.match(cabinet, /cabinetToggleProxy: true,[\s\S]{0,80}relicHostOcclusionProxy: true/)
  assert.match(chair, /chairTurnProxy: true,[\s\S]{0,80}relicHostOcclusionProxy: true/)
  assert.match(canvas, /relicHitPositionsRef\.current = resolvedRelicHitPositions/)
  assert.match(canvas, /hitPositions=\{resolvedRelicHitPositions\}/)
  assert.match(canvas, /const resolvedHitPosition = relicHitPositionsRef\.current\.get\(relicId\) \?\? \(/)
  assert.match(canvas, /toTarget: new Vector3\(\.\.\.resolvedHitPosition\)/)
})
