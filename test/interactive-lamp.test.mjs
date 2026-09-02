import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  LAMP_GHOST_COUNT,
  LAMP_GHOST_FADE_ORBIT_MULTIPLIER,
  LAMP_GHOST_ORBIT_RADIANS_PER_SECOND,
  LAMP_GHOST_SEGMENTS,
  LAMP_GLOBE_CENTER,
  LAMP_GLOBE_INTERACTION_RADIUS,
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
    orbitAngle: 0,
  })

  controller.toggle()
  assert.equal(controller.snapshot.targetOn, true)
  assert.equal(controller.snapshot.transitioning, true)
  assert.equal(controller.snapshot.level, 0)

  const fadingIn = controller.advance(LAMP_GLOW_DURATION_SECONDS / 2)
  assert.equal(fadingIn.targetOn, true)
  assert.equal(fadingIn.transitioning, true)
  assertClose(fadingIn.level, 0.5)
  assert.ok(fadingIn.orbitAngle > 0)

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
  assert.ok(fadingOut.orbitAngle > lit.orbitAngle)

  const dark = settle(controller)
  assert.equal(dark.targetOn, false)
  assert.equal(dark.transitioning, false)
  assert.equal(dark.level, 0)

  const stoppedAngle = dark.orbitAngle
  assertClose(controller.advance(3).orbitAngle, stoppedAngle)
})

test('过渡中的再次点击从当前亮度平滑反向且幽灵在关灯淡出时继续绕行', () => {
  const controller = new LampGlowController()
  controller.toggle()
  const opening = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.68)

  const openingLevel = opening.level
  const openingAngle = opening.orbitAngle
  controller.toggle()
  assert.equal(controller.snapshot.targetOn, false)
  assertClose(controller.snapshot.level, openingLevel)
  assertClose(controller.snapshot.orbitAngle, openingAngle)

  const closing = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.2)
  assert.ok(closing.level < openingLevel)
  assert.ok(closing.level > 0)
  assert.ok(closing.orbitAngle > openingAngle)
  assertClose(
    closing.orbitAngle - openingAngle,
    LAMP_GLOW_DURATION_SECONDS
      * 0.2
      * LAMP_GHOST_ORBIT_RADIANS_PER_SECOND
      * LAMP_GHOST_FADE_ORBIT_MULTIPLIER,
  )

  const reversedLevel = closing.level
  const reversedAngle = closing.orbitAngle
  controller.toggle()
  assert.equal(controller.snapshot.targetOn, true)
  assertClose(controller.snapshot.level, reversedLevel)
  assertClose(controller.snapshot.orbitAngle, reversedAngle)

  const reopening = controller.advance(LAMP_GLOW_DURATION_SECONDS * 0.12)
  assert.ok(reopening.level > reversedLevel)
  assert.ok(reopening.orbitAngle > reversedAngle)
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
  assertClose(singleOpening.orbitAngle, manySteps.snapshot.orbitAngle, 1e-10)

  singleStep.toggle()
  manySteps.toggle()
  const closingSeconds = LAMP_GLOW_DURATION_SECONDS * 0.41
  const singleClosing = singleStep.advance(closingSeconds)
  for (let index = 0; index < 41; index += 1) {
    manySteps.advance(LAMP_GLOW_DURATION_SECONDS / 100)
  }
  assertClose(singleClosing.level, manySteps.snapshot.level, 1e-10)
  assertClose(singleClosing.orbitAngle, manySteps.snapshot.orbitAngle, 1e-10)

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

test('触须立灯幽灵效果保持轻量性能上限', () => {
  assert.ok(LAMP_GHOST_COUNT >= 3, 'ghost orbit should remain visually legible')
  assert.ok(LAMP_GHOST_COUNT <= 8, `too many ghosts: ${LAMP_GHOST_COUNT}`)
  assert.ok(LAMP_GHOST_SEGMENTS >= 1)
  assert.ok(LAMP_GHOST_SEGMENTS <= 10, `ghost geometry is too dense: ${LAMP_GHOST_SEGMENTS}`)
  assert.ok(LAMP_GLOW_DURATION_SECONDS > 0)
  assert.ok(LAMP_GLOW_DURATION_SECONDS <= 1.5)
})

