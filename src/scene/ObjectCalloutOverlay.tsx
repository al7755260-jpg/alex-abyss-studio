import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MathUtils, Vector3 } from 'three'
import type { Vector3Tuple } from '../data/studioAssets'
import { StudioTextLayer } from '../ui/editor/StudioTextLayer'

export type ObjectCalloutTarget = {
  id: string
  label: string
  textLayerId: string
  position: Vector3Tuple
  accent: string
}

type ObjectCalloutSide = 'left' | 'right'

const SIDE_BY_TARGET: Readonly<Record<string, ObjectCalloutSide>> = {
  'tide-index-seal': 'left',
  'deviant-iris-wheel': 'right',
  'drowned-dream-core': 'left',
  'fingerprint-casket': 'right',
  'voice-hyoid': 'right',
  'spinal-clasp': 'left',
  'final-monitor': 'right',
  'dream-archive-shelf': 'right',
}

const VERTICAL_BIAS_BY_TARGET: Readonly<Record<string, number>> = {
  'tide-index-seal': -86,
  'deviant-iris-wheel': -66,
  'drowned-dream-core': -78,
  'fingerprint-casket': 48,
  'voice-hyoid': 18,
  'spinal-clasp': 56,
  'final-monitor': -48,
  'dream-archive-shelf': -42,
}

const projectedPosition = new Vector3()
let calloutScreenCenter: [number, number] = [0, 0]

function calculateCalloutPosition(
  _: unknown,
  __: unknown,
  size: { width: number; height: number },
) {
  const x = size.width / 2
  const y = size.height / 2
  if (calloutScreenCenter[0] !== x || calloutScreenCenter[1] !== y) {
    calloutScreenCenter = [x, y]
  }
  return calloutScreenCenter
}

function setPath(path: SVGPathElement | null, value: string) {
  path?.setAttribute('d', value)
}

