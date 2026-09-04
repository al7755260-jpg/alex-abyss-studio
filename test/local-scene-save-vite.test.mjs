import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { localSceneSavePlugin, LOCAL_SCENE_SAVE_PATH } from '../dev/localSceneSave.ts'

const fixture = JSON.parse(await readFile(new URL('../src/data/publishedScene.json', import.meta.url), 'utf8'))

async function waitFor(predicate, description) {
  const until = Date.now() + 8000
  while (!predicate()) {
    assert.ok(Date.now() < until, `Timed out: ${description}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

test('独立 Vite 服务：自写不发 HMR、刷新读新 JSON、外部编辑照常 HMR、重启后仍可保存', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-local-save-vite-'))
  const filename = path.join(root, 'src/data/publishedScene.json')
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, JSON.stringify(fixture, null, 2) + '\n')
  await writeFile(path.join(root, 'src/main.js'), "import scene from './data/publishedScene.json'; window.scene = scene;\n")
  await writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.js"></script>')
  const observations = []
  const sent = []
  const server = await createServer({
    configFile: false,
    root,
    cacheDir: path.join(root, '.vite'),
    logLevel: 'silent',
    plugins: [localSceneSavePlugin(), {
      name: 'test-observe-file-events',
      async hotUpdate(context) {
        if (path.resolve(context.file) === filename && context.type !== 'delete') {
          observations.push({ environment: this.environment.name, type: context.type, modules: context.modules.length, content: await context.read() })
        }
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  })
  t.after(async () => {
    await server.close()
    const resolvedRoot = path.resolve(root)
    assert.equal(path.dirname(resolvedRoot), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolvedRoot).startsWith('studio-local-save-vite-'))
    await rm(resolvedRoot, { recursive: true, force: true })
  })
  await server.listen()

  function baseURL() {
    const address = server.httpServer.address()
    assert.ok(address && typeof address !== 'string')
    return `http://127.0.0.1:${address.port}`
  }
  function observeMessages() {
    for (const environment of Object.values(server.environments)) {
      const originalSend = environment.hot.send.bind(environment.hot)
      environment.hot.send = (...args) => {
        sent.push(args[0])
        return originalSend(...args)
      }
    }
  }
  async function loadModules() {
    assert.equal((await fetch(`${baseURL()}/src/main.js`)).status, 200)
    const response = await fetch(`${baseURL()}/src/data/publishedScene.json?import`)
    assert.equal(response.status, 200)
    return response.text()
  }
  async function post(snapshot) {
    const response = await fetch(`${baseURL()}${LOCAL_SCENE_SAVE_PATH}`, {
      method: 'POST',
      headers: { Origin: baseURL(), 'Content-Type': 'application/json', 'X-Studio-Local-Save': '1' },
      body: JSON.stringify(snapshot),
    })
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }

  observeMessages()
  await loadModules()
  const edited = structuredClone(fixture)
  edited.copy.brandTitle = '本地保存热更新验证'
  const saved = await post(edited)
  assert.deepEqual(Object.keys(saved), ['ok', 'savedAt', 'unchanged'])
  assert.equal(saved.unchanged, false)
  await waitFor(() => observations.some(item => JSON.parse(item.content).copy.brandTitle === edited.copy.brandTitle), 'self-write watcher event')
  assert.equal(sent.filter(item => item?.type === 'update' || item?.type === 'full-reload').length, 0)
  assert.match(await loadModules(), /本地保存热更新验证/)
  const [backupName] = await readdir(path.join(root, '.local-scene-backups'))
  const backupAttempt = await fetch(`${baseURL()}/.local-scene-backups/${backupName}`)
  assert.equal(backupAttempt.status, 403)
  // Chokidar coalesces rapid Windows rename/change notifications; let its atomic
  // replacement window finish before simulating an independent editor action.
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(sent.filter(item => item?.type === 'update' || item?.type === 'full-reload').length, 0, `self-save must remain HMR-silent after watcher settles: ${JSON.stringify({ sent, observations: observations.map(({ content, ...event }) => ({ ...event, title: JSON.parse(content).copy.brandTitle })) })}`)

  const external = structuredClone(edited)
  external.copy.brandTitle = '外部编辑正常热更新'
  sent.length = 0
  await writeFile(filename, JSON.stringify(external, null, 2) + '\n')
  await waitFor(() => observations.some(item => JSON.parse(item.content).copy.brandTitle === external.copy.brandTitle), 'external watcher event')
  await waitFor(() => sent.some(item => item?.type === 'update' || item?.type === 'full-reload'), 'external HMR')
  assert.ok((await loadModules()).includes(external.copy.brandTitle), 'external edit must invalidate transformed JSON')

  await server.restart()
  observeMessages()
  await loadModules()
  sent.length = 0
  edited.copy.brandTitle = '服务器重启后再次保存'
  const restarted = await post(edited)
  assert.equal(restarted.unchanged, false)
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), edited)
  assert.match(await loadModules(), /服务器重启后再次保存/)
  await waitFor(() => observations.some(item => JSON.parse(item.content).copy.brandTitle === edited.copy.brandTitle), 'restarted self-write event')
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(sent.filter(item => item?.type === 'update' || item?.type === 'full-reload').length, 0, 'restarted service must also suppress delayed self-write HMR')

  const rapidSnapshots = Array.from({ length: 4 }, (_, index) => {
    const snapshot = structuredClone(edited)
    snapshot.copy.brandTitle = `连续保存验证${index + 1}`
    return snapshot
  })
  await Promise.all(rapidSnapshots.map(post))
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(sent.filter(item => item?.type === 'update' || item?.type === 'full-reload').length, 0, 'serialized rapid saves must remain HMR-silent')
  const latest = JSON.parse(await readFile(filename, 'utf8'))
  assert.ok(rapidSnapshots.some(snapshot => snapshot.copy.brandTitle === latest.copy.brandTitle))
  assert.ok((await loadModules()).includes(latest.copy.brandTitle), 'reload must read the last serialized save')
})

test('本地保存插件只启用 serve，不进入 build/preview 路由', () => {
  const plugin = localSceneSavePlugin()
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.configurePreviewServer, undefined)
})
