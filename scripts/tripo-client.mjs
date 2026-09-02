import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'

export const TRIPO_BASE_URL = 'https://openapi.tripo3d.com/v3'
export const DEFAULT_TRIPO_MODEL = 'v3.1-20260211'
export const DEFAULT_POLL_INTERVAL_MS = 2_000

const TERMINAL_FAILURE_STATES = new Set(['failed', 'cancelled', 'banned'])
const IMAGE_MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
])

export class TripoApiError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'TripoApiError'
    this.status = details.status ?? 0
    this.code = details.code ?? null
    this.requestId = details.requestId ?? null
    this.suggestion = details.suggestion ?? null
  }
}

export function requireTripoApiKey(environment = process.env) {
  const apiKey = environment.TRIPO_API_KEY?.trim()
  if (!apiKey) {
    throw new TripoApiError(
      '缺少 TRIPO_API_KEY。请先在环境变量中配置 Tripo API Key。',
    )
  }
  if (/\s/.test(apiKey)) {
    throw new TripoApiError('TRIPO_API_KEY 不能包含空白字符。')
  }
  return apiKey
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(60_000, retryAfter * 1_000)
  }

  const resetAt = Number(response.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.min(
      60_000,
      Math.max(1_000, resetAt * 1_000 - Date.now()),
    )
  }

  return Math.min(30_000, 1_000 * 2 ** attempt)
}

async function parseEnvelope(response) {
  const raw = await response.text()
  if (!raw) return { code: response.ok ? 0 : response.status }
  try {
    return JSON.parse(raw)
  } catch {
    throw new TripoApiError(`Tripo 返回了无法解析的响应（HTTP ${response.status}）。`, {
      status: response.status,
    })
  }
}

export async function tripoRequest(pathname, {
  apiKey = requireTripoApiKey(),
  body,
  fetchImpl = fetch,
  headers = {},
  method = 'GET',
  maxRetries = 4,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 45_000,
} = {}) {
  if (!pathname.startsWith('/')) {
    throw new TypeError('Tripo API pathname must start with /.')
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response
    try {
      response = await fetchImpl(`${TRIPO_BASE_URL}${pathname}`, {
        method,
        body,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (attempt < maxRetries) {
        await sleepImpl(Math.min(8_000, 750 * 2 ** attempt))
        continue
      }
      throw new TripoApiError(
        `无法连接 Tripo API：${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const envelope = await parseEnvelope(response)
    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < maxRetries) {
      await sleepImpl(retryDelayMs(response, attempt))
      continue
    }

    if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
      const message = envelope.message ?? envelope.error_message ?? 'Unknown Tripo API error'
      throw new TripoApiError(
        `Tripo API 请求失败（HTTP ${response.status} / code ${envelope.code ?? 'unknown'}）：${message}`,
        {
          status: response.status,
          code: envelope.code,
          requestId: envelope.request_id,
          suggestion: envelope.suggestion,
        },
      )
    }

    return envelope.data
  }

  throw new TripoApiError('Tripo API 重试次数已用尽。')
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

export function createTextModel({
  apiKey,
  faceLimit = 120_000,
  fetchImpl,
  model = DEFAULT_TRIPO_MODEL,
  modelSeed,
  negativePrompt,
  prompt,
  textureSeed,
} = {}) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new TypeError('Text-to-model requires a non-empty prompt.')
  }
  if (prompt.length > 1_024) {
    throw new RangeError('Tripo prompt cannot exceed 1024 characters.')
  }

  return tripoRequest('/generation/text-to-model', {
    apiKey,
    fetchImpl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(compactObject({
      prompt: prompt.trim(),
      model,
      negative_prompt: negativePrompt,
      model_seed: modelSeed,
      texture_seed: textureSeed,
      face_limit: faceLimit,
      texture: true,
      pbr: true,
      texture_quality: 'detailed',
      geometry_quality: model.startsWith('P') ? undefined : 'detailed',
      auto_size: true,
    })),
  })
}

export function createImageModel({
  apiKey,
  faceLimit = 120_000,
  fetchImpl,
  input,
  model = DEFAULT_TRIPO_MODEL,
  modelSeed,
  textureSeed,
} = {}) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new TypeError('Image-to-model requires a URL, file_token, or task_id input.')
  }

  return tripoRequest('/generation/image-to-model', {
    apiKey,
    fetchImpl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(compactObject({
      input: input.trim(),
      model,
      model_seed: modelSeed,
      texture_seed: textureSeed,
      face_limit: faceLimit,
      texture: true,
      pbr: true,
      texture_quality: 'detailed',
      geometry_quality: model.startsWith('P') ? undefined : 'detailed',
      auto_size: true,
      enable_image_autofix: true,
      orientation: 'align_image',
      texture_alignment: 'original_image',
    })),
  })
}

export async function uploadImage(filePath, {
  apiKey,
  fetchImpl,
} = {}) {
  const extension = extname(filePath).toLowerCase()
  const mimeType = IMAGE_MIME_TYPES.get(extension)
  if (!mimeType) {
    throw new TypeError('本地参考图只支持 PNG、JPG 或 JPEG。')
  }

  const fileInfo = await stat(filePath)
  if (!fileInfo.isFile() || fileInfo.size === 0) {
    throw new TypeError('本地参考图不存在或为空。')
  }
  if (fileInfo.size > 20 * 1024 * 1024) {
    throw new RangeError('Tripo 本地参考图不能超过 20 MB。')
  }

  const bytes = await readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), basename(filePath))
  return tripoRequest('/files', {
    apiKey,
    fetchImpl,
    method: 'POST',
    body: form,
  })
}

export function getTask(taskId, options = {}) {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{6,160}$/.test(taskId)) {
    throw new TypeError('Invalid Tripo task id.')
  }
  return tripoRequest(`/tasks/${encodeURIComponent(taskId)}`, options)
}

export async function waitForTask(taskId, {
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  onProgress = () => undefined,
  timeoutMs = 15 * 60_000,
  ...requestOptions
} = {}) {
  const startedAt = Date.now()
  let lastProgress = -1

  while (Date.now() - startedAt <= timeoutMs) {
    const task = await getTask(taskId, requestOptions)
    const progress = Number.isFinite(task.progress) ? task.progress : 0
    if (progress !== lastProgress) {
      lastProgress = progress
      onProgress(task)
    }

    if (task.status === 'success') return task
    if (TERMINAL_FAILURE_STATES.has(task.status)) {
      throw new TripoApiError(
        task.error_message ?? `Tripo task ended as ${task.status}.`,
        { code: task.error_code },
      )
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new TripoApiError(`Tripo task ${taskId} timed out.`)
}

export async function downloadTripoFile(url, {
  fetchImpl = fetch,
  maximumBytes = 512 * 1024 * 1024,
} = {}) {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:') {
    throw new TypeError('Tripo download URL must use HTTPS.')
  }

  const response = await fetchImpl(parsedUrl, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw new TripoApiError(`下载 Tripo 文件失败（HTTP ${response.status}）。`, {
      status: response.status,
    })
  }

  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    throw new RangeError('Tripo 下载文件超过安全体积限制。')
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new RangeError('Tripo 下载文件为空或超过安全体积限制。')
  }
  return bytes
}

export function isGlb(bytes) {
  return bytes?.byteLength >= 12 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46
}
