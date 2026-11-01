import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { StudioLayout, StudioTransform, StudioVector3 } from '../editor/studioLayout'
import { DISPLAY_RACK_INSTALLATION_SCALE } from './displayRackGeometry.ts'
import { LAMP_GLOBE_CENTER } from './lampGlow.ts'

export type HologramAnchors = {
  /** World points in the fixed order: mask face, bust head, lamp globe. */
  anchors: [StudioVector3, StudioVector3, StudioVector3]
  /** World position of the holographic portrait's base. */
  position: StudioVector3
}

function transformMatrix(transform: StudioTransform) {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ')),
    new Vector3(...transform.scale),
  )
}

/**
 * Resolves the same transform hierarchy as StudioCanvas, using the current
 * edited layout first. The lamp currently has no extra visualScale; callers
 * may pass asset.visualScale when art direction adds a model-only scale.
 */
export function resolveHologramAnchors(
  studioLayout: StudioLayout,
  defaultStudioLayout: StudioLayout,
  lampVisualScale: readonly [number, number, number] = [1, 1, 1],
): HologramAnchors {
  const resolve = (id: string) => {
    const transform = studioLayout[id] ?? defaultStudioLayout[id]
    if (!transform) throw new Error(`Missing hologram anchor asset: ${id}`)
    return transformMatrix(transform)
  }

  // Red eyes are siblings of AssetSlot, not children of its visualScale or
  // automatic GLB fit group. Their authored midpoint is already asset-local.
  const mask = new Vector3(0, 0.57, 0.18)
    .applyMatrix4(resolve('cthulhu-wall-mask'))

  // Particle data is already in its authored local space (Y: 0..0.98): no
  // AssetSlot fit/centering is applied. The bust itself lives inside the
  // rack-space installation scale, which in turn follows the rack editor root.
  const bust = new Vector3(0, 0.84, -0.04)
    .applyMatrix4(resolve('lovecraft-particle-bust'))
    .multiplyScalar(DISPLAY_RACK_INSTALLATION_SCALE)
    .applyMatrix4(resolve('demonic-display-rack'))

  const lamp = new Vector3(...LAMP_GLOBE_CENTER)
    .multiply(new Vector3(...lampVisualScale))
    .applyMatrix4(resolve('tentacle-lamp'))

  // Keep the portrait above the upper edge and slightly toward the foreground
  // globe, leaving the rear five-arm candelabra unobscured in the saved layout.
  const position = new Vector3().lerpVectors(mask, bust, 0.5).lerp(lamp, 0.18)
  position.y = Math.max(mask.y, bust.y) + 0.40
  return {
    anchors: [mask.toArray(), bust.toArray(), lamp.toArray()],
    position: position.toArray(),
  }
}
