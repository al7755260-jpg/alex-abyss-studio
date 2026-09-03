/**
 * Repackage GLB textures without re-encoding geometry or changing scene data.
 * Keeps every texture's resolution. Color maps use high-quality WebP; data maps
 * (metalness/roughness, normals, occlusion) use pixel-exact lossless WebP.
 *
 * node scripts/optimize-delivery-textures.mjs --report-dir <outside-repo-dir> [--apply]
 * Without --apply the validated candidates stay in report-dir/staged.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const args = process.argv.slice(2)
const reportArg = args[args.indexOf('--report-dir') + 1]
if (!args.includes('--report-dir') || !reportArg || reportArg.startsWith('--')) throw new Error('Supply --report-dir outside the repository for backups, staged candidates and reports.')
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(project, 'public')
const reportDir = path.resolve(reportArg)
const relativeReportDir = path.relative(project, reportDir)
assert(relativeReportDir.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReportDir), 'Reports/backups must be outside repository')
const apply = args.includes('--apply')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
await MeshoptDecoder.ready
await fs.mkdir(reportDir, { recursive: true })

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const pad = bytes => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4)])
const readGlb = bytes => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim())
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942)
  const bin = bytes.subarray(28 + jsonLength)
  return { json, bin }
}
const writeGlb = ({ json, bin }) => {
  let jsonBytes = Buffer.from(JSON.stringify(json))
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 32)])
  const out = Buffer.alloc(28 + jsonBytes.length + bin.length)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(out.length, 8)
  out.writeUInt32LE(jsonBytes.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  jsonBytes.copy(out, 20)
  out.writeUInt32LE(bin.length, 20 + jsonBytes.length)
  out.writeUInt32LE(0x004e4942, 24 + jsonBytes.length)
  bin.copy(out, 28 + jsonBytes.length)
  return out
}
const byteRange = (bin, view) => bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
const walk = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(async e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat()
const colorSlots = ['baseColorTexture', 'emissiveTexture']
function imageUsage(json, imageIndex) {
  let dataMap = false
  for (const material of json.materials || []) {
    const visit = (object, key = '') => {
      if (!object || typeof object !== 'object') return
      if (typeof object.index === 'number' && key.endsWith('Texture')) {
        const texture = json.textures[object.index]
        if (texture.source === imageIndex && !colorSlots.includes(key)) dataMap = true
      }
      for (const [childKey, value] of Object.entries(object)) visit(value, childKey)
    }
    visit(material)
  }
  return dataMap ? 'data-lossless' : 'color-high-quality'
}
async function rawPixels(bytes) {
  return sharp(bytes, { failOn: 'none' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}
async function convertTexture(bytes, { lossless, quality }) {
  const before = await rawPixels(bytes)
  // Rebuild from pixels: some legacy Lux3D images have invalid color tags.
  const webp = await sharp(before.data, { raw: before.info })
    .webp({ lossless, quality, effort: 6, alphaQuality: 100, smartSubsample: true })
    .toBuffer()
  const after = await rawPixels(webp)
  assert.equal(before.info.width, after.info.width)
  assert.equal(before.info.height, after.info.height)
  let absolute = 0
  let squares = 0
  let count = 0
  for (let i = 0; i < before.data.length; i++) {
    if (i % 4 === 3) {
      assert.equal(after.data[i], before.data[i], 'alpha must be pixel exact')
      continue
    }
    const difference = before.data[i] - after.data[i]
    absolute += Math.abs(difference)
    squares += difference * difference
    count++
  }
  const mae = absolute / count
  const psnr = squares ? 10 * Math.log10(255 * 255 / (squares / count)) : null
  if (lossless) assert.equal(absolute, 0, 'data texture channels must be pixel exact')
  return { webp, metrics: { width: before.info.width, height: before.info.height, mae, psnr, lossless, quality } }
}

async function validate(source, output) {
  const a = readGlb(source)
  const b = readGlb(output)
  const imageViews = new Set((a.json.images || []).map(image => image.bufferView))
  // Verify all authoring data, transforms, material properties and animation
  // accessors. Only the image container descriptors and offsets may change.
  const mutableKeys = new Set(['images', 'textures', 'buffers', 'bufferViews', 'extensionsRequired', 'extensionsUsed'])
  for (const key of new Set([...Object.keys(a.json), ...Object.keys(b.json)])) {
    if (!mutableKeys.has(key)) assert.deepEqual(b.json[key], a.json[key], `scene JSON changed: ${key}`)
  }
  for (let i = 0; i < a.json.bufferViews.length; i++) {
    const av = a.json.bufferViews[i]
    const bv = b.json.bufferViews[i]
    if (imageViews.has(i)) continue
    if (av.buffer === 0) assert.equal(digest(byteRange(a.bin, av)), digest(byteRange(b.bin, bv)), `bufferView ${i} bytes changed`)
    const ac = av.extensions?.EXT_meshopt_compression
    const bc = bv.extensions?.EXT_meshopt_compression
    if (ac?.buffer === 0) assert.equal(digest(byteRange(a.bin, ac)), digest(byteRange(b.bin, bc)), `meshopt bufferView ${i} bytes changed`)
    const normalize = view => {
      const result = structuredClone(view)
      if (result.buffer === 0) delete result.byteOffset
      if (result.extensions?.EXT_meshopt_compression?.buffer === 0) delete result.extensions.EXT_meshopt_compression.byteOffset
      return result
    }
    assert.deepEqual(normalize(bv), normalize(av))
  }
  const sourceDoc = await io.readBinary(source)
  const outputDoc = await io.readBinary(output)
  const sourceAccessors = sourceDoc.getRoot().listAccessors()
  const outputAccessors = outputDoc.getRoot().listAccessors()
  assert.equal(sourceAccessors.length, outputAccessors.length)
  for (let i = 0; i < sourceAccessors.length; i++) {
    const toBytes = accessor => {
      const array = accessor.getArray()
      return Buffer.from(array.buffer, array.byteOffset, array.byteLength)
    }
    assert.equal(digest(toBytes(sourceAccessors[i])), digest(toBytes(outputAccessors[i])), `decoded accessor ${i} changed`)
  }
  return { sceneJsonPreserved: true, geometryBytesPreserved: true, decodedAccessorCount: sourceAccessors.length, nodes: a.json.nodes?.length || 0, meshes: a.json.meshes?.length || 0, skins: a.json.skins?.length || 0, animations: (a.json.animations || []).map(animation => animation.name || '') }
}

async function optimizeGlb(file) {
  const source = await fs.readFile(file)
  const parsed = readGlb(source)
  const json = structuredClone(parsed.json)
  if (!json.images?.length || json.images.every(image => image.mimeType === 'image/webp')) return null
  const replacements = []
  const textures = []
  for (let i = 0; i < json.images.length; i++) {
    const image = json.images[i]
    if (image.mimeType === 'image/webp') continue
    const view = json.bufferViews[image.bufferView]
    assert.equal(view.buffer, 0, 'only embedded GLB image views are supported')
    const bytes = byteRange(parsed.bin, view)
    const usage = imageUsage(json, i)
    const quality = /environment|grimoire/.test(file) ? 95 : 92
    let converted = await convertTexture(bytes, { lossless: usage === 'data-lossless', quality })
    // Protect fine texture detail. If the high-quality image misses the pixel
    // bound, lossless compression is the safe fallback (no resolution change).
    if (!converted.metrics.lossless && (converted.metrics.mae > 2.8 || converted.metrics.psnr < 35)) {
      converted = await convertTexture(bytes, { lossless: true, quality: 100 })
    }
    if (converted.webp.length >= bytes.length) {
      textures.push({ image: i, usage, before: bytes.length, after: bytes.length, retainedOriginal: true, ...converted.metrics })
      continue
    }
    replacements.push({ index: i, view: image.bufferView, oldStart: view.byteOffset || 0, oldLength: view.byteLength, bytes: converted.webp })
    textures.push({ image: i, usage, before: bytes.length, after: converted.webp.length, ...converted.metrics })
  }
  if (!replacements.length) return null
  replacements.sort((a, b) => a.oldStart - b.oldStart)
  const parts = []
  let cursor = 0
  let newCursor = 0
  for (const replacement of replacements) {
    assert(replacement.oldStart >= cursor, 'image views must not overlap')
    const prefix = parsed.bin.subarray(cursor, replacement.oldStart)
    parts.push(prefix)
    newCursor += prefix.length
    replacement.newStart = newCursor
    const padded = pad(replacement.bytes)
    parts.push(padded)
    newCursor += padded.length
    // Include original 4-byte padding in the replaced range.
    replacement.oldEnd = Math.ceil((replacement.oldStart + replacement.oldLength) / 4) * 4
    replacement.delta = padded.length - (replacement.oldEnd - replacement.oldStart)
    cursor = replacement.oldEnd
  }
  parts.push(parsed.bin.subarray(cursor))
  const bin = Buffer.concat(parts)
  const remap = offset => offset + replacements.filter(r => r.oldEnd <= offset).reduce((n, r) => n + r.delta, 0)
  for (let i = 0; i < json.bufferViews.length; i++) {
    const view = json.bufferViews[i]
    const replacement = replacements.find(r => r.view === i)
    if (replacement) {
      view.byteOffset = replacement.newStart
      view.byteLength = replacement.bytes.length
    } else if (view.buffer === 0) {
      const start = view.byteOffset || 0
      assert(!replacements.some(r => start < r.oldEnd && start + view.byteLength > r.oldStart), 'non-image data must not overlap image storage')
      view.byteOffset = remap(start)
    }
    const compressed = view.extensions?.EXT_meshopt_compression
    if (compressed?.buffer === 0) compressed.byteOffset = remap(compressed.byteOffset || 0)
  }
  json.buffers[0].byteLength = bin.length
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'EXT_texture_webp'])]
  json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), 'EXT_texture_webp'])]
  for (const replacement of replacements) {
    json.images[replacement.index].mimeType = 'image/webp'
    for (const texture of json.textures || []) {
      if (texture.source !== replacement.index) continue
      texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: replacement.index } }
      delete texture.source
    }
  }
  const output = writeGlb({ json, bin })
  const validation = await validate(source, output)
  const relative = path.relative(publicRoot, file)
  const staged = path.join(reportDir, 'staged', relative)
  const backup = path.join(reportDir, 'backup', relative)
  await fs.mkdir(path.dirname(staged), { recursive: true })
  await fs.mkdir(path.dirname(backup), { recursive: true })
  await fs.copyFile(file, backup, 1).catch(error => { if (error.code !== 'EEXIST') throw error })
  await fs.writeFile(staged, output)
  if (apply) await fs.copyFile(staged, file)
  return { file: relative.replaceAll('\\', '/'), before: source.length, after: output.length, savedPercent: (1-output.length/source.length)*100, textures, validation }
}

const report = { applied: apply, files: [], images: [] }
for (const file of (await walk(path.join(publicRoot, 'models'))).filter(file => file.endsWith('.glb'))) {
  const result = await optimizeGlb(file)
  if (!result) continue
  report.files.push(result)
  await fs.writeFile(path.join(reportDir, 'texture-optimization.json'), JSON.stringify(report, null, 2))
  console.log(`${result.file}: ${(result.before/1048576).toFixed(2)} -> ${(result.after/1048576).toFixed(2)} MiB (${result.savedPercent.toFixed(1)}%); ${result.validation.decodedAccessorCount} accessors exact`)
}

for (const relative of [
  'images/grimoire-memories/demonic-open-book-v1.png',
  'images/grimoire-memories/memory-01-water.jpg',
  'images/grimoire-memories/memory-02-rain.jpg',
  'images/grimoire-memories/memory-03-city.jpg',
]) {
  const file = path.join(publicRoot, relative)
  const source = await fs.readFile(file)
  const converted = await convertTexture(source, { lossless: false, quality: 92 })
  if (converted.webp.length >= source.length) {
    report.images.push({ file: relative, before: source.length, after: source.length, candidateBytes: converted.webp.length, retainedOriginal: true, ...converted.metrics })
    console.log(`${relative}: original already smaller; retained`)
    continue
  }
  const targetRelative = relative.replace(/\.(png|jpg)$/, '.webp')
  const staged = path.join(reportDir, 'staged', targetRelative)
  await fs.mkdir(path.dirname(staged), { recursive: true })
  await fs.writeFile(staged, converted.webp)
  if (apply) await fs.copyFile(staged, path.join(publicRoot, targetRelative))
  report.images.push({ file: relative, target: targetRelative, before: source.length, after: converted.webp.length, ...converted.metrics })
  console.log(`${relative}: ${(source.length/1048576).toFixed(2)} -> ${(converted.webp.length/1048576).toFixed(2)} MiB; original retained`)
}
report.before = report.files.reduce((n, file) => n + file.before, 0)
report.after = report.files.reduce((n, file) => n + file.after, 0)
await fs.writeFile(path.join(reportDir, 'texture-optimization.json'), JSON.stringify(report, null, 2))
console.log(`GLB total: ${(report.before/1048576).toFixed(2)} -> ${(report.after/1048576).toFixed(2)} MiB; ${(100*(1-report.after/report.before)).toFixed(1)}% reduction; apply=${apply}`)
