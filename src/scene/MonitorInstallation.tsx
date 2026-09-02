import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { FinalMonitorDisplay } from './FinalMonitorDisplay'
import { NameDotMatrixDisplay } from './NameDotMatrixDisplay'

type MonitorInstallationProps = {
  asset: StudioAsset
  finaleReady?: boolean
  active?: boolean
}

export function MonitorInstallation({
  asset,
  finaleReady = false,
  active = true,
}: MonitorInstallationProps) {
  return (
    <>
      <AssetSlot asset={asset} />
      <group position={asset.position} rotation={asset.rotation}>
        {finaleReady ? (
          <FinalMonitorDisplay
            position={[0, 0.58, 0.214]}
            active={active}
          />
        ) : (
          <NameDotMatrixDisplay position={[0, 0.58, 0.208]} active={active} />
        )}
      </group>
    </>
  )
}
