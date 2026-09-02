/**
 * Device base heights measured against the desk's real upward-facing triangles.
 * The monitor and keyboard values also compensate for tiny, nearly invisible
 * feet so their broad support surfaces read as resting on the wood.
 */
export const DESK_DEVICE_BASE_Y = {
  monitor: 1.798,
  computer: 1.801,
  keyboard: 1.795,
} as const
