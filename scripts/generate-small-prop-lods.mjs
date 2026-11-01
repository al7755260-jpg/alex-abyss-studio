import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { stripLodTextures } from './strip-lod-textures.mjs'

const targets = [
  ['candles/blood-red-pillar-candle', 7],
  ['candles/black-wax-skull-goblet-candle', 1],
  ['candles/staggered-seven-candle-cluster', 1],
  ['display-skulls/cyclopean-tide-grazer-skull', 1],
  ['display-skulls/spiral-antler-oracle-skull', 1],
  ['display-skulls/chitin-maw-brood-skull', 1],
  ['display-skulls/star-devourer-leviathan-skull', 1],
]
const modelUrl = (name) => new URL(`../public/models/${name}.glb`, import.meta.url)
const SIMPLIFICATION = { ratio: 0.15, error: 0.01, normalWeight: 0.25, uvWeight: 1, flags: ['Permissive'] }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])

function meshStats(document) {
  let triangles = 0
  const primitives = []
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const vertexCount = primitive.getAttribute('POSITION').getCount()
      triangles += (primitive.getIndices()?.getCount() ?? vertexCount) / 3
      const attributes = primitive.listSemantics()
      for (const attribute of attributes) {
        assert.equal(primitive.getAttribute(attribute).getCount(), vertexCount)
      }
      primitives.push({ mesh: mesh.getName(), mode: primitive.getMode(), attributes, material: document.getRoot().listMaterials().indexOf(primitive.getMaterial()) })
    }
  }
  return { triangles, primitives }
}

function nodeTransforms(document) {
  return document.getRoot().listNodes().map((node) => ({
    name: node.getName(),
    mesh: node.getMesh()?.getName() ?? null,
    matrix: node.getMatrix(),
    children: node.listChildren().map((child) => child.getName()),
  }))
}

function primitives(document) {
  return document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())
}

function vertexAttributeKeys(primitive) {
  const position = primitive.getAttribute('POSITION')
  const semantics = primitive.listSemantics()
  assert.ok(semantics.some(name => name.startsWith('TEXCOORD_')), 'Textured props must retain UV attributes')
  return Array.from({ length: position.getCount() }, (_, index) => JSON.stringify(
    semantics.map((semantic) => primitive.getAttribute(semantic).getElement(index, [])),
  ))
}

function referencedWorldBounds(document) {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  document.getRoot().getDefaultScene().traverse((node) => {
    const matrix = node.getWorldMatrix()
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute('POSITION')
      const indices = primitive.getIndices()
      for (let cursor = 0; cursor < (indices?.getCount() ?? position.getCount()); cursor++) {
        const vertex = indices ? indices.getScalar(cursor) : cursor
        const [x, y, z] = position.getElement(vertex, [])
        for (let axis = 0; axis < 3; axis++) {
          const value = matrix[axis] * x + matrix[axis + 4] * y + matrix[axis + 8] * z + matrix[axis + 12]
          bounds.min[axis] = Math.min(bounds.min[axis], value)
          bounds.max[axis] = Math.max(bounds.max[axis], value)
        }
      }
    }
  })
  return bounds
}

function simplifyWithTextureAttributes(document) {
  const errors = []
  for (const primitive of primitives(document)) {
    const position = primitive.getAttribute('POSITION')
    const attributes = primitive.listSemantics()
      .filter((name) => name === 'NORMAL' || name.startsWith('TEXCOORD_'))
      .map((name) => ({ name, accessor: primitive.getAttribute(name) }))
    const stride = attributes.reduce((sum, { accessor }) => sum + accessor.getElementSize(), 0)
    const weights = attributes.flatMap(({ name, accessor }) => Array(accessor.getElementSize()).fill(
      name === 'NORMAL' ? SIMPLIFICATION.normalWeight : SIMPLIFICATION.uvWeight,
    ))
    const positions = new Float32Array(position.getCount() * 3)
    const attributeArray = new Float32Array(position.getCount() * stride)
    const extrema = [0, 0, 0, 0, 0, 0]
    for (let index = 0; index < position.getCount(); index++) {
      positions.set(position.getElement(index, []), index * 3)
      for (let axis = 0; axis < 3; axis++) {
        if (positions[index * 3 + axis] < positions[extrema[axis] * 3 + axis]) extrema[axis] = index
        if (positions[index * 3 + axis] > positions[extrema[axis + 3] * 3 + axis]) extrema[axis + 3] = index
      }
      let offset = index * stride
      for (const { accessor } of attributes) {
        attributeArray.set(accessor.getElement(index, []), offset)
        offset += accessor.getElementSize()
      }
    }
    const sourceIndices = new Uint32Array(primitive.getIndices().getArray())
    // Preserve the six axis-extreme points so auto-fit/base placement cannot pop.
    const locks = new Uint8Array(position.getCount())
    for (const index of extrema) locks[index] = 1
    const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
      sourceIndices, positions, 3, attributeArray, stride, weights, locks,
      Math.floor(sourceIndices.length * SIMPLIFICATION.ratio / 3) * 3,
      SIMPLIFICATION.error, SIMPLIFICATION.flags,
    )
    const sourceAccessor = primitive.getIndices()
    primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(sourceAccessor.getBuffer()))
    if (sourceAccessor.listParents().length === 1) sourceAccessor.dispose()
    compactPrimitive(primitive)
    errors.push(error)
  }
  return errors
}

