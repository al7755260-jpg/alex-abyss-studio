import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { forwardRef, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  FileLoader,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Group,
} from 'three'

import { LOVECRAFT_PARTICLE_BUST_ASSET_ID } from '../data/studioAssets'
import type { StudioTransform } from '../editor/studioLayout'
import { resolveParticleMorphProgress } from './particleMorphPlayback'

const PARTICLE_DATA_URL = `${import.meta.env.BASE_URL}models/particle-morph/lovecraft-particle-morph.bin`
const PARTICLE_FORMAT_MAGIC = 'CPMF'
const PARTICLE_FORMAT_VERSION = 1
const EXPECTED_PARTICLE_COUNT = 36_000

type ParticleMorphPhase =
  | 'human'
  | 'morphing-to-monster'
  | 'monster'
  | 'morphing-to-human'

type ParticleMorphData = {
  count: number
  duration: number
  brushWidth: number
  particleRadius: number
  noiseAmplitude: number
  boundsMin: [number, number, number]
  boundsMax: [number, number, number]
  sourcePosition: Float32Array
  targetPosition: Float32Array
  sourceNormal: Float32Array
  targetNormal: Float32Array
  delay: Float32Array
  particleScale: Float32Array
  humanColor: Uint8Array
  monsterColor: Uint8Array
}

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aTargetPosition;
  attribute vec3 aSourceNormal;
  attribute vec3 aTargetNormal;
  attribute float aDelay;
  attribute float aParticleScale;
  attribute float aParticleId;
  attribute vec3 aHumanColor;
  attribute vec3 aMonsterColor;

  uniform float uProgress;
  uniform float uTime;
  uniform float uBrushWidth;
  uniform float uParticleRadius;
  uniform float uNoiseAmplitude;
  uniform float uViewportHeight;
  uniform float uHover;

  varying vec3 vParticleColor;
  varying float vNoiseLight;
  varying float vMorphEnvelope;
  varying float vMonsterMix;
  varying vec2 vMonsterLight;

  float hash11(float value) {
    return fract(sin(value * 127.1 + 311.7) * 43758.5453123);
  }

  float hash31(vec3 value) {
    value = fract(value * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float valueNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

    return mix(
      mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
      mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
      local.z
    );
  }

  float smootherstep01(float value) {
    value = clamp(value, 0.0, 1.0);
    return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
  }

  void main() {
    float localProgress = smootherstep01((uProgress - aDelay) / uBrushWidth);
    if (uProgress >= 0.999999) localProgress = 1.0;

    float envelope = 4.0 * localProgress * (1.0 - localProgress);
    vec3 basePosition = mix(position, aTargetPosition, localProgress);
    vec3 particlePosition = basePosition;
    float signedNoise = 0.0;
    float noiseB = 0.5;

    // Human and monster endpoints are the long-lived states. Skip both 3D
    // noise fields completely there; only particles inside the moving print
    // brush pay for the turbulent displacement.
    if (envelope > 0.0001) {
      vec3 blendedNormal = normalize(mix(aSourceNormal, aTargetNormal, localProgress));
      vec3 upAxis = abs(blendedNormal.y) > 0.94
        ? vec3(1.0, 0.0, 0.0)
        : vec3(0.0, 1.0, 0.0);
      vec3 tangent = normalize(cross(blendedNormal, upAxis));
      vec3 bitangent = normalize(cross(blendedNormal, tangent));

      float flowPhase = uTime * 2.47;
      vec3 flow = vec3(flowPhase * 0.41, -flowPhase * 0.58, flowPhase * 0.27);
      float noiseA = valueNoise(basePosition * 4.2 + flow + aParticleId * 0.00013);
      noiseB = valueNoise(basePosition.yzx * 7.1 - flow.zxy + aParticleId * 0.00031);
      signedNoise = (noiseA * 0.64 + noiseB * 0.36) * 2.0 - 1.0;

      float shedMask = step(0.64, hash11(aParticleId * 1.913));
      float shedDirection = hash11(aParticleId * 0.733) * 2.0 - 1.0;
      vec3 noisyOffset = blendedNormal * signedNoise
        + tangent * (noiseB - 0.5) * 0.98
        + bitangent * (noiseA - 0.5) * 0.62;
      noisyOffset += (
        tangent * shedDirection
        + vec3(0.0, 0.42 + hash11(aParticleId * 2.171) * 0.5, 0.0)
      ) * shedMask * 0.78;

      particlePosition += noisyOffset * uNoiseAmplitude * envelope;
    }
    vec4 modelViewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;

    // Unlike the tiny point-sprite normal used below for bead roundness, the
    // target mesh normal restores one coherent light field across the whole
    // Cthulhu sculpture. Keep this target-only: interpolating unrelated human
    // and monster normals can collapse or flip halfway through the morph.
    vec3 targetNormalView = normalize(normalMatrix * aTargetNormal);
    vec3 monsterKeyLight = normalize(vec3(-0.38, 0.72, 0.92));
    vec3 monsterFillLight = normalize(vec3(0.58, 0.10, 0.78));
    vec3 viewDirection = normalize(-modelViewPosition.xyz);
    float monsterKey = max(dot(targetNormalView, monsterKeyLight), 0.0);
    float monsterFill = max(dot(targetNormalView, monsterFillLight), 0.0);
    float monsterHemisphere = targetNormalView.y * 0.5 + 0.5;
    float monsterHalf = max(dot(
      targetNormalView,
      normalize(monsterKeyLight + viewDirection)
    ), 0.0);
    float monsterHalf2 = monsterHalf * monsterHalf;
    float monsterHalf4 = monsterHalf2 * monsterHalf2;
    float monsterHalf12 = monsterHalf4 * monsterHalf4 * monsterHalf4;
    vMonsterLight = vec2(
      0.19
        + monsterKey * 0.63
        + monsterFill * 0.13
        + monsterHemisphere * 0.08,
      monsterHalf12 * smoothstep(0.04, 0.62, monsterKey)
    );

    float inheritedScale = length(modelViewMatrix[0].xyz);
    float projectedSize = uParticleRadius
      * inheritedScale
      * projectionMatrix[1][1]
      * uViewportHeight
      / max(-modelViewPosition.z, 0.05);
    gl_PointSize = clamp(
      projectedSize * aParticleScale * (3.2 + uHover * 0.38),
      1.25 + uHover * 0.18,
      4.8
    );

    // Preserve the target texture's value detail while remapping its warm
    // source colors into the reference's rough, near-black ink-green patina.
    // The constants are linear-light equivalents of the reference's sampled
    // #181D1A, #242C2A and #3C625C patina range.
    float monsterLuma = dot(aMonsterColor, vec3(0.2126, 0.7152, 0.0722));
    float monsterBaseMix = smoothstep(0.08, 0.72, monsterLuma);
    float monsterHighlightMix = smoothstep(0.72, 1.0, monsterLuma);
    vec3 monsterInkColor = mix(
      vec3(0.0091, 0.0123, 0.0103),
      vec3(0.0176, 0.0252, 0.0232),
      monsterBaseMix
    );
    monsterInkColor = mix(
      monsterInkColor,
      vec3(0.0452, 0.1221, 0.1070),
      monsterHighlightMix * 0.62
    );
    vec3 sampledColor = mix(aHumanColor, monsterInkColor, localProgress);
    vec3 transitionTint = mix(
      vec3(0.23, 0.055, 0.025),
      vec3(0.02, 0.19, 0.16),
      noiseB
    );
    vParticleColor = mix(sampledColor, transitionTint, envelope * 0.22);
    vNoiseLight = signedNoise;
    vMorphEnvelope = envelope;
    vMonsterMix = localProgress;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vParticleColor;
  varying float vNoiseLight;
  varying float vMorphEnvelope;
  varying float vMonsterMix;
  varying vec2 vMonsterLight;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radiusSquared = dot(point, point);
    if (radiusSquared > 1.0) discard;

    float sphereDepth = sqrt(max(1.0 - radiusSquared, 0.0));
    vec3 sphereNormal = normalize(vec3(point, sphereDepth));
    vec3 keyLight = normalize(vec3(-0.38, 0.72, 0.92));
    float particleDiffuse = 0.42
      + max(dot(sphereNormal, keyLight), 0.0) * 0.64;
    float monsterAmount = vMonsterMix * vMonsterMix;
    float monsterDiffuse = vMonsterLight.x * mix(0.86, 1.0, sphereDepth);
    float diffuse = mix(particleDiffuse, monsterDiffuse, monsterAmount);
    float rim = pow(1.0 - sphereDepth, 2.4);
    float granularGlint = smoothstep(0.47, 0.96, vNoiseLight) * 0.18;

    vec3 color = vParticleColor * diffuse;
    float stableMonster = monsterAmount * (1.0 - 0.70 * vMorphEnvelope);
    vec3 roughPatinaSpecular = vec3(0.115, 0.145, 0.105);
    color += roughPatinaSpecular
      * vMonsterLight.y
      * 0.32
      * stableMonster;
    vec3 rimTint = mix(
      vec3(0.31, 0.13, 0.055),
      vec3(0.0452, 0.1221, 0.1070),
      vMonsterMix
    );
    color += rimTint * rim * mix(0.26, 0.07, vMonsterMix);
    color += vec3(0.08, 0.31, 0.27) * granularGlint * vMorphEnvelope;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function readMagic(view: DataView) {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
}

function parseParticleMorph(buffer: ArrayBuffer): ParticleMorphData {
  const view = new DataView(buffer)
  const magic = readMagic(view)
  const version = view.getUint32(4, true)
  const headerBytes = view.getUint32(8, true)
  const count = view.getUint32(12, true)

  if (magic !== PARTICLE_FORMAT_MAGIC || version !== PARTICLE_FORMAT_VERSION) {
    throw new Error(`Unsupported particle morph payload: ${magic} v${version}`)
  }
  if (headerBytes < 96 || count !== EXPECTED_PARTICLE_COUNT) {
    throw new Error(`Invalid particle morph header: ${headerBytes} bytes, ${count} points`)
  }

  const expectedBytes = headerBytes + count * (3 * 4 * 4 + 2 * 4 + 3 + 3)
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`Truncated particle morph payload: ${buffer.byteLength} / ${expectedBytes}`)
  }

  let offset = headerBytes
  const takeFloat = (length: number) => {
    const values = new Float32Array(buffer, offset, length)
    offset += values.byteLength
    return values
  }
  const takeByte = (length: number) => {
    const values = new Uint8Array(buffer, offset, length)
    offset += values.byteLength
    return values
  }

  return {
    count,
    duration: view.getFloat32(16, true),
    brushWidth: view.getFloat32(20, true),
    particleRadius: view.getFloat32(24, true),
    noiseAmplitude: view.getFloat32(28, true),
    boundsMin: [
      view.getFloat32(32, true),
      view.getFloat32(36, true),
      view.getFloat32(40, true),
    ],
    boundsMax: [
      view.getFloat32(44, true),
      view.getFloat32(48, true),
      view.getFloat32(52, true),
    ],
    sourcePosition: takeFloat(count * 3),
    targetPosition: takeFloat(count * 3),
    sourceNormal: takeFloat(count * 3),
    targetNormal: takeFloat(count * 3),
    delay: takeFloat(count),
    particleScale: takeFloat(count),
    humanColor: takeByte(count * 3),
    monsterColor: takeByte(count * 3),
  }
}

