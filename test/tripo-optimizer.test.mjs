import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const optimizerFile = new URL(
  '../scripts/optimize-tripo-model.ps1',
  import.meta.url,
)

test('Tripo optimizer exposes explicit paths and a bounded 2048px texture default', async () => {
  const source = await readFile(optimizerFile, 'utf8')

  assert.match(source, /\[Parameter\(Mandatory\s*=\s*\$true\)\][\s\S]{0,100}\[string\]\$InputPath/)
  assert.match(source, /\[Parameter\(Mandatory\s*=\s*\$true\)\][\s\S]{0,100}\[string\]\$OutputPath/)
  assert.match(source, /\[ValidateRange\(256,\s*8192\)\][\s\S]{0,80}\[int\]\$TextureSize\s*=\s*2048/)
  assert.match(source, /\[System\.IO\.Path\]::IsPathRooted\(\$Path\)/)
  assert.match(source, /Join-Path\s+\$projectRoot\s+\$Path/)
})

test('Tripo optimizer validates both input and published output as non-empty GLB files', async () => {
  const source = await readFile(optimizerFile, 'utf8')

  assert.match(source, /Test-Path\s+-LiteralPath\s+\$Path\s+-PathType\s+Leaf/)
  assert.match(source, /\.Length\s+-lt\s+12/)
  assert.match(source, /\$magic\s+-cne\s+'glTF'/)
  assert.match(source, /Assert-GlbFile\s+-Path\s+\$resolvedInput/)
  assert.match(source, /Assert-GlbFile\s+-Path\s+\$temporaryOutput/)
  assert.match(source, /Assert-GlbFile\s+-Path\s+\$resolvedOutput/)
  assert.match(source, /InputPath and OutputPath must refer to different files/)
})

test('Tripo optimizer uses the project-local Windows CLI with PBR-safe Meshopt and WebP options', async () => {
  const source = await readFile(optimizerFile, 'utf8')

  assert.match(source, /node_modules\\\.bin\\gltf-transform\.cmd/)
  assert.match(source, /'--compress',\s*'meshopt'/)
  assert.match(source, /'--meshopt-level',\s*'high'/)
  assert.match(source, /'--texture-compress',\s*'webp'/)
  assert.match(source, /'--texture-size',\s*\[string\]\$TextureSize/)
  assert.match(source, /\$fallbackArguments[\s\S]*'--texture-compress',\s*'false'/)
  assert.match(source, /retrying with original textures preserved/)
  assert.match(source, /&\s+\$gltfTransform\s+@preferredArguments/)
  assert.match(source, /&\s+\$gltfTransform\s+@fallbackArguments/)
  assert.match(source, /'--palette',\s*'false'/)
  assert.match(source, /'--prune-solid-textures',\s*'false'/)

  assert.doesNotMatch(source, /--texture-compress['",\s]+ktx2/i)
  assert.doesNotMatch(source, /\b(?:toktx|basisu)\.exe\b/i)
  assert.doesNotMatch(source, /\bnpx\b/i)
})

test('Tripo optimizer stages output before replacing an existing asset', async () => {
  const source = await readFile(optimizerFile, 'utf8')

  assert.match(source, /\.tmp\.glb/)
  assert.match(
    source,
    /Move-Item\s+-LiteralPath\s+\$temporaryOutput\s+-Destination\s+\$resolvedOutput\s+-Force/,
  )
  assert.match(
    source,
    /finally\s*\{[\s\S]*Remove-Item\s+-LiteralPath\s+\$temporaryOutput\s+-Force/,
  )
})
