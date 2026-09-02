import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createImageModel,
  createTextModel,
  downloadTripoFile,
  isGlb,
  requireTripoApiKey,
  tripoRequest,
} from '../scripts/tripo-client.mjs'
import { checkTripoConfiguration } from '../scripts/tripo-check.mjs'
import { parseTripoGenerateArguments } from '../scripts/tripo-generate.mjs'

const jsonResponse = (payload, init = {}) => new Response(
  JSON.stringify(payload),
  {
    status: init.status ?? 200,
    headers: init.headers,
  },
)

test('Tripo 密钥只能来自服务端环境变量且不会接受空值', () => {
  assert.equal(requireTripoApiKey({ TRIPO_API_KEY: 'secret-key' }), 'secret-key')
  assert.throws(() => requireTripoApiKey({}), /TRIPO_API_KEY/)
  assert.throws(() => requireTripoApiKey({ TRIPO_API_KEY: 'bad key' }), /空白/)
})

test('文生和图生任务固定使用 v3 高质量 PBR 请求', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return jsonResponse({ code: 0, data: { task_id: 'task_abc123' } })
  }

  await createTextModel({
    apiKey: 'secret-key',
    fetchImpl,
    prompt: 'Cthulhu brass chair',
  })
  await createImageModel({
    apiKey: 'secret-key',
    fetchImpl,
    input: 'file_abc123',
  })

  assert.equal(calls[0].url.endsWith('/generation/text-to-model'), true)
  assert.equal(calls[0].body.model, 'v3.1-20260211')
  assert.equal(calls[0].body.texture, true)
  assert.equal(calls[0].body.pbr, true)
  assert.equal(calls[0].body.texture_quality, 'detailed')
  assert.equal(calls[0].body.geometry_quality, 'detailed')
  assert.equal(calls[1].url.endsWith('/generation/image-to-model'), true)
  assert.equal(calls[1].body.input, 'file_abc123')
  assert.equal(calls[1].body.enable_image_autofix, true)
})

test('429 会遵循服务端重试提示且不会泄露密钥', async () => {
  let attempts = 0
  const waits = []
  const fetchImpl = async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer secret-key')
    attempts += 1
    return attempts === 1
      ? jsonResponse(
        { code: 1007, message: 'rate limited' },
        { status: 429, headers: { 'Retry-After': '0' } },
      )
      : jsonResponse({ code: 0, data: { task_id: 'task_retry' } })
  }

  const data = await tripoRequest('/generation/text-to-model', {
    apiKey: 'secret-key',
    body: '{}',
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    sleepImpl: async (milliseconds) => waits.push(milliseconds),
  })
  assert.equal(data.task_id, 'task_retry')
  assert.deepEqual(waits, [0])
})

test('下载只接受 HTTPS 且 GLB 魔数校验正确', async () => {
  await assert.rejects(() => downloadTripoFile('http://example.com/model.glb'), /HTTPS/)
  const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0])
  const downloaded = await downloadTripoFile('https://cdn.example.com/model.glb', {
    fetchImpl: async () => new Response(bytes),
  })
  assert.equal(isGlb(downloaded), true)
  assert.equal(isGlb(new Uint8Array([1, 2, 3, 4])), false)
})

test('生成 CLI 只允许一种输入并保护 slug 和 P 系列面数', () => {
  const text = parseTripoGenerateArguments([
    '--slug', 'abyss-chair',
    '--text', 'Cthulhu chair',
  ])
  assert.equal(text.faceLimit, 120_000)

  const image = parseTripoGenerateArguments([
    '--slug', 'abyss-mask',
    '--image', 'mask.png',
    '--model', 'P1-20260311',
  ])
  assert.equal(image.faceLimit, 20_000)

  assert.throws(
    () => parseTripoGenerateArguments(['--slug', '../escape', '--text', 'x']),
    /slug/,
  )
  assert.throws(
    () => parseTripoGenerateArguments([
      '--slug', 'two-inputs', '--text', 'x', '--image', 'x.png',
    ]),
    /只能提供一个/,
  )
  assert.throws(
    () => parseTripoGenerateArguments([
      '--slug', 'too-many-faces', '--text', 'x', '--model', 'P1-20260311',
      '--face-limit', '20001',
    ]),
    /20000/,
  )
})

test('在线检查使用无收费探测且无 key 时立即阻止', async () => {
  await assert.rejects(
    () => checkTripoConfiguration({ environment: {}, online: true }),
    /TRIPO_API_KEY/,
  )
  const result = await checkTripoConfiguration({
    environment: { TRIPO_API_KEY: 'secret-key' },
    online: true,
    fetchImpl: async (url, init) => {
      assert.equal(url.endsWith('/tasks/connectivity_probe'), true)
      assert.equal(init.headers.Authorization, 'Bearer secret-key')
      return jsonResponse({ code: 1004, message: 'task not found' }, { status: 404 })
    },
  })
  assert.equal(result.online, true)
  assert.equal(result.probeStatus, 404)
})
