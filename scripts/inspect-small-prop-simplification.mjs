import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
import { fileURLToPath } from 'node:url'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready])
const names = [
  'candles/blood-red-pillar-candle', 'candles/black-wax-skull-goblet-candle',
  'candles/staggered-seven-candle-cluster', 'display-skulls/cyclopean-tide-grazer-skull',
  'display-skulls/spiral-antler-oracle-skull', 'display-skulls/chitin-maw-brood-skull',
  'display-skulls/star-devourer-leviathan-skull',
]
for (const name of names) {
  const trials = []
  for (const error of [0.001, 0.005, 0.01]) {
    const document = await io.read(fileURLToPath(new URL(`../public/models/${name}-optimized.glb`, import.meta.url)))
    const count = () => document.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0)
    const original = count()
    await document.transform(weld())
    for (const primitive of document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives())) {
      const position = primitive.getAttribute('POSITION')
      const uv = primitive.getAttribute('TEXCOORD_0')
      const normal = primitive.getAttribute('NORMAL')
      const positions = new Float32Array(position.getCount() * 3)
      const attributes = new Float32Array(position.getCount() * 5)
      const scratch = []
      for (let index = 0; index < position.getCount(); index++) {
        positions.set(position.getElement(index, scratch), index * 3)
        attributes.set(normal.getElement(index, scratch), index * 5)
        scratch.length = 2
        attributes.set(uv.getElement(index, scratch), index * 5 + 3)
        scratch.length = 3
      }
      const sourceIndices = new Uint32Array(primitive.getIndices().getArray())
      const [indices] = MeshoptSimplifier.simplifyWithAttributes(sourceIndices, positions, 3, attributes, 5, [0.25, 0.25, 0.25, 1, 1], null, Math.floor(sourceIndices.length * 0.15 / 3) * 3, error, ['Permissive'])
      primitive.getIndices().setArray(indices)
    }
    trials.push({ error, original, triangles: count() })
  }
  console.log(name, JSON.stringify(trials))
}
