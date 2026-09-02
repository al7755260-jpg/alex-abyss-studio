import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

test('机械章鱼恢复 LUX3D 原生比例并保持脑腔安全净空', async () => {
  await MeshoptDecoder.ready

  const [assets, installation, document] = await Promise.all([
    readFile(projectFile('src/data/studioAssets.ts'), 'utf8'),
    readFile(projectFile('src/scene/MechanicalOctopusInstallation.tsx'), 'utf8'),
    io.read(fileURLToPath(projectFile(
      'public/models/mechanical-cthulhu-octopus-optimized.glb',
    ))),
  ])

  const assetBlock = assets.match(
    /id: 'mechanical-cthulhu-octopus'[\s\S]*?(?=\n\s*\},\n\s*\{)/,
  )?.[0]
  assert.ok(assetBlock, 'mechanical octopus asset configuration must exist')

  assert.match(assetBlock, /position: \[-0\.2, 3\.006, -2\.85\]/)
  assert.match(assetBlock, /visualScale: \[1, 1, 1\]/)
  assert.match(assetBlock, /fit: \{ axis: 'y', size: 0\.975 \}/)
  assert.doesNotMatch(assetBlock, /visualScale: \[3\.4, 1\.25, 1\.5\]/)

  const scene = document.getRoot().getDefaultScene()
  assert.ok(scene, 'mechanical octopus GLB must have a default scene')

  const bounds = getBounds(scene)
  const rawSize = bounds.max.map((value, axis) => value - bounds.min[axis])
  const uniformScale = 0.975 / rawSize[1]
  const finalSize = rawSize.map((value) => value * uniformScale)

  assert.ok(Math.abs(finalSize[0] / finalSize[1] - rawSize[0] / rawSize[1]) < 1e-9)
  assert.ok(Math.abs(finalSize[2] / finalSize[1] - rawSize[2] / rawSize[1]) < 1e-9)
  assert.ok(Math.abs(finalSize[0] - 1.30878) < 0.001)
  assert.ok(Math.abs(finalSize[1] - 0.975) < 0.000001)
  assert.ok(Math.abs(finalSize[2] - 0.69552) < 0.001)

  const top = 3.006 + finalSize[1]
  const rear = -2.85 - finalSize[2] / 2
  const monitorTop = 2.73903
  // Sampled against the final transformed mechanical head at the octopus
  // centreline. These replace the obsolete clearances from the old brain shell.
  const sampledCranialCeiling = 5.73523
  const sampledRearWall = -4.99739

  assert.ok(sampledCranialCeiling - top >= 1.7)
  assert.ok(rear - sampledRearWall >= 1.7)
  assert.ok(3.006 - monitorTop >= 0.26)

  assert.match(installation, /<AssetSlot asset=\{asset\} \/>/)
  assert.match(installation, /OCTOPUS_EYE_GLOW_POSITION: Vector3Tuple = \[0\.004, 0\.604, 0\.302\]/)
  assert.match(installation, /name="mechanical-octopus-eye-glow-core"/)
  assert.match(installation, /scale=\{\[0\.036, 0\.036, 0\.012\]\}/)
  assert.match(installation, /<sphereGeometry args=\{\[1, 16, 10\]\} \/>/)
  assert.match(installation, /emissive="#91d8e6"/)
  assert.match(installation, /emissiveIntensity=\{1\.6\}/)
  assert.match(installation, /roughness=\{0\.62\}/)
  assert.match(installation, /metalness=\{0\.02\}/)
  assert.match(installation, /raycast=\{ignoreEyeRaycast\}/)
  assert.equal((installation.match(/<sphereGeometry/g) ?? []).length, 1)
  assert.equal((installation.match(/<meshStandardMaterial/g) ?? []).length, 1)
  assert.doesNotMatch(
    installation,
    /DataEyeCore|circleGeometry|ringGeometry|torusGeometry|cylinderGeometry|planeGeometry|transparent|opacity|AdditiveBlending|pointLight|useFrame|<group/,
  )
})
