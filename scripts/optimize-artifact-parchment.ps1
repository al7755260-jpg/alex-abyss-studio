$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'raw-models\artifact-parchment\abyssal-artifact-parchment.glb'
$outputDirectory = Join-Path $projectRoot 'public\models\ui'
$outputPath = Join-Path $outputDirectory 'abyssal-artifact-parchment-optimized.glb'
$workingDirectory = Join-Path $projectRoot 'raw-models\texture-resize\abyssal-artifact-parchment'
$pillowPath = Join-Path $projectRoot 'raw-models\tools\pillow'

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Missing Lux3D source model: $sourcePath"
}
if (-not (Test-Path -LiteralPath $pillowPath -PathType Container)) {
  throw "Missing local Pillow runtime: $pillowPath"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $workingDirectory | Out-Null

Push-Location $projectRoot
try {
  npx gltf-transform copy $sourcePath (Join-Path $workingDirectory 'model.gltf')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to unpack the Lux3D parchment' }

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
  if ($LASTEXITCODE -ne 0) { throw 'Failed to resize parchment textures' }

  npx gltf-transform optimize `
    (Join-Path $workingDirectory 'model.gltf') `
    $outputPath `
    --compress meshopt `
    --simplify true `
    --simplify-ratio 0.18 `
    --simplify-error 0.006 `
    --texture-compress false
  if ($LASTEXITCODE -ne 0) { throw 'Failed to optimize the Lux3D parchment' }

  npx gltf-transform inspect $outputPath --format csv
  if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the optimized parchment' }
}
finally {
  Pop-Location
}
