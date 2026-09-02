export type DetailDimensions = {
  x: number
  y: number
  z: number
}

export const DETAIL_RELIC_SIZE = 1.5
export const DETAIL_PARCHMENT_TARGET_WIDTH = 4.05
export const DETAIL_PARCHMENT_OFFSET = 1.85
export const DETAIL_INITIAL_CAMERA_DISTANCE = 4.8
export const DETAIL_MIN_CAMERA_DISTANCE = 2.75
export const DETAIL_PARCHMENT_SAFE_WIDTH_RATIO = 0.64
export const DETAIL_PARCHMENT_SAFE_HEIGHT_RATIO = 0.76
export const DETAIL_CENTER = [0.36, 1.12, -1.04] as const

export const DETAIL_PARCHMENT_SOURCE_DIMENSIONS: DetailDimensions = {
  x: 0.6,
  y: 0.549974,
  z: 0.096536,
}

export function measureArtifactDetailReferenceFraming(
  viewportWidth: number,
  viewportHeight: number,
  verticalFovDegrees = 40,
) {
  const aspect = viewportWidth / Math.max(viewportHeight, 1)
  const halfFovTangent = Math.tan((verticalFovDegrees * Math.PI) / 360)
  const parchmentScale = DETAIL_PARCHMENT_TARGET_WIDTH /
    DETAIL_PARCHMENT_SOURCE_DIMENSIONS.x
  const parchmentHeight = DETAIL_PARCHMENT_SOURCE_DIMENSIONS.y * parchmentScale
  const parchmentDistance = DETAIL_INITIAL_CAMERA_DISTANCE + DETAIL_PARCHMENT_OFFSET
  const parchmentVerticalSpan = 2 * parchmentDistance * halfFovTangent
  const relicVerticalSpan = 2 * DETAIL_INITIAL_CAMERA_DISTANCE * halfFovTangent

  return {
    parchmentWidthRatio: DETAIL_PARCHMENT_TARGET_WIDTH /
      (parchmentVerticalSpan * aspect),
    parchmentHeightRatio: parchmentHeight / parchmentVerticalSpan,
    relicMaxAxisHeightRatio: DETAIL_RELIC_SIZE / relicVerticalSpan,
  }
}

export function measureArtifactDetailFit(source: DetailDimensions) {
  const largestSourceAxis = Math.max(source.x, source.y, source.z, 0.0001)
  const relicScale = DETAIL_RELIC_SIZE / largestSourceAxis
  const relic = {
    x: source.x * relicScale,
    y: source.y * relicScale,
    z: source.z * relicScale,
  }
  const relicRadius = Math.hypot(relic.x, relic.y, relic.z) / 2
  const parchmentScale = DETAIL_PARCHMENT_TARGET_WIDTH /
    DETAIL_PARCHMENT_SOURCE_DIMENSIONS.x
  const parchmentHeight = DETAIL_PARCHMENT_SOURCE_DIMENSIONS.y * parchmentScale
  const parchmentDepth = DETAIL_PARCHMENT_SOURCE_DIMENSIONS.z * parchmentScale
  const parchmentFrontDistance = DETAIL_PARCHMENT_OFFSET - parchmentDepth / 2
  const perspectiveFactor = (
    DETAIL_MIN_CAMERA_DISTANCE + DETAIL_PARCHMENT_OFFSET
  ) / DETAIL_MIN_CAMERA_DISTANCE

  return {
    relic,
    relicRadius,
    parchmentHeight,
    parchmentDepth,
    depthClearance: parchmentFrontDistance - relicRadius,
    projectedWidthRatio: (
      relic.x / DETAIL_PARCHMENT_TARGET_WIDTH
    ) * perspectiveFactor,
    projectedHeightRatio: (relic.y / parchmentHeight) * perspectiveFactor,
  }
}
