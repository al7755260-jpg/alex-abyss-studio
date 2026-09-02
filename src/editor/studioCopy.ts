export const STUDIO_COPY_STORAGE_KEY = 'alex-abyss-studio:copy:v1'

export const STUDIO_COPY_FIELD_LIMITS = {
  brandTitle: 40,
  brandSubtitle: 64,
  objectiveLabel: 24,
  objectivePendingTitle: 48,
  objectivePendingDescription: 180,
  objectiveCompleteTitle: 48,
  objectiveCompleteDescription: 180,
  sanityLabel: 16,
  rotateHint: 48,
  zoomHint: 48,
  exploreHint: 64,
  resetCameraLabel: 24,
  backToStudioLabel: 24,
  undiscoveredRelicLabel: 24,
  terminalCalloutLabel: 32,
  dreamArchiveCalloutLabel: 32,
  videoBeyondScreenText: 96,
  computerIdeaText: 80,
  perfectTyrannyText: 96,
} as const

export const STUDIO_ASSET_LABEL_MAX_LENGTH = 48

export type StudioCopyField = keyof typeof STUDIO_COPY_FIELD_LIMITS

export type StudioCopy = Record<StudioCopyField, string> & {
  assetLabels: Record<string, string>
}

type StudioCopyAsset = {
  id: string
  label: string
}

type StudioCopyStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const DEFAULT_COPY_FIELDS: Record<StudioCopyField, string> = {
  brandTitle: 'AlexLi的奇怪脑洞',
  brandSubtitle: 'LUX3D 深渊资产陈列',
  objectiveLabel: '当前目标',
  objectivePendingTitle: '找回六件吞噬遗物',
  objectivePendingDescription: '点击家具附近发光的遗物线索；镜头推进后即可查看并归档',
  objectiveCompleteTitle: '读取最后的真相',
  objectiveCompleteDescription: '显示器已经高亮，点击真相终端以读取最后的真相',
  sanityLabel: '理智',
  rotateHint: '拖动 旋转',
  zoomHint: '滚轮 缩放',
  exploreHint: '点击发光线索 探索',
  resetCameraLabel: '镜头归中',
  backToStudioLabel: '返回书房',
  undiscoveredRelicLabel: '未归档',
  terminalCalloutLabel: '真相终端',
  dreamArchiveCalloutLabel: '灵感书架',
  videoBeyondScreenText: '视频中50%的内容是隐藏在屏幕之外的',
  computerIdeaText: '永远不要扔掉你喜欢的东西',
  perfectTyrannyText: '完美，就是一个返自然，用来折磨我们的暴政',
}

const LEGACY_REMOVED_INTERACTION_COPY_HASHES: Partial<Record<StudioCopyField, number>> = {
  objectivePendingDescription: 1390490163,
  objectiveCompleteDescription: 717631074,
  rotateHint: 3594992375,
  zoomHint: 1233371992,
  exploreHint: 3643982787,
}

