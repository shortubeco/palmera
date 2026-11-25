<?php
// Palmera City — ilerleme kaydı (para + tamamlanan görevler)
// GET  → kayıtlı ilerlemeyi döndürür
// POST → {"money": int, "completed": [string]} kaydeder
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dir = __DIR__ . '/data';
$file = $dir . '/save.json';
const MISSION_IDS = ['steal', 'escape', 'delivery', 'boat'];

function load(string $file): array
{
    if (!is_file($file)) {
        return ['money' => 500, 'completed' => [], 'updated' => null];
    }
    $d = json_decode((string) file_get_contents($file), true);
    return is_array($d) ? $d : ['money' => 500, 'completed' => [], 'updated' => null];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    echo json_encode(load($file), JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method']);
    exit;
}

$body = file_get_contents('php://input', false, null, 0, 8192);
$in = json_decode((string) $body, true);
if (!is_array($in) || !isset($in['money']) || !is_numeric($in['money'])) {
    http_response_code(400);
    echo json_encode(['error' => 'geçersiz veri']);
    exit;
}
$money = max(0, min(99999999, (int) $in['money']));
$completed = [];
if (isset($in['completed']) && is_array($in['completed'])) {
    foreach ($in['completed'] as $id) {
        if (is_string($id) && in_array($id, MISSION_IDS, true)) {
            $completed[$id] = true;
        }
    }
}
$lives = isset($in['lives']) && is_numeric($in['lives']) ? max(1, min(3, (int) $in['lives'])) : 3;
$data = ['money' => $money, 'completed' => array_keys($completed), 'lives' => $lives, 'updated' => gmdate('c')];

if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    http_response_code(500);
    echo json_encode(['error' => 'klasör oluşturulamadı']);
    exit;
}
$fp = fopen($file, 'c+');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['error' => 'dosya açılamadı']);
    exit;
}
flock($fp, LOCK_EX);
ftruncate($fp, 0);
fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);
echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE);
