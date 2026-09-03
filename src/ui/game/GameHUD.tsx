import { lazy, Suspense, type ReactNode } from 'react'
import {
  HIDDEN_RELIC_BY_ID,
  type HiddenRelicId,
} from '../../data/hiddenRelics'
import type { StudioCopy } from '../../editor/studioCopy'
import type { RelicMystery } from '../../game/useRelicMystery'
import { StudioTextLayer } from '../editor/StudioTextLayer'
import { CurrentObjective } from './CurrentObjective'
import {
  AbyssMark,
  ResetIcon,
} from './GameIcons'
import { RelicArchiveBar } from './RelicArchiveBar'
import { SanityMeter } from './SanityMeter'

const ArtifactDetailHUD = lazy(() => import('./ArtifactDetailHUD').then(
  (module) => ({ default: module.ArtifactDetailHUD }),
))
const FinaleSequence = lazy(() => import('./FinaleSequence').then(
  (module) => ({ default: module.FinaleSequence }),
))

type GameHUDProps = {
  mystery: RelicMystery
  copy: StudioCopy
  editorControl: ReactNode
  editingLayout: boolean
  onResetCamera: () => void
  onOpenRelic: (relicId: HiddenRelicId) => void
}

export function GameHUD({
  mystery,
  copy,
  editorControl,
  editingLayout,
  onResetCamera,
  onOpenRelic,
}: GameHUDProps) {
  const { state, actions } = mystery
  const activeRelic = state.view.kind === 'relic'
    ? HIDDEN_RELIC_BY_ID.get(state.view.relicId) ?? null
    : null
  const viewClass = `game-ui--${state.view.kind}${editingLayout ? ' game-ui--editing' : ''}`
  const resetLabel = state.view.kind === 'relic'
    ? copy.backToStudioLabel
    : copy.resetCameraLabel

  return (
    <div
      className={`game-ui ${viewClass}`}
    >
      <header className="topbar game-topbar">
        <div className="brand">
          <AbyssMark className="brand__mark" />
          <div>
            <h1><StudioTextLayer layerId="brandTitle">{copy.brandTitle}</StudioTextLayer></h1>
            <p><StudioTextLayer layerId="brandSubtitle">{copy.brandSubtitle}</StudioTextLayer></p>
            {state.view.kind === 'relic' ? (
              <span className="brand__chapter">
                {`档案 ${String(activeRelic?.order ?? 0).padStart(2, '0')} · ${activeRelic?.name ?? '未知遗物'}`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="game-topbar__actions">
          {state.view.kind === 'studio' ? editorControl : null}
          <button
            className="reset-button"
            type="button"
            onClick={state.view.kind === 'relic' ? actions.returnToStudio : onResetCamera}
            aria-label={resetLabel || (state.view.kind === 'relic' ? '返回书房' : '镜头归中')}
            title={state.view.kind === 'studio' ? '只调整镜头，不会移动或缩放任何物体' : undefined}
          >
            <ResetIcon />
            <StudioTextLayer layerId={state.view.kind === 'relic' ? 'backToStudioLabel' : 'resetCameraLabel'}>
              {resetLabel}
            </StudioTextLayer>
          </button>
        </div>
      </header>

      {state.view.kind === 'studio' ? <CurrentObjective state={state} copy={copy} /> : null}

      {state.view.kind !== 'finale' ? (
        <SanityMeter
          value={Math.max(18, 74 - state.foundRelicIds.length * 8)}
          label={copy.sanityLabel}
        />
      ) : null}

      {state.view.kind !== 'finale' ? (
        <RelicArchiveBar
          foundRelicIds={state.foundRelicIds}
          selectedRelicId={state.view.kind === 'relic' ? state.view.relicId : null}
          undiscoveredLabel={copy.undiscoveredRelicLabel}
          onSelect={onOpenRelic}
        />
      ) : null}

      {state.view.kind !== 'finale' ? (
        <div className="game-controls" aria-label="三维查看操作说明">
          <span><StudioTextLayer layerId="rotateHint">{copy.rotateHint}</StudioTextLayer></span>
          <i />
          <span><StudioTextLayer layerId="zoomHint">{copy.zoomHint}</StudioTextLayer></span>
          <i />
          <span><StudioTextLayer layerId="exploreHint">{copy.exploreHint}</StudioTextLayer></span>
        </div>
      ) : null}

      {activeRelic ? (
        <Suspense fallback={null}>
        <ArtifactDetailHUD
          key={activeRelic.id}
          relic={activeRelic}
          onReturn={actions.returnToStudio}
        />
        </Suspense>
      ) : null}

      {state.view.kind === 'finale' ? (
        <Suspense fallback={null}>
        <FinaleSequence
          alreadyCompleted={state.endingCompleted}
          onComplete={actions.completeFinale}
          onReturn={actions.returnToStudio}
          onRestart={actions.resetGame}
        />
        </Suspense>
      ) : null}

      <p className="game-ui__announcer" aria-live="polite">
        {state.foundRelicIds.length === 6 && state.view.kind === 'studio'
          ? '六件吞噬遗物已归档。显示器中的终局档案已经解锁。'
          : activeRelic
            ? `${activeRelic.name}已收录。可点击上方按钮返回书房。`
            : ''}
      </p>
    </div>
  )
}
