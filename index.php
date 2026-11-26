<?php
// Grand Drift Park — sitenin ana sayfası: her ligin en iyi 20'si (para + süre), OYNA, giriş / kayıt.
// Oyunun kendisi oyun.php'de.
declare(strict_types=1);
require __DIR__ . '/server/db.php';

$boards = []; $me = null; $dbError = false;
try {
    $pid = currentPlayerId();
    session_write_close();
    if ($pid) $me = playerState($pid);
    foreach (PARKS + TEST_PARKS as $i => $P) $boards[$i] = parkBoards($i, 20);   // her park oyununun (ve test bölümlerinin) üç sıralaması
} catch (Throwable $e) {
    $dbError = true;
    error_log('index.php: ' . $e->getMessage());
}
$active = $me ? $me['league'] : 1;
$openAuth = !$me && isset($_GET['giris']);
$css = filemtime(__DIR__ . '/css/landing.css');

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function money($v): string { return '$' . number_format((int) $v, 0, ',', '.'); }
function tm(int $ms): string { $s = $ms / 1000; return sprintf('%d:%04.1f', (int) floor($s / 60), fmod($s, 60)); }
function sn(int $ms): string { return number_format($ms / 1000, 2, ',', '') . ' sn'; }   // park süresi: 9,80 sn
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grand Drift Park — Sıralamalar</title>
<link rel="stylesheet" href="css/landing.css?v=<?= $css ?>">
</head>
<body>
<header class="top" id="top">
  <div class="logo"><span class="l1">GRAND DRIFT</span><span class="l2">Park</span></div>
  <div class="who">
    <?php if ($me): ?>
      <span><b><?= h($me['username']) ?></b></span>
      <button id="logout" class="link">Çıkış</button>
    <?php else: ?>
      <button id="login" class="link">Giriş yap</button>
    <?php endif; ?>
  </div>
</header>

<section class="hero">
  <div class="sun"></div>
  <p class="tag"><span lang="en">Grand Drift Park</span> · <span lang="en">Drift</span> yap, park et</p>
  <ul class="rules">
    <li>Caddede hızlan, el frenini çek, arabayı kaydırarak park yerine sok.</li>
    <li>Ne kadar hızlı ve ne kadar ortada durursan o kadar yüksek puan alırsın.</li>
    <li>Her park oyununda en kısa süre, en yüksek puan ve en iyi park sıralamaları var.</li>
  </ul>
  <!-- park oyunu kartları: resim kutusu (görüntü gelene kadar kodla çizilmiş sahne) + başlık + zorluk; tıklayınca o oyun -->
  <div class="parks" id="parks">
    <?php foreach (PARKS as $pid => $P): $lv = ['Kolay' => 'easy', 'Orta' => 'mid', 'Zor' => 'hard'][$P['level']] ?? 'easy'; ?>
    <a class="pcard lv-<?= $lv ?>" href="oyun.php?park=<?= $pid ?>" data-park="<?= $pid ?>">
      <div class="pimg" role="img" aria-label="<?= h($P['title']) ?> park oyunu">
        <span class="psun"></span><span class="proad"></span><span class="pspot"></span>
        <span class="plevel"><?= h($P['level']) ?></span>
        <span class="ptitle"><?= h($P['title']) ?></span>
      </div>
      <div class="pinfo"><?= h($P['route'] ?? '') ?></div>
      <span class="play pbtn">OYNA</span>
    </a>
    <?php endforeach; ?>
  </div>
</section>

