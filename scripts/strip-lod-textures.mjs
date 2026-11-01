// Distance LODs supply geometry to meshes that already own their PBR material.
// Keep UVs and primitive/material slots, but omit the unused image payload.
export function stripLodTextures(document) {
  const root = document.getRoot()
  for (const texture of root.listTextures()) texture.dispose()
  for (const extension of root.listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_texture_webp') extension.dispose()
  }
}
