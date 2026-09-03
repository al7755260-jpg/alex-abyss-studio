import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGlbFetchScheduler,
  glbLoadPriority,
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
    mainSource.indexOf('installGlbFetchScheduler(') < mainSource.indexOf('createRoot('),
    'the scheduler must be installed before React mounts',
  )
})

test('首轮队列优先脑壳和主家具，同级保持顺序且最终不遗漏任何模型', async () => {
  const gates = []
  const started = []
  const scheduledFetch = createGlbFetchScheduler(async (url) => {
    started.push(url)
    const gate = deferred()
    gates.push(gate)
    await gate.promise
    return new Response(new Uint8Array([1]))
  }, { baseUrl: BASE_URL, maxConcurrent: 2 })

  const urls = [
    '/gallery/models/display-skulls/skull.glb',
    '/gallery/models/video-beyond-screen-note-optimized.glb?v=1',
    '/gallery/models/lamp-optimized.glb',
    '/gallery/models/desk-optimized.glb',
    '/gallery/models/environment/alex-mechanical-open-head-optimized.glb',
    '/gallery/models/chair-optimized.glb?v=swivel',
  ]
  const pending = urls.map((url) => scheduledFetch(url))
  await tick()
  assert.deepEqual(started, [urls[4], urls[3]])

  for (let count = 0; count < urls.length; count += 2) {
    for (const gate of gates) gate.resolve()
    await tick()
  }
  await Promise.all(pending)
  assert.deepEqual(started, [urls[4], urls[3], urls[5], urls[2], urls[0], urls[1]])
  assert.equal(new Set(started).size, urls.length)
})

test('用户打开的遗物先于排队装饰加载，但不抢占已经下载的模型', async () => {
  const gate = deferred()
  const started = []
  const scheduledFetch = createGlbFetchScheduler(async (url) => {
    started.push(url)
    if (started.length === 1) await gate.promise
    return new Response(new Uint8Array([1]))
  }, { baseUrl: BASE_URL, maxConcurrent: 1 })

  const first = scheduledFetch('/models/desk-optimized.glb')
  await tick()
  const ornament = scheduledFetch('/models/display-skulls/skull.glb')
  const relic = scheduledFetch('/models/hidden-relics/drowned-dream-core-optimized.glb')
  await tick()
  assert.deepEqual(started, ['/models/desk-optimized.glb'])
  gate.resolve()
  await Promise.all([first, ornament, relic])
  assert.deepEqual(started, [
    '/models/desk-optimized.glb',
    '/models/hidden-relics/drowned-dream-core-optimized.glb',
    '/models/display-skulls/skull.glb',
  ])
  assert.ok(glbLoadPriority('/models/ui/abyssal-artifact-parchment-optimized.glb') < 0)
})

test('逐块验证响应体后仍保留原响应、头信息和完整字节', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]))
      controller.enqueue(new Uint8Array([3, 4]))
      controller.close()
    },
  }), { headers: { 'content-type': 'model/gltf-binary', 'x-test': 'preserved' } })
  const scheduledFetch = createGlbFetchScheduler(async () => response, { baseUrl: BASE_URL })
  const verified = await scheduledFetch('/models/streamed.glb')
  assert.equal(verified, response)
  assert.equal(verified.headers.get('x-test'), 'preserved')
  assert.deepEqual([...new Uint8Array(await verified.arrayBuffer())], [1, 2, 3, 4])
})

test('响应体尚未完成时取消请求会释放槽位且不重试', async () => {
  let attempts = 0
  const scheduledFetch = createGlbFetchScheduler(async () => {
    attempts += 1
    return attempts === 1
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])) } }))
      : new Response(new Uint8Array([2]))
  }, { baseUrl: BASE_URL, maxConcurrent: 1 })
  const controller = new AbortController()
  const interrupted = scheduledFetch('/models/interrupted.glb', { signal: controller.signal })
  const queued = scheduledFetch('/models/next.glb')
  await tick()
  controller.abort()
  await assert.rejects(interrupted, { name: 'AbortError' })
  assert.deepEqual([...new Uint8Array(await (await queued).arrayBuffer())], [2])
  assert.equal(attempts, 2)
})

