import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { Plugin, ViteDevServer } from 'vite'
import { STUDIO_ASSET_LABEL_MAX_LENGTH, STUDIO_COPY_FIELD_LIMITS } from '../src/editor/studioCopy.ts'
import { STUDIO_SCALE_MIN, STUDIO_SCALE_MAX } from '../src/editor/studioLayout.ts'
import { STUDIO_LIGHTING_LIMITS } from '../src/editor/studioLighting.ts'
import {
  STUDIO_TEXT_POSITION_MIN, STUDIO_TEXT_POSITION_MAX,
  STUDIO_TEXT_ROTATION_MIN, STUDIO_TEXT_ROTATION_MAX,
  STUDIO_TEXT_SCALE_MIN, STUDIO_TEXT_SCALE_MAX,
} from '../src/editor/studioTextLayout.ts'
import {
  resolveSceneSnapshot,
  type StudioSceneSnapshot,
} from '../src/editor/studioSceneSnapshot.ts'

export const LOCAL_SCENE_SAVE_PATH = '/__studio/local-scene'
export const LOCAL_SCENE_SAVE_MAX_BYTES = 256 * 1024

type FileIO = Pick<typeof fs, 'readFile' | 'open' | 'rename' | 'mkdir' | 'unlink' | 'lstat'>
type SaveResult = { ok: true; savedAt: string; unchanged: boolean }
type WriteStamp = { content: string; ino: number; size: number; mtimeMs: number; expires: number }

class LocalSaveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Vite reloads its config during a restart. Keep pending writes serialized even
// across old/new plugin instances in the same process.
const queuesKey = Symbol.for('alex-abyss-studio.local-save-queues.v1')
const queues = (Reflect.get(globalThis, queuesKey) ?? new Map()) as Map<string, Promise<unknown>>
Reflect.set(globalThis, queuesKey, queues)

function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(action)
  queues.set(key, pending)
  void pending.finally(() => {
    if (queues.get(key) === pending) queues.delete(key)
  }).catch(() => undefined)
  return pending
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteIn(value: unknown, min = -Infinity, max = Infinity): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function validSnapshotValues(candidate: unknown): candidate is StudioSceneSnapshot {
  if (!isRecord(candidate) || candidate.schemaVersion !== 1 || !isRecord(candidate.layout)
    || !isRecord(candidate.copy) || !isRecord(candidate.copy.assetLabels)
    || !isRecord(candidate.textLayout) || !isRecord(candidate.lighting)) return false
  const { layout, copy, textLayout, lighting } = candidate
  if (!Object.keys(layout).length || !Object.keys(textLayout).length || !Object.keys(copy.assetLabels as object).length) return false
  for (const transform of Object.values(layout)) {
    if (!isRecord(transform)) return false
    for (const field of ['position', 'rotation', 'scale']) {
      const values = transform[field]
      if (!Array.isArray(values) || values.length !== 3 || !values.every(
        (value) => field === 'scale' ? finiteIn(value, STUDIO_SCALE_MIN, STUDIO_SCALE_MAX) : finiteIn(value),
      )) return false
    }
  }
  for (const [field, maximum] of Object.entries(STUDIO_COPY_FIELD_LIMITS)) {
    if (typeof copy[field] !== 'string' || copy[field].length > maximum) return false
  }
  if (!Object.values(copy.assetLabels as Record<string, unknown>).every(
    (value) => typeof value === 'string' && value.length <= STUDIO_ASSET_LABEL_MAX_LENGTH,
  )) return false
  for (const transform of Object.values(textLayout)) {
    if (!isRecord(transform) || !finiteIn(transform.x, STUDIO_TEXT_POSITION_MIN, STUDIO_TEXT_POSITION_MAX)
      || !finiteIn(transform.y, STUDIO_TEXT_POSITION_MIN, STUDIO_TEXT_POSITION_MAX)
      || !finiteIn(transform.rotation, STUDIO_TEXT_ROTATION_MIN, STUDIO_TEXT_ROTATION_MAX)
      || !finiteIn(transform.scale, STUDIO_TEXT_SCALE_MIN, STUDIO_TEXT_SCALE_MAX)) return false
  }
  return Object.entries(STUDIO_LIGHTING_LIMITS).every(([field, { min, max }]) => finiteIn(lighting[field], min, max))
}

/** A canonical round trip must not repair, crop, drop or fill any supplied field. */
export function validateLocalSceneSnapshot(candidate: unknown, current: StudioSceneSnapshot): StudioSceneSnapshot {
  if (!validSnapshotValues(candidate)) throw new LocalSaveError(400, '场景字段不完整或超出编辑范围，未保存。')
  let normalized: StudioSceneSnapshot
  try {
    normalized = resolveSceneSnapshot(candidate, current)
  } catch {
    throw new LocalSaveError(400, '场景格式无效，请重新导出完整场景。')
  }
  if (!isDeepStrictEqual(candidate, normalized)) {
    throw new LocalSaveError(400, '场景字段不完整、包含未知字段或超出编辑范围，未保存。')
  }
  return normalized
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isLoopbackAddress(normalized.slice(7))
  return isIP(normalized) === 4 && normalized.startsWith('127.')
}

