[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicRoot = Join-Path $projectRoot 'public'
$stageRoot = Join-Path $projectRoot '.optimized-assets'
$backupRoot = Join-Path $projectRoot 'raw-models\web-optimization-backup-20260830'
$gltfTransform = Join-Path $projectRoot 'node_modules\.bin\gltf-transform.cmd'
$textureResizer = Join-Path $PSScriptRoot 'resize-gltf-textures.mjs'

$assetSpecs = @(
  @{ Path = 'models\environment\alex-mechanical-open-head-optimized.glb'; Ratio = 1.0; Error = 0.0; Texture = 2048 },
  @{ Path = 'models\desk-optimized.glb'; Ratio = 0.32; Error = 0.006; Texture = 1024 },
  @{
    Path = 'models\chair-optimized.glb'
    Source = 'raw-models\chair-swivel.glb'
    Ratio = 0.38
    Error = 0.004
    Texture = 1024
    PreserveHierarchy = $true
  },
  @{ Path = 'models\monitor-optimized.glb'; Ratio = 0.32; Error = 0.005; Texture = 1024 },
  @{ Path = 'models\computer-optimized.glb'; Ratio = 0.32; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\keyboard-optimized.glb'; Ratio = 0.20; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\bookcase-optimized.glb'; Ratio = 0.32; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\demonic-cthulhu-display-rack-optimized.glb'; Ratio = 0.32; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\cthulhu-wall-mask-optimized.glb'; Ratio = 0.40; Error = 0.004; Texture = 1024 },
  @{ Path = 'models\cabinet-optimized.glb'; Ratio = 0.30; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\lamp-optimized.glb'; Ratio = 0.35; Error = 0.005; Texture = 1024 },
  @{ Path = 'models\mechanical-cthulhu-octopus-optimized.glb'; Ratio = 0.55; Error = 0.003; Texture = 1024 },
  @{ Path = 'models\vintage-television-optimized.glb'; Ratio = 0.60; Error = 0.002; Texture = 1024 },
  @{ Path = 'models\candles\melted-five-arm-candelabra-optimized.glb'; Ratio = 0.27; Error = 0.006; Texture = 1024 },
  @{ Path = 'models\candles\blood-red-pillar-candle-optimized.glb'; Ratio = 0.055; Error = 0.01; Texture = 512 },
  @{ Path = 'models\candles\black-wax-skull-goblet-candle-optimized.glb'; Ratio = 0.12; Error = 0.008; Texture = 512 },
  @{ Path = 'models\candles\staggered-seven-candle-cluster-optimized.glb'; Ratio = 0.14; Error = 0.008; Texture = 512 },
  @{ Path = 'models\display-skulls\cyclopean-tide-grazer-skull-optimized.glb'; Ratio = 0.25; Error = 0.008; Texture = 512 },
  @{ Path = 'models\display-skulls\spiral-antler-oracle-skull-optimized.glb'; Ratio = 0.25; Error = 0.008; Texture = 512 },
  @{ Path = 'models\display-skulls\chitin-maw-brood-skull-optimized.glb'; Ratio = 0.25; Error = 0.008; Texture = 512 },
  @{ Path = 'models\display-skulls\star-devourer-leviathan-skull-optimized.glb'; Ratio = 0.25; Error = 0.008; Texture = 512 }
)

if (-not (Test-Path -LiteralPath $gltfTransform -PathType Leaf)) {
  throw "Missing glTF Transform CLI: $gltfTransform"
}
if (-not (Test-Path -LiteralPath $textureResizer -PathType Leaf)) {
  throw "Missing texture resizer: $textureResizer"
}

$results = foreach ($spec in $assetSpecs) {
  $sourcePath = Join-Path $publicRoot $spec.Path
  $stagePath = Join-Path $stageRoot $spec.Path
  $geometryPath = [System.IO.Path]::ChangeExtension($stagePath, '.geometry.glb')
  $backupPath = Join-Path $backupRoot $spec.Path

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing public asset: $sourcePath"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stagePath) | Out-Null
  if ($spec.Source) {
    $optimizationSource = Join-Path $projectRoot $spec.Source
    if (-not (Test-Path -LiteralPath $optimizationSource -PathType Leaf)) {
      throw "Missing authored source asset: $optimizationSource"
    }
  }
  else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null
    if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
      Copy-Item -LiteralPath $sourcePath -Destination $backupPath
    }
    $optimizationSource = $backupPath
  }

  $arguments = @(
    'optimize',
    $optimizationSource,
    $geometryPath,
    '--compress', 'meshopt',
    '--meshopt-level', 'high',
    '--palette', 'false',
    '--prune-solid-textures', 'false',
    '--texture-compress', 'false'
  )

  if ($spec.PreserveHierarchy) {
    $arguments += @(
      '--flatten', 'false',
      '--join', 'false'
    )
  }

  if ($spec.Ratio -lt 1) {
    $arguments += @(
      '--simplify', 'true',
      '--simplify-ratio', [string]$spec.Ratio,
      '--simplify-error', [string]$spec.Error
    )
  }
  else {
    $arguments += @('--simplify', 'false')
  }

  & $gltfTransform @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "glTF optimization failed for $($spec.Path): $LASTEXITCODE"
  }

  & node $textureResizer $geometryPath $stagePath ([string]$spec.Texture)
  if ($LASTEXITCODE -ne 0) {
    throw "Texture resize failed for $($spec.Path): $LASTEXITCODE"
  }

  $stream = [System.IO.File]::OpenRead($stagePath)
  try {
    $magicBytes = [byte[]]::new(4)
    $null = $stream.Read($magicBytes, 0, 4)
    if ([System.Text.Encoding]::ASCII.GetString($magicBytes) -cne 'glTF') {
      throw "Invalid optimized GLB: $stagePath"
    }
  }
  finally {
    $stream.Dispose()
  }

  $beforeBytes = (Get-Item -LiteralPath $sourcePath).Length
  Copy-Item -LiteralPath $stagePath -Destination $sourcePath -Force
  $afterBytes = (Get-Item -LiteralPath $sourcePath).Length

  [pscustomobject]@{
    Asset = $spec.Path
    BeforeMB = [math]::Round($beforeBytes / 1MB, 2)
    AfterMB = [math]::Round($afterBytes / 1MB, 2)
    SavedPercent = [math]::Round((1 - $afterBytes / $beforeBytes) * 100, 1)
  }
}

$results | Format-Table -AutoSize
$beforeTotal = ($results | Measure-Object -Property BeforeMB -Sum).Sum
$afterTotal = ($results | Measure-Object -Property AfterMB -Sum).Sum
Write-Host ('Processed assets: {0:N2} MB -> {1:N2} MB' -f $beforeTotal, $afterTotal)
Write-Host "Originals backed up at: $backupRoot"
