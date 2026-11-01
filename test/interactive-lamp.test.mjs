import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  LAMP_GLOBE_CENTER,
  LAMP_GLOBE_INTERACTION_RADIUS,
  LAMP_GLOBE_MATERIAL_NAME,
  LAMP_GLOBE_RADIUS,
  LAMP_GLOW_DURATION_SECONDS,
  LAMP_RELIC_APERTURE_CENTER,
  LAMP_RELIC_APERTURE_RADIUS,
  LampGlowController,
  easeLampGlowLevel,
  isLampGlobeRayAllowed,
} from '../src/scene/lampGlow.ts'

const source = (relativePath) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
)

const readGlbJson = async (relativePath) => {
  const bytes = await readFile(new URL(relativePath, import.meta.url))
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)

  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset)
    const chunkType = bytes.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    assert.ok(chunkEnd <= bytes.length, 'GLB chunk must stay inside the file')
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(bytes.toString('utf8', chunkStart, chunkEnd).trimEnd())
    }
    offset = chunkEnd
  }

  assert.fail('lamp GLB is missing its JSON chunk')
}

const assertClose = (actual, expected, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, received ${actual}`,
  )
}

const settle = (controller) => controller.advance(LAMP_GLOW_DURATION_SECONDS)

const extractArrowBlock = (text, callName) => {
  const callStart = text.indexOf(`${callName}(`)
  assert.ok(callStart >= 0, `missing ${callName} call`)
  const arrow = text.indexOf('=>', callStart)
  assert.ok(arrow >= 0, `missing ${callName} arrow callback`)
  const openBrace = text.indexOf('{', arrow)
  assert.ok(openBrace >= 0, `missing ${callName} callback body`)

  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = openBrace; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (lineComment) {
      if (character === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (character === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(openBrace + 1, index)
    }
  }

  assert.fail(`unterminated ${callName} callback body`)
}

test('触须立灯第一次点击渐亮、第二次点击渐灭', () => {
  const controller = new LampGlowController()

  assert.deepEqual(controller.snapshot, {
    level: 0,
    targetOn: false,
    transitioning: false,
  })

  controller.toggle()
  assert.equal(controller.snapshot.targetOn, true)
  assert.equal(controller.snapshot.transitioning, true)
  assert.equal(controller.snapshot.level, 0)

  const fadingIn = controller.advance(LAMP_GLOW_DURATION_SECONDS / 2)
  assert.equal(fadingIn.targetOn, true)
  assert.equal(fadingIn.transitioning, true)
  assertClose(fadingIn.level, 0.5)

  const lit = settle(controller)
  assert.equal(lit.targetOn, true)
  assert.equal(lit.transitioning, false)
  assert.equal(lit.level, 1)

  controller.toggle()
  assert.equal(controller.snapshot.targetOn, false)
  assert.equal(controller.snapshot.transitioning, true)
  assert.equal(controller.snapshot.level, 1)

  const fadingOut = controller.advance(LAMP_GLOW_DURATION_SECONDS / 2)
  assert.equal(fadingOut.targetOn, false)
  assert.equal(fadingOut.transitioning, true)
  assertClose(fadingOut.level, 0.5)

  const dark = settle(controller)
  assert.equal(dark.targetOn, false)
  assert.equal(dark.transitioning, false)
  assert.equal(dark.level, 0)
})

test('过渡中的再次点击从当前亮度平滑反向', () => {
  const controller = new LampGlowController()
  controller.toggle()
  const opening = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.68)

  const openingLevel = opening.level
  controller.toggle()
  assert.equal(controller.snapshot.targetOn, false)
  assertClose(controller.snapshot.level, openingLevel)

  const closing = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.2)
  assert.ok(closing.level < openingLevel)
  assert.ok(closing.level > 0)

  const reversedLevel = closing.level
  controller.toggle()
  assert.equal(controller.snapshot.targetOn, true)
  assertClose(controller.snapshot.level, reversedLevel)

  const reopening = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.12)
  assert.ok(reopening.level > reversedLevel)
})

test('灯光过渡与帧率无关，并拒绝非法 delta', () => {
  const singleStep = new LampGlowController()
  const manySteps = new LampGlowController()
  singleStep.toggle()
  manySteps.toggle()

  const openingSeconds = LAMP_GLOW_DURATION_SECONDS * 0.73
  const singleOpening = singleStep.advance(openingSeconds)
  for (let index = 0; index < 73; index += 1) {
    manySteps.advance(LAMP_GLOW_DURATION_SECONDS / 100)
  }
  assertClose(singleOpening.level, manySteps.snapshot.level, 1e-10)

  singleStep.toggle()
  manySteps.toggle()
  const closingSeconds = LAMP_GLOW_DURATION_SECONDS * 0.41
  const singleClosing = singleStep.advance(closingSeconds)
  for (let index = 0; index < 41; index += 1) {
    manySteps.advance(LAMP_GLOW_DURATION_SECONDS / 100)
  }
  assertClose(singleClosing.level, manySteps.snapshot.level, 1e-10)

  const beforeZeroDelta = singleStep.snapshot
  assert.deepEqual(singleStep.advance(0), beforeZeroDelta)
  for (const invalidDelta of [-0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => singleStep.advance(invalidDelta), RangeError)
  }

  assert.equal(easeLampGlowLevel(-1), 0)
  assert.equal(easeLampGlowLevel(0), 0)
  assert.equal(easeLampGlowLevel(1), 1)
  assert.equal(easeLampGlowLevel(2), 1)
  assertClose(easeLampGlowLevel(0.5), 0.5)
})

test('触须立灯仅保留快速的球体发光过渡', async () => {
  const lampLogic = await source('../src/scene/lampGlow.ts')

  assert.ok(LAMP_GLOW_DURATION_SECONDS > 0)
  assert.ok(LAMP_GLOW_DURATION_SECONDS <= 1.5)
  assert.doesNotMatch(lampLogic, /LAMP_GHOST|orbitAngle/i)
})

test('发布版灯具 GLB 内置唯一真实球壳网格与材质', async () => {
  const gltf = await readGlbJson('../public/models/lamp-optimized.glb')
  const materials = gltf.materials ?? []
  const meshes = gltf.meshes ?? []

  assert.equal(materials.length, 2, 'lamp asset should contain body and globe materials only')
  assert.equal(meshes.length, 2, 'lamp asset should contain body and globe meshes only')

  const globeMaterialIndices = materials
    .map((material, index) => material.name === LAMP_GLOBE_MATERIAL_NAME ? index : -1)
    .filter((index) => index >= 0)
  const globeMeshes = meshes.filter((mesh) => mesh.name === LAMP_GLOBE_MATERIAL_NAME)
  assert.deepEqual(globeMaterialIndices, [1])
  assert.equal(globeMeshes.length, 1, 'GLB must not contain a second globe mesh')

  const globePrimitives = globeMeshes[0].primitives ?? []
  assert.ok(globePrimitives.length > 0, 'real globe mesh must contain geometry')
  for (const primitive of globePrimitives) {
    assert.equal(primitive.material, globeMaterialIndices[0])
    assert.ok(Number.isInteger(primitive.attributes?.POSITION))
    assert.ok(Number.isInteger(primitive.indices))
    assert.ok((gltf.accessors?.[primitive.attributes.POSITION]?.count ?? 0) > 0)
    assert.ok((gltf.accessors?.[primitive.indices]?.count ?? 0) > 0)
  }

  const nonGlobeNames = [
    ...(gltf.nodes ?? []),
    ...meshes,
    ...materials,
  ]
    .map((entry) => entry.name ?? '')
    .filter((name) => name !== LAMP_GLOBE_MATERIAL_NAME)
  assert.doesNotMatch(
    nonGlobeNames.join('\n'),
    /ghost|halo|spectral|procedural|sphere|core/i,
  )
})

test('球面开关给表面外侧的溺梦晶核保留独立命中孔', () => {
  assert.deepEqual(LAMP_GLOBE_CENTER, [0.00319, 1.96228, -0.00477])
  assertClose(LAMP_GLOBE_RADIUS, 0.2081)
  assert.deepEqual(LAMP_RELIC_APERTURE_CENTER, [0.17, 1.84, 0.175])
  assert.ok(LAMP_RELIC_APERTURE_RADIUS >= 0.11)
  assert.ok(LAMP_RELIC_APERTURE_RADIUS <= 0.13)
  assert.ok(LAMP_RELIC_APERTURE_RADIUS < LAMP_GLOBE_RADIUS)
  assert.ok(LAMP_GLOBE_RADIUS < LAMP_GLOBE_INTERACTION_RADIUS)

  assert.equal(isLampGlobeRayAllowed(0), false)
  assert.equal(isLampGlobeRayAllowed(LAMP_RELIC_APERTURE_RADIUS), false)
  assert.equal(
    isLampGlobeRayAllowed(LAMP_RELIC_APERTURE_RADIUS + 0.000001),
    true,
  )
  assert.equal(isLampGlobeRayAllowed(LAMP_GLOBE_RADIUS), true)
  assert.equal(isLampGlobeRayAllowed(LAMP_GLOBE_INTERACTION_RADIUS), true)
  assert.equal(isLampGlobeRayAllowed(LAMP_GLOBE_INTERACTION_RADIUS + 0.000001), false)
  assert.equal(isLampGlobeRayAllowed(Number.NaN), false)
  assert.equal(
    isLampGlobeRayAllowed(
      LAMP_RELIC_APERTURE_RADIUS + 0.000001,
      LAMP_GLOBE_INTERACTION_RADIUS + 0.000001,
    ),
    false,
  )

  // The aperture is authored in the lamp's local frame. Under the default
  // placement it must resolve onto the surface-mounted drowned-dream-core
  // hotspot, not the geometric globe centre or the old point inside the cage.
  const yaw = -0.38
  const [localX, localY, localZ] = LAMP_RELIC_APERTURE_CENTER
  const worldAperture = [
    0.25 + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
    localY,
    0.2 - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
  ]
  assertClose(worldAperture[0], 0.342962, 0.0001)
  assertClose(worldAperture[1], 1.84, 0.0001)
  assertClose(worldAperture[2], 0.425573, 0.0001)
})

test('灯效直接驱动 GLB 里 Lamp_Glass_Globe 的真实材质', async () => {
  const [component, assetSlot, lampLogic] = await Promise.all([
    source('../src/scene/InteractiveTentacleLamp.tsx'),
    source('../src/scene/AssetSlot.tsx'),
    source('../src/scene/lampGlow.ts'),
  ])

  assert.match(component, /const playback = controller\.advance\(delta, reducedMotion\)/)
  assert.match(component, /const level = easeLampGlowLevel\(playback\.level\)/)
  assert.equal(LAMP_GLOBE_MATERIAL_NAME, 'Lamp_Glass_Globe')
  assert.match(
    lampLogic,
    /LAMP_GLOBE_MATERIAL_NAME\s*=\s*['"]Lamp_Glass_Globe['"]/,
  )
  assert.match(component, /LAMP_GLOBE_MATERIAL_NAME/)
  assert.match(component, /child instanceof Mesh/)
  assert.match(component, /material\.name !== LAMP_GLOBE_MATERIAL_NAME/)
  assert.match(component, /material\.clone\(\)/)
  assert.match(component, /globeMaterialsRef\.current/)
  assert.match(component, /const emissiveIntensity = level [^\n]*/)
  assert.match(component, /globeMaterial\.emissiveIntensity = emissiveIntensity/)
  assert.match(component, /light\.intensity = level [^\n]* globalIntensity/)
  assert.match(
    component,
    /<AssetSlot[\s\S]{0,180}configureObject=\{configureLampObject\}/,
  )

  assert.match(assetSlot, /configureObject\?: \(object: Object3D\) => void/)
  assert.match(assetSlot, /const object = gltf\.scene\.clone\(true\)/)
  assert.match(
    assetSlot,
    /configureObject\?\.\(object\)/,
  )

  assert.doesNotMatch(component, /ghost/i)
  assert.doesNotMatch(component, /halo/i)
  assert.doesNotMatch(component, /coreRef|coreMaterialRef/)
  assert.doesNotMatch(component, /<instancedMesh\b/)
  assert.doesNotMatch(component, /<shaderMaterial\b/)
  assert.doesNotMatch(component, /<meshStandardMaterial\b/)
  assert.doesNotMatch(component, /vertexShader|fragmentShader/)
  assert.doesNotMatch(component, /LAMP_GLOBE_RADIUS\s*\*\s*1\.22/)

  // The old always-on shell and its second light must not remain underneath
  // the interactive, fully faded effect.
  assert.doesNotMatch(assetSlot, /LampCrystalGlow|asset\.id === 'tentacle-lamp'/)
})

test('灯效 useFrame 只推进控制器并直接更新真实球壳材质，不触发 React 状态刷新', async () => {
  const component = await source('../src/scene/InteractiveTentacleLamp.tsx')
  const frameBody = extractArrowBlock(component, 'useFrame')
  const reactStateSetters = [
    ...component.matchAll(
      /const\s*\[\s*[^,\]]+\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*use(?:State|Reducer)(?:<[^>]+>)?\s*\(/g,
    ),
  ].map((match) => match[1])

  assert.match(frameBody, /controller\.advance\(delta, reducedMotion\)/)
  assert.match(frameBody, /globeMaterialsRef\.current/)
  assert.match(frameBody, /\.emissiveIntensity\s*=/)
  assert.match(frameBody, /\.intensity\s*=/)
  assert.doesNotMatch(frameBody, /ghost|setMatrixAt|instanceMatrix/i)
  for (const setter of reactStateSetters) {
    assert.doesNotMatch(
      frameBody,
      new RegExp(`\\b${setter}\\s*\\(`),
      `${setter} must not run inside useFrame`,
    )
  }
})

test('灯球完整点击区域控制灯光，编辑模式恢复布局代理', async () => {
  const [component, canvas] = await Promise.all([
    source('../src/scene/InteractiveTentacleLamp.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
  ])
  assert.match(component, /raycaster\.ray\.intersectSphere\(lampRaycastSphere, lampRaycastPoint\)/)
  assert.doesNotMatch(component, /lampRaycastAperture|isLampGlobeRayAllowed/)
  assert.match(component, /raycast=\{lampGlobeRaycast\}/)
  assert.match(component, /controller\.toggle\(\)/)
  assert.match(component, /if \(!interactive \|\| event\.button !== 0 \|\| event\.delta > 8\) return/)
  assert.match(canvas, /<InteractiveTentacleLamp[\s\S]{0,180}interactive=\{!editingLayout\}/)
  const genericProxy = canvas.indexOf('name={`interaction-proxy:${asset.id}`}')
  assert.ok(genericProxy > 0)
  assert.match(canvas.slice(genericProxy - 700, genericProxy), /!isInteractiveLamp/)
})


test('真实灯球发光只附加一个无阴影点光，不重建任何可见球体', async () => {
  const component = await source('../src/scene/InteractiveTentacleLamp.tsx')

  assert.equal((component.match(/<instancedMesh\b/g) ?? []).length, 0)
  assert.equal((component.match(/<shaderMaterial\b/g) ?? []).length, 0)
  assert.equal((component.match(/<planeGeometry\b/g) ?? []).length, 0)
  assert.equal(
    (component.match(/<sphereGeometry\b/g) ?? []).length,
    1,
    'only the invisible click proxy may retain sphereGeometry',
  )
  const proxyStart = component.indexOf('name={`lamp-globe-interaction-proxy:${asset.id}`}')
  assert.ok(proxyStart >= 0, 'missing the invisible lamp click proxy')
  const proxySource = component.slice(proxyStart)
  assert.match(
    proxySource,
    /<sphereGeometry args=\{\[LAMP_GLOBE_INTERACTION_RADIUS,/,
  )
  assert.match(
    proxySource,
    /<meshBasicMaterial[\s\S]{0,180}visible=\{false\}/,
  )
  assert.equal((component.match(/<meshStandardMaterial\b/g) ?? []).length, 0)
  assert.equal((component.match(/<pointLight\b/g) ?? []).length, 1)
  assert.match(component, /<pointLight[\s\S]{0,220}castShadow=\{false\}/)
  assert.doesNotMatch(component, /DynamicDrawUsage|InstancedMesh|ShaderMaterial/)
})