function validateRequest(request: IncomingMessage): void {
  if (request.method !== 'POST') throw new LocalSaveError(405, '此接口只接受 POST。')
  if (!isLoopbackAddress(request.socket.remoteAddress)) throw new LocalSaveError(403, '仅允许本机保存。')
  if (request.headers['x-studio-local-save'] !== '1') throw new LocalSaveError(403, '缺少本地保存标识。')
  const host = request.headers.host
  const origin = request.headers.origin
  const protocol = (request.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:'
  let hostURL: URL
  try {
    if (!host || !origin) throw new Error('Missing origin')
    hostURL = new URL(`${protocol}//${host}`)
    const hostname = hostURL.hostname.replace(/^\[|\]$/g, '')
    const port = Number(hostURL.port || (protocol === 'https:' ? 443 : 80))
    if (hostURL.host !== host.toLowerCase() || hostURL.username || hostURL.password
      || hostURL.pathname !== '/' || hostURL.search || hostURL.hash
      || (hostname !== 'localhost' && !isLoopbackAddress(hostname))
      || port !== request.socket.localPort || origin !== hostURL.origin) throw new Error('Origin mismatch')
  } catch {
    throw new LocalSaveError(403, '保存请求必须来自当前本地站点。')
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new LocalSaveError(403, '不接受跨站保存。')
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)
    || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) {
    throw new LocalSaveError(415, '请发送 UTF-8 JSON 场景。')
  }
  const declaredLength = request.headers['content-length']
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > LOCAL_SCENE_SAVE_MAX_BYTES)) {
    throw new LocalSaveError(413, '场景数据超过 256 KiB，未保存。')
  }
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let length = 0
    let settled = false
    const chunks: Buffer[] = []
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      chunks.length = 0
      reject(error)
    }
    request.on('data', (chunk: Buffer) => {
      if (settled) return
      length += chunk.length
      if (length > LOCAL_SCENE_SAVE_MAX_BYTES) {
        fail(new LocalSaveError(413, '场景数据超过 256 KiB，未保存。'))
        return
      }
      chunks.push(chunk)
    })
    request.once('aborted', () => fail(new LocalSaveError(400, '保存请求已中断。')))
    request.once('error', () => fail(new LocalSaveError(400, '未能完整读取场景。')))
    request.once('end', () => {
      if (settled) return
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
        const candidate: unknown = JSON.parse(text)
        settled = true
        resolve(candidate)
      } catch {
        fail(new LocalSaveError(400, '场景不是有效的 UTF-8 JSON。'))
      }
    })
  })
}

function sendJSON(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  if (status === 405) response.setHeader('Allow', 'POST')
  response.end(JSON.stringify(body))
}

