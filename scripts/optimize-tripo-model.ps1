[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputPath,

  [Parameter(Mandatory = $false)]
  [ValidateRange(256, 8192)]
  [int]$TextureSize = 2048
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$gltfTransform = Join-Path $projectRoot 'node_modules\.bin\gltf-transform.cmd'

function Resolve-ProjectPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Path))
}

function Assert-GlbFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Description does not exist: $Path"
  }

  $file = Get-Item -LiteralPath $Path
  if ($file.Length -lt 12) {
    throw "$Description is empty or too small to be a GLB file: $Path"
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $magicBytes = [byte[]]::new(4)
    $bytesRead = $stream.Read($magicBytes, 0, $magicBytes.Length)
    $magic = [System.Text.Encoding]::ASCII.GetString($magicBytes)

    if ($bytesRead -ne 4 -or $magic -cne 'glTF') {
      throw "$Description does not have a valid glTF GLB header: $Path"
    }
  }
  finally {
    $stream.Dispose()
  }
}

$resolvedInput = Resolve-ProjectPath -Path $InputPath
$resolvedOutput = Resolve-ProjectPath -Path $OutputPath

if ([string]::Equals(
    $resolvedInput,
    $resolvedOutput,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw 'InputPath and OutputPath must refer to different files.'
}

Assert-GlbFile -Path $resolvedInput -Description 'Tripo input model'

if (-not (Test-Path -LiteralPath $gltfTransform -PathType Leaf)) {
  throw "Missing local glTF Transform CLI: $gltfTransform"
}

$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

# Stage the conversion beside the final file so a failed optimization cannot
# replace an existing known-good asset.
$temporaryOutput = Join-Path $outputDirectory (
  '.{0}.{1}.tmp.glb' -f [System.IO.Path]::GetFileNameWithoutExtension($resolvedOutput), [guid]::NewGuid()
)

$baseArguments = @(
  'optimize',
  $resolvedInput,
  $temporaryOutput,
  '--compress', 'meshopt',
  '--meshopt-level', 'high',
  '--palette', 'false',
  '--prune-solid-textures', 'false',
  '--simplify', 'false'
)

$preferredArguments = @(
  $baseArguments
  '--texture-compress', 'webp'
  '--texture-size', [string]$TextureSize
)

$fallbackArguments = @(
  $baseArguments
  # Some Windows libvips builds reject legacy/unspecified texture colourspaces.
  # Preserve those source textures instead of failing an otherwise valid model.
  '--texture-compress', 'false'
)

try {
  # WebP is handled by the installed glTF Transform runtime. Avoid KTX2 here,
  # because it requires a separately installed toktx encoder on Windows.
  & $gltfTransform @preferredArguments
  if ($LASTEXITCODE -ne 0) {
    $preferredExitCode = $LASTEXITCODE
    Write-Warning (
      "WebP texture optimization failed with exit code $preferredExitCode; " +
      'retrying with original textures preserved.'
    )

    if (Test-Path -LiteralPath $temporaryOutput -PathType Leaf) {
      Remove-Item -LiteralPath $temporaryOutput -Force
    }

    & $gltfTransform @fallbackArguments
    if ($LASTEXITCODE -ne 0) {
      throw "glTF Transform fallback failed with exit code $LASTEXITCODE."
    }
  }

  Assert-GlbFile -Path $temporaryOutput -Description 'Optimized Tripo model'
  Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force
  Assert-GlbFile -Path $resolvedOutput -Description 'Published Tripo model'

  Get-Item -LiteralPath $resolvedOutput
}
finally {
  if (Test-Path -LiteralPath $temporaryOutput -PathType Leaf) {
    Remove-Item -LiteralPath $temporaryOutput -Force
  }
}
