import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGlbFetchScheduler,
  installGlbFetchScheduler,
} from '../src/net/glbFetchScheduler.ts'

const BASE_URL = 'https://studio.example.test/gallery/'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('同源 GLB 最多同时读取四个，并在完成后继续队列', async () => {
  let active = 0
  let peak = 0
  const gates = []
  const fetchImplementation = async () => {
    active += 1
    peak = Math.max(peak, active)
    const gate = deferred()
    gates.push(gate)
    await gate.promise
    active -= 1
    return new Response(new Uint8Array([1, 2, 3]))
  }
  const scheduledFetch = createGlbFetchScheduler(fetchImplementation, {
    baseUrl: BASE_URL,
    maxConcurrent: 4,
  })

  const requests = Array.from(
    { length: 7 },
    (_, index) => scheduledFetch(`/models/asset-${index}.glb?version=1`),
  )
  await tick()
  assert.equal(gates.length, 4)
  assert.equal(peak, 4)

  gates[0].resolve()
  await tick()
  assert.equal(gates.length, 5)
  assert.equal(peak, 4)

  for (let index = 1; index < gates.length; index += 1) gates[index].resolve()
  await tick()
  for (let index = 5; index < gates.length; index += 1) gates[index].resolve()
  await Promise.all(requests)
  assert.equal(peak, 4)
})

test('网络失败与响应体读取失败合计重试两次', async () => {
  let attempts = 0
  const fetchImplementation = async () => {
    attempts += 1
    if (attempts === 1) throw new TypeError('network interrupted')
    if (attempts === 2) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.error(new TypeError('body interrupted'))
        },
      }))
    }
    return new Response(new Uint8Array([7, 8, 9]))
  }
  const scheduledFetch = createGlbFetchScheduler(fetchImplementation, {
    baseUrl: BASE_URL,
    maxRetries: 2,
  })

  const response = await scheduledFetch('/models/retry.glb')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8, 9])
  assert.equal(attempts, 3)
})

test('超过两次重试后保留最后一次读取错误', async () => {
  let attempts = 0
  const scheduledFetch = createGlbFetchScheduler(async () => {
    attempts += 1
    return new Response(new ReadableStream({
      start(controller) {
        controller.error(new Error(`body failure ${attempts}`))
      },
    }))
  }, {
    baseUrl: BASE_URL,
    maxRetries: 2,
  })

  await assert.rejects(
    scheduledFetch('/models/broken.glb'),
    /body failure 3/,
  )
  assert.equal(attempts, 3)
})

test('队列中和执行中的 GLB 请求都支持 AbortSignal 且不会重试', async () => {
  const firstGate = deferred()
  let calls = 0
  const fetchImplementation = (_input, init) => {
    calls += 1
    if (calls === 1) return firstGate.promise
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  }
  const scheduledFetch = createGlbFetchScheduler(fetchImplementation, {
    baseUrl: BASE_URL,
    maxConcurrent: 1,
  })

  const first = scheduledFetch('/models/first.glb')
  const queuedController = new AbortController()
  const queued = scheduledFetch('/models/queued.glb', { signal: queuedController.signal })
  queuedController.abort()
  await assert.rejects(queued, { name: 'AbortError' })
  assert.equal(calls, 1)

  firstGate.resolve(new Response(new Uint8Array([1])))
  await first

  const activeController = new AbortController()
  const active = scheduledFetch('/models/active.glb', { signal: activeController.signal })
  await tick()
  assert.equal(calls, 2)
  activeController.abort()
  await assert.rejects(active, { name: 'AbortError' })
  assert.equal(calls, 2)
})

test('非 GLB 与跨域 GLB 直接沿用原 fetch，不进入队列或重试', async () => {
  const calls = []
  const response = new Response('untouched')
  const fetchImplementation = (input, init) => {
    calls.push({ input, init })
    return Promise.resolve(response)
  }
  const scheduledFetch = createGlbFetchScheduler(fetchImplementation, {
    baseUrl: BASE_URL,
    maxConcurrent: 1,
  })
  const pngInit = { cache: 'no-store' }

  assert.equal(await scheduledFetch('/texture.png', pngInit), response)
  assert.equal(await scheduledFetch('https://cdn.example.test/model.glb'), response)
  assert.deepEqual(calls, [
    { input: '/texture.png', init: pngInit },
    { input: 'https://cdn.example.test/model.glb', init: undefined },
  ])
})

test('安装发生在 React 挂载前，且对同一 host 重复安装是幂等的', async () => {
  let calls = 0
  const host = {
    location: { href: BASE_URL },
    fetch: async () => {
      calls += 1
      return new Response(new Uint8Array([1]))
    },
  }

  const first = installGlbFetchScheduler({ host })
  const second = installGlbFetchScheduler({ host })
  assert.equal(first, second)
  assert.equal(host.fetch, first)
  await host.fetch('/models/once.glb')
  assert.equal(calls, 1)

  const mainSource = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  ))
  assert.ok(
    mainSource.indexOf('installGlbFetchScheduler()') < mainSource.indexOf('createRoot('),
    'the scheduler must be installed before React mounts',
  )
})
