// Wild West — Palmera'nın batısında, boğazın karşısındaki çöl kasabası + güneybatıdaki Cañón Rojo kanyon adası.
// Arazi yüksekliği, yollar, Palmera'dan gelen araç köprüsü (Puente Oeste), kanyona yaya köprüsü, kasaba yerleşimi,
// modeller (assets/web/west.json/.bin ← tools/west/convert.mjs) ve çizim (tür × bölge başına InstancedMesh, uzaklık ayıklama).
import { trackedFetch } from './progress.js';
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';
import { WestLife, loadCowboyKit } from './westlife.js';

// ---------- bölge ----------
export const WEST_X = -545;   // bunun batısı Wild West bölgesi (deniz dahil)
const MAIN = { cx: -1075, cz: -10, rx: 375, rz: 455 };   // ana kara (köşeleri yuvarlak dikdörtgen)
export const CANYON = { cx: -1130, cz: 655, rx: 220, rz: 135 };   // Cañón Rojo adası (yalnız yaya)
export const ROAD_Y = 0.35;
// Puente Oeste: Palmera'nın batı şeridinden (x0) ana karaya (x1) araç köprüsü, z sabit
export const WBR = { z: -40, x0: -545, x1: -712, hw: 6, H: 7 };
// Pasarela del Cañón: ana karanın güney kıyısından kanyon adasına yaya köprüsü (x sabit)
export const ROPE = { x: -1110, z0: 436, z1: 532, hw: 1.3, H: 2.2 };
export const TOWN = { x0: -1065, x1: -760, z0: -178, z1: 72, street: -40, hw: 9 };   // düz kasaba alanı (yan yollar dahil)

const shoreA = (a, s) => 1 + s * (0.5 * Math.sin(3 * a + 1.3) + 0.3 * Math.sin(7 * a + 0.4) + 0.2 * Math.sin(13 * a + 2));
// 0 = orta, 1 = kıyı
export function mainDN(x, z) {
  const dx = (x - MAIN.cx) / MAIN.rx, dz = (z - MAIN.cz) / MAIN.rz;
  return Math.pow(dx ** 4 + dz ** 4, 0.25) / shoreA(Math.atan2(dz, dx), 0.035);
}
export function canyonDN(x, z) {
  const dx = (x - CANYON.cx) / CANYON.rx, dz = (z - CANYON.cz) / CANYON.rz;
  return Math.hypot(dx, dz) / shoreA(Math.atan2(dz, dx) + 1, 0.09);
}

// ---------- yollar (toprak) ----------
export const ROADS = [
  { hw: 7, pts: [[-700, -40], [-1070, -40], [-1135, -75], [-1185, -140]] },                 // ana yol: köprü → kasaba → batı
  { hw: 5, pts: [[-870, -40], [-870, 60], [-900, 160], [-980, 260], [-1060, 340], [-1110, 412], [-1110, 432]] },  // güney: kanyon köprüsüne
  { hw: 5, pts: [[-905, -40], [-905, -160], [-940, -260]] },                                 // kuzey: çiftlik
];
// en yakın yol: { d (kenardan uzaklık), hw } (yoksa d = 1e9)
const _rd = { d: 1e9, hw: 0 };
export function roadDist(x, z) {
  _rd.d = 1e9; _rd.hw = 0;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.hw;
    if (d < _rd.d) { _rd.d = d; _rd.hw = r.hw; }
  }
  return _rd;
}

// ---------- mesa tepeleri (düz tepeli kayalıklar) ----------
// ana kara: kenarlarda dekor, kanyon adası: aralarında patikalar
const MESAS = [
  { x: -1330, z: -300, r: 70, h: 30 }, { x: -1375, z: 60, r: 55, h: 38 }, { x: -1290, z: 300, r: 58, h: 24 },
  { x: -1010, z: -370, r: 38, h: 16 }, { x: -1175, z: -335, r: 30, h: 20 }, { x: -770, z: 300, r: 28, h: 12 },
  { x: -1225, z: 150, r: 24, h: 14 }, { x: -760, z: -320, r: 22, h: 9 },
];
const CMESAS = [
  { x: -1290, z: 610, r: 38, h: 24 }, { x: -1215, z: 725, r: 30, h: 18 }, { x: -1060, z: 745, r: 26, h: 20 },
  { x: -1000, z: 598, r: 28, h: 16 }, { x: -1185, z: 572, r: 17, h: 12 }, { x: -1322, z: 705, r: 22, h: 15 },
  { x: -938, z: 682, r: 16, h: 11 },
  // kaya sütunları
  { x: -1182, z: 664, r: 4.5, h: 14, hoodoo: true }, { x: -1078, z: 688, r: 4, h: 12, hoodoo: true },
  { x: -1240, z: 556, r: 3.6, h: 10, hoodoo: true }, { x: -1046, z: 568, r: 4.2, h: 13, hoodoo: true },
  { x: -1158, z: 760, r: 3.8, h: 11, hoodoo: true }, { x: -968, z: 626, r: 3.4, h: 9, hoodoo: true },
];
// kanyon patikaları (kanyon tabanında; yerleşim bunlardan uzak durur)
export const CTRAILS = [
  [[-1110, 532], [-1112, 575], [-1150, 620], [-1205, 648], [-1246, 664]],
  [[-1112, 575], [-1062, 618], [-1024, 676], [-992, 728]],
  [[-1150, 620], [-1140, 700], [-1104, 762]],
];
export const MINE = { x: -1258, z: 652 };   // maden girişi (batıdaki büyük kayalığın doğu yüzü)
function trailDist(x, z) {
  let best = 1e9;
  for (const l of CTRAILS) for (let i = 0; i + 1 < l.length; i++) {
    const [ax, az] = l[i], [bx, bz] = l[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
// kayalık yüksekliği — kenar gürültülü, iki kademeli; _mk = kayalık katsayısı (0 dışarı, 1 tepe)
let _mk = 0;
function mesaH(list, x, z) {
  let h = 0, k = 0;
  const E = list === CMESAS ? 2 : 3.5;   // kanyonda dik kayalık
  for (const m of list) {
    const dx = x - m.x, dz = z - m.z;
    if (Math.abs(dx) > m.r * 1.3 + 8 || Math.abs(dz) > m.r * 1.3 + 8) continue;
    const a = Math.atan2(dz, dx), d = Math.hypot(dx, dz);
    const r = m.r * (1 + (m.hoodoo ? 0.08 : 0.13) * Math.sin(3 * a + m.x) + 0.07 * Math.sin(8 * a + m.z));
    const edge = m.hoodoo ? 1.2 : E;
    const k1 = smoothstep(r + edge, r, d);
    if (k1 <= 0) continue;
    const k2 = m.hoodoo ? k1 : smoothstep(r * 0.72 + edge, r * 0.72, d);
    const top = m.h * (0.55 * k1 + 0.45 * k2) + (k2 > 0.95 ? 0.4 * Math.sin(x * 0.4) * Math.cos(z * 0.37) : 0);
    if (top > h) h = top;
    k = Math.max(k, k1);
  }
  _mk = k;
  return h;
}
const dunes = (x, z) => 0.9 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.6) + 0.6 * Math.sin((x - z) * 0.013 + 0.4) + 0.35 * Math.sin(x * 0.05) * Math.sin(z * 0.043);

// Wild West bölgesinde zemin (x < WEST_X): deniz −4
export function westHeight(x, z) {
  const dm = mainDN(x, z), dc = canyonDN(x, z);
  if (dm < 1.12) {
    let h;
    if (dm >= 1) h = lerp(0.1, -4, smoothstep(1, 1.12, dm));
    else {
      h = 0.15 + 0.25 * smoothstep(1, 0.95, dm) + (1.3 + dunes(x, z)) * smoothstep(0.96, 0.82, dm);
      const m = mesaH(MESAS, x, z);
      if (m > 0) h += m * smoothstep(1, 0.9, dm);
    }
    // yol ve kasaba düzlüğü
    const rd = roadDist(x, z);
    let flat = smoothstep(7, 1.5, rd.d);
    const tx = Math.max(TOWN.x0 - x, x - TOWN.x1, 0), tz = Math.max(TOWN.z0 - z, z - TOWN.z1, 0);
    flat = Math.max(flat, smoothstep(14, 0, Math.hypot(tx, tz)));
    if (flat > 0 && dm < 1.02) h = lerp(h, ROAD_Y, flat);
    return h;
  }
  if (dc < 1.12) {
    if (dc >= 1) return lerp(0.1, -4, smoothstep(1, 1.12, dc));
    let h = 0.2 + 0.3 * smoothstep(1, 0.93, dc) + (0.5 + 0.35 * dunes(x, z)) * smoothstep(0.95, 0.8, dc);
    const m = mesaH(CMESAS, x, z);
    if (m > 0) h += m * smoothstep(1, 0.9, dc);
    return h;
  }
  return -4;
}

// ---------- köprüler ----------
export const westDeck = (x) => {
  const t = clamp((WBR.x0 - x) / (WBR.x0 - WBR.x1), 0, 1);
  return 0.4 + (WBR.H - 0.4) * Math.sin(Math.PI * t) ** 0.8;
};
export const onWestBridge = (x, z) => Math.abs(z - WBR.z) < WBR.hw + 0.6 && x < WBR.x0 + 0.5 && x > WBR.x1 - 0.5;
// köprü uçlarını karaya oturt
ROPE.yA = westHeight(ROPE.x, ROPE.z0) + 0.25; ROPE.yB = westHeight(ROPE.x, ROPE.z1) + 0.25;
export const ropeDeck = (z) => {
  const t = clamp((z - ROPE.z0) / (ROPE.z1 - ROPE.z0), 0, 1);
  return lerp(ROPE.yA, ROPE.yB, t) + ROPE.H * Math.sin(Math.PI * t);
};
export const onRope = (x, z) => Math.abs(x - ROPE.x) < ROPE.hw + 0.3 && z > ROPE.z0 - 0.5 && z < ROPE.z1 + 0.5;
// yayalara ayrılmış alan: kanyon adası + yaya köprüsü (araç/tekne giremez)
export const westNoVehicle = (x, z) => canyonDN(x, z) < 1.12 || (Math.abs(x - ROPE.x) < ROPE.hw + 2.5 && z > ROPE.z0 - 1 && z < ROPE.z1 + 1);

// ---------- modeller ----------
// açılışta yalnız tür listesi (14 KB, boyutlar): haritadaki bina izleri için kuru yerleşim bununla yapılır
export async function loadWestMeta(base = 'assets/web/') {
  const r = await trackedFetch(base + 'west.json'); if (!r.ok) throw new Error('west.json ' + r.status);
  return r.json();
}
// asıl modeller: oyuncu Puente Oeste'ye yaklaşınca iner
export async function loadWestKit(meta, base = 'assets/web/') {
  const [j, bin, chars] = await Promise.all([
    meta || loadWestMeta(base),
    trackedFetch(base + 'west.bin').then((r) => { if (!r.ok) throw new Error('west.bin ' + r.status); return r.arrayBuffer(); }),
    loadCowboyKit(base).catch((e) => { console.warn('Kovboy modelleri yüklenemedi:', e); return null; }),
  ]);
  const mats = new Set();
  for (const k of Object.values(j.kinds)) for (const p of k.parts) if (p.mat !== 'vc') mats.add(p.mat);
  const tl = new THREE.TextureLoader(), tex = {};
  await Promise.all([...mats].map(async (m) => {
    const t = await tl.loadAsync(base + 'tex/west/' + m + '.png');
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    tex[m] = t;
  }));
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
  const kinds = {};
  for (const [name, k] of Object.entries(j.kinds)) {
    const gain = name.startsWith('al_') ? 2.2 : 1;   // Aletheia renkleri çok koyu
    kinds[name] = { ...k, geos: k.parts.map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, p.pos, p.count * 3), 3));
      g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, p.nor, p.count * 4), 4), 3, 0, true));
      const c = new Uint8Array(bin, p.col, p.count * 4), col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) for (let q = 0; q < 3; q++) col[i * 3 + q] = Math.min(1, lin[c[i * 4 + q]] * gain);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, p.uv, p.count * 2), 2));
      g.computeBoundingSphere();
      return { g, mat: p.mat };
    }) };
  }
  return { kinds, tex, chars };
}

