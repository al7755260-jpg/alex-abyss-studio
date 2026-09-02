import type { InventoryItem } from '../../game/gameState'
import {
  AbyssKeyIcon,
  EmptySigilIcon,
  KeyIcon,
  LensIcon,
} from './GameIcons'

const ITEM_ICONS = {
  key: KeyIcon,
  lens: LensIcon,
  abyssKey: AbyssKeyIcon,
} as const

type InventoryBarProps = {
  items: Array<InventoryItem | null>
  selectedItemId: string | null
  onSelect: (itemId: string) => void
}

export function InventoryBar({
  items,
  selectedItemId,
  onSelect,
}: InventoryBarProps) {
  return (
    <section className="inventory-bar" aria-label="藏品栏">
      <span className="inventory-bar__ornament" aria-hidden="true" />
      <div className="inventory-bar__slots">
        {items.map((item, index) => {
          const selected = item?.id === selectedItemId
          const Icon = item ? ITEM_ICONS[item.icon] : EmptySigilIcon
          return (
            <button
              className={`inventory-slot ${selected ? 'inventory-slot--selected' : ''} ${item ? '' : 'inventory-slot--empty'}`}
              type="button"
              key={item?.id ?? `empty-${index}`}
              aria-label={item ? `${item.title}：${item.description}` : `空物品格 ${index + 1}`}
              aria-pressed={selected}
              disabled={!item}
              onClick={() => item && onSelect(item.id)}
            >
              <Icon className="inventory-slot__icon" />
              <span>{item?.title ?? '空'}</span>
              {selected ? <i className="inventory-slot__seal" aria-hidden="true">印</i> : null}
            </button>
          )
        })}
      </div>
      <span className="inventory-bar__ornament inventory-bar__ornament--right" aria-hidden="true" />
    </section>
  )
}
