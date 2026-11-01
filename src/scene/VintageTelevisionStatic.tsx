import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { ShaderMaterial } from 'three'

type VintageTelevisionStaticProps = {
  active?: boolean
}

const ignoreRaycast = () => undefined

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 curvedPosition = position;

    // The source GLB's CRT glass is a fitted quadratic surface. Plane X maps
    // to -source Z after the 90-degree rotation below; plane Y stays source Y.
    const float fitScale = 1.08808666;
    float sourceDz = -position.x / fitScale;
    float sourceDy = position.y / fitScale;
    float sourceDepth =
      -0.01507293 * sourceDz
      -0.00245669 * sourceDy
      -0.44573875 * sourceDz * sourceDz
      -0.64589814 * sourceDy * sourceDy
      +0.02209636 * sourceDz * sourceDy;
    curvedPosition.z += sourceDepth * fitScale;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(curvedPosition, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec2 vUv;

  float hash12(vec2 point) {
    vec3 value = fract(vec3(point.xyx) * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float roundedBoxDistance(vec2 point, vec2 halfSize, float radius) {
    vec2 offset = abs(point) - halfSize + radius;
    return min(max(offset.x, offset.y), 0.0)
      + length(max(offset, 0.0))
      - radius;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    float screenDistance = roundedBoxDistance(centeredUv, vec2(0.47, 0.445), 0.085);
    float screenMask = 1.0 - smoothstep(-0.012, 0.01, screenDistance);
    if (screenMask < 0.02) discard;

    float frame = floor(uTime * 22.0);
    vec2 pixel = floor(vUv * vec2(138.0, 96.0));
    float grain = hash12(pixel + vec2(frame * 7.13, frame * 3.71));
    float cluster = hash12(floor(pixel / vec2(3.0, 2.0)) + vec2(frame * 1.7, -frame * 2.1));
    float coarseNoise = hash12(floor(vUv * vec2(44.0, 30.0)) + floor(frame * 0.5));

    float snow = mix(0.11, 0.74, grain);
    snow = mix(snow, 1.0, smoothstep(0.73, 0.98, grain) * 0.72);
    snow *= mix(0.62, 1.16, cluster);
    snow = mix(snow, coarseNoise, 0.18);

    float scanline = 0.78 + 0.22 * sin(vUv.y * 615.0 + uTime * 8.0);
    float tearCenter = fract(uTime * 0.071 + hash12(vec2(floor(uTime * 0.7), 4.0)));
    float tear = exp(-pow((vUv.y - tearCenter) * 34.0, 2.0));
    float burst = step(0.84, hash12(vec2(floor(uTime * 2.35), 91.0)));
    float pulse = 0.82 + 0.1 * sin(uTime * 6.7) + burst * 0.24;

    vec3 coldSnow = vec3(0.28, 0.49, 0.47);
    vec3 deadWhite = vec3(0.96, 0.88, 0.73);
    vec3 color = mix(coldSnow, deadWhite, grain) * snow * scanline * pulse;
    color += vec3(0.05, 0.31, 0.28) * tear * (0.18 + grain * 0.74);

    float vignette = 1.0 - smoothstep(0.18, 0.8, length(centeredUv * vec2(1.05, 1.2)));
    color *= mix(0.34, 1.0, vignette);
    color += vec3(0.006, 0.02, 0.019);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function VintageTelevisionStatic({ active = true }: VintageTelevisionStaticProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const lastUpdateFrameRef = useRef(-1)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(({ clock }) => {
    if (!active || !materialRef.current) return
    const updateFrame = Math.floor(clock.elapsedTime * 30)
    if (updateFrame === lastUpdateFrameRef.current) return
    lastUpdateFrameRef.current = updateFrame
    materialRef.current.uniforms.uTime.value = updateFrame / 30
  })

  return (
    <mesh
      name="vintage-television-static-screen"
      position={[0.3715, 0.4406, 0.049]}
      rotation={[0, Math.PI / 2, 0]}
      renderOrder={3}
      raycast={ignoreRaycast}
    >
      <planeGeometry args={[0.582, 0.455, 18, 14]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        // The CRT is an opaque surface. Drawing it in the transparent pass
        // after holograms used to overwrite projections in front of the TV.
        transparent={false}
        depthTest
        depthWrite
        toneMapped={false}
      />
    </mesh>
  )
}
