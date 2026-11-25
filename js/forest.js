// Isla Selva — şehrin kuzeyindeki orman adası.
// Adanın şekli/yüksekliği, yaya köprüsü yüksekliği, low-poly zemin, patikalar, ağaç/kaya/bitki yerleşimi ve LOD.
// Modeller: "Low Poly Nature Pack" → tools/nature/convert.mjs → assets/web/nature.json/.bin + tex/nature_atlas.png
import { trackedFetch } from './progress.js';
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';

export const ISLE = { cx: -140, cz: -790, rx: 235, rz: 160 };
// Pasarela Selva: ana karadan (z0) adaya (z1) uzanan dar yaya köprüsü
export const FOOT = { x: -140, z0: -534, z1: -646, hw: 1.3, H: 1.6, yEnd: 0.5 };
export const CLEARING = { x: ISLE.cx, z: ISLE.cz, r: 15 };
const BEACH = 0.9;   // bu normalize uzaklıktan sonrası kumsal

// ---------- şekil ve yükseklik ----------
const shoreR = (a) => 1 + 0.08 * Math.sin(3 * a + 1) + 0.05 * Math.sin(7 * a + 2) + 0.025 * Math.sin(13 * a + 0.5);
// 0 = ada ortası, 1 = kıyı çizgisi
export function isleDN(x, z) {
  const dx = (x - ISLE.cx) / ISLE.rx, dz = (z - ISLE.cz) / ISLE.rz;
  return Math.hypot(dx, dz) / shoreR(Math.atan2(dz, dx));
}
const hillN = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.019 + 0.7) * Math.cos(z * 0.023 - 0.4) + 0.25 * Math.sin((x + z) * 0.011 + 2.1);
function hillHeight(x, z) {
  const dn = isleDN(x, z);
  if (dn >= 1.15) return -4;
  if (dn >= 1) return lerp(0.1, -4, smoothstep(1, 1.15, dn));
  return 0.1 + 0.5 * smoothstep(1, BEACH, dn) + 7 * smoothstep(0.88, 0.35, dn) * hillN(x, z);
}

// ---------- şelale kayalığı (düz tepeli yükselti) + tepedeki gölet ----------
const SEA = -0.7;   // world.js WATER_Y (döngüsel içe aktarma olmasın diye burada)
export const MESA = { x: -195, z: -845, r: 15, ring: 6, top: 12 };
export const mesaK = (x, z) => smoothstep(MESA.r + MESA.ring, MESA.r, Math.hypot(x - MESA.x, z - MESA.z));
// gölet düz tepenin içinde kalır (su yüzeyi yamacın üstüne taşmasın); seviye tepe pürüzünün altında
export const POND = { x: MESA.x, z: MESA.z + MESA.r - 5.4, r: 4.5, y: MESA.top - 0.45 };
function baseIsle(x, z) {
  let h = hillHeight(x, z);
  const k = mesaK(x, z);
  if (k > 0) {
    h = lerp(h, MESA.top + 0.35 * Math.sin(x * 0.7) * Math.cos(z * 0.6), k);
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r) h = Math.min(h, POND.y - 0.6 * (1 - (dp / POND.r) ** 2));
    // göletten kenara su oluğu: şelale tepenin kenarından, su seviyesinden başlasın
    const ax = Math.abs(x - MESA.x);
    if (ax < 2.6 && z > POND.z) h = Math.min(h, POND.y - 0.15 + Math.max(0, ax - 1.6) * 0.6);
  }
  return h;
}

