import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createLocalSceneSaveService,
  isLoopbackAddress,
  LOCAL_SCENE_SAVE_MAX_BYTES,
  LOCAL_SCENE_SAVE_PATH,
  validateLocalSceneSnapshot,
} from '../dev/localSceneSave.ts'

// Read-only fixture: every write below is confined to a newly-created temp root.
const fixtureBytes = await fs.readFile(new URL('../src/data/publishedScene.json', import.meta.url), 'utf8')
const fixture = JSON.parse(fixtureBytes)
const assetId = Object.keys(fixture.layout)[0]
const labelId = Object.keys(fixture.copy.assetLabels)[0]
const textId = Object.keys(fixture.textLayout)[0]
const clone = () => structuredClone(fixture)
const edited = (title = '本地保存测试') => {
  const snapshot = clone()
  snapshot.copy.brandTitle = title
  return snapshot
}

async function harness(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-local-save-test-'))
  const target = path.join(root, 'src/data/publishedScene.json')
  const backupDirectory = path.join(root, '.local-scene-backups')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, fixtureBytes, 'utf8')
  const io = options.ioFactory?.({ root, target, backupDirectory })
  const writes = []
  const service = createLocalSceneSaveService(root, {
    ...(io ? { io } : {}),
    onWritten(filename) { writes.push(filename) },
  })
  const server = http.createServer((request, response) => {
    service.middleware(request, response, () => {
      response.writeHead(404)
      response.end('not found')
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  t.after(async () => {
    service.close()
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
    const resolvedRoot = path.resolve(root)
    assert.equal(path.dirname(resolvedRoot), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolvedRoot).startsWith('studio-local-save-test-'))
    await fs.rm(resolvedRoot, { recursive: true, force: true })
  })

  function request(body = edited(), requestOptions = {}) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const headers = {
      Host: `127.0.0.1:${port}`,
      Origin: `http://127.0.0.1:${port}`,
      'X-Studio-Local-Save': '1',
      'Content-Type': 'application/json',
      ...(!requestOptions.chunked ? { 'Content-Length': String(bytes.length) } : {}),
      ...requestOptions.headers,
    }
    for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key]
    return new Promise((resolve, reject) => {
      const outgoing = http.request({
        hostname: '127.0.0.1',
        port,
        path: requestOptions.path ?? LOCAL_SCENE_SAVE_PATH,
        method: requestOptions.method ?? 'POST',
        headers,
        agent: false,
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.once('error', reject)
        response.once('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json
          try { json = JSON.parse(text) } catch { /* Non-API fallthrough is plain text. */ }
          resolve({ status: response.statusCode, headers: response.headers, text, json })
        })
      })
      outgoing.once('error', reject)
      outgoing.setTimeout(5_000, () => outgoing.destroy(new Error('Test request timed out')))
      if (requestOptions.chunked) {
        for (let offset = 0; offset < bytes.length; offset += 4096) outgoing.write(bytes.subarray(offset, offset + 4096))
        outgoing.end()
      } else outgoing.end(bytes)
    })
  }

  async function backups() {
    const names = await fs.readdir(backupDirectory).catch((error) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    return Promise.all(names.map((name) => fs.readFile(path.join(backupDirectory, name), 'utf8')))
  }

  return { root, target, backupDirectory, service, port, request, writes, backups, io }
}

function assertFailure(response, status) {
  assert.equal(response.status, status, response.text)
  assert.equal(response.json?.ok, false)
  assert.equal(typeof response.json?.error, 'string')
  assert.ok(response.json.error.length > 0)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.match(response.headers['content-type'], /^application\/json/)
  assert.equal(response.headers['access-control-allow-origin'], undefined)
}

test('local save: complete snapshot is atomically saved, backed up and read back', async (t) => {
  const h = await harness(t)
  const snapshot = edited()
  snapshot.layout[assetId].position[0] += 0.0123
  snapshot.textLayout[textId] = { x: 0.2, y: -0.3, rotation: 15, scale: 1.1 }
  snapshot.lighting = { globalIntensity: 0.8, ambientIntensity: 1.2, exposure: 1.05 }
  const response = await h.request(snapshot, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  assert.equal(response.status, 200, response.text)
  assert.deepEqual(Object.keys(response.json).sort(), ['ok', 'savedAt', 'unchanged'])
  assert.equal(response.json.ok, true)
  assert.equal(response.json.unchanged, false)
  assert.ok(Number.isFinite(Date.parse(response.json.savedAt)))
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(await fs.readFile(h.target, 'utf8')), snapshot)
  assert.deepEqual(await h.backups(), [fixtureBytes])
  assert.deepEqual(h.writes, [h.target])
  assert.deepEqual(await fs.readdir(path.dirname(h.target)), ['publishedScene.json'])
})

