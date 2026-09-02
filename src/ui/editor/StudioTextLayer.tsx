import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { StudioEditorTool } from '../../editor/studioLayout'
import type {
  StudioTextLayout,
  StudioTextTransform,
} from '../../editor/studioTextLayout'

type StudioTextLayerContextValue = {
  active: boolean
  layout: StudioTextLayout
  selectedLayerId: string | null
  tool: StudioEditorTool
  onSelect: (layerId: string) => void
  onCommit: (layerId: string, transform: StudioTextTransform) => void
}

type StudioTextLayerProviderProps = StudioTextLayerContextValue & {
  children: ReactNode
}

type StudioTextLayerProps = {
  layerId: string
  children: ReactNode
  className?: string
}

type TextLayerStyle = CSSProperties & {
  '--studio-text-x': string
  '--studio-text-y': string
  '--studio-text-rotation': string
  '--studio-text-scale': number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  base: StudioTextTransform
  next: StudioTextTransform
}

const IDENTITY_TEXT_TRANSFORM: StudioTextTransform = Object.freeze({
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
})

const StudioTextLayerContext = createContext<StudioTextLayerContextValue>({
  active: false,
  layout: {},
  selectedLayerId: null,
  tool: 'translate',
  onSelect: () => undefined,
  onCommit: () => undefined,
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number) {
  return Number(value.toFixed(5))
}

function transformForDrag(
  base: StudioTextTransform,
  tool: StudioEditorTool,
  deltaX: number,
  deltaY: number,
): StudioTextTransform {
  if (tool === 'rotate') {
    return {
      ...base,
      rotation: round(clamp(base.rotation + (deltaX - deltaY) * 0.35, -180, 180)),
    }
  }

  if (tool === 'scale') {
    return {
      ...base,
      scale: round(clamp(base.scale * Math.exp((deltaX - deltaY) * 0.005), 0.35, 2)),
    }
  }

  const viewportWidth = Math.max(window.innerWidth, 1)
  const viewportHeight = Math.max(window.innerHeight, 1)
  return {
    ...base,
    x: round(clamp(base.x + deltaX / viewportWidth, -1, 1)),
    y: round(clamp(base.y + deltaY / viewportHeight, -1, 1)),
  }
}

function textLayerStyle(transform: StudioTextTransform): TextLayerStyle {
  return {
    '--studio-text-x': `${transform.x * 100}vw`,
    '--studio-text-y': `${transform.y * 100}vh`,
    '--studio-text-rotation': `${transform.rotation}deg`,
    '--studio-text-scale': transform.scale,
  }
}

function applyTextLayerStyle(node: HTMLElement, transform: StudioTextTransform) {
  node.style.setProperty('--studio-text-x', `${transform.x * 100}vw`)
  node.style.setProperty('--studio-text-y', `${transform.y * 100}vh`)
  node.style.setProperty('--studio-text-rotation', `${transform.rotation}deg`)
  node.style.setProperty('--studio-text-scale', String(transform.scale))
}

export function StudioTextLayerProvider({
  active,
  layout,
  selectedLayerId,
  tool,
  onSelect,
  onCommit,
  children,
}: StudioTextLayerProviderProps) {
  const value = useMemo<StudioTextLayerContextValue>(() => ({
    active,
    layout,
    selectedLayerId,
    tool,
    onSelect,
    onCommit,
  }), [active, layout, onCommit, onSelect, selectedLayerId, tool])

  return (
    <StudioTextLayerContext.Provider value={value}>
      {children}
    </StudioTextLayerContext.Provider>
  )
}

export function StudioTextLayer({
  layerId,
  children,
  className,
}: StudioTextLayerProps) {
  const {
    active,
    layout,
    selectedLayerId,
    tool,
    onSelect,
    onCommit,
  } = useContext(StudioTextLayerContext)
  const dragRef = useRef<DragState | null>(null)
  const transform = layout[layerId] ?? IDENTITY_TEXT_TRANSFORM
  const selected = active && selectedLayerId === layerId

  const finishDrag = (
    event: ReactPointerEvent<HTMLSpanElement>,
    commit: boolean,
  ) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (commit) {
      onCommit(layerId, drag.next)
    } else {
      applyTextLayerStyle(event.currentTarget, drag.base)
    }
  }

  return (
    <span
      className={`studio-text-layer${active ? ' studio-text-layer--editing' : ''}${selected ? ' studio-text-layer--selected' : ''}${className ? ` ${className}` : ''}`}
      data-text-layer-id={layerId}
      data-text-tool={active ? tool : undefined}
      style={textLayerStyle(transform)}
      onPointerDown={active ? (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(layerId)
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          base: transform,
          next: transform,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      } : undefined}
      onPointerMove={active ? (event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        event.preventDefault()
        const next = transformForDrag(
          drag.base,
          tool,
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        )
        drag.next = next
        applyTextLayerStyle(event.currentTarget, next)
      } : undefined}
      onPointerUp={active ? (event) => finishDrag(event, true) : undefined}
      onPointerCancel={active ? (event) => finishDrag(event, false) : undefined}
      onClick={active ? (event) => {
        event.preventDefault()
        event.stopPropagation()
      } : undefined}
    >
      {children}
    </span>
  )
}