const reports = []
for (const [name, instances] of targets) {
  const sourceUrl = modelUrl(`${name}-optimized`)
  const outputUrl = modelUrl(`${name}-realtime`)
  const originalBytes = await readFile(sourceUrl)
  const sourceHash = sha256(originalBytes)
  const document = await io.read(fileURLToPath(sourceUrl))
  const sourceStats = meshStats(document)
  const originalVertexAttributes = primitives(document).map((primitive) => new Set(vertexAttributeKeys(primitive)))
  stripLodTextures(document)
  const originalNodes = nodeTransforms(document)
  const originalJson = (await io.writeJSON(document)).json
  const originalBounds = referencedWorldBounds(document)

  // Standard topology-only simplification is blocked by the dense normal seams.
  // Permissive simplification evaluates normals and UV error explicitly. It
  // still only selects surviving source vertices: no UVs or texture images move.
  await document.transform(weld())
  const measuredErrors = simplifyWithTextureAttributes(document)
  await io.write(fileURLToPath(outputUrl), document)

  // Verify the bytes delivered to the browser, not just the in-memory transform.
  const delivered = await io.read(fileURLToPath(outputUrl))
  const deliveredStats = meshStats(delivered)
  const deliveredJson = (await io.writeJSON(delivered)).json
  const bounds = referencedWorldBounds(delivered)
  const boundsAxisDelta = originalBounds.min.map((value, axis) => Math.max(
    Math.abs(bounds.min[axis] - value),
    Math.abs(bounds.max[axis] - originalBounds.max[axis]),
  ))
  const maxExtent = Math.max(...originalBounds.max.map((value, axis) => value - originalBounds.min[axis]))
  const maxBoundsDelta = Math.max(...boundsAxisDelta)

  assert.deepEqual(deliveredStats.primitives, sourceStats.primitives, `${name}: primitive/UV layout changed`)
  primitives(delivered).forEach((primitive, index) => {
    assert.ok(vertexAttributeKeys(primitive).every((key) => originalVertexAttributes[index].has(key)), `${name}: vertex position/normal/UV tuple was invented/moved`)
    assert.equal(new Set(primitive.getIndices().getArray()).size, primitive.getAttribute('POSITION').getCount(), `${name}: unreferenced vertices left after compaction`)
  })
  assert.equal(delivered.getRoot().listTextures().length, 0, `${name}: LOD embeds unused textures`)
  assert.deepEqual(deliveredJson.materials, originalJson.materials, `${name}: materials changed`)
  assert.deepEqual(deliveredJson.textures, originalJson.textures, `${name}: texture bindings changed`)
  assert.deepEqual(deliveredJson.samplers, originalJson.samplers, `${name}: texture sampling changed`)
  assert.deepEqual(nodeTransforms(delivered), originalNodes, `${name}: nodes/transforms changed`)
  assert.ok(maxBoundsDelta <= maxExtent * 0.005, `${name}: bounds changed by more than 0.5%`)
  assert.ok(deliveredStats.triangles < sourceStats.triangles, `${name}: no simplification`)
  assert.equal(sha256(await readFile(sourceUrl)), sourceHash, `${name}: original file changed`)

  const report = {
    name, instances, sourceSha256: sourceHash, parameters: SIMPLIFICATION, measuredErrors,
    originalTriangles: sourceStats.triangles,
    realtimeTriangles: deliveredStats.triangles,
    reductionPercent: Number((100 * (1 - deliveredStats.triangles / sourceStats.triangles)).toFixed(3)),
    originalBytes: originalBytes.length,
    realtimeBytes: (await stat(outputUrl)).size,
    originalBounds, realtimeBounds: bounds, boundsAxisDelta,
    maxBoundsDeltaPercent: Number((100 * maxBoundsDelta / maxExtent).toFixed(6)),
    verified: { sourceUntouched: true, uvAttributes: true, survivingFullVertexAttributeTuplesUnchanged: true, everyVertexReferenced: true, boundsFromReferencedIndices: true, noDuplicateTextures: true, materialSlots: true, transforms: true },
  }
  reports.push(report)
  console.log(`${name}: ${report.originalTriangles} -> ${report.realtimeTriangles} triangles (${report.reductionPercent}% removed); bounds ${report.maxBoundsDeltaPercent}%`)
}

const originalTriangles = reports.reduce((sum, report) => sum + report.originalTriangles * report.instances, 0)
const realtimeTriangles = reports.reduce((sum, report) => sum + report.realtimeTriangles * report.instances, 0)
const summary = {
  parameters: SIMPLIFICATION,
  totalInstancedTriangles: { original: originalTriangles, realtime: realtimeTriangles, saved: originalTriangles - realtimeTriangles },
  reports,
}
await writeFile(new URL('./small-prop-lod-report.json', import.meta.url), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary.totalInstancedTriangles))
