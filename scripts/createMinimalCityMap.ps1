Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$TileDir = Join-Path $Root "src\components\assets\tiles"
$TiledDir = Join-Path $Root "tiled"
$OutTmx = Join-Path $TiledDir "city.tmx"
$OutPreview = Join-Path $TiledDir "city-preview.png"

$Width = 40
$Height = 40
$TileSize = 48
$CollisionTile = 1

$Tilesets = @(
  @{ name = "1"; source = "1.tsx"; image = "1.png"; firstgid = 1 },
  @{ name = "10"; source = "10.tsx"; image = "10.png"; firstgid = 257 },
  @{ name = "11"; source = "11.tsx"; image = "11.png"; firstgid = 513 },
  @{ name = "12"; source = "12.tsx"; image = "12.png"; firstgid = 769 },
  @{ name = "13"; source = "13.tsx"; image = "13.png"; firstgid = 1025 },
  @{ name = "14"; source = "14.tsx"; image = "14.png"; firstgid = 1281 },
  @{ name = "15"; source = "15.tsx"; image = "15.png"; firstgid = 1537 },
  @{ name = "16"; source = "16.tsx"; image = "16.png"; firstgid = 1793 },
  @{ name = "17"; source = "17.tsx"; image = "17.png"; firstgid = 2049 },
  @{ name = "18"; source = "18.tsx"; image = "18.png"; firstgid = 2305 },
  @{ name = "19"; source = "19.tsx"; image = "19.png"; firstgid = 2561 },
  @{ name = "2"; source = "2.tsx"; image = "2.png"; firstgid = 2817 },
  @{ name = "20"; source = "20.tsx"; image = "20.png"; firstgid = 3073 },
  @{ name = "21"; source = "21.tsx"; image = "21.png"; firstgid = 3329 },
  @{ name = "22"; source = "22.tsx"; image = "22.png"; firstgid = 3585 },
  @{ name = "23"; source = "23.tsx"; image = "23.png"; firstgid = 3841 },
  @{ name = "24"; source = "24.tsx"; image = "24.png"; firstgid = 4097 },
  @{ name = "25"; source = "25.tsx"; image = "25.png"; firstgid = 4353 },
  @{ name = "3"; source = "3.tsx"; image = "3.png"; firstgid = 4609 },
  @{ name = "5"; source = "5.tsx"; image = "5.png"; firstgid = 4865 },
  @{ name = "6"; source = "6.tsx"; image = "6.png"; firstgid = 5121 },
  @{ name = "7"; source = "7.tsx"; image = "7.png"; firstgid = 5377 },
  @{ name = "8"; source = "8.tsx"; image = "8.png"; firstgid = 5633 },
  @{ name = "Auto-tile-A4-walls-2"; source = "Auto-tile-A4-walls-2.tsx"; image = "Auto-tile-A4-walls-2.png"; firstgid = 5889 },
  @{ name = "tile-B-01"; source = "tile-B-01.tsx"; image = "tile-B-01.png"; firstgid = 6145 },
  @{ name = "tile-B-02"; source = "tile-B-02.tsx"; image = "tile-B-02.png"; firstgid = 6401 },
  @{ name = "tile-B-03"; source = "tile-B-03.tsx"; image = "tile-B-03.png"; firstgid = 6657 },
  @{ name = "tile-B-04"; source = "tile-B-04.tsx"; image = "tile-B-04.png"; firstgid = 6913 },
  @{ name = "tile-B-05"; source = "tile-B-05.tsx"; image = "tile-B-05.png"; firstgid = 7169 }
)

$FirstGids = @{}
foreach ($tileset in $Tilesets) {
  $FirstGids[$tileset.name] = $tileset.firstgid
}

function New-Layer {
  return ,([int[,]]::new($Height, $Width))
}

function Get-Gid {
  param([string]$Sheet, [int]$X, [int]$Y)
  return $FirstGids[$Sheet] + ($Y * 16) + $X
}

function Set-Tile {
  param([int[,]]$Layer, [int]$X, [int]$Y, [int]$Gid)
  if ($X -ge 0 -and $X -lt $Width -and $Y -ge 0 -and $Y -lt $Height) {
    $Layer.SetValue($Gid, $Y, $X)
  }
}

