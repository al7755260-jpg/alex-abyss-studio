import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { Group, Mesh, Raycaster, Sphere, Vector3 } from 'three'
import { LAMP_GLOBE_CENTER, LAMP_GLOBE_INTERACTION_RADIUS, LAMP_RELIC_APERTURE_CENTER } from '../src/scene/lampGlow.ts'

const lampSource = await readFile(new URL('../src/scene/InteractiveTentacleLamp.tsx', import.meta.url), 'utf8')
const start = lampSource.indexOf('const lampRaycastSphere')
const end = lampSource.indexOf('function LampGlobeLight', start)
assert.ok(start >= 0 && end > start)
// Run the production raycast, including its world-scale and near/far handling.
const lampRaycast = new Function('Sphere', 'Vector3', 'LAMP_GLOBE_INTERACTION_RADIUS',
  `${stripTypeScriptTypes(lampSource.slice(start, end))}; return lampGlobeRaycast`,
)(Sphere, Vector3, LAMP_GLOBE_INTERACTION_RADIUS)

for (const [hostScale, visualScale] of [
  [[0.35, 0.35, 0.35], [1, 1, 1]], [[0.5, 0.5, 0.5], [1, 1, 1]],
  [[1, 1, 1], [1, 1, 1]], [[2, 2, 2], [1, 1, 1]],
  [[0.35, 0.5, 0.4], [1, 1, 1]], [[1.2, 0.7, 1.6], [0.8, 1.1, 0.9]],
]) {
  test(`灯球缩放 ${hostScale} / ${visualScale}：球心与原光点均可开关灯，球外不误触`, () => {
    const root = new Group(); root.position.set(0.7, 0, 0.325); root.rotation.set(0, -0.38, 0); root.scale.fromArray(hostScale)
    const visualRoot = new Group(); visualRoot.scale.fromArray(visualScale); root.add(visualRoot)
    const globe = new Mesh(); globe.position.fromArray(LAMP_GLOBE_CENTER); globe.raycast = lampRaycast; visualRoot.add(globe); root.updateMatrixWorld(true)
    const camera = new Vector3(10.25, 5.57, 15.08)
    const center = globe.getWorldPosition(new Vector3())
    const oldCluePosition = visualRoot.localToWorld(new Vector3(...LAMP_RELIC_APERTURE_CENTER))
    const cast = (target, near = 0, far = Infinity) => new Raycaster(camera, target.clone().sub(camera).normalize(), near, far).intersectObject(globe)
    try {
      assert.equal(cast(center).length, 1)
      assert.equal(cast(oldCluePosition).length, 1, 'removing collection must not leave a dead click zone in the light')
      const scale = globe.getWorldScale(new Vector3())
      const right = center.clone().sub(camera).normalize().cross(new Vector3(0, 1, 0)).normalize()
      assert.equal(cast(center.clone().addScaledVector(right, LAMP_GLOBE_INTERACTION_RADIUS * Math.max(scale.x, scale.y, scale.z) * 2)).length, 0)
      assert.equal(cast(center, 0, 0.01).length, 0)
      assert.equal(cast(center, 1000).length, 0)
    } finally { globe.geometry.dispose(); globe.material.dispose() }
  })
}
