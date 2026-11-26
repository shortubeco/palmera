<?php
// Grand Drift Park — oyun sayfası. Giriş yapmış oyuncunun lig durumunu (sunucu, PostgreSQL) sayfaya gömer.
// Giriş yoksa sitenin ana sayfasına (sıralamalar + giriş) gönderir. Yalnız yerelde ?nosave=1: kayıtsız test oyunu.
declare(strict_types=1);
require __DIR__ . '/server/db.php';

$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
$offline = $local && ($_GET['nosave'] ?? '') === '1';
$player = null;
if (!$offline) {
    try {
        $pid = currentPlayerId();
        session_write_close();
        $player = $pid ? playerState($pid) : null;
    } catch (Throwable $e) {
        error_log('oyun.php: ' . $e->getMessage());
        http_response_code(503);
        exit('Sunucuya şu an ulaşılamıyor. Biraz sonra yeniden dene.');
    }
    if (!$player) { header('Location: ./?giris=1'); exit; }
}
// Her JS modülü değiştiğinde tarayıcı önbelleği atlansın diye import map'e sürüm ekle
// Yayın kopyasında three.js eklentileri kökteki jsm/ klasöründedir (hosting zip açıcısı derin yolları atlıyordu)
$addons = is_dir(__DIR__ . '/jsm') ? './jsm/' : './vendor/three/jsm/';
$imports = ['three' => './vendor/three/build/three.module.js', 'three/addons/' => $addons];
$latest = 0;
foreach (array_merge(glob(__DIR__ . '/js/*.js'), glob(__DIR__ . '/js/regions/*.js') ?: []) as $js) {
    $t = filemtime($js);
    $latest = max($latest, $t);
    $rel = substr(str_replace('\\', '/', $js), strlen(str_replace('\\', '/', __DIR__)) + 1);   // js/x.js ya da js/regions/x.js
    $imports['./' . $rel] = './' . $rel . '?v=' . $t;
}
$latest = max($latest, filemtime(__DIR__ . '/css/style.css'));
$version = '1.0.' . $latest;
// yükleme çubuğu için veri dosyalarının gerçek boyutları (gzip'li sunucuda Content-Length sıkıştırılmış boyutu verir)
$sizes = [];
foreach (glob(__DIR__ . '/assets/web/*.{json,bin}', GLOB_BRACE) ?: [] as $f) $sizes[basename($f)] = filesize($f);
// model/doku sürümleri (assets/web altındaki her dosyanın değişme zamanı): adrese ?v= eklenir, dosya değişince adres değişir.
// assets/web/.htaccess bu dosyaları 1 yıl önbellekte tutar; değişmeyenler bir daha indirilmez.
$assetVer = [];
$aw = __DIR__ . '/assets/web/';
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($aw, FilesystemIterator::SKIP_DOTS)) as $f) {
    if ($f->getFilename()[0] === '.') continue;
    $assetVer[strtr(substr($f->getPathname(), strlen($aw)), '\\', '/')] = $f->getMTime();
}
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grand Drift Park</title>
<link rel="stylesheet" href="css/style.css?v=<?= htmlspecialchars($version) ?>">
<script type="importmap">
<?= json_encode(['imports' => $imports], JSON_UNESCAPED_SLASHES) ?>
</script>
<script>window.PLAYER = <?= json_encode($player, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
window.LEAGUE_CFG = <?= json_encode(leaguesForClient(), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
window.PARK_CFG = <?= json_encode(parksForClient(), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;   // Drift Park puan kuralları (server/db.php PARKS)
window.ASSET_SIZES = <?= json_encode((object) $sizes) ?>;
window.ASSET_VER = <?= json_encode((object) $assetVer, JSON_UNESCAPED_SLASHES) ?>;</script>
</head>
<body>
<canvas id="game"></canvas>
<div id="hurt"></div>
<div id="loading">
  <div class="ld-logo">GRAND DRIFT <span>Park</span></div>
  <div class="ld-text">Yükleniyor<span class="ld-dots"><i>.</i><i>.</i><i>.</i></span></div>
  <div class="ld-bar"><div></div></div>
  <div class="ld-sub">Park yerleri çiziliyor, lastikler ısınıyor…</div>
</div>

<div id="title">
  <div class="sun"></div>
  <div class="logo">
    <div class="logo-top">GRAND DRIFT</div>
    <div class="logo-bottom">Park</div>
    <div class="logo-sub"><span lang="en">Palmera City</span> · <span lang="en">Drift</span> yap, park et</div>
  </div>
  <div class="menu">
    <button id="play">OYNA</button>
    <button id="playhome" class="hidden">Palmera'dan başla</button>
    <label>Grafik
      <select id="quality">
        <option value="high">Yüksek</option>
        <option value="medium">Orta</option>
        <option value="low">Düşük</option>
      </select>
    </label>
    <label class="chk"><input type="checkbox" id="sound" checked> Ses</label>
    <label class="chk"><input type="checkbox" id="music" checked> Müzik</label>
  </div>
  <div class="controls pcontrols car">
    <div class="ph">Tuşlar</div>
    <div><kbd>↑</kbd><kbd>↓</kbd> gaz · fren / geri</div><div><kbd>←</kbd><kbd>→</kbd> direksiyon</div>
    <div><kbd class="wide">Space</kbd> el freni (drift)</div><div><kbd>H</kbd> korna</div>
    <div><kbd>C</kbd> kamera</div><div><kbd>Q</kbd><kbd>E</kbd> radyo kanalı</div>
  </div>
  <div class="tplayer"><?php if ($player): ?><?= htmlspecialchars($player['username']) ?> · <a href="./">Rekorlar</a><?php else: ?>Çevrimdışı test (kayıt yok) · <a href="./">Rekorlar</a><?php endif; ?></div>
</div>

<div id="hud" class="hidden">
  <div id="topright">
    <div id="leaguebadge"></div>
    <div id="stars"></div>
    <div id="money" style="display:none">$0</div><!-- para kalktı (Drift Park); HUD hâlâ yazdığı için gizli duruyor -->
    <div id="clockrow">Saat: <span id="clock">18:00</span></div>
  </div>
  <div id="mapwrap">
    <canvas id="minimap" width="220" height="220"></canvas>
    <div id="hpbar"><div id="hpfill"></div></div>
  </div>
  <div id="speedo">
    <div><span id="speed">0</span><small> km/sa</small></div>
    <div id="vehname"></div>
    <div id="radioname"></div>
  </div>
  <div id="keyhelp"><div><b>M</b> büyük harita</div><div><b>ESC</b> menü ve tuşlar</div></div>
  <div id="objective"></div>
  <div id="mtimer"></div>
  <div id="mreward"><div id="mrmoney"></div><div id="mrtime"></div></div>
  <div id="prompt"></div>
  <div id="notify"></div>
  <div id="radiopop"></div>
  <div id="missioncard"></div>
  <div id="big"><div id="bigtitle"></div><div id="bigsub"></div><div id="bignote"></div></div>
  <div id="lockhint" class="hidden">Fare ile bakmak için oyuna tıkla</div>
</div>

<div id="bigmap" class="hidden">
  <canvas id="bigmapcanvas"></canvas>
  <div class="maphelp">Palmera City haritası · M ile kapat</div>
</div>

<div id="pause" class="hidden">
  <div class="pbox">
    <h2>DURAKLATILDI</h2>
    <button id="resume">Devam et</button>
    <button id="psound">Ses: Açık</button>
    <button id="pmusic">Müzik: Açık</button>
    <button id="prestart">Oyunun başına dön</button>
    <button id="pparks">Diğer oyunlar</button>
    <div class="controls pcontrols car">
      <div class="ph">Tuşlar</div>
      <div><kbd>↑</kbd><kbd>↓</kbd> gaz · fren / geri</div><div><kbd>←</kbd><kbd>→</kbd> direksiyon</div>
      <div><kbd class="wide">Space</kbd> el freni (drift)</div><div><kbd>H</kbd> korna</div>
      <div><kbd>C</kbd> kamera</div><div><kbd>Q</kbd><kbd>E</kbd> radyo kanalı</div>
    </div>
    <p>Puanların hesabına kaydedilir. <a href="./" target="_blank">Sıralamalar</a></p>
  </div>
</div>
<!-- park oyunu seçimi (ESC → Diğer oyunlar): landing kartlarının aynısı; seçince sayfa değişmeden o oyun başlar -->
<div id="parkpick" class="hidden">
  <div class="ppbox">
    <h2>Park oyunları</h2>
    <div class="ppgrid" id="ppgrid"></div>
    <button id="ppback">Geri</button>
  </div>
</div>
<div id="intro" class="hidden">
  <div class="ibox">
    <button class="iclose" id="introX" title="Kapat ve başla">✕</button>
    <h2>Hoş geldin!</h2>
    <ul id="introList"></ul>
    <button class="istart" id="introGo">BAŞLA</button>  </div>
</div>
<div id="over" class="hidden">
  <div class="obox">
    <h2 id="overT"></h2>
    <p id="overS"></p>
    <div id="overBtns"></div>
    <p class="ohelp" id="ohelp"></p>
  </div>
</div>
<div id="fatal" class="hidden"></div>

<script type="module" src="./js/main.js"></script>
</body>
</html>
