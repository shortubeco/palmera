param([string]$src, [string]$out)
# white.png'den etiketsiz 256x256 atlas: her hücre düz renk, yalnız 11. hücre (degrade) korunur
Add-Type -AssemblyName System.Drawing
$img = New-Object System.Drawing.Bitmap $src
$cs = $img.Width / 4
$b = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'
for ($cy = 0; $cy -lt 4; $cy++) {
  for ($cx = 0; $cx -lt 4; $cx++) {
    $c = $cy * 4 + $cx
    if ($c -eq 11) {
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle ($cx * 64), ($cy * 64), 64, 64), (New-Object System.Drawing.Rectangle ($cx * $cs), ($cy * $cs), $cs, $cs), 'Pixel')
    } else {
      $p = $img.GetPixel([int]($cx * $cs + $cs * 0.25), [int]($cy * $cs + $cs * 0.25))
      $br = New-Object System.Drawing.SolidBrush $p
      $g.FillRectangle($br, $cx * 64, $cy * 64, 64, 64); $br.Dispose()
    }
  }
}
$g.Dispose(); $img.Dispose()
$b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
(Get-Item $out).Length
