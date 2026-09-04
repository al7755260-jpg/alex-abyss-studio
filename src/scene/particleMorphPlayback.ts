export type ParticleMorphDirection = 'forward' | 'reverse'

export function resolveParticleMorphProgress(
  direction: ParticleMorphDirection,
  elapsed: number,
  duration: number,
) {
  const normalizedTime = Math.min(Math.max(elapsed / duration, 0), 1)
  return direction === 'forward' ? normalizedTime : 1 - normalizedTime
}
