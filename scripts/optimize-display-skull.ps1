param(
  [Parameter(Mandatory = $true)]
  [string]$Key
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "raw-models\monster-skulls\$Key.glb"
$outputDirectory = Join-Path $projectRoot 'public\models\display-skulls'
$outputPath = Join-Path $outputDirectory "$Key-optimized.glb"
$workingDirectory = Join-Path $projectRoot "raw-models\texture-resize\display-skulls\$Key"
$pillowPath = Join-Path $projectRoot 'raw-models\tools\pillow'

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Missing Lux3D monster skull: $sourcePath"
}
if (-not (Test-Path -LiteralPath $pillowPath -PathType Container)) {
  throw "Missing local Pillow runtime: $pillowPath"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $workingDirectory | Out-Null

Push-Location $projectRoot
try {
  npx gltf-transform copy $sourcePath (Join-Path $workingDirectory 'model.gltf')
  if ($LASTEXITCODE -ne 0) { throw "Failed to unpack $Key" }

  $env:PYTHONPATH = $pillowPath
  $resizeCode = @'
from pathlib import Path
import sys
from PIL import Image

directory = Path(sys.argv[1])
for path in directory.glob('*.png'):
    with Image.open(path) as image:
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        image.save(path, optimize=True)
'@
  python -c $resizeCode $workingDirectory
  if ($LASTEXITCODE -ne 0) { throw "Failed to resize textures for $Key" }

  npx gltf-transform optimize `
    (Join-Path $workingDirectory 'model.gltf') `
    $outputPath `
    --compress meshopt `
    --simplify true `
    --simplify-ratio 0.14 `
    --simplify-error 0.004 `
    --simplify-lock-border true `
    --texture-compress false
  if ($LASTEXITCODE -ne 0) { throw "Failed to optimize $Key" }

  npx gltf-transform inspect $outputPath --format csv
  if ($LASTEXITCODE -ne 0) { throw "Failed to inspect $Key" }
}
finally {
  Pop-Location
}
