import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CommercialPlacement, PlacementPhoto } from '../../data/commercialWorks'
import './CommercialPlacements.css'

const number = (value: number) => String(value).padStart(2, '0')

export function PlacementLightbox({ photos, initialIndex, onClose, title = '投放现场', kicker = 'ON LOCATION', note = '现场实拍' }: {
  photos: readonly PlacementPhoto[]
  initialIndex: number
  onClose: () => void
  title?: string
  kicker?: string
  note?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(initialIndex)
  const photo = photos[index]
  const move = (direction: number) => setIndex(current => (current + direction + photos.length) % photos.length)

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      dialog?.close()
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    // Keep gallery navigation inside the native modal, including Escape and Tab.
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    if (event.key === 'Tab') {
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }

  return (
    <dialog ref={dialogRef} className="placement-lightbox" aria-labelledby="placement-lightbox-title"
      onKeyDown={handleKeyDown} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="placement-lightbox__inner">
        <header className="placement-lightbox__header">
          <div><p>{kicker}</p><h3 id="placement-lightbox-title">{title}</h3></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭照片">关闭 <span aria-hidden="true">×</span></button>
        </header>
        <figure className="placement-lightbox__figure">
          <img key={photo.src} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} />
          <figcaption aria-live="polite"><span>{number(index + 1)} / {number(photos.length)}</span>{photo.caption}</figcaption>
        </figure>
        <nav className="placement-lightbox__nav" aria-label="切换作品图片">
          <button type="button" onClick={() => move(-1)} aria-label="上一张照片"><span aria-hidden="true">←</span> 上一张</button>
          <span>{note}</span>
          <button type="button" onClick={() => move(1)} aria-label="下一张照片">下一张 <span aria-hidden="true">→</span></button>
        </nav>
      </div>
    </dialog>
  )
}

export default function CommercialPlacements({ placement, onOpen }: {
  placement: CommercialPlacement
  onOpen: () => void
}) {
  const [activePhoto, setActivePhoto] = useState<number | null>(null)
  const { photos } = placement
  if (!photos.length) return null

  const renderPhoto = (photo: PlacementPhoto, index: number) => (
    <button className="commercial-placements__photo" type="button" key={photo.src}
      aria-label={`放大投放现场照片 ${number(index + 1)}：${photo.caption}`} aria-haspopup="dialog"
      onClick={() => { onOpen(); setActivePhoto(index) }}>
      <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
      <span className="commercial-placements__caption"><span><i>{number(index + 1)}</i>{photo.caption}</span><span aria-hidden="true">↗</span></span>
    </button>
  )

  return (
    <section className="commercial-placements" aria-labelledby="commercial-placements-title">
      <header className="commercial-placements__heading">
        <h3 id="commercial-placements-title">投放现场 <span>/ {number(photos.length)}</span></h3>
        <span>BEYOND THE SCREEN</span>
      </header>
      <div className="commercial-placements__lead">
        <div className="commercial-placements__intro">
          <p className="commercial-placements__location">{placement.location}</p>
          <h4>从作品，<br />到现场。</h4>
          <p className="commercial-placements__description">{placement.description}</p>
          <div className="commercial-placements__venues"><span>高铁站</span><i aria-hidden="true" /><span>机场</span></div>
          <p className="commercial-placements__hint">{number(photos.length)} 张现场影像 · 点击照片放大查看 <span aria-hidden="true">↗</span></p>
        </div>
        {renderPhoto(photos[0], 0)}
      </div>
      <div className="commercial-placements__grid">
        {photos.slice(1).map((photo, index) => renderPhoto(photo, index + 1))}
      </div>
      {activePhoto !== null && <PlacementLightbox photos={photos} initialIndex={activePhoto} onClose={() => setActivePhoto(null)} />}
    </section>
  )
}