function Fill-Rect {
  param([int[,]]$Layer, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Gid)
  for ($row = 0; $row -lt $H; $row++) {
    for ($col = 0; $col -lt $W; $col++) {
      Set-Tile $Layer ($X + $col) ($Y + $row) $Gid
    }
  }
}

function Fill-PatternRect {
  param([int[,]]$Layer, [int]$X, [int]$Y, [int]$W, [int]$H, [int[]]$Tiles)
  for ($row = 0; $row -lt $H; $row++) {
    for ($col = 0; $col -lt $W; $col++) {
      $idx = (($col % 4) + (($row % 4) * 4)) % $Tiles.Count
      Set-Tile $Layer ($X + $col) ($Y + $row) $Tiles[$idx]
    }
  }
}

function Stamp {
  param([int[,]]$Layer, [string]$Sheet, [int]$SourceX, [int]$SourceY, [int]$W, [int]$H, [int]$DestX, [int]$DestY)
  for ($row = 0; $row -lt $H; $row++) {
    for ($col = 0; $col -lt $W; $col++) {
      Set-Tile $Layer ($DestX + $col) ($DestY + $row) (Get-Gid $Sheet ($SourceX + $col) ($SourceY + $row))
    }
  }
}

function Mark-Collision {
  param([int[,]]$Layer, [int]$X, [int]$Y, [int]$W, [int]$H)
  Fill-Rect $Layer $X $Y $W $H $CollisionTile
}

function Format-Csv {
  param([int[,]]$Layer)
  $rows = New-Object System.Collections.Generic.List[string]
  for ($y = 0; $y -lt $Height; $y++) {
    $values = New-Object System.Collections.Generic.List[string]
    for ($x = 0; $x -lt $Width; $x++) {
      $values.Add($Layer.GetValue($y, $x).ToString())
    }
    if ($y -lt ($Height - 1)) {
      $rows.Add(($values -join ",") + ",")
    } else {
      $rows.Add($values -join ",")
    }
  }
  return "  " + ($rows -join "`n")
}

function Get-TilesetForGid {
  param([int]$Gid)
  $match = $null
  foreach ($tileset in $Tilesets) {
    if ($Gid -ge $tileset.firstgid) {
      $match = $tileset
    }
  }
  return $match
}

