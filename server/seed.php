<?php
// Lig tabloları boş görünmesin diye bot oyuncular (players.bot = true). Botlarla giriş yapılamaz (geçersiz şifre özeti).
// Hepsi tek komutla silinir: php tools/seed_bots.php --sil
declare(strict_types=1);

const BOT_COUNTS = [1 => 34, 2 => 27, 3 => 22, 4 => 17, 5 => 13, 6 => 9, 7 => 6];   // lig başına bot sayısı

function seedBots(PDO $pdo, int $seed = 2026): int {
    mt_srand($seed);
    $rnd = fn(): float => mt_rand() / mt_getrandmax();
    $names = botNames(array_sum(BOT_COUNTS), $rnd);
    $insP = $pdo->prepare("INSERT INTO players (username, uname_lc, pass_hash, league, stage, money, bot, created_at, last_seen)
                           VALUES (?, ?, '!bot', ?, ?, ?, true, now() - make_interval(secs => ?), now() - make_interval(secs => ?))
                           ON CONFLICT (uname_lc) DO NOTHING RETURNING id");
    $insT = $pdo->prepare('INSERT INTO best_times (player_id, mission_key, time_ms, reward, at) VALUES (?, ?, ?, ?, now() - make_interval(secs => ?))
                           ON CONFLICT DO NOTHING');
    // en iyi süre: ödülün sıfırlandığı sürenin %17–%55'i arası (Tahta: ~51 sn – 2:45), çok hızlılar az
    $time = function (int $l) use ($rnd): array {
        $L = LEAGUES[$l];
        $t0 = $L['start'] / $L['decay'];
        $sec = max($L['min'] + 2, $t0 * (0.17 + 0.38 * $rnd() ** 0.85));
        $ms = (int) round($sec * 10) * 100;
        return [$ms, (int) round($L['start'] - $L['decay'] * $ms / 1000)];
    };
    $pdo->beginTransaction();
    $made = 0; $k = 0;
    foreach (BOT_COUNTS as $league => $n) {
        $L = LEAGUES[$league];
        for ($i = 0; $i < $n; $i++) {
            $name = $names[$k++];
            $stage = $league === LAST_LEAGUE ? 1 + (int) ($rnd() < 0.35) : 1;
            // para: başlangıç bakiyesi ile geçme sınırı arası, çoğu alt yarıda
            $money = (int) (round((START_MONEY + ($L['limit'] - START_MONEY) * (0.02 + 0.95 * $rnd() ** 1.35)) / 50) * 50);
            $age = (int) (86400 * (25 + 90 * $rnd()));
            $seen = (int) (86400 * 18 * $rnd() ** 2);
            $insP->execute([$name, mb_strtolower($name), $league, $stage, $money, $age, $seen]);
            $id = $insP->fetchColumn();
            if (!$id) continue;
            $made++;
            // geçtiği liglerin rekorları kalır; bulunduğu ligde çoğunun bir süresi var
            for ($l = 1; $l <= $league; $l++) {
                $keys = $l === LAST_LEAGUE ? array_map(fn($s) => "L7-$s", range(1, $stage)) : ["L$l"];
                foreach ($keys as $j => $key) {
                    $current = $l === $league && ($l !== LAST_LEAGUE || $j === count($keys) - 1);
                    if ($current && $rnd() < 0.25) continue;   // bu ligde henüz bitiremedi
                    [$ms, $reward] = $time($l);
                    $insT->execute([$id, $key, $ms, $reward, (int) ($seen + ($age - $seen) * $rnd())]);
                }
            }
        }
    }
    $pdo->commit();
    return $made;
}

function deleteBots(PDO $pdo): int { return $pdo->exec('DELETE FROM players WHERE bot'); }

// gerçekçi kullanıcı adları: oyuncu takma adları, isim + rakam, İngilizce rumuzlar (tekrar yok)
function botNames(int $n, callable $rnd): array {
    $pick = fn(array $a) => $a[(int) ($rnd() * count($a))];
    $tr1 = ['Gece', 'Neon', 'Kartal', 'Palmiye', 'Turbo', 'Hayalet', 'Mavi', 'Kızıl', 'Şimşek', 'Gölge', 'Çakal', 'Asi', 'Deli', 'Sessiz', 'Vahşi', 'Altın', 'Kara', 'Fırtına', 'Sahil', 'Gri'];
    $tr2 = ['Kurt', 'Avcı', 'Reis', 'Kaptan', 'Pilot', 'Usta', 'Joker', 'Şahin', 'Panter', 'Tilki', 'Aslan', 'Kobra', 'Kartal', 'Yolcu', 'Sürücü'];
    $first = ['emre', 'burak', 'selin', 'mert', 'ayse', 'can', 'zeynep', 'okan', 'deniz', 'efe', 'kerem', 'elif', 'baris', 'onur', 'ece', 'arda', 'irem', 'tolga', 'yusuf', 'melis', 'serkan', 'ozan', 'berk', 'gizem', 'hakan', 'cem', 'ilker', 'eda', 'umut', 'sinan'];
    $last = ['kaya', 'yilmaz', 'demir', 'sahin', 'celik', 'aydin', 'ozturk', 'arslan', 'dogan', 'kilic', 'koc', 'kurt', 'polat', 'erdem', 'aksoy'];
    $en = ['drift', 'nitro', 'viper', 'ghost', 'shadow', 'rider', 'blaze', 'storm', 'racer', 'neo', 'vice', 'sunset', 'palm', 'turbo', 'wolf', 'hawk', 'rogue', 'ace', 'zero', 'flash'];
    $en2 = ['king', 'boy', 'queen', 'master', 'hunter', 'x', 'pro', 'lord', 'kid', 'runner'];
    $out = []; $seen = [];
    while (count($out) < $n) {
        $r = $rnd();
        if ($r < 0.22) $s = $pick($tr1) . $pick($tr2) . ($rnd() < 0.4 ? (string) mt_rand(1, 99) : '');
        elseif ($r < 0.52) $s = $pick($first) . $pick(['_', '.', '', '_']) . ($rnd() < 0.5 ? (string) mt_rand(1, 99) : $pick(['34', '06', '35', '1907', '1903', '61', '16', '07', '2000', '98', '01']));
        elseif ($r < 0.68) $s = $pick($first) . $pick(['_', '.']) . $pick($last);
        elseif ($r < 0.9) $s = $pick($en) . $pick(['_', '', '']) . $pick($en2) . ($rnd() < 0.5 ? (string) mt_rand(1, 999) : '');
        else $s = ucfirst($pick($en)) . ucfirst($pick($tr2));
        $s = mb_substr($s, 0, 20);
        $lc = mb_strtolower($s);
        if (mb_strlen($s) < 3 || isset($seen[$lc])) continue;
        $seen[$lc] = true; $out[] = $s;
    }
    return $out;
}
