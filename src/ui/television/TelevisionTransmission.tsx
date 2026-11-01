import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { COMMERCIAL_WORKS, type CommercialWork } from '../../data/commercialWorks'
import CommercialPlacements from './CommercialPlacements'
import FilmStills from './FilmStills'
import './TelevisionTransmission.css'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], video[controls], [tabindex]:not([tabindex="-1"])'
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

function FilmPlayer({ work }: { work: CommercialWork }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [playMessage, setPlayMessage] = useState('')

  useEffect(() => {
    const video = videoRef.current
    return () => { video?.pause() }
  }, [])

  const play = async () => {
    const video = videoRef.current
    if (!video) return
    setPlayMessage('')
    video.focus({ preventScroll: true })
    try {
      await video.play()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPlayMessage('点击播放器的播放按钮继续，或单独打开影片观看。')
    }
  }

  return (
    <div className={`television-transmission__set${playing ? ' is-playing' : ''}`}>
      <div className="television-transmission__readout">
        <span><i aria-hidden="true" /> NO. {String(COMMERCIAL_WORKS.findIndex(item => item.id === work.id) + 1).padStart(2, '0')} / {playing ? 'NOW PLAYING' : 'SCREENING ROOM'}</span>
        <span>{work.portrait ? '9:16' : '16:9'} <b aria-hidden="true">/</b> HD</span>
      </div>
      <div className="television-transmission__screen">
        <video
          ref={videoRef}
          id="television-transmission-player"
          src={work.videoUrl}
          poster={work.posterUrl}
          aria-label={`${work.title} 商业作品播放器`}
          controls
          playsInline
          preload="metadata"
          onPlay={() => { setStarted(true); setPlaying(true); setPlayMessage('') }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setStarted(false) }}
          onError={() => { setFailed(true); setPlaying(false) }}
        >
          你的浏览器暂不支持视频播放，请单独打开影片观看。
        </video>
        {!started && !failed && (
          <button className="television-transmission__play" onClick={() => void play()} aria-label={`播放 ${work.title}`} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
        )}
        {failed && (
          <div className="television-transmission__error" role="alert">
            <p>影片暂时未能载入</p>
            <div>
              <button type="button" onClick={() => { videoRef.current?.focus({ preventScroll: true }); setFailed(false); setStarted(false); videoRef.current?.load() }}>重新载入</button>
              <a href={work.videoUrl} target="_blank" rel="noopener noreferrer">单独打开影片 ↗</a>
            </div>
          </div>
        )}
      </div>
      <p className="television-transmission__play-message" role="status">{playMessage}</p>
    </div>
  )
}

export type TelevisionTransmissionProps = { onClose: () => void }