export class WildWest {
  // dry: yalnız yerleşim hesaplanır (kit = tür listesi), dünyaya çarpışma eklenmez — açılışta harita için
  constructor(world, kit, quality = 'low', dry = false) {
    this.world = world; this.kit = kit; this.quality = quality; this.dry = dry;
    this.shadows = true;   // gölge her kalitede (düşükte alan dar, main.js)
    this.items = [];   // { kind, x, y, z, ry, s }
    this.groups = [];  // çizim grupları
    this.boxes = [];   // harita için bina izleri
    this.lampPts = [];
    this.rails = [];   // salon/otel önündeki at bağlama direkleri: { x, z, side }
    this.corrals = []; // çiftlik ağılları: { x, z, k (yarım kenar), n (at sayısı) }
  }

  size(kind, s = 1) { const k = this.kit?.kinds[kind]; return k ? k.size.map((v) => v * s) : [4, 4, 4]; }

  // bir model yerleştir (+ çarpışma: 'box' eksen hizalı kutu, 'circle' daire, 'long' eksen boyunca daireler, null yok)
  put(kind, x, z, ry = 0, s = 1, col = 'circle', y = null) {
    if (this.kit && !this.kit.kinds[kind]) return null;
    const W = this.world;
    const yy = y ?? W.surfaceHeight(x, z);
    const it = { kind, x, y: yy, z, ry, s };
    this.items.push(it);
    const [w, h, d] = this.size(kind, s);
    if (col === 'box') {
      const q = Math.round(ry / (Math.PI / 2)) & 1, hx = (q ? d : w) / 2, hz = (q ? w : d) / 2;
      if (!this.dry) W.addBox(x - hx, x + hx, z - hz, z + hz, yy - 1, yy + h, 'wbld');
      this.boxes.push([x - hx, z - hz, x + hx, z + hz]);
    } else if (this.dry) return it;
    else if (col === 'circle') {
      W.addCircle(x, z, Math.max(0.2, Math.min(w, d) / 2 * 0.9), yy - 1, yy + h);
    } else if (col === 'long') {
      const L = Math.max(w, d), r = Math.max(0.15, Math.min(w, d) / 2), ax = w >= d;
      const ux = ax ? Math.cos(ry) : Math.sin(ry), uz = ax ? -Math.sin(ry) : Math.cos(ry);
      for (let t = -L / 2 + r; t <= L / 2 - r + 1e-3; t += r * 1.6) W.addCircle(x + ux * t, z + uz * t, r, yy - 1, yy + h);
    }
    return it;
  }

