import { useId, useRef, useState } from 'react'
import {
  serializeSceneSnapshot,
  STUDIO_SCENE_SNAPSHOT_FILENAME,
  type StudioSceneSnapshot,
} from '../../editor/studioSceneSnapshot'
import './StudioSceneExport.css'

export type StudioSceneExportProps = {
  snapshot: StudioSceneSnapshot
  onLoadProjectScene?: () => void
  projectSceneSaveState?: 'pending' | 'saved' | 'error'
}

export function StudioSceneExport({
  snapshot,
  onLoadProjectScene,
  projectSceneSaveState,
}: StudioSceneExportProps) {
  const panelId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [exportJson, setExportJson] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [confirmProjectLoad, setConfirmProjectLoad] = useState(false)
  const [projectLoadRequested, setProjectLoadRequested] = useState(false)

  function confirmLoadProjectScene() {
    if (!onLoadProjectScene) return
    onLoadProjectScene()
    setConfirmProjectLoad(false)
    setProjectLoadRequested(true)
    // Any previously exported JSON describes the old draft, not the loaded project.
    setExportJson(null)
    setStatus('')
  }

  function generateSnapshot() {
    try {
      setExportJson(serializeSceneSnapshot(snapshot))
      setStatus('已生成当前场景快照，尚未发布到网站。')
    } catch {
      setStatus('场景快照生成失败，请检查当前编辑内容后重试。')
    }
  }

  async function copySnapshot() {
    if (exportJson === null) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(exportJson)
      setStatus('场景 JSON 已复制，尚未发布到网站。')
    } catch {
      textareaRef.current?.focus()
      textareaRef.current?.select()
      setStatus('无法自动复制，已选中 JSON，请按 Ctrl+C 或使用下载。')
    }
  }

  function downloadSnapshot() {
    if (exportJson === null) return
    let objectUrl: string | null = null
    const link = document.createElement('a')
    try {
      objectUrl = URL.createObjectURL(new Blob([exportJson], { type: 'application/json;charset=utf-8' }))
      link.href = objectUrl
      link.download = STUDIO_SCENE_SNAPSHOT_FILENAME
      document.body.append(link)
      link.click()
      setStatus('已请求下载场景 JSON，尚未发布到网站。')
    } catch {
      setStatus('下载失败，请复制下方 JSON 保存。')
    } finally {
      link.remove()
      if (objectUrl !== null) {
        const completedUrl = objectUrl
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000)
      }
    }
  }

  function closeExport() {
    setExportJson(null)
    setStatus('')
  }

  return (
    <section className="studio-scene-export" aria-label="发布场景导出">
      <p className="studio-scene-export__hint">
        {import.meta.env.DEV
          ? '编辑时自动保留浏览器草稿；点击“保存并退出”会写入本地项目文件。公开网站仍需重新部署，才会同步更新。'
          : '编辑结果只保存在当前浏览器、当前网址。本地保存不等于全站发布；导出的场景需纳入网站并重新部署，其他访客才能看到相同摆放。'}
      </p>
      <button
        className="studio-scene-export__trigger"
        type="button"
        aria-expanded={exportJson !== null}
        aria-controls={panelId}
        onClick={exportJson === null ? generateSnapshot : closeExport}
      >
        {exportJson === null ? '导出发布场景' : '收起发布场景'}
      </button>
      {exportJson !== null ? (
        <div className="studio-scene-export__panel" id={panelId}>
          <p className="studio-scene-export__hint">
            仅包含物体摆放、文字内容与位置、光照，不包含游戏进度或浏览器身份。
            下方为点击导出时的快照；继续编辑后请重新生成。
          </p>
          <textarea
            ref={textareaRef}
            className="studio-scene-export__json"
            aria-label="发布场景 JSON"
            readOnly
            spellCheck={false}
            value={exportJson}
            rows={9}
          />
          <div className="studio-scene-export__actions">
            <button type="button" onClick={copySnapshot}>复制 JSON</button>
            <button type="button" onClick={downloadSnapshot}>下载 JSON</button>
            <button type="button" onClick={generateSnapshot}>重新生成当前场景</button>
          </div>
        </div>
      ) : null}
      {onLoadProjectScene ? (
        <div className="studio-scene-export__panel">
          <button
            className="studio-scene-export__trigger"
            type="button"
            aria-expanded={confirmProjectLoad}
            onClick={() => setConfirmProjectLoad(true)}
          >
            载入项目保存的场景
          </button>
          {confirmProjectLoad ? (
            <div className="studio-scene-export__panel" role="group" aria-label="确认载入项目场景">
              <p className="studio-scene-export__hint">
                将用本地项目文件替换当前浏览器的物体摆放、文字内容与位置、光照，
                并自动保存。请先导出当前场景作为备份。游戏进度不变，此操作不会发布网站。
              </p>
              <div className="studio-scene-export__actions">
                <button type="button" onClick={confirmLoadProjectScene}>已备份，确认载入</button>
                <button type="button" onClick={() => setConfirmProjectLoad(false)}>取消</button>
              </div>
            </div>
          ) : null}
          {projectLoadRequested ? (
            <p className="studio-scene-export__status" role="status" aria-live="polite">
              {projectSceneSaveState === 'error'
                ? '项目场景已载入，但部分内容保存失败。请在相应编辑分类重试保存，暂勿关闭页面。'
                : projectSceneSaveState === 'saved'
                  ? '项目场景已载入并保存到当前浏览器；可继续编辑，尚未发布到网站。'
                  : '项目场景已载入编辑区，正在自动保存，请稍候。'}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="studio-scene-export__status" role="status" aria-live="polite">{status}</p>
    </section>
  )
}
