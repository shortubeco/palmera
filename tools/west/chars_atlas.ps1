# Kovboy dokularını karakter başına 512x512 atlasa dizer (chars.mjs uv düzeniyle aynı):
#   sol üst = gövde (westan_<ad>_texture), sağ üst = şapka (<ad>_hut_texture), sol alt = ceket, sağ alt = rozet (yalnız şerif)
# Kullanım: powershell -File chars_atlas.ps1 "<Character/Textures>" <çıkış klasörü (tex/west)>
param([string]$src, [string]$out)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($c in @(@('sheriff', 'sheriff'), @('outlaw', 'outlow'), @('gunman', 'gunman'))) {
  $name = $c[0]; $b = $c[1]
  $bmp = New-Object System.Drawing.Bitmap 512, 512
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Gray)
  $g.InterpolationMode = 'HighQualityBicubic'
  $cells = @(@("westan_${b}_texture.png", 0, 0), @("${b}_hut_texture.png", 256, 0), @("${b}_jacket_texture.png", 0, 256), @("${b}_batch.png", 256, 256))
  foreach ($cell in $cells) {
    $f = Join-Path $src $cell[0]
    if (Test-Path $f) { $i = [System.Drawing.Image]::FromFile($f); $g.DrawImage($i, $cell[1], $cell[2], 256, 256); $i.Dispose() }
  }
  $g.Dispose()
  $bmp.Save((Join-Path $out "char_$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "char_$name.png"
}
