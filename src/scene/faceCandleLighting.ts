export type FaceCandleVector3 = [number, number, number]

export type FaceCandleLightConfig = {
  position: FaceCandleVector3
  target: FaceCandleVector3
  color: string
  baseIntensity: number
  distance: number
  angle: number
  penumbra: number
  decay: number
}

/**
 * A camera-side, tightly bounded candle reflection for the intact half of the
 * portrait. The finite cone reaches the cheek and forehead but stops before
 * the open brain cavity, so the room keeps its colder, deeper contrast.
 */
export const FACE_CANDLE_LIGHT: FaceCandleLightConfig = {
  position: [-3.5, 0.2, 7.2],
  target: [-1.6, 3.8, 3.2],
  color: '#f28b4b',
  baseIntensity: 18.5,
  distance: 7.35,
  angle: 0.42,
  penumbra: 0.9,
  decay: 2,
}

/** Smooth deterministic flicker: no random frame-to-frame jumps. */
export function faceCandleIntensity(time: number) {
  const flicker =
    Math.sin(time * 5.1 + 0.4) * 0.052 +
    Math.sin(time * 11.7 + 1.2) * 0.018 +
    Math.sin(time * 1.31 + 2.0) * 0.012

  return FACE_CANDLE_LIGHT.baseIntensity * (1 + flicker)
}
