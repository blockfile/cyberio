# scripts/sliceCity.ps1
# Extract individual sprites from the "Cyberpunk Pixel Art Asset Pack" sheets
# using CONNECTED-COMPONENT detection on the alpha channel (no grid guessing).
#
# Each sheet is 1536x1024, transparent background, a title banner on top, then
# sprites packed with thin transparent gaps. We:
#   1) build an alpha mask (below the banner)
#   2) label connected regions (8-neighbour) via iterative flood fill
#   3) crop each region's bounding box and save it
#   4) merge tiny specks into nearest big region by ignoring sub-min sprites
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts/sliceCity.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$SRC  = Join-Path $root "src\components\sprite\cyber"
$OUT  = Join-Path $root "public\city"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

function Extract-Sprites {
  param($File, $Prefix, $BannerY = 96, $MinW = 22, $MinH = 22, $AlphaT = 30)

  $full = Join-Path $SRC $File
  if (-not (Test-Path $full)) { Write-Host "MISSING: $File"; return }
  $bmp = [System.Drawing.Bitmap]::FromFile($full)
  $W = $bmp.Width; $H = $bmp.Height

  # Lock bits for fast pixel access (ARGB, 4 bytes/px).
  $rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $H)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)

  # alpha mask: 1 where opaque and below banner
  $mask = New-Object byte[] ($W * $H)
  for ($y = $BannerY; $y -lt $H; $y++) {
    $rowOff = $y * $stride
    $mOff = $y * $W
    for ($x = 0; $x -lt $W; $x++) {
      $a = $bytes[$rowOff + $x * 4 + 3]
      if ($a -gt $AlphaT) { $mask[$mOff + $x] = 1 }
    }
  }

  # connected-component labelling via stack flood fill
  $visited = New-Object byte[] ($W * $H)
  $stack = New-Object System.Collections.Generic.Stack[int]
  $n = 0
  for ($y = $BannerY; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
      $idx = $y * $W + $x
      if ($mask[$idx] -eq 1 -and $visited[$idx] -eq 0) {
        # flood
        $minX = $x; $maxX = $x; $minY = $y; $maxY = $y
        $stack.Clear(); $stack.Push($idx); $visited[$idx] = 1
        while ($stack.Count -gt 0) {
          $cur = $stack.Pop()
          $cy = [int]([math]::Floor($cur / $W)); $cx = $cur - $cy * $W
          if ($cx -lt $minX) { $minX = $cx }; if ($cx -gt $maxX) { $maxX = $cx }
          if ($cy -lt $minY) { $minY = $cy }; if ($cy -gt $maxY) { $maxY = $cy }
          # 8-neighbours
          for ($dy = -1; $dy -le 1; $dy++) {
            $ny = $cy + $dy; if ($ny -lt $BannerY -or $ny -ge $H) { continue }
            for ($dx = -1; $dx -le 1; $dx++) {
              $nx = $cx + $dx; if ($nx -lt 0 -or $nx -ge $W) { continue }
              $nidx = $ny * $W + $nx
              if ($mask[$nidx] -eq 1 -and $visited[$nidx] -eq 0) {
                $visited[$nidx] = 1; $stack.Push($nidx)
              }
            }
          }
        }
        $bw = $maxX - $minX + 1; $bh = $maxY - $minY + 1
        if ($bw -ge $MinW -and $bh -ge $MinH) {
          $crect = New-Object System.Drawing.Rectangle $minX, $minY, $bw, $bh
          $crop = $bmp.Clone($crect, $bmp.PixelFormat)
          $crop.Save((Join-Path $OUT ("{0}_{1}.png" -f $Prefix, $n)), [System.Drawing.Imaging.ImageFormat]::Png)
          $crop.Dispose()
          $n++
        }
      }
    }
  }
  $bmp.Dispose()
  Write-Host ("{0} -> {1} {2}" -f $File, $n, $Prefix)
}

Extract-Sprites "Floor tiles.png"               "floor"  96 60 60
Extract-Sprites "Vehicles and transports.png"   "car"    96 24 24
Extract-Sprites "Rooftop and building tops.png" "bldg"   96 70 70
Extract-Sprites "Wall tiles and edges.png"      "wall"   96 40 40
Extract-Sprites "Streets props and urban.png"   "prop"   96 18 18
Extract-Sprites "Signs and holograms.png"       "sign"   96 18 18
Extract-Sprites "Plants and greenery.png"       "plant"  96 18 18

Write-Host "Done. Output in public/city/"