test('球面开关给溺梦晶核保留中央独立命中孔', () => {
  assert.deepEqual(LAMP_GLOBE_CENTER, [0, 1.9, 0.015])
  assertClose(LAMP_GLOBE_RADIUS, 0.255)
  assert.deepEqual(LAMP_RELIC_APERTURE_CENTER, [0.0126, 1.782, 0.04235])
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
  // placement it must resolve onto the existing drowned-dream-core hotspot,
  // not onto the slightly higher geometric globe centre.
  const yaw = -0.38
  const [localX, localY, localZ] = LAMP_RELIC_APERTURE_CENTER
  const worldAperture = [
    0.25 + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
    localY,
    0.2 - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
  ]
  assertClose(worldAperture[0], 0.246, 0.0001)
  assertClose(worldAperture[1], 1.782, 0.0001)
  assertClose(worldAperture[2], 0.244, 0.0001)
})

test('球光和幽灵透明度由同一渐变值逐帧驱动，幽灵围绕球心旋转', async () => {
  const [component, assetSlot] = await Promise.all([
    source('../src/scene/InteractiveTentacleLamp.tsx'),
    source('../src/scene/AssetSlot.tsx'),
  ])

  assert.match(component, /const playback = controller\.advance\(delta, reducedMotion\)/)
  assert.match(component, /const level = easeLampGlowLevel\(playback\.level\)/)
  assert.match(component, /coreMaterial\.emissiveIntensity = [^\n]*level/)
  assert.match(component, /coreMaterial\.opacity = [^\n]*level/)
  assert.match(component, /haloMaterial\.opacity = level/)
  assert.match(component, /light\.intensity = level [^\n]* globalIntensity/)

  assert.match(component, /ghostMaterial\.uniforms\.uOpacity\.value = level/)
  assert.match(component, /ghostMaterial\.uniforms\.uTime\.value = playback\.orbitAngle/)
  assert.match(component, /const angle = playback\.orbitAngle \+ phase/)
  assert.match(component, /Math\.cos\(angle\) \* radius/)
  assert.match(component, /Math\.sin\(angle\) \* radius/)
  assert.match(
    component,
    /name="tentacle-lamp-spectral-effect" position=\{LAMP_GLOBE_CENTER\}/,
  )
  assert.match(component, /sphereGeometry args=\{\[LAMP_GLOBE_RADIUS,/)
  assert.match(
    component,
    /<meshStandardMaterial[\s\S]{0,220}emissiveIntensity=\{0\}[\s\S]{0,160}opacity=\{0\}/,
  )

  // The old always-on shell and its second light must not remain underneath
  // the interactive, fully faded effect.
  assert.doesNotMatch(assetSlot, /LampCrystalGlow|asset\.id === 'tentacle-lamp'/)
})

test('灯效 useFrame 只推进控制器并直接更新 Three refs，不触发 React 状态刷新', async () => {
  const component = await source('../src/scene/InteractiveTentacleLamp.tsx')
  const frameBody = extractArrowBlock(component, 'useFrame')
  const reactStateSetters = [
    ...component.matchAll(
      /const\s*\[\s*[^,\]]+\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*use(?:State|Reducer)(?:<[^>]+>)?\s*\(/g,
    ),
  ].map((match) => match[1])

  assert.match(frameBody, /controller\.advance\(delta, reducedMotion\)/)
  assert.match(frameBody, /\.opacity\s*=/)
  assert.match(frameBody, /\.intensity\s*=/)
  assert.match(frameBody, /ghosts\.setMatrixAt\(/)
  assert.match(frameBody, /ghosts\.instanceMatrix\.needsUpdate = true/)
  for (const setter of reactStateSetters) {
    assert.doesNotMatch(
      frameBody,
      new RegExp(`\\b${setter}\\s*\\(`),
      `${setter} must not run inside useFrame`,
    )
  }
})

test('灯球使用带晶核孔洞的专属代理，编辑模式恢复通用布局代理', async () => {
  const [component, canvas, relics, relicData] = await Promise.all([
    source('../src/scene/InteractiveTentacleLamp.tsx'),
    source('../src/scene/StudioCanvas.tsx'),
    source('../src/scene/HiddenRelics.tsx'),
    source('../src/data/hiddenRelics.ts'),
  ])

  assert.match(component, /const lampGlobeRaycast: Mesh\['raycast'\]/)
  assert.match(component, /raycaster\.ray\.distanceSqToPoint\(lampRaycastSphere\.center\)/)
  assert.match(component, /LAMP_RELIC_APERTURE_CENTER\[0\] - LAMP_GLOBE_CENTER\[0\]/)
  assert.match(component, /this\.localToWorld\(lampRaycastAperturePoint\)/)
  assert.match(component, /raycaster\.ray\.distanceSqToPoint\(lampRaycastAperturePoint\)/)
  assert.match(
    component,
    /if \(!isLampGlobeRayAllowed\(apertureDistance, globeCenterDistance\)\) return/,
  )
  assert.match(component, /raycaster\.ray\.intersectSphere\(lampRaycastSphere, lampRaycastPoint\)/)
  assert.match(component, /name=\{`lamp-globe-interaction-proxy:\$\{asset\.id\}`\}/)
  assert.match(component, /raycast=\{lampGlobeRaycast\}/)
  assert.match(component, /\{interactive \? \(\s*<mesh/)
  assert.match(component, /if \(!interactive \|\| event\.button !== 0 \|\| event\.delta > 8\) return/)
  assert.match(component, /controller\.toggle\(\)/)
  assert.match(component, /document\.body\.style\.cursor = 'pointer'/)

  assert.match(canvas, /import \{ InteractiveTentacleLamp \} from '\.\/InteractiveTentacleLamp'/)
  assert.match(canvas, /const isInteractiveLamp = asset\.kind === 'lamp'/)
  assert.match(canvas, /asset\.kind === 'lamp'[\s\S]{0,120}<InteractiveTentacleLamp/)
  assert.match(
    canvas,
    /<InteractiveTentacleLamp[\s\S]{0,180}interactive=\{!detailRelic && !editingLayout\}/,
  )

  const genericProxy = canvas.indexOf('name={`interaction-proxy:${asset.id}`}')
  assert.ok(genericProxy > 0, 'StudioCanvas must retain its generic edit proxy')
  const proxyGuard = canvas.slice(Math.max(0, genericProxy - 700), genericProxy)
  assert.match(proxyGuard, /!isInteractiveLamp/)
  assert.match(proxyGuard, /editingLayout/)

  assert.match(relics, /const isDrownedDreamCore = relic\.id === 'drowned-dream-core'/)
  assert.match(
    relics,
    /isDrownedDreamCore[\s\S]{0,120}\? LAMP_RELIC_APERTURE_RADIUS \/ relic\.hitRadius/,
  )
  assert.match(relics, /if \(found\.has\(relic\.id\) \|\| suppressed\.has\(relic\.id\)\) return null/)
  assert.match(relics, /event\.stopPropagation\(\)[\s\S]{0,80}onOpenRelic\(relic\.id\)/)
  assert.match(
    relicData,
    /id: 'drowned-dream-core'[\s\S]{0,1200}hitRadius: 0\.3/,
  )

  const suppressionDeclaration = canvas.match(
    /const CHAIR_TURNING_SUPPRESSED_RELIC_IDS = \[([^\]]*)\]/,
  )
  assert.ok(suppressionDeclaration, 'missing transient chair relic suppression')
  assert.doesNotMatch(suppressionDeclaration[1], /drowned-dream-core/)
})

test('六个幽灵共享单一实例绘制和材质，动态点光不投射阴影', async () => {
  const component = await source('../src/scene/InteractiveTentacleLamp.tsx')

  assert.equal((component.match(/<instancedMesh\b/g) ?? []).length, 1)
  assert.match(
    component,
    /args=\{\[undefined, undefined, LAMP_GHOST_COUNT\]\}/,
  )
  assert.match(
    component,
    /<planeGeometry args=\{\[0\.34, 0\.52, LAMP_GHOST_SEGMENTS, LAMP_GHOST_SEGMENTS\]\}/,
  )
  assert.equal((component.match(/<shaderMaterial\b/g) ?? []).length, 1)
  assert.equal((component.match(/<pointLight\b/g) ?? []).length, 1)
  assert.match(component, /<pointLight[\s\S]{0,220}castShadow=\{false\}/)
  assert.doesNotMatch(component, /Array\.from\([^\n]*LAMP_GHOST_COUNT[\s\S]{0,300}<mesh/)
})
