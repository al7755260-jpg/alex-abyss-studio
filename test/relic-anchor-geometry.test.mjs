import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Float32BufferAttribute,
  Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3,
} from 'three'

import { HIDDEN_RELICS } from '../src/data/hiddenRelics.ts'
import { createDefaultStudioLayout, resolveAttachedPoint } from '../src/editor/studioLayout.ts'
import {
  LAMP_GLOBE_CENTER, LAMP_RELIC_APERTURE_CENTER, LAMP_RELIC_APERTURE_RADIUS,
  isLampGlobeRayAllowed,
} from '../src/scene/lampGlow.ts'
import {
  DISPLAY_RACK_INSTALLATION_SCALE, DISPLAY_RACK_INTERACTION_SIZE,
} from '../src/scene/displayRackGeometry.ts'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const assetSource = stripTypeScriptTypes((await source('src/data/studioAssets.ts'))
  .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))
  .replaceAll("'./deskSupport'", JSON.stringify(new URL('../src/data/deskSupport.ts', import.meta.url).href))
  .replaceAll("'./candleSupport'", JSON.stringify(new URL('../src/data/candleSupport.ts', import.meta.url).href)))
const { STUDIO_ASSETS } = await import(`data:text/javascript;base64,${Buffer.from(assetSource).toString('base64')}`)
const defaults = createDefaultStudioLayout(STUDIO_ASSETS)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const [lampDocument, rackDocument] = await Promise.all([
  io.read(fileURLToPath(new URL('../public/models/lamp-optimized.glb', import.meta.url))),
  io.read(fileURLToPath(new URL('../public/models/demonic-cthulhu-display-rack-optimized.glb', import.meta.url))),
])

// Frozen regression camera/layout reproduces the reported view without making
// future user-authored placement changes break a geometry regression fixture.
const camera = new Vector3(10.25, 5.57, 15.08)
const lampTransform = { position: [0.7, 0, 0.325], rotation: [0, -0.38, 0], scale: [1, 1, 1] }
const rackTransform = { position: [-2.55, 0, 0.025], rotation: [0, 1.308997, 0], scale: [1.25, 1.25, 1.25] }

function applyRootTransform(root, transform) {
  root.position.fromArray(transform.position)
  root.rotation.fromArray(transform.rotation)
  root.scale.fromArray(transform.scale)
  root.updateMatrixWorld(true)
  return root
}

function loadFittedTriangles(document, fitHeight) {
  const bounds = getBounds(document.getRoot().listScenes()[0])
  const scale = fitHeight / (bounds.max[1] - bounds.min[1])
  const offset = new Vector3(
    -(bounds.min[0] + bounds.max[0]) / 2,
    -bounds.min[1],
    -(bounds.min[2] + bounds.max[2]) / 2,
  )
  const group = new Group()
  const element = []
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const matrix = new Matrix4().fromArray(node.getWorldMatrix())
    for (const primitive of mesh.listPrimitives()) {
      const accessor = primitive.getAttribute('POSITION')
      const positions = []
      for (let index = 0; index < accessor.getCount(); index += 1) {
        // getElement decodes normalized Meshopt/quantized accessors correctly.
        accessor.getElement(index, element)
        positions.push(...new Vector3(...element).applyMatrix4(matrix).add(offset).multiplyScalar(scale).toArray())
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1))
      const surface = new Mesh(geometry, new MeshBasicMaterial())
      surface.name = primitive.getMaterial()?.getName() ?? ''
      group.add(surface)
    }
  }
  return group
}

test('灯遗物提示点处于真实GLB表面前方，不再埋在不透明球笼内部', () => {
  const asset = STUDIO_ASSETS.find(({ id }) => id === 'tentacle-lamp')
  const model = applyRootTransform(loadFittedTriangles(lampDocument, asset.fit.size), lampTransform)
  try {
    const clearanceAt = (localPoint) => {
      const point = model.localToWorld(new Vector3(...localPoint))
      const ray = new Raycaster(camera, point.clone().sub(camera).normalize())
      const hit = ray.intersectObject(model, true)[0]
      assert.ok(hit, 'regression ray must cross the real lamp geometry')
      return hit.distance - camera.distanceTo(point)
    }
    assert.ok(clearanceAt([0.0126, 1.782, 0.04235]) < -0.15, 'old marker must reproduce the cage occlusion')
    assert.ok(clearanceAt(LAMP_RELIC_APERTURE_CENTER) > 0.04, 'new marker core must be entirely in front of the opaque surface')
  } finally {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      object.material.dispose()
    })
  }
})

