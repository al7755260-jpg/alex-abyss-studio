import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { NameDotMatrixDisplay } from './NameDotMatrixDisplay'

type MonitorInstallationProps = {
  asset: StudioAsset
  active?: boolean
}

export function MonitorInstallation({
  asset,
  active = true,
}: MonitorInstallationProps) {
  return (
    <>
      <AssetSlot asset={asset} />
      <group position={asset.position} rotation={asset.rotation}>
        <NameDotMatrixDisplay position={[0, 0.58, 0.208]} active={active} />
      </group>
    </>
  )
}
