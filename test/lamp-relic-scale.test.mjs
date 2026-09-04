import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { Group, Mesh, Raycaster, Sphere, Vector3 } from 'three'
import {
  LAMP_GLOBE_CENTER, LAMP_GLOBE_INTERACTION_RADIUS,
  LAMP_RELIC_APERTURE_CENTER, LAMP_RELIC_APERTURE_RADIUS,
  isLampGlobeRayAllowed, resolveLampRelicWorldRadius,
} from '../src/scene/lampGlow.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [relicSource, lampSource, canvasSource] = await Promise.all([
  source('src/scene/HiddenRelics.tsx'), source('src/scene/InteractiveTentacleLamp.tsx'),
  source('src/scene/StudioCanvas.tsx'),
])

// Execute the actual component raycast functions, not simplified copies. Their
// only dependencies are Three geometry primitives and the public lamp constants.
const extract = (code, start, end) => {
  const startIndex = code.indexOf(start)
  const endIndex = code.indexOf(end, startIndex)
  assert.ok(startIndex >= 0 && endIndex > startIndex)
  return stripTypeScriptTypes(code.slice(startIndex, endIndex))
}
const relicRaycast = new Function('Sphere', 'Vector3', `${extract(
  relicSource, 'const relicRaycastSphere', 'function RelicHintLight',
)}; return relicProxyRaycast`)(Sphere, Vector3)
const lampRaycast = new Function(
  'Sphere', 'Vector3', 'LAMP_RELIC_APERTURE_CENTER', 'LAMP_GLOBE_CENTER',
  'LAMP_GLOBE_INTERACTION_RADIUS', 'isLampGlobeRayAllowed',
  `${extract(lampSource, 'const lampRaycastSphere', 'function LampGlobeLight')}; return lampGlobeRaycast`,
)(Sphere, Vector3, LAMP_RELIC_APERTURE_CENTER, LAMP_GLOBE_CENTER,
  LAMP_GLOBE_INTERACTION_RADIUS, isLampGlobeRayAllowed)

const camera = new Vector3(10.25, 5.57, 15.08)
function makeFixture(hostScale, visualScale = [1, 1, 1]) {
  const root = new Group()
  root.position.set(0.7, 0, 0.325)
  root.rotation.set(0, -0.38, 0)
  root.scale.fromArray(hostScale)
  const visualRoot = new Group()
  visualRoot.scale.fromArray(visualScale)
  root.add(visualRoot)
  const globe = new Mesh()
  globe.position.fromArray(LAMP_GLOBE_CENTER)
  globe.raycast = lampRaycast
  visualRoot.add(globe)
  root.updateMatrixWorld(true)

  const worldRadius = resolveLampRelicWorldRadius(hostScale, visualScale)
  const marker = new Mesh()
  marker.position.copy(visualRoot.localToWorld(new Vector3(...LAMP_RELIC_APERTURE_CENTER)))
  marker.userData.relicHitRadius = worldRadius
  marker.raycast = relicRaycast
  marker.updateMatrixWorld(true)
  const measuredScale = globe.getWorldScale(new Vector3())
  const worldScale = Math.max(measuredScale.x, measuredScale.y, measuredScale.z)
  assert.ok(Math.abs(worldRadius - LAMP_RELIC_APERTURE_RADIUS * worldScale) < 1e-12,
    'editor scale and nested visualScale must match the globe proxy matrix')

  return {
    globe, marker, worldScale, worldRadius,
    cast(target) {
      const ray = new Raycaster(camera, target.clone().sub(camera).normalize())
      return { ray, globeHits: ray.intersectObject(globe), relicHits: ray.intersectObject(marker) }
    },
    dispose() {
      for (const mesh of [globe, marker]) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    },
  }
}