test('移动旋转缩放灯具后，遗物提示中心与球面开关孔仍重合，球心仍可开关', () => {
  const relic = HIDDEN_RELICS.find(({ id }) => id === 'drowned-dream-core')
  for (const transform of [lampTransform, {
    position: [-1, 0.3, 1.2], rotation: [0.1, 0.7, -0.05], scale: [1.5, 1.5, 1.5],
  }]) {
    const root = applyRootTransform(new Group(), transform)
    const aperture = root.localToWorld(new Vector3(...LAMP_RELIC_APERTURE_CENTER))
    const marker = new Vector3(...resolveAttachedPoint(defaults[relic.hostAssetId], transform, relic.hitPosition))
    assert.ok(marker.distanceTo(aperture) < 0.000002)
    const ray = new Raycaster(camera, marker.clone().sub(camera).normalize()).ray
    const apertureDistance = Math.sqrt(ray.distanceSqToPoint(aperture)) / transform.scale[0]
    const globeCenter = root.localToWorld(new Vector3(...LAMP_GLOBE_CENTER))
    const globeDistance = Math.sqrt(ray.distanceSqToPoint(globeCenter)) / transform.scale[0]
    assert.ok(apertureDistance < LAMP_RELIC_APERTURE_RADIUS)
    assert.equal(isLampGlobeRayAllowed(apertureDistance, globeDistance), false)
  }
  const root = applyRootTransform(new Group(), lampTransform)
  const globeCenter = root.localToWorld(new Vector3(...LAMP_GLOBE_CENTER))
  const aperture = root.localToWorld(new Vector3(...LAMP_RELIC_APERTURE_CENTER))
  const globeRay = new Raycaster(camera, globeCenter.clone().sub(camera).normalize()).ray
  assert.equal(isLampGlobeRayAllowed(Math.sqrt(globeRay.distanceSqToPoint(aperture)), 0), true)
})

test('陈列架点击盒紧贴真实GLB安装尺寸并保留原0.7视觉缩放', async () => {
  const asset = STUDIO_ASSETS.find(({ id }) => id === 'demonic-display-rack')
  const bounds = getBounds(rackDocument.getRoot().listScenes()[0])
  const nativeSize = bounds.max.map((value, axis) => value - bounds.min[axis])
  const fittedSize = nativeSize.map((value, axis) => value * asset.fit.size / nativeSize[1]
    * asset.visualScale[axis] * DISPLAY_RACK_INSTALLATION_SCALE)
  assert.equal(DISPLAY_RACK_INSTALLATION_SCALE, 0.7)
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(DISPLAY_RACK_INTERACTION_SIZE[axis] >= fittedSize[axis])
    assert.ok(DISPLAY_RACK_INTERACTION_SIZE[axis] - fittedSize[axis] < 0.0011)
  }
  const [installation, canvas] = await Promise.all([
    source('src/scene/DisplayRackInstallation.tsx'), source('src/scene/StudioCanvas.tsx'),
  ])
  assert.match(installation, /scale=\{DISPLAY_RACK_INSTALLATION_SCALE\}/)
  assert.match(canvas, /const interactionProxySize = isDreamArchiveShelf[\s\S]{0,100}\? DISPLAY_RACK_INTERACTION_SIZE[\s\S]{0,80}: asset\.placeholderSize/)
  assert.match(canvas, /position=\{\[0, interactionProxySize\[1\] \/ 2, 0\]\}/)
  assert.match(canvas, /<boxGeometry args=\{interactionProxySize\} \/>/)
})

test('左侧视角的禁书架光点不再被陈列架放大的空白点击盒拦截，架身仍可点', () => {
  const root = applyRootTransform(new Group(), rackTransform)
  const makeBox = (size) => {
    const mesh = new Mesh(new BoxGeometry(...size))
    mesh.position.y = size[1] / 2
    root.add(mesh)
    root.updateMatrixWorld(true)
    return mesh
  }
  const oldBox = makeBox([2.05, 2.62, 0.48])
  const newBox = makeBox(DISPLAY_RACK_INTERACTION_SIZE)
  try {
    const leftCamera = new Vector3(-5.596380902, 5.57, 18.5985165258)
    const bookcasePoint = new Vector3(-1.38895, 1.60655, -4.25685)
    const bookcaseRay = new Raycaster(leftCamera, bookcasePoint.clone().sub(leftCamera).normalize())
    assert.ok(bookcaseRay.intersectObject(oldBox).length > 0, 'old oversized proxy must reproduce the false interception')
    assert.equal(bookcaseRay.intersectObject(newBox).length, 0)
    const rackCenter = newBox.getWorldPosition(new Vector3())
    const rackRay = new Raycaster(leftCamera, rackCenter.clone().sub(leftCamera).normalize())
    assert.ok(rackRay.intersectObject(newBox).length > 0, 'ordinary rack clicks must remain available')
  } finally {
    for (const object of [oldBox, newBox]) {
      object.geometry.dispose()
      object.material.dispose()
    }
  }
})
