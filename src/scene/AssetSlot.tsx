import {
  Component,
  Suspense,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Mesh, Vector3, type Object3D } from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { PlaceholderAsset } from './PlaceholderAsset'
import { VintageTelevisionStatic } from './VintageTelevisionStatic'
import { useSmallPropLod } from './useSmallPropLod'

// Moving/fracturing assets retain their original topology at every distance.
const REALTIME_ASSET_IDS = new Set([
  'abyssal-desk', 'watching-monitor', 'reliquary-computer', 'eldritch-keyboard',
  'forbidden-bookcase', 'floor-left-candelabra', 'demonic-display-rack',
  'cthulhu-wall-mask', 'tentacle-lamp', 'mechanical-cthulhu-octopus',
  'vintage-television',
])

type AssetSlotProps = {
  asset: StudioAsset
  active?: boolean
  configureObject?: (object: Object3D) => void
}

type BoundaryProps = {
  asset: StudioAsset
  children: ReactNode
}

type BoundaryState = {
  failed: boolean
}

class AssetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[深渊工作室] 无法加载 ${this.props.asset.label}，已使用程序化占位模型。`,
      error,
      info.componentStack,
    )
  }

  render() {
    return this.state.failed ? (
      <PlaceholderAsset asset={this.props.asset} />
    ) : (
      this.props.children
    )
  }
}

function LoadedGlb({ asset, configureObject }: AssetSlotProps) {
  const gltf = useGLTF(asset.src!)

  const prepared = useMemo(() => {
    const object = gltf.scene.clone(true)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = asset.castShadow
        child.receiveShadow = asset.receiveShadow
      }
    })
    configureObject?.(object)

    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const sourceDimension = Math.max(size[asset.fit.axis], 0.0001)
    const uniformScale = asset.fit.size / sourceDimension

    return {
      object,
      uniformScale,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [asset, configureObject, gltf.scene])

  const realtimeUrl = REALTIME_ASSET_IDS.has(asset.id) && /-optimized\.glb(?=\?|$)/.test(asset.src!)
    ? asset.src!.replace(/-optimized\.glb(?=\?|$)/, '-realtime.glb')
    : null
  useSmallPropLod(prepared.object, realtimeUrl)

  return (
    <group scale={prepared.uniformScale}>
      <primitive
        object={prepared.object}
        position={prepared.offset}
        dispose={null}
      />
    </group>
  )
}

export function AssetSlot({
  asset,
  active = true,
  configureObject,
}: AssetSlotProps) {
  return (
    <group
      position={asset.position}
      rotation={asset.rotation}
      scale={asset.visualScale ?? [1, 1, 1]}
    >
      {asset.src ? (
        <AssetErrorBoundary asset={asset}>
          <Suspense fallback={<PlaceholderAsset asset={asset} loading />}>
            <LoadedGlb asset={asset} configureObject={configureObject} />
          </Suspense>
        </AssetErrorBoundary>
      ) : (
        <PlaceholderAsset asset={asset} />
      )}
      {asset.id === 'vintage-television' ? (
        <VintageTelevisionStatic active={active} />
      ) : null}
    </group>
  )
}
