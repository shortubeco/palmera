<?php
// Palmera City — oyun sayfası. Giriş yapmış oyuncunun lig durumunu (sunucu, PostgreSQL) sayfaya gömer.
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
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Palmera City</title>
<link rel="stylesheet" href="css/style.css?v=<?= htmlspecialchars($version) ?>">
<script type="importmap">
<?= json_encode(['imports' => $imports], JSON_UNESCAPED_SLASHES) ?>
</script>
<script>window.PLAYER = <?= json_encode($player, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
window.LEAGUE_CFG = <?= json_encode(leaguesForClient(), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
window.ASSET_SIZES = <?= json_encode((object) $sizes) ?>;</script>
</head>
<body>
<canvas id="game"></canvas>
<div id="hurt"></div>
<div id="loading">
  <div class="ld-logo">PALMERA <span>City</span></div>
  <div class="ld-text">Yükleniyor<span class="ld-dots"><i>.</i><i>.</i><i>.</i></span></div>
  <div class="ld-bar"><div></div></div>
  <div class="ld-sub">Şehir inşa ediliyor, palmiyeler dikiliyor…</div>
</div>

<div id="title">
  <div class="sun"></div>
  <div class="logo">
    <div class="logo-top">PALMERA</div>
    <div class="logo-bottom">City</div>
    <div class="logo-sub">Palmera City · Florida · 1986'dan beri suç</div>
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
    <label class="chk"><input type="checkbox" id="sound" checked> Ses ve radyo</label>
  </div>
  <div class="controls pcontrols">
    <div class="ph">Yürürken</div><div class="ph">Araçta</div><div class="ph">Genel</div>
    <div><b>↑↓</b> yürü · <b>←→</b> dön</div><div><b>↑↓</b> gaz · fren / geri</div><div><b>M</b> büyük harita</div>
    <div><b>Shift</b> koş</div><div><b>←→</b> direksiyon</div><div><b>ESC</b> duraklat · devam et</div>
    <div><b>Space</b> zıpla · tırman</div><div><b>Space</b> el freni (drift)</div><div><b>Fare</b> etrafa bak</div>
    <div><b>Sol tık</b> yumruk</div><div><b>F</b> araçtan in</div><div><b>J / L</b> kamerayı çevir</div>
    <div><b>F</b> araca bin</div><div><b>Q / E</b> radyo kanalı</div><div><b>V</b> yola hizalama aç/kapa</div>
    <div><b>E</b> görevi başlat</div><div><b>H</b> korna</div><div></div>
    <div><b>R</b> silah değiştir</div><div><b>C</b> kamera</div><div></div>
  </div>
  <div class="ttips">$ Lig görevini ne kadar hızlı bitirirsen o kadar çok kazanırsın: ödül her saniye azalır. Lig hedefine ulaşınca bir üst lige geçersin.<br>★ Yıldızlar polisin seni aradığını gösterir — görüş alanından çıkıp saklanınca söner.</div>
  <div class="tplayer"><?php if ($player): ?><?= htmlspecialchars($player['username']) ?> · <?= htmlspecialchars(LEAGUES[$player['league']]['name']) ?> Ligi · <a href="./">Sıralamalar</a><?php else: ?>Çevrimdışı test (kayıt yok) · <a href="./">Sıralamalar</a><?php endif; ?></div>
</div>

<div id="hud" class="hidden">
  <div id="topright">
    <div id="leaguebadge"></div>
    <div id="stars"></div>
    <div id="money">$0</div>
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
  <div id="big"><div id="bigtitle"></div><div id="bigsub"></div></div>
  <div id="lockhint" class="hidden">Fare ile bakmak için oyuna tıkla</div>
</div>

<div id="bigmap" class="hidden">
  <canvas id="bigmapcanvas"></canvas>
  <div class="maphelp">Palmera City haritası · M ile kapat</div>
</div>

<div id="pause" class="hidden">
  <div class="pbox">
    <h2>DURAKLATILDI</h2>
    <div id="prank"></div>
    <button id="resume">Devam et</button>
    <button id="psound">Ses: Açık</button>
    <button id="prestart">Oyunun başına dön</button>
    <div class="controls pcontrols">
      <div class="ph">Yürürken</div><div class="ph">Araçta</div><div class="ph">Genel</div>
      <div><b>↑↓</b> yürü · <b>←→</b> dön</div><div><b>↑↓</b> gaz · fren / geri</div><div><b>M</b> büyük harita</div>
      <div><b>Shift</b> koş</div><div><b>←→</b> direksiyon</div><div><b>ESC</b> duraklat · devam et</div>
      <div><b>Space</b> zıpla · tırman</div><div><b>Space</b> el freni (drift)</div><div><b>Fare</b> etrafa bak</div>
      <div><b>Sol tık</b> yumruk</div><div><b>F</b> araçtan in</div><div><b>J / L</b> kamerayı çevir</div>
      <div><b>F</b> araca bin</div><div><b>Q / E</b> radyo kanalı</div><div><b>V</b> yola hizalama aç/kapa</div>
      <div><b>E</b> görevi başlat</div><div><b>H</b> korna</div><div></div>
      <div><b>R</b> silah değiştir</div><div><b>C</b> kamera</div><div></div>
    </div>
    <p>Paran ve ligin hesabına kaydedilir. <a href="./" target="_blank">Lig sıralamaları</a></p>
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
