import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  Noise,
  Outline,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

export function PostEffects({
  detailMode = false,
}: {
  detailMode?: boolean
}) {
  return (
    <EffectComposer
      autoClear={false}
      multisampling={0}
      enableNormalPass={false}
    >
      <Outline
        blur={false}
        xRay={false}
        edgeStrength={4.6}
        pulseSpeed={0.72}
        visibleEdgeColor="#f0ae68"
        hiddenEdgeColor="#35130e"
        resolutionScale={0.5}
      />
      <Bloom
        mipmapBlur
        levels={5}
        resolutionScale={0.5}
        intensity={0.3}
        luminanceThreshold={1.25}
        luminanceSmoothing={0.18}
        radius={0.42}
      />
      <BrightnessContrast
        brightness={detailMode ? 0.025 : 0.03}
        contrast={detailMode ? -0.04 : -0.08}
      />
      <Noise
        opacity={0.012}
        premultiply
        blendFunction={BlendFunction.SOFT_LIGHT}
      />
      <Vignette
        eskil={false}
        offset={detailMode ? 0.28 : 0.22}
        darkness={detailMode ? 0.22 : 0.34}
      />
    </EffectComposer>
  )
}
