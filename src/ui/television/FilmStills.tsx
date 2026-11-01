import { useState } from 'react'
import type { PlacementPhoto } from '../../data/commercialWorks'
import { PlacementLightbox } from './CommercialPlacements'
import './FilmStills.css'

export default function FilmStills({ photos, onOpen }: { photos: readonly PlacementPhoto[]; onOpen: () => void }) {
  const [active, setActive] = useState<number | null>(null)
  return <section className="film-stills" aria-labelledby="film-stills-title">
    <header className="film-stills__heading">
      <div><p>ANATOMY OF MOTION / 05 FRAMES</p><h3 id="film-stills-title">拆解敏捷的想象</h3></div>
      <span>从机械组装，到完整形态。<br />点击画面，查看作品细节 ↗</span>
    </header>
    <div className="film-stills__grid">
      {photos.map((photo, index) => <button key={photo.src} type="button" className="film-stills__frame"
        aria-label={`放大作品画面 ${index + 1}：${photo.caption}`} aria-haspopup="dialog"
        onClick={() => { onOpen(); setActive(index) }}>
        <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
        <span><i>{String(index + 1).padStart(2, '0')}</i>{photo.caption}<b aria-hidden="true">↗</b></span>
      </button>)}
    </div>
    {active !== null && <PlacementLightbox photos={photos} initialIndex={active} title="多维敏捷 · 作品画面" kicker="FILA / VISUAL STUDIES" note="CG 视觉设计" onClose={() => setActive(null)} />}
  </section>
}
