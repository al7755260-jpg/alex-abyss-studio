import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_TRIPO_MODEL,
  requireTripoApiKey,
  TRIPO_BASE_URL,
} from './tripo-client.mjs'

export async function checkTripoConfiguration({
  environment = process.env,
  fetchImpl = fetch,
  online = false,
} = {}) {
  const apiKey = requireTripoApiKey(environment)
  const result = {
    configured: true,
    model: DEFAULT_TRIPO_MODEL,
    online: false,
  }

  if (!online) return result

  const response = await fetchImpl(`${TRIPO_BASE_URL}/tasks/connectivity_probe`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (
    response.status === 401 ||
    payload.code === 1000 ||
    payload.code === 1001
  ) {
    throw new Error('Tripo API Key 无效或未获授权。')
  }

  if (response.status >= 500) {
    throw new Error(`Tripo 服务暂时不可用（HTTP ${response.status}）。`)
  }

  return {
    ...result,
    online: true,
    probeStatus: response.status,
    requestId: payload.request_id ?? null,
  }
}

async function main() {
  try {
    const online = process.argv.slice(2).includes('--online')
    const result = await checkTripoConfiguration({ online })
    console.log(`Tripo API Key：已配置（未输出密钥）`)
    console.log(`默认模型：${result.model}`)
    console.log(
      online
        ? `在线鉴权探测：已连通（HTTP ${result.probeStatus}，未创建收费任务）`
        : '本地配置检查：通过；如需验证在线鉴权，请追加 --online',
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