test('local save: semantic no-op preserves original bytes, mtime and backup count', async (t) => {
  const h = await harness(t)
  await fs.utimes(h.target, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'))
  const before = await fs.stat(h.target)
  const reordered = Object.fromEntries(Object.entries(clone()).reverse())
  const response = await h.request(JSON.stringify(reordered))
  assert.equal(response.status, 200, response.text)
  assert.equal(response.json.unchanged, true)
  assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
  assert.equal((await fs.stat(h.target)).mtimeMs, before.mtimeMs)
  assert.deepEqual(await h.backups(), [])
  assert.deepEqual(h.writes, [])
})

test('local save: loopback address classifier rejects public, malformed and hostname addresses', () => {
  for (const address of ['127.0.0.1', '127.5.6.7', '::1', '::ffff:127.0.0.1', '::FFFF:127.0.0.1']) {
    assert.equal(isLoopbackAddress(address), true, address)
  }
  for (const address of [undefined, '', 'localhost', '127.0.0.999', '127.1', '192.168.1.5', '8.8.8.8', '::', '::ffff:192.168.1.5']) {
    assert.equal(isLoopbackAddress(address), false, String(address))
  }
})

test('local save: same-origin, method, content and fixed-route request guards', async (t) => {
  const h = await harness(t)
  const cases = [
    ['method', { method: 'GET' }, 405],
    ['preflight', { method: 'OPTIONS' }, 405],
    ['missing marker', { headers: { 'X-Studio-Local-Save': undefined } }, 403],
    ['wrong marker', { headers: { 'X-Studio-Local-Save': 'true' } }, 403],
    ['missing origin', { headers: { Origin: undefined } }, 403],
    ['null origin', { headers: { Origin: 'null' } }, 403],
    ['cross origin', { headers: { Origin: 'https://example.com' } }, 403],
    ['origin path', { headers: { Origin: `http://127.0.0.1:${h.port}/path` } }, 403],
    ['wrong origin port', { headers: { Origin: `http://127.0.0.1:${h.port + 1}` } }, 403],
    ['untrusted host', { headers: { Host: `example.com:${h.port}`, Origin: `http://example.com:${h.port}` } }, 403],
    ['wrong host port', { headers: { Host: `127.0.0.1:${h.port + 1}`, Origin: `http://127.0.0.1:${h.port + 1}` } }, 403],
    ['host credentials', { headers: { Host: `evil@127.0.0.1:${h.port}`, Origin: `http://127.0.0.1:${h.port}` } }, 403],
    ['host path', { headers: { Host: `127.0.0.1:${h.port}/x`, Origin: `http://127.0.0.1:${h.port}` } }, 403],
    ['cross-site metadata', { headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    ['missing media type', { headers: { 'Content-Type': undefined } }, 415],
    ['form media type', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 415],
    ['wrong charset', { headers: { 'Content-Type': 'application/json; charset=latin1' } }, 415],
    ['compressed body', { headers: { 'Content-Encoding': 'gzip' } }, 415],
    ['path query', { path: `${LOCAL_SCENE_SAVE_PATH}?path=../../other.json` }, 400],
  ]
  for (const [name, options, status] of cases) await t.test(name, async () => {
    const response = await h.request(edited(), options)
    assertFailure(response, status)
    if (status === 405) assert.equal(response.headers.allow, 'POST')
  })
  const unrelated = await h.request(edited(), { path: '/other-route' })
  assert.equal(unrelated.status, 404)
  assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
  assert.deepEqual(await h.backups(), [])
})

test('local save: malformed JSON, invalid UTF-8 and 256 KiB byte limit are rejected', async (t) => {
  const h = await harness(t)
  for (const body of ['', '{', '{"layout":', Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])]) {
    assertFailure(await h.request(body), 400)
  }
  const multibyte = JSON.stringify({ oversized: '字'.repeat(90_000) })
  assert.ok(multibyte.length < LOCAL_SCENE_SAVE_MAX_BYTES)
  assert.ok(Buffer.byteLength(multibyte) > LOCAL_SCENE_SAVE_MAX_BYTES)
  assertFailure(await h.request(multibyte), 413)
  assertFailure(await h.request(multibyte, { chunked: true }), 413)
  const valid = JSON.stringify(fixture)
  const exactLimit = valid + ' '.repeat(LOCAL_SCENE_SAVE_MAX_BYTES - Buffer.byteLength(valid))
  assert.equal(Buffer.byteLength(exactLimit), LOCAL_SCENE_SAVE_MAX_BYTES)
  const accepted = await h.request(exactLimit, { chunked: true })
  assert.equal(accepted.status, 200, accepted.text)
  assert.equal(accepted.json.unchanged, true)
  assertFailure(await h.request(`${exactLimit} `, { chunked: true }), 413)
  assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
  assert.deepEqual(await h.backups(), [])
})

const invalidMutations = [
  ['schema version', (s) => { s.schemaVersion = 2 }],
  ...['schemaVersion', 'layout', 'copy', 'textLayout', 'lighting'].map((key) => [`missing ${key}`, (s) => { delete s[key] }]),
  ['unknown root', (s) => { s.privateToken = 'must-not-persist' }],
  ['unknown layout id', (s) => { s.layout.unknown = structuredClone(s.layout[assetId]) }],
  ['missing layout id', (s) => { delete s.layout[assetId] }],
  ['missing scale', (s) => { delete s.layout[assetId].scale }],
  ['unknown transform field', (s) => { s.layout[assetId].secret = true }],
  ['position string', (s) => { s.layout[assetId].position[0] = '0' }],
  ['position infinity', (s) => { s.layout[assetId].position[0] = Infinity }],
  ['position extra component', (s) => { s.layout[assetId].position.push(0) }],
  ['rotation null', (s) => { s.layout[assetId].rotation = null }],
  ['scale zero', (s) => { s.layout[assetId].scale[0] = 0 }],
  ['scale under clamp', (s) => { s.layout[assetId].scale[0] = 0.34 }],
  ['scale over clamp', (s) => { s.layout[assetId].scale[0] = 2.01 }],
  ['missing copy field', (s) => { delete s.copy.brandTitle }],
  ['unknown copy field', (s) => { s.copy.extra = 'unknown' }],
  ['copy non-string', (s) => { s.copy.brandTitle = 12 }],
  ['copy over length', (s) => { s.copy.brandTitle = '字'.repeat(41) }],
  ['unknown asset label', (s) => { s.copy.assetLabels.extra = 'unknown' }],
  ['missing asset label', (s) => { delete s.copy.assetLabels[labelId] }],
  ['asset label over length', (s) => { s.copy.assetLabels[labelId] = '字'.repeat(49) }],
  ['missing text layer', (s) => { delete s.textLayout[textId] }],
  ['unknown text layer', (s) => { s.textLayout.extra = structuredClone(s.textLayout[textId]) }],
  ['missing text transform', (s) => { delete s.textLayout[textId].x }],
  ['unknown text field', (s) => { s.textLayout[textId].extra = 0 }],
  ['text non-number', (s) => { s.textLayout[textId].x = '0' }],
  ['text x clamp', (s) => { s.textLayout[textId].x = 1.01 }],
  ['text y clamp', (s) => { s.textLayout[textId].y = -1.01 }],
  ['text rotation clamp', (s) => { s.textLayout[textId].rotation = 180.1 }],
  ['text scale clamp', (s) => { s.textLayout[textId].scale = 0.34 }],
  ['missing lighting', (s) => { delete s.lighting.exposure }],
  ['unknown lighting field', (s) => { s.lighting.extra = 0 }],
  ['lighting non-number', (s) => { s.lighting.globalIntensity = '1' }],
  ['lighting global clamp', (s) => { s.lighting.globalIntensity = 2.01 }],
  ['lighting ambient clamp', (s) => { s.lighting.ambientIntensity = -0.01 }],
  ['lighting exposure clamp', (s) => { s.lighting.exposure = 0.34 }],
  ['lighting precision crop', (s) => { s.lighting.exposure = 1.081 }],
]

test('local save: incomplete, unknown, invalid and normalized-away fields are rejected across the schema', async (t) => {
  const h = await harness(t)
  for (const [name, mutate] of invalidMutations) await t.test(name, async () => {
    const snapshot = clone()
    mutate(snapshot)
    assert.throws(() => validateLocalSceneSnapshot(snapshot, fixture))
    assertFailure(await h.request(snapshot), 400)
  })
  for (const invalidRoot of [null, [], 'snapshot', 42]) assertFailure(await h.request(invalidRoot), 400)
  const poisoned = JSON.parse(JSON.stringify(fixture).replace('{', '{"__proto__":{"polluted":true},'))
  assertFailure(await h.request(poisoned), 400)
  assert.equal({}.polluted, undefined)
  assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
  assert.deepEqual(await h.backups(), [])
})

test('local save: malformed disk defaults cannot validate themselves or be silently repaired', async (t) => {
  const cases = [
    ['overlong disk title', (s) => { s.copy.brandTitle = 'x'.repeat(41) }],
    ['overlong disk label', (s) => { s.copy.assetLabels[labelId] = 'x'.repeat(49) }],
    ['negative disk scale', (s) => { s.layout[assetId].scale[0] = -1 }],
    ['non-numeric disk position', (s) => { s.layout[assetId].position[0] = 'bad' }],
    ['missing disk copy', (s) => { delete s.copy.brandTitle }],
    ['unknown disk field', (s) => { s.unknown = true }],
  ]
  for (const [name, mutate] of cases) await t.test(name, async (subtest) => {
    const h = await harness(subtest)
    const malformed = clone()
    mutate(malformed)
    const original = JSON.stringify(malformed)
    await fs.writeFile(h.target, original, 'utf8')
    assertFailure(await h.request(edited()), 500)
    assert.equal(await fs.readFile(h.target, 'utf8'), original)
    assert.deepEqual(await h.backups(), [])
  })
})

test('local save: concurrent instances serialize the full backup chain for one target', async (t) => {
  let activeRenames = 0
  let maximumRenames = 0
  const h = await harness(t, { ioFactory: () => ({
    ...fs,
    async rename(...args) {
      activeRenames += 1
      maximumRenames = Math.max(maximumRenames, activeRenames)
      try {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return await fs.rename(...args)
      } finally { activeRenames -= 1 }
    },
  }) })
  const secondService = createLocalSceneSaveService(h.root, { io: h.io })
  t.after(() => secondService.close())
  const snapshots = [edited('并发一'), edited('并发二'), edited('并发三')]
  const results = await Promise.all([
    h.service.save(snapshots[0]),
    secondService.save(snapshots[1]),
    h.service.save(snapshots[2]),
  ])
  assert.ok(results.every((result) => result.ok && !result.unchanged))
  assert.equal(maximumRenames, 1)
  assert.deepEqual(JSON.parse(await fs.readFile(h.target, 'utf8')), snapshots[2])
  const backupTitles = (await h.backups()).map((text) => JSON.parse(text).copy.brandTitle).sort()
  assert.deepEqual(backupTitles, [fixture.copy.brandTitle, '并发一', '并发二'].sort())
})

test('local save: injected backup, staging, replace and read-back failures preserve bytes and allow recovery', async (t) => {
  for (const failure of ['backup-open', 'stage-open', 'rename', 'read-back', 'mismatched-read-back']) {
    await t.test(failure, async (subtest) => {
      let failed = false
      let replaced = false
      const h = await harness(subtest, { ioFactory: ({ target, backupDirectory }) => ({
        ...fs,
        async open(filename, ...args) {
          const isBackup = path.dirname(filename) === backupDirectory
          const isStage = path.basename(filename).startsWith('.publishedScene.local-save-')
          if (!failed && ((failure === 'backup-open' && isBackup) || (failure === 'stage-open' && isStage))) {
            failed = true
            throw new Error('Injected open failure')
          }
          return fs.open(filename, ...args)
        },
        async rename(from, to) {
          if (!failed && failure === 'rename' && to === target) {
            failed = true
            throw new Error('Injected rename failure')
          }
          const result = await fs.rename(from, to)
          if (to === target) replaced = true
          return result
        },
        async readFile(filename, ...args) {
          if (!failed && replaced && filename === target && (failure === 'read-back' || failure === 'mismatched-read-back')) {
            failed = true
            if (failure === 'mismatched-read-back') return 'injected mismatched read-back'
            throw new Error('Injected transient read-back failure')
          }
          return fs.readFile(filename, ...args)
        },
      }) })
      assertFailure(await h.request(edited('应该失败')), 500)
      assert.equal(failed, true)
      assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
      assert.deepEqual(h.writes, [])
      assert.deepEqual(await fs.readdir(path.dirname(h.target)), ['publishedScene.json'])
      const recovered = await h.request(edited('恢复成功'))
      assert.equal(recovered.status, 200, recovered.text)
      assert.equal(JSON.parse(await fs.readFile(h.target, 'utf8')).copy.brandTitle, '恢复成功')
      assert.deepEqual(h.writes, [h.target])
      assert.ok((await h.backups()).every((bytes) => bytes === fixtureBytes))
    })
  }
})

test('local save: external change during preparation is retained and returns conflict', async (t) => {
  let targetReads = 0
  const externalBytes = JSON.stringify(edited('外部编辑不能丢失'))
  const h = await harness(t, { ioFactory: ({ target }) => ({
    ...fs,
    async readFile(filename, ...args) {
      if (filename === target && ++targetReads === 2) await fs.writeFile(target, externalBytes, 'utf8')
      return fs.readFile(filename, ...args)
    },
  }) })
  assertFailure(await h.request(edited('不能覆盖外部编辑')), 409)
  assert.equal(await fs.readFile(h.target, 'utf8'), externalBytes)
  assert.deepEqual(await h.backups(), [fixtureBytes])
  assert.deepEqual(h.writes, [])
})

test('local save: closed service rejects saves with 503 and leaves files unchanged', async (t) => {
  const h = await harness(t)
  h.service.close()
  assertFailure(await h.request(edited()), 503)
  await assert.rejects(h.service.save(edited()))
  assert.equal(await fs.readFile(h.target, 'utf8'), fixtureBytes)
  assert.deepEqual(await h.backups(), [])
  assert.deepEqual(h.writes, [])
})
