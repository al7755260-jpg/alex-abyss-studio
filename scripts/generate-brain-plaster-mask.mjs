import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import {
  Box3,
  Euler,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = resolve(
  projectRoot,
  'public/models/environment/alex-open-brain-shell-optimized.glb',
)
const outputPath = resolve(
  projectRoot,
  'public/models/environment/alex-open-brain-shell-plaster-mask.png',
)

const VIEWPORT_WIDTH = 1280
const VIEWPORT_HEIGHT = 720
const MASK_MAX_SIZE = 1024
const TARGET_SIZE = new Vector3(12.2, 11.736, 10.1)
const WORLD_POSITION = new Vector3(-1.43, -4.360784632, -0.55)
const WORLD_ROTATION = new Euler(-0.07723, 0.08, 0.0113)
const CAMERA_POSITION = new Vector3(10.25, 5.57, 15.08)
const CAMERA_TARGET = new Vector3(-0.42, 1.48, -0.72)

// Screen-space outline of the intact human half. Visibility testing below
// removes the brain cavity behind it; the texture classifier removes hair,
// eyes, metal and clothing while retaining the face and ear.
const FACE_POLYGON = [
  [334, 173],
  [374, 137],
  [470, 115],
  [515, 155],
  [522, 420],
  [485, 475],
  [435, 505],
  [380, 490],
  [340, 440],
  [320, 380],
  [288, 330],
  [288, 260],
  [315, 220],
]

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const document = await io.read(modelPath)
const node = document.getRoot().listNodes().find((candidate) => candidate.getMesh())
if (!node) throw new Error('Brain-shell mesh node was not found')

const primitive = node.getMesh().listPrimitives()[0]
const positions = primitive.getAttribute('POSITION')
const texcoords = primitive.getAttribute('TEXCOORD_0')
const indices = primitive.getIndices()?.getArray()
const baseColorTexture = primitive.getMaterial()?.getBaseColorTexture()
if (!positions || !texcoords || !indices || !baseColorTexture?.getImage()) {
  throw new Error('Brain-shell geometry or base-color atlas is incomplete')
}

const textureMetadata = await sharp(baseColorTexture.getImage()).metadata()
const textureWidth = textureMetadata.width
const textureHeight = textureMetadata.height
if (!textureWidth || !textureHeight) throw new Error('Invalid base-color atlas')
const maskWidth = Math.min(textureWidth, MASK_MAX_SIZE)
const maskHeight = Math.min(textureHeight, MASK_MAX_SIZE)
const baseColorPixels = await sharp(baseColorTexture.getImage())
  .ensureAlpha()
  .raw()
  .toBuffer()

const nodeMatrix = node.getWorldMatrix()
const modelVertices = []
const uvs = []
const modelBounds = new Box3()
const element = [0, 0, 0]
const uvElement = [0, 0]

for (let index = 0; index < positions.getCount(); index += 1) {
  positions.getElement(index, element)
  const vertex = new Vector3(
    nodeMatrix[0] * element[0]
      + nodeMatrix[4] * element[1]
      + nodeMatrix[8] * element[2]
      + nodeMatrix[12],
    nodeMatrix[1] * element[0]
      + nodeMatrix[5] * element[1]
      + nodeMatrix[9] * element[2]
      + nodeMatrix[13],
    nodeMatrix[2] * element[0]
      + nodeMatrix[6] * element[1]
      + nodeMatrix[10] * element[2]
      + nodeMatrix[14],
  )
  modelVertices.push(vertex)
  modelBounds.expandByPoint(vertex)
  texcoords.getElement(index, uvElement)
  uvs.push([uvElement[0], uvElement[1]])
}

const modelSize = modelBounds.getSize(new Vector3())
const modelCenter = modelBounds.getCenter(new Vector3())
const modelOffset = new Vector3(
  -modelCenter.x,
  -modelBounds.min.y,
  -modelCenter.z,
)
const groupMatrix = new Matrix4().compose(
  WORLD_POSITION,
  new Quaternion().setFromEuler(WORLD_ROTATION),
  new Vector3(
    TARGET_SIZE.x / modelSize.x,
    TARGET_SIZE.y / modelSize.y,
    TARGET_SIZE.z / modelSize.z,
  ),
)
const worldVertices = modelVertices.map((vertex) => (
  vertex.clone().add(modelOffset).applyMatrix4(groupMatrix)
))

const camera = new PerspectiveCamera(
  40,
  VIEWPORT_WIDTH / VIEWPORT_HEIGHT,
  0.05,
  80,
)
camera.position.copy(CAMERA_POSITION)
camera.lookAt(CAMERA_TARGET)
camera.updateProjectionMatrix()
camera.updateMatrixWorld(true)
const screenVertices = worldVertices.map((vertex) => {
  const projected = vertex.clone().project(camera)
  return [
    (projected.x + 1) * VIEWPORT_WIDTH * 0.5,
    (1 - projected.y) * VIEWPORT_HEIGHT * 0.5,
    projected.z,
  ]
})

const pointInFace = (x, y) => {
  let inside = false
  for (
    let current = 0, previous = FACE_POLYGON.length - 1;
    current < FACE_POLYGON.length;
    previous = current, current += 1
  ) {
    const [currentX, currentY] = FACE_POLYGON[current]
    const [previousX, previousY] = FACE_POLYGON[previous]
    if (
      (currentY > y) !== (previousY > y)
      && x < (
        (previousX - currentX) * (y - currentY)
          / (previousY - currentY)
          + currentX
      )
    ) inside = !inside
  }
  return inside
}

const polygonMinX = Math.floor(Math.min(...FACE_POLYGON.map(([x]) => x)))
const polygonMaxX = Math.ceil(Math.max(...FACE_POLYGON.map(([x]) => x)))
const polygonMinY = Math.floor(Math.min(...FACE_POLYGON.map(([, y]) => y)))
const polygonMaxY = Math.ceil(Math.max(...FACE_POLYGON.map(([, y]) => y)))
const depthBuffer = new Float32Array(VIEWPORT_WIDTH * VIEWPORT_HEIGHT)
depthBuffer.fill(Infinity)
const triangleBuffer = new Int32Array(VIEWPORT_WIDTH * VIEWPORT_HEIGHT)
triangleBuffer.fill(-1)

const rasterizeVisibleTriangle = (triangleIndex, a, b, c) => {
  const minX = Math.max(
    polygonMinX,
    Math.floor(Math.min(a[0], b[0], c[0])),
  )
  const maxX = Math.min(
    polygonMaxX,
    Math.ceil(Math.max(a[0], b[0], c[0])),
  )
  const minY = Math.max(
    polygonMinY,
    Math.floor(Math.min(a[1], b[1], c[1])),
  )
  const maxY = Math.min(
    polygonMaxY,
    Math.ceil(Math.max(a[1], b[1], c[1])),
  )
  const denominator = (
    (b[1] - c[1]) * (a[0] - c[0])
      + (c[0] - b[0]) * (a[1] - c[1])
  )
  if (minX > maxX || minY > maxY || Math.abs(denominator) < 1e-8) return

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInFace(x + 0.5, y + 0.5)) continue
      const weightA = (
        (b[1] - c[1]) * (x + 0.5 - c[0])
          + (c[0] - b[0]) * (y + 0.5 - c[1])
      ) / denominator
      const weightB = (
        (c[1] - a[1]) * (x + 0.5 - c[0])
          + (a[0] - c[0]) * (y + 0.5 - c[1])
      ) / denominator
      const weightC = 1 - weightA - weightB
      if (weightA < 0 || weightB < 0 || weightC < 0) continue

      const depth = weightA * a[2] + weightB * b[2] + weightC * c[2]
      const pixelIndex = y * VIEWPORT_WIDTH + x
      if (depth >= depthBuffer[pixelIndex]) continue
      depthBuffer[pixelIndex] = depth
      triangleBuffer[pixelIndex] = triangleIndex
    }
  }
}

