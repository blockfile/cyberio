# scripts/sliceRoom.ps1
# Cuts the cyberpunk "Gaming Room Interiors" megapack sheets into individual
# PNGs in public/room/ using System.Drawing (no npm install needed).
# Run:  powershell -ExecutionPolicy Bypass -File scripts/sliceRoom.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$SRC  = Join-Path $root "src\components\sprite\cyberpunk"
$OUT  = Join-Path $root "public\room"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# shared grid: 9 columns
$COLS    = 9
$PITCH_X = 1536.0 / $COLS    # 170.67
$TILE    = 140
$MARGIN  = [int](($PITCH_X - $TILE) / 2)

function Slice-Sheet {
  param($File, $Prefix, $Cols, $PitchX, $CellW, $Y0, $PitchY, $Rows, $CellH)

  $marg = [int](($PitchX - $CellW) / 2)
  $img = [System.Drawing.Bitmap]::FromFile((Join-Path $SRC $File))
  $n = 0
  for ($r = 0; $r -lt $Rows; $r++) {
    for ($c = 0; $c -lt $Cols; $c++) {
      $sx = [int]($c * $PitchX) + $marg
      $sy = $Y0 + $r * $PitchY
      $w = $CellW
      $h = $CellH
      if (($sx + $w) -gt $img.Width) { $w = $img.Width - $sx }
      if (($sy + $h) -gt $img.Height) { $h = $img.Height - $sy }
      if ($w -lt 20 -or $h -lt 20) { continue }

      $rect = New-Object System.Drawing.Rectangle $sx, $sy, $w, $h
      $crop = $img.Clone($rect, $img.PixelFormat)

      # skip near-empty crops (sample brightness)
      $lit = 0
      for ($yy = 4; $yy -lt $h; $yy += 12) {
        for ($xx = 4; $xx -lt $w; $xx += 12) {
          $p = $crop.GetPixel($xx, $yy)
          if (($p.R + $p.G + $p.B) -gt 130) { $lit++ }
        }
      }
      if ($lit -lt 6) { $crop.Dispose(); continue }

      $crop.Save((Join-Path $OUT ("{0}_{1}.png" -f $Prefix, $n)), [System.Drawing.Imaging.ImageFormat]::Png)
      $crop.Dispose()
      $n++
    }
  }
  $img.Dispose()
  Write-Host ("{0} -> {1} {2} tiles" -f $File, $n, $Prefix)
}

# floors + walls (square tiles): 9 cols pitch 170.67 cell 140; 5 rows pitch 160
Slice-Sheet "1. Floor tiles.png" "floor" 9 $PITCH_X 140 212 160 5 140
Slice-Sheet "2. Wall tiles.png"  "wall"  9 $PITCH_X 140 212 160 5 140

# furniture / props: 6 cols pitch 256 cell 240; 3 rows y0 200 pitch 290 cell 250
$furn = @(
  @("3. Gaming desk setups.png", "desk"),
  @("12. Sofas and lounge.png",  "sofa"),
  @("17. Plants and greenery.png","plant"),
  @("11. Neon signs.png",        "sign"),
  @("4. Rgb pc towers.png",      "pc"),
  @("6. Gaming chairs.png",      "chair"),
  @("16. Rugs and carpets.png",  "rug")
)
foreach ($f in $furn) {
  Slice-Sheet $f[0] $f[1] 6 256 240 200 290 3 250
}

Write-Host "Done. Output in public/room/"