export function ObjectCalloutOverlay({
  target,
}: {
  target: ObjectCalloutTarget | null
}) {
  const [retainedTarget, setRetainedTarget] = useState<ObjectCalloutTarget | null>(target)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const auraPathRef = useRef<SVGPathElement>(null)
  const mainPathRef = useRef<SVGPathElement>(null)
  const tracerPathRef = useRef<SVGPathElement>(null)
  const smoothedRef = useRef({ id: '', x: 0, y: 0 })
  const renderedRef = useRef({
    projected: '',
    path: '',
    anchorTransform: '',
    panelX: '',
    panelY: '',
    panelWidth: '',
    panelHeight: '',
    side: '',
  })

  useEffect(() => {
    if (target) {
      setRetainedTarget(target)
      return
    }

    const timeout = window.setTimeout(() => setRetainedTarget(null), 360)
    return () => window.clearTimeout(timeout)
  }, [target])

  const displayedTarget = target ?? retainedTarget

  useFrame(({ camera, size }, delta) => {
    const root = rootRef.current
    const panel = panelRef.current
    const anchor = anchorRef.current
    if (!root || !panel || !anchor || !displayedTarget || !target) return

    projectedPosition
      .set(...displayedTarget.position)
      .project(camera)

    const projectedInsideDepth = projectedPosition.z >= -1 && projectedPosition.z <= 1
    const rawX = (projectedPosition.x * 0.5 + 0.5) * size.width
    const rawY = (-projectedPosition.y * 0.5 + 0.5) * size.height
    const insideViewport =
      projectedInsideDepth &&
      rawX >= -28 && rawX <= size.width + 28 &&
      rawY >= -28 && rawY <= size.height + 28

    const rendered = renderedRef.current
    const projectedValue = insideViewport ? 'true' : 'false'
    if (rendered.projected !== projectedValue) {
      rendered.projected = projectedValue
      root.dataset.projected = projectedValue
    }
    if (!insideViewport) return

    const smoothed = smoothedRef.current
    if (smoothed.id !== displayedTarget.id) {
      smoothed.id = displayedTarget.id
      smoothed.x = rawX
      smoothed.y = rawY
    } else {
      const smoothing = 1 - Math.exp(-Math.min(delta, 0.05) * 15)
      smoothed.x = MathUtils.lerp(smoothed.x, rawX, smoothing)
      smoothed.y = MathUtils.lerp(smoothed.y, rawY, smoothing)
    }

    const compact = size.width <= 720
    const panelWidth = compact
      ? MathUtils.clamp(size.width * 0.58, 164, 206)
      : MathUtils.clamp(size.width * 0.17, 190, 244)
    const panelHeight = compact ? 52 : 58
    const safeX = compact ? 16 : Math.max(28, size.width * 0.025)
    const safeTop = compact ? 94 : 118
    const safeBottom = compact ? 116 : 112
    const reach = compact
      ? MathUtils.clamp(size.width * 0.13, 38, 66)
      : MathUtils.clamp(size.width * 0.095, 80, 128)

    let side = SIDE_BY_TARGET[displayedTarget.id]
      ?? (smoothed.x >= size.width * 0.5 ? 'left' : 'right')
    const roomOnLeft = smoothed.x - safeX
    const roomOnRight = size.width - safeX - smoothed.x
    if (side === 'left' && roomOnLeft < panelWidth + reach * 0.72) side = 'right'
    if (side === 'right' && roomOnRight < panelWidth + reach * 0.72) side = 'left'

    const verticalBias = compact
      ? Math.sign(VERTICAL_BIAS_BY_TARGET[displayedTarget.id] ?? -1) * 42
      : VERTICAL_BIAS_BY_TARGET[displayedTarget.id] ?? -36
    const unclampedPanelX = side === 'right'
      ? smoothed.x + reach
      : smoothed.x - reach - panelWidth
    const panelX = MathUtils.clamp(
      unclampedPanelX,
      safeX,
      Math.max(safeX, size.width - safeX - panelWidth),
    )
    const panelY = MathUtils.clamp(
      smoothed.y + verticalBias - panelHeight / 2,
      safeTop,
      Math.max(safeTop, size.height - safeBottom - panelHeight),
    )
    const connectionX = side === 'right' ? panelX : panelX + panelWidth
    const connectionY = panelY + panelHeight * 0.5
    const pathValue = `M ${smoothed.x.toFixed(2)} ${smoothed.y.toFixed(2)} L ${connectionX.toFixed(2)} ${connectionY.toFixed(2)}`

    if (rendered.path !== pathValue) {
      rendered.path = pathValue
      setPath(auraPathRef.current, pathValue)
      setPath(mainPathRef.current, pathValue)
      setPath(tracerPathRef.current, pathValue)
    }

    const anchorTransform = `translate3d(${smoothed.x.toFixed(2)}px, ${smoothed.y.toFixed(2)}px, 0) rotate(45deg)`
    if (rendered.anchorTransform !== anchorTransform) {
      rendered.anchorTransform = anchorTransform
      anchor.style.transform = anchorTransform
    }

    const panelXValue = `${panelX.toFixed(2)}px`
    const panelYValue = `${panelY.toFixed(2)}px`
    const panelWidthValue = `${panelWidth.toFixed(2)}px`
    const panelHeightValue = `${panelHeight.toFixed(2)}px`
    if (rendered.panelX !== panelXValue) {
      rendered.panelX = panelXValue
      panel.style.setProperty('--callout-panel-x', panelXValue)
    }
    if (rendered.panelY !== panelYValue) {
      rendered.panelY = panelYValue
      panel.style.setProperty('--callout-panel-y', panelYValue)
    }
    if (rendered.panelWidth !== panelWidthValue) {
      rendered.panelWidth = panelWidthValue
      panel.style.setProperty('--callout-panel-width', panelWidthValue)
    }
    if (rendered.panelHeight !== panelHeightValue) {
      rendered.panelHeight = panelHeightValue
      panel.style.setProperty('--callout-panel-height', panelHeightValue)
    }
    if (rendered.side !== side) {
      rendered.side = side
      root.dataset.side = side
    }
  })

  if (!displayedTarget) return null

  return (
    <Html
      fullscreen
      pointerEvents="none"
      zIndexRange={[3, 3]}
      calculatePosition={calculateCalloutPosition}
    >
      <div
        ref={rootRef}
        className={`object-callout${target ? ' object-callout--active' : ''}`}
        data-projected="false"
        data-side={SIDE_BY_TARGET[displayedTarget.id] ?? 'right'}
        aria-hidden={!target}
        style={{ '--callout-accent': displayedTarget.accent } as CSSProperties}
      >
        <svg
          className="object-callout__linework"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <g key={displayedTarget.id}>
            <path ref={auraPathRef} className="object-callout__path object-callout__path--aura" pathLength="1" />
            <path ref={mainPathRef} className="object-callout__path object-callout__path--main" pathLength="1" />
            <path ref={tracerPathRef} className="object-callout__path object-callout__path--tracer" pathLength="1" />
          </g>
        </svg>

        <span ref={anchorRef} className="object-callout__anchor" aria-hidden="true" />

        <div
          key={`panel:${displayedTarget.id}`}
          ref={panelRef}
          className="object-callout__panel"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="object-callout__sigil" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>
            <StudioTextLayer layerId={displayedTarget.textLayerId}>
              {displayedTarget.label}
            </StudioTextLayer>
          </strong>
          <span className="object-callout__thorn" aria-hidden="true" />
        </div>
      </div>
    </Html>
  )
}