<main>
  <h1>Rekorlar</h1>
  <?php if ($dbError): ?><p class="err">Rekorlar şu an yüklenemedi.</p><?php endif; ?>
  <?php
  // 7 bölüm: önce park oyunları, sonra ileride eklenecek oyunlar için test bölümleri (server/db.php TEST_PARKS: Test 1 …)
  $sections = [];
  foreach (PARKS as $pid => $P) $sections[] = ['id' => $pid, 'title' => $P['title'], 'B' => $boards[$pid] ?? ['total' => [], 'time' => [], 'park' => []]];
  foreach (TEST_PARKS as $pid => $P) $sections[] = ['id' => null, 'title' => $P['title'], 'B' => $boards[$pid] ?? ['total' => [], 'time' => [], 'park' => []]];
  $mine = fn($r) => $me && $r['username'] === $me['username'] ? ' class="me"' : '';
  ?>
  <?php foreach ($sections as $n => $S): $B = $S['B']; ?>
  <section class="league lg-<?= $n + 1 ?>"<?= $S['id'] ? ' id="park-' . $S['id'] . '"' : '' ?>>
    <div class="linfo"><b><?= h($S['title']) ?></b></div>
    <div class="boards">
      <table>
        <caption>En yüksek puan</caption>
        <thead><tr><th>#</th><th>Oyuncu</th><th>Puan</th></tr></thead>
        <tbody>
        <?php foreach ($B['total'] as $k => $r): ?>
          <tr<?= $mine($r) ?>><td><?= $k + 1 ?></td><td><?= h($r['username']) ?></td><td><?= (int) $r['total'] ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$B['total']): ?><tr class="empty"><td colspan="3">Henüz rekor yok.</td></tr><?php endif; ?>
        </tbody>
      </table>
      <table>
        <caption>En iyi süre</caption>
        <thead><tr><th>#</th><th>Oyuncu</th><th>Süre</th></tr></thead>
        <tbody>
        <?php foreach ($B['time'] as $k => $r): ?>
          <tr<?= $mine($r) ?>><td><?= $k + 1 ?></td><td><?= h($r['username']) ?></td><td><?= sn((int) $r['time_ms']) ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$B['time']): ?><tr class="empty"><td colspan="3">Henüz rekor yok.</td></tr><?php endif; ?>
        </tbody>
      </table>
      <table>
        <caption>En iyi park</caption>
        <thead><tr><th>#</th><th>Oyuncu</th><th>Puan</th></tr></thead>
        <tbody>
        <?php foreach ($B['park'] as $k => $r): ?>
          <tr<?= $mine($r) ?>><td><?= $k + 1 ?></td><td><?= h($r['username']) ?></td><td><?= (int) $r['park_score'] ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$B['park']): ?><tr class="empty"><td colspan="3">Henüz rekor yok.</td></tr><?php endif; ?>
        </tbody>
      </table>
    </div>
  </section>
  <?php endforeach; ?>
</main>

<footer class="foot">
  <div class="logo small"><span class="l1">GRAND DRIFT</span><span class="l2">Park</span></div>
  <p>Zamana karşı yarış · Tarayıcıda oynanır, kurulum gerekmez.</p>
  <nav>
    <a href="#" id="footplay">Oyna</a>
    <a href="#top">Başa dön</a>
  </nav>
  <p class="copy">© <?= date('Y') ?> Grand Drift Park. Tüm hakları saklıdır.</p>
</footer>

<div id="auth" class="modal<?= $openAuth ? '' : ' hidden' ?>">
  <form class="box" id="authform" autocomplete="on">
    <h2>Giriş yap</h2>
    <p class="sub">Oynamak için hesabınla gir. Hesabın yoksa aynı bilgilerle "Kayıt ol"a bas.</p>
    <label>Kullanıcı adı <input name="u" maxlength="20" autocomplete="username" required></label>
    <label>Şifre <input name="p" type="password" minlength="6" maxlength="72" autocomplete="current-password" required></label>
    <p class="msg" id="authmsg"></p>
    <div class="row">
      <button type="submit" data-a="login" class="play small">Giriş</button>
      <button type="submit" data-a="register" class="play small alt">Kayıt ol</button>
    </div>
    <button type="button" class="link" id="authclose">Kapat</button>
  </form>
</div>

<script>
(() => {
  const logged = <?= $me ? 'true' : 'false' ?>;
  const $ = (id) => document.getElementById(id);
  const openAuth = () => { $('auth').classList.remove('hidden'); $('authform').u.focus(); };
  // park kartı: girişliyse o oyun açılır; değilse giriş penceresi, girişten sonra seçilen park oyunu
  let pickPark = null;
  document.querySelectorAll('.pcard').forEach((a) => a.addEventListener('click', (e) => { if (logged) return; e.preventDefault(); pickPark = a.dataset.park; openAuth(); }));
  // alttaki 'Oyna': park oyunu kartlarına kaydır (her kartın kendi OYNA düğmesi var)
  $('footplay').addEventListener('click', (e) => { e.preventDefault(); $('parks').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('login')?.addEventListener('click', openAuth);
  $('authclose').addEventListener('click', () => $('auth').classList.add('hidden'));
  $('logout')?.addEventListener('click', async () => {
    await fetch('lig.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{"a":"logout"}' });
    location.href = './';
  });
  // giriş / kayıt: hangi düğmeye basıldıysa o
  let action = 'login';
  document.querySelectorAll('#authform [data-a]').forEach((b) => b.addEventListener('click', () => { action = b.dataset.a; }));
  $('authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('authmsg');
    msg.textContent = action === 'register' ? 'Hesap açılıyor…' : 'Giriş yapılıyor…';
    try {
      const r = await fetch('lig.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: action, u: f.u.value.trim(), p: f.p.value }) });
      const j = await r.json();
      if (j.ok) { location.href = 'oyun.php' + (pickPark ? '?park=' + pickPark : ''); return; }
      msg.textContent = j.error || 'Bir hata oldu.';
    } catch (err) { msg.textContent = 'Sunucuya ulaşılamadı.'; }
  });
  if (!$('auth').classList.contains('hidden')) $('authform').u.focus();
})();
</script>
</body>
</html>
