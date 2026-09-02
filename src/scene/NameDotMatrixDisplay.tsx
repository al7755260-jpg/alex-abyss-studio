import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  ShaderMaterial,
  type Vector3Tuple,
} from 'three'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  float glyphRow(int glyph, int row) {
    // A
    if (glyph == 0) {
      if (row == 0) return 14.0;
      if (row == 1) return 17.0;
      if (row == 2) return 17.0;
      if (row == 3) return 31.0;
      if (row == 4) return 17.0;
      if (row == 5) return 17.0;
      return 17.0;
    }

    // l
    if (glyph == 1) {
      if (row == 0) return 12.0;
      if (row == 1) return 4.0;
      if (row == 2) return 4.0;
      if (row == 3) return 4.0;
      if (row == 4) return 4.0;
      if (row == 5) return 4.0;
      return 14.0;
    }

    // e
    if (glyph == 2) {
      if (row == 0) return 0.0;
      if (row == 1) return 14.0;
      if (row == 2) return 17.0;
      if (row == 3) return 31.0;
      if (row == 4) return 16.0;
      if (row == 5) return 16.0;
      return 14.0;
    }

    // x
    if (glyph == 3) {
      if (row == 0) return 0.0;
      if (row == 1) return 17.0;
      if (row == 2) return 10.0;
      if (row == 3) return 4.0;
      if (row == 4) return 10.0;
      if (row == 5) return 17.0;
      return 0.0;
    }

    // L
    if (glyph == 4) {
      if (row < 6) return 16.0;
      return 31.0;
    }

    // I
    if (glyph == 5) {
      if (row == 0 || row == 6) return 31.0;
      return 4.0;
    }

    return 0.0;
  }

  void main() {
    const float columns = 35.0;
    const float rows = 7.0;

    vec2 matrixCoord = vec2(vUv.x * columns, (1.0 - vUv.y) * rows);
    float column = floor(matrixCoord.x);
    int glyph = int(floor(column / 6.0));
    int localColumn = int(mod(column, 6.0));
    int row = int(clamp(floor(matrixCoord.y), 0.0, 6.0));

    float enabled = 0.0;
    if (glyph >= 0 && glyph < 6 && localColumn >= 0 && localColumn < 5) {
      float mask = glyphRow(glyph, row);
      float divisor = exp2(float(4 - localColumn));
      enabled = mod(floor(mask / divisor), 2.0);
    }

    vec2 cell = fract(matrixCoord) - 0.5;
    float distanceToDot = length(cell);
    float core = 1.0 - smoothstep(0.19, 0.34, distanceToDot);
    float halo = 1.0 - smoothstep(0.22, 0.52, distanceToDot);

    float scanPosition = mod(uTime * 5.2, columns + 8.0) - 4.0;
    float scan = exp(-pow((matrixCoord.x - scanPosition) * 0.46, 2.0));
    float pulse = 0.92 + sin(uTime * 4.1 + float(glyph) * 0.83) * 0.08;
    float activeSignal = enabled * (pulse + scan * 0.42);
    float dormant = (1.0 - enabled) * core * 0.055;

    vec3 redCore = vec3(5.2, 0.045, 0.018);
    vec3 darkRed = vec3(0.24, 0.004, 0.002);
    vec3 color = redCore * (core * activeSignal + halo * activeSignal * 0.23) * uIntensity
      + darkRed * dormant;
    float alpha = clamp(
      core * activeSignal + halo * activeSignal * 0.42 + dormant,
      0.0,
      1.0
    );

    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

type NameDotMatrixDisplayProps = {
  position: Vector3Tuple
  rotation?: Vector3Tuple
  size?: [number, number]
  highlighted?: boolean
  active?: boolean
}

/** Red 5×7 digital dot-matrix display spelling the exact name “AlexLI”. */
export function NameDotMatrixDisplay({
  position,
  rotation = [0, 0, 0],
  size = [0.86, 0.172],
  highlighted = false,
  active = true,
}: NameDotMatrixDisplayProps) {
  const { globalIntensity } = useStudioLightingSettings()
  const materialRef = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 1 },
  }), [])

  useFrame(({ clock }) => {
    if (!active) return
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime
      materialRef.current.uniforms.uIntensity.value = highlighted
        ? 1.75 + Math.sin(clock.elapsedTime * 3.1) * 0.22
        : 1
    }
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh scale={[size[0], size[1], 1]} renderOrder={14}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          blending={AdditiveBlending}
          transparent
          depthTest
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        color="#ff2016"
        intensity={(highlighted ? 1.08 : 0.42) * globalIntensity}
        distance={highlighted ? 1.65 : 0.9}
        decay={2}
        position={[0, 0, 0.05]}
      />
    </group>
  )
}
