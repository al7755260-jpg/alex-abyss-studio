import type { ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { StudioTransform } from '../editor/studioLayout'

type Vector3Tuple = [number, number, number]

export type FittedInscriptionProps = {
  name: string
  modelUrl: string
  targetWidth: number
  defaultText: string
  text: string
  transform: StudioTransform
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
  maxCharactersPerLine?: number
  dynamicColors?: readonly string[]
}

type DynamicTexture = {
  source: string
  texture: CanvasTexture
  aspect: number
}

const TEXTURE_WIDTH = 1536
const TEXTURE_HORIZONTAL_PADDING = 112
const TEXTURE_VERTICAL_PADDING = 80
const DEFAULT_DYNAMIC_COLORS = ['#c4c8b8', '#319095', '#a83c2f'] as const
const TEXT_FONT_FAMILY = '"Noto Serif SC", "STKaiti", "KaiTi", "Microsoft YaHei", serif'

function wrapInscription(text: string, maxCharactersPerLine: number) {
  const lines: string[] = []

  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    const characters = Array.from(paragraph.trim())
    if (characters.length === 0) {
      lines.push('')
      continue
    }

    for (let index = 0; index < characters.length; index += maxCharactersPerLine) {
      lines.push(characters.slice(index, index + maxCharactersPerLine).join(''))
    }
  }

  return lines
}

function createDynamicTexture(
  text: string,
  maxCharactersPerLine: number,
  colors: readonly string[],
  minimumHeight: number,
  source: string,
): DynamicTexture | null {
  if (typeof document === 'undefined') return null

  const lines = wrapInscription(text, Math.max(1, maxCharactersPerLine))
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = Math.min(
    2048,
    Math.max(448, Math.round(minimumHeight), 160 + lines.length * 210),
  )

  const context = canvas.getContext('2d')
  if (!context) return null

  const availableWidth = canvas.width - TEXTURE_HORIZONTAL_PADDING * 2
  const availableHeight = canvas.height - TEXTURE_VERTICAL_PADDING * 2
  let fontSize = Math.min(176, availableHeight / Math.max(lines.length * 1.28, 1))

  context.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
  const widestLine = Math.max(1, ...lines.map((line) => context.measureText(line || ' ').width))
  if (widestLine > availableWidth) fontSize *= availableWidth / widestLine

  const lineHeight = fontSize * 1.28
  const contentHeight = lineHeight * lines.length
  const firstBaseline = (canvas.height - contentHeight) / 2 + lineHeight * 0.76

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(4, fontSize * 0.055)
  context.strokeStyle = 'rgba(3, 12, 14, 0.82)'

  lines.forEach((line, index) => {
    const baseline = firstBaseline + index * lineHeight
    const color = colors[index % Math.max(colors.length, 1)] ?? DEFAULT_DYNAMIC_COLORS[0]
    context.shadowColor = color
    context.shadowBlur = Math.max(10, fontSize * 0.1)
    context.strokeText(line, canvas.width / 2, baseline)
    context.fillStyle = color
    context.fillText(line, canvas.width / 2, baseline)
  })

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  return {
    source,
    texture,
    aspect: canvas.width / canvas.height,
  }
}

export const FittedInscription = forwardRef<Group, FittedInscriptionProps>(
  function FittedInscription(
    {
      name,
      modelUrl,
      targetWidth,
      defaultText,
      text,
      transform,
      editing = false,
      selected = false,
      onSelect,
      maxCharactersPerLine = 9,
      dynamicColors = DEFAULT_DYNAMIC_COLORS,
    },
    ref,
  ) {
    const gltf = useGLTF(modelUrl)
    const deferredText = useDeferredValue(text)
    const visibleText = deferredText.trim()
    const showApprovedModel = visibleText.length > 0 && deferredText === defaultText

    const prepared = useMemo(() => {
      const object = gltf.scene.clone(true)
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return
        child.castShadow = false
        child.receiveShadow = true
      })

      object.updateMatrixWorld(true)
      const bounds = new Box3().setFromObject(object)
      const size = bounds.getSize(new Vector3())
      const center = bounds.getCenter(new Vector3())
      const scale = targetWidth / Math.max(size.x, 0.0001)

      return {
        object,
        scale,
        height: size.y * scale,
        depth: size.z * scale,
        offset: [-center.x, -center.y, -center.z] as Vector3Tuple,
      }
    }, [gltf.scene, targetWidth])

    const minimumTextureHeight = TEXTURE_WIDTH * prepared.height / targetWidth
    const dynamicTextureSource = visibleText.length > 0 && !showApprovedModel
      ? JSON.stringify([
        visibleText,
        maxCharactersPerLine,
        dynamicColors,
        minimumTextureHeight,
      ])
      : null
    const [dynamicTexture, setDynamicTexture] = useState<DynamicTexture | null>(null)

    useEffect(() => {
      if (!dynamicTextureSource) {
        setDynamicTexture(null)
        return undefined
      }

      const nextTexture = createDynamicTexture(
        visibleText,
        maxCharactersPerLine,
        dynamicColors,
        minimumTextureHeight,
        dynamicTextureSource,
      )
      setDynamicTexture(nextTexture)

      return () => nextTexture?.texture.dispose()
    }, [
      dynamicTextureSource,
      dynamicColors,
      maxCharactersPerLine,
      minimumTextureHeight,
      visibleText,
    ])

    const activeDynamicTexture = dynamicTexture?.source === dynamicTextureSource
      ? dynamicTexture
      : null

    const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
      if (!editing || event.button !== 0 || event.delta > 8) return
      event.stopPropagation()
      onSelect?.()
    }, [editing, onSelect])

    const dynamicHeight = activeDynamicTexture
      ? targetWidth / activeDynamicTexture.aspect
      : 0
    const proxyHeight = Math.max(prepared.height, dynamicHeight, targetWidth * 0.3)

    return (
      <group
        ref={ref}
        name={name}
        position={transform.position}
        rotation={transform.rotation}
        scale={transform.scale}
        userData={{ inscription: text, editableInscription: true }}
        onClick={editing ? handleClick : undefined}
      >
        {showApprovedModel ? (
          <group scale={prepared.scale}>
            <primitive
              object={prepared.object}
              position={prepared.offset}
              dispose={null}
            />
          </group>
        ) : null}

        {activeDynamicTexture ? (
          <mesh
            name={`${name}:dynamic-text`}
            position={[0, 0, prepared.depth * 0.5 + 0.006]}
          >
            <planeGeometry args={[targetWidth, dynamicHeight]} />
            <meshBasicMaterial
              map={activeDynamicTexture.texture}
              transparent
              alphaTest={0.025}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ) : null}

        {editing ? (
          <mesh
            name={`${name}:interaction-proxy`}
            position={[0, 0, -Math.max(prepared.depth, 0.08)]}
            renderOrder={2}
            userData={{ interactionProxy: true }}
            onClick={handleClick}
          >
            <boxGeometry args={[targetWidth * 1.12, proxyHeight * 1.3, 0.04]} />
            <meshBasicMaterial
              color={selected ? '#37d6cf' : '#ffffff'}
              transparent
              opacity={selected ? 0.13 : 0}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ) : null}
      </group>
    )
  },
)
