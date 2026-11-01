import { ShaderChunk } from 'three'

type DirectLightChunks = Pick<typeof ShaderChunk, 'lights_fragment_begin'>

const POINT_SECTION = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'
const SPOT_SECTION = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'
const DIRECTIONAL_SECTION = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'
const DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'
const ORIGINAL_CALL = `\t\t${DIRECT_CALL}`
const GUARDED_CALL = `\t\t// cthulhu:skip-zero-local-light\n\t\tif ( directLight.visible ) {\n\t\t\t${DIRECT_CALL}\n\t\t}`

function guardSection(section: string, lightInfo: string): string | null {
  if (!section.includes(lightInfo) || section.split(DIRECT_CALL).length !== 2) return null
  // The chunk itself is the installation marker, so HMR/module re-evaluation
  // cannot wrap an already patched call again.
  if (section.includes(GUARDED_CALL)) return section
  if (!section.includes(ORIGINAL_CALL) || section.includes('cthulhu:skip-zero-local-light')) return null
  return section.replace(ORIGINAL_CALL, GUARDED_CALL)
}

/**
 * Install before the first renderer compiles its materials (Canvas module scope).
 * Three r185 computes directLight.visible from the attenuated light color, but
 * still evaluates the full BRDF when it is zero. Guard only the point/spot BRDF
 * calls; their existing light maps, shadow tests and all other lighting remain
 * byte-for-byte unchanged. No materials, textures or per-frame work are added.
 *
 * The optional target/warn arguments let tests exercise version mismatch without
 * changing Three's global shader registry. False leaves the source untouched.
 */
export function installDirectLightOptimization(
  chunks: DirectLightChunks = ShaderChunk,
  warn: (message: string) => void = console.warn,
): boolean {
  const source = chunks.lights_fragment_begin
  const pointStart = source.indexOf(POINT_SECTION)
  const spotStart = source.indexOf(SPOT_SECTION)
  const directionalStart = source.indexOf(DIRECTIONAL_SECTION)
  const hasExpectedSections = pointStart >= 0
    && spotStart > pointStart
    && directionalStart > spotStart
    && source.indexOf(POINT_SECTION, pointStart + 1) === -1
    && source.indexOf(SPOT_SECTION, spotStart + 1) === -1
    && source.indexOf(DIRECTIONAL_SECTION, directionalStart + 1) === -1
  const pointSection = hasExpectedSections
    ? guardSection(source.slice(pointStart, spotStart), 'getPointLightInfo( pointLight, geometryPosition, directLight );')
    : null
  const spotSection = hasExpectedSections
    ? guardSection(source.slice(spotStart, directionalStart), 'getSpotLightInfo( spotLight, geometryPosition, directLight );')
    : null

  if (pointSection === null || spotSection === null) {
    warn('[深渊工作室] 灯光优化未安装：Three lights_fragment_begin 与预期 r185 点光/聚光结构不一致，已保留原始着色器。')
    return false
  }

  chunks.lights_fragment_begin = source.slice(0, pointStart)
    + pointSection
    + spotSection
    + source.slice(directionalStart)
  return true
}
