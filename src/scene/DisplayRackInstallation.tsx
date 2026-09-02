import { useEffect, useMemo } from 'react'
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { DemonicRackSkulls } from './DemonicRackSkulls'

type DisplayRackInstallationProps = {
  asset: StudioAsset
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x1_0000_0000
  }
}

function createWoodTexture(grayscale = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')

  if (!context) {
    return new CanvasTexture(canvas)
  }

  const random = seededRandom(grayscale ? 9182 : 2718)
  const plankCount = 5
  const plankWidth = canvas.width / plankCount

  context.fillStyle = grayscale ? '#6d6d6d' : '#2b1714'
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let plank = 0; plank < plankCount; plank += 1) {
    const left = plank * plankWidth
    const lightness = 0.86 + random() * 0.24
    context.fillStyle = grayscale
      ? `rgb(${Math.round(92 * lightness)}, ${Math.round(92 * lightness)}, ${Math.round(92 * lightness)})`
      : `rgb(${Math.round(54 * lightness)}, ${Math.round(29 * lightness)}, ${Math.round(23 * lightness)})`
    context.fillRect(left, 0, plankWidth, canvas.height)

    context.strokeStyle = grayscale
      ? 'rgba(28, 28, 28, 0.82)'
      : 'rgba(9, 4, 4, 0.88)'
    context.lineWidth = 4
    context.beginPath()
    context.moveTo(left + 2, 0)
    context.lineTo(left + 2, canvas.height)
    context.stroke()

    context.strokeStyle = grayscale
      ? 'rgba(168, 168, 168, 0.45)'
      : 'rgba(104, 58, 43, 0.42)'
    context.lineWidth = 1.2
    for (let grain = 0; grain < 58; grain += 1) {
      const baseX = left + 7 + random() * (plankWidth - 14)
      const amplitude = 0.8 + random() * 3.2
      const frequency = 0.012 + random() * 0.024
      const phase = random() * Math.PI * 2
      context.beginPath()
      for (let y = 0; y <= canvas.height; y += 8) {
        const x = baseX + Math.sin(y * frequency + phase) * amplitude
        if (y === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
    }

    for (let knot = 0; knot < 3; knot += 1) {
      const x = left + 18 + random() * (plankWidth - 36)
      const y = 55 + random() * (canvas.height - 110)
      context.strokeStyle = grayscale
        ? 'rgba(34, 34, 34, 0.66)'
        : 'rgba(16, 7, 6, 0.7)'
      context.lineWidth = 2
      context.beginPath()
      context.ellipse(x, y, 5 + random() * 8, 13 + random() * 16, 0, 0, Math.PI * 2)
      context.stroke()
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 1.35)
  texture.anisotropy = 4
  if (!grayscale) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function WoodBackPanel() {
  const { colorMap, bumpMap } = useMemo(
    () => ({
      colorMap: createWoodTexture(false),
      bumpMap: createWoodTexture(true),
    }),
    [],
  )

  useEffect(
    () => () => {
      colorMap.dispose()
      bumpMap.dispose()
    },
    [bumpMap, colorMap],
  )

  return (
    <mesh
      position={[0, 1.31, -0.14]}
      receiveShadow
      renderOrder={-1}
    >
      <planeGeometry args={[1.68, 2.05]} />
      <meshStandardMaterial
        map={colorMap}
        bumpMap={bumpMap}
        bumpScale={0.026}
        color="#8c6a58"
        roughness={0.9}
        metalness={0.025}
      />
    </mesh>
  )
}

export function DisplayRackInstallation({ asset }: DisplayRackInstallationProps) {
  const localAsset = useMemo<StudioAsset>(
    () => ({
      ...asset,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    }),
    [asset],
  )

  return (
    <group
      position={asset.position}
      rotation={asset.rotation}
      scale={[0.7, 0.7, 0.7]}
    >
      <AssetSlot asset={localAsset} />
      <WoodBackPanel />
      <DemonicRackSkulls />
    </group>
  )
}
