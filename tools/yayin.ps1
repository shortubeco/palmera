# Hostinge yüklenecek dosyaları "yayin/" klasörüne toplar ve "yayin.zip" yapar.
# Kullanım (proje klasöründe):  powershell -ExecutionPolicy Bypass -File tools\yayin.ps1
# Yalnız oyunun çalışması için gerekenler kopyalanır: index.php (sıralamalar), oyun.php, lig.php, server/, css/, img/, js/, vendor/, assets/web/.
# Kopyalanmayanlar: config.local.php (veritabanı şifresi), assets/ içindeki ham (lisanslı) paketler, tools/, data/, api.php, notlar.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'yayin'
$zip = Join-Path $root 'yayin.zip'

# önceki yayın kopyasını temizle (yalnız yayin/ ve yayin.zip)
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $out | Out-Null

foreach ($f in 'index.php', 'oyun.php', 'lig.php') { Copy-Item (Join-Path $root $f) $out }
# server/: veritabanı + lig kuralları (.htaccess ile tarayıcıya kapalı). config.local.php (şifre) KOPYALANMAZ:
# hostingte bir kez elle oluşturulur, yeni sürüm yüklenirken silinmemeli.
foreach ($d in 'server', 'css', 'img', 'js', 'vendor') { Copy-Item (Join-Path $root $d) (Join-Path $out $d) -Recurse }
New-Item -ItemType Directory -Path (Join-Path $out 'assets') | Out-Null
Copy-Item (Join-Path $root 'assets\web') (Join-Path $out 'assets\web') -Recurse
# three.js eklentileri (vendor/three/jsm/...) köke jsm/ olarak taşınır: hostingin zip açıcısı
# 5 seviyelik yolları (vendor/three/jsm/utils/x.js) atlıyordu. index.php jsm/ varsa onu kullanır.
Move-Item (Join-Path $out 'vendor\three\jsm') (Join-Path $out 'jsm')

# Compress-Archive (PowerShell 5.1) yolları "\" ile ve boş klasör kayıtlarıyla yazar; Linux hostingdeki
# zip açıcılar bunu yanlış çözüp bazı klasörleri boş bırakabiliyor (vendor/three/jsm boş kalmıştı).
# Bu yüzden zip elle yazılır: yalnız dosya kayıtları, yollar "/" ile.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$za = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in Get-ChildItem $out -Recurse -File) {
    $rel = $f.FullName.Substring($out.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $f.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $za.Dispose() }

$files = Get-ChildItem $out -Recurse -File
'yayin/: {0} dosya, {1:N1} MB' -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB)
'yayin.zip: {0:N1} MB' -f ((Get-Item $zip).Length / 1MB)
