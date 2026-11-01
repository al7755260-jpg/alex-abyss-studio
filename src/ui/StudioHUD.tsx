import type { ReactNode } from 'react'
import type { StudioCopy } from '../editor/studioCopy'
import { StudioTextLayer } from './editor/StudioTextLayer'
import { AbyssMark, ResetIcon } from './game/GameIcons'
import './AbyssHome.css'

type StudioHUDProps = {
  copy: StudioCopy
  editorControl: ReactNode
  editingLayout: boolean
  onResetCamera: () => void
}

/** The portfolio keeps the scene tools without game objectives or progress. */
export function StudioHUD({ copy, editorControl, editingLayout, onResetCamera }: StudioHUDProps) {
  const titleParts = copy.brandTitle.match(/^(.*?的)(.+)$/u)
  const mottoParts = copy.computerIdeaText.match(/^(.*?)(你喜欢的东西)$/u)
  return (
    <div className={`game-ui game-ui--studio abyss-home${editingLayout ? ' game-ui--editing' : ''}`}>
      <header className="topbar game-topbar">
        <div className="brand abyss-home__brand">
          <AbyssMark className="brand__mark" />
          <div>
            <h1>
              <StudioTextLayer layerId="brandTitle">
                {titleParts ? <span className="abyss-home__byline">{titleParts[1]}</span> : null}
                <span className="abyss-home__title">{titleParts?.[2] ?? copy.brandTitle}</span>
              </StudioTextLayer>
            </h1>
            <div className="abyss-home__title-rule" aria-hidden="true"><i /></div>
            <p className="abyss-home__subtitle"><StudioTextLayer layerId="brandSubtitle">{copy.brandSubtitle}</StudioTextLayer></p>
          </div>
        </div>
        <div className="game-topbar__actions">
          {editorControl}
          <button
            className="reset-button"
            type="button"
            onClick={onResetCamera}
            aria-label={copy.resetCameraLabel || '镜头归中'}
            title="只调整镜头，不会移动或缩放任何物体"
          >
            <ResetIcon />
            <StudioTextLayer layerId="resetCameraLabel">{copy.resetCameraLabel}</StudioTextLayer>
          </button>
        </div>
      </header>
      <aside className="abyss-home__motto" aria-label={copy.computerIdeaText}>
        <div className="abyss-home__motto-rule" aria-hidden="true"><i /></div>
        {mottoParts ? (
          <p><span>{mottoParts[1]}</span><strong>{mottoParts[2]}</strong></p>
        ) : <p>{copy.computerIdeaText}</p>}
      </aside>
      <div className="game-controls abyss-home__controls" aria-label="三维查看操作说明">
        <span className="abyss-home__control">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" /><path d="M12 5v6m-4 1 4 3 4-3" /></svg>
          <StudioTextLayer layerId="rotateHint">{copy.rotateHint}</StudioTextLayer>
        </span>
        <i aria-hidden="true" />
        <span className="abyss-home__control">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M12 7v4" /></svg>
          <StudioTextLayer layerId="zoomHint">{copy.zoomHint}</StudioTextLayer>
        </span>
      </div>
    </div>
  )
}