export default function TelevisionTransmission({ onClose }: TelevisionTransmissionProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [activeWorkId, setActiveWorkId] = useState(COMMERCIAL_WORKS[0].id)
  const activeWork = COMMERCIAL_WORKS.find(work => work.id === activeWorkId) ?? COMMERCIAL_WORKS[0]

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(focusFrame)
      previouslyFocused?.focus()
    }
  }, [])

  const handleDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      // Native fullscreen consumes its first Escape; a subsequent Escape closes the room.
      if (document.fullscreenElement) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter(element => !element.hidden && element.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (!first) { event.preventDefault(); dialog.focus(); return }
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [onClose])

  return (
    <section ref={dialogRef} className={`television-transmission${activeWork.id === 'fila-agility' ? ' television-transmission--agility' : ''}`} role="dialog" aria-modal="true"
      aria-labelledby="television-transmission-title" aria-describedby="television-transmission-description"
      tabIndex={-1} onKeyDown={handleDialogKeyDown}>
      <div className="television-transmission__atmosphere" aria-hidden="true" />
      <div className="television-transmission__shell">
        <header className="television-transmission__header">
          <div>
            <p className="television-transmission__eyebrow">SELECTED COMMISSIONS</p>
            <h1 id="television-transmission-title">HELL放映厅</h1>
            <p id="television-transmission-description">把想象，放进真实的品牌故事。</p>
          </div>
          <button ref={closeButtonRef} className="television-transmission__close" type="button" onClick={onClose}>
            返回工作室 <span aria-hidden="true">×</span>
          </button>
        </header>

        <nav className="television-transmission__switcher" aria-label="切换放映作品">
          {COMMERCIAL_WORKS.map((work, index) => <button key={work.id} type="button" aria-pressed={work.id === activeWork.id}
            onClick={() => setActiveWorkId(work.id)}><span>{String(index + 1).padStart(2, '0')}</span>{work.title}{work.client && <i>{work.client}</i>}</button>)}
        </nav>

        <section className={`television-transmission__feature${activeWork.portrait ? ' television-transmission__feature--portrait' : ''}`} aria-label="当前放映作品">
          <FilmPlayer key={activeWork.id} work={activeWork} />
          <div className="television-transmission__project">
            <div className="television-transmission__project-title">
              <h2>{activeWork.title}</h2>
              <p>{activeWork.englishTitle}</p>
            </div>
            {activeWork.description && <p className="television-transmission__synopsis">{activeWork.description}</p>}
            <dl className="television-transmission__metadata">
              {activeWork.client && <div><dt>客户</dt><dd>{activeWork.client}</dd></div>}
              {activeWork.year && <div><dt>年份</dt><dd>{activeWork.year}</dd></div>}
              <div><dt>时长</dt><dd>{formatDuration(activeWork.duration)}</dd></div>
            </dl>
            <a className="television-transmission__source" href={activeWork.videoUrl} target="_blank" rel="noopener noreferrer">单独打开影片 <span aria-hidden="true">↗</span></a>
            {activeWork.stills && <figure className="television-transmission__study">
              <img src={activeWork.stills[4].src} alt={activeWork.stills[4].alt} width={activeWork.stills[4].width} height={activeWork.stills[4].height} />
              <figcaption>FILA / PRODUCT IN MOTION</figcaption>
            </figure>}
          </div>
        </section>

        {activeWork.placement && <CommercialPlacements key={activeWork.id} placement={activeWork.placement}
          onOpen={() => dialogRef.current?.querySelector('video')?.pause()} />}
        {activeWork.stills && <FilmStills key={activeWork.id} photos={activeWork.stills}
          onOpen={() => dialogRef.current?.querySelector('video')?.pause()} />}

        <section className="television-transmission__catalog" aria-labelledby="television-catalog-title">
          <div className="television-transmission__catalog-heading">
            <h3 id="television-catalog-title">作品目录 <span>/ {String(COMMERCIAL_WORKS.length).padStart(2, '0')}</span></h3>
            <span>THE COLLECTION</span>
          </div>
          <div className="television-transmission__works" role="group" aria-label="选择商业作品">
            {COMMERCIAL_WORKS.map((work, index) => (
              <button key={work.id} type="button" aria-pressed={work.id === activeWork.id}
                aria-controls="television-transmission-player" onClick={() => { setActiveWorkId(work.id); dialogRef.current?.scrollTo({ top: 0 }); window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLVideoElement>('video')?.focus({ preventScroll: true })) }}>
                <img src={work.posterUrl} alt="" width="160" height="90" loading="lazy" decoding="async" />
                <span className="television-transmission__work-copy">
                  <span>{String(index + 1).padStart(2, '0')} / {work.englishTitle}</span>
                  <strong>{work.title}</strong>
                  <em>{work.id === activeWork.id ? '当前放映' : '选择作品'} <span aria-hidden="true">↗</span></em>
                </span>
              </button>
            ))}
          </div>
        </section>
        <footer className="television-transmission__footer"><span>ALEX LI · SELECTED WORKS</span><span>IDEAS INTO MOTION</span></footer>
      </div>
    </section>
  )
}
