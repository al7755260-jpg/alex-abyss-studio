import type { CSSProperties } from 'react'
import { StudioTextLayer } from '../editor/StudioTextLayer'
import { HeartEyeIcon } from './GameIcons'

type MeterStyle = CSSProperties & { '--sanity': string }

export function SanityMeter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="sanity-meter"
      role="meter"
      aria-label={label || '理智值'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      style={{ '--sanity': `${value * 3.6}deg` } as MeterStyle}
    >
      <div className="sanity-meter__inner">
        <span><StudioTextLayer layerId="sanityLabel">{label}</StudioTextLayer></span>
        <strong>{value}</strong>
        <HeartEyeIcon className="sanity-meter__icon" />
      </div>
    </div>
  )
}