export function createLocalSceneSaveService(root: string, options: {
  io?: FileIO
  onWritten?: (filename: string) => void
} = {}) {
  const io = options.io ?? fs
  const target = path.resolve(root, 'src/data/publishedScene.json')
  const backupDirectory = path.resolve(root, '.local-scene-backups')
  const tempPrefix = path.join(path.dirname(target), '.publishedScene.local-save-')
  let closed = false
  let selfWrite: WriteStamp | undefined

  async function assertRegularFile(filename: string): Promise<void> {
    const stat = await io.lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new LocalSaveError(500, '场景文件不是普通本地文件，未保存。')
  }

  async function durableWrite(filename: string, text: string): Promise<void> {
    const handle = await io.open(filename, 'wx', 0o600)
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (await io.readFile(filename, 'utf8') !== text) throw new Error('Staged file verification failed')
  }

  async function armSelfWrite(filename: string, content: string): Promise<void> {
    const { ino, size, mtimeMs } = await io.lstat(filename)
    selfWrite = { content, ino, size, mtimeMs, expires: Date.now() + 30_000 }
  }

  async function replaceWith(text: string): Promise<void> {
    const temporary = `${tempPrefix}${randomUUID()}.tmp`
    try {
      await durableWrite(temporary, text)
      await armSelfWrite(temporary, text)
      await io.rename(temporary, target)
    } finally {
      await io.unlink(temporary).catch(() => undefined)
    }
  }

  async function save(candidate: unknown): Promise<SaveResult> {
    return serialize(target, async () => {
      if (closed) throw new LocalSaveError(503, '本地服务正在重启，请稍后重试。')
      await assertRegularFile(target)
      const previous = await io.readFile(target, 'utf8')
      let current: StudioSceneSnapshot
      try {
        current = JSON.parse(previous) as StudioSceneSnapshot
        validateLocalSceneSnapshot(current, current)
      } catch {
        throw new LocalSaveError(500, '项目中的场景文件无效，已停止保存以保护原文件。')
      }
      const snapshot = validateLocalSceneSnapshot(candidate, current)
      if (isDeepStrictEqual(snapshot, current)) return { ok: true, savedAt: new Date().toISOString(), unchanged: true }
      const content = `${JSON.stringify(snapshot, null, 2)}\n`
      await io.mkdir(backupDirectory, { recursive: true })
      const backupStat = await io.lstat(backupDirectory)
      if (!backupStat.isDirectory() || backupStat.isSymbolicLink()) throw new LocalSaveError(500, '备份目录无效，未保存。')
      const backupName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`
      await durableWrite(path.join(backupDirectory, backupName), previous)
      const temporary = `${tempPrefix}${randomUUID()}.tmp`
      let replaced = false
      try {
        await durableWrite(temporary, content)
        // Preserve an edit made outside this API while preparing the backup.
        await assertRegularFile(target)
        if (await io.readFile(target, 'utf8') !== previous) throw new LocalSaveError(409, '场景文件刚被其他操作修改，请刷新后重试。')
        await armSelfWrite(temporary, content)
        await io.rename(temporary, target)
        replaced = true
        if (await io.readFile(target, 'utf8') !== content) throw new Error('Saved file verification failed')
      } catch (error) {
        if (replaced) {
          // Never overwrite a newer external edit during rollback.
          const observed = await io.readFile(target, 'utf8').catch(() => undefined)
          if (observed === content) {
            await replaceWith(previous)
            if (await io.readFile(target, 'utf8') !== previous) throw new LocalSaveError(500, '保存验证失败，恢复备份未完成；请保留备份目录。')
          } else if (observed !== previous) {
            throw new LocalSaveError(500, '保存验证失败，原文件备份已保留；请检查场景文件后重试。')
          }
        }
        throw error
      } finally {
        await io.unlink(temporary).catch(() => undefined)
      }
      // Invalidate cached transforms immediately, without notifying the open UI.
      // The next manual reload must read the newly persisted JSON.
      options.onWritten?.(target)
      return { ok: true, savedAt: new Date().toISOString(), unchanged: false }
    })
  }

  return {
    target,
    save,
    close() { closed = true; selfWrite = undefined },
    async isSelfWrite(filename: string, content: string): Promise<boolean> {
      if (path.resolve(filename) !== target || !selfWrite || Date.now() > selfWrite.expires || content !== selfWrite.content) return false
      const stamp = selfWrite
      const stat = await io.lstat(target).catch(() => undefined)
      return !!stat && stat.ino === stamp.ino && stat.size === stamp.size && stat.mtimeMs === stamp.mtimeMs
    },
    middleware(request: IncomingMessage, response: ServerResponse, next: () => void): void {
      const pathname = request.url?.split('?')[0]
      if (pathname !== LOCAL_SCENE_SAVE_PATH) return next()
      void (async () => {
        try {
          if (request.url !== LOCAL_SCENE_SAVE_PATH) throw new LocalSaveError(400, '保存接口不接受查询参数或文件路径。')
          validateRequest(request)
          const result = await save(await readBody(request))
          sendJSON(response, 200, result)
        } catch (error) {
          request.resume()
          sendJSON(response, error instanceof LocalSaveError ? error.status : 500, {
            ok: false,
            error: error instanceof LocalSaveError ? error.message : '本地文件保存失败，先前场景和已有备份不会主动删除，请重试。',
          })
        }
      })()
    },
  }
}

export function localSceneSavePlugin(): Plugin {
  // configureServer receives Vite's restart-aware Proxy, while hotUpdate gets
  // its underlying server. The watcher is shared by both and unique per start.
  const services = new WeakMap<ViteDevServer['watcher'], ReturnType<typeof createLocalSceneSaveService>>()
  return {
    name: 'studio-local-scene-save',
    apply: 'serve',
    config(config) {
      const privateFiles = ['**/.local-scene-backups/**', '**/.publishedScene.local-save-*.tmp']
      return { server: {
        watch: { ignored: privateFiles },
        // Set these before Vite compiles its access matcher, retaining Vite 8's
        // default secret-file deny list when the project has no custom one.
        fs: { deny: [...(config.server?.fs?.deny ?? [
          '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        ]), ...privateFiles] },
      } }
    },
    configureServer(server) {
      services.get(server.watcher)?.close()
      const service = createLocalSceneSaveService(server.config.root, {
        onWritten(filename) {
          for (const environment of Object.values(server.environments)) {
            environment.moduleGraph.onFileChange(filename.replaceAll('\\', '/'))
          }
        },
      })
      services.set(server.watcher, service)
      server.middlewares.use(service.middleware)
      server.httpServer?.once('close', () => service.close())
    },
    async hotUpdate(context) {
      const service = services.get(context.server.watcher)
      if (context.type !== 'delete' && service && path.resolve(context.file) === service.target
        && await service.isSelfWrite(context.file, await context.read())) return []
    },
  }
}
