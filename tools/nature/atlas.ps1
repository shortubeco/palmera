param([string]$src, [string]$out, [int]$size = 512)
# Doğa paketinin renk atlasını (2000x2000) oyun için küçültür
Add-Type -AssemblyName System.Drawing
$img = New-Object System.Drawing.Bitmap $src
$b = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
$g.Dispose(); $img.Dispose()
$b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
(Get-Item $out).Length