function Draw-Layer {
  param($Graphics, [int[,]]$Layer, $Images)
  for ($y = 0; $y -lt $Height; $y++) {
    for ($x = 0; $x -lt $Width; $x++) {
      $gid = $Layer.GetValue($y, $x)
      if ($gid -eq 0) { continue }

      $tileset = Get-TilesetForGid $gid
      if ($null -eq $tileset) { continue }

      $local = $gid - $tileset.firstgid
      $sx = ($local % 16) * $TileSize
      $sy = [math]::Floor($local / 16) * $TileSize
      $src = New-Object System.Drawing.Rectangle $sx, $sy, $TileSize, $TileSize
      $dest = New-Object System.Drawing.Rectangle ($x * $TileSize), ($y * $TileSize), $TileSize, $TileSize
      $Graphics.DrawImage($Images[$tileset.name], $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
    }
  }
}

$Ground = New-Layer
$Objects = New-Layer
$Overhead = New-Layer
$Collision = New-Layer

$baseTiles = @(
  (Get-Gid "10" 0 4),
  (Get-Gid "10" 1 4),
  (Get-Gid "10" 2 4),
  (Get-Gid "10" 3 4),
  (Get-Gid "10" 0 5),
  (Get-Gid "10" 1 5),
  (Get-Gid "10" 2 5),
  (Get-Gid "10" 3 5),
  (Get-Gid "10" 0 6),
  (Get-Gid "10" 1 6),
  (Get-Gid "10" 2 6),
  (Get-Gid "10" 3 6),
  (Get-Gid "10" 0 7),
  (Get-Gid "10" 1 7),
  (Get-Gid "10" 2 7),
  (Get-Gid "10" 3 7)
)

$walkwayTiles = @(
  (Get-Gid "1" 0 4),
  (Get-Gid "1" 1 4),
  (Get-Gid "1" 2 4),
  (Get-Gid "1" 3 4),
  (Get-Gid "1" 0 5),
  (Get-Gid "1" 1 5),
  (Get-Gid "1" 2 5),
  (Get-Gid "1" 3 5)
)

$grateTiles = @(
  (Get-Gid "1" 0 6),
  (Get-Gid "1" 1 6),
  (Get-Gid "1" 0 7),
  (Get-Gid "1" 1 7)
)

$plazaTiles = @(
  (Get-Gid "10" 0 4),
  (Get-Gid "10" 1 4),
  (Get-Gid "10" 2 4),
  (Get-Gid "10" 3 4),
  (Get-Gid "10" 0 5),
  (Get-Gid "10" 1 5),
  (Get-Gid "10" 2 5),
  (Get-Gid "10" 3 5)
)

Fill-PatternRect $Ground 0 0 $Width $Height $baseTiles

# Clean cyberpunk street layout: slab walkways with metal grate center lanes.
Fill-PatternRect $Ground 16 0 8 $Height $walkwayTiles
Fill-PatternRect $Ground 0 16 $Width 8 $walkwayTiles
Fill-PatternRect $Ground 6 23 6 17 $walkwayTiles
Fill-PatternRect $Ground 24 8 16 6 $walkwayTiles
Fill-PatternRect $Ground 18 0 4 $Height $grateTiles
Fill-PatternRect $Ground 0 18 $Width 4 $grateTiles
Fill-PatternRect $Ground 8 23 2 17 $grateTiles

# City-center plaza pad.
Fill-PatternRect $Ground 14 5 12 9 $plazaTiles
Stamp $Ground "1" 0 4 2 2 17 8
Stamp $Ground "1" 2 4 2 2 19 8
Stamp $Ground "1" 0 4 2 2 21 8
Stamp $Ground "10" 0 4 2 1 18 13
Stamp $Ground "10" 2 4 2 1 20 13

$buildingBlockTiles = @(
  (Get-Gid "Auto-tile-A4-walls-2" 4 8),
  (Get-Gid "Auto-tile-A4-walls-2" 5 8),
  (Get-Gid "Auto-tile-A4-walls-2" 6 8),
  (Get-Gid "Auto-tile-A4-walls-2" 7 8),
  (Get-Gid "Auto-tile-A4-walls-2" 4 9),
  (Get-Gid "Auto-tile-A4-walls-2" 5 9),
  (Get-Gid "Auto-tile-A4-walls-2" 6 9),
  (Get-Gid "Auto-tile-A4-walls-2" 7 9)
)

# Simple blocky structures fill out the district without overcrowding the roads.
Fill-PatternRect $Objects 10 5 4 5 $buildingBlockTiles
Mark-Collision $Collision 10 5 4 5

Fill-PatternRect $Objects 27 5 4 4 $buildingBlockTiles
Mark-Collision $Collision 27 5 4 4

Fill-PatternRect $Objects 4 25 6 4 $buildingBlockTiles
Mark-Collision $Collision 4 25 6 4

Fill-PatternRect $Objects 25 24 6 5 $buildingBlockTiles
Mark-Collision $Collision 25 24 6 5

Fill-PatternRect $Objects 34 24 5 5 $buildingBlockTiles
Mark-Collision $Collision 34 24 5 5

# Buildings: denser perimeter blocks like the reference, while roads stay open.
Stamp $Objects "tile-B-02" 4 0 4 8 1 0
Mark-Collision $Collision 1 0 4 8

Stamp $Objects "tile-B-02" 0 0 4 4 5 0
Mark-Collision $Collision 5 0 4 4

Stamp $Objects "10" 8 0 4 4 12 0
Mark-Collision $Collision 12 0 4 4

Stamp $Objects "10" 10 0 4 4 23 0
Mark-Collision $Collision 23 0 4 4

Stamp $Objects "tile-B-02" 8 0 8 6 32 0
Mark-Collision $Collision 32 0 8 6

Stamp $Objects "1" 0 10 4 6 0 10
Mark-Collision $Collision 0 10 4 6

Stamp $Objects "10" 4 4 2 2 8 11
Mark-Collision $Collision 8 11 2 2

Stamp $Objects "10" 12 8 4 4 34 11
Mark-Collision $Collision 34 11 4 4

Stamp $Objects "10" 4 8 4 4 30 29
Mark-Collision $Collision 30 29 4 4

Stamp $Objects "1" 0 13 4 3 1 31
Mark-Collision $Collision 1 31 4 3

Stamp $Objects "tile-B-05" 8 4 2 2 21 31
Mark-Collision $Collision 21 31 2 2

Stamp $Objects "10" 4 8 4 4 32 34
Mark-Collision $Collision 32 34 4 4

# Plaza and street accents.
Stamp $Objects "tile-B-03" 0 8 2 2 19 8
Mark-Collision $Collision 19 8 2 2

Stamp $Objects "tile-B-03" 2 8 2 2 22 8
Mark-Collision $Collision 22 8 2 2

Stamp $Objects "10" 0 0 4 1 17 3
Mark-Collision $Collision 17 3 4 1

Stamp $Objects "1" 8 13 2 1 13 15
Mark-Collision $Collision 13 15 2 1

Stamp $Objects "10" 8 12 4 2 27 16
Mark-Collision $Collision 27 16 4 2

Stamp $Objects "10" 12 12 4 2 24 22
Mark-Collision $Collision 24 22 4 2

Stamp $Objects "1" 6 13 2 3 13 24
Mark-Collision $Collision 13 24 2 3

Stamp $Objects "tile-B-03" 14 14 2 2 24 14
Mark-Collision $Collision 24 14 2 2

Stamp $Objects "10" 6 12 2 4 14 25
Mark-Collision $Collision 14 25 2 4

Stamp $Objects "tile-B-05" 10 14 2 2 12 34
Mark-Collision $Collision 12 34 2 2

$xml = New-Object System.Text.StringBuilder
[void]$xml.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$xml.AppendLine('<map version="1.10" tiledversion="1.11.0" orientation="orthogonal" renderorder="right-down" width="40" height="40" tilewidth="48" tileheight="48" infinite="0" nextlayerid="5" nextobjectid="1">')
foreach ($tileset in $Tilesets) {
  [void]$xml.AppendLine((' <tileset firstgid="{0}" source="{1}"/>' -f $tileset.firstgid, $tileset.source))
}

$layers = @(
  @{ id = 1; name = "ground"; data = $Ground; visible = $true },
  @{ id = 2; name = "objects"; data = $Objects; visible = $true },
  @{ id = 3; name = "overhead"; data = $Overhead; visible = $true },
  @{ id = 4; name = "collision"; data = $Collision; visible = $false }
)

foreach ($layer in $layers) {
  $visible = if ($layer.visible) { "" } else { ' visible="0"' }
  [void]$xml.AppendLine((' <layer id="{0}" name="{1}" width="40" height="40"{2}>' -f $layer.id, $layer.name, $visible))
  [void]$xml.AppendLine('  <data encoding="csv">')
  [void]$xml.AppendLine((Format-Csv $layer.data))
  [void]$xml.AppendLine('  </data>')
  [void]$xml.AppendLine(' </layer>')
}
[void]$xml.AppendLine('</map>')

[System.IO.File]::WriteAllText($OutTmx, $xml.ToString(), [System.Text.Encoding]::UTF8)

$images = @{}
foreach ($tileset in $Tilesets) {
  $images[$tileset.name] = [System.Drawing.Image]::FromFile((Join-Path $TileDir $tileset.image))
}

$preview = New-Object System.Drawing.Bitmap ($Width * $TileSize), ($Height * $TileSize)
$graphics = [System.Drawing.Graphics]::FromImage($preview)
$graphics.Clear([System.Drawing.Color]::FromArgb(18, 18, 24))
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

Draw-Layer $graphics $Ground $images
Draw-Layer $graphics $Objects $images
Draw-Layer $graphics $Overhead $images

$preview.Save($OutPreview, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$preview.Dispose()
foreach ($image in $images.Values) {
  $image.Dispose()
}

Write-Host "Wrote $OutTmx"
Write-Host "Wrote $OutPreview"
