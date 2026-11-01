import type { ReactNode } from 'react'
import {
  STUDIO_ASSET_LABEL_MAX_LENGTH,
  STUDIO_COPY_FIELD_LIMITS,
  type StudioCopy,
  type StudioCopyField,
} from '../../editor/studioCopy'
import type { StudioEditorTool } from '../../editor/studioLayout'
import {
  STUDIO_LIGHTING_LIMITS,
  type StudioLightingField,
  type StudioLightingSettings,
} from '../../editor/studioLighting'
import { EditLayoutIcon } from './StudioEditorLauncher'

export type StudioEditorSection = 'layout' | 'copy' | 'lighting'

export type StudioSceneInscriptionOption = {
  id: string
  label: string
  copyField: StudioCopyField
  rows?: number
}

type StudioEditorControlProps = {
  enabled: boolean
  savingToLocalFile?: boolean
  localFileSaveError?: string
  section: StudioEditorSection
  copy: StudioCopy
  copyDirty: boolean
  copySaveState: 'idle' | 'saved' | 'error'
  copyIsDefault: boolean
  textLayoutDirty: boolean
  textLayoutSaveState: 'idle' | 'saved' | 'error'
  textLayoutIsDefault: boolean
  selectedTextLayerId: string | null
  selectedTextLabel: string | null
  selectedSceneInscriptionId: string | null
  sceneInscriptionOptions: readonly StudioSceneInscriptionOption[]
  textTool: StudioEditorTool
  textCanUndo: boolean
  lighting: StudioLightingSettings
  lightingDirty: boolean
  lightingSaveState: 'idle' | 'saved' | 'error'
  lightingIsDefault: boolean
  layoutAssetOptions: readonly { id: string; label: string }[]
  selectedAssetId: string | null
  selectedLabel: string | null
  assetOptions: readonly { id: string; label: string }[]
  tool: StudioEditorTool
  dirty: boolean
  canUndo: boolean
  saveState: 'idle' | 'saved' | 'error'
  onToggle: () => void
  onSectionChange: (section: StudioEditorSection) => void
  onCopyFieldChange: (field: StudioCopyField, value: string) => void
  onAssetLabelChange: (assetId: string, value: string) => void
  onSelectAsset: (assetId: string | null) => void
  onResetCopy: () => void
  onSaveCopy: () => void
  onSelectTextLayer: (layerId: string | null) => void
  onTextToolChange: (tool: StudioEditorTool) => void
  onTextNudge: (axis: 'x' | 'y', direction: -1 | 1) => void
  onTextRotate: (direction: -1 | 1) => void
  onTextScale: (direction: -1 | 1) => void
  onUndoText: () => void
  onResetTextLayout: () => void
  onSaveTextLayout: () => void
  onLightingFieldChange: (field: StudioLightingField, value: number) => void
  onResetLighting: () => void
  onSaveLighting: () => void
  onToolChange: (tool: StudioEditorTool) => void
  onNudge: (axis: 'x' | 'y' | 'z', direction: -1 | 1) => void
  onScaleStep: (direction: -1 | 1) => void
  onUndo: () => void
  onSave: () => void
  sceneExport?: ReactNode
}

type CopyFieldDefinition = {
  field: StudioCopyField
  label: string
  multiline?: boolean
}

const COPY_FIELD_GROUPS: readonly {
  title: string
  fields: readonly CopyFieldDefinition[]
}[] = [
  {
    title: '品牌',
    fields: [
      { field: 'brandTitle', label: '主标题' },
      { field: 'brandSubtitle', label: '副标题' },
    ],
  },
  {
    title: '界面提示',
    fields: [
      { field: 'rotateHint', label: '旋转提示' },
      { field: 'zoomHint', label: '缩放提示' },
      { field: 'exploreHint', label: '探索提示' },
      { field: 'resetCameraLabel', label: '镜头按钮' },
    ],
  },
  {
    title: '场景悬浮标签',
    fields: [
      { field: 'dreamArchiveCalloutLabel', label: '奇思档案书架' },
    ],
  },
]

