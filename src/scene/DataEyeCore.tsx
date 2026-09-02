import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  ShaderMaterial,
  type Vector3Tuple,
} from 'three'

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
  varying vec2 vUv;

  const float PI = 3.14159265359;
  const float TAU = 6.28318530718;

  float ring(float radius, float target, float thickness) {
    return 1.0 - smoothstep(thickness, thickness * 2.0, abs(radius - target));
  }

  float angularDistance(float a, float b) {
    return abs(mod(a - b + PI, TAU) - PI);
  }

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= 1.58;

    float radius = length(p);
    float angle = atan(p.y, p.x);
    float eyeMask = 1.0 - smoothstep(0.46, 0.505, radius);
    float irisMask = smoothstep(0.075, 0.12, radius) * eyeMask;

    float slow = uTime * 0.52;
    float fast = uTime * 1.65;
    float rings = ring(radius, 0.18, 0.006)
      + ring(radius, 0.275 + sin(slow) * 0.006, 0.007)
      + ring(radius, 0.375, 0.005);

    float tickBand = smoothstep(0.25, 0.285, radius)
      * (1.0 - smoothstep(0.35, 0.385, radius));
    float ticks = pow(max(0.0, cos(angle * 28.0 - fast)), 15.0) * tickBand;

    float dataBand = smoothstep(0.125, 0.16, radius)
      * (1.0 - smoothstep(0.22, 0.255, radius));
    float dataTicks = pow(max(0.0, cos(angle * 17.0 + slow * 2.3)), 9.0)
      * dataBand;

    float scanAngle = mod(fast * 0.72, TAU) - PI;
    float scan = 1.0 - smoothstep(0.0, 0.28, angularDistance(angle, scanAngle));
    scan *= smoothstep(0.10, 0.18, radius) * (1.0 - smoothstep(0.39, 0.47, radius));

    float pulseRadius = 0.13 + mod(uTime * 0.09, 0.22);
    float pulse = ring(radius, pulseRadius, 0.008) * (1.0 - radius * 1.6);

    float pupil = 1.0 - smoothstep(0.025, 0.055, abs(p.x));
    pupil *= 1.0 - smoothstep(0.22, 0.39, abs(p.y));
    float pupilEdge = smoothstep(0.015, 0.052, abs(p.x))
      * (1.0 - smoothstep(0.052, 0.078, abs(p.x)))
      * (1.0 - smoothstep(0.19, 0.40, abs(p.y)));

    float noise = sin((p.x * 71.0 + p.y * 43.0) + uTime * 3.0) * 0.5 + 0.5;
    float circuitry = smoothstep(0.90, 0.99, noise)
      * smoothstep(0.16, 0.24, radius)
      * (1.0 - smoothstep(0.36, 0.46, radius));

    float energy = (0.16 + rings * 0.65 + ticks * 1.25 + dataTicks * 0.95
      + scan * 0.8 + pulse * 0.65 + circuitry * 0.55 + pupilEdge * 1.3)
      * irisMask;
    float breathing = 0.92 + sin(uTime * 2.1) * 0.08;

    vec3 deepCyan = vec3(0.015, 0.28, 0.31);
    vec3 hotCyan = vec3(0.08, 2.15, 1.92);
    vec3 color = mix(deepCyan, hotCyan, clamp(energy, 0.0, 1.0));
    color *= energy * breathing;
    color *= 1.0 - pupil * 0.94;

    float alpha = eyeMask * clamp(energy * 0.92 + pupilEdge * 0.75, 0.0, 0.96);
    if (alpha < 0.012) discard;

    gl_FragColor = vec4(color, alpha);
  }
`

type DataEyeCoreProps = {
  position: Vector3Tuple
  rotation?: Vector3Tuple
  size?: [number, number]
}

export function DataEyeCore({
  position,
  rotation = [0, 0, 0],
  size = [0.28, 0.17],
}: DataEyeCoreProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={[size[0], size[1], 1]}
      renderOrder={12}
    >
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
  )
}
