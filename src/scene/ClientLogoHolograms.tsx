import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, Box2, BufferGeometry, Color, DoubleSide, EdgesGeometry,
  ExtrudeGeometry, Float32BufferAttribute, Group, LineBasicMaterial, Path,
  ShaderMaterial, Shape, Vector2, Vector3,
} from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import {
  CLIENT_LOGOS, ClientHologramPlayback, HOLOGRAM_LAYOUT_YAW, type ClientLogo,
} from '../data/clientLogos'
import { LAMP_EMISSION_COLOR, LAMP_GLOBE_CENTER, type LampGlowController } from './lampGlow'
import antaSvg from '../assets/client-logos/anta.svg?raw'
import shougangSvg from '../assets/client-logos/shougang-park.svg?raw'
import mideaSvg from '../assets/client-logos/midea.svg?raw'
import filaSvg from '../assets/client-logos/fila.svg?raw'
import descenteSvg from '../assets/client-logos/descente.svg?raw'
import kolonSvg from '../assets/client-logos/kolon.svg?raw'

const LOGO_SVGS: Record<ClientLogo['id'], string> = {
  anta: antaSvg, 'shougang-park': shougangSvg, midea: mideaSvg,
  fila: filaSvg, descente: descenteSvg, kolon: kolonSvg,
}
const noRaycast = () => undefined
const vertexShader = `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const fragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uReveal;
  uniform vec2 uBounds;
  uniform float uMotion;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float height = max(0.001, uBounds.y - uBounds.x);
    float normalizedY = (vLocal.y - uBounds.x) / height;
    float revealMask = 1.0 - smoothstep(uReveal - 0.08, uReveal + 0.02, normalizedY);
    if (revealMask < 0.005 || uReveal < 0.002) discard;
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float lines = 0.88 + 0.12 * sin(vLocal.y * 195.0 + uTime * 1.4 * uMotion);
    float scanY = mix(uBounds.x, uBounds.y, fract(uTime * 0.18));
    float scan = exp(-abs(vLocal.y - scanY) * 75.0) * uMotion;
    float edge = exp(-abs(normalizedY - uReveal) * 40.0) * step(uReveal, 0.98);
    vec3 light = uColor * (1.12 + rim * 1.3 + scan * 0.4 + edge * 1.2);
    gl_FragColor = vec4(light * lines, revealMask * (0.7 + rim * 0.16) * min(uReveal * 3.0, 1.0));
  }
`
const beamVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const beamFragmentShader = `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float sides = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 1.7);
    float travel = 0.8 + 0.2 * sin(vUv.y * 22.0 - uTime * 1.8);
    float fade = (1.0 - vUv.y * 0.72) * smoothstep(0.02, 0.2, vUv.y);
    gl_FragColor = vec4(uColor, sides * fade * travel * 0.12 * uReveal);
  }
`

function buildLogoGeometry(logo: ClientLogo) {
  const paths = new SVGLoader().parse(LOGO_SVGS[logo.id]).paths
  const sourceShapes = paths.flatMap((path) => path.toShapes())
  const bounds = new Box2()
  sourceShapes.forEach((shape) => shape.getPoints(8).forEach((p) => bounds.expandByPoint(p)))
  const size = bounds.getSize(new Vector2())
  const center = bounds.getCenter(new Vector2())
  const scale = Math.min(logo.width / size.x, logo.maxHeight / size.y)
  const normalize = (path: Path) => path.getPoints(8)
    .map((p) => new Vector2((p.x - center.x) * scale, -(p.y - center.y) * scale))
  const shapes = sourceShapes.map((source) => {
    const shape = new Shape(normalize(source))
    shape.holes = source.holes.map((hole) => new Path(normalize(hole)))
    return shape
  })
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 0.065, bevelEnabled: true, bevelThickness: 0.003,
    bevelSize: 0.002, bevelSegments: 1, steps: 1, curveSegments: 8,
  })
  geometry.translate(0, 0, -0.0325)
  geometry.computeBoundingBox()
  return geometry
}

function buildProjectionBeam(position: readonly number[], width: number) {
  const end = new Vector3(...position as [number, number, number])
  const start = end.clone().normalize().multiplyScalar(0.2)
  const half = width * 0.48
  const vertices = [
    ...start.toArray(), end.x - half, end.y, end.z, end.x + half, end.y, end.z,
    ...start.toArray(), end.x, end.y - half * 0.28, end.z - 0.03,
    end.x, end.y + half * 0.28, end.z - 0.03,
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0.5, 0, 0, 1, 1, 1, 0.5, 0, 0, 1, 1, 1], 2))
  geometry.computeVertexNormals()
  return geometry
}