test('稳定资源版本保留已有查询、URL 类型和 init，且不会改写非 GLB 或跨域请求', async () => {
  const calls = []
  const scheduledFetch = createGlbFetchScheduler(async (input, init) => {
    calls.push({ input, init })
    return new Response(new Uint8Array([1]))
  }, { baseUrl: BASE_URL, assetRevision: 'webp-20260903' })
  const controller = new AbortController()
  const init = { signal: controller.signal, headers: { 'x-purpose': 'test' }, cache: 'force-cache' }
  await scheduledFetch('./models/chair.glb?v=swivel-1', init)
  const inputUrl = new URL('/models/book.glb?v=book-2', BASE_URL)
  await scheduledFetch(inputUrl)
  await scheduledFetch('/image.webp', init)
  await scheduledFetch('https://cdn.example.test/model.glb?v=untouched', init)
  const firstUrl = new URL(calls[0].input)
  assert.equal(firstUrl.pathname, '/gallery/models/chair.glb')
  assert.equal(firstUrl.searchParams.get('v'), 'swivel-1')
  assert.equal(firstUrl.searchParams.get('assetRevision'), 'webp-20260903')
  assert.equal(calls[0].init, init)
  assert.ok(calls[1].input instanceof URL)
  assert.equal(calls[1].input.searchParams.get('v'), 'book-2')
  assert.equal(calls[1].input.searchParams.get('assetRevision'), 'webp-20260903')
  assert.equal(inputUrl.searchParams.has('assetRevision'), false, 'the caller URL is not mutated')
  assert.equal(calls[2].input, '/image.webp')
  assert.equal(calls[3].input, 'https://cdn.example.test/model.glb?v=untouched')
})

test('Request 的版本改写保留头、缓存策略与取消信号，init 可继续覆盖', async () => {
  const calls = []
  const scheduledFetch = createGlbFetchScheduler(async (input, init) => {
    calls.push({ input, init })
    if (calls.length === 1) {
      return new Response(new Uint8Array([1]))
    }
    return new Promise((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true })
    })
  }, { baseUrl: BASE_URL, assetRevision: 'webp-20260903' })
  const controller = new AbortController()
  const request = new Request(new URL('./models/globe.glb?v=pbr', BASE_URL), {
    headers: { 'x-request': 'kept' },
    cache: 'force-cache',
    credentials: 'same-origin',
    signal: controller.signal,
  })
  const init = { cache: 'reload' }
  await scheduledFetch(request, init)
  const revisedRequest = calls[0].input
  assert.ok(revisedRequest instanceof Request)
  assert.equal(revisedRequest.headers.get('x-request'), 'kept')
  assert.equal(revisedRequest.cache, 'force-cache')
  assert.equal(revisedRequest.credentials, 'same-origin')
  assert.equal(new URL(revisedRequest.url).searchParams.get('v'), 'pbr')
  assert.equal(new URL(revisedRequest.url).searchParams.get('assetRevision'), 'webp-20260903')
  assert.equal(calls[0].init, init)
  assert.equal(new URL(request.url).searchParams.has('assetRevision'), false)

  const interrupted = scheduledFetch(request)
  await tick()
  controller.abort()
  await assert.rejects(interrupted, { name: 'AbortError' })
  assert.equal(calls[1].input.signal.aborted, true)
  assert.equal(calls.length, 2, 'abort must not retry the versioned Request')
})

test('同一部署重复请求使用相同版本 URL 而非时间戳', async () => {
  const requested = []
  const host = {
    location: { href: BASE_URL },
    fetch: async (input) => {
      requested.push(String(input))
      return new Response(new Uint8Array([1]))
    },
  }
  installGlbFetchScheduler({ host, assetRevision: 'webp-20260903' })
  await host.fetch('./models/head.glb')
  await host.fetch('./models/head.glb')
  assert.equal(requested[0], requested[1])
  assert.equal(new URL(requested[0]).searchParams.get('assetRevision'), 'webp-20260903')
})