const LIGHTING_CONTROLS: readonly {
  field: StudioLightingField
  label: string
  description: string
}[] = [
  {
    field: 'globalIntensity',
    label: '整体光照',
    description: '统一缩放主灯、烛光、红眼和场景中的局部点光。',
  },
  {
    field: 'ambientIntensity',
    label: '环境光',
    description: '调整暗部补光；降低后阴影更深，提高后细节更清楚。',
  },
  {
    field: 'exposure',
    label: '画面曝光',
    description: '控制最终画面的整体明暗，也会影响发光材质的观感。',
  },
]

function formatLightingValue(field: StudioLightingField, value: number) {
  return field === 'exposure'
    ? value.toFixed(2)
    : `${Math.round(value * 100)}%`
}

export function StudioEditorControl({
  enabled,
  savingToLocalFile = false,
  localFileSaveError,
  section,
  copy,
  copyDirty,
  copySaveState,
  copyIsDefault,
  textLayoutDirty,
  textLayoutSaveState,
  textLayoutIsDefault,
  selectedTextLayerId,
  selectedTextLabel,
  selectedSceneInscriptionId,
  sceneInscriptionOptions,
  textTool,
  textCanUndo,
  lighting,
  lightingDirty,
  lightingSaveState,
  lightingIsDefault,
  layoutAssetOptions,
  selectedAssetId,
  selectedLabel,
  assetOptions,
  tool,
  dirty,
  canUndo,
  saveState,
  onToggle,
  onSectionChange,
  onCopyFieldChange,
  onAssetLabelChange,
  onSelectAsset,
  onResetCopy,
  onSaveCopy,
  onSelectTextLayer,
  onTextToolChange,
  onTextNudge,
  onTextRotate,
  onTextScale,
  onUndoText,
  onResetTextLayout,
  onSaveTextLayout,
  onLightingFieldChange,
  onResetLighting,
  onSaveLighting,
  onToolChange,
  onNudge,
  onScaleStep,
  onUndo,
  onSave,
  sceneExport,
}: StudioEditorControlProps) {
  const selectedSceneInscription = sceneInscriptionOptions.find(
    (inscription) => inscription.id === selectedSceneInscriptionId,
  ) ?? null
  const editingSceneInscription = selectedSceneInscription !== null
  const selectedCopyAssetId = !editingSceneInscription
    && assetOptions.some(({ id }) => id === selectedAssetId)
    ? selectedAssetId
    : null
  const activeTextLabel = selectedSceneInscription?.label ?? selectedTextLabel
  const activeTextTool = editingSceneInscription ? tool : textTool
  const hasSelectedText = editingSceneInscription || selectedTextLayerId !== null
  const copyEditorDirty = copyDirty || textLayoutDirty || dirty
  const copyEditorHasError = copySaveState === 'error'
    || textLayoutSaveState === 'error'
    || saveState === 'error'
  const copyEditorHasSaved = copySaveState === 'saved'
    || textLayoutSaveState === 'saved'
    || saveState === 'saved'
  const activeDirty = section === 'copy'
    ? copyEditorDirty
    : section === 'lighting'
      ? lightingDirty
      : dirty
  const activeSaveState = section === 'copy'
    ? copyEditorHasError
      ? 'error'
      : copyEditorDirty
        ? 'idle'
        : copyEditorHasSaved
          ? 'saved'
          : 'idle'
    : section === 'lighting'
      ? lightingSaveState
      : saveState
  const subject = section === 'copy' ? '文字' : section === 'lighting' ? '光照' : '布局'
  const status = activeSaveState === 'error'
    ? `${subject}自动保存失败，请重试`
    : activeSaveState === 'saved'
      ? `${subject}已自动保存`
      : activeDirty
        ? `正在自动保存${subject}`
        : `${subject}已同步，修改会自动保存`

  return (
    <div className={`studio-editor ${enabled ? 'studio-editor--enabled' : ''}`}>
      <button
        className="studio-editor__toggle"
        type="button"
        aria-pressed={enabled}
        aria-expanded={enabled}
        aria-busy={savingToLocalFile}
        disabled={savingToLocalFile}
        onClick={onToggle}
      >
        <EditLayoutIcon />
        {savingToLocalFile ? '正在保存…' : enabled ? '保存并退出' : '编辑画面'}
      </button>

      {enabled ? (
        <section className="studio-editor__panel" aria-label="画面编辑器" aria-busy={savingToLocalFile}>
          <div className="studio-editor__heading">
            <span>SCENE COMPOSER</span>
            <strong>画面编辑模式</strong>
          </div>

          {localFileSaveError ? (
            <p className="studio-editor__file-status studio-editor__file-status--error" role="alert">
              {localFileSaveError}
            </p>
          ) : null}
          {import.meta.env.DEV ? (
            <p className="studio-editor__file-status" role="status">
              {savingToLocalFile
                ? '正在写入本地文件，请稍候…'
                : '点击“保存并退出”，将物体、文字和光照保存到本地项目文件。'}
            </p>
          ) : null}

          <fieldset className="studio-editor__fields" disabled={savingToLocalFile} aria-label="场景编辑控件">

          <div className="studio-editor__tabs" role="tablist" aria-label="编辑内容">
            <button
              type="button"
              role="tab"
              aria-selected={section === 'layout'}
              onClick={() => onSectionChange('layout')}
            >
              布局
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'copy'}
              onClick={() => onSectionChange('copy')}
            >
              文字
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'lighting'}
              onClick={() => onSectionChange('lighting')}
            >
              光照
            </button>
          </div>

          {section === 'layout' ? (
            <div className="studio-editor__section" role="tabpanel" aria-label="布局编辑">
              <div className="studio-editor__selection" role="status" aria-live="polite">
                <span>当前对象</span>
                <strong>{selectedLabel ?? '点击场景中的家具'}</strong>
              </div>

              <label className="studio-editor__copy-field studio-editor__layout-object-picker">
                <span>快速选择对象</span>
                <select
                  value={selectedAssetId ?? ''}
                  aria-label="选择要调整的场景对象"
                  onChange={(event) => onSelectAsset(event.currentTarget.value || null)}
                >
                  <option value="">请选择场景对象</option>
                  {layoutAssetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {copy.assetLabels[asset.id] || asset.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="studio-editor__tools" aria-label="变换工具">
                <button type="button" aria-pressed={tool === 'translate'} onClick={() => onToolChange('translate')}>
                  <kbd>G</kbd>移动
                </button>
                <button type="button" aria-pressed={tool === 'rotate'} onClick={() => onToolChange('rotate')}>
                  <kbd>R</kbd>旋转
                </button>
                <button type="button" aria-pressed={tool === 'scale'} onClick={() => onToolChange('scale')}>
                  <kbd>S</kbd>缩放
                </button>
              </div>

              <p className="studio-editor__hint">
                点击物体选择，拖动彩色坐标轴调整；缩放始终保持等比，每次调整都会自动保存。
              </p>

              {tool === 'scale' ? (
                <div className="studio-editor__scale-step" aria-label="等比缩放微调">
                  <button type="button" disabled={!selectedAssetId} aria-label="缩小当前对象" onClick={() => onScaleStep(-1)}>
                    − 缩小
                  </button>
                  <button type="button" disabled={!selectedAssetId} aria-label="放大当前对象" onClick={() => onScaleStep(1)}>
                    ＋ 放大
                  </button>
                </div>
              ) : (
                <div className="studio-editor__nudge" aria-label="精确微调">
                  {(['x', 'y', 'z'] as const).flatMap((axis) => ([
                    <button
                      key={`${axis}-negative`}
                      type="button"
                      disabled={!selectedAssetId}
                      aria-label={`${axis.toUpperCase()}轴负向微调`}
                      onClick={() => onNudge(axis, -1)}
                    >
                      {axis.toUpperCase()}−
                    </button>,
                    <button
                      key={`${axis}-positive`}
                      type="button"
                      disabled={!selectedAssetId}
                      aria-label={`${axis.toUpperCase()}轴正向微调`}
                      onClick={() => onNudge(axis, 1)}
                    >
                      {axis.toUpperCase()}+
                    </button>,
                  ]))}
                </div>
              )}

              <div className="studio-editor__actions">
                <button type="button" disabled={!canUndo} onClick={onUndo}>撤销</button>
                <button className="studio-editor__save" type="button" disabled={!dirty && saveState !== 'error'} onClick={onSave}>
                  {saveState === 'error' ? '重试保存' : '自动保存'}
                </button>
              </div>
            </div>
          ) : section === 'copy' ? (
            <div className="studio-editor__section studio-editor__section--copy" role="tabpanel" aria-label="文字编辑">
              <div className="studio-editor__selection studio-editor__selection--text" role="status" aria-live="polite">
                <span>当前文字图层</span>
                <strong>{activeTextLabel ?? '点击画面文字或聚焦下方输入框'}</strong>
              </div>

              <div className="studio-editor__tools" aria-label="文字变换工具">
                <button
                  type="button"
                  aria-pressed={activeTextTool === 'translate'}
                  onClick={() => editingSceneInscription ? onToolChange('translate') : onTextToolChange('translate')}
                >
                  <kbd>G</kbd>移动
                </button>
                <button
                  type="button"
                  aria-pressed={activeTextTool === 'rotate'}
                  onClick={() => editingSceneInscription ? onToolChange('rotate') : onTextToolChange('rotate')}
                >
                  <kbd>R</kbd>旋转
                </button>
                <button
                  type="button"
                  aria-pressed={activeTextTool === 'scale'}
                  onClick={() => editingSceneInscription ? onToolChange('scale') : onTextToolChange('scale')}
                >
                  <kbd>S</kbd>缩放
                </button>
              </div>

              <p className="studio-editor__hint">
                {editingSceneInscription
                  ? '当前是三维场景文字：可拖动彩色坐标轴，或用下方 XYZ 按钮精确移动、旋转和等比缩放。'
                  : '先选中文字，再在画面中拖动；G 移动、R 旋转、S 等比缩放。内容和位置都会自动保存。'}
              </p>

              {editingSceneInscription && activeTextTool !== 'scale' ? (
                <div
                  className="studio-editor__nudge"
                  aria-label={activeTextTool === 'rotate' ? '三维文字旋转微调' : '三维文字位置微调'}
                >
                  {(['x', 'y', 'z'] as const).flatMap((axis) => ([
                    <button
                      key={`${axis}-negative`}
                      type="button"
                      aria-label={`${axis.toUpperCase()}轴${activeTextTool === 'rotate' ? '负向旋转' : '负向位移'}三维文字`}
                      onClick={() => onNudge(axis, -1)}
                    >
                      {axis.toUpperCase()}−
                    </button>,
                    <button
                      key={`${axis}-positive`}
                      type="button"
                      aria-label={`${axis.toUpperCase()}轴${activeTextTool === 'rotate' ? '正向旋转' : '正向位移'}三维文字`}
                      onClick={() => onNudge(axis, 1)}
                    >
                      {axis.toUpperCase()}+
                    </button>,
                  ]))}
                </div>
              ) : editingSceneInscription ? (
                <div className="studio-editor__scale-step" aria-label="三维文字等比缩放微调">
                  <button type="button" onClick={() => onScaleStep(-1)}>− 缩小</button>
                  <button type="button" onClick={() => onScaleStep(1)}>＋ 放大</button>
                </div>
              ) : activeTextTool === 'translate' ? (
                <div className="studio-editor__nudge studio-editor__nudge--text" aria-label="文字位置微调">
                  {(['x', 'y'] as const).flatMap((axis) => ([
                    <button
                      key={`${axis}-negative`}
                      type="button"
                      disabled={!hasSelectedText}
                      aria-label={`${axis.toUpperCase()}轴负向微调文字`}
                      onClick={() => onTextNudge(axis, -1)}
                    >
                      {axis.toUpperCase()}−
                    </button>,
                    <button
                      key={`${axis}-positive`}
                      type="button"
                      disabled={!hasSelectedText}
                      aria-label={`${axis.toUpperCase()}轴正向微调文字`}
                      onClick={() => onTextNudge(axis, 1)}
                    >
                      {axis.toUpperCase()}+
                    </button>,
                  ]))}
                </div>
              ) : activeTextTool === 'rotate' ? (
                <div className="studio-editor__scale-step" aria-label="文字旋转微调">
                  <button type="button" disabled={!hasSelectedText} onClick={() => onTextRotate(-1)}>↺ 逆时针</button>
                  <button type="button" disabled={!hasSelectedText} onClick={() => onTextRotate(1)}>↻ 顺时针</button>
                </div>
              ) : (
                <div className="studio-editor__scale-step" aria-label="文字缩放微调">
                  <button type="button" disabled={!hasSelectedText} onClick={() => onTextScale(-1)}>− 缩小</button>
                  <button type="button" disabled={!hasSelectedText} onClick={() => onTextScale(1)}>＋ 放大</button>
                </div>
              )}

              {editingSceneInscription ? (
                <div className="studio-editor__actions studio-editor__text-layout-actions">
                  <button type="button" disabled={!canUndo} onClick={onUndo}>撤销变换</button>
                  <button
                    type="button"
                    disabled={!dirty && saveState !== 'error'}
                    onClick={onSave}
                  >
                    {saveState === 'error' ? '重试保存位置' : '保存位置'}
                  </button>
                </div>
              ) : (
                <div className="studio-editor__actions studio-editor__text-layout-actions">
                  <button type="button" disabled={!textCanUndo} onClick={onUndoText}>撤销变换</button>
                  <button type="button" disabled={textLayoutIsDefault} onClick={onResetTextLayout}>恢复文字位置</button>
                </div>
              )}

              <div className="studio-editor__copy-fields">
                <fieldset className="studio-editor__copy-group">
                  <legend>三维场景文字</legend>
                  {sceneInscriptionOptions.map((inscription) => (
                    <label key={inscription.id} className="studio-editor__copy-field">
                      <span>{inscription.label}</span>
                      <textarea
                        rows={inscription.rows ?? 3}
                        value={copy[inscription.copyField]}
                        maxLength={STUDIO_COPY_FIELD_LIMITS[inscription.copyField]}
                        aria-label={inscription.label}
                        data-selected={selectedSceneInscriptionId === inscription.id ? 'true' : 'false'}
                        onFocus={() => onSelectAsset(inscription.id)}
                        onChange={(event) => onCopyFieldChange(inscription.copyField, event.currentTarget.value)}
                      />
                    </label>
                  ))}
                </fieldset>

                {COPY_FIELD_GROUPS.map((group) => (
                  <fieldset key={group.title} className="studio-editor__copy-group">
                    <legend>{group.title}</legend>
                    {group.fields.map(({ field, label, multiline }) => (
                      <label key={field} className="studio-editor__copy-field">
                        <span>{label}</span>
                        {multiline ? (
                          <textarea
                            rows={3}
                            value={copy[field]}
                            maxLength={STUDIO_COPY_FIELD_LIMITS[field]}
                            aria-label={label}
                            data-selected={selectedTextLayerId === field ? 'true' : 'false'}
                            onFocus={() => {
                              onSelectAsset(null)
                              onSelectTextLayer(field)
                            }}
                            onChange={(event) => onCopyFieldChange(field, event.currentTarget.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            value={copy[field]}
                            maxLength={STUDIO_COPY_FIELD_LIMITS[field]}
                            aria-label={label}
                            data-selected={selectedTextLayerId === field ? 'true' : 'false'}
                            onFocus={() => {
                              onSelectAsset(null)
                              onSelectTextLayer(field)
                            }}
                            onChange={(event) => onCopyFieldChange(field, event.currentTarget.value)}
                          />
                        )}
                      </label>
                    ))}
                  </fieldset>
                ))}

                <fieldset className="studio-editor__copy-group">
                  <legend>场景对象名称</legend>
                  <label className="studio-editor__copy-field">
                    <span>选择对象</span>
                    <select
                      value={selectedCopyAssetId ?? ''}
                      aria-label="选择要修改名称的场景对象"
                      onChange={(event) => {
                        const assetId = event.currentTarget.value || null
                        onSelectAsset(assetId)
                        onSelectTextLayer(assetId ? `asset-label:${assetId}` : null)
                      }}
                    >
                      <option value="">请选择场景对象</option>
                      {assetOptions.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {copy.assetLabels[asset.id] || asset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="studio-editor__copy-field">
                    <span>悬浮显示名称</span>
                    <input
                      type="text"
                      value={selectedCopyAssetId ? copy.assetLabels[selectedCopyAssetId] ?? '' : ''}
                      maxLength={STUDIO_ASSET_LABEL_MAX_LENGTH}
                      disabled={!selectedCopyAssetId}
                      aria-label="场景对象悬浮显示名称"
                      placeholder="先选择一个场景对象"
                      data-selected={selectedCopyAssetId && selectedTextLayerId === `asset-label:${selectedCopyAssetId}` ? 'true' : 'false'}
                      onFocus={() => {
                        if (selectedCopyAssetId) onSelectTextLayer(`asset-label:${selectedCopyAssetId}`)
                      }}
                      onChange={(event) => {
                        if (selectedCopyAssetId && selectedAssetId) {
                          onAssetLabelChange(selectedAssetId, event.currentTarget.value)
                        }
                      }}
                    />
                  </label>
                </fieldset>
              </div>

              <div className="studio-editor__actions">
                <button type="button" disabled={copyIsDefault} onClick={onResetCopy}>恢复默认文字</button>
                <button
                  className="studio-editor__save"
                  type="button"
                  disabled={!copyEditorDirty && !copyEditorHasError}
                  onClick={() => {
                    onSaveCopy()
                    onSaveTextLayout()
                    onSave()
                  }}
                >
                  {copyEditorHasError ? '重试保存' : '立即保存'}
                </button>
              </div>
            </div>
          ) : (
            <div className="studio-editor__section studio-editor__section--lighting" role="tabpanel" aria-label="光照编辑">
              <p className="studio-editor__hint">
                拖动时画面会即时更新；停顿片刻后自动保存，也可立即保存。
              </p>

              <fieldset className="studio-editor__lighting-group">
                <legend>全局光照</legend>
                {LIGHTING_CONTROLS.map(({ field, label, description }) => {
                  const limits = STUDIO_LIGHTING_LIMITS[field]
                  const formattedValue = formatLightingValue(field, lighting[field])
                  return (
                    <label key={field} className="studio-editor__lighting-control">
                      <span className="studio-editor__lighting-label">
                        <span>{label}</span>
                        <output>{formattedValue}</output>
                      </span>
                      <input
                        type="range"
                        min={limits.min}
                        max={limits.max}
                        step={limits.step}
                        value={lighting[field]}
                        aria-label={label}
                        aria-valuetext={formattedValue}
                        onInput={(event) => (
                          onLightingFieldChange(field, Number(event.currentTarget.value))
                        )}
                      />
                      <small>{description}</small>
                    </label>
                  )
                })}
              </fieldset>

              <div className="studio-editor__actions">
                <button type="button" disabled={lightingIsDefault} onClick={onResetLighting}>
                  恢复默认光照
                </button>
                <button
                  className="studio-editor__save"
                  type="button"
                  disabled={!lightingDirty && lightingSaveState !== 'error'}
                  onClick={onSaveLighting}
                >
                  {lightingSaveState === 'error' ? '重试保存' : '立即保存'}
                </button>
              </div>
            </div>
          )}

          <div
            className={`studio-editor__status studio-editor__status--${activeSaveState}`}
            data-dirty={activeDirty ? 'true' : 'false'}
          >
            <i aria-hidden="true" />
            {status}
          </div>
          {sceneExport}
          </fieldset>
        </section>
      ) : null}
    </div>
  )
}