  layout() {
    const rnd = mulberry32(18810);
    const ok = (x, z, r) => {   // yol, kasaba, kıyı, mesa yamacı dışında mı
      if (mainDN(x, z) > 0.93) return false;
      if (roadDist(x, z).d < r + 2) return false;
      if (x > TOWN.x0 - 10 && x < TOWN.x1 + 10 && z > TOWN.z0 - 10 && z < TOWN.z1 + 10) return false;
      mesaH(MESAS, x, z); if (_mk > 0.02) return false;
      return true;
    };
    // --- kasaba: ana cadde (doğu-batı) + ona bağlanan kuzey (çiftlik) ve güney (kanyon) yolları ---
    // Her bina önü yola bakar; yol kavşaklarında boşluk bırakılır. İşaretli (tabelalı) binalar birer kez, gerisi dolgu.
    const S = TOWN.street, hw = TOWN.hw;
    const FILL = [['env_saloon', 1.15], ['env_generic', 1.1], ['al_building', 1], ['al_booth_01', 1], ['al_booth_02', 1], ['al_booth_03', 1], ['al_booth_04', 1], ['env_hotel', 1.1]];
    let prev = '';
    const pickFill = () => { let f; do f = FILL[Math.floor(rnd() * FILL.length)]; while (f[0] === prev); return f; };
    // bina + önündeki süs. (fx, fz): ön yüzün ortası, (nx, nz): yola doğru birim vektör, ry: modelin dönüşü
    const building = (kind, s, cx, cz, ry, fx, fz, nx, nz) => {
      this.put(kind, cx, cz, ry, s, 'box', ROAD_Y);
      prev = kind;
      const px = fx + nx * 1.2, pz = fz + nz * 1.2, r = rnd();
      const ax = Math.abs(nz) > 0.5 ? 0 : Math.PI / 2;   // bağlama direği yola paralel
      if (/saloon|hotel/.test(kind)) {
        this.put('vil_rail', px + nx * 0.6, pz + nz * 0.6, ax, 1, 'long', ROAD_Y);
        if (Math.abs(nz) > 0.5) this.rails.push({ x: px, z: pz + nz * 0.6, side: -Math.sign(nz) });
      } else if (r < 0.35) { this.put('vil_barrel', px - nz * 1.5, pz + nx * 1.5, rnd() * 6, 0.9, 'circle', ROAD_Y); this.put('env_crate0', px - nz * 0.6, pz + nx * 0.6, rnd() * 6, 1.6, 'circle', ROAD_Y); }
      else if (r < 0.6) this.put('env_bench', px + nz * 1.5, pz - nx * 1.5, ry, 1.3, 'circle', ROAD_Y);
    };
    // ana cadde sırası: x0'dan batıya xEnd'e kadar; gap = [xa, xb] kavşak aralıkları
    const STREET_END = -1015;
    const mainRow = (side, xStart, fixed, gaps) => {
      let x = xStart, i = 0;
      while (x > STREET_END) {
        const [kind, s] = i < fixed.length ? fixed[i] : pickFill();
        const [w, , d] = this.size(kind, s);
        const g = gaps.find((q) => x - w < q[1] && x > q[0]);
        if (g) { x = g[0] - 0.5; continue; }   // kavşağı atla
        if (x - w < STREET_END) break;
        i++;
        const cx = x - w / 2, front = S + side * (hw + 2.4);
        building(kind, s, cx, front + side * d / 2, side > 0 ? Math.PI : 0, cx, front, 0, -side);
        x -= w + 2 + rnd() * 2.5;
      }
      return x;
    };
    const NR = { x: -905, hw: 5 }, SR = { x: -870, hw: 5 };   // ROADS[2] ve ROADS[1]'in caddeye bağlanan düz kısmı
    const gapN = [NR.x - NR.hw - 3, NR.x + NR.hw + 3], gapS = [SR.x - SR.hw - 3, SR.x + SR.hw + 3];
    // Grand Hotel: kuzey sırada, girişe yakın; çevresi boş bırakılır
    const HOT = this.hotelLayout(-838, S - (hw + 2.4));
    const gapH = [HOT.x - HOT.W / 2 - 1.5, HOT.x + HOT.W / 2 + 1.5];
    mainRow(-1, -778, [['al_booth_04', 1], ['vil_store', 1], ['env_generic', 1.1], ['vil_saloon', 1], ['env_saloon', 1.15], ['vil_bank', 1]], [gapN, gapH]);
    mainRow(1, -782, [['vil_sheriff', 1], ['al_booth_01', 1], ['env_saloon', 1.15], ['vil_hotel', 1], ['al_building', 1]], [gapS]);
    this.townEnd = STREET_END;
    // yan yol sırası: yol x = R.x, z0'dan z1'e (dir ±1); side −1 batı (doğuya bakar), +1 doğu (batıya bakar)
    const sideStreet = (R, side, z0, z1) => {
      const dir = Math.sign(z1 - z0);
      let z = z0;
      for (;;) {
        const [kind, s] = pickFill(), [w, , d] = this.size(kind, s);
        if ((z1 - (z + dir * w)) * dir < 0) break;
        const cz = z + dir * w / 2, front = R.x + side * (R.hw + 2.4);
        building(kind, s, front + side * d / 2, cz, side > 0 ? -Math.PI / 2 : Math.PI / 2, front, cz, -side, 0);
        z += dir * (w + 2 + rnd() * 2.5);
      }
    };
    for (const side of [-1, 1]) { sideStreet(NR, side, -68, -165); sideStreet(SR, side, -13, 56); }
    // lambalar (gece yanar): ana cadde iki yanı, yan yollar tek yanı; kavşakta yok
    const lamp = (lx, lz) => { this.put('env_light_post1', lx, lz, 0, 1.25, 'circle', ROAD_Y); this.lampPts.push([lx, ROAD_Y + 2.9, lz]); };
    for (let x = -786; x > STREET_END; x -= 22) for (const side of [-1, 1]) {
      const lx = x + (side > 0 ? 11 : 0);
      if ([gapN, gapS].some((q) => lx > q[0] - 1 && lx < q[1] + 1)) continue;
      if (side < 0 && lx > gapH[0] && lx < gapH[1]) continue;   // otelin sundurması
      lamp(lx, S + side * (hw + 0.8));
    }
    for (let z = -72; z > -165; z -= 24) lamp(NR.x + NR.hw + 0.8, z);
    for (let z = -16; z < 56; z += 24) lamp(SR.x - SR.hw - 0.8, z);
    // meydan: caddenin batı ucunda (kuyu, su kulesi, yel değirmeni, at suluğu)
    const PX = STREET_END - 22;
    this.plaza = { x: PX, z: S };
    // kovboyların yürüdüğü yerler: cadde ve yan yol kenarları (doğru parçaları) + meydan
    const wk = hw - 0.6;
    this.townInfo = { plaza: { x: PX + 4, z: S }, walks: [
      [-782, S - wk, STREET_END, S - wk], [-782, S + wk, STREET_END, S + wk],
      [NR.x - 4.4, -60, NR.x - 4.4, -160], [NR.x + 4.4, -60, NR.x + 4.4, -160],
      [SR.x - 4.4, -20, SR.x - 4.4, 55], [SR.x + 4.4, -20, SR.x + 4.4, 55],
    ] };
    this.put('env_well', PX, S - 14, 0, 1.5);
    this.put('env_fountain', PX + 6, S - 14, 0, 1.6, 'long');
    this.put('al_water_tank', PX - 14, S - 22, 0.4, 1.4);
    this.put('env_windmill', PX - 26, S + 22, 0.8, 1.6);
    this.put('al_wanted_poster_board', PX + 8, S + 14, Math.PI / 2, 1);
    this.put('env_hay_roll', PX - 6, S + 16, 1.1, 1.4);
    this.put('env_hay_block', PX - 4, S + 18.5, 0.3, 1.5);
    // kasaba girişi tabelası (doğu) ve köprü başı
    this.put('env_big_sign', -752, S - hw - 3, 0, 1.9, 'long');
    this.signAt = { x: -752, z: S - hw - 3 + 0.45, y: ROAD_Y + 2.9 * 1.9 * 0.62 };
    this.put('al_sign_01', -730, S + hw + 2, Math.PI / 2, 1.2);
    // kasabanın arkası: kulübeler, arabalar
    this.put('al_shed', -800, S - 40, 0, 1.1, 'box'); this.put('al_shed', -842, S + 44, Math.PI, 1.1, 'box');
    this.put('vil_cart', -812, S - 34, 0.6, 1, 'long'); this.put('al_transport_01', -826, S + 56, 2.1, 1.1, 'long');
    this.put('env_trade_cart', -780, S + 30, 1.2, 1.4, 'long');
    // --- çiftlik (kuzey yolu ucu): ahır + iki ağıl ---
    const RX = -948, RZ = -275;
    this.ranch = { x: RX, z: RZ };
    this.put('al_stable', RX - 18, RZ - 6, Math.PI / 2, 1.2, 'box');
    for (const dz of [-20, 4]) {
      this.put('al_animal_fence', RX + 8, RZ + dz, 0, 1.6, null); this.fenceRing(RX + 8, RZ + dz, 1.6);
      this.corrals.push({ x: RX + 8, z: RZ + dz, k: 1.6 * 7.65 / 2, n: dz < 0 ? 3 : 2 });
    }
    this.put('al_chaff', RX - 4, RZ + 14, 0.2, 1.2); this.put('al_chaff', RX - 2.4, RZ + 15.5, 1.2, 1.2);
    this.put('env_water_tank', RX - 6, RZ - 30, 0, 1.4);
    // --- kereste atölyesi (batı yolu) ---
    this.put('al_sawmill_02', -1150, -60, Math.PI * 0.75, 1.1);
    this.put('al_sawmill_01', -1110, -12, -Math.PI / 2, 1.1);
    for (let i = 0; i < 6; i++) this.put('env_tree1', -1170 + rnd() * 50, -10 + rnd() * 40, rnd() * 6, 1.6 + rnd() * 0.8);
    // --- mezarlık + darağacı (kasabanın kuzeydoğusu) ---
    const GX = -800, GZ = -150;
    for (let i = 0; i < 14; i++) this.put(i % 3 ? 'al_grave_01' : 'al_grave_02', GX + (i % 7) * 3.2, GZ + Math.floor(i / 7) * 4, Math.PI + (rnd() - 0.5) * 0.3, 1.2);
    this.put('al_gallows', GX + 26, GZ + 2, 0, 1.6);
    // --- kanyon adası: maden, kamp, kulübe ---
    this.put('al_tunnel', MINE.x, MINE.z, -Math.PI / 2 + 0.25, 1.4, 'long');
    this.put('al_shed', MINE.x + 12, MINE.z + 12, -Math.PI / 2, 1.2, 'box');
    this.put('env_crate1', MINE.x + 9, MINE.z - 6, 0.3, 1.8); this.put('env_barrel', MINE.x + 10, MINE.z - 4.4, 0, 1.8);
    this.put('al_transport_02', MINE.x + 16, MINE.z - 2, 0.9, 1.2, 'long');
    const CX = -998, CZ = 735;   // terk edilmiş kamp
    this.camp = { x: CX, z: CZ };
    this.put('env_cooking_pot', CX, CZ, 0, 1.6); this.put('env_chest', CX + 3, CZ + 1.5, 0.6, 1.6);
    this.put('env_bull_skull', CX - 3, CZ - 2, 1.1, 1.6, null); this.put('env_sack', CX + 2, CZ - 2.5, 0, 1.5);
    // --- çöl dağınıkları ---
    const cacti = ['vil_cactus1', 'vil_cactus2', 'vil_cactus3', 'vil_cactus4', 'vil_cactus5', 'al_cactus_02', 'al_cactus_03', 'env_cactus0', 'env_cactus1', 'env_cactus2'];
    const rocks = ['vil_rock1', 'vil_rock2', 'al_rocks_01', 'al_rocks_02', 'al_rocks_03', 'al_rocks_04'];
    const scatter = (n, list, sMin, sMax, test, col = 'circle') => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const x = lerp(-1450, -700, rnd()), z = lerp(-470, 800, rnd()), s = lerp(sMin, sMax, rnd());
        if (!test(x, z, s)) continue;
        this.put(list[Math.floor(rnd() * list.length)], x, z, rnd() * Math.PI * 2, s, col);
        i++;
      }
    };
    const onCanyon = (x, z) => {
      if (canyonDN(x, z) > 0.92 || trailDist(x, z) < 4 || Math.hypot(x - CX, z - CZ) < 10 || Math.hypot(x - MINE.x - 8, z - MINE.z) < 16) return false;
      mesaH(CMESAS, x, z); return _mk < 0.02;
    };
    scatter(260, cacti, 1.1, 1.9, (x, z) => ok(x, z, 1));
    scatter(140, rocks, 0.8, 2.6, (x, z) => ok(x, z, 2));
    scatter(40, ['env_tumbleweed'], 0.9, 1.3, (x, z) => ok(x, z, 1), null);
    scatter(16, ['env_bull_skull'], 1.4, 1.8, (x, z) => ok(x, z, 1), null);
    scatter(110, cacti, 1.1, 2.0, onCanyon);
    scatter(90, rocks, 1, 3.2, onCanyon);
    scatter(14, ['env_tumbleweed'], 0.9, 1.3, onCanyon, null);
    scatter(6, ['env_bull_skull'], 1.4, 1.8, onCanyon, null);
    // kanyon kayalıklarının dibine iri kayalar
    for (const m of CMESAS) {
      if (m.hoodoo) continue;
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, x = m.x + Math.cos(a) * (m.r + 4), z = m.z + Math.sin(a) * (m.r + 4);
        if (canyonDN(x, z) > 0.92 || trailDist(x, z) < 5) continue;
        mesaH(CMESAS, x, z); if (_mk > 0.5) continue;
        this.put(rocks[Math.floor(rnd() * rocks.length)], x, z, rnd() * 6, 2.5 + rnd() * 2);
      }
    }
  }
  // ---------- Grand Hotel: girilebilen 2 katlı otel (kabuk kodla; iç eşyalar kitten) ----------
  // Yerel eksen: lx cadde boyunca (−W/2..W/2), lz ön cepheden içeri negatif (−D..0), sundurma 0..2,8 (caddeye doğru).
  // Zemin katın içi gezilir (bar, masalar, resepsiyon); üst kat dışarıdan görünür, kapalıdır.
  hotelWalls() {
    const W = this.hotel.W / 2, D = this.hotel.D, G = 4, U = 7.6, FF = 10.2;
    const win = (u, w, v0, v1) => [u - w / 2, u + w / 2, v0, v1];
    return [
      // ön: zemin (kapı + 4 pencere), üst kat (4 pencere + balkon kapısı), yalancı cephe
      { ax: 'x', at: 0, u0: -W, u1: W, v0: 0, v1: G, holes: [[-0.85, 0.85, 0, 2.9], win(-7.4, 1.8, 1, 2.6), win(-3.4, 1.8, 1, 2.6), win(3.4, 1.8, 1, 2.6), win(7.4, 1.8, 1, 2.6)] },
      { ax: 'x', at: 0, u0: -W, u1: W, v0: G, v1: U, holes: [win(-7.4, 1.4, 4.9, 6.7), win(-3.4, 1.4, 4.9, 6.7), [-0.65, 0.65, 4.25, 6.7], win(3.4, 1.4, 4.9, 6.7), win(7.4, 1.4, 4.9, 6.7)], upper: true },
      { ax: 'x', at: 0, u0: -W, u1: W, v0: U, v1: FF, holes: [], upper: true },
      { ax: 'x', at: -D, u0: -W, u1: W, v0: 0, v1: U, holes: [] },
      // yanlar (lz boyunca): zeminde ve üstte 2'şer pencere
      ...[-W, W].map((at) => ({ ax: 'z', at, u0: -D, u1: 0, v0: 0, v1: U, holes: [win(-4.5, 1.6, 1, 2.6), win(-11.5, 1.6, 1, 2.6), win(-4.5, 1.3, 4.9, 6.7), win(-11.5, 1.3, 4.9, 6.7)] })),
    ];
  }
  hotelLayout(HX, FZ) {
    const H = this.hotel = { x: HX, z: FZ, W: 22, D: 16, y: ROAD_Y + 0.06 };
    this.boxes.push([HX - H.W / 2, FZ - H.D, HX + H.W / 2, FZ]);
    const y = H.y, P = (lx, lz) => [HX + lx, FZ + lz];
    // iç eşyalar: put() kuru modda yalnız kaydeder
    const put = (kind, lx, lz, ry, s, col = 'circle', dy = 0) => { const [x, z] = P(lx, lz); return this.put(kind, x, z, ry, s, col, y + dy); };
    const CS = 1.2, ch = this.size('env_counter', CS);
    for (const lx of [-8, -8 + ch[0], -8 + ch[0] * 2]) put('env_counter', lx, -12.8, 0, CS, 'long');   // bar tezgâhı
    for (let lx = -8.6; lx < -1; lx += 1.3) put('env_seat', lx, -11.5, 0, 1.15);                       // bar tabureleri
    const top = ch[1];
    put('env_hat', -2.4, -12.8, 0.6, 1.2, null, top); put('env_gun0', -6.2, -12.7, 1.2, 1.3, null, top);
    for (const [k, lx] of [['env_bottle', -7.6], ['env_moonshine_jug', -7.3], ['env_bottle', -5.0], ['env_jug', -3.6], ['env_bottle', -3.3]]) put(k, lx, -12.75, 0, 1.4, null, top);
    // arka raflar: şişeler (rafların kendisi hotelMesh'te)
    for (const sy of [1.35, 1.95, 2.55]) for (let lx = -9.2; lx < -1.2; lx += 0.55) put(rndPick(lx + sy, ['env_bottle', 'env_moonshine_jug', 'env_bottle', 'env_milk_jug']), lx, -15.45, 0, 1.4, null, sy + 0.04);
    // poker masaları + sandalyeler (masaya dönük)
    this.hotelSeats = [];
    for (const [tx, tz, tk] of [[3.4, -10.5, 'env_table2'], [5.8, -7.4, 'env_table2'], [2.4, -4.6, 'env_table'], [5.8, -13.6, 'env_table3']]) {
      put(tk, tx, tz, 0, 1.25);
      put('env_lamp0', tx + 0.15, tz - 0.1, 0, 1.1, null, 0.6 * 1.25);
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const cx = tx + Math.sin(a) * 1.15, cz = tz + Math.cos(a) * 1.15;
        put('env_chair', cx, cz, a + Math.PI, 1.15);
        this.hotelSeats.push([HX + cx, FZ + cz, a + Math.PI]);
      }
    }
    // resepsiyon (sağ ön), fıçılar, kasalar, süpürge
    put('env_counter', 8.6, -2.6, Math.PI / 2, CS, 'long'); put('env_chest', 9.9, -1.1, -Math.PI / 2, 1.3);
    put('env_bucket', 6.8, -1.0, 0, 1.4);
    // --- üst kat: merdiven (sağ duvar boyunca, arkaya doğru çıkar), koridorlar, 4 oda ---
    const F2 = y + 4.25;
    this.stair = { x0: 9.2, x1: 10.75, zb: -5.9, zt: -13.4, n: 17, y0: y, y1: F2 };
    // odalarda kit eşyaları: komodin üstünde lamba, sandalye
    for (const f of this.hotelFurniture()) {
      if (f.t === 'stand') put('env_lamp0', f.lx, f.lz, 0, 1.0, null, 4.25 + 0.55);
      if (f.t === 'chair') put('env_chair', f.lx, f.lz, f.ry, 1.15, 'circle', 4.25);
    }
    for (const [lx, lz] of [[-9.9, -1.4], [-9.9, -2.4], [-9.0, -1.6]]) put('env_barrel', lx, lz, 0, 1.9);
    put('env_crate0', -9.8, -14.9, 0.3, 1.8); put('env_crate1', -9.0, -15.0, 0, 1.8); put('env_broom', 10.4, -15.2, 0, 1.2, null);
    put('env_bull_skull', -5.2, -15.55, 0, 1.6, null, 3.1);
    // menteşeli yarım kapılar (salon kapısı): hotelMesh'te kurulur, WestLife iter
    this.doors = [{ x: HX, z: FZ - 0.12, hw: 0.85, y: y + 0.55, ang: 0, vel: 0, objs: [] }];
    // içerideki kovboylar: barmen, barda dikilen, masada oturan
    this.folk = [
      { kind: 'gunman', x: HX - 5, z: FZ - 14.3, heading: 0 },
      { kind: 'outlaw', x: HX - 3.6, z: FZ - 10.9, heading: Math.PI },
      { kind: 'sheriff', x: this.hotelSeats[0][0], z: this.hotelSeats[0][1], heading: this.hotelSeats[0][2], sit: true },
      { kind: 'outlaw', x: this.hotelSeats[5][0], z: this.hotelSeats[5][1], heading: this.hotelSeats[5][2], sit: true },
    ];
    // önde at bağlama direği + atlar
    { const [x, z] = P(-6, 3.6); this.put('vil_rail', x, z, 0, 1, 'long', ROAD_Y); this.rails.push({ x, z, side: -1 }); }
    if (this.dry) return H;
    // çarpışma: duvar parçaları (kapı açık), sundurma direkleri, piyano, raflar
    const Wd = this.world;
    for (const w of this.hotelWalls()) {
      if (w.v0 >= 7.6) continue;   // yalancı cephe: kimse oraya çıkamaz
      const inward = w.ax === 'x' ? (w.at === 0 ? -1 : 1) : (w.at < 0 ? 1 : -1);
      const p0 = Math.min(w.at, w.at + inward * 0.3) - 0.02, p1 = Math.max(w.at, w.at + inward * 0.3) + 0.02;
      for (const [a, b, v0, v1] of cutHoles(w.u0, w.u1, w.v0, w.v1, w.holes)) {
        if (v1 - v0 < 0.3) continue;   // balkon kapısının altındaki eşik şeridi: üstünden geçilir (yoksa balkondan içeri girilemiyordu)
        const ylo = y + v0 - (v0 === 0 ? 1 : 0);
        if (w.ax === 'x') Wd.addBox(HX + a, HX + b, FZ + p0, FZ + p1, ylo, y + v1, 'wall');
        else Wd.addBox(HX + p0, HX + p1, FZ + a, FZ + b, ylo, y + v1, 'wall');
      }
    }
    for (const lx of HOTEL_COLS) Wd.addCircle(HX + lx, FZ + 2.6, 0.18, y - 1, y + 4);
    Wd.addBox(HX - 10.9, HX - 10.1, FZ - 7.2, FZ - 5.6, y - 1, y + 1.3, 'prop');   // piyano
    Wd.addBox(HX - 9.6, HX - 1.0, FZ - 15.9, FZ - 15.2, y - 1, y + 3, 'prop');     // arka raf
    // üst kat bölmeleri (kapı boşlukları açık)
    for (const w of this.hotelRooms()) for (const [a, b, v0, v1] of cutHoles(w.u0, w.u1, 4.25, 7.6, w.holes)) {
      if (w.ax === 'x') Wd.addBox(HX + a, HX + b, FZ + w.at - 0.1, FZ + w.at + 0.1, y + v0, y + v1, 'wall');
      else Wd.addBox(HX + w.at - 0.1, HX + w.at + 0.1, FZ + a, FZ + b, y + v0, y + v1, 'wall');
    }
    // merdivenin altı: yüksek kısmı yerdeki oyuncuya duvar (basamaklar deckAt ile yürünür)
    { const S = this.stair, zMid = S.zb + (S.zt - S.zb) * 0.55; Wd.addBox(HX + S.x0, HX + S.x1, FZ + S.zt, FZ + zMid, y - 1, y + 2.25, 'prop'); }
    // üst kat mobilyaları + açık kapı kanatları
    for (const f of this.hotelFurniture()) {
      const b = furnBox(f); if (!b) continue;
      Wd.addBox(HX + b[0], HX + b[1], FZ + b[2], FZ + b[3], F2 - 0.2, F2 + b[4], 'prop');
    }
    // balkon korkuluğu (ön ve iki uç)
    Wd.addBox(HX - 11, HX + 11, FZ + 2.65, FZ + 2.85, F2 - 0.3, F2 + 1.1, 'rail');
    for (const s of [-1, 1]) Wd.addBox(HX + s * 11 - 0.1, HX + s * 11 + 0.1, FZ, FZ + 2.85, F2 - 0.3, F2 + 1.1, 'rail');
    return H;
  }
  // üst kat bölme duvarları (yerel; v 4,25..7,6): koridorlar x −1..1 (önden arkaya) ve arka duvar boyunca (lz < −13,4)
  hotelRooms() {
    const dw = (c) => [c - 0.55, c + 0.55, 4.25, 6.55];   // kapı boşluğu
    return [
      { ax: 'z', at: -1, u0: -13.4, u1: -0.25, holes: [dw(-10.1), dw(-3.5)] },
      { ax: 'z', at: 1, u0: -13.4, u1: -0.25, holes: [dw(-10.1), dw(-3.5)] },
      { ax: 'z', at: 9.0, u0: -13.4, u1: -0.25, holes: [] },                     // merdiven boşluğunun yanı
      { ax: 'x', at: -13.4, u0: -10.75, u1: -1, holes: [] }, { ax: 'x', at: -13.4, u0: 1, u1: 9.0, holes: [] },
      { ax: 'x', at: -6.8, u0: -10.75, u1: -1, holes: [] }, { ax: 'x', at: -6.8, u0: 1, u1: 9.0, holes: [] },
    ];
  }
  // oda eşyaları (yerel): yatak (baş ucu lx, ayak yönü dir), dolap (ön yüzü face yönünde), komodin, sandalye, halı, açık kapı
  hotelFurniture() {
    return [
      { t: 'bed', lx: -10.6, lz: -10.1, dir: 1, col: '#8a2a2a' }, { t: 'ward', lx: -5.5, lz: -12.95, face: 1 }, { t: 'stand', lx: -10.4, lz: -8.6 }, { t: 'chair', lx: -3.2, lz: -8.2, ry: Math.PI * 0.8 }, { t: 'rug', lx: -6.5, lz: -10, col: '#3d5a7a' },
      { t: 'bed', lx: -10.6, lz: -2.6, dir: 1, col: '#2f5a44' }, { t: 'ward', lx: -5.2, lz: -6.35, face: 1 }, { t: 'stand', lx: -10.4, lz: -1.1 }, { t: 'chair', lx: -3.0, lz: -1.6, ry: Math.PI }, { t: 'rug', lx: -6.5, lz: -3.2, col: '#7a3d3d' },
      { t: 'bed', lx: 8.85, lz: -10.1, dir: -1, col: '#2a4a8a' }, { t: 'ward', lx: 4.2, lz: -12.95, face: 1 }, { t: 'stand', lx: 8.6, lz: -8.6 }, { t: 'chair', lx: 2.6, lz: -8.0, ry: -Math.PI * 0.8 }, { t: 'rug', lx: 5.5, lz: -10, col: '#7a6a3d' },
      { t: 'bed', lx: 8.85, lz: -2.6, dir: -1, col: '#6a3d7a' }, { t: 'ward', lx: 4.6, lz: -6.35, face: 1 }, { t: 'stand', lx: 8.6, lz: -1.1 }, { t: 'chair', lx: 2.6, lz: -1.6, ry: Math.PI }, { t: 'rug', lx: 5.5, lz: -3.2, col: '#3d7a5a' },
      // açık kapı kanatları: menteşe koridor duvarında, kanat oda içine 90° açık
      ...[[-1, -10.1], [-1, -3.5], [1, -10.1], [1, -3.5]].map(([wx, c]) => ({ t: 'door', lx: wx, lz: c + 0.55, side: wx < 0 ? -1 : 1 })),
    ];
  }
  // üst kat ve merdiven yüzeyi: (x, z) otel içindeyse ve sorgu yüksekliği uygunsa zemin yüksekliği, değilse null
  deckAt(x, z, yq) {
    const H = this.hotel; if (!H || yq === undefined) return null;
    const lx = x - H.x, lz = z - H.z;
    if (lx < -11 || lx > 11 || lz < -16 || lz > 2.85) return null;
    const S = this.stair;
    if (lx > S.x0 && lx < S.x1 && lz < S.zb && lz > S.zt) {
      const t = (S.zb - lz) / (S.zb - S.zt), s = S.y0 + (S.y1 - S.y0) * Math.min(1, Math.ceil(t * S.n) / S.n);
      return yq > s - 1.6 ? s : null;
    }
    if (yq > H.y + 3.2) return H.y + 4.25;   // üst kat ve balkon aynı yükseklikte
    return null;
  }

  hotelMesh(scene) {
    const H = this.hotel, HX = H.x, FZ = H.z, y = H.y, hw = H.W / 2, D = H.D;
    const ext = new TexBox(), int = new TexBox(), floor = new TexBox(), ceil = new TexBox(), trim = new Box();
    this.glass = [];
    const cream = c3('#efe3c4'), green = c3('#2f5a44'), dark = c3('#3a2a1c'), white = c3('#ffffff'), red = c3('#8a2a22');
    const X = (lx) => HX + lx, Z = (lz) => FZ + lz;
    // duvarlar: dış kaplama (dışta 0,15 m) + iç kaplama (içte 0,1 m)
    for (const w of this.hotelWalls()) {
      const inward = w.ax === 'x' ? (w.at === 0 ? -1 : 1) : (w.at < 0 ? 1 : -1);   // binanın içine doğru
      for (const [a, b, v0, v1] of cutHoles(w.u0, w.u1, w.v0, w.v1, w.holes)) {
        const layers = [[ext, 0, 0.15]]; if (!w.upper || w.v1 <= 7.6) layers.push([int, 0.15, 0.25]);
        if (w.v0 >= 7.6) layers.length = 1;
        for (const [B, t0, t1] of layers) {
          const p0 = w.at + inward * t0, p1 = w.at + inward * t1, lo = Math.min(p0, p1), hi = Math.max(p0, p1);
          if (w.ax === 'x') B.box(X(a), y + v0, Z(lo), X(b), y + v1, Z(hi), white);
          else B.box(X(lo), y + v0, Z(a), X(hi), y + v1, Z(b), white);
        }
      }
      // pencere çerçeveleri + cam
      for (const h of w.holes) {
        if (h[2] === 0 || h[2] === 4.25) continue;   // giriş kapısı, balkon kapısı (açık)
        const [a, b, v0, v1] = h, t = 0.08;
        const fb = (u0, u1, w0, w1) => {
          const o = w.at + (w.ax === 'x' ? 0.06 : (w.at < 0 ? -0.06 : 0.06));
          if (w.ax === 'x') trim.box(X(u0), y + w0, Z(o - 0.32), X(u1), y + w1, Z(o + 0.02), cream);
          else trim.box(X(o - 0.17), y + w0, Z(u0), X(o + 0.17), y + w1, Z(u1), cream);
        };
        fb(a - t, b + t, v0 - t - 0.06, v0); fb(a - t, b + t, v1, v1 + t); fb(a - t, a, v0, v1); fb(b, b + t, v0, v1);
        fb((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, v0, v1);
        this.glass.push({ ax: w.ax, at: w.at, a, b, v0, v1, upper: v0 >= 4 });
      }
    }
    // zemin, tavan (üst kat döşemesi), çatı, yalancı cephe tepesi, korniş
    floor.box(X(-hw + 0.2), y - 0.06, Z(-D + 0.2), X(hw - 0.2), y, Z(-0.2), white);
    floor.box(X(-hw), y - 0.06, Z(0), X(hw), y, Z(2.8), white);                     // sundurma
    // zemin kat tavanı = üst kat döşemesi (merdiven boşluğu açık); üst katın tavanı
    const St = this.stair;
    for (const [a, b, c, d] of cutHoles(-hw + 0.2, hw - 0.2, -D + 0.2, -0.2, [[St.x0, St.x1, St.zt, St.zb]])) {
      ceil.box(X(a), y + 4, Z(c), X(b), y + 4.23, Z(d), white);
      floor.box(X(a), y + 4.23, Z(c), X(b), y + 4.25, Z(d), white);
    }
    ceil.box(X(-hw + 0.2), y + 7.5, Z(-D + 0.2), X(hw - 0.2), y + 7.6, Z(-0.2), white);
    // üst kat bölmeleri (iki yüzü iç kaplama)
    for (const w of this.hotelRooms()) for (const [a, b, v0, v1] of cutHoles(w.u0, w.u1, 4.25, 7.5, w.holes)) {
      if (w.ax === 'x') int.box(X(a), y + v0, Z(w.at - 0.08), X(b), y + v1, Z(w.at + 0.08), white);
      else int.box(X(w.at - 0.08), y + v0, Z(a), X(w.at + 0.08), y + v1, Z(b), white);
    }
    // merdiven: dolu basamaklar + açık yanda tırabzan
    {
      const run = (St.zb - St.zt) / St.n, rise = (St.y1 - St.y0) / St.n;
      for (let i = 0; i < St.n; i++) {
        const zf = St.zb - i * run, top = St.y0 + (i + 1) * rise;
        floor.box(X(St.x0), y, Z(zf - run), X(St.x1), top, Z(zf), white);
        if (i % 2 === 0) trim.box(X(St.x0 + 0.02), top, Z(zf - run / 2 - 0.04), X(St.x0 + 0.1), top + 0.95, Z(zf - run / 2 + 0.04), cream);
        trim.box(X(St.x0), top + 0.92, Z(zf - run), X(St.x0 + 0.12), top + 0.98 + rise, Z(zf), dark);
      }
    }
    // oda eşyaları
    const wood = c3('#5a3a24'), wood2 = c3('#704a2e'), sheet = c3('#e8e2d2'), brass = c3('#c9a34a');
    for (const f of this.hotelFurniture()) {
      const F = y + 4.25;
      if (f.t === 'bed') {
        const x0 = f.dir > 0 ? f.lx : f.lx - 2.1, x1 = x0 + 2.1, hx = f.dir > 0 ? f.lx : f.lx - 0.12;
        trim.box(X(x0), F, Z(f.lz - 0.75), X(x1), F + 0.42, Z(f.lz + 0.75), wood);            // çerçeve
        trim.box(X(hx), F, Z(f.lz - 0.78), X(hx + 0.12), F + 1.15, Z(f.lz + 0.78), wood2);      // baş tahtası
        trim.box(X(x0 + 0.08), F + 0.42, Z(f.lz - 0.68), X(x1 - 0.06), F + 0.6, Z(f.lz + 0.68), sheet);   // şilte
        const bx0 = f.dir > 0 ? f.lx + 0.75 : x0, bx1 = f.dir > 0 ? x1 : f.lx - 0.75;
        trim.box(X(bx0), F + 0.6, Z(f.lz - 0.72), X(bx1), F + 0.66, Z(f.lz + 0.72), c3(f.col));   // örtü
        for (const s of [-0.35, 0.35]) { const px = f.dir > 0 ? f.lx + 0.15 : f.lx - 0.65; trim.box(X(px), F + 0.6, Z(f.lz + s - 0.28), X(px + 0.5), F + 0.75, Z(f.lz + s + 0.28), c3('#f6f2e8')); }
      } else if (f.t === 'ward') {
        const z0 = f.lz - 0.3, z1 = f.lz + 0.3, fz = f.face > 0 ? z1 : z0;
        trim.box(X(f.lx - 0.55), F, Z(z0), X(f.lx + 0.55), F + 2.1, Z(z1), wood2);
        trim.box(X(f.lx - 0.6), F + 2.1, Z(z0 - 0.04), X(f.lx + 0.6), F + 2.2, Z(z1 + 0.04), wood);   // korniş
        trim.box(X(f.lx - 0.012), F + 0.1, Z(fz - 0.01), X(f.lx + 0.012), F + 2.0, Z(fz + 0.01 * f.face + 0.005), wood);   // kapı aralığı
        for (const s of [-1, 1]) trim.box(X(f.lx + s * 0.09 - 0.03), F + 1.05, Z(fz), X(f.lx + s * 0.09 + 0.03), F + 1.15, Z(fz + f.face * 0.05), brass);   // tutamak
        trim.box(X(f.lx - 0.5), F + 0.1, Z(fz), X(f.lx + 0.5), F + 0.14, Z(fz + f.face * 0.02), wood);
      } else if (f.t === 'stand') {
        trim.box(X(f.lx - 0.27), F, Z(f.lz - 0.27), X(f.lx + 0.27), F + 0.55, Z(f.lz + 0.27), wood2);
        trim.box(X(f.lx - 0.2), F + 0.3, Z(f.lz + 0.27), X(f.lx + 0.2), F + 0.32, Z(f.lz + 0.29), brass);
      } else if (f.t === 'rug') {
        trim.box(X(f.lx - 1.6), F + 0.005, Z(f.lz - 1.1), X(f.lx + 1.6), F + 0.02, Z(f.lz + 1.1), c3(f.col));
      } else if (f.t === 'door') {
        const b = furnBox(f);
        trim.box(X(b[0]), F, Z(b[2]), X(b[1]), F + 2.2, Z(b[3]), wood2);
        trim.box(X((b[0] + b[1]) / 2 + f.side * 0.35 - 0.03), F + 1.0, Z(b[3]), X((b[0] + b[1]) / 2 + f.side * 0.35 + 0.03), F + 1.08, Z(b[3] + 0.05), brass);
      }
    }
    ext.box(X(-hw), y + 7.6, Z(-D), X(hw), y + 7.8, Z(0), white);
    ext.box(X(-4), y + 10.2, Z(-0.15), X(4), y + 11.3, Z(0), white);
    trim.box(X(-hw - 0.15), y + 10.1, Z(-0.3), X(hw + 0.15), y + 10.35, Z(0.15), dark);
    trim.box(X(-4.15), y + 11.25, Z(-0.3), X(4.15), y + 11.5, Z(0.15), dark);
    trim.box(X(-hw - 0.1), y + 3.95, Z(-0.3), X(hw + 0.1), y + 4.1, Z(0.1), cream);   // kat bandı
    for (const lx of [-hw, hw]) trim.box(X(lx - 0.18), y, Z(-0.3), X(lx + 0.18), y + 10.2, Z(0.12), cream);
    // sundurma direkleri + balkon (üst kat) + korkuluk
    for (const lx of HOTEL_COLS) trim.box(X(lx - 0.12), y, Z(2.48), X(lx + 0.12), y + 4, Z(2.72), cream);
    floor.box(X(-hw), y + 4, Z(0), X(hw), y + 4.25, Z(2.8), white);
    trim.box(X(-hw), y + 5.1, Z(2.7), X(hw), y + 5.2, Z(2.8), cream);
    for (let lx = -hw; lx <= hw + 1e-6; lx += 0.5) trim.box(X(lx - 0.035), y + 4.18, Z(2.72), X(lx + 0.035), y + 5.1, Z(2.78), cream);
    // balkonun iki yan ucu: tutamak + dikmeler (duvardan ön korkuluğa)
    for (const s of [-1, 1]) {
      const xa = X(s * hw - 0.05), xb = X(s * hw + 0.05);
      trim.box(Math.min(xa, xb), y + 5.1, Z(0), Math.max(xa, xb), y + 5.2, Z(2.8), cream);
      trim.box(Math.min(xa, xb), y + 4.18, Z(0), Math.max(xa, xb), y + 4.3, Z(2.8), cream);
      for (let lz = 0.5; lz < 2.7; lz += 0.5) trim.box(X(s * hw - 0.035), y + 4.18, Z(lz - 0.035), X(s * hw + 0.035), y + 5.1, Z(lz + 0.035), cream);
    }
    // kapı pervazı
    trim.box(X(-1.0), y, Z(-0.32), X(-0.85), y + 3.05, Z(0.08), cream); trim.box(X(0.85), y, Z(-0.32), X(1.0), y + 3.05, Z(0.08), cream);
    trim.box(X(-1.0), y + 2.9, Z(-0.32), X(1.0), y + 3.05, Z(0.08), cream);
    // iç mekân: arka raflar (3 raf), piyano, halı, bar arkası ayna/pano
    for (const sy of [1.35, 1.95, 2.55]) trim.box(X(-9.6), y + sy - 0.05, Z(-15.75), X(-1.0), y + sy, Z(-15.2), dark);
    for (const lx of [-9.6, -5.3, -1.0]) trim.box(X(lx - 0.05), y, Z(-15.75), X(lx + 0.05), y + 3, Z(-15.2), dark);
    trim.box(X(-10.9), y, Z(-7.2), X(-10.3), y + 1.3, Z(-5.6), c3('#2a1a12'));   // piyano gövdesi
    trim.box(X(-10.3), y + 0.75, Z(-7.1), X(-10.05), y + 0.8, Z(-5.7), white);   // tuşlar
    for (let k = 0; k < 14; k++) trim.box(X(-10.3), y + 0.8, Z(-7.05 + k * 0.1), X(-10.15), y + 0.83, Z(-7.0 + k * 0.1), c3('#111111'));
    trim.box(X(-1.5), y + 0.01, Z(-9.5), X(6.5), y + 0.03, Z(-3.0), red);         // halı
    trim.box(X(-1.3), y + 0.03, Z(-9.3), X(6.3), y + 0.035, Z(-3.2), c3('#b8862e'));
    trim.box(X(-1.1), y + 0.035, Z(-9.1), X(6.1), y + 0.04, Z(-3.4), red);
    // avize: iki tekerlek halka + ampuller (gece yanar)
    this.hotelBulbs = [];
    for (const lx of [-4, 4]) {
      const cx = X(lx), cz = Z(-8.5), cy = y + 3.2;
      trim.box(cx - 0.02, cy, cz - 0.02, cx + 0.02, y + 4, cz + 0.02, dark);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, a2 = (k + 1) / 12 * Math.PI * 2; trim.box(Math.min(cx + Math.cos(a) * 0.7, cx + Math.cos(a2) * 0.7) - 0.03, cy - 0.04, Math.min(cz + Math.sin(a) * 0.7, cz + Math.sin(a2) * 0.7) - 0.03, Math.max(cx + Math.cos(a) * 0.7, cx + Math.cos(a2) * 0.7) + 0.03, cy + 0.04, Math.max(cz + Math.sin(a) * 0.7, cz + Math.sin(a2) * 0.7) + 0.03, dark); }
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; this.hotelBulbs.push([cx + Math.cos(a) * 0.7, cy + 0.12, cz + Math.sin(a) * 0.7]); }
    }
    const kit = this.kit, tex = (m) => kit?.tex[m] || null;
    const add = (m) => { scene.add(m); return m; };
    add(ext.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('wood2'), roughness: 0.85 })));
    add(int.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('wood3'), roughness: 0.85 })));
    // döşeme/tavan kutularının alt yüzü yok: çift taraflı (tavan ve balkon altı aşağıdan görünsün)
    add(floor.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('wood4'), roughness: 0.8, side: THREE.DoubleSide })));
    add(ceil.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('wood0'), roughness: 0.9, side: THREE.DoubleSide })));
    add(trim.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    // camlar: zemin kat yarı saydam (içerisi görünür), üst kat perdeli; gece sıcak ışık
    this.glassMat = new THREE.MeshStandardMaterial({ color: '#9fb6c0', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, emissive: '#ffb050', emissiveIntensity: 0 });
    this.curtainMat = new THREE.MeshStandardMaterial({ color: '#6b2a26', roughness: 0.9, emissive: '#ffa040', emissiveIntensity: 0, side: THREE.DoubleSide });
    for (const gl of this.glass) {
      const w = gl.b - gl.a, h = gl.v1 - gl.v0, m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gl.upper ? this.curtainMat : this.glassMat);
      const off = gl.ax === 'x' ? -0.1 : (gl.at < 0 ? 0.1 : -0.1);
      if (gl.ax === 'x') m.position.set(X((gl.a + gl.b) / 2), y + (gl.v0 + gl.v1) / 2, Z(gl.at + off));
      else { m.position.set(X(gl.at + off), y + (gl.v0 + gl.v1) / 2, Z((gl.a + gl.b) / 2)); m.rotation.y = Math.PI / 2; }
      m.renderOrder = 2; scene.add(m);
    }
    // tabela: "GRAND HOTEL"
    {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
      const g = c.getContext('2d');
      g.fillStyle = '#2f5a44'; g.fillRect(0, 0, 1024, 192);
      g.strokeStyle = '#e9c46a'; g.lineWidth = 10; g.strokeRect(14, 14, 996, 164);
      g.fillStyle = '#f2d27a'; g.font = '900 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GRAND HOTEL', 512, 104);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this.signMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.4), this.signMat);
      m.position.set(X(0), y + 8.9, Z(0.03)); scene.add(m);
      const m2 = m.clone(); m2.scale.setScalar(0.32); m2.position.set(X(-6), y + 4.7, Z(2.83)); scene.add(m2);   // balkon altı küçük tabela
    }
    // avize ampulleri + iç ışık
    this.hotelBulbMat = new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false });
    const bg = new THREE.SphereGeometry(0.09, 6, 5), bm = new THREE.InstancedMesh(bg, this.hotelBulbMat, this.hotelBulbs.length), o = new THREE.Object3D();
    this.hotelBulbs.forEach(([bx, by, bz], i) => { o.position.set(bx, by, bz); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); });
    bm.computeBoundingSphere(); scene.add(bm);
    this.hotelLight = new THREE.PointLight('#ffb466', 0, 22, 1.6);
    this.hotelLight.position.set(X(0), y + 3.3, Z(-8)); scene.add(this.hotelLight);
    // yarım kapılar: iki kanat, dış kenarlarındaki menteşeden döner
    const dk = kit?.kinds.env_saloon_door1;
    for (const d of this.doors) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(d.x + s * d.hw, d.y, d.z);
      if (dk) {
        const sx = d.hw / dk.size[0], sy = 1.35 / dk.size[1];
        const g = new THREE.Group(); g.scale.set(-s * sx, sy, 1.4); pivot.add(g);
        for (const p of dk.geos) { const m = new THREE.Mesh(p.g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })); m.position.x = dk.size[0] / 2; g.add(m); }
      } else { const m = new THREE.Mesh(new THREE.BoxGeometry(d.hw, 1.35, 0.05), new THREE.MeshStandardMaterial({ color: '#6b4a2c' })); m.position.set(-s * d.hw / 2, 0, 0); pivot.add(m); }
      scene.add(pivot); d.objs.push({ pivot, s });
    }
  }
  // kapılar: içinden geçen oyuncu/kovboy iter, bırakınca yay gibi sallanıp kapanır
  updateDoors(dt, movers) {
    for (const d of this.doors || []) {
      let push = 0;
      for (const m of movers) {
        const dx = m.x - d.x, dz = m.z - d.z;
        // içeri (−z) yürüyen kanatları içeri, dışarı çıkan dışarı iter (ang > 0 = caddeye doğru)
        if (Math.abs(dx) < d.hw + 0.2 && Math.abs(dz) < 0.75) push = m.vz < -0.2 ? -1 : m.vz > 0.2 ? 1 : (push || (dz > 0 ? -1 : 1));
      }
      if (push) { d.vel = 0; d.ang += (push * 1.35 - d.ang) * Math.min(1, dt * 12); }
      else { d.vel += (-26 * d.ang - 2.2 * d.vel) * dt; d.ang += d.vel * dt; }
      for (const { pivot, s } of d.objs) pivot.rotation.y = s * d.ang;
    }
  }

  // kare ağılın (al_animal_fence, 7,65 m) dört kenarı: çarpışma kutuları
  fenceRing(cx, cz, s) {
    if (this.dry) return;
    const W = this.world, k = s * 7.65 / 2;
    for (const [x0, z0, x1, z1] of [[cx - k, cz - k, cx + k, cz - k], [cx - k, cz + k, cx + k, cz + k], [cx - k, cz - k, cx - k, cz + k], [cx + k, cz - k, cx + k, cz + k]])
      W.addBox(Math.min(x0, x1) - 0.12, Math.max(x0, x1) + 0.12, Math.min(z0, z1) - 0.12, Math.max(z0, z1) + 0.12, -1, 3, 'fence');
  }

  // ---------- kurulum ----------
  build(scene) {
    const before = new Set(scene.children);
    this.ground = this.groundMesh();
    scene.add(this.ground, this.roadMesh(ROADS, [[-1, -0.55, '#a07a4e'], [-0.55, -0.35, '#8a6842'], [-0.35, 0.35, '#a07a4e'], [0.35, 0.55, '#8a6842'], [0.55, 1, '#a07a4e']]),
      this.roadMesh(CTRAILS.map((pts) => ({ hw: 1.5, pts })), [[-1, 1, '#9c6f45']]), this.ropeMesh());
    this.layout();
    if (this.kit) this.buildInstances(scene);
    if (this.hotel) this.hotelMesh(scene);
    this.buildLights(scene);
    this.life = new WestLife(this, scene, this.kit?.chars, this.world.animalKit);
    for (const o of scene.children) if (!before.has(o)) o.userData.west = true;
  }

  buildInstances(scene) {
    const kit = this.kit;
    const mats = {};
    const matFor = (m) => mats[m] || (mats[m] = m === 'vc'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, map: kit.tex[m], roughness: 0.85,
        alphaTest: m.startsWith('sign_') ? 0.5 : 0, side: m.startsWith('sign_') ? THREE.DoubleSide : THREE.FrontSide }));
    // tür × bölge grupları: küçük eşyalar 250 m'lik, büyükler 400 m'lik bölgelerde (az çizim çağrısı)
    const groups = new Map();
    for (const it of this.items) {
      const CH = Math.max(...kit.kinds[it.kind].size) * it.s > 4 ? 400 : 250;
      const key = it.kind + '|' + Math.floor(it.x / CH) + ',' + Math.floor(it.z / CH);
      let g = groups.get(key); if (!g) groups.set(key, g = { kind: it.kind, list: [] });
      g.list.push(it);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const g of groups.values()) {
      const k = kit.kinds[g.kind], big = Math.max(...k.size);
      let sx = 0, sz = 0; for (const it of g.list) { sx += it.x; sz += it.z; }
      const grp = { meshes: [], x: sx / g.list.length, z: sz / g.list.length, r: 0, d: clamp(big * g.list[0].s * 40, 110, 900) };
      for (const it of g.list) grp.r = Math.max(grp.r, Math.hypot(it.x - grp.x, it.z - grp.z) + big * it.s);
      for (const part of k.geos) {
        const mesh = new THREE.InstancedMesh(part.g, matFor(part.mat), g.list.length);
        g.list.forEach((it, i) => { q.setFromAxisAngle(up, it.ry); m4.compose(p.set(it.x, it.y, it.z), q, s.setScalar(it.s)); mesh.setMatrixAt(i, m4); });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = this.shadows && big > 1.5; mesh.receiveShadow = this.shadows;
        scene.add(mesh); grp.meshes.push(mesh);
      }
      this.groups.push(grp);
    }
    this.mats = mats;
  }

  // gece: cadde lambalarının ampulleri
  buildLights(scene) {
    if (!this.lampPts.length) return;
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false });
    const g = new THREE.SphereGeometry(0.22, 8, 6), m = new THREE.InstancedMesh(g, this.bulbMat, this.lampPts.length), o = new THREE.Object3D();
    this.lampPts.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.computeBoundingSphere(); scene.add(m);
    // zeminde sıcak ışık havuzu (gece görünür, toplamalı karışım)
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: '#ffb866', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const pg = new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), pm = new THREE.InstancedMesh(pg, this.poolMat, this.lampPts.length);
    this.lampPts.forEach(([lx, , lz], i) => { o.position.set(lx, westHeight(lx, lz) + 0.08, lz); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); });
    pm.computeBoundingSphere(); pm.renderOrder = 1; scene.add(pm);
  }
  setNight(n) {
    if (this.bulbMat) this.bulbMat.color.setRGB(1, 0.82, 0.54).multiplyScalar(0.3 + n * 3.2);
    if (this.poolMat) this.poolMat.opacity = n * 0.55;
    if (this.hotelLight) {
      this.hotelLight.intensity = 6 + n * 26;
      this.glassMat.emissiveIntensity = n * 0.55; this.curtainMat.emissiveIntensity = n * 0.7;
      this.signMat.emissiveIntensity = n * 0.45;   // tabela gece aydınlık (fenerle aydınlatılmış gibi)
      this.hotelBulbMat.color.setRGB(1, 0.82, 0.54).multiplyScalar(0.6 + n * 2.6);
    }
  }

  // uzaklık ayıklama (tür × bölge grubu)
  update(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const g of this.groups) {
      const v = Math.hypot(g.x - cx, g.z - cz) - g.r < g.d;
      for (const m of g.meshes) m.visible = v;
    }
  }

  // ---------- zemin ----------
  groundMesh() {
    const pos = [], col = [];
    const rnd = mulberry32(4242);
    const sand = ['#cf9758', '#c88d4f', '#d49f60', '#c4874a'].map((h) => new THREE.Color(h));
    // kayalık katmanları (yüksekliğe göre bantlar)
    const strata = ['#a14d2a', '#b86236', '#c9784a', '#9a4a2c', '#b35a34', '#d08a58'].map((h) => new THREE.Color(h));
    const top = ['#b9773f', '#ad6c3a'].map((h) => new THREE.Color(h));
    const cWet = new THREE.Color('#a88a5e'), cDeep = new THREE.Color('#5d6650'), cTown = new THREE.Color('#c08a52');
    const tmp = new THREE.Color();
    const grid = (x0, x1, z0, z1, S, inside) => {
      const nx = Math.ceil((x1 - x0) / S), nz = Math.ceil((z1 - z0) / S), V = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const inner = i > 0 && i < nx && j > 0 && j < nz;
        const x = x0 + i * S + (inner ? (rnd() - 0.5) * S * 0.5 : 0), z = z0 + j * S + (inner ? (rnd() - 0.5) * S * 0.5 : 0);
        V.push([x, westHeight(x, z), z]);
      }
      const at = (i, j) => V[j * (nx + 1) + i];
      const tri = (a, b, c) => {
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
        if (!inside(cx, cz)) return;
        const sl = Math.max(a[1], b[1], c[1]) - Math.min(a[1], b[1], c[1]);
        const inTown = cx > TOWN.x0 && cx < TOWN.x1 && cz > TOWN.z0 && cz < TOWN.z1;
        if (cy < -0.6) tmp.copy(cWet).lerp(cDeep, clamp((-cy - 0.6) / 3, 0, 1));
        else if (sl > S * 0.9) tmp.copy(strata[(Math.floor(cy / 2.3 + Math.sin(cx * 0.05) * 0.4) % 6 + 6) % 6]).multiplyScalar(0.93 + rnd() * 0.1);
        else if (cy > 6 && sl < S * 0.35) tmp.copy(top[Math.floor(rnd() * top.length)]);
        else if (inTown) tmp.copy(cTown).multiplyScalar(0.95 + rnd() * 0.07);
        else if (cy < 0.3) tmp.copy(cWet).lerp(sand[0], 0.5);
        else tmp.copy(sand[Math.floor(rnd() * sand.length)]).multiplyScalar(0.96 + rnd() * 0.06);
        pos.push(...a, ...b, ...c);
        for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
      };
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (a[1] < -3.95 && b[1] < -3.95 && c[1] < -3.95 && d[1] < -3.95) continue;
        tri(a, d, c); tri(a, c, b);
      }
    };
    // ana kara 5 m, kanyon adası 3 m (kayalıklar keskin)
    grid(MAIN.cx - MAIN.rx * 1.14, MAIN.cx + MAIN.rx * 1.14, MAIN.cz - MAIN.rz * 1.14, 476, 5, () => true);
    grid(CANYON.cx - CANYON.rx * 1.16, CANYON.cx + CANYON.rx * 1.16, 476, CANYON.cz + CANYON.rz * 1.16, 3, () => true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }

  // yollar / patikalar: zemine oturan toprak şeritler; lanes = [[u0, u1, renk]] (u: −1 sol kenar … 1 sağ kenar)
  roadMesh(roads, laneDefs) {
    const pos = [], col = [];
    const hy = (x, z) => westHeight(x, z) + 0.05;
    const lanes = laneDefs.map(([a, b, c]) => [a, b, new THREE.Color(c)]);
    for (const r of roads) {
      const pts = [];
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
        for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
      }
      pts.push(r.pts[r.pts.length - 1]);
      const N = pts.map((p, k) => { const q0 = pts[Math.max(0, k - 1)], q1 = pts[Math.min(pts.length - 1, k + 1)], dx = q1[0] - q0[0], dz = q1[1] - q0[1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L]; });
      for (let i = 0; i + 1 < pts.length; i++) {
        for (const [u0, u1, c] of lanes) {
          const p = (k, u) => { const X = pts[k][0] + N[k][0] * u * r.hw, Z = pts[k][1] + N[k][1] * u * r.hw; return [X, hy(X, Z), Z]; };
          const a0 = p(i, u0), a1 = p(i, u1), b1 = p(i + 1, u1), b0 = p(i + 1, u0);
          const ux = a1[0] - a0[0], uz = a1[2] - a0[2], vx = b0[0] - a0[0], vz = b0[2] - a0[2];
          if (uz * vx - ux * vz > 0) pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0); else pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
          for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    return m;
  }

  // Puente Oeste: ahşap kafes köprü (kazıklar, çaprazlar, korkuluk) + korkuluk çarpışması
  bridgeMesh() {
    const B = new Box(), W = this.world, z = WBR.z, hw = WBR.hw;
    const plank = ['#7a5636', '#835c3a', '#6f4e31'].map(c3), dark = c3('#4a3523'), rail = c3('#5e4229');
    let k = 0;
    for (let x = WBR.x0; x > WBR.x1 + 1e-6; x -= 1, k++) {
      const x2 = Math.max(x - 1, WBR.x1), y1 = westDeck(x), y2 = westDeck(x2);
      B.quad([x, y1, z + hw], [x, y1, z - hw], [x2, y2, z - hw], [x2, y2, z + hw], plank[k % 3]);   // döşeme (üst yüz)
      B.quad([x, y1 - 0.5, z + hw], [x, y1 - 0.5, z - hw], [x2, y2 - 0.5, z - hw], [x2, y2 - 0.5, z + hw], dark, true);   // alt
      for (const s of [-1, 1]) B.quad([x, y1 - 0.5, z + s * hw], [x, y1, z + s * hw], [x2, y2, z + s * hw], [x2, y2 - 0.5, z + s * hw], dark, s > 0);
      if (k % 2 === 0) for (const s of [-1, 1]) {
        const zi = z + s * (hw - 0.1), xb = Math.max(x - 2, WBR.x1), ya = (y1 + westDeck(xb)) / 2;
        B.box(x - 0.09, y1, zi - 0.09, x + 0.09, y1 + 1.15, zi + 0.09, rail);
        B.box(xb, ya + 1.05, zi - 0.07, x, ya + 1.18, zi + 0.07, rail);
        B.box(xb, ya + 0.55, zi - 0.05, x, ya + 0.63, zi + 0.05, rail);
      }
      // kazık sırası (8 m'de bir)
      if (k % 8 === 4) for (const s of [-1, -0.33, 0.33, 1]) { const zp = z + s * (hw - 0.4); B.box(x - 0.22, -4, zp - 0.22, x + 0.22, y1 - 0.5, zp + 0.22, dark); }
    }
    for (let x = WBR.x0; x > WBR.x1; x -= 4) {
      const x2 = Math.max(x - 4, WBR.x1), lo = Math.min(westDeck(x), westDeck(x2)), hi = Math.max(westDeck(x), westDeck(x2));
      for (const s of [-1, 1]) W.addBox(x2, x, z + s * hw - 0.15, z + s * hw + 0.15, lo - 0.6, hi + 1.2, 'rail');
    }
    return B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  }

  // Pasarela del Cañón: ip korkuluklu dar ahşap köprü
  ropeMesh() {
    const B = new Box(), W = this.world, x = ROPE.x, hw = ROPE.hw;
    const plank = ['#8a6a4a', '#94714e', '#7f6143'].map(c3), dark = c3('#5b4630'), rope = c3('#c9b48a');
    let k = 0;
    for (let z = ROPE.z0; z < ROPE.z1 - 1e-6; z += 0.8, k++) {
      const z2 = Math.min(z + 0.8, ROPE.z1), y1 = ropeDeck(z), y2 = ropeDeck(z2);
      B.box(x - hw, Math.min(y1, y2) - 0.08, z, x + hw, (y1 + y2) / 2, z2 - 0.1, plank[k % 3]);
      if (k % 5 === 0) {
        for (const s of [-1, 1]) B.box(x + s * hw - 0.06, y1 - 0.1, z - 0.06, x + s * hw + 0.06, y1 + 1.1, z + 0.06, dark);
        const zb = Math.min(z + 4, ROPE.z1), ym = (y1 + ropeDeck(zb)) / 2;
        for (const s of [-1, 1]) {
          B.box(x + s * hw - 0.03, ym + 1.0, z, x + s * hw + 0.03, ym + 1.06, zb, rope);
          B.box(x + s * hw - 0.025, ym + 0.55, z, x + s * hw + 0.025, ym + 0.6, zb, rope);
        }
      }
      if (k % 15 === 7) for (const s of [-1, 1]) B.box(x + s * (hw + 0.1) - 0.15, -4, z - 0.15, x + s * (hw + 0.1) + 0.15, y1 - 0.05, z + 0.15, dark);
    }
    for (let z = ROPE.z0; z < ROPE.z1; z += 3) {
      const z2 = Math.min(z + 3, ROPE.z1), lo = Math.min(ropeDeck(z), ropeDeck(z2)), hi = Math.max(ropeDeck(z), ropeDeck(z2));
      for (const s of [-1, 1]) W.addBox(x + s * hw - 0.1, x + s * hw + 0.1, z, z2, lo - 0.4, hi + 1.1, 'rail');
    }
    return B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  }
}

