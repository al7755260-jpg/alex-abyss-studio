import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import {
  DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType,
  LinearFilter, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, Vector3,
  type Texture, type WebGLRenderTarget,
} from 'three'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

type Softbox = {
  direction: Vector3
  right: Vector3
  up: Vector3
  width: number
  height: number
  color: readonly [number, number, number]
}

function softbox(
  direction: [number, number, number],
  width: number,
  height: number,
  color: readonly [number, number, number],
): Softbox {
  const forward = new Vector3(...direction).normalize()
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize()
  const up = new Vector3().crossVectors(forward, right).normalize()
  return { direction: forward, right, up, width, height, color }
}

/** Small, scene-independent linear HDR: broad portrait key, warm rim and
 * restrained cool fill. It provides PBR reflection/irradiance, never a visible
 * background or a runtime scene capture. No downloaded environment is needed.
 */
function createStudioEnvironmentTexture() {
  const width = 512
  const height = 256
  const pixels = new Uint16Array(width * height * 4)
  const panels = [
    softbox([-0.5, 0.65, 0.8], 0.66, 0.52, [4.8, 4.2, 3.55]),
    // Broad enough to retain copper highlights without a separate rim light.
    softbox([0.72, 0.4, -0.55], 0.26, 0.7, [5.0, 2.65, 1.05]),
    softbox([0.82, 0.12, 0.42], 0.48, 0.58, [0.52, 0.78, 0.95]),
    softbox([-0.18, 0.98, -0.12], 0.62, 0.68, [0.9, 0.82, 0.68]),
  ]
  for (let y = 0; y < height; y++) {
    const elevation = ((y + 0.5) / height - 0.5) * Math.PI
    const dy = Math.sin(elevation)
    const latitudeRadius = Math.cos(elevation)
    for (let x = 0; x < width; x++) {
      const azimuth = ((x + 0.5) / width - 0.5) * Math.PI * 2
      const dx = latitudeRadius * Math.cos(azimuth)
      const dz = latitudeRadius * Math.sin(azimuth)
      const upper = dy * 0.5 + 0.5
      let red = 0.028 + upper * 0.022
      let green = 0.016 + upper * 0.035
      let blue = 0.012 + upper * 0.045
      for (const panel of panels) {
        const forward = dx * panel.direction.x + dy * panel.direction.y + dz * panel.direction.z
        if (forward <= 0.15) continue
        const u = (dx * panel.right.x + dy * panel.right.y + dz * panel.right.z) / (forward * panel.width)
        const v = (dx * panel.up.x + dy * panel.up.y + dz * panel.up.z) / (forward * panel.height)
        const u2 = u * u
        const v2 = v * v
        const shape = u2 * u2 * u2 + v2 * v2 * v2
        if (shape > 12) continue
        const weight = Math.exp(-shape)
        red += panel.color[0] * weight
        green += panel.color[1] * weight
        blue += panel.color[2] * weight
      }
      const index = (y * width + x) * 4
      pixels[index] = DataUtils.toHalfFloat(red)
      pixels[index + 1] = DataUtils.toHalfFloat(green)
      pixels[index + 2] = DataUtils.toHalfFloat(blue)
      pixels[index + 3] = DataUtils.toHalfFloat(1)
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, HalfFloatType)
  texture.name = 'studio-softbox-hdr-source'
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = LinearSRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** Bake once per renderer/scene mount. StrictMode cleanup disposes that bake;
 * its next setup creates fresh resources, never reusing disposed textures.
 */
export function StudioEnvironment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { globalIntensity, ambientIntensity } = useStudioLightingSettings()
  const intensity = 0.36 * globalIntensity * ambientIntensity
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity
  const environmentRef = useRef<Texture | null>(null)

  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousIntensity = scene.environmentIntensity
    const source = createStudioEnvironmentTexture()
    const generator = new PMREMGenerator(gl)
    let target: WebGLRenderTarget | null = null
    try {
      target = generator.fromEquirectangular(source)
      target.texture.name = 'studio-softbox-pmrem'
      environmentRef.current = target.texture
      scene.environment = target.texture
      scene.environmentIntensity = intensityRef.current
    } catch (error) {
      console.warn('[深渊工作室] 环境反射准备失败，保留原有直接照明。', error)
    } finally {
      source.dispose()
      generator.dispose()
    }
    return () => {
      if (target && scene.environment === target.texture) {
        scene.environment = previousEnvironment
        scene.environmentIntensity = previousIntensity
      }
      environmentRef.current = null
      target?.dispose()
    }
  }, [gl, scene])

  useEffect(() => {
    if (environmentRef.current && scene.environment === environmentRef.current) {
      scene.environmentIntensity = intensity
    }
  }, [intensity, scene])

  return null
}
