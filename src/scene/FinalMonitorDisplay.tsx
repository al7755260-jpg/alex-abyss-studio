import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  type Vector3Tuple,
} from 'three'

const ignoreRaycast: Mesh['raycast'] = () => undefined

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

  float segment(vec2 p, vec2 a, vec2 b, float thickness) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    return 1.0 - smoothstep(thickness, thickness * 2.0, length(pa - ba * h));
  }

  float glyphRow(int glyph, int row) {
    float value = 0.0;

    // A
    if (glyph == 0) {
      if (row == 0) value = 14.0;
      else if (row == 1) value = 17.0;
      else if (row == 2) value = 17.0;
      else if (row == 3) value = 31.0;
      else if (row == 4) value = 17.0;
      else if (row == 5) value = 17.0;
      else value = 17.0;
    }

    // l
    else if (glyph == 1) {
      if (row == 0) value = 12.0;
      else if (row == 1) value = 4.0;
      else if (row == 2) value = 4.0;
      else if (row == 3) value = 4.0;
      else if (row == 4) value = 4.0;
      else if (row == 5) value = 4.0;
      else value = 14.0;
    }

    // e
    else if (glyph == 2) {
      if (row == 0) value = 0.0;
      else if (row == 1) value = 14.0;
      else if (row == 2) value = 17.0;
      else if (row == 3) value = 31.0;
      else if (row == 4) value = 16.0;
      else if (row == 5) value = 16.0;
      else value = 14.0;
    }

    // x
    else if (glyph == 3) {
      if (row == 0) value = 0.0;
      else if (row == 1) value = 17.0;
      else if (row == 2) value = 10.0;
      else if (row == 3) value = 4.0;
      else if (row == 4) value = 10.0;
      else if (row == 5) value = 17.0;
      else value = 0.0;
    }

    // L
    else if (glyph == 4) {
      value = row < 6 ? 16.0 : 31.0;
    }

    // I
    else if (glyph == 5) {
      value = row == 0 || row == 6 ? 31.0 : 4.0;
    }

    return value;
  }

  float glyphDot(int glyph, vec2 center, vec2 size) {
    vec2 uv = (vUv - center) / size + 0.5;
    if (uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) return 0.0;

    vec2 matrixCoord = vec2(uv.x * 5.0, (1.0 - uv.y) * 7.0);
    int column = int(clamp(floor(matrixCoord.x), 0.0, 4.0));
    int row = int(clamp(floor(matrixCoord.y), 0.0, 6.0));
    float mask = glyphRow(glyph, row);
    float divisor = exp2(float(4 - column));
    float enabled = mod(floor(mask / divisor), 2.0);
    float dotCore = 1.0 - smoothstep(0.18, 0.34, length(fract(matrixCoord) - 0.5));
    return enabled * dotCore;
  }

  float nameDotMatrix() {
    vec2 uv = vec2(
      (vUv.x - 0.245) / 0.51,
      (vUv.y - 0.075) / 0.105
    );
    if (uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) return 0.0;

    vec2 matrixCoord = vec2(uv.x * 35.0, (1.0 - uv.y) * 7.0);
    float column = floor(matrixCoord.x);
    int glyph = int(floor(column / 6.0));
    int localColumn = int(mod(column, 6.0));
    int row = int(clamp(floor(matrixCoord.y), 0.0, 6.0));
    if (glyph < 0 || glyph >= 6 || localColumn < 0 || localColumn >= 5) return 0.0;

    float mask = glyphRow(glyph, row);
    float divisor = exp2(float(4 - localColumn));
    float enabled = mod(floor(mask / divisor), 2.0);
    vec2 cell = fract(matrixCoord) - 0.5;
    float core = 1.0 - smoothstep(0.17, 0.31, length(cell));
    float scanPosition = mod(uTime * 3.2, 43.0) - 4.0;
    float scan = exp(-pow((matrixCoord.x - scanPosition) * 0.52, 2.0));
    return enabled * core * (0.72 + scan * 0.28);
  }

  void main() {
    float reveal = smoothstep(0.12, 1.52, uTime);
    float eyeReveal = smoothstep(0.72, 1.48, uTime);
    float breathing = 0.91 + sin(uTime * 1.15) * 0.09;

    vec2 eyePoint = vUv - vec2(0.5, 0.48);
    float eyeBounds = 1.0 - smoothstep(0.272, 0.288, abs(eyePoint.x));
    float lidHeight = 0.112 * pow(
      max(0.0, 1.0 - abs(eyePoint.x) / 0.282),
      0.72
    );
    float eyeOutline = 1.0 - smoothstep(
      0.005,
      0.013,
      abs(abs(eyePoint.y) - lidHeight)
    );
    eyeOutline *= eyeBounds;
    float eyeInterior = 1.0 - smoothstep(
      max(0.0, lidHeight - 0.012),
      lidHeight + 0.002,
      abs(eyePoint.y)
    );
    eyeInterior *= eyeBounds;

    vec2 irisPoint = vec2(eyePoint.x * 1.92, eyePoint.y);
    float irisRadius = length(irisPoint);
    float irisMask = eyeInterior * (1.0 - smoothstep(0.108, 0.12, irisRadius));
    float irisRings = ring(irisRadius, 0.051, 0.0038)
      + ring(irisRadius, 0.083, 0.0042)
      + ring(irisRadius, 0.108, 0.0032);
    float irisAngle = atan(irisPoint.y, irisPoint.x);
    float ticks = pow(max(0.0, cos(irisAngle * 18.0 - uTime * 0.75)), 18.0);
    ticks *= smoothstep(0.055, 0.07, irisRadius)
      * (1.0 - smoothstep(0.094, 0.108, irisRadius));
    float sweepAngle = mod(uTime * 0.42, TAU) - PI;
    float angularDelta = abs(mod(irisAngle - sweepAngle + PI, TAU) - PI);
    float irisSweep = 1.0 - smoothstep(0.0, 0.18, angularDelta);
    irisSweep *= irisMask * smoothstep(0.047, 0.07, irisRadius);

    float pupilWidth = 0.013;
    float pupil = 1.0 - smoothstep(pupilWidth, pupilWidth + 0.008, abs(eyePoint.x));
    pupil *= 1.0 - smoothstep(0.054, 0.082, abs(eyePoint.y));
    pupil *= irisMask;

    float glyphA = glyphDot(0, vec2(0.145, 0.665), vec2(0.052, 0.096));
    float glyphL1 = glyphDot(1, vec2(0.258, 0.786), vec2(0.052, 0.096));
    float glyphE = glyphDot(2, vec2(0.402, 0.846), vec2(0.052, 0.096));
    float glyphX = glyphDot(3, vec2(0.598, 0.846), vec2(0.052, 0.096));
    float glyphL2 = glyphDot(4, vec2(0.742, 0.786), vec2(0.052, 0.096));
    float glyphI = glyphDot(5, vec2(0.855, 0.665), vec2(0.052, 0.096));
    float relicGlyphs = glyphA * smoothstep(0.18, 0.46, uTime)
      + glyphL1 * smoothstep(0.32, 0.60, uTime)
      + glyphE * smoothstep(0.46, 0.74, uTime)
      + glyphX * smoothstep(0.60, 0.88, uTime)
      + glyphL2 * smoothstep(0.74, 1.02, uTime)
      + glyphI * smoothstep(0.88, 1.16, uTime);

    float focusInsetX = 0.082;
    float focusInsetY = 0.165;
    float bracketArmX = 0.074;
    float bracketArmY = 0.105;
    float bracketThickness = 0.0035;
    float brackets = 0.0;
    brackets += segment(vUv, vec2(focusInsetX, 1.0 - focusInsetY), vec2(focusInsetX + bracketArmX, 1.0 - focusInsetY), bracketThickness);
    brackets += segment(vUv, vec2(focusInsetX, 1.0 - focusInsetY), vec2(focusInsetX, 1.0 - focusInsetY - bracketArmY), bracketThickness);
    brackets += segment(vUv, vec2(1.0 - focusInsetX, 1.0 - focusInsetY), vec2(1.0 - focusInsetX - bracketArmX, 1.0 - focusInsetY), bracketThickness);
    brackets += segment(vUv, vec2(1.0 - focusInsetX, 1.0 - focusInsetY), vec2(1.0 - focusInsetX, 1.0 - focusInsetY - bracketArmY), bracketThickness);
    brackets += segment(vUv, vec2(focusInsetX, focusInsetY), vec2(focusInsetX + bracketArmX, focusInsetY), bracketThickness);
    brackets += segment(vUv, vec2(focusInsetX, focusInsetY), vec2(focusInsetX, focusInsetY + bracketArmY), bracketThickness);
    brackets += segment(vUv, vec2(1.0 - focusInsetX, focusInsetY), vec2(1.0 - focusInsetX - bracketArmX, focusInsetY), bracketThickness);
    brackets += segment(vUv, vec2(1.0 - focusInsetX, focusInsetY), vec2(1.0 - focusInsetX, focusInsetY + bracketArmY), bracketThickness);

    float scanY = fract(uTime * 0.105 + 0.16);
    float scan = exp(-pow((vUv.y - scanY) * 105.0, 2.0)) * 0.13 * reveal;
    float scanGrid = pow(max(0.0, sin(vUv.y * 245.0)), 28.0) * 0.014 * reveal;
    float nameSignal = nameDotMatrix() * smoothstep(1.05, 1.64, uTime);

    float cyanSignal = (
      eyeOutline * 0.72
      + irisRings * irisMask * 0.82
      + ticks * 0.72
      + irisSweep * 0.56
    ) * eyeReveal * breathing;
    cyanSignal += scan + scanGrid;
    float brassSignal = (relicGlyphs * 0.86 + brackets * 0.72) * reveal;
    float redSignal = nameSignal * 0.78
      + pupil * eyeReveal * 0.82;

    vec3 cyan = vec3(0.04, 1.55, 1.34);
    vec3 brass = vec3(1.28, 0.54, 0.15);
    vec3 abyssRed = vec3(1.72, 0.055, 0.025);
    vec3 color = cyan * cyanSignal + brass * brassSignal + abyssRed * redSignal;
    float alpha = clamp(
      cyanSignal * 0.78 + brassSignal * 0.72 + redSignal * 0.9,
      0.0,
      0.96
    );

    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

type FinalMonitorDisplayProps = {
  position: Vector3Tuple
  active?: boolean
}

/** Procedural unlock display; all dark pixels remain transparent over the monitor glass. */
export function FinalMonitorDisplay({
  position,
  active = true,
}: FinalMonitorDisplayProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const startedAtRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])

  useFrame(({ clock }) => {
    if (!active) return
    const material = materialRef.current
    if (!material) return

    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime
    const age = clock.elapsedTime - startedAtRef.current
    material.uniforms.uTime.value = reducedMotionRef.current ? 4 : age
  })

  return (
    <mesh
      position={position}
      scale={[0.94, 0.48, 1]}
      raycast={ignoreRaycast}
      renderOrder={15}
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