function createParticleGeometry(data: ParticleMorphData) {
  const geometry = new BufferGeometry()
  const particleIds = new Float32Array(data.count)
  for (let index = 0; index < data.count; index += 1) particleIds[index] = index

  geometry.setAttribute('position', new BufferAttribute(data.sourcePosition, 3))
  geometry.setAttribute('aTargetPosition', new BufferAttribute(data.targetPosition, 3))
  geometry.setAttribute('aSourceNormal', new BufferAttribute(data.sourceNormal, 3))
  geometry.setAttribute('aTargetNormal', new BufferAttribute(data.targetNormal, 3))
  geometry.setAttribute('aDelay', new BufferAttribute(data.delay, 1))
  geometry.setAttribute('aParticleScale', new BufferAttribute(data.particleScale, 1))
  geometry.setAttribute('aParticleId', new BufferAttribute(particleIds, 1))
  geometry.setAttribute('aHumanColor', new BufferAttribute(data.humanColor, 3, true))
  geometry.setAttribute('aMonsterColor', new BufferAttribute(data.monsterColor, 3, true))

  const bounds = new Box3(
    new Vector3(...data.boundsMin),
    new Vector3(...data.boundsMax),
  )
  geometry.boundingBox = bounds
  geometry.boundingSphere = bounds.getBoundingSphere(new Sphere())
  return geometry
}

