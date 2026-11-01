const INSTALL_MARKER = Symbol.for('cthulhu-studio.glb-fetch-scheduler')

export interface GlbFetchSchedulerOptions {
  maxConcurrent?: number
  maxRetries?: number
  baseUrl?: string
  assetRevision?: string
}

export interface GlbFetchHost {
  fetch: typeof fetch
  location?: Pick<Location, 'href'>
}

export interface InstallGlbFetchSchedulerOptions extends GlbFetchSchedulerOptions {
  host?: GlbFetchHost
}

interface QueueEntry {
  signal?: AbortSignal
  priority: number
  started: boolean
  run: () => Promise<Response>
  resolve: (response: Response) => void
  reject: (reason: unknown) => void
  queuedAbortListener?: () => void
}

const assertNonNegativeInteger = (value: number, name: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
}

const abortReason = (signal: AbortSignal) => signal.reason ?? new DOMException(
  'The operation was aborted.',
  'AbortError',
)

const withAbort = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

const requestSignal = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init && 'signal' in init) return init.signal ?? undefined
  return input instanceof Request ? input.signal : undefined
}

const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

const withAssetRevision = (
  input: RequestInfo | URL,
  baseUrl: string | undefined,
  assetRevision: string | undefined,
): RequestInfo | URL => {
  if (!assetRevision) return input

  const url = new URL(requestUrl(input), baseUrl)
  // A deploy-stable revision refreshes old heavy cached models exactly once;
  // repeat visits still reuse cache and existing animation/PBR query keys.
  // Refresh only the new texture-free distance meshes on this release.
  const revision = url.pathname.endsWith('-realtime.glb') ? assetRevision + '-geometry1' : assetRevision
  url.searchParams.set('assetRevision', revision)
  if (input instanceof Request) return new Request(url, input)
  return input instanceof URL ? url : url.href
}

const isSameOriginGlb = (
  input: RequestInfo | URL,
  baseUrl: string | undefined,
) => {
  if (!baseUrl) return false

  try {
    const base = new URL(baseUrl)
    const request = new URL(requestUrl(input), base)
    return request.origin === base.origin && /\.glb$/i.test(request.pathname)
  } catch {
    return false
  }
}

// Only queue order changes: every requested model still loads. The portrait
// and the large furniture establish the first view before tiny ornaments.
// User-opened relics can jump queued scenery, without aborting active loads.
export const glbLoadPriority = (pathname: string) => {
  const path = pathname.toLowerCase()
  if (/\/models\/(?:hidden-relics|ui)\//.test(path)) return -1
  if (/\/environment\/alex-mechanical-open-head-optimized\.glb$/.test(path)) return 0
  if (/\/(?:desk|chair|bookcase|cabinet|demonic-cthulhu-display-rack)-optimized\.glb$/.test(path)) return 1
  if (/\/(?:display-skulls|candles)\//.test(path) || /-note-optimized\.glb$/.test(path)) return 3
  return 2
}

const verifyResponseBody = async (response: Response, signal?: AbortSignal) => {
  if (response.body === null) return

  const reader = response.clone().body!.getReader()
  try {
    // Drain the verification branch chunk by chunk. arrayBuffer() here would
    // allocate an extra full-size model copy, in addition to the original
    // response buffered for GLTFLoader, across four concurrent downloads.
    while (!(await withAbort(reader.read(), signal)).done) {
      // Reading the entire body keeps interrupted transfers retryable.
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    void response.body.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

export const createGlbFetchScheduler = (
  fetchImplementation: typeof fetch,
  {
    maxConcurrent = 4,
    maxRetries = 2,
    baseUrl = globalThis.location?.href,
    assetRevision,
  }: GlbFetchSchedulerOptions = {},
): typeof fetch => {
  assertNonNegativeInteger(maxConcurrent, 'maxConcurrent')
  if (maxConcurrent === 0) {
    throw new RangeError('maxConcurrent must be greater than zero')
  }
  assertNonNegativeInteger(maxRetries, 'maxRetries')

  const queue: QueueEntry[] = []
  let activeCount = 0
  let pumpScheduled = false

  const fetchWithRetries = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const signal = requestSignal(input, init)
    const revisedInput = withAssetRevision(input, baseUrl, assetRevision)

    for (let attempt = 0; ; attempt += 1) {
      if (signal?.aborted) throw abortReason(signal)

      try {
        const response = await withAbort(
          Promise.resolve(fetchImplementation(revisedInput, init)),
          signal,
        )
        await verifyResponseBody(response, signal)
        if (signal?.aborted) throw abortReason(signal)
        return response
      } catch (error) {
        if (signal?.aborted) throw abortReason(signal)
        if (attempt >= maxRetries) throw error
      }
    }
  }

  const pump = () => {
    pumpScheduled = false
    while (activeCount < maxConcurrent && queue.length > 0) {
      const entry = queue.shift()!
      if (entry.queuedAbortListener && entry.signal) {
        entry.signal.removeEventListener('abort', entry.queuedAbortListener)
      }
      if (entry.signal?.aborted) {
        entry.reject(abortReason(entry.signal))
        continue
      }

      entry.started = true
      activeCount += 1
      entry.run().then(entry.resolve, entry.reject).finally(() => {
        activeCount -= 1
        pump()
      })
    }
  }

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!isSameOriginGlb(input, baseUrl)) {
      return fetchImplementation(input, init)
    }

    const signal = requestSignal(input, init)
    if (signal?.aborted) return Promise.reject(abortReason(signal))

    return new Promise<Response>((resolve, reject) => {
      const entry: QueueEntry = {
        signal,
        priority: glbLoadPriority(new URL(requestUrl(input), baseUrl).pathname),
        started: false,
        run: () => fetchWithRetries(input, init),
        resolve,
        reject,
      }

      if (signal) {
        entry.queuedAbortListener = () => {
          if (entry.started) return
          const index = queue.indexOf(entry)
          if (index >= 0) queue.splice(index, 1)
          reject(abortReason(signal))
        }
        signal.addEventListener('abort', entry.queuedAbortListener, { once: true })
      }

      const insertAt = queue.findIndex((queued) => queued.priority > entry.priority)
      if (insertAt < 0) queue.push(entry)
      else queue.splice(insertAt, 0, entry)

      // Batch the synchronous first React render so the first four slots are
      // selected by visual priority, not by module/component import order.
      if (!pumpScheduled) {
        pumpScheduled = true
        queueMicrotask(pump)
      }
    })
  }) as typeof fetch
}

export const installGlbFetchScheduler = ({
  host = globalThis as typeof globalThis & GlbFetchHost,
  ...schedulerOptions
}: InstallGlbFetchSchedulerOptions = {}) => {
  const currentFetch = host.fetch as typeof fetch & Record<symbol, unknown>
  if (currentFetch[INSTALL_MARKER]) return host.fetch

  const scheduledFetch = createGlbFetchScheduler(host.fetch.bind(host), {
    baseUrl: schedulerOptions.baseUrl ?? host.location?.href,
    maxConcurrent: schedulerOptions.maxConcurrent,
    maxRetries: schedulerOptions.maxRetries,
    assetRevision: schedulerOptions.assetRevision,
  }) as typeof fetch & Record<symbol, unknown>

  Object.defineProperty(scheduledFetch, INSTALL_MARKER, { value: true })
  host.fetch = scheduledFetch
  return scheduledFetch
}
