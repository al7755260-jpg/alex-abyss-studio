import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createImageModel,
  createTextModel,
  DEFAULT_TRIPO_MODEL,
  downloadTripoFile,
  isGlb,
  requireTripoApiKey,
  uploadImage,
  waitForTask,
} from './tripo-client.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function usage() {
  return `用法：
  npm run tripo:generate -- --slug <slug> --text "提示词"
  npm run tripo:generate -- --slug <slug> --image-url "https://..."
  npm run tripo:generate -- --slug <slug> --image "C:\\path\\reference.png"

可选参数：
  --model <id>             默认 ${DEFAULT_TRIPO_MODEL}
  --face-limit <number>    H 系列默认 120000，P 系列默认 20000
  --negative-prompt <text>
  --model-seed <integer>
  --texture-seed <integer>
  --force                  允许覆盖同 slug 的四个生成文件
  --help
`
}

export function parseTripoGenerateArguments(args) {
  const options = {}
  const booleanFlags = new Set(['force', 'help'])

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      throw new TypeError(`未知参数：${argument}`)
    }
    const key = argument.slice(2)
    if (booleanFlags.has(key)) {
      options[key] = true
      continue
    }

    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new TypeError(`参数 --${key} 缺少值。`)
    }
    options[key] = value
    index += 1
  }

  if (options.help) return options
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.slug ?? '')) {
    throw new TypeError('--slug 只能使用 1–64 位小写字母、数字和连字符。')
  }

  const inputs = ['text', 'image-url', 'image'].filter((key) => options[key])
  if (inputs.length !== 1) {
    throw new TypeError('--text、--image-url、--image 必须且只能提供一个。')
  }

  const parseInteger = (key) => {
    if (options[key] === undefined) return undefined
    const value = Number(options[key])
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`--${key} 必须是非负整数。`)
    }
    return value
  }

  options.model = options.model ?? DEFAULT_TRIPO_MODEL
  options.faceLimit = parseInteger('face-limit') ??
    (options.model.startsWith('P') ? 20_000 : 120_000)
  options.modelSeed = parseInteger('model-seed')
  options.textureSeed = parseInteger('texture-seed')

  if (options.model.startsWith('P') && options.faceLimit > 20_000) {
    throw new RangeError('P 系列 face-limit 不能超过 20000。')
  }
  if (options['image-url']) {
    const imageUrl = new URL(options['image-url'])
    if (imageUrl.protocol !== 'https:') {
      throw new TypeError('--image-url 必须是 HTTPS 地址。')
    }
  }

  return options
}

async function ensureWritableTarget(targetDirectory, force) {
  const existing = await readdir(targetDirectory).catch(() => [])
  const protectedNames = new Set(['source.glb', 'preview.png', 'task.json', 'manifest.json'])
  if (!force && existing.some((name) => protectedNames.has(name))) {
    throw new Error(`目标 ${targetDirectory} 已有生成结果；请换 slug，或明确传入 --force。`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function atomicWrite(filePath, data) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporaryPath, data)
  await rename(temporaryPath, filePath)
}

export async function generateTripoAsset(options, {
  apiKey = requireTripoApiKey(),
  log = console.log,
} = {}) {
  const targetDirectory = join(projectRoot, 'raw-models', 'tripo', options.slug)
  await ensureWritableTarget(targetDirectory, options.force === true)

  let sourceType
  let sourceValue
  let taskCreated

  if (options.text) {
    sourceType = 'text'
    sourceValue = options.text
    taskCreated = await createTextModel({
      apiKey,
      faceLimit: options.faceLimit,
      model: options.model,
      modelSeed: options.modelSeed,
      negativePrompt: options['negative-prompt'],
      prompt: options.text,
      textureSeed: options.textureSeed,
    })
  } else {
    sourceType = options.image ? 'image-file' : 'image-url'
    if (options.image) {
      const imagePath = isAbsolute(options.image)
        ? options.image
        : resolve(projectRoot, options.image)
      log(`正在上传参考图：${imagePath}`)
      const uploaded = await uploadImage(imagePath, { apiKey })
      sourceValue = imagePath
      taskCreated = await createImageModel({
        apiKey,
        faceLimit: options.faceLimit,
        input: uploaded.file_token,
        model: options.model,
        modelSeed: options.modelSeed,
        textureSeed: options.textureSeed,
      })
    } else {
      sourceValue = options['image-url']
      taskCreated = await createImageModel({
        apiKey,
        faceLimit: options.faceLimit,
        input: sourceValue,
        model: options.model,
        modelSeed: options.modelSeed,
        textureSeed: options.textureSeed,
      })
    }
  }

  const taskId = taskCreated.task_id
  if (!taskId) throw new Error('Tripo 创建任务后未返回 task_id。')
  log(`Tripo 任务已创建：${taskId}`)

  const task = await waitForTask(taskId, {
    apiKey,
    onProgress: ({ progress = 0, status = 'queued' }) => {
      log(`生成进度：${progress}%（${status}）`)
    },
  })
  const modelUrl = task.output?.model_url
  if (!modelUrl) throw new Error('Tripo 任务成功，但没有返回 output.model_url。')

  log('任务完成，正在短效链接过期前下载 GLB…')
  const modelBytes = await downloadTripoFile(modelUrl)
  if (!isGlb(modelBytes)) {
    throw new Error('Tripo 下载结果不是有效的 GLB 文件。')
  }

  const previewUrl = task.output?.rendered_image_url
  const previewBytes = previewUrl
    ? await downloadTripoFile(previewUrl, { maximumBytes: 30 * 1024 * 1024 })
    : null

  const generatedAt = new Date().toISOString()
  const manifest = {
    schemaVersion: 1,
    provider: 'tripo',
    apiVersion: 'v3',
    model: options.model,
    taskId,
    sourceType,
    source: sourceValue,
    prompt: options.text ?? null,
    negativePrompt: options['negative-prompt'] ?? null,
    faceLimit: options.faceLimit,
    modelSeed: options.modelSeed ?? null,
    textureSeed: options.textureSeed ?? null,
    texture: true,
    pbr: true,
    textureQuality: 'detailed',
    geometryQuality: options.model.startsWith('P') ? null : 'detailed',
    creditsConsumed: task.credits_consumed ?? null,
    generatedAt,
    files: {
      model: {
        path: 'source.glb',
        bytes: modelBytes.byteLength,
        sha256: sha256(modelBytes),
      },
      preview: previewBytes ? {
        path: 'preview.png',
        bytes: previewBytes.byteLength,
        sha256: sha256(previewBytes),
      } : null,
    },
  }

  await mkdir(targetDirectory, { recursive: true })
  await atomicWrite(join(targetDirectory, 'source.glb'), modelBytes)
  if (previewBytes) {
    await atomicWrite(join(targetDirectory, 'preview.png'), previewBytes)
  }
  await atomicWrite(
    join(targetDirectory, 'task.json'),
    `${JSON.stringify(task, null, 2)}\n`,
  )
  await atomicWrite(
    join(targetDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  log(`Tripo 原始资产已保存：${targetDirectory}`)
  return { manifest, targetDirectory }
}

async function main() {
  let options
  try {
    options = parseTripoGenerateArguments(process.argv.slice(2))
    if (options.help) {
      console.log(usage())
      return
    }
    await generateTripoAsset(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('\n' + usage())
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