// ---------- nehir: şelale havuzundan batı kıyısına ----------
// Su sığdır (en çok ~0,5 m): içinden yürünür. Su seviyesi akış boyunca hiç yükselmez.
export const POOL = { x: MESA.x, z: MESA.z + MESA.r + MESA.ring + 5, r: 6 };
const RDEPTH = 0.5, RBANK = 7;
const CTRL = [[POOL.x, POOL.z], [-204, -808], [-220, -799], [-240, -790], [-258, -778], [-280, -763], [-305, -749], [-335, -735], [-375, -720], [-405, -711]];
export const RIVER = (() => {
  // Catmull-Rom ile yumuşat, 1,5 m'de bir örnekle
  const P = CTRL, pts = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  pts.push({ x: P[P.length - 1][0], z: P[P.length - 1][1] });
  let s = 0;
  pts.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    p.s = s;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)] || p;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; p.tx = (b.x - a.x) / L; p.tz = (b.z - a.z) / L;
    const wb = 3.6 + 0.9 * Math.sin(s * 0.045 + 1);
    p.w = lerp(POOL.r, wb, smoothstep(0, 14, s));
    p.dn = isleDN(p.x, p.z);
  });
  // su seviyesi: zeminin altında, akış boyunca azalan; ağızda deniz seviyesine iner
  let lvl = 1e9;
  for (const p of pts) {
    let g = baseIsle(p.x, p.z);
    for (const o of [-1, 1]) g = Math.min(g, baseIsle(p.x - p.tz * o * (p.w + 1), p.z + p.tx * o * (p.w + 1)));
    lvl = Math.max(SEA + 0.02, Math.min(lvl - 0.01, g - 0.35));
    p.wl = lvl;
  }
  for (let it = 0; it < 3; it++) {   // yumuşat, sonra yine azalan yap
    const c = pts.map((p) => p.wl);
    for (let i = 0; i < pts.length; i++) { let a = 0, n = 0; for (let j = Math.max(0, i - 4); j <= Math.min(pts.length - 1, i + 4); j++) { a += c[j]; n++; } pts[i].wl = Math.min(c[i], a / n); }
    for (let i = 1; i < pts.length; i++) pts[i].wl = Math.min(pts[i].wl, pts[i - 1].wl);
  }
  for (const p of pts) p.wl = lerp(p.wl, SEA + 0.02, smoothstep(0.8, 1.02, p.dn));
  // hızlı sorgu için 8 m hücreli ızgara
  const CELL = 8, grid = new Map(), reach = POOL.r + RBANK + 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let gx = Math.floor((Math.min(a.x, b.x) - reach) / CELL); gx <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); gx++)
      for (let gz = Math.floor((Math.min(a.z, b.z) - reach) / CELL); gz <= Math.floor((Math.max(a.z, b.z) + reach) / CELL); gz++) {
        const k = gx * 4001 + gz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
      }
  }
  return { pts, grid, CELL };
})();
// en yakın nehir noktası: { d (merkeze uzaklık), w (yarı genişlik), wl (su seviyesi), s, i } ya da null
const _rq = { d: 0, w: 0, wl: 0, s: 0, i: 0 };
export function riverAt(x, z) {
  const R = RIVER, l = R.grid.get(Math.floor(x / R.CELL) * 4001 + Math.floor(z / R.CELL));
  if (!l) return null;
  let best = 1e9, bi = -1, bt = 0;
  for (const i of l) {
    const a = R.pts[i], b = R.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const a = R.pts[bi], b = R.pts[bi + 1];
  _rq.d = Math.sqrt(best); _rq.w = lerp(a.w, b.w, bt); _rq.wl = lerp(a.wl, b.wl, bt); _rq.s = lerp(a.s, b.s, bt); _rq.i = bi;
  return _rq.d < _rq.w + RBANK + 1 ? _rq : null;
}
export function isleHeight(x, z) {
  const h = baseIsle(x, z);
  const q = riverAt(x, z);
  if (!q) return h;
  const { d, w, wl } = q;
  const t = d < w ? wl - RDEPTH * (1 - (d / w) ** 2) : wl + Math.max(0, h - wl) * smoothstep(w, w + RBANK, d);
  return Math.min(h, t);
}
// yürürken su yüzeyi (nehir/gölet içindeyse), yoksa null
export function isleWater(x, z) {
  if (z > -560) return null;
  const q = riverAt(x, z);
  if (q && q.d < q.w + 0.3 && isleDN(x, z) < 1.02) return q.wl;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r) return POND.y;
  return null;
}
FOOT.yEnd = isleHeight(FOOT.x, FOOT.z1) + 0.3;
export function footDeck(z) {
  const t = clamp((FOOT.z0 - z) / (FOOT.z0 - FOOT.z1), 0, 1);
  return lerp(0.45, FOOT.yEnd, t) + FOOT.H * Math.sin(Math.PI * t);
}
export const onFoot = (x, z) => Math.abs(x - FOOT.x) < FOOT.hw + 0.4 && z <= FOOT.z0 + 0.5 && z >= FOOT.z1 - 0.5;

// ---------- patikalar ----------
const loopPt = (a, k = 0.62) => { const r = k * shoreR(a); return [ISLE.cx + ISLE.rx * r * Math.cos(a), ISLE.cz + ISLE.rz * r * Math.sin(a)]; };
// iki nokta arasında hafif kıvrımlı yol
function wiggle(a, b, amp, seed) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 8));
  const px = -(b[1] - a[1]) / L, pz = (b[0] - a[0]) / L, out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = amp * Math.sin(t * Math.PI * 2.5 + seed) * Math.sin(Math.PI * t);
    out.push([lerp(a[0], b[0], t) + px * o, lerp(a[1], b[1], t) + pz * o]);
  }
  return out;
}
export function trailLines() {
  const loop = []; for (let k = 0; k <= 60; k++) loop.push(loopPt(k / 60 * Math.PI * 2));
  const C = CLEARING;
  return [
    loop,
    [[FOOT.x, FOOT.z1 + 1], loopPt(Math.PI / 2)],
    wiggle(loopPt(Math.PI / 2), [C.x, C.z + C.r - 1], 5, 0.3),
    wiggle([C.x, C.z - C.r + 1], loopPt(-Math.PI / 2), 6, 1.7),
    wiggle([C.x - C.r + 1, C.z], loopPt(Math.PI), 8, 2.9),
    wiggle([C.x + C.r - 1, C.z], loopPt(0.15), 7, 4.1),
  ];
}
const SEGS = [];
for (const l of trailLines()) for (let i = 0; i + 1 < l.length; i++) SEGS.push([l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]]);
export function trailDist(x, z) {
  let best = 1e9;
  for (const [ax, az, bx, bz] of SEGS) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return Math.min(best, Math.hypot(x - CLEARING.x, z - CLEARING.z) - CLEARING.r);
}

