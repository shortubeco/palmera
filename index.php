<?php
// Palmera Nights — sitenin ana sayfası: her ligin en iyi 20'si (para + süre), OYNA, giriş / kayıt.
// Oyunun kendisi oyun.php'de.
declare(strict_types=1);
require __DIR__ . '/server/db.php';

$boards = []; $me = null; $dbError = false;
try {
    $pid = currentPlayerId();
    session_write_close();
    if ($pid) $me = playerState($pid);
    foreach (LEAGUES as $i => $L) $boards[$i] = leagueBoards($i, 20);
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
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Palmera Nights — Lig sıralamaları</title>
<link rel="stylesheet" href="css/landing.css?v=<?= $css ?>">
</head>
<body>
<header class="top" id="top">
  <div class="logo"><span class="l1">PALMERA</span><span class="l2">Nights</span></div>
  <div class="who">
    <?php if ($me): ?>
      <span><?= h($me['username']) ?> · <b><?= h(LEAGUES[$me['league']]['name']) ?> Ligi</b> · <?= money($me['money']) ?></span>
      <button id="logout" class="link">Çıkış</button>
    <?php else: ?>
      <button id="login" class="link">Giriş yap</button>
    <?php endif; ?>
  </div>
</header>

<section class="hero">
  <div class="sun"></div>
  <p class="tag"><span lang="en">Palmera Nights</span> · Zamana karşı yarış</p>
  <ul class="rules">
    <li>Verilen görevi en kısa sürede bitir, ödülü kazan.</li>
    <li>Ödül kazanarak kasandaki parayı arttır ve lig atla.</li>
    <li>Paran kalmazsa yardımcı görevlerle de para kazanabilirsin.</li>
  </ul>
  <button id="play" class="play">OYNA</button>
  <div class="shots">
    <figure><img src="img/palmera.jpg" alt="Palmera Bay'de gece, sahil yolunda spor araba" loading="lazy" width="960" height="540"><figcaption>Palmera Bay · gece sahil yolu</figcaption></figure>
    <figure><img src="img/wildwest.jpg" alt="Wild West kasabasının ana caddesi" loading="lazy" width="960" height="540"><figcaption>Wild West · kasaba caddesi</figcaption></figure>
    <figure><img src="img/casablanca.jpg" alt="Casablanca surları ve şehir, havadan" loading="lazy" width="960" height="540"><figcaption>Casablanca · uçakla git</figcaption></figure>
  </div>
</section>

<main>
  <h1>Lig sıralamaları</h1>
  <?php if ($dbError): ?><p class="err">Sıralamalar şu an yüklenemedi.</p><?php endif; ?>
  <?php foreach (LEAGUES as $i => $L): $B = $boards[$i] ?? ['money' => [], 'time' => []]; ?>
  <section class="league lg-<?= $i ?><?= $i === $active ? ' mine' : '' ?>" id="lig-<?= $i ?>">
    <div class="linfo">
      <b><?= h($L['name']) ?> Ligi</b>
      <span><?= $i === LAST_LEAGUE ? 'Her ' . money($L['limit']) . "'da yeni görev" : 'Geçme sınırı ' . money($L['limit']) ?></span>
      <span>Görev ödülü <?= money($L['start']) ?>, saniyede <?= money($L['decay']) ?> azalır</span>
      <?php if (!$L['mission']): ?><span class="soon">Görevi yakında</span><?php endif; ?>
    </div>
    <div class="boards">
      <table>
        <caption>En çok para</caption>
        <thead><tr><th>#</th><th>Oyuncu</th><th>Para</th></tr></thead>
        <tbody>
        <?php foreach ($B['money'] as $k => $r): ?>
          <tr<?= $me && $r['username'] === $me['username'] ? ' class="me"' : '' ?>><td><?= $k + 1 ?></td><td><?= h($r['username']) ?></td><td><?= money($r['money']) ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$B['money']): ?><tr class="empty"><td colspan="3">Bu ligde henüz oyuncu yok.</td></tr><?php endif; ?>
        </tbody>
      </table>
      <table>
        <caption>En iyi süre<?= $i === LAST_LEAGUE ? ' · Elmas 1. görev' : '' ?></caption>
        <thead><tr><th>#</th><th>Oyuncu</th><th>Süre</th><th>Ödül</th></tr></thead>
        <tbody>
        <?php foreach ($B['time'] as $k => $r): ?>
          <tr<?= $me && $r['username'] === $me['username'] ? ' class="me"' : '' ?>><td><?= $k + 1 ?></td><td><?= h($r['username']) ?></td><td><?= tm((int) $r['time_ms']) ?></td><td><?= money($r['reward']) ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$B['time']): ?><tr class="empty"><td colspan="4">Henüz bitiren yok.</td></tr><?php endif; ?>
        </tbody>
      </table>
    </div>
  </section>
  <?php endforeach; ?>
</main>

<footer class="foot">
  <div class="logo small"><span class="l1">PALMERA</span><span class="l2">Nights</span></div>
  <p>Zamana karşı yarış · Tarayıcıda oynanır, kurulum gerekmez.</p>
  <nav>
    <a href="#" id="footplay">Oyna</a>
    <a href="#top">Başa dön</a>
  </nav>
  <p class="copy">© <?= date('Y') ?> Palmera Nights. Tüm hakları saklıdır.</p>
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
  $('play').addEventListener('click', () => { if (logged) location.href = 'oyun.php'; else openAuth(); });
  $('footplay').addEventListener('click', (e) => { e.preventDefault(); $('play').click(); });
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
      if (j.ok) { location.href = 'oyun.php'; return; }
      msg.textContent = j.error || 'Bir hata oldu.';
    } catch (err) { msg.textContent = 'Sunucuya ulaşılamadı.'; }
  });
  if (!$('auth').classList.contains('hidden')) $('authform').u.focus();
})();
</script>
</body>
</html>
