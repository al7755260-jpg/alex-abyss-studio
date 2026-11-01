import { useEffect, useRef } from 'react'
import './AbyssVideoBackground.css'

const VIDEO_URL = `${import.meta.env.BASE_URL}videos/abyss-home-loop.mp4`
const MOBILE_VIDEO_URL = `${import.meta.env.BASE_URL}videos/abyss-home-loop-mobile.mp4`
const HEAD_READY = 'studio:head-committed'

export function AbyssVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let failed = false
    let headReady = performance.getEntriesByName(HEAD_READY, 'mark').length > 0

    const mayPlay = () => headReady && !disposed && !failed && !document.hidden
      && !reducedMotion.matches

    const syncPlayback = () => {
      if (!mayPlay()) {
        video.pause()
        return
      }
      // Avoid even loading video metadata for reduced-motion visits.
      if (!video.getAttribute('src')) {
        video.src = window.matchMedia('(max-width: 720px)').matches ? MOBILE_VIDEO_URL : VIDEO_URL
      }
      video.muted = true
      void video.play().catch(() => {
        // Autoplay may be unavailable; the existing static background remains.
        if (!disposed && video.paused) {
          delete video.dataset.playing
        }
      })
    }
    const onPlaying = () => {
      if (!mayPlay()) {
        video.pause()
        return
      }
      video.dataset.playing = 'true'
    }
    const onError = () => {
      failed = true
      video.pause()
      delete video.dataset.playing
    }
    const onMotionChange = () => {
      if (reducedMotion.matches) {
        video.pause()
        delete video.dataset.playing
        video.removeAttribute('src')
        video.load()
      } else syncPlayback()
    }
    const onVisibilityChange = () => syncPlayback()

    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onError)
    document.addEventListener('visibilitychange', onVisibilityChange)
    reducedMotion.addEventListener('change', onMotionChange)
    // Give the hero model the connection first. Even if WebGL fails to start,
    // a visible page may still show the film after the initial loading window.
    const allowVideo = () => {
      headReady = true
      observer?.disconnect()
      window.clearTimeout(fallback)
      syncPlayback()
    }
    const observer = !headReady && typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes.includes('mark')
      ? new PerformanceObserver((records) => {
        if (records.getEntriesByName(HEAD_READY).length > 0) allowVideo()
      })
      : null
    const fallback = headReady ? undefined : window.setTimeout(allowVideo, 15_000)
    observer?.observe({ type: 'mark', buffered: true })
    syncPlayback()

    return () => {
      disposed = true
      observer?.disconnect()
      window.clearTimeout(fallback)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      reducedMotion.removeEventListener('change', onMotionChange)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  return (
    <div className="abyss-video-background" aria-hidden="true">
      <video
        ref={videoRef}
        className="abyss-video-background__video"
        muted
        autoPlay
        loop
        playsInline
        preload="none"
        tabIndex={-1}
        disablePictureInPicture
      />
    </div>
  )
}