// ---------- nehir geçitleri: halka patikada ahşap köprü, diğerlerinde basamak taşları ----------
export const CROSS = (() => {
  const out = [], P = RIVER.pts;
  trailLines().forEach((line, li) => {
    for (let j = 0; j + 1 < line.length; j++) {
      const [ax, az] = line[j], [bx, bz] = line[j + 1];
      for (let i = 0; i + 1 < P.length; i++) {
        const p = P[i], q = P[i + 1];
        if (p.dn > 0.96) continue;
        const rx = bx - ax, rz = bz - az, sx = q.x - p.x, sz = q.z - p.z, den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((p.x - ax) * sz - (p.z - az) * sx) / den, u = ((p.x - ax) * rz - (p.z - az) * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = ax + rx * t, z = az + rz * t;
        if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
        const L = Math.hypot(rx, rz);
        const Lr = Math.hypot(sx, sz);
        out.push({ x, z, ax: rx / L, az: rz / L, tx: sx / Lr, tz: sz / Lr, w: lerp(p.w, q.w, u), wl: lerp(p.wl, q.wl, u), bridge: li === 0 });
      }
    }
  });
  for (const c of out) {
    if (c.bridge) {
      c.hl = c.w + 3.5; c.hw = 1.15;
      const hA = isleHeight(c.x - c.ax * c.hl, c.z - c.az * c.hl) + 0.12, hB = isleHeight(c.x + c.ax * c.hl, c.z + c.az * c.hl) + 0.12;
      c.hA = hA; c.hB = hB; c.arch = Math.max(0.45, c.wl + 0.75 - (hA + hB) / 2);
    } else {
      // taşlar nehre dik dizilir (patika nehri yatık kesse de)
      c.stones = [];
      for (let o = -(c.w + 0.4); o <= c.w + 0.41; o += 1.1) {
        const x = c.x - c.tz * o, z = c.z + c.tx * o;
        if (isleHeight(x, z) > c.wl - 0.08) continue;   // kıyıdaki karada taş yok
        c.stones.push({ x, z, top: c.wl + 0.17 });
      }
    }
  }
  return out;
})();
export const bridgeDeck = (c, t) => lerp(c.hA, c.hB, t) + c.arch * Math.sin(Math.PI * t);
// köprü/taş üstü yürüme yüksekliği (y verilirse altından geçen için null)
export function riverDeck(x, z, y) {
  if (z > -700 || z < -860) return null;
  for (const c of CROSS) {
    const rx = x - c.x, rz = z - c.z;
    if (Math.abs(rx) > 16 || Math.abs(rz) > 16) continue;
    if (c.bridge) {
      const along = rx * c.ax + rz * c.az, lat = -rx * c.az + rz * c.ax;
      if (Math.abs(along) > c.hl || Math.abs(lat) > c.hw + 0.25) continue;
      const d = bridgeDeck(c, (along + c.hl) / (2 * c.hl));
      if (y === undefined || y > d - 1.6) return d;
    } else for (const s of c.stones) {
      // basılabilir alan görünen taştan biraz geniş: aradaki boşluğa düşülmesin
      if (Math.hypot(x - s.x, z - s.z) < 0.72 && (y === undefined || y > s.top - 1)) return s.top;
    }
  }
  return null;
}

// ---------- yerleşim (modelden bağımsız: çarpışmalar kit olmadan da aynı) ----------
// tür adı, renk çeşitleri, gövde yarıçapı (çarpışma)
// (karlı çeşitler alınmadı: Tree01D/E, Tree4C, Tree5C; Tree7/Tree8 palmiye)
const TREE_TYPES = [['Tree01', 'ABC', 0.5], ['Tree2', 'ABC', 0.5], ['Tree3', 'ABC', 0.5], ['Tree4', 'AB', 0.42], ['Tree5', 'AB', 0.42],
  ['Tree7', 'AB', 0.35], ['Tree8', 'AB', 0.42], ['Tree10', 'ABC', 0.6], ['Tree11', 'ABC', 0.6], ['Tree12', 'ABC', 0.6], ['Tree13', 'ABC', 0.38]];
const ROCKS = ['Rock01', 'Rock02', 'Rock03', 'Rock04', 'Rock05'];
const BOULDERS = ['Boulder01', 'Boulder02', 'Boulder03', 'Boulder04', 'Boulder05', 'Boulder06', 'Boulder07', 'Boulder08'];
const PLANTS = ['Plant02A', 'Plant02C', 'Plant03A', 'Plant03B', 'Plant10A', 'Plant10C', 'Plant12A', 'Plant12C', 'Plant13A', 'Plant13C', 'Plant14A'];
const MUSHROOMS = ['Mushroom01A', 'Mushroom01B', 'Mushroom05A', 'Mushroom05C', 'Mushroom02A'];
const ROCK_R = [1.5, 1.5, 1.5, 1.9, 3.6];   // taban yarıçapı (ölçek 1)

export function islePlacements() {
  const rnd = mulberry32(5150);
  const occ = new Map();   // 4 m hücreli doluluk
  const key = (x, z) => Math.floor(x / 4) * 4001 + Math.floor(z / 4);
  const free = (x, z, r) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = occ.get(key(x + i * 4, z + j * 4)); if (!a) continue;
      for (const o of a) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
    }
    return true;
  };
  const mark = (x, z, r) => { const k = key(x, z); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push({ x, z, r }); };
  const nearLanding = (x, z, r) => Math.hypot(x - FOOT.x, z - FOOT.z1) < r;
  const out = { trees: [], rocks: [], boulders: [], plants: [], mushrooms: [], props: [] };
  const y = (x, z) => isleHeight(x, z);
  // nehir / gölet / kayalık yamacı / şelale önü: m = nehir kenarından pay
  const wet = (x, z, m) => {
    const q = riverAt(x, z);
    if (q && q.d < q.w + m) return true;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + m) return true;
    const k = mesaK(x, z);
    if (k > 0.02 && k < 0.97) return true;
    return Math.abs(x - MESA.x) < 4 + m && z > POND.z && z < POOL.z;
  };
  // kayalığın çevresi: iri kayalar (şelalenin önü açık)
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + rnd() * 0.15;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue;
    const rr = MESA.r + MESA.ring * (0.35 + rnd() * 0.4), x = MESA.x + Math.cos(a) * rr, z = MESA.z + Math.sin(a) * rr;
    const i = rnd() < 0.6 ? 4 : 3, s = 1.3 + rnd() * 0.6;
    // dik yamaçta: tabanın en alçak noktasına otur (alçak kenar havada kalmasın), yüksek yanı yamaca gömülür
    const fr = ROCK_R[i] * s * 0.85;
    let ylow = y(x, z);
    for (let k2 = 0; k2 < 12; k2++) { const b = k2 / 12 * Math.PI * 2; ylow = Math.min(ylow, y(x + Math.cos(b) * fr, z + Math.sin(b) * fr)); }
    out.rocks.push({ kind: ROCKS[i], x, z, y: ylow - 0.7, ry: rnd() * 6.28, s, r: ROCK_R[i] * s * 0.8 }); mark(x, z, ROCK_R[i] * s * 0.8);
  }
  // kampın eşyaları
  const C = CLEARING;
  out.props.push({ kind: 'CampFire', x: C.x, z: C.z, y: y(C.x, C.z), ry: 0, s: 1.4, r: 0.9 }); mark(C.x, C.z, 2);
  for (const [dx, dz, k, s] of [[6, -4, 'Barrel', 1.3], [6.8, -3.1, 'Barrel', 1.3], [6.3, -5.4, 'Box02', 2.2], [-5.5, 5, 'Box01', 2.4], [-6.4, 4.2, 'Box02', 2.2]]) {
    const x = C.x + dx, z = C.z + dz;
    out.props.push({ kind: k, x, z, y: y(x, z), ry: rnd() * 6.28, s, r: 0.35 * s }); mark(x, z, 0.4 * s);
  }
  // kampın çevresinde oturmalık kayalar
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + 0.4, x = C.x + Math.cos(a) * 3.4, z = C.z + Math.sin(a) * 3.4;
    out.boulders.push({ kind: BOULDERS[k], x, z, y: y(x, z) - 0.1, ry: rnd() * 6.28, s: 1.1, r: 0.5 }); mark(x, z, 0.6);
  }
  // kıyı kayaları
  for (let k = 0; k < 110; k++) {
    const a = rnd() * Math.PI * 2, kk = 0.95 + rnd() * 0.12;
    const [x, z] = loopPt(a, kk);
    if (nearLanding(x, z, 14) || wet(x, z, 2)) continue;
    const i = Math.floor(rnd() * ROCKS.length), s = 0.6 + rnd() * 0.9;
    if (!free(x, z, ROCK_R[i] * s * 0.8)) continue;
    out.rocks.push({ kind: ROCKS[i], x, z, y: y(x, z) - 0.4, ry: rnd() * 6.28, s, r: ROCK_R[i] * s * 0.8 }); mark(x, z, ROCK_R[i] * s * 0.8);
  }
  // iç kayalar (büyük)
  for (let k = 0; k < 220 && out.rocks.length < 160; k++) {
    const x = ISLE.cx + (rnd() * 2 - 1) * ISLE.rx, z = ISLE.cz + (rnd() * 2 - 1) * ISLE.rz;
    if (isleDN(x, z) > 0.85 || trailDist(x, z) < 6 || wet(x, z, 2.5)) continue;
    const i = 2 + Math.floor(rnd() * 3), s = 0.8 + rnd() * 0.8;
    if (!free(x, z, ROCK_R[i] * s * 0.8)) continue;
    out.rocks.push({ kind: ROCKS[i], x, z, y: y(x, z) - 0.3, ry: rnd() * 6.28, s, r: ROCK_R[i] * s * 0.8 }); mark(x, z, ROCK_R[i] * s * 0.8);
  }
  // ağaçlar: titreşimli ızgara, gürültüyle seyrelen açıklıklar, türler kümeler halinde
  const G = 7.5, NT = TREE_TYPES.length;
  for (let gx = ISLE.cx - ISLE.rx * 1.15; gx < ISLE.cx + ISLE.rx * 1.15; gx += G) {
    for (let gz = ISLE.cz - ISLE.rz * 1.15; gz < ISLE.cz + ISLE.rz * 1.15; gz += G) {
      const x = gx + rnd() * G, z = gz + rnd() * G;
      const dn = isleDN(x, z);
      if (dn > 0.87) continue;
      const dens = 0.5 + 0.5 * Math.sin(x * 0.017 + 0.9) * Math.cos(z * 0.021 + 0.3);
      if (rnd() > 0.3 + dens * 0.65 || trailDist(x, z) < 3.6 || nearLanding(x, z, 12) || wet(x, z, 2.5)) continue;
      const f = (Math.sin(x * 0.011 + 1.3) + Math.sin(z * 0.014 - 0.6) + Math.sin((x - z) * 0.006 + 2)) / 3;
      let t = Math.floor(((f + 1) / 2) * NT * 1.6 + rnd() * 2.5) % NT;
      if (t === 5 || t === 6) t += 2;   // kümelerde palmiye yok (aşağıda ayrıca seçilir)
      if (dn > 0.78 && t >= 7 && t <= 9) t = (t + 4) % NT;   // kıyıda büyük ağaç az
      if (rnd() < (dn > 0.75 ? 0.3 : 0.03)) t = rnd() < 0.5 ? 5 : 6;   // palmiye: kıyıya yakın sık
      const [name, vars, tr] = TREE_TYPES[t];
      const s = 0.8 + rnd() * 0.45;
      if (!free(x, z, tr * s + 0.6)) continue;
      out.trees.push({ type: name, vars, x, z, y: y(x, z) - 0.15, ry: rnd() * 6.28, s, r: tr * s, v: rnd() });
      mark(x, z, tr * s + 0.6);
    }
  }
  // kumsal palmiyeleri
  for (let k = 0; k < 160 && out.trees.length < 2000; k++) {
    const a = rnd() * Math.PI * 2, [x, z] = loopPt(a, 0.87 + rnd() * 0.07);
    if (nearLanding(x, z, 10) || trailDist(x, z) < 3 || wet(x, z, 2.5)) continue;
    const t = rnd() < 0.5 ? 5 : 6, [name, vars, tr] = TREE_TYPES[t], s = 0.85 + rnd() * 0.4;
    if (!free(x, z, tr * s + 1.2)) continue;
    out.trees.push({ type: name, vars, x, z, y: y(x, z) - 0.15, ry: rnd() * 6.28, s, r: tr * s, v: rnd() });
    mark(x, z, tr * s + 1.2);
  }
  // iri taşlar
  for (let k = 0; k < 420 && out.boulders.length < 280; k++) {
    const x = ISLE.cx + (rnd() * 2 - 1) * ISLE.rx, z = ISLE.cz + (rnd() * 2 - 1) * ISLE.rz;
    if (isleDN(x, z) > 0.97 || trailDist(x, z) < 1.8 || wet(x, z, 0.8)) continue;
    const s = 0.7 + rnd() * 1.1;
    if (!free(x, z, 0.5 * s)) continue;
    out.boulders.push({ kind: BOULDERS[Math.floor(rnd() * BOULDERS.length)], x, z, y: y(x, z) - 0.12, ry: rnd() * 6.28, s, r: 0.45 * s }); mark(x, z, 0.5 * s);
  }
  // mantarlar (iri, masalsı): ağaç diplerine yakın
  for (let k = 0; k < 300 && out.mushrooms.length < 70; k++) {
    const tr = out.trees[Math.floor(rnd() * out.trees.length)]; if (!tr) break;
    const a = rnd() * 6.28, d = tr.r + 1.4 + rnd() * 1.5, x = tr.x + Math.cos(a) * d, z = tr.z + Math.sin(a) * d;
    if (trailDist(x, z) < 1.8 || wet(x, z, 1)) continue;
    const s = 0.5 + rnd() * 0.7;
    if (!free(x, z, 0.5 * s)) continue;
    out.mushrooms.push({ kind: MUSHROOMS[Math.floor(rnd() * MUSHROOMS.length)], x, z, y: y(x, z) - 0.05, ry: rnd() * 6.28, s, r: 0.22 * s }); mark(x, z, 0.4 * s);
  }
  // bitkiler (çarpışmasız)
  for (let k = 0; k < 2600 && out.plants.length < 1400; k++) {
    const x = ISLE.cx + (rnd() * 2 - 1) * ISLE.rx, z = ISLE.cz + (rnd() * 2 - 1) * ISLE.rz;
    if (isleDN(x, z) > 0.9 || trailDist(x, z) < 1.5 || wet(x, z, 0.3)) continue;
    const kind = PLANTS[Math.floor(rnd() * PLANTS.length)];
    const s = 0.8 + rnd() * 0.9;
    if (!free(x, z, 0.3)) continue;
    out.plants.push({ kind, x, z, y: y(x, z) - 0.03, ry: rnd() * 6.28, s });
  }
  return out;
}

