import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, Box3, Color, DoubleSide, Group, LineCurve3,
  Matrix3, Mesh, Quaternion, ShaderMaterial, Vector3,
  type MeshBasicMaterial, type MeshStandardMaterial, type Texture,
} from 'three'
import type { Vector3Tuple } from '../data/studioAssets'
import { HologramPlayback, hologramPortraitProgress, hologramSegmentProgress } from './hologramPlayback'

import { HEAD_PATH } from '../data/headDelivery'

const ALEX_MODEL_URL = `${import.meta.env.BASE_URL}${HEAD_PATH}`
const HEAD_HEIGHT = 1.7
const noRaycast = () => undefined
const LASER_LAYERS = [
  { radius: 0.011, color: [2.4, 3.8, 3.5] as const, opacity: 1 },
  { radius: 0.024, color: [0.3, 2.8, 2.3] as const, opacity: 0.60 },
  { radius: 0.046, color: [0.12, 1.9, 1.6] as const, opacity: 0.15 },
  { radius: 0.072, color: [0.08, 1.5, 1.3] as const, opacity: 0.045 },
]

export type AlexHologramProjectionProps = {
  active: boolean
  session: number
  onExited: (session: number) => void
  /** World-space emitter points, normally mask, left bust, then lamp. */
  anchors: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple]
  /** World-space center of the portrait's lower edge; its face extends upward. */
  position: Vector3Tuple
}

const portraitVertexShader = /* glsl */ `
  attribute vec2 surfaceUv;
  uniform float uViewportHeight;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vSurfaceUv;
  varying float vHeight;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vSurfaceUv = surfaceUv;
    vHeight = position.y / 1.7;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(0.0105 * projectionMatrix[1][1] * uViewportHeight / max(0.1, -mv.z), 1.35, 4.6);
  }
`

const portraitFragmentShader = /* glsl */ `
  uniform sampler2D uFaceMap;
  uniform float uHasFaceMap;
  uniform float uTime;
  uniform float uReveal;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vSurfaceUv;
  varying float vHeight;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 disk = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(disk, disk);
    if (radius > 1.0 || uReveal < 0.001 || vHeight > uReveal + 0.025) discard;
    vec3 n = normalize(vNormal);
    float facing = dot(n, normalize(vView));
    // Suppress far-facing surfaces so the eyes and nose remain readable.
    if (facing < 0.025) discard;
    float rim = pow(1.0 - max(facing, 0.0), 2.3);
    float key = max(dot(n, normalize(vec3(-0.38, 0.64, 0.82))), 0.0);
    float luma = 0.7;
    if (uHasFaceMap > 0.5) {
      luma = dot(texture2D(uFaceMap, vSurfaceUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    }
    float scanLines = 0.86 + 0.14 * sin(vHeight * 410.0 - uTime * 2.4);
    float scan = exp(-abs(vHeight - fract(uTime * 0.13)) * 95.0);
    float noise = 0.96 + 0.04 * hash(gl_FragCoord.xy + floor(uTime * 13.0));
    float revealEdge = exp(-abs(vHeight - uReveal) * 60.0) * step(uReveal, 0.98);
    vec3 body = mix(vec3(0.012, 0.15, 0.19), vec3(0.06, 0.65, 0.76), clamp(luma * 1.4, 0.0, 1.0));
    vec3 color = body * (0.34 + key * 0.8) * scanLines * noise;
    color += vec3(0.40, 1.0, 1.12) * (rim * 0.57 + scan * 0.28 + revealEdge * 0.42);
    float alpha = (0.50 + key * 0.20 + rim * 0.18) * (1.0 - smoothstep(0.55, 1.0, radius));
    alpha *= smoothstep(0.0, 0.12, uReveal) * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`

const beamVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const beamFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  varying vec2 vUv;
  void main() {
    float sides = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 1.8);
    float fade = smoothstep(0.0, 0.16, vUv.y) * (1.0 - vUv.y * 0.8);
    float pulse = 0.88 + 0.12 * sin(vUv.y * 25.0 - uTime * 2.0);
    gl_FragColor = vec4(0.025, 0.60, 0.8, sides * fade * pulse * 0.09 * uReveal);
  }
