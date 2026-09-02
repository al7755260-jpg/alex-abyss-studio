import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { resolve } from 'node:path'

const [inputArg, outputArg, maxSizeArg] = process.argv.slice(2)

if (!inputArg || !outputArg || !maxSizeArg) {
  throw new Error(
    'Usage: node scripts/resize-gltf-textures.mjs <input.glb> <output.glb> <max-size>',
  )
}

const maxSize = Number(maxSizeArg)
if (!Number.isInteger(maxSize) || maxSize < 128 || maxSize > 8192) {
  throw new Error(`Invalid texture size: ${maxSizeArg}`)
}

await MeshoptEncoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

const inputPath = resolve(inputArg)
const outputPath = resolve(outputArg)
const document = await io.read(inputPath)
let resizedTextureCount = 0

for (const texture of document.getRoot().listTextures()) {
  const image = texture.getImage()
  if (!image) continue

  const sourceMimeType = texture.getMimeType()

  const decoded = await sharp(image, { failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (decoded.info.width <= maxSize && decoded.info.height <= maxSize) continue

  // Rebuild from raw pixels before resizing. Some Tripo PNG files contain a
  // non-standard colourspace tag that libvips refuses to resize directly.
  const pipeline = sharp(decoded.data, {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels,
    },
  })
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })

  const outputIsJpeg = sourceMimeType === 'image/jpeg'
  const resized = await (outputIsJpeg
    ? pipeline.jpeg({ quality: 88, mozjpeg: true })
    : pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }))
    .toBuffer()

  texture.setImage(resized)
  texture.setMimeType(outputIsJpeg ? 'image/jpeg' : 'image/png')
  resizedTextureCount += 1
}

await io.write(outputPath, document)
console.log(`Resized ${resizedTextureCount} texture(s) to <= ${maxSize}px: ${outputPath}`)
