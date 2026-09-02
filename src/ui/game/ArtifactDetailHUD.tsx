import type { HiddenRelic } from '../../data/hiddenRelics'

export function ArtifactDetailHUD({
  relic,
  onReturn,
}: {
  relic: HiddenRelic
  onReturn: () => void
}) {
  return (
    <aside className="artifact-detail occult-frame" aria-labelledby="artifact-detail-title">
      <div className="artifact-detail__index">
        <span>吞噬采样器</span>
        <strong>{String(relic.order).padStart(2, '0')} / 06</strong>
      </div>
      <div className="artifact-detail__glyph" aria-hidden="true">{relic.glyph}</div>
      <p className="artifact-detail__location">{relic.location}</p>
      <h2 id="artifact-detail-title">{relic.name}</h2>
      <p className="artifact-detail__story">{relic.story}</p>
      <p className="artifact-detail__clue">{relic.clue}</p>
      <div className="artifact-detail__controls">
        <span>拖动旋转</span>
        <span>滚轮缩放</span>
        <span>点击上方按钮返回书房</span>
      </div>
      <button type="button" onClick={onReturn}>返回书房</button>
    </aside>
  )
}
