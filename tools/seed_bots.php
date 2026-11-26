<?php
// Lig tablolarına bot oyuncu ekler / siler (yalnız komut satırından).
//   php tools/seed_bots.php          → botları sil + yeniden oluştur
//   php tools/seed_bots.php --sil    → yalnız botları sil
// Yeni kurulumda (hosting) tablolar ilk açılışta botlarla birlikte kurulur; bu araç yereldeki mevcut veritabanı için.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require __DIR__ . '/../server/db.php';
require_once __DIR__ . '/../server/seed.php';

$pdo = db();
$pdo->exec('ALTER TABLE players ADD COLUMN IF NOT EXISTS bot BOOLEAN NOT NULL DEFAULT false');
echo 'silinen bot: ', deleteBots($pdo), "\n";
if (in_array('--sil', $argv, true)) exit;
echo 'eklenen bot: ', seedBots($pdo, random_int(1, 1 << 30)), "\n";
echo 'Drift Park bot rekoru: ', seedParkBots($pdo, random_int(1, 1 << 30), true), "\n";   // botlar silinince park rekorları da gider (ON DELETE CASCADE)
foreach (LEAGUES as $i => $L) {
    $n = $pdo->query("SELECT count(*) FROM players WHERE league = $i")->fetchColumn();
    $t = $pdo->query("SELECT count(*) FROM best_times WHERE mission_key = '" . missionKey($i, 1) . "'")->fetchColumn();
    echo str_pad($L['name'], 8), " oyuncu $n · süre kaydı $t\n";
}
