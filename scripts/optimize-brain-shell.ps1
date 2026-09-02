$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'raw-models\alex-brain-shell\alex-open-brain-shell.glb'
$outputDirectory = Join-Path $projectRoot 'public\models\environment'
$outputPath = Join-Path $outputDirectory 'alex-open-brain-shell-optimized.glb'
$workingDirectory = Join-Path $projectRoot 'raw-models\texture-resize\alex-open-brain-shell'
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
  if ($LASTEXITCODE -ne 0) { throw 'Failed to unpack the Lux3D brain shell' }

  $env:PYTHONPATH = $pillowPath
  $resizeCode = @'
from pathlib import Path
import sys
from PIL import Image

directory = Path(sys.argv[1])
for path in directory.glob('*.png'):
    with Image.open(path) as image:
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        image.save(path, optimize=True)
'@
  python -c $resizeCode $workingDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Failed to resize brain-shell textures' }

  # Preserve the facial planes for the smooth plaster finish. The previous
  # 0.65 pass made the forehead, cheeks and mouth visibly faceted at close
  # range, while 0.90 remains comfortably within the real-time budget.
  npx gltf-transform optimize `
    (Join-Path $workingDirectory 'model.gltf') `
    $outputPath `
    --compress meshopt `
    --simplify true `
    --simplify-ratio 0.9 `
    --simplify-error 0.0008 `
    --simplify-lock-border true `
    --texture-compress false
  if ($LASTEXITCODE -ne 0) { throw 'Failed to optimize the Lux3D brain shell' }

  npx gltf-transform inspect $outputPath --format csv
  if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the optimized brain shell' }
}
finally {
  Pop-Location
}
