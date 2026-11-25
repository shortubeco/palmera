param([string]$src, [string]$out)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Px {
  // Kırmızı tuğlayı açık griye çevir (köşe rengiyle istenen tona boyanır)
  public static void Pale(Bitmap b) {
    var r = new Rectangle(0,0,b.Width,b.Height);
    var d = b.LockBits(r, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    int n = d.Stride * b.Height; var a = new byte[n]; Marshal.Copy(d.Scan0, a, 0, n);
    double sum = 0; int cnt = 0;
    for (int i = 0; i < n; i += 4) { sum += 0.3*a[i+2] + 0.59*a[i+1] + 0.11*a[i]; cnt++; }
    double mean = sum / cnt;
    for (int i = 0; i < n; i += 4) {
      double L = 0.3*a[i+2] + 0.59*a[i+1] + 0.11*a[i];
      double sat = a[i+2] - a[i]; // tuğla kırmızı, harç gri: harcı koyulaştır
      double v = 208 + (L - mean) * 0.8 + (sat - 40) * 1.1;
      byte o = (byte)Math.Max(0, Math.Min(255, v));
      a[i] = o; a[i+1] = o; a[i+2] = o;
    }
    Marshal.Copy(a, 0, d.Scan0, n); b.UnlockBits(d);
  }
}
"@
function Save-Jpg($bmp, $path, $q) {
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
  $bmp.Save($path, $enc, $p)
}
function Resize($name, $size) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $src "$name.png"))
  $b = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose(); $img.Dispose()
  return $b
}
New-Item -ItemType Directory -Force $out | Out-Null
$b = Resize 'T_RoofSlate_BaseColor' 512; Save-Jpg $b (Join-Path $out 'RoofSlate_BaseColor.jpg') 85; $b.Dispose()
$b = Resize 'T_RoofSlate_Normal' 512; Save-Jpg $b (Join-Path $out 'RoofSlate_Normal.jpg') 88; $b.Dispose()
$b = Resize 'T_Ornaments_BaseColor' 512; Save-Jpg $b (Join-Path $out 'Ornaments_BaseColor.jpg') 85; $b.Dispose()
$b = Resize 'T_RedBrick_BaseColor' 1024; [Px]::Pale($b); Save-Jpg $b (Join-Path $out 'PaleBrick_BaseColor.jpg') 85; $b.Dispose()
# pencere atlası: aydınlık 1 | aydınlık 2 | karanlık
$atlas = New-Object System.Drawing.Bitmap 1536, 512
$g = [System.Drawing.Graphics]::FromImage($atlas)
$k = 0
foreach ($n in 'T_lit_interior_1', 'T_lit_interior_2', 'T_dark_interior') {
  $img = [System.Drawing.Image]::FromFile((Join-Path $src "$n.png"))
  $g.DrawImage($img, $k * 512, 0, 512, 512); $img.Dispose(); $k++
}
$g.Dispose()
Save-Jpg $atlas (Join-Path $out 'win_atlas.jpg') 88; $atlas.Dispose()
Get-ChildItem $out | Select-Object Name, Length | Format-Table -AutoSize
