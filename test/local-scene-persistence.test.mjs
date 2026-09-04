import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultStudioCopy } from '../src/editor/studioCopy.ts'
import { createDefaultStudioLayout } from '../src/editor/studioLayout.ts'
import { createDefaultStudioTextLayout } from '../src/editor/studioTextLayout.ts'
import {
  LOCAL_SCENE_SAVE_ENDPOINT,
  LOCAL_SCENE_SAVE_TIMEOUT_MS,
  saveLocalSceneSnapshot,
} from '../src/editor/localScenePersistence.ts'

function scene() {
  const assets = [{ id: 'desk', label: '旧书桌', position: [1, 2, 3], rotation: [0, 0.5, 0] }]
  return {
    schemaVersion: 1,
    layout: createDefaultStudioLayout(assets),
    copy: { ...createDefaultStudioCopy(assets), brandTitle: '我刚保存的文字' },
    textLayout: createDefaultStudioTextLayout(['brandTitle', 'asset-label:desk']),
    lighting: { globalIntensity: 1.2, ambientIntensity: 0.7, exposure: 1.05 },
  }
}

const savedAt = '2026-09-03T13:25:06.123Z'
const success = (unchanged = false) => ({ ok: true, savedAt, unchanged })
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

test('显式保存仅POST完整四分区快照，使用同源凭据、自定义标记与禁止缓存', async () => {
  const snapshot = scene()
  const withPrivateExtra = { ...snapshot, gameProgress: { found: ['secret'] }, browserIdentity: 'private' }
  const calls = []
  const result = await saveLocalSceneSnapshot(withPrivateExtra, {
    fetch: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse(success())
    },
  })
  assert.equal(LOCAL_SCENE_SAVE_ENDPOINT, '/__studio/local-scene')
  assert.equal(LOCAL_SCENE_SAVE_TIMEOUT_MS, 12_000)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, LOCAL_SCENE_SAVE_ENDPOINT)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json', 'X-Studio-Local-Save': '1' })
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.equal(calls[0].init.signal.aborted, false)
  assert.deepEqual(JSON.parse(calls[0].init.body), snapshot)
  assert.ok(calls[0].init.body.endsWith('\n'))
  assert.doesNotMatch(calls[0].init.body, /gameProgress|browserIdentity|secret|private/)
  assert.deepEqual(result, success())
})

test('服务器确认unchanged时仍要求完整成功合同', async () => {
  const result = await saveLocalSceneSnapshot(scene(), { fetch: async () => jsonResponse(success(true)) })
  assert.deepEqual(result, success(true))
})

test('非2xx状态即使响应声称ok也不报成功，失败消息可展示且不会重试', async () => {
  for (const [status, payload, message] of [
    [500, success(), /HTTP 500/],
    [403, { ok: false, error: '只允许本地开发站点保存' }, /本地保存失败：只允许本地开发站点保存/],
    [200, { ok: false, error: '写入磁盘失败' }, /本地保存失败：写入磁盘失败/],
    [404, null, /未提供本地保存服务/],
  ]) {
    let calls = 0
    await assert.rejects(saveLocalSceneSnapshot(scene(), {
      fetch: async () => { calls += 1; return jsonResponse(payload, status) },
    }), message)
    assert.equal(calls, 1)
  }
})

test('拒绝坏JSON、空响应及不完整或错误的成功字段', async () => {
  const invalidPayloads = [
    null, [], {}, { ok: 1, savedAt, unchanged: false },
    { ok: true, unchanged: false }, { ok: true, savedAt },
    { ok: true, savedAt, unchanged: 'false' },
    { ok: true, savedAt: '', unchanged: false },
    { ok: true, savedAt: 'yesterday', unchanged: false },
    { ok: true, savedAt: '2026-02-30T13:25:06.123Z', unchanged: false },
    { ok: true, savedAt: 1788441906123, unchanged: false },
  ]
  for (const payload of invalidPayloads) {
    await assert.rejects(saveLocalSceneSnapshot(scene(), {
      fetch: async () => jsonResponse(payload),
    }), /返回的数据无效/)
  }
  for (const response of [new Response('<html>wrong route</html>'), new Response(null, { status: 204 })]) {
    await assert.rejects(saveLocalSceneSnapshot(scene(), {
      fetch: async () => response,
    }), /返回的数据无效/)
  }
})

test('断网或fetch同步异常转换为中文错误且只尝试一次', async () => {
  let calls = 0
  await assert.rejects(saveLocalSceneSnapshot(scene(), {
    fetch: async () => { calls += 1; throw new TypeError('Failed to fetch') },
  }), /无法连接本地保存服务/)
  assert.equal(calls, 1)
  await assert.rejects(saveLocalSceneSnapshot(scene(), {
    fetch: () => { throw new TypeError('fetch adapter failed') },
  }), /无法连接本地保存服务/)
})

test('请求超时触发AbortController且不自动重试，不声称一定未落盘', async () => {
  let signal
  let calls = 0
  await assert.rejects(saveLocalSceneSnapshot(scene(), {
    timeoutMs: 10,
    fetch: (_url, init) => {
      signal = init.signal
      calls += 1
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    },
  }), /请求超时，无法确认是否已写入项目/)
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

test('超时也覆盖忽略abort的fetch以及卡住的响应JSON读取', async () => {
  for (const bodyStalls of [false, true]) {
    let signal
    await assert.rejects(saveLocalSceneSnapshot(scene(), {
      timeoutMs: 10,
      fetch: (_url, init) => {
        signal = init.signal
        return bodyStalls
          ? Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) })
          : new Promise(() => {})
      },
    }), /本地保存请求超时/)
    assert.equal(signal.aborted, true)
  }
})

test('成功后清理超时定时器，不会稍后把已完成请求标成abort', async () => {
  let signal
  await saveLocalSceneSnapshot(scene(), {
    timeoutMs: 10,
    fetch: async (_url, init) => { signal = init.signal; return jsonResponse(success()) },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(signal.aborted, false)
})

test('非法超时和无法序列化的输入在请求前失败', async () => {
  let calls = 0
  const fetch = async () => { calls += 1; return jsonResponse(success()) }
  for (const timeoutMs of [0, -1, NaN, Infinity, 2_147_483_648]) {
    await assert.rejects(saveLocalSceneSnapshot(scene(), { fetch, timeoutMs }), /超时设置无效/)
  }
  await assert.rejects(saveLocalSceneSnapshot(null, { fetch }), /无法生成保存快照/)
  assert.equal(calls, 0)
})