`

/** Build a modest point portrait from the same Alex GLB used by the room.
 * The cached mesh, UVs, normals, materials and textures are read-only. New
 * typed arrays are owned by declarative R3F geometries, including StrictMode.
 */
function useAlexPortrait() {
  const gltf = useGLTF(ALEX_MODEL_URL)
  return useMemo(() => {
    const source = gltf.scene.clone(true)
    source.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(source)
    const center = bounds.getCenter(new Vector3())
    // Preserve the complete source silhouette, including neck and shoulders.
    const bottom = bounds.min.y
    const scale = HEAD_HEIGHT / Math.max(0.0001, bounds.max.y - bottom)
    const meshes: Mesh[] = []
    source.traverse((node) => { if (node instanceof Mesh) meshes.push(node) })
    const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0)
    const stride = Math.max(1, Math.ceil(vertexCount / 48_000))
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const p = new Vector3()
    const n = new Vector3()
    let faceMap: Texture | null = null
    for (const mesh of meshes) {
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial
      if (!faceMap && material.map) faceMap = material.map
      const position = mesh.geometry.getAttribute('position')
      const normal = mesh.geometry.getAttribute('normal')
      const uv = mesh.geometry.getAttribute('uv')
      const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld)
      for (let index = 0; index < position.count; index += stride) {
        p.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld)
        positions.push((p.x - center.x) * scale, (p.y - bottom) * scale, (p.z - center.z) * scale)
        if (normal) n.fromBufferAttribute(normal, index).applyNormalMatrix(normalMatrix)
        else n.set(1, 0, 0)
        normals.push(n.x, n.y, n.z)
        uvs.push(uv?.getX(index) ?? 0, uv?.getY(index) ?? 0)
      }
    }
    return {
      positions: new Float32Array(positions), normals: new Float32Array(normals),
      uvs: new Float32Array(uvs), faceMap,
    }
  }, [gltf.scene])
}

export function AlexHologramProjection({ anchors, position, active, session, onExited }: AlexHologramProjectionProps) {
  const portrait = useAlexPortrait()
  const portraitRef = useRef<Group>(null)
  const elapsedRef = useRef(0)
  const playback = useRef(new HologramPlayback()).current
  const exitNotifiedSessionRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)
  const portraitMaterialRef = useRef<ShaderMaterial>(null)
  const beamMaterialRef = useRef<ShaderMaterial>(null)
  const edgeRefs = useRef<Array<Group | null>>([])
  const emitterRefs = useRef<Array<Mesh | null>>([])
  const portraitUniforms = useMemo(() => ({
    uFaceMap: { value: portrait.faceMap }, uHasFaceMap: { value: portrait.faceMap ? 1 : 0 },
    uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 1 }, uViewportHeight: { value: 720 },
  }), [portrait.faceMap])
  const beamUniforms = useMemo(() => ({ uTime: { value: 0 }, uReveal: { value: 0 } }), [])
  const edges = useMemo(() => anchors.map((point, index) => {
    const direction = new Vector3(...anchors[(index + 1) % 3]).sub(new Vector3(...point))
    return {
      start: point,
      length: direction.length(),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
      curve: new LineCurve3(new Vector3(), new Vector3(0, 1, 0)),
    }
  }), [anchors])
  const beams = useMemo(() => {
    const vertices: number[] = []
    const uvs: number[] = []
    const target = new Vector3(position[0], position[1] + 0.1, position[2])
    for (const anchor of anchors) {
      const source = new Vector3(...anchor)
      const direction = target.clone().sub(source).normalize()
      const side = new Vector3().crossVectors(direction, new Vector3(0, 1, 0))
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0)
      side.normalize().multiplyScalar(0.38)
      const left = target.clone().sub(side)
      const right = target.clone().add(side)
      vertices.push(...source.toArray(), ...left.toArray(), ...right.toArray())
      uvs.push(0.5, 0, 0, 1, 1, 1)
    }
    return { positions: new Float32Array(vertices), uvs: new Float32Array(uvs) }
  }, [anchors, position])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = query.matches }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useFrame(({ gl }, delta) => {
    playback.advance(delta, active)
    if (active) exitNotifiedSessionRef.current = null
    if (!active && playback.hidden && exitNotifiedSessionRef.current !== session) {
      exitNotifiedSessionRef.current = session
      onExited(session)
    }
    elapsedRef.current += delta
    const elapsed = elapsedRef.current
    const reduced = reducedMotionRef.current
    const reveal = hologramPortraitProgress(playback.cursor, reduced)
    const opacity = reduced ? playback.reducedMotionOpacity : 1
    const time = reduced ? 0 : elapsed
    edges.forEach((edge, index) => {
      const progress = hologramSegmentProgress(playback.cursor, index, reduced)
      const group = edgeRefs.current[index]
      if (group) {
        group.visible = progress > 0 && !playback.hidden
        group.scale.y = edge.length * progress
        group.children.forEach((child, layerIndex) => {
          ((child as Mesh).material as MeshBasicMaterial).opacity = LASER_LAYERS[layerIndex].opacity * opacity
        })
      }
      const emitter = emitterRefs.current[index]
      if (emitter) {
        const amount = reduced ? opacity : index === 0 ? playback.sourceOpacity
          : Math.max(0, Math.min(1, (hologramSegmentProgress(playback.cursor, index - 1) - 0.8) / 0.2))
        emitter.visible = amount > 0
        ;(emitter.material as MeshBasicMaterial).opacity = 0.95 * amount
      }
    })
    const material = portraitMaterialRef.current
    if (material) {
      material.uniforms.uTime.value = time
      material.uniforms.uReveal.value = reveal
      material.uniforms.uOpacity.value = opacity
      material.uniforms.uViewportHeight.value = gl.domElement.height
    }
    const beamMaterial = beamMaterialRef.current
    if (beamMaterial) {
      beamMaterial.uniforms.uTime.value = time
      beamMaterial.uniforms.uReveal.value = reveal * opacity
    }
    const root = portraitRef.current
    if (root) {
      root.visible = reveal > 0 && !playback.hidden
      root.rotation.y = -Math.PI / 2 + time * 0.16
      root.position.y = -0.12 * (1 - reveal) + (reduced ? 0 : Math.sin(time * 0.8) * 0.018)
    }
  })

  return (
    <group name="alex-hologram-projection">
      {edges.map((edge, index) => (
        <group key={index} ref={(group) => { edgeRefs.current[index] = group }}
          position={edge.start} quaternion={edge.quaternion} visible={false}>
          {LASER_LAYERS.map((layer) => (
            <mesh key={layer.radius} raycast={noRaycast}>
              <tubeGeometry args={[edge.curve, 1, layer.radius, 6, false]} />
              <meshBasicMaterial color={new Color(...layer.color)} transparent opacity={layer.opacity}
                blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      {anchors.map((anchor, index) => (
        <mesh key={`emitter:${index}`} ref={(mesh) => { emitterRefs.current[index] = mesh }}
          position={anchor} visible={false} raycast={noRaycast}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color={[1.3, 3.0, 2.6]} transparent opacity={0.95}
            blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh raycast={noRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[beams.positions, 3]} />
          <bufferAttribute attach="attributes-uv" args={[beams.uvs, 2]} />
        </bufferGeometry>
        <shaderMaterial ref={beamMaterialRef} uniforms={beamUniforms}
          vertexShader={beamVertexShader} fragmentShader={beamFragmentShader}
          transparent depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <group position={position}>
        <group ref={portraitRef} rotation={[0, -Math.PI / 2, 0]} visible={false}>
          <points raycast={noRaycast} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[portrait.positions, 3]} />
              <bufferAttribute attach="attributes-normal" args={[portrait.normals, 3]} />
              <bufferAttribute attach="attributes-surfaceUv" args={[portrait.uvs, 2]} />
            </bufferGeometry>
            <shaderMaterial ref={portraitMaterialRef} uniforms={portraitUniforms}
              vertexShader={portraitVertexShader} fragmentShader={portraitFragmentShader}
              transparent depthWrite depthTest toneMapped={false} />
          </points>
        </group>
      </group>
    </group>
  )
}
