export const DISPLAY_RACK_INSTALLATION_SCALE = 0.7

// Measured GLB bounds after AssetSlot's Y-fit and the asset's visualScale.
// The installation has an additional uniform scale; its interaction box must
// use that same scale instead of the old, full-sized furniture placeholder.
const FITTED_BODY_SIZE = [2.048942, 2.62, 0.47962] as const
export const DISPLAY_RACK_INTERACTION_SIZE = FITTED_BODY_SIZE.map(
  (size) => Math.ceil(size * DISPLAY_RACK_INSTALLATION_SCALE * 1000) / 1000,
) as [number, number, number]
