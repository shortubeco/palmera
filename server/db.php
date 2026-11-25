<?php
// Palmera City — lig sistemi: veritabanı bağlantısı, tablolar, lig kuralları (öneriler.md).
// Ayarlar: proje kökündeki config.local.php (yayın paketine girmez; hostingte elle oluşturulur).
declare(strict_types=1);

// lig kuralları: geçme sınırı, görev başındaki ödül, saniyede kesinti, görev (yoksa "yakında"), en kısa makul süre (sn)
const LEAGUES = [
    1 => ['name' => 'Tahta',  'limit' => 100000,  'start' => 15000,  'decay' => 50,  'mission' => 'steal', 'min' => 20],
    2 => ['name' => 'Demir',  'limit' => 250000,  'start' => 25000,  'decay' => 60,  'mission' => null,    'min' => 30],
    3 => ['name' => 'Bakır',  'limit' => 500000,  'start' => 40000,  'decay' => 80,  'mission' => null,    'min' => 30],
    4 => ['name' => 'Gümüş',  'limit' => 1000000, 'start' => 60000,  'decay' => 100, 'mission' => null,    'min' => 30],
    5 => ['name' => 'Altın',  'limit' => 2000000, 'start' => 100000, 'decay' => 150, 'mission' => null,    'min' => 30],
    6 => ['name' => 'Platin', 'limit' => 5000000, 'start' => 200000, 'decay' => 250, 'mission' => null,    'min' => 30],
    // Elmas: üst lig yok; her 5 milyonda yeni görev (stage), para 5.000'e döner
    7 => ['name' => 'Elmas',  'limit' => 5000000, 'start' => 300000, 'decay' => 300, 'mission' => null,    'min' => 30],
];
const LAST_LEAGUE = 7;
const START_MONEY = 5000;
const SIDE_REWARD = 500;
const SIDE_MISSIONS = ['escape' => 15, 'delivery' => 15, 'boat' => 15];   // yardım görevleri => en kısa makul süre (sn)
// para harcama nedenleri ve tek seferde en çok tutar (yalnız azaltır; hile ile para artırılamaz)
const SPEND = ['ticket' => 100000, 'hospital' => 100000, 'fine' => 10000000];
const CITIES = ['palmera', 'casablanca'];

function missionKey(int $league, int $stage): string { return $league === LAST_LEAGUE ? "L7-$stage" : "L$league"; }

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $file = __DIR__ . '/../config.local.php';
    if (!is_file($file)) throw new RuntimeException('config.local.php yok');
    $c = require $file;
    $pdo = new PDO("pgsql:host={$c['host']};port={$c['port']};dbname={$c['db']}", $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    if (!$pdo->query("SELECT to_regclass('public.players')")->fetchColumn()) {
        createTables($pdo);
        require_once __DIR__ . '/seed.php';
        seedBots($pdo);   // yeni kurulumda (hosting) tablolar boş görünmesin
    }
    return $pdo;
}

function createTables(PDO $pdo): void {
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS players (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(20) NOT NULL,
  uname_lc   VARCHAR(20) NOT NULL UNIQUE,
  pass_hash  TEXT NOT NULL,
  league     SMALLINT NOT NULL DEFAULT 1,
  stage      INT NOT NULL DEFAULT 1,
  money      BIGINT NOT NULL DEFAULT 5000,
  city       VARCHAR(20) NOT NULL DEFAULT 'palmera',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bot        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS players_league_money ON players (league, money DESC);
CREATE TABLE IF NOT EXISTS best_times (
  player_id   INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mission_key VARCHAR(16) NOT NULL,
  time_ms     INT NOT NULL,
  reward      INT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mission_key)
);
CREATE INDEX IF NOT EXISTS best_times_key ON best_times (mission_key, time_ms);
CREATE TABLE IF NOT EXISTS attempts (
  id          BIGSERIAL PRIMARY KEY,
  player_id   INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind        VARCHAR(8) NOT NULL,
  mission     VARCHAR(16) NOT NULL,
  mission_key VARCHAR(16),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  result      VARCHAR(10),
  time_ms     INT,
  reward      INT
);
CREATE INDEX IF NOT EXISTS attempts_player ON attempts (player_id, id DESC);
CREATE TABLE IF NOT EXISTS money_log (
  id        BIGSERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  delta     BIGINT NOT NULL,
  reason    VARCHAR(20) NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL);
}

function startSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('pnsess');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 60, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

function currentPlayerId(): ?int {
    startSession();
    return isset($_SESSION['pid']) ? (int) $_SESSION['pid'] : null;
}

// oyuncunun durumu + sıraları (ESC penceresi, oyun sayfası)
function playedBefore(int $pid): bool {
    $st = db()->prepare('SELECT EXISTS (SELECT 1 FROM attempts WHERE player_id = ?)');
    $st->execute([$pid]);
    return (bool) $st->fetchColumn();
}
function playerState(int $pid): ?array {
    $pdo = db();
    $st = $pdo->prepare('SELECT id, username, league, stage, money, city FROM players WHERE id = ?');
    $st->execute([$pid]);
    $p = $st->fetch();
    if (!$p) return null;
    $league = (int) $p['league']; $stage = (int) $p['stage']; $key = missionKey($league, $stage);
    $r = $pdo->prepare('SELECT 1 + COUNT(*) FROM players WHERE league = ? AND money > ?');
    $r->execute([$league, $p['money']]);
    $moneyRank = (int) $r->fetchColumn();
    $n = $pdo->prepare('SELECT COUNT(*) FROM players WHERE league = ?');
    $n->execute([$league]);
    $b = $pdo->prepare('SELECT time_ms FROM best_times WHERE player_id = ? AND mission_key = ?');
    $b->execute([$pid, $key]);
    $best = $b->fetchColumn();
    $timeRank = null;
    $c = $pdo->prepare('SELECT COUNT(*) FROM best_times WHERE mission_key = ?');
    $c->execute([$key]);
    $timeCount = (int) $c->fetchColumn();
    if ($best !== false) {
        $t = $pdo->prepare('SELECT 1 + COUNT(*) FROM best_times WHERE mission_key = ? AND time_ms < ?');
        $t->execute([$key, $best]);
        $timeRank = (int) $t->fetchColumn();
    }
    return [
        'id' => (int) $p['id'], 'username' => $p['username'], 'league' => $league, 'stage' => $stage,
        'money' => (int) $p['money'], 'city' => $p['city'], 'missionKey' => $key,
        'moneyRank' => $moneyRank, 'leaguePlayers' => (int) $n->fetchColumn(),
        'bestMs' => $best === false ? null : (int) $best, 'timeRank' => $timeRank, 'timeCount' => $timeCount,
        // hiç görev başlatmamış (yeni üye): oyun 15:00'te açılır, sonrakilerde saat rastgele (main.js)
        'played' => playedBefore($pid),
    ];
}

// lig tabloları (landing page): en çok para + en iyi süre, ilk $n
function leagueBoards(int $league, int $n = 20): array {
    $pdo = db();
    $m = $pdo->prepare('SELECT username, money FROM players WHERE league = ? ORDER BY money DESC, last_seen ASC LIMIT ' . (int) $n);
    $m->execute([$league]);
    // süre tablosu: lig görevi (Elmas'ta ilk görev); lig atlayanların rekoru kalır
    $key = missionKey($league, 1);
    $t = $pdo->prepare('SELECT p.username, b.time_ms, b.reward FROM best_times b JOIN players p ON p.id = b.player_id
                        WHERE b.mission_key = ? ORDER BY b.time_ms ASC, b.at ASC LIMIT ' . (int) $n);
    $t->execute([$key]);
    return ['money' => $m->fetchAll(), 'time' => $t->fetchAll()];
}

function leaguesForClient(): array {
    $out = [];
    foreach (LEAGUES as $i => $L) $out[$i] = $L + ['id' => $i];
    return ['leagues' => $out, 'startMoney' => START_MONEY, 'sideReward' => SIDE_REWARD, 'last' => LAST_LEAGUE];
}
