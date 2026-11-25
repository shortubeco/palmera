// Yükleme ilerlemesi: veri dosyalarını akış olarak indirip inen baytları sayar.
// Beklenen boyutlar index.php'nin gömdüğü window.ASSET_SIZES'ten (yoksa yaklaşık sabitler).
const SIZES = (typeof window !== 'undefined' && window.ASSET_SIZES) || {};
const FALLBACK = {
  'buildings.json': 3e5, 'buildings.bin': 32e6, 'vehicles.json': 2e4, 'vehicles.bin': 1e6, 'west.json': 14e3,
  'nature.json': 3e4, 'nature.bin': 6e6, 'animals.json': 2.5e6, 'west.bin': 4.2e6, 'west_chars.json': 1.2e6,
};
const files = {};
const nameOf = (url) => url.split('?')[0].split('/').pop();
const expected = (n) => SIZES[n] || FALLBACK[n] || 1e6;

// fetch yerine: aynı Response'u döner (r.ok, json(), arrayBuffer() çalışır), arada baytları sayar
export function trackedFetch(url) {
  const n = nameOf(url);
  const f = files[n] = { got: 0, total: expected(n), done: false };
  return fetch(url).then(async (r) => {
    if (!r.ok || !r.body || !r.body.getReader) { f.done = true; return r; }
    const reader = r.body.getReader(), chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); f.got += value.length;
      if (f.got > f.total) f.total = f.got;
    }
    f.done = true;
    return new Response(new Blob(chunks), { status: r.status, statusText: r.statusText });
  }, (e) => { f.done = true; throw e; });
}

// verilen dosyaların toplam indirme oranı (0..1); henüz istenmemiş dosya 0 sayılır
export function downloadProgress(names) {
  let got = 0, total = 0;
  for (const n of names) {
    const f = files[n], T = f ? f.total : expected(n);
    total += T; got += f ? (f.done ? T : f.got) : 0;
  }
  return total ? got / total : 1;
}

// çubuğu doldurur; p >= 1 iken tamamen yeşil
export function setBar(el, p) {
  if (!el) return;
  p = Math.max(0, Math.min(1, p));
  el.style.width = (p * 100).toFixed(1) + '%';
  el.classList.toggle('full', p >= 1);
}
