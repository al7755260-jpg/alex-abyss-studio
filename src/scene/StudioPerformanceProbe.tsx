import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

const WARMUP_MS = 2_000
const SAMPLE_MS = 8_000

type SampleRun = {
  warmupEndsAt: number
  startedAt: number | null
  previousAt: number
  intervals: number[]
  calls: number[]
  triangles: number[]
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function ActivePerformanceProbe() {
  const gl = useThree((state) => state.gl)
  const run = useRef<SampleRun | null>(null)
  const output = useRef<HTMLOutputElement | null>(null)
  const rendererInfo = useRef<{ unmasked: string | null; renderer: string }>({
    unmasked: null,
    renderer: 'unavailable',
  })

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset
    gl.info.autoReset = false
    gl.info.reset()
    try {
      const context = gl.getContext()
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
      rendererInfo.current = {
        unmasked: debugInfo ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        renderer: String(context.getParameter(context.RENDERER)),
      }
    } catch {
      rendererInfo.current = { unmasked: null, renderer: 'unavailable' }
    }

    const panel = document.createElement('section')
    panel.id = 'studio-performance-probe'
    panel.setAttribute('aria-label', '开发环境帧率采样')
    panel.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:1000;width:280px;max-width:calc(100vw - 28px);max-height:48vh;overflow:auto;box-sizing:border-box;padding:12px;border:1px solid #6cd9d277;border-radius:8px;background:#071315ed;color:#d9fffa;font:11px/1.5 monospace;pointer-events:auto;'
    const restart = document.createElement('button')
    restart.type = 'button'
    restart.textContent = '重新采样（预热 2 秒 + 采样 8 秒）'
    restart.style.cssText = 'display:block;width:100%;padding:7px;margin:0 0 8px;border:1px solid #6cd9d277;border-radius:4px;background:#153c40;color:#d9fffa;font:inherit;cursor:pointer;'
    const result = document.createElement('output')
    result.id = 'studio-performance-result'
    result.style.cssText = 'display:block;white-space:pre-wrap;overflow-wrap:anywhere;'
    result.setAttribute('aria-live', 'polite')
    output.current = result
    panel.append(restart, result)
    document.body.append(panel)

    const start = () => {
      const now = performance.now()
      run.current = {
        warmupEndsAt: now + WARMUP_MS,
        startedAt: null,
        previousAt: now,
        intervals: [],
        calls: [],
        triangles: [],
      }
      result.dataset.state = 'warmup'
      result.textContent = '正在预热 2 秒…请保持页面在前台。'
    }
    const visibilityChanged = () => {
      if (document.hidden) {
        run.current = null
        result.dataset.state = 'paused'
        result.textContent = '已暂停：回到页面后自动重新采样。'
      } else start()
    }
    restart.addEventListener('click', start)
    document.addEventListener('visibilitychange', visibilityChanged)
    visibilityChanged()
    return () => {
      run.current = null
      output.current = null
      restart.removeEventListener('click', start)
      document.removeEventListener('visibilitychange', visibilityChanged)
      panel.remove()
      gl.info.reset()
      gl.info.autoReset = previousAutoReset
    }
  }, [gl])

  useFrame(({ gl, size }) => {
    // Priority 0 runs before the composer's priority 1 render. Snapshot the
    // previous frame's complete pass total, then start a new frame counter.
    // Reset during warmup/idle too, so restarting never samples accumulation.
    const totalCalls = gl.info.render.calls
    const totalTriangles = gl.info.render.triangles
    gl.info.reset()
    const sample = run.current
    const result = output.current
    if (!sample || !result || document.hidden) return
    const now = performance.now()
    if (now < sample.warmupEndsAt) return
    if (sample.startedAt === null) {
      sample.startedAt = now
      sample.previousAt = now
      result.dataset.state = 'sampling'
      result.textContent = '正在采样 8 秒…可进行拖动或交互。'
      return
    }
    sample.intervals.push(now - sample.previousAt)
    sample.previousAt = now
    sample.calls.push(totalCalls)
    sample.triangles.push(totalTriangles)
    const elapsed = now - sample.startedAt
    if (elapsed < SAMPLE_MS) return

    const sorted = [...sample.intervals].sort((a, b) => a - b)
    const frames = sorted.length
    const slowFrames = sorted.filter((ms) => ms > 33).length
    const round = (value: number) => Number(value.toFixed(2))
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const report = {
      fps: round(frames * 1_000 / elapsed),
      frameIntervalMs: { p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)) },
      framesOver33ms: slowFrames,
      framesOver33msPercent: round(slowFrames * 100 / frames),
      sampledFrames: frames,
      sampledSeconds: round(elapsed / 1_000),
      viewport: { width: size.width, height: size.height, dpr: gl.getPixelRatio() },
      webglRenderer: rendererInfo.current,
      totalFrame: {
        calls: { mean: round(mean(sample.calls)), max: Math.max(...sample.calls) },
        triangles: { mean: Math.round(mean(sample.triangles)), max: Math.max(...sample.triangles) },
      },
    }
    result.dataset.state = 'complete'
    result.textContent = `采样完成\ntotalFrame 包含整帧场景、阴影及后期通道。\n${JSON.stringify(report, null, 2)}`
    run.current = null
  }, 0)

  return null
}

/** Mount inside Canvas; production and ordinary preview visits do no sampling. */
export function StudioPerformanceProbe() {
  if (!import.meta.env.DEV || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('profile') !== '1') return null
  return <ActivePerformanceProbe />
}