// ---------- model kiti ----------
export async function loadNatureKit(base = 'assets/web/') {
  const [j, bin, atlas] = await Promise.all([
    trackedFetch(base + 'nature.json').then((r) => { if (!r.ok) throw new Error('nature.json ' + r.status); return r.json(); }),
    trackedFetch(base + 'nature.bin').then((r) => { if (!r.ok) throw new Error('nature.bin ' + r.status); return r.arrayBuffer(); }),
    new THREE.TextureLoader().loadAsync(base + 'tex/nature_atlas.png'),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = false; atlas.minFilter = THREE.LinearFilter;
  // uzak taç rengi için atlas pikselleri
  const img = atlas.image, cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const sample = (u, v) => {
    const x = clamp(Math.round(u * (cv.width - 1)), 0, cv.width - 1), y = clamp(Math.round((1 - v) * (cv.height - 1)), 0, cv.height - 1);
    const i = (y * cv.width + x) * 4;
    return new THREE.Color().setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace);
  };
  const geo = (d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, d.pos, d.count * 3), 3));
    const ib = new THREE.InterleavedBuffer(new Int8Array(bin, d.nor, d.count * 4), 4);
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 0, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(bin, d.uv, d.count * 2), 2, true));
    g.computeBoundingSphere();
    return g;
  };
  // taç rengi: taç yüksekliğindeki köşelerin atlas renklerinin ortalaması (doğrusal)
  const crownColor = (k, g) => {
    const P = g.attributes.position, U = g.attributes.uv, c = new THREE.Color(0, 0, 0);
    let n = 0;
    for (let i = 0; i < P.count; i += 3) {
      if (P.getY(i) < k.crown[0] + 0.3) continue;
      const s = sample(U.getX(i), U.getY(i)); c.r += s.r; c.g += s.g; c.b += s.b; n++;
    }
    return n ? c.multiplyScalar(1 / n) : null;
  };
  const kinds = {};
  for (const [name, k] of Object.entries(j.kinds)) {
    const geos = k.lods.map(geo);
    kinds[name] = { ...k, geos, leafColor: k.crown ? crownColor(k, geos[0]) : null };
  }
  return { kinds, atlas };
}

