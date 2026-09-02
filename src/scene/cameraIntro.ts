export const CAMERA_INTRO_HOLD_SECONDS = 0.55
export const CAMERA_INTRO_ORBIT_SECONDS = 2.35
export const CAMERA_INTRO_TOTAL_SECONDS =
  CAMERA_INTRO_HOLD_SECONDS + CAMERA_INTRO_ORBIT_SECONDS

export function smootherStep01(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress))
  return clamped * clamped * clamped * (
    clamped * (clamped * 6 - 15) + 10
  )
}

export function shortestAngleDelta(from: number, to: number) {
  const fullTurn = Math.PI * 2
  return ((to - from + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

export function cameraIntroProgress(elapsedSeconds: number, reducedMotion = false) {
  if (reducedMotion) return 1
  const orbitProgress = (
    Math.max(0, elapsedSeconds) - CAMERA_INTRO_HOLD_SECONDS
  ) / CAMERA_INTRO_ORBIT_SECONDS
  return smootherStep01(orbitProgress)
}

export function cameraIntroPhase(elapsedSeconds: number, reducedMotion = false) {
  if (reducedMotion || elapsedSeconds >= CAMERA_INTRO_TOTAL_SECONDS) return 'complete'
  if (elapsedSeconds <= CAMERA_INTRO_HOLD_SECONDS) return 'holding'
  return 'orbiting'
}
