import { useProgress } from '@react-three/drei'

export function LoadingOverlay() {
  const { active, progress, loaded, total, item } = useProgress()

  if (!active) {
    return null
  }

  const filename = item.split('/').at(-1) || 'GLB 资产'

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__meta">
        <span>正在唤醒 {filename}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="loading__track">
        <span style={{ transform: `scaleX(${Math.max(progress, 2) / 100})` }} />
      </div>
      <span className="loading__count">
        {loaded} / {total}
      </span>
    </div>
  )
}