for (const scale of [0.35, 0.5, 1, 2]) {
  test(`灯缩放${scale}：实际球心射线只开灯，提示点射线只激活遗物`, () => {
    const fixture = makeFixture([scale, scale, scale])
    try {
      const center = fixture.globe.getWorldPosition(new Vector3())
      const centerHits = fixture.cast(center)
      assert.ok(centerHits.globeHits.length > 0)
      assert.equal(centerHits.relicHits.length, 0)
      const markerHits = fixture.cast(fixture.marker.position)
      assert.ok(markerHits.relicHits.length > 0)
      assert.equal(markerHits.globeHits.length, 0)

      if (scale < 1) {
        fixture.marker.userData.relicHitRadius = LAMP_RELIC_APERTURE_RADIUS
        const legacy = fixture.cast(center)
        assert.ok(legacy.relicHits.length > 0, 'fixed world radius must reproduce the scaled-down bug')
        assert.ok(legacy.relicHits[0].distance < legacy.globeHits[0].distance)
      }
    } finally {
      fixture.dispose()
    }
  })
}

for (const [hostScale, visualScale] of [
  [[0.35, 0.5, 0.4], [1, 1, 1]],
  [[1.2, 0.7, 1.6], [0.8, 1.1, 0.9]],
]) {
  test(`非均匀宿主${hostScale}与visualScale${visualScale}：两种真实射线入口没有重叠`, () => {
    const fixture = makeFixture(hostScale, visualScale)
    try {
      const center = fixture.globe.getWorldPosition(new Vector3())
      const toward = center.clone().sub(camera).normalize()
      const right = toward.clone().cross(new Vector3(0, 1, 0)).normalize()
      const up = right.clone().cross(toward).normalize()
      let lampHits = 0
      let relicHits = 0
      for (const x of [-1, -0.65, -0.3, 0, 0.3, 0.65, 1]) {
        for (const y of [-1, -0.65, -0.3, 0, 0.3, 0.65, 1]) {
          const extent = LAMP_GLOBE_INTERACTION_RADIUS * fixture.worldScale
          const target = center.clone().addScaledVector(right, x * extent).addScaledVector(up, y * extent)
          const result = fixture.cast(target)
          if (result.globeHits.length) lampHits += 1
          if (result.relicHits.length) relicHits += 1
          assert.ok(!(result.globeHits.length && result.relicHits.length),
            'a ray must never toggle the lamp and activate its relic simultaneously')
        }
      }
      assert.ok(lampHits > 0 && relicHits > 0)
    } finally {
      fixture.dispose()
    }
  })
}

test('只有灯使用编辑根组和visualScale计算的世界半径，其它遗物半径规则不变', () => {
  assert.equal(resolveLampRelicWorldRadius(), LAMP_RELIC_APERTURE_RADIUS)
  assert.throws(() => resolveLampRelicWorldRadius([0, 1, 1]), RangeError)
  assert.throws(() => resolveLampRelicWorldRadius([1, 1, 1], [1, Number.NaN, 1]), RangeError)
  assert.match(canvasSource, /const lampTransform = studioLayout\['tentacle-lamp'\] \?\? defaultStudioLayout\['tentacle-lamp'\]/)
  assert.match(canvasSource, /resolveLampRelicWorldRadius\(\s*lampTransform\?\.scale,\s*LOCAL_STUDIO_ASSET_BY_ID\.get\('tentacle-lamp'\)\?\.visualScale/)
  assert.match(canvasSource, /lampRelicWorldRadius=\{lampRelicWorldRadius\}/)
  assert.match(relicSource, /lampRelicWorldRadius = LAMP_RELIC_APERTURE_RADIUS/)
  assert.match(relicSource, /isFingerprintCasket\s*\? 0\.75\s*: isDrownedDreamCore\s*\? lampRelicWorldRadius \/ relic\.hitRadius\s*: RELIC_ACTIVATION_RADIUS_SCALE/)
  assert.match(lampSource, /<group scale=\{asset\.visualScale \?\? \[1, 1, 1\]\}/)
})
