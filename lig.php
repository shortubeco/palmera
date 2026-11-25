<?php
// Palmera Nights — lig API'si (JSON). Para ve süreyi sunucu hesaplar; tarayıcı yalnız "görev başladı / bitti" der.
declare(strict_types=1);
require __DIR__ . '/server/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): never { out(['ok' => false, 'error' => $msg], $code); }

try {
    $pdo = db();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $a = $_GET['a'] ?? '';
        if ($a === 'board') {
            $l = (int) ($_GET['league'] ?? 1);
            if (!isset(LEAGUES[$l])) fail('Böyle bir lig yok.');
            out(['ok' => true] + leagueBoards($l));
        }
        if ($a === 'me') {
            $pid = currentPlayerId();
            if (!$pid) fail('Giriş yapılmadı.', 401);
            out(['ok' => true, 'me' => playerState($pid)]);
        }
        fail('Bilinmeyen istek.');
    }
    // yazma istekleri yalnız JSON (başka sitedeki bir form bu isteği gönderemez)
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) fail('JSON gerekli.', 415);
    $in = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($in)) fail('Geçersiz istek.');
    $a = (string) ($in['a'] ?? '');

    // ---------- hesap ----------
    if ($a === 'register' || $a === 'login') {
        $u = trim((string) ($in['u'] ?? ''));
        $p = (string) ($in['p'] ?? '');
        $len = mb_strlen($u);
        if ($len < 3 || $len > 20 || !preg_match('/^[\p{L}\p{N}_.\-]+$/u', $u)) fail('Kullanıcı adı 3–20 karakter olmalı (harf, rakam, _ . -).');
        if (strlen($p) < 6 || strlen($p) > 72) fail('Şifre en az 6 karakter olmalı.');
        $lc = mb_strtolower($u);
        startSession();
        if ($a === 'register') {
            $st = $pdo->prepare('INSERT INTO players (username, uname_lc, pass_hash, money) VALUES (?, ?, ?, ?) ON CONFLICT (uname_lc) DO NOTHING RETURNING id');
            $st->execute([$u, $lc, password_hash($p, PASSWORD_DEFAULT), START_MONEY]);
            $id = $st->fetchColumn();
            if (!$id) fail('Bu kullanıcı adı alınmış.');
        } else {
            $st = $pdo->prepare('SELECT id, pass_hash FROM players WHERE uname_lc = ?');
            $st->execute([$lc]);
            $row = $st->fetch();
            if (!$row || !password_verify($p, $row['pass_hash'])) { usleep(400000); fail('Kullanıcı adı ya da şifre yanlış.'); }
            $id = $row['id'];
        }
        session_regenerate_id(true);
        $_SESSION['pid'] = (int) $id;
        out(['ok' => true, 'me' => playerState((int) $id)]);
    }
    if ($a === 'logout') {
        startSession();
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    // ---------- buradan sonrası giriş ister ----------
    $pid = currentPlayerId();
    if (!$pid) fail('Giriş yapılmadı.', 401);
    $pdo->prepare('UPDATE players SET last_seen = now() WHERE id = ?')->execute([$pid]);

    switch ($a) {
        case 'me':
            out(['ok' => true, 'me' => playerState($pid)]);

        case 'start': {   // görev başladı: deneme kaydı (önceki yarım deneme bırakılmış sayılır)
            $kind = (string) ($in['kind'] ?? '');
            $mission = (string) ($in['mission'] ?? '');
            $p = $pdo->prepare('SELECT league, stage FROM players WHERE id = ?');
            $p->execute([$pid]);
            $pl = $p->fetch();
            $key = null;
            if ($kind === 'league') {
                if (LEAGUES[(int) $pl['league']]['mission'] !== $mission) fail('Bu görev senin liginin görevi değil.');
                $key = missionKey((int) $pl['league'], (int) $pl['stage']);
            } elseif ($kind === 'side') {
                if (!isset(SIDE_MISSIONS[$mission])) fail('Böyle bir yardım görevi yok.');
            } else fail('Geçersiz görev türü.');
            $pdo->prepare("UPDATE attempts SET ended_at = now(), result = 'abandon' WHERE player_id = ? AND ended_at IS NULL")->execute([$pid]);
            $st = $pdo->prepare('INSERT INTO attempts (player_id, kind, mission, mission_key) VALUES (?, ?, ?, ?) RETURNING id');
            $st->execute([$pid, $kind, $mission, $key]);
            out(['ok' => true, 'id' => (int) $st->fetchColumn()]);
        }

        case 'finish': {  // görev bitti: süreyi denetle, ödülü hesapla, rekor + lig atlama
            $id = (int) ($in['id'] ?? 0);
            $ms = (int) ($in['ms'] ?? 0);
            $pdo->beginTransaction();
            $p = $pdo->prepare('SELECT league, stage, money FROM players WHERE id = ? FOR UPDATE');
            $p->execute([$pid]);
            $pl = $p->fetch();
            $at = $pdo->prepare('SELECT kind, mission, mission_key, EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000 AS server_ms
                                 FROM attempts WHERE id = ? AND player_id = ? AND ended_at IS NULL FOR UPDATE');
            $at->execute([$id, $pid]);
            $att = $at->fetch();
            if (!$att) { $pdo->rollBack(); fail('Görev kaydı bulunamadı (başka bir görev başlatılmış olabilir).'); }
            $league = (int) $pl['league']; $stage = (int) $pl['stage'];
            $min = $att['kind'] === 'league' ? LEAGUES[$league]['min'] : SIDE_MISSIONS[$att['mission']];
            $end = $pdo->prepare('UPDATE attempts SET ended_at = now(), result = ?, time_ms = ?, reward = ? WHERE id = ?');
            // oyun içi süre (duraklatma hariç) sunucunun ölçtüğünden uzun olamaz; çok kısa süre de olamaz
            if ($ms < $min * 1000 || $ms > (float) $att['server_ms'] + 3000) {
                $end->execute(['rejected', $ms, 0, $id]);
                $pdo->commit();
                fail('Görev süresi geçersiz sayıldı.');
            }
            $newBest = false;
            if ($att['kind'] === 'league') {
                if ($att['mission_key'] !== missionKey($league, $stage)) { $end->execute(['rejected', $ms, 0, $id]); $pdo->commit(); fail('Lig değişmiş.'); }
                $L = LEAGUES[$league];
                $reward = (int) round($L['start'] - $L['decay'] * $ms / 1000);
                if ($reward <= 0) { $end->execute(['timeout', $ms, 0, $id]); $pdo->commit(); out(['ok' => true, 'reward' => 0, 'timeout' => true, 'me' => playerState($pid)]); }
                $b = $pdo->prepare('SELECT time_ms FROM best_times WHERE player_id = ? AND mission_key = ?');
                $b->execute([$pid, $att['mission_key']]);
                $prev = $b->fetchColumn();
                if ($prev === false || $ms < (int) $prev) {
                    $newBest = true;
                    $pdo->prepare('INSERT INTO best_times (player_id, mission_key, time_ms, reward) VALUES (?, ?, ?, ?)
                                   ON CONFLICT (player_id, mission_key) DO UPDATE SET time_ms = EXCLUDED.time_ms, reward = EXCLUDED.reward, at = now()')
                        ->execute([$pid, $att['mission_key'], $ms, $reward]);
                }
            } else $reward = SIDE_REWARD;
            $end->execute(['done', $ms, $reward, $id]);
            $money = (int) $pl['money'] + $reward;
            $pdo->prepare('INSERT INTO money_log (player_id, delta, reason) VALUES (?, ?, ?)')->execute([$pid, $reward, $att['kind'] === 'league' ? 'league' : 'side']);
            // lig atlama: sınıra ulaşınca bir üst lig (Elmas'ta yeni görev), para başlangıç bakiyesine döner
            $levelUp = null;
            if ($money >= LEAGUES[$league]['limit']) {
                $levelUp = ['from' => $league, 'fromStage' => $stage, 'money' => $money];
                if ($league < LAST_LEAGUE) { $league++; $stage = 1; } else $stage++;
                $levelUp += ['to' => $league, 'toStage' => $stage];
                $money = START_MONEY;
            }
            $pdo->prepare('UPDATE players SET money = ?, league = ?, stage = ? WHERE id = ?')->execute([$money, $league, $stage, $pid]);
            $pdo->commit();
            out(['ok' => true, 'reward' => $reward, 'timeMs' => $ms, 'newBest' => $newBest, 'levelUp' => $levelUp, 'me' => playerState($pid)]);
        }

        case 'fail': {
            $pdo->prepare("UPDATE attempts SET ended_at = now(), result = 'failed' WHERE id = ? AND player_id = ? AND ended_at IS NULL")
                ->execute([(int) ($in['id'] ?? 0), $pid]);
            out(['ok' => true]);
        }

        case 'spend': {   // bilet, hastane, ceza: para yalnız azalır, 0'ın altına inmez
            $reason = (string) ($in['reason'] ?? '');
            $amount = (int) ($in['amount'] ?? 0);
            if (!isset(SPEND[$reason]) || $amount < 1 || $amount > SPEND[$reason]) fail('Geçersiz harcama.');
            $st = $pdo->prepare('UPDATE players p SET money = GREATEST(0, p.money - ?) FROM players o WHERE p.id = ? AND o.id = p.id RETURNING p.money, o.money AS old');
            $st->execute([$amount, $pid]);
            $r = $st->fetch();
            $pdo->prepare('INSERT INTO money_log (player_id, delta, reason) VALUES (?, ?, ?)')->execute([$pid, (int) $r['money'] - (int) $r['old'], $reason]);
            out(['ok' => true, 'money' => (int) $r['money']]);
        }

        case 'city': {    // oyuncu başka şehirde kalırsa sonraki açılışta orada devam eder
            $city = (string) ($in['city'] ?? '');
            if (!in_array($city, CITIES, true)) fail('Geçersiz şehir.');
            $pdo->prepare('UPDATE players SET city = ? WHERE id = ?')->execute([$city, $pid]);
            out(['ok' => true]);
        }
    }
    fail('Bilinmeyen istek.');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('lig.php: ' . $e->getMessage());
    fail('Sunucu hatası.', 500);
}