const STUDIO_COPY_FIELDS = Object.keys(STUDIO_COPY_FIELD_LIMITS) as StudioCopyField[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function truncateText(value: string, maxLength: number): string {
  return value.slice(0, maxLength)
}

function copyTextHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cloneStudioCopy(copy: StudioCopy): StudioCopy {
  const fields = Object.fromEntries(
    STUDIO_COPY_FIELDS.map((field) => [field, copy[field]]),
  ) as Record<StudioCopyField, string>

  return {
    ...fields,
    assetLabels: { ...copy.assetLabels },
  }
}

function isSavableStudioCopy(copy: unknown): copy is StudioCopy {
  if (!isRecord(copy) || !isRecord(copy.assetLabels)) return false

  for (const field of STUDIO_COPY_FIELDS) {
    if (!isValidText(copy[field], STUDIO_COPY_FIELD_LIMITS[field])) return false
  }

  return Object.values(copy.assetLabels).every((label) => (
    isValidText(label, STUDIO_ASSET_LABEL_MAX_LENGTH)
  ))
}

export function createDefaultStudioCopy(
  assets: readonly StudioCopyAsset[],
): StudioCopy {
  const assetIds = new Set<string>()
  const assetLabelEntries: Array<[string, string]> = []

  for (const asset of assets) {
    if (typeof asset.id !== 'string' || asset.id.length === 0 || assetIds.has(asset.id)) {
      throw new TypeError(`Invalid or duplicate studio asset id: ${asset.id}`)
    }
    if (typeof asset.label !== 'string') {
      throw new TypeError(`Studio asset ${asset.id} must use a string label`)
    }

    assetIds.add(asset.id)
    assetLabelEntries.push([
      asset.id,
      truncateText(asset.label, STUDIO_ASSET_LABEL_MAX_LENGTH),
    ])
  }

  return {
    ...DEFAULT_COPY_FIELDS,
    assetLabels: Object.fromEntries(assetLabelEntries),
  }
}

export function loadStudioCopy(
  storage: Pick<StudioCopyStorage, 'getItem'> | null | undefined,
  defaults: StudioCopy,
): StudioCopy {
  if (!storage) return cloneStudioCopy(defaults)

  try {
    const serialized = storage.getItem(STUDIO_COPY_STORAGE_KEY)
    if (serialized === null) return cloneStudioCopy(defaults)

    const stored = JSON.parse(serialized) as unknown
    if (!isRecord(stored)) return cloneStudioCopy(defaults)

    const loadedFields = Object.fromEntries(
      STUDIO_COPY_FIELDS.map((field) => {
        const candidate = stored[field]
        const legacyHash = LEGACY_REMOVED_INTERACTION_COPY_HASHES[field]
        const migratedCandidate = typeof candidate === 'string'
          && legacyHash !== undefined
          && copyTextHash(candidate) === legacyHash
          ? defaults[field]
          : candidate
        return [
          field,
          isValidText(migratedCandidate, STUDIO_COPY_FIELD_LIMITS[field])
            ? migratedCandidate
            : defaults[field],
        ]
      }),
    ) as Record<StudioCopyField, string>
    const storedAssetLabels = isRecord(stored.assetLabels) ? stored.assetLabels : null
    const loadedAssetLabels = Object.fromEntries(
      Object.entries(defaults.assetLabels).map(([assetId, defaultLabel]) => {
        const candidate = storedAssetLabels?.[assetId]
        return [
          assetId,
          isValidText(candidate, STUDIO_ASSET_LABEL_MAX_LENGTH)
            ? candidate
            : defaultLabel,
        ]
      }),
    )

    return {
      ...loadedFields,
      assetLabels: loadedAssetLabels,
    }
  } catch {
    return cloneStudioCopy(defaults)
  }
}

export function saveStudioCopy(
  storage: Pick<StudioCopyStorage, 'setItem'> | null | undefined,
  copy: StudioCopy,
): boolean {
  if (!storage || !isSavableStudioCopy(copy)) return false

  try {
    storage.setItem(STUDIO_COPY_STORAGE_KEY, JSON.stringify(cloneStudioCopy(copy)))
    return true
  } catch {
    return false
  }
}

export function studioCopiesEqual(left: StudioCopy, right: StudioCopy): boolean {
  if (STUDIO_COPY_FIELDS.some((field) => left[field] !== right[field])) return false

  const leftAssetIds = Object.keys(left.assetLabels)
  const rightAssetIds = Object.keys(right.assetLabels)
  if (leftAssetIds.length !== rightAssetIds.length) return false

  return leftAssetIds.every((assetId) => (
    Object.hasOwn(right.assetLabels, assetId)
    && left.assetLabels[assetId] === right.assetLabels[assetId]
  ))
}

export function updateStudioCopyField(
  copy: StudioCopy,
  field: StudioCopyField,
  value: string,
): StudioCopy {
  const limit = STUDIO_COPY_FIELD_LIMITS[field]
  if (limit === undefined || typeof value !== 'string') return copy

  const nextValue = truncateText(value, limit)
  if (copy[field] === nextValue) return copy

  return {
    ...copy,
    [field]: nextValue,
  }
}

export function updateStudioAssetLabel(
  copy: StudioCopy,
  assetId: string,
  value: string,
): StudioCopy {
  if (!Object.hasOwn(copy.assetLabels, assetId) || typeof value !== 'string') return copy

  const nextValue = truncateText(value, STUDIO_ASSET_LABEL_MAX_LENGTH)
  if (copy.assetLabels[assetId] === nextValue) return copy

  return {
    ...copy,
    assetLabels: {
      ...copy.assetLabels,
      [assetId]: nextValue,
    },
  }
}