for (
  let indexOffset = 0, triangleIndex = 0;
  indexOffset < indices.length;
  indexOffset += 3, triangleIndex += 1
) {
  const a = screenVertices[indices[indexOffset]]
  const b = screenVertices[indices[indexOffset + 1]]
  const c = screenVertices[indices[indexOffset + 2]]
  if (
    Math.max(a[0], b[0], c[0]) < polygonMinX
    || Math.min(a[0], b[0], c[0]) > polygonMaxX
    || Math.max(a[1], b[1], c[1]) < polygonMinY
    || Math.min(a[1], b[1], c[1]) > polygonMaxY
  ) continue
  rasterizeVisibleTriangle(triangleIndex, a, b, c)
}

const visibleTriangles = new Set(triangleBuffer)
visibleTriangles.delete(-1)

const sampleBaseColor = ([u, v]) => {
  const wrappedU = ((u % 1) + 1) % 1
  const wrappedV = ((v % 1) + 1) % 1
  const x = Math.min(textureWidth - 1, Math.max(0, Math.floor(wrappedU * textureWidth)))
  const y = Math.min(textureHeight - 1, Math.max(0, Math.floor(wrappedV * textureHeight)))
  const offset = (y * textureWidth + x) * 4
  return [
    baseColorPixels[offset],
    baseColorPixels[offset + 1],
    baseColorPixels[offset + 2],
  ]
}

