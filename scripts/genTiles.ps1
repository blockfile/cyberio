# scripts/genTiles.ps1
# Generates custom pixel-art tiles into public/city/ to add design to the map.
# Tiles are 32x32, dark cyberpunk palette with neon accents, no anti-aliasing
# (NearestNeighbor + pixel fills) so they blend with the asset pack.
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts/genTiles.ps1

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$OUT  = Join-Path $root "public\city"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null
$SZ = 32

function New-Tile { param([int]$w=$SZ,[int]$h=$SZ)
  $bmp = New-Object System.Drawing.Bitmap $w,$h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  return @($bmp,$g)
}
function Px { param($g,$x,$y,$col,$w=1,$h=1)
  $b = New-Object System.Drawing.SolidBrush $col
  $g.FillRectangle($b, [int]$x, [int]$y, [int]$w, [int]$h)
  $b.Dispose()
}
function RGB { param($r,$gc,$b,$a=255) [System.Drawing.Color]::FromArgb($a,$r,$gc,$b) }
function Save { param($bmp,$name) $bmp.Save((Join-Path $OUT $name), [System.Drawing.Imaging.ImageFormat]::Png) }

# deterministic rng
$script:seed = 12345
function Rnd { $script:seed = ($script:seed * 1103515245 + 12345) -band 0x7fffffff; return $script:seed / 0x7fffffff }

# ---------- PARK GRASS: dark turf with neon-teal blades ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 18 38 28) $SZ $SZ
for ($i=0;$i -lt 60;$i++){ $x=[int]((Rnd)*$SZ); $y=[int]((Rnd)*$SZ); $c= if((Rnd) -gt 0.5){RGB 30 64 44}else{RGB 22 50 36}; Px $g $x $y $c 1 1 }
for ($i=0;$i -lt 10;$i++){ $x=2+[int]((Rnd)*($SZ-4)); $y=4+[int]((Rnd)*($SZ-8)); Px $g $x $y (RGB 40 120 90) 1 3 }
for ($i=0;$i -lt 4;$i++){ $x=2+[int]((Rnd)*($SZ-4)); $y=4+[int]((Rnd)*($SZ-8)); Px $g $x $y (RGB 60 200 150) 1 2 } # neon blade
Save $bmp "gen_park.png"; $g.Dispose(); $bmp.Dispose()

# ---------- PARK PATH: dark stone path with faint cyan edge ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 34 34 40) $SZ $SZ
for ($i=0;$i -lt 40;$i++){ $x=[int]((Rnd)*$SZ); $y=[int]((Rnd)*$SZ); Px $g $x $y (RGB 44 44 52) 2 1 }
Px $g 0 0 (RGB 60 200 220 120) $SZ 1     # top glow line
Px $g 0 ($SZ-1) (RGB 60 200 220 120) $SZ 1
Save $bmp "gen_path.png"; $g.Dispose(); $bmp.Dispose()

# ---------- PLAZA: dark base with purple neon grid ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 20 12 36) $SZ $SZ
Px $g 0 ([int]($SZ/2)) (RGB 150 70 220 200) $SZ 1
Px $g ([int]($SZ/2)) 0 (RGB 150 70 220 200) 1 $SZ
Px $g ([int]($SZ/2)-1) ([int]($SZ/2)-1) (RGB 255 110 230) 2 2  # glow node
Save $bmp "gen_plaza.png"; $g.Dispose(); $bmp.Dispose()

# ---------- ROAD: asphalt with cyan dashed center lane ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 20 22 28) $SZ $SZ
for ($i=0;$i -lt 24;$i++){ $x=[int]((Rnd)*$SZ); $y=[int]((Rnd)*$SZ); $c= if((Rnd) -gt 0.5){RGB 26 28 36}else{RGB 14 16 22}; Px $g $x $y $c 1 1 }
for ($y=2;$y -lt $SZ;$y+=10){ Px $g ([int]($SZ/2)-1) $y (RGB 80 220 255) 2 5 }  # dashes
Save $bmp "gen_road.png"; $g.Dispose(); $bmp.Dispose()

# ---------- ROAD EDGE: asphalt with a yellow hazard curb on one side ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 20 22 28) $SZ $SZ
for ($i=0;$i -lt 18;$i++){ $x=[int]((Rnd)*$SZ); $y=[int]((Rnd)*$SZ); Px $g $x $y (RGB 26 28 36) 1 1 }
for ($y=0;$y -lt $SZ;$y+=6){ Px $g 0 $y (RGB 230 200 60) 3 3 }  # curb stripes
Save $bmp "gen_road_edge.png"; $g.Dispose(); $bmp.Dispose()

# ---------- CROSSWALK: white stripes on asphalt ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 20 22 28) $SZ $SZ
for ($x=2;$x -lt $SZ;$x+=8){ Px $g $x 0 (RGB 235 240 250) 4 $SZ }
Save $bmp "gen_crosswalk.png"; $g.Dispose(); $bmp.Dispose()

# ---------- NEON GROUND STRIP: glowing accent line ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
Px $g 0 0 (RGB 16 16 24) $SZ $SZ
Px $g 0 ([int]($SZ/2)-2) (RGB 0 220 255 90) $SZ 5
Px $g 0 ([int]($SZ/2)-1) (RGB 120 240 255) $SZ 2
Save $bmp "gen_neon_strip.png"; $g.Dispose(); $bmp.Dispose()

# ---------- FOUNTAIN (centerpiece, 64x64 = 2x2 tiles) ----------
$t = New-Tile 64 64; $bmp=$t[0]; $g=$t[1]
$g.Clear([System.Drawing.Color]::Transparent)
# outer basin
$b=New-Object System.Drawing.SolidBrush (RGB 40 44 60); $g.FillEllipse($b,4,10,56,48); $b.Dispose()
$b=New-Object System.Drawing.SolidBrush (RGB 24 28 40); $g.FillEllipse($b,8,14,48,40); $b.Dispose()
# water (neon cyan)
$b=New-Object System.Drawing.SolidBrush (RGB 20 120 150); $g.FillEllipse($b,12,18,40,32); $b.Dispose()
$b=New-Object System.Drawing.SolidBrush (RGB 60 200 230); $g.FillEllipse($b,20,24,24,18); $b.Dispose()
# center jet
Px $g 30 16 (RGB 150 240 255) 4 22
Px $g 28 12 (RGB 200 250 255) 8 4
Save $bmp "gen_fountain.png"; $g.Dispose(); $bmp.Dispose()

# ---------- HEDGE / FENCE (park border) ----------
$t = New-Tile; $bmp=$t[0]; $g=$t[1]
$g.Clear([System.Drawing.Color]::Transparent)
Px $g 0 8 (RGB 22 60 40) $SZ ($SZ-8)
for ($i=0;$i -lt 20;$i++){ $x=[int]((Rnd)*$SZ); $y=10+[int]((Rnd)*($SZ-12)); Px $g $x $y (RGB 36 110 70) 2 2 }
Px $g 0 8 (RGB 50 160 100) $SZ 2   # top light
Save $bmp "gen_hedge.png"; $g.Dispose(); $bmp.Dispose()

Write-Host "Generated custom tiles into public/city/ (gen_*.png)"
Get-ChildItem $OUT -Filter "gen_*.png" | ForEach-Object { Write-Host (" - " + $_.Name) }
