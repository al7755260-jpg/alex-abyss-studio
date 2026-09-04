import type { Intersection } from 'three'

/**
 * A furniture-sized toggle box must not hide an active child control mounted
 * on the same host. Only remove the explicitly marked coarse box: do not sort
 * hits, promote a child through another host, or discard an actual model
 * surface. Closed, discovered or otherwise inactive children produce no hit.
 */
export function filterRelicHostProxyIntersections(hits: Intersection[]): Intersection[] {
  const activeHosts = new Set<string>()
  for (const { object } of hits) {
    const {
      relicActivationProxy,
      relicHostAssetId,
      hostChildActivationProxy,
      hostChildAssetId,
    } = object.userData
    if (relicActivationProxy === true && typeof relicHostAssetId === 'string') {
      activeHosts.add(relicHostAssetId)
    }
    if (hostChildActivationProxy === true && typeof hostChildAssetId === 'string') {
      activeHosts.add(hostChildAssetId)
    }
  }
  if (activeHosts.size === 0) return hits

  return hits.filter(({ object }) => !(
    (
      object.userData.relicHostOcclusionProxy === true
      || object.userData.hostChildOcclusionProxy === true
    )
    && activeHosts.has(object.userData.studioAssetId)
  ))
}