const ignoreRaycast = () => undefined

type LoadedParticleMorphBustProps = {
  editing: boolean
  interactive: boolean
  onSelect?: () => void
}

function LoadedParticleMorphBust({
  editing,
  interactive,
  onSelect,
}: LoadedParticleMorphBustProps) {
  const rawData = useLoader(
    FileLoader,
    PARTICLE_DATA_URL,
    (loader) => loader.setResponseType('arraybuffer'),
  ) as unknown as ArrayBuffer
  const data = useMemo(() => parseParticleMorph(rawData), [rawData])
  const geometry = useMemo(() => createParticleGeometry(data), [data])
  const materialRef = useRef<ShaderMaterial>(null)
  const animationStartRef = useRef(Number.NaN)
  const hoverTargetRef = useRef(0)
  const pointerHoverRef = useRef(false)
  const [phase, setPhase] = useState<ParticleMorphPhase>('human')
  const uniforms = useMemo(() => ({
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uBrushWidth: { value: data.brushWidth },
    uParticleRadius: { value: data.particleRadius },
    uNoiseAmplitude: { value: data.noiseAmplitude },
    uViewportHeight: { value: 720 },
    uHover: { value: 0 },
  }), [data])

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const canToggle = phase === 'human' || phase === 'monster'
    const canActivate = editing || (interactive && canToggle)
    if (!interactive && !editing) {
      hoverTargetRef.current = 0
      pointerHoverRef.current = false
    }
    document.body.style.cursor = pointerHoverRef.current && canActivate
      ? 'pointer'
      : ''
  }, [editing, interactive, phase])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.lovecraftBustState = phase
    root.dataset.lovecraftBustDuration = data.duration.toFixed(3)
    return () => {
      if (root.dataset.lovecraftBustState === phase) {
        delete root.dataset.lovecraftBustState
        delete root.dataset.lovecraftBustDuration
      }
      document.body.style.cursor = ''
    }
  }, [data.duration, phase])

  useFrame(({ clock, gl }, delta) => {
    const material = materialRef.current
    if (!material) return

    material.uniforms.uViewportHeight.value = gl.domElement.height
    const hover = material.uniforms.uHover.value as number
    const hoverMix = 1 - Math.exp(-delta * 11)
    material.uniforms.uHover.value = hover
      + (hoverTargetRef.current - hover) * hoverMix

    if (phase === 'human') {
      material.uniforms.uTime.value = 0
      material.uniforms.uProgress.value = 0
      return
    }
    if (phase === 'monster') {
      material.uniforms.uTime.value = data.duration
      material.uniforms.uProgress.value = 1
      return
    }

    if (!Number.isFinite(animationStartRef.current)) {
      animationStartRef.current = clock.elapsedTime
    }
    const elapsed = Math.max(clock.elapsedTime - animationStartRef.current, 0)
    const normalizedTime = Math.min(elapsed / data.duration, 1)
    const progress = resolveParticleMorphProgress(
      phase === 'morphing-to-monster' ? 'forward' : 'reverse',
      elapsed,
      data.duration,
    )
    material.uniforms.uTime.value = progress * data.duration
    material.uniforms.uProgress.value = progress
    if (normalizedTime >= 1) {
      setPhase(phase === 'morphing-to-monster' ? 'monster' : 'human')
    }
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if ((!interactive && !editing) || event.button !== 0 || event.delta > 8) return
    event.stopPropagation()
    if (editing) {
      onSelect?.()
      return
    }
    if (phase !== 'human' && phase !== 'monster') return
    animationStartRef.current = Number.NaN
    setPhase(phase === 'human' ? 'morphing-to-monster' : 'morphing-to-human')
  }

  return (
    <>
      <points
        geometry={geometry}
        frustumCulled={false}
        renderOrder={4}
        raycast={ignoreRaycast}
      >
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          depthTest
          depthWrite
          toneMapped
        />
      </points>
      {interactive || editing ? (
        <mesh
          name="lovecraft-particle-morph-click-target"
          position={[0, 0.49, -0.04]}
          userData={{
            studioAssetId: LOVECRAFT_PARTICLE_BUST_ASSET_ID,
            hostChildActivationProxy: true,
            hostChildAssetId: 'demonic-display-rack',
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleClick}
          onPointerEnter={(event) => {
            event.stopPropagation()
            pointerHoverRef.current = true
            hoverTargetRef.current = 1
            if (editing || phase === 'human' || phase === 'monster') {
              document.body.style.cursor = 'pointer'
            }
          }}
          onPointerLeave={(event) => {
            event.stopPropagation()
            pointerHoverRef.current = false
            hoverTargetRef.current = 0
            document.body.style.cursor = ''
          }}
        >
          <boxGeometry args={[1.06, 1.04, 0.96]} />
          <meshBasicMaterial
            visible={false}
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
      ) : null}
    </>
  )
}

type LovecraftParticleMorphBustProps = {
  editing?: boolean
  interactive?: boolean
  onSelect?: () => void
  transform: StudioTransform
}

export const LovecraftParticleMorphBust = forwardRef<
  Group,
  LovecraftParticleMorphBustProps
>(function LovecraftParticleMorphBust({
  editing = false,
  interactive = true,
  onSelect,
  transform,
}, ref) {
  return (
    <group
      ref={ref}
      name={`editable-asset:${LOVECRAFT_PARTICLE_BUST_ASSET_ID}`}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
      userData={{ studioAssetId: LOVECRAFT_PARTICLE_BUST_ASSET_ID }}
    >
      <Suspense fallback={null}>
        <LoadedParticleMorphBust
          editing={editing}
          interactive={interactive}
          onSelect={onSelect}
        />
      </Suspense>
    </group>
  )
})
