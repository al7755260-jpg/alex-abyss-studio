import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { isFiniteVector3, isStudioTransform, type StudioTransform, type StudioVector3 } from './studioLayout.ts'

function matrixFor(transform: StudioTransform) {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ')),
    new Vector3(...transform.scale),
  )
}

/** Move a world-space anchor with its host, preserving its original local offset. */
export function resolveAttachedPoint(
  defaultTransform: StudioTransform,
  currentTransform: StudioTransform,
  worldPoint: readonly [number, number, number],
): StudioVector3 {
  if (!isStudioTransform(defaultTransform) || !isStudioTransform(currentTransform) || !isFiniteVector3(worldPoint)) {
    throw new TypeError('Attached points and transforms must use finite three-number tuples')
  }
  const resolved = new Vector3(...worldPoint)
    .applyMatrix4(matrixFor(defaultTransform).invert())
    .applyMatrix4(matrixFor(currentTransform))
  return [resolved.x, resolved.y, resolved.z]
}