function ProjectedLogo({ logo, index, playback, reducedMotionRef }: {
  logo: ClientLogo
  index: number
  playback: ClientHologramPlayback
  reducedMotionRef: MutableRefObject<boolean>
}) {
  const rootRef = useRef<Group>(null)
  const logoRef = useRef<Group>(null)
  const resources = useMemo(() => {
    const geometry = buildLogoGeometry(logo)
    const edges = new EdgesGeometry(geometry, 24)
    const bounds = geometry.boundingBox!
    const material = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(LAMP_EMISSION_COLOR) }, uTime: { value: 0 },
        uReveal: { value: 0 }, uMotion: { value: 1 },
        uBounds: { value: new Vector2(bounds.min.y - 0.01, bounds.max.y + 0.01) },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
      side: DoubleSide, blending: AdditiveBlending, toneMapped: false,
    })
    const edgeMaterial = new LineBasicMaterial({
      color: new Color(LAMP_EMISSION_COLOR).multiplyScalar(1.5), transparent: true,
      opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    })
    const beamGeometry = buildProjectionBeam(logo.position, logo.width)
    const beamMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(LAMP_EMISSION_COLOR) },
        uReveal: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: beamVertexShader, fragmentShader: beamFragmentShader,
      transparent: true, blending: AdditiveBlending, side: DoubleSide,
      depthWrite: false, toneMapped: false,
    })
    return { geometry, edges, material, edgeMaterial, beamGeometry, beamMaterial }
  }, [logo])

  useEffect(() => () => {
    Object.values(resources).forEach((resource) => resource.dispose())
  }, [resources])

  useFrame(({ clock }) => {
    const root = rootRef.current
    const projected = logoRef.current
    if (!root || !projected) return
    const reveal = playback.reveal(index)
    root.visible = reveal > 0.001
    if (!root.visible) return
    const time = reducedMotionRef.current ? 0 : clock.elapsedTime
    const drift = reducedMotionRef.current ? 0 : Math.sin(time * 0.65 + index * 1.7) * 0.026
    const expansion = 0.18 + reveal * 0.82
    projected.position.set(
      logo.position[0] * expansion,
      logo.position[1] * expansion + drift,
      logo.position[2] * expansion,
    )
    projected.rotation.set(
      logo.rotation[0],
      logo.rotation[1] + (reducedMotionRef.current ? 0 : Math.sin(time * 0.36 + index) * 0.09),
      logo.rotation[2],
    )
    projected.scale.setScalar(0.3 + reveal * 0.7)
    resources.material.uniforms.uReveal.value = reveal
    resources.material.uniforms.uTime.value = time
    resources.material.uniforms.uMotion.value = reducedMotionRef.current ? 0 : 1
    resources.edgeMaterial.opacity = Math.max(0, (reveal - 0.6) / 0.4) * 0.65
    resources.beamMaterial.uniforms.uReveal.value = reveal
    resources.beamMaterial.uniforms.uTime.value = time
  })

  return (
    <group ref={rootRef} name={`client-projection:${logo.id}`} visible={false}>
      <mesh geometry={resources.beamGeometry} material={resources.beamMaterial} raycast={noRaycast} />
      <group ref={logoRef} name={`client-logo:${logo.id}`} userData={{ clientName: logo.name }}>
        <mesh geometry={resources.geometry} material={resources.material} raycast={noRaycast} />
        <lineSegments geometry={resources.edges} material={resources.edgeMaterial} raycast={noRaycast} />
      </group>
    </group>
  )
}

export function ClientLogoHolograms({ controller, enabled, reducedMotionRef }: {
  controller: LampGlowController
  enabled: boolean
  reducedMotionRef: MutableRefObject<boolean>
}) {
  const playback = useMemo(() => new ClientHologramPlayback(), [])
  const rootRef = useRef<Group>(null)
  // Run before the child callbacks, without taking over R3F's rendering loop.
  useFrame((_, delta) => {
    playback.advance(delta, enabled && controller.snapshot.targetOn, reducedMotionRef.current)
    if (rootRef.current) rootRef.current.visible = playback.elapsed > 0
  }, -1)

  return (
    <group ref={rootRef} name="client-logo-holograms" position={LAMP_GLOBE_CENTER}
      rotation={[0, HOLOGRAM_LAYOUT_YAW, 0]} visible={false}>
      {CLIENT_LOGOS.map((logo, index) => (
        <ProjectedLogo key={logo.id} logo={logo} index={index}
          playback={playback} reducedMotionRef={reducedMotionRef} />
      ))}
    </group>
  )
}