// Puente Oeste açılışta kurulur (bölge sonradan yüklense de köprü baştan durur); yalnız this.world kullanır
export const buildWestBridge = (world) => WildWest.prototype.bridgeMesh.call({ world });

// Köprü başı (Palmera tarafı): araçlar geçemez, yalnız atla (ya da yürüyerek). At burada bekler; Wild West ucunda da bir tane.
export const GATE_X = -540;
export const HORSE_SPOTS = [{ x: -526, z: WBR.z + 9, heading: -Math.PI / 2 }, { x: -726, z: WBR.z + 10, heading: Math.PI / 2, west: true }];
export function buildBridgeGate(world) {
  const B = new Box(), wood = c3('#6b4a2c'), dark = c3('#4a3523'), water = c3('#3f7fa6');
  const z = WBR.z, gw = 1.7, hw = WBR.hw + 0.6;
  // iki yanda çit (ortada 3,4 m geçit), geçidin iki yanında yüksek direk + üstte kiriş
  for (const [z0, z1] of [[z - hw, z - gw], [z + gw, z + hw]]) {
    for (const zp of [z0, (z0 + z1) / 2, z1]) B.box(GATE_X - 0.13, 0, zp - 0.13, GATE_X + 0.13, 1.45, zp + 0.13, dark);
    for (const yy of [0.55, 1.15]) B.box(GATE_X - 0.06, yy, z0, GATE_X + 0.06, yy + 0.14, z1, wood);
    world.addBox(GATE_X - 0.25, GATE_X + 0.25, z0, z1, -5, 1.6, 'wall');
  }
  for (const s of [-1, 1]) { B.box(GATE_X - 0.2, 0, z + s * gw - 0.2, GATE_X + 0.2, 4.4, z + s * gw + 0.2, dark); world.addCircle(GATE_X, z + s * gw, 0.25, -5, 4.5); }
  B.box(GATE_X - 0.18, 3.9, z - gw - 0.3, GATE_X + 0.18, 4.25, z + gw + 0.3, wood);
  world.sign('YALNIZ ATLILAR', '#ffd27a', GATE_X - 0.3, 3.35, z, Math.PI / 2, 0.42);
  world.sign('YALNIZ ATLILAR', '#ffd27a', GATE_X + 0.3, 3.35, z, -Math.PI / 2, 0.42);
  // at durağı: bağlama direği + su yalağı (her iki uçta)
  for (const h of HORSE_SPOTS) {
    const y = h.west ? westHeight(h.x, h.z) : 0.15, rz = h.z + 1.4;
    for (const dx of [-1.6, 1.6]) B.box(h.x + dx - 0.08, y, rz - 0.08, h.x + dx + 0.08, y + 1.1, rz + 0.08, dark);
    B.box(h.x - 1.7, y + 0.95, rz - 0.06, h.x + 1.7, y + 1.07, rz + 0.06, wood);
    B.box(h.x - 3.9, y, rz - 0.35, h.x - 2.3, y + 0.5, rz + 0.35, wood);
    B.box(h.x - 3.8, y + 0.42, rz - 0.27, h.x - 2.4, y + 0.46, rz + 0.27, water);
    world.addBox(h.x - 1.7, h.x + 1.7, rz - 0.1, rz + 0.1, y - 1, y + 1.1, 'prop');
    world.addBox(h.x - 3.9, h.x - 2.3, rz - 0.35, rz + 0.35, y - 1, y + 0.5, 'prop');
  }
  return B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
}