const rgbToHsv = (red, green, blue) => {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  const difference = maximum - minimum
  let hue = 0
  if (difference > 0) {
    if (maximum === r) hue = ((g - b) / difference) % 6
    else if (maximum === g) hue = (b - r) / difference + 2
    else hue = (r - g) / difference + 4
    hue = (hue * 60 + 360) % 360
  }
  return [hue, maximum > 0 ? difference / maximum : 0, maximum]
}

const triangleColor = (triangleIndex) => {
  const indexOffset = triangleIndex * 3
  const vertexIndices = [
    indices[indexOffset],
    indices[indexOffset + 1],
    indices[indexOffset + 2],
  ]
  const centroidUv = [
    vertexIndices.reduce((sum, vertexIndex) => sum + uvs[vertexIndex][0], 0) / 3,
    vertexIndices.reduce((sum, vertexIndex) => sum + uvs[vertexIndex][1], 0) / 3,
  ]
  return sampleBaseColor(centroidUv)
}

const isSkinSurface = (triangleIndex) => {
  const [red, green, blue] = triangleColor(triangleIndex)
  const [hue, saturation, value] = rgbToHsv(red, green, blue)
  return (
    (hue <= 52 || hue >= 348)
    && value >= 0.29
    && saturation >= 0.04
    && saturation <= 0.68
    && red >= green * 0.99
    && green >= blue * 0.86
    && red <= green * 1.75
  )
}

const plasterTriangles = new Set(
  [...visibleTriangles].filter(isSkinSurface),
)

// Grow two topology rings so the material remains continuous around the ear,
// jaw and face silhouette when the user rotates the model.
for (let ring = 0; ring < 2; ring += 1) {
  const selectedVertices = new Set()
  for (const triangleIndex of plasterTriangles) {
    const indexOffset = triangleIndex * 3
    selectedVertices.add(indices[indexOffset])
    selectedVertices.add(indices[indexOffset + 1])
    selectedVertices.add(indices[indexOffset + 2])
  }
  for (
    let indexOffset = 0, triangleIndex = 0;
    indexOffset < indices.length;
    indexOffset += 3, triangleIndex += 1
  ) {
    if (plasterTriangles.has(triangleIndex) || !isSkinSurface(triangleIndex)) continue
    if (
      selectedVertices.has(indices[indexOffset])
      || selectedVertices.has(indices[indexOffset + 1])
      || selectedVertices.has(indices[indexOffset + 2])
    ) plasterTriangles.add(triangleIndex)
  }
}

const maskPixels = Buffer.alloc(maskWidth * maskHeight)
const rasterizeUvTriangle = (a, b, c) => {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const maxX = Math.min(maskWidth - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const maxY = Math.min(maskHeight - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
  if (
    maxX - minX > maskWidth * 0.25
    || maxY - minY > maskHeight * 0.25
  ) return
  const denominator = (
    (b[1] - c[1]) * (a[0] - c[0])
      + (c[0] - b[0]) * (a[1] - c[1])
  )
  if (Math.abs(denominator) < 1e-8) return
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const weightA = (
        (b[1] - c[1]) * (x + 0.5 - c[0])
          + (c[0] - b[0]) * (y + 0.5 - c[1])
      ) / denominator
      const weightB = (
        (c[1] - a[1]) * (x + 0.5 - c[0])
          + (a[0] - c[0]) * (y + 0.5 - c[1])
      ) / denominator
      const weightC = 1 - weightA - weightB
      if (weightA < -0.01 || weightB < -0.01 || weightC < -0.01) continue
      const pixelIndex = y * maskWidth + x
      maskPixels[pixelIndex] = 255
    }
  }
}

for (const triangleIndex of plasterTriangles) {
  const indexOffset = triangleIndex * 3
  const triangleUvs = [
    uvs[indices[indexOffset]],
    uvs[indices[indexOffset + 1]],
    uvs[indices[indexOffset + 2]],
  ].map(([u, v]) => [u * maskWidth, v * maskHeight])
  rasterizeUvTriangle(triangleUvs[0], triangleUvs[1], triangleUvs[2])
}

await sharp(maskPixels, {
  raw: { width: maskWidth, height: maskHeight, channels: 1 },
})
  .png({ compressionLevel: 9 })
  .toFile(outputPath)

console.log(JSON.stringify({
  outputPath,
  sourceTextureSize: [textureWidth, textureHeight],
  maskTextureSize: [maskWidth, maskHeight],
  visibleTriangles: visibleTriangles.size,
  plasterTriangles: plasterTriangles.size,
}, null, 2))