// ---------- orman: zemin, patika, örnekler ve LOD ----------
const DIST = {   // ağaç: [yakın model, uzak model, taç vekili]; diğerleri: [yakın, uzak]
  low: { tree: [40, 120, 900], plant: 35, mush: [30, 90], boulder: [50, 140], rock: [120, 600] },
  medium: { tree: [60, 170, 900], plant: 50, mush: [45, 120], boulder: [70, 180], rock: [160, 700] },
  high: { tree: [90, 240, 1000], plant: 70, mush: [60, 150], boulder: [90, 220], rock: [200, 800] },
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _sph = new THREE.Sphere(), _fr = new THREE.Frustum();

class Tier {
  constructor(geo, mat, cap, { cast = false, color = false } = {}) {
    const m = this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.count = 0; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; m.visible = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    this.n = 0;
  }
  add(el, col) {
    this.mesh.instanceMatrix.array.set(el, this.n * 16);
    if (col) this.mesh.instanceColor.array.set(col, this.n * 3);
    this.n++;
  }
  flush() {
    const m = this.mesh;
    if (this.n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    m.count = this.n; m.visible = this.n > 0;
    this.n = 0;
  }
}

export class Forest {
  constructor(world, kit, quality = 'low') {
    this.world = world; this.kit = kit;
    this.D = DIST[quality] || DIST.low;
    this.shadows = true;   // gölge her kalitede (düşükte alan dar, main.js)
    this.place = islePlacements();
  }

  // Modelin [y0, y1] (model birimi) yüksekliğindeki köşelerinden taban izi: merkez kayması + yarıçap
  // (12 dilimin en uzak köşelerinin ortalaması; tür başına bir kez hesaplanır)
  _footprint(name, y0, y1) {
    const k = this.kit?.kinds[name]; if (!k) return null;
    const ck = name + ':' + y0 + ':' + y1, C = this._fp || (this._fp = new Map());
    if (C.has(ck)) return C.get(ck);
    const p = k.geos[0].attributes.position;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0, top = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y > top) top = y;
      if (y < y0 || y > y1) continue;
      const x = p.getX(i), z = p.getZ(i); n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    let fp = null;
    if (n) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sec = new Float32Array(12);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i); if (y < y0 || y > y1) continue;
        const dx = p.getX(i) - cx, dz = p.getZ(i) - cz, d = Math.hypot(dx, dz);
        const s = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 12) % 12;
        if (d > sec[s]) sec[s] = d;
      }
      let sum = 0, m = 0; for (const d of sec) if (d > 0) { sum += d; m++; }
      fp = { cx, cz, r: sum / m, top };
    }
    C.set(ck, fp);
    return fp;
  }

  // çarpışmalar: kit varsa modelin oyuncu boyundaki genişliğinden, yoksa yerleşimdeki yarıçaptan
  _addColliders() {
    const world = this.world, P = this.place;
    const add = (o, name, y0, y1, k, rMin, rMax, hFallback) => {
      const fp = name ? this._footprint(name, y0, y1) : null;
      let x = o.x, z = o.z, r = o.r, h = hFallback;
      if (fp) {
        const c = Math.cos(o.ry), s = Math.sin(o.ry);
        x += (fp.cx * c + fp.cz * s) * o.s; z += (-fp.cx * s + fp.cz * c) * o.s;
        r = clamp(fp.r * o.s * k, rMin, rMax); h = Math.max(fp.top * o.s, 0.6);
      }
      world.addCircle(x, z, r, o.y - 1, o.y + h);
    };
    for (const t of P.trees) add(t, t.kind, 0.3, 1.9, 0.85, t.r, 1.8, 12);
    for (const r of P.rocks) add(r, r.kind, 0.1, 1.6, 0.9, 0.4, 6, 3.2 * r.s);
    for (const b of P.boulders) add(b, b.kind, 0.05, 1.2, 0.9, 0.25, 2, 0.85 * b.s);
    for (const m of P.mushrooms) add(m, m.kind, 0.1, 1.6, 0.8, m.r, 1.2, 2 * m.s);
    for (const p of P.props) add(p, p.kind, 0.05, 1.2, 0.95, 0.2, 2, 0.8 * p.s);
  }

  build(scene, extra) {
    const before = new Set(scene.children);
    this._build(scene);
    extra?.(scene);   // nehir (river.js) — aynı "keep" işaretini alsın
    this._addColliders();   // ağaç türü (t.kind) _build'de seçilir
    // ormanın nesneleri: adadayken şehir gizlense de görünür kalır
    for (const o of scene.children) if (!before.has(o)) o.userData.keep = o.userData.selva = true;   // selva: Wild West'teyken gizlenir
  }

  _build(scene) {
    this.ground = this.groundMesh();   // river.js şelaleyi bu modele oturtur
    scene.add(this.ground, this.trailMesh());
    this.items = []; this.tiers = [];
    const kit = this.kit;
    const sway = (mat) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.world.timeUniform;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.07;
          float k = max(0.0, position.y - 1.5) * 0.028;
          transformed.x += sin(uTime * 1.3 + ph) * k;
          transformed.z += cos(uTime * 1.05 + ph) * k * 0.7;
          #endif`);
      };
      return mat;
    };
    const matStatic = new THREE.MeshStandardMaterial({ map: kit ? kit.atlas : null, roughness: 0.9 });
    const matSway = sway(new THREE.MeshStandardMaterial({ map: kit ? kit.atlas : null, roughness: 0.85 }));
    // taç vekili: uzaktaki tüm ağaçlar için tek çizim
    const proxMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
    this.proxy = new Tier(new THREE.IcosahedronGeometry(1, 0), proxMat, this.place.trees.length, { color: true });
    scene.add(this.proxy.mesh);
    if (!kit) {
      // modeller yüklenemedi: gövde silindiri + taç vekili
      const trunk = new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0);
      this.trunks = new Tier(trunk, new THREE.MeshStandardMaterial({ color: '#5b4630', roughness: 1 }), this.place.trees.length);
      scene.add(this.trunks.mesh);
    }
    const P = this.place;
    // ağaç renk çeşidi: yeşiller sık, sarı/kızıl seyrek (atlas taç rengine göre)
    for (const t of P.trees) {
      if (!kit) { t.kind = null; continue; }
      const opts = [...t.vars].map((v) => t.type + v).filter((n) => kit.kinds[n]);
      let tot = 0;
      const w = opts.map((n) => { const c = kit.kinds[n].leafColor; const g = c ? (c.g > c.r * 1.1 && c.g > c.b ? 3 : 0.3) : 1; tot += g; return g; });
      let r = t.v * tot; t.kind = opts[opts.length - 1];
      for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { t.kind = opts[i]; break; } }
    }
    const all = [
      ...P.trees.map((o) => [o, 'tree']), ...P.rocks.map((o) => [o, 'rock']), ...P.boulders.map((o) => [o, 'boulder']),
      ...P.plants.map((o) => [o, 'plant']), ...P.mushrooms.map((o) => [o, 'mush']), ...P.props.map((o) => [o, 'prop']),
    ];
    const count = {}, tierOf = {};
    if (kit) for (const [o] of all) if (o.kind) count[o.kind] = (count[o.kind] || 0) + 1;
    const D = this.D;
    for (const [o, grp] of all) {
      const k = kit && o.kind ? kit.kinds[o.kind] : null;
      if (!k && grp !== 'tree') continue;
      _q.setFromAxisAngle(_up, o.ry);
      _m.compose(_p.set(o.x, o.y, o.z), _q, _s.setScalar(o.s));
      const it = { m: Float32Array.from(_m.elements), x: o.x, z: o.z, tiers: null };
      const h = (k ? k.h : 10) * o.s, w = (k ? k.w : 4) * o.s;
      it.cy = o.y + h / 2; it.r = Math.max(h / 2, w) * 1.15;
      if (k) {
        let tl = tierOf[o.kind];
        if (!tl) {
          const mat = grp === 'rock' || grp === 'boulder' || grp === 'prop' ? matStatic : matSway;
          tl = tierOf[o.kind] = k.geos.map((g, i) => {
            const cast = this.shadows && grp !== 'plant' && (i === 0 || grp !== 'tree');
            const tr = new Tier(g, mat, count[o.kind], { cast });
            scene.add(tr.mesh); this.tiers.push(tr);
            return tr;
          });
        }
        it.tiers = tl;
      }
      if (grp === 'tree') {
        it.d = D.tree;
        const c = (k && k.crown) || [3, 10, 3.5, 0, 0];
        // taç merkezinin gövdeye göre kayması döndürülür
        const ox = c[3] * Math.cos(o.ry) + c[4] * Math.sin(o.ry), oz = -c[3] * Math.sin(o.ry) + c[4] * Math.cos(o.ry);
        _m.compose(_p.set(o.x + ox * o.s, o.y + (c[0] + c[1]) / 2 * o.s, o.z + oz * o.s), _q, _s.set(c[2] * o.s, (c[1] - c[0]) / 2 * o.s, c[2] * o.s));
        it.pm = Float32Array.from(_m.elements);
        const col = ((k && k.leafColor) || new THREE.Color('#4f7d34')).clone().multiplyScalar(0.85);
        it.pc = [col.r, col.g, col.b];
        if (!kit) { _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(o.s, c[0] * o.s + 0.5, o.s)); it.tm = Float32Array.from(_m.elements); }
      } else if (grp === 'plant') it.d = [D.plant, D.plant, 0];
      else if (grp === 'mush') it.d = [...D.mush, 0];
      else if (grp === 'boulder') it.d = [...D.boulder, 0];
      else if (grp === 'rock') it.d = [...D.rock, 0];
      else it.d = [150, 150, 0];
      it.d2 = it.d.map((v) => v * v);
      this.items.push(it);
    }
    this.maxD = Math.max(...this.items.map((i) => Math.max(...i.d)));
    this.hidden = true;
  }

  // zemin: titreşimli ızgara, yüzey başına renk (low-poly)
  groundMesh() {
    const S = 3, ext = 1.32;
    const x0 = ISLE.cx - ISLE.rx * ext, x1 = ISLE.cx + ISLE.rx * ext, z0 = ISLE.cz - ISLE.rz * ext, z1 = Math.min(-545, ISLE.cz + ISLE.rz * ext);
    const nx = Math.ceil((x1 - x0) / S), nz = Math.ceil((z1 - z0) / S);
    const rnd = mulberry32(777);
    const V = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const inner = i > 0 && i < nx && j > 0 && j < nz;
      const x = x0 + i * S + (inner ? (rnd() - 0.5) * S * 0.55 : 0), z = z0 + j * S + (inner ? (rnd() - 0.5) * S * 0.55 : 0);
      V.push([x, isleHeight(x, z), z]);
    }
    const at = (i, j) => V[j * (nx + 1) + i];
    const pos = [], col = [];
    const cSand = new THREE.Color('#dcc48c'), cWet = new THREE.Color('#9c8a62'), cDeep = new THREE.Color('#5d6650');
    const greens = ['#5f8a3a', '#56823a', '#6a9142', '#4f7a33', '#62873c'].map((h) => new THREE.Color(h));
    const cliffs = ['#a87a4a', '#b58a55', '#9a6e42', '#8f7a66'].map((h) => new THREE.Color(h));
    const tmp = new THREE.Color();
    const tri = (a, b, c) => {
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      const dn = isleDN(cx, cz);
      const mk = mesaK(cx, cz), rq = riverAt(cx, cz);
      if (cy < -0.6) tmp.copy(cWet).lerp(cDeep, clamp((-cy - 0.6) / 3, 0, 1));
      else if (mk > 0.04 && mk < 0.96) tmp.copy(cliffs[Math.floor(rnd() * cliffs.length)]);
      else if (rq && rq.d < rq.w + 0.6) tmp.copy(cWet).lerp(cSand, 0.45);   // nehir yatağı / ıslak kıyı
      else if (dn > BEACH - 0.015 || cy < 0.35) tmp.copy(cSand).multiplyScalar(0.94 + rnd() * 0.08);
      else {
        tmp.copy(greens[Math.floor(rnd() * greens.length)]);
        if (dn > BEACH - 0.06) tmp.lerp(cSand, 0.35);
      }
      pos.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      if (a[1] < -3.95 && b[1] < -3.95 && c[1] < -3.95 && d[1] < -3.95) continue;
      tri(a, d, c); tri(a, c, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }

  // patikalar + kamp alanı: zemine oturan toprak şeritler
  trailMesh() {
    const pos = [], col = [];
    const dirt = ['#8b6b47', '#7f6242', '#93734c'].map((h) => new THREE.Color(h));
    const rnd = mulberry32(31);
    const hy = (x, z) => isleHeight(x, z) + 0.07;
    const quad = (a, b, c, d) => {
      const c0 = dirt[Math.floor(rnd() * dirt.length)];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) col.push(c0.r, c0.g, c0.b);
    };
    const W = 1.3;
    for (const line of trailLines()) {
      // 2 m'de bir örnekle
      const pts = [];
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
        for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
      }
      pts.push(line[line.length - 1]);
      const edge = pts.map((p, i) => {
        const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(pts.length - 1, i + 1)];
        const dx = q1[0] - q0[0], dz = q1[1] - q0[1], L = Math.hypot(dx, dz) || 1;
        const w = W * (0.85 + 0.3 * Math.sin(i * 1.7));
        const lx = p[0] - dz / L * w, lz = p[1] + dx / L * w, rx = p[0] + dz / L * w, rz = p[1] - dx / L * w;
        return [[lx, hy(lx, lz), lz], [rx, hy(rx, rz), rz]];
      });
      for (let i = 0; i + 1 < edge.length; i++) {
        const [l0, r0] = edge[i], [l1, r1] = edge[i + 1];
        // yukarı bakan yüz için köşe sırası
        const ux = r0[0] - l0[0], uz = r0[2] - l0[2], vx = l1[0] - l0[0], vz = l1[2] - l0[2];
        if (uz * vx - ux * vz > 0) quad(l0, r0, r1, l1); else quad(l0, l1, r1, r0);
      }
    }
    // kamp alanı: daire
    const C = CLEARING, N = 28, cc = [C.x, hy(C.x, C.z), C.z];
    for (let k = 0; k < N; k++) {
      const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
      const x0 = C.x + Math.cos(a0) * C.r, z0 = C.z + Math.sin(a0) * C.r, x1 = C.x + Math.cos(a1) * C.r, z1 = C.z + Math.sin(a1) * C.r;
      const c0 = dirt[k % 3];
      pos.push(...cc, x1, hy(x1, z1), z1, x0, hy(x0, z0), z0);
      for (let q = 0; q < 3; q++) col.push(c0.r, c0.g, c0.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  }

  // kamera konumuna göre: yakın model / uzak model / taç vekili; görüş alanı dışını at
  update(camera) {
    if (!this.items) return;
    const cp = camera.position;
    if (Math.hypot(cp.x - ISLE.cx, cp.z - ISLE.cz) - ISLE.rx * 1.2 > this.maxD) {
      if (!this.hidden) { for (const t of this.tiers) t.flush(); this.proxy.flush(); if (this.trunks) this.trunks.flush(); this.hidden = true; }
      return;
    }
    this.hidden = false;
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_m);
    for (const it of this.items) {
      const dx = it.x - cp.x, dz = it.z - cp.z, d2 = dx * dx + dz * dz;
      const D = it.d2;
      if (d2 > D[0] && d2 > D[1] && d2 > D[2]) continue;
      _sph.center.set(it.x, it.cy, it.z); _sph.radius = it.r;
      if (!_fr.intersectsSphere(_sph)) continue;
      if (it.tiers) {
        if (d2 < D[0]) { it.tiers[0].add(it.m); continue; }
        if (d2 < D[1]) { (it.tiers[1] || it.tiers[0]).add(it.m); continue; }
      } else if (this.trunks && d2 < D[1]) this.trunks.add(it.tm);
      if (it.pm && d2 < D[2]) this.proxy.add(it.pm, it.pc);
    }
    for (const t of this.tiers) t.flush();
    this.proxy.flush(); if (this.trunks) this.trunks.flush();
  }
}