// Grand Hotel üst kat eşyasının çarpışma kutusu (yerel): [x0, x1, z0, z1, yükseklik] ya da null
function furnBox(f) {
  if (f.t === 'bed') { const x0 = f.dir > 0 ? f.lx : f.lx - 2.1; return [x0, x0 + 2.1, f.lz - 0.75, f.lz + 0.75, 0.7]; }
  if (f.t === 'ward') return [f.lx - 0.55, f.lx + 0.55, f.lz - 0.3, f.lz + 0.3, 2.2];
  if (f.t === 'stand') return [f.lx - 0.27, f.lx + 0.27, f.lz - 0.27, f.lz + 0.27, 0.6];
  if (f.t === 'door') return f.side < 0 ? [f.lx - 1.05, f.lx - 0.08, f.lz - 0.03, f.lz + 0.03, 2.2] : [f.lx + 0.08, f.lx + 1.05, f.lz - 0.03, f.lz + 0.03, 2.2];
  return null;
}
// Grand Hotel sundurma direkleri (yerel lx; kapı ±0,85 arası boş)
const HOTEL_COLS = [-10.6, -5.4, -1.6, 1.6, 5.4, 10.6];
// sabit (tohumlu) seçim: aynı yerleşim her açılışta aynı
const rndPick = (seed, arr) => arr[Math.abs(Math.floor(seed * 7.31)) % arr.length];
// [u0,u1]×[v0,v1] duvarından delikleri ([a,b,c,d] = u a..b, v c..d) çıkar → kalan dikdörtgenler [a,b,v0,v1]
function cutHoles(u0, u1, v0, v1, holes) {
  const us = [...new Set([u0, u1, ...holes.flatMap((h) => [h[0], h[1]])])].filter((u) => u >= u0 && u <= u1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < us.length; i++) {
    const a = us[i], b = us[i + 1], mid = (a + b) / 2;
    if (b - a < 1e-6) continue;
    let v = v0;
    for (const h of holes.filter((q) => q[0] < mid && q[1] > mid).sort((p, q) => p[2] - q[2])) {
      if (h[2] > v) out.push([a, b, v, Math.min(h[2], v1)]);
      v = Math.max(v, h[3]);
    }
    if (v < v1) out.push([a, b, v, v1]);
  }
  return out;
}

// ---------- küçük geometri toplayıcı ----------
const c3 = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
class Box {
  constructor() { this.p = []; this.c = []; }
  quad(a, b, c, d, col, flip = false) {
    if (flip) this.p.push(...a, ...c, ...b, ...a, ...d, ...c); else this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.c.push(...col);
  }
  box(x0, y0, z0, x1, y1, z1, col) {
    const q = (a, b, c, d) => this.quad(a, b, c, d, col);
    q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);   // üst
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);   // +z
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);   // −z
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);   // +x
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);   // −x
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
    return m;
  }
}
// dokulu kutu: uv dünya ölçüsünde (2 m'de bir doku tekrarı), yüz yönüne göre
class TexBox extends Box {
  constructor() { super(); this.uv = []; }
  quad(a, b, c, d, col, flip = false) {
    super.quad(a, b, c, d, col, flip);
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
    const uvOf = (p) => (ay >= ax && ay >= Math.abs(n[2]) ? [p[0] / 2, p[2] / 2] : ax >= Math.abs(n[2]) ? [p[2] / 2, p[1] / 2] : [p[0] / 2, p[1] / 2]);
    const seq = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of seq) this.uv.push(...uvOf(p));
  }
}
