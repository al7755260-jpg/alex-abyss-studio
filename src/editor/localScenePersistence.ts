import { serializeSceneSnapshot, type StudioSceneSnapshot } from './studioSceneSnapshot.ts'

export const LOCAL_SCENE_SAVE_ENDPOINT = '/__studio/local-scene'
export const LOCAL_SCENE_SAVE_TIMEOUT_MS = 12_000

export type LocalSceneSaveResult = {
  ok: true
  savedAt: string
  unchanged: boolean
}

export type LocalSceneSaveOptions = {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

const TIMEOUT_MESSAGE = '本地保存请求超时，无法确认是否已写入项目。请保留当前页面，稍后重试。'
const INVALID_RESPONSE_MESSAGE = '本地保存服务返回的数据无效，无法确认保存结果。请保留当前页面后重试。'

class LocalSceneSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalSceneSaveError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isSavedAt(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

function responseError(response: Response, payload: Record<string, unknown> | null): LocalSceneSaveError {
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return new LocalSceneSaveError(`本地保存失败：${payload.error.trim().slice(0, 300)}`)
  }
  if (response.status === 404 || response.status === 405) {
    return new LocalSceneSaveError('当前站点未提供本地保存服务，请从本地开发网址打开后重试。')
  }
  return new LocalSceneSaveError(response.ok
    ? INVALID_RESPONSE_MESSAGE
    : `本地保存服务未确认成功（HTTP ${response.status}）。请保留当前页面后重试。`)
}

/** Explicit save only: no browser-storage reads, background writes or retries. */
export async function saveLocalSceneSnapshot(
  snapshot: StudioSceneSnapshot,
  options: LocalSceneSaveOptions = {},
): Promise<LocalSceneSaveResult> {
  const timeoutMs = options.timeoutMs ?? LOCAL_SCENE_SAVE_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new LocalSceneSaveError('本地保存超时设置无效，请使用有效的正毫秒数。')
  }
  const fetchRequest = options.fetch ?? globalThis.fetch?.bind(globalThis)
  if (!fetchRequest) throw new LocalSceneSaveError('当前浏览器不支持本地保存请求，请使用现代浏览器打开本地站点。')

  let body: string
  try {
    body = serializeSceneSnapshot(snapshot)
  } catch {
    throw new LocalSceneSaveError('当前场景数据无法生成保存快照，请检查编辑内容后重试。')
  }

  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new LocalSceneSaveError(TIMEOUT_MESSAGE))
    }, timeoutMs)
  })

  const request = async (): Promise<LocalSceneSaveResult> => {
    let response: Response
    try {
      response = await fetchRequest(LOCAL_SCENE_SAVE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Studio-Local-Save': '1',
        },
        body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch {
      throw new LocalSceneSaveError('无法连接本地保存服务，尚未确认保存结果。请确认本地站点仍在运行。')
    }

    let payload: Record<string, unknown> | null
    try {
      payload = asRecord(await response.json())
    } catch {
      throw responseError(response, null)
    }
    if (!response.ok || payload?.ok !== true) throw responseError(response, payload)
    if (!isSavedAt(payload.savedAt) || typeof payload.unchanged !== 'boolean') {
      throw new LocalSceneSaveError(INVALID_RESPONSE_MESSAGE)
    }
    return { ok: true, savedAt: payload.savedAt, unchanged: payload.unchanged }
  }

  try {
    // Bound the complete response (including JSON) even if a fetch adapter ignores abort.
    return await Promise.race([request(), timeout])
  } catch (error) {
    if (timedOut) throw new LocalSceneSaveError(TIMEOUT_MESSAGE)
    if (error instanceof LocalSceneSaveError) throw error
    throw new LocalSceneSaveError(INVALID_RESPONSE_MESSAGE)
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
