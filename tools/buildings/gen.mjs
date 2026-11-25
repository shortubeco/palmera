// Quaternius modüler parçalarından (duvar, pencere, korniş, çatı) bina çeşitleri üretir ve
// oyunun okuduğu buildings.json + buildings.bin biçiminde yazar.
// Kullanım: node gen.mjs <glTF klasörü> <çıkış klasörü> [yalnız,bu,anahtarlar]
import fs from 'fs';
import path from 'path';
import { loadPiece } from './gl.mjs';

const [SRC, OUT] = process.argv.slice(2);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const CACHE = {};
const piece = (n) => CACHE[n] || (CACHE[n] = loadPiece(SRC, n));
const G0 = 3.9; // zemin kat yüksekliği (parçalar 3 m, 1.3 ile uzatılır)
const floorY = (f) => (f === 0 ? 0 : G0 + 3 * (f - 1));
const floorSY = (f) => (f === 0 ? G0 / 3 : 1);

class Builder {
  constructor(pal, rnd) { this.g = {}; this.pal = pal; this.rnd = rnd; }
  G(n) { return this.g[n] || (this.g[n] = { p: [], n: [], uv: [], c: [], idx: [] }); }
  resolve(mat) {
    const P = this.pal;
    switch (mat) {
      case 'MI_RedBrick': return P.wall;
      case 'MI_InteriorWall': return [P.wall[0], P.wall[1].map((v) => v * 0.78)];
      case 'MI_RedBrick_Pale': return P.accent;
      case 'MI_Trim': return ['trim', P.trim];
      case 'MI_Trim_Green': return ['trim', P.trimGreen];
      case 'MI_Trim_Dark': return ['trim', P.trimDark];
      case 'MI_Trim_MetalConcrete': return ['metal', P.metal];
      case 'MI_Concrete': return ['concrete', [1, 1, 1]];
      case 'MI_Asphalt': return ['roof', [0.85, 0.85, 0.88]];
      case 'MI_Roof_Slate': return ['slate', P.slate];
      case 'MI_Ornaments': return ['orn', [1, 1, 1]];
    }
    if (mat.startsWith('MI_FakeInterior')) return ['win', [1, 1, 1]];
    return null; // cam, iç zemin, toprak: atılır
  }
  winTile(shop) {
    const r = this.rnd();
    if (shop) return r < 0.5 ? 0 : r < 0.85 ? 1 : 2;
    return r < 0.34 ? 0 : r < 0.6 ? 1 : 2;
  }
  // Parçayı yerleştir: y ekseninde rot kadar döndür, s ile ölçekle, (x,y,z)'ye taşı.
  // o.cull: duvarın bina içine bakan arka yüzünü at. o.tile: pencere iç görüntüsü (0/1/2). o.ao: false → gölgeleme yok
  put(name, rot, x, y, z, s = [1, 1, 1], o = {}) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const flip = s[0] * s[1] * s[2] < 0;
    const winTile = o.tile != null ? o.tile : this.winTile(o.shop);
    for (const pr of piece(name)) {
      const r = this.resolve(pr.mat); if (!r) continue;
      let [gname, col] = r;
      if (o.group && gname !== 'win') gname = o.group[gname] || gname;
      const G = this.G(gname);
      const base = G.p.length / 3;
      const nv = pr.P.length / 3;
      const win = gname === 'win';
      for (let i = 0; i < nv; i++) {
        const lx = pr.P[i * 3] * s[0], ly = pr.P[i * 3 + 1] * s[1], lz = pr.P[i * 3 + 2] * s[2];
        const wx = lx * c + lz * sn + x, wy = ly + y, wz = -lx * sn + lz * c + z;
        G.p.push(wx, wy, wz);
        let nx = pr.N[i * 3] / s[0], ny = pr.N[i * 3 + 1] / s[1], nz = pr.N[i * 3 + 2] / s[2];
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        G.n.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
        let u = pr.UV ? pr.UV[i * 2] : 0, v = pr.UV ? pr.UV[i * 2 + 1] : 0;
        if (win) u = winTile + Math.min(0.999, Math.max(0.001, u));
        G.uv.push(u, v);
        // basit ortam gölgelemesi: zemine yakın köşeler koyu
        const ao = win || o.ao === false ? 1 : 0.42 + 0.58 * Math.min(1, Math.max(0, wy / 3.4));
        G.c.push(col[0] * ao, col[1] * ao, col[2] * ao);
      }
      for (let t = 0; t < pr.I.length; t += 3) {
        const a = pr.I[t], b = pr.I[t + 1], d = pr.I[t + 2];
        if (o.cull) {
          const cz = (pr.P[a * 3 + 2] + pr.P[b * 3 + 2] + pr.P[d * 3 + 2]) / 3;
          const nzz = (pr.N[a * 3 + 2] + pr.N[b * 3 + 2] + pr.N[d * 3 + 2]) / 3;
          if (nzz < -0.7 && cz < -0.12) continue;
        }
        if (flip) G.idx.push(base + a, base + d, base + b); else G.idx.push(base + a, base + b, base + d);
      }
    }
  }
  quad(gname, col, pts, n, uvs) {
    const G = this.G(gname), base = G.p.length / 3;
    pts.forEach((p, i) => { G.p.push(...p); G.n.push(...n); G.uv.push(...uvs[i]); G.c.push(...col); });
    G.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// Cepheler: ön (+z), sağ (+x), arka (−z), sol (−x). Taban: x∈[−W/2, W/2], z∈[−D, 0]
function facades(W, D) {
  return [
    { side: 'front', rot: 0, ox: -W / 2, oz: 0, dx: 1, dz: 0, L: W },
    { side: 'right', rot: Math.PI / 2, ox: W / 2, oz: 0, dx: 0, dz: -1, L: D },
    { side: 'back', rot: Math.PI, ox: W / 2, oz: -D, dx: -1, dz: 0, L: W },
    { side: 'left', rot: -Math.PI / 2, ox: -W / 2, oz: -D, dx: 0, dz: 1, L: D },
  ];
}
const at = (f, a) => [f.ox + f.dx * a, f.oz + f.dz * a];

// korniş profilinin duvar önüne taşması ve arka yüzünün derinliği (parça yerel z'si)
const CORNICE_OV = { Metal: 0.1, Trim: 0.53, Brick: 0 };
const CORNICE_BACK = { Metal: 0.1, Trim: 0.1, Brick: 0.4 };
const W4 = new Set(['Metal_Window', 'Brick_Inset_Window', 'Brick_Inset_Window_Curved', 'Brick_Inset_Window_Curved_Small', 'Brick_RedWhite_DoubleWindow', 'Brick_Window_CurvedDouble', 'Brick_Inset']);
const width = (n) => (W4.has(n) ? 4 : 2);

// ---------- stiller ----------
// upper/ground(ctx) → 2 m'lik birim listesi (4 m'lik parça 2 birim kaplar)
// ctx: { side, f, F, m (birim sayısı), top (en üst duvar katı mı), rnd }
function fillPattern(m, pat, filler) {
  const out = []; let i = 0, k = 0;
  while (i < m) {
    let n = pat[k % pat.length]; k++;
    if (n === null) n = filler;
    if (width(n) === 4 && i + 2 > m) n = filler;
    out.push(n); i += width(n) / 2;
  }
  return out;
}
function centered(m, mid, side, filler) {
  // ortada kapı, iki yanda vitrin
  const out = []; const c = Math.floor((m - 1) / 2);
  for (let i = 0; i < m; i++) out.push(i === c ? mid : i === 0 || i === m - 1 ? filler : side);
  return out;
}

const STYLES = {
  // kırmızı tuğla loft (Preview_1 havası): metal çerçeveli geniş pencereler, koyu metal zemin kat
  loft: {
    corner: 'brick', cornice: 'Metal', pil: null,
    upper(ctx) {
      if (ctx.side === 'front') return fillPattern(ctx.m, ['Metal_Window'], 'Metal_Window_Half');
      if (ctx.side === 'back') return fillPattern(ctx.m, ['Brick_Plain_3', 'Metal_Window_Half', 'Brick_Plain_3'], 'Brick_Plain_3');
      return fillPattern(ctx.m, ['Metal_Window_Half', 'Brick_Plain_3'], 'Brick_Plain_3');
    },
    ground(ctx) {
      if (ctx.side === 'front') return centered(ctx.m, 'door:DoorFrame_Metal_Single:Door_2', 'Metal_FirstFloor_Window', 'Metal_FirstFloor_Wall');
      if (ctx.side === 'back') return centered(ctx.m, 'door:DoorFrame_Metal_Single:Door_1', 'Metal_FirstFloor_Wall', 'Metal_FirstFloor_Wall');
      return fillPattern(ctx.m, ['Metal_FirstFloor_Wall', 'Metal_FirstFloor_Window'], 'Metal_FirstFloor_Wall');
    },
  },
  // açık renk taş/tuğla klasik apartman: gömme pencereler, kemerli ilk kat, yarım sütunlar
  classic: {
    corner: 'brick', cornice: 'Trim', pil: 'Brick_HalfColumn', pilEvery: 2,
    upper(ctx) {
      if (ctx.side === 'front') {
        if (ctx.f === 1) return fillPattern(ctx.m, ['Brick_Inset_Window_Curved'], 'Brick_Window_Square_Single');
        if (ctx.top) return fillPattern(ctx.m, ['Brick_Inset_Window_Curved_Small'], 'Brick_Window_Square_Single');
        return fillPattern(ctx.m, ['Brick_Inset_Window'], 'Brick_Window_Square_Single');
      }
      if (ctx.side === 'back') return fillPattern(ctx.m, ['Brick_Plain_3', 'Brick_Window_Square_Single'], 'Brick_Plain_3');
      return fillPattern(ctx.m, ['Brick_Window_Square_Single', 'Brick_Plain_3'], 'Brick_Plain_3');
    },
    ground(ctx) {
      if (ctx.side === 'front') return centered(ctx.m, 'door:DoorFrame_Trim:Door_3', 'Trim_FirstFloor_Window_001', 'Trim_FirstFloor_Wall');
      return fillPattern(ctx.m, ['Brick_BottomTrim'], 'Brick_BottomTrim');
    },
  },
  // kahverengi tuğla (brownstone): süslü pencereler, kat bandı, arduvaz mansart çatı
  brown: {
    corner: 'brick', cornice: 'Brick', pil: null, band: 1,
    upper(ctx) {
      if (ctx.side === 'front') {
        if (ctx.f === 1) return fillPattern(ctx.m, ['Brick_Window_CurvedDouble', null], 'Brick_Window_Trim_Single');
        return fillPattern(ctx.m, ['Brick_Window_Trim', 'Brick_Window_Trim_Single'], 'Brick_Window_Trim_Single');
      }
      if (ctx.side === 'back') return fillPattern(ctx.m, ['Brick_Plain_3', 'Brick_Window_Square_Single'], 'Brick_Plain_3');
      return fillPattern(ctx.m, ['Brick_Window_Trim_Single', 'Brick_Plain_3'], 'Brick_Plain_3');
    },
    ground(ctx) {
      if (ctx.side === 'front') return centered(ctx.m, 'door:DoorFrame_Wooden:Door_1', 'Brick_Window_Trim_Single', 'Brick_BottomTrim');
      return fillPattern(ctx.m, ['Brick_BottomTrim'], 'Brick_BottomTrim');
    },
  },
  // bej taş ofis binası: sık pencereler, köşede taş sütunlar
  office: {
    corner: 'trim', cornice: 'Trim', pil: 'Trim_Column', pilEvery: 2,
    upper(ctx) {
      if (ctx.side === 'front') return fillPattern(ctx.m, ['Trim_Window'], 'Trim_Window');
      if (ctx.side === 'back') return fillPattern(ctx.m, ['Trim_Plain_3', 'Trim_Plain_3', 'Brick_Window_Square_Single'], 'Trim_Plain_3');
      return fillPattern(ctx.m, ['Trim_Plain_3', 'Trim_Window', 'Trim_Plain_3'], 'Trim_Plain_3');
    },
    ground(ctx) {
      if (ctx.side === 'front') return centered(ctx.m, 'door:DoorFrame_Metal_Single:Door_2', 'Metal_FirstFloor_Window', 'Trim_FirstFloor_Wall');
      return fillPattern(ctx.m, ['Trim_FirstFloor_Wall'], 'Trim_FirstFloor_Wall');
    },
  },
  // boyalı tuğla (sahil kasabası pastelleri): basit pencereler, beyaz korniş
  painted: {
    corner: 'brick', cornice: 'Trim', pil: null,
    upper(ctx) {
      if (ctx.side === 'front') return fillPattern(ctx.m, ['Brick_RedWhite_DoubleWindow', 'Brick_Window_Square_Single'], 'Brick_Window_Square_Single');
      if (ctx.side === 'back') return fillPattern(ctx.m, ['Brick_Plain_3', 'Brick_Window_Square_Single'], 'Brick_Plain_3');
      return fillPattern(ctx.m, ['Brick_Window_Square_Single', 'Brick_Plain_3'], 'Brick_Plain_3');
    },
    ground(ctx) {
      if (ctx.side === 'front') return centered(ctx.m, 'door:DoorFrame_Trim:Door_3', 'Trim_FirstFloor_Window_001', 'Brick_BottomTrim');
      return fillPattern(ctx.m, ['Brick_BottomTrim'], 'Brick_BottomTrim');
    },
  },
};

// ---------- tek bina ----------
function building(spec) {
  const { W, D, F, style, roof, pal, seed } = spec;
  const rnd = mulberry32(seed);
  const S = STYLES[style];
  const B = new Builder(pal, rnd);
  const walls = roof === 'mansard' ? F - 1 : F; // duvarlı kat sayısı
  const Ht = floorY(walls); // duvarların üst kotu
  for (const fc of facades(W, D)) {
    const m = Math.round((fc.L - 2) / 2);
    for (let f = 0; f < walls; f++) {
      const ctx = { side: fc.side, f, F: walls, m, top: f === walls - 1, rnd };
      const list = f === 0 ? S.ground(ctx) : S.upper(ctx);
      const y = floorY(f), sy = floorSY(f);
      let a = 1;
      for (const item of list) {
        if (item.startsWith('door:')) {
          const [, frame, door] = item.split(':');
          const [x, z] = at(fc, a + 1);
          B.put(frame, fc.rot, x, y, z, [1, sy, 1], { cull: true, shop: true });
          // iki kanatlı kapı (kanat x −1..0; ikincisi aynalanır)
          B.put(door, fc.rot, x, y, z, [1, 1.15, 1], {});
          B.put(door, fc.rot, x, y, z, [-1, 1.15, 1], {});
          a += 2; continue;
        }
        const w = width(item);
        const [x, z] = at(fc, a + w / 2);
        B.put(item, fc.rot, x, y, z, [1, sy, 1], { cull: true, shop: f === 0 });
        a += w;
      }
      // yarım sütunlar (birim birleşimlerinde, yalnız ön cephe)
      if (S.pil && fc.side === 'front') {
        for (let k = S.pilEvery; k < m; k += S.pilEvery) {
          const [x, z] = at(fc, 1 + k * 2);
          if (S.pil === 'Brick_HalfColumn') {
            if (f === 0) continue;
            const n = f === 1 ? 'Brick_HalfColumn_Bottom' : f === walls - 1 ? 'Brick_HalfColumn_Top' : 'Brick_HalfColumn_Center';
            B.put(n, fc.rot, x, y, z, [1, sy, 1]);
          } else {
            const n = f === 0 ? 'Trim_Column_Bottom' : f === walls - 1 ? 'Trim_Column_Top' : 'Trim_Column_Center';
            B.put(n, fc.rot, x, y, z, [0.7, sy, 0.5]);
          }
        }
      }
      // kat bandı
      if (S.band && f === S.band + 1 && fc.side !== 'back') {
        for (let k = 0; k < m; k++) { const [x, z] = at(fc, 2 + k * 2); B.put('Brick_Ornament_Horizontal', fc.rot, x, y, z); }
      }
    }
    // köşe sütunu: cephenin sağ ucunda (bir sonraki cephenin başında)
    const [cx, cz] = at(fc, fc.L);
    for (let f = 0; f < walls; f++) {
      const y = floorY(f), sy = floorSY(f);
      if (S.corner === 'brick') {
        const n = f === 0 ? 'Brick_CornerColumn_Bottom' : f === walls - 1 ? 'Brick_CornerColumn_Top' : 'Brick_CornerColumn_Center';
        B.put(n, fc.rot, cx, y, cz, [1, sy, 1]);
      } else {
        const n = f === 0 ? 'Trim_Column_Bottom' : f === walls - 1 ? 'Trim_Column_Top' : 'Trim_Column_Center';
        // köşeden içeri 0.5 m: 1 m'lik köşe boşluğunu kaplar
        const ix = cx - fc.dx * 0.5 - Math.sin(fc.rot) * 0.5, iz = cz - fc.dz * 0.5 - Math.cos(fc.rot) * 0.5;
        B.put(n, fc.rot, ix, y, iz, [1.42, sy, 1.42]);
      }
    }
    // korniş / mansart
    if (roof === 'mansard') {
      // eğimli çatı 2 m içeri yatar: düz parçalar [2, L−2], köşelerde 2×2 kalça parçası
      const mm = Math.round((fc.L - 4) / 2);
      for (let k = 0; k < mm; k++) {
        const [x, z] = at(fc, 3 + k * 2);
        const n = fc.side === 'front' && k % 2 === 0 ? 'Roof_SlateCornice_Window_1' : fc.side !== 'front' && k % 3 === 1 ? 'Roof_SlateCornice_Window_1' : 'Roof_SlateCornice_Center';
        B.put(n, fc.rot, x, Ht, z);
      }
      B.put('Roof_SlateCornice_Corner', fc.rot, cx - fc.dx * 1, Ht, cz - fc.dz * 1);
    } else {
      // korniş şeridi köşeyi çıkıntısı kadar aşar; iki cephenin şeritleri köşede birleşir
      const C = 'Cornice_' + S.cornice, ov = CORNICE_OV[S.cornice];
      const T = fc.L + 2 * ov, n = Math.round(T / 2), seg = T / n;
      for (let k = 0; k < n; k++) { const [x, z] = at(fc, -ov + (k + 0.5) * seg); B.put(C + '_Center', fc.rot, x, Ht, z, [seg / 2, 1, 1]); }
      // içten bakan parapet yüzü (çatıdan bakınca korniş boş görünmesin)
      const g = { Metal: 'metal', Trim: 'trim', Brick: S.parapet || pal.wall[0] }[S.cornice];
      const col = g === 'trim' ? pal.trim : g === 'metal' ? pal.metal : pal.wall[1];
      const back = CORNICE_BACK[S.cornice];
      const [ax, az] = at(fc, 0), [bx, bz] = at(fc, fc.L);
      const ix = -Math.sin(fc.rot) * back, iz = -Math.cos(fc.rot) * back; // içeri kaydır
      const nIn = [-Math.sin(fc.rot), 0, -Math.cos(fc.rot)];
      B.quad(g, col, [[bx + ix, Ht, bz + iz], [ax + ix, Ht, az + iz], [ax + ix, Ht + 0.95, az + iz], [bx + ix, Ht + 0.95, bz + iz]], nIn,
        [[fc.L / 2, 0], [0, 0], [0, 0.45], [fc.L / 2, 0.45]]);
    }
  }
  // çatı
  const roofY = roof === 'mansard' ? Ht + 3.0 : Ht + 0.05;
  const ins = roof === 'mansard' ? 2 : 0;
  const x0 = -W / 2 + ins, x1 = W / 2 - ins, z0 = -D + ins, z1 = -ins;
  B.quad('roof', [0.85, 0.85, 0.88], [[x0, roofY, z1], [x1, roofY, z1], [x1, roofY, z0], [x0, roofY, z0]], [0, 1, 0], [[x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4], [x0 / 4, z0 / 4]]);
  // çatı klimaları
  const nAC = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < nAC; k++) {
    const ax = x0 + 1.5 + rnd() * (x1 - x0 - 3), az = z0 + 1.5 + rnd() * (z1 - z0 - 3);
    B.put('Prop_ACUnit', Math.floor(rnd() * 4) * Math.PI / 2, ax, roofY, az, [2.2, 2.2, 2.2], { ao: false });
  }
  const top = roof === 'mansard' ? Ht + 3.2 : Ht + 1;
  return { B, bounds: [[-W / 2, 0, -D], [W / 2, top, 0]] };
}

// ---------- hazır model (paketteki tam bina) ----------
function readyModel(name, pal) {
  const B = new Builder(pal, mulberry32(7));
  const tileOf = { MI_FakeInterior_1: 0, MI_FakeInterior_3: 0, MI_FakeInterior_2: 1, MI_FakeInterior_4: 2 };
  for (const pr of piece(name)) {
    CACHE.__one = [pr];
    B.put('__one', 0, 0, 0, 0, [1, 1, 1], { tile: tileOf[pr.mat] ?? 0 });
  }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const [g, G] of Object.entries(B.g)) {
    if (g === 'win') continue;
    for (let i = 0; i < G.p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], G.p[i + k]); mx[k] = Math.max(mx[k], G.p[i + k]); }
  }
  mx[2] = Math.min(mx[2], 0.6); // öndeki merdiven çıkıntısı gövdeye sayılmaz
  mn[1] = 0;
  return { B, bounds: [mn, mx] };
}

// ---------- renk paletleri ----------
const RED = ['brick', [1, 1, 1]], RED_DARK = ['brick', [0.72, 0.62, 0.6]], RED_WARM = ['brick', [1, 0.9, 0.8]];
const CREAM = ['pale', [0.93, 0.87, 0.76]], STONE = ['pale', [0.82, 0.8, 0.76]], CHAR = ['pale', [0.36, 0.35, 0.36]];
const PINK = ['pale', [0.98, 0.78, 0.78]], MINT = ['pale', [0.74, 0.9, 0.82]], SAND = ['pale', [0.96, 0.86, 0.66]], SKY = ['pale', [0.76, 0.84, 0.95]];
const WHITE = ['pale', [1, 1, 1]];
const PEACH = ['pale', [1, 0.82, 0.68]], YELLOW = ['pale', [1, 0.93, 0.66]];
const base = { trim: [1, 1, 1], trimGreen: [0.42, 0.62, 0.5], trimDark: [0.32, 0.3, 0.3], metal: [0.55, 0.55, 0.58], slate: [1, 1, 1] };
// paletler göze göre (sRGB) yazıldı; köşe renkleri doğrusal uzayda çarpılır → dönüştür
const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const pal = (o) => {
  const p = { ...base, ...o };
  for (const k of ['wall', 'accent']) p[k] = [p[k][0], lin(p[k][1])];
  for (const k of ['metal', 'slate']) p[k] = lin(p[k]);
  return p;
};

const SPECS = [
  { key: 'loft_a', W: 16, D: 14, F: 6, style: 'loft', roof: 'flat', pal: pal({ wall: RED, accent: CHAR, metal: [0.32, 0.32, 0.35] }) },
  { key: 'loft_b', W: 22, D: 16, F: 7, style: 'loft', roof: 'flat', pal: pal({ wall: RED_DARK, accent: CHAR, metal: [0.28, 0.28, 0.3] }) },
  { key: 'loft_c', W: 12, D: 12, F: 5, style: 'loft', roof: 'flat', pal: pal({ wall: RED_WARM, accent: STONE, metal: [0.4, 0.42, 0.45] }) },
  { key: 'classic_a', W: 14, D: 14, F: 6, style: 'classic', roof: 'mansard', pal: pal({ wall: CREAM, accent: CREAM, trim: [1, 0.98, 0.94] }) },
  { key: 'classic_b', W: 20, D: 14, F: 7, style: 'classic', roof: 'flat', pal: pal({ wall: RED, accent: CREAM, trimGreen: [0.3, 0.45, 0.38] }) },
  { key: 'classic_c', W: 10, D: 12, F: 5, style: 'classic', roof: 'flat', pal: pal({ wall: STONE, accent: STONE }) },
  { key: 'brown_a', W: 10, D: 12, F: 4, style: 'brown', roof: 'mansard', pal: pal({ wall: RED_DARK, accent: STONE }) },
  { key: 'brown_b', W: 14, D: 14, F: 5, style: 'brown', roof: 'mansard', pal: pal({ wall: RED, accent: CREAM }) },
  { key: 'brown_c', W: 18, D: 14, F: 6, style: 'brown', roof: 'flat', pal: pal({ wall: RED_WARM, accent: STONE }) },
  { key: 'office_a', W: 18, D: 16, F: 7, style: 'office', roof: 'flat', pal: pal({ wall: STONE, accent: STONE }) },
  { key: 'office_b', W: 12, D: 12, F: 6, style: 'office', roof: 'flat', pal: pal({ wall: SAND, accent: SAND, trim: [0.9, 0.86, 0.8] }) },
  { key: 'painted_a', W: 10, D: 10, F: 3, style: 'painted', roof: 'flat', pal: pal({ wall: PINK, accent: WHITE }) },
  { key: 'painted_b', W: 14, D: 12, F: 4, style: 'painted', roof: 'flat', pal: pal({ wall: MINT, accent: WHITE }) },
  { key: 'painted_c', W: 12, D: 12, F: 4, style: 'painted', roof: 'flat', pal: pal({ wall: SKY, accent: WHITE }) },
  { key: 'small', ready: 'Building_Small_1', F: 5, pal: pal({ wall: RED, accent: CREAM }) },
  // sahil otelleri: yüksek pastel binalar
  { key: 'hotel_a', W: 16, D: 14, F: 6, style: 'painted', roof: 'flat', pal: pal({ wall: PEACH, accent: WHITE }) },
  { key: 'hotel_b', W: 20, D: 14, F: 7, style: 'painted', roof: 'flat', pal: pal({ wall: PINK, accent: WHITE }) },
  { key: 'hotel_c', W: 18, D: 16, F: 7, style: 'classic', roof: 'flat', pal: pal({ wall: MINT, accent: WHITE, trim: [1, 1, 1] }) },
  { key: 'hotel_d', W: 14, D: 14, F: 5, style: 'painted', roof: 'flat', pal: pal({ wall: YELLOW, accent: WHITE }) },
  // ara sokak sıra evleri: sığ (8 m)
  { key: 'row_a', W: 10, D: 8, F: 3, style: 'painted', roof: 'flat', pal: pal({ wall: SAND, accent: WHITE }) },
  { key: 'row_b', W: 12, D: 8, F: 4, style: 'brown', roof: 'flat', pal: pal({ wall: RED_DARK, accent: STONE }) },
  { key: 'row_c', W: 8, D: 8, F: 3, style: 'loft', roof: 'flat', pal: pal({ wall: RED, accent: CHAR, metal: [0.35, 0.35, 0.38] }) },
  { key: 'row_d', W: 10, D: 8, F: 4, style: 'classic', roof: 'flat', pal: pal({ wall: STONE, accent: STONE }) },
  // depo / sanayi: alçak geniş loftlar
  { key: 'depot_a', W: 22, D: 16, F: 3, style: 'loft', roof: 'flat', pal: pal({ wall: RED_DARK, accent: CHAR, metal: [0.3, 0.3, 0.33] }) },
  { key: 'depot_b', W: 18, D: 16, F: 4, style: 'loft', roof: 'flat', pal: pal({ wall: RED_WARM, accent: STONE, metal: [0.45, 0.46, 0.5] }) },
];

function gallery(sp) {
  const B = new Builder(sp.pal, mulberry32(1));
  sp.gallery.forEach((n, i) => { B.put(n, 0, i * 5, 0, 0); B.put("Prop_Bollard", 0, i * 5, 0, 0, [0.6, 1.5, 0.6]); });
  return { B, bounds: [[-2, 0, -3], [sp.gallery.length * 5, 4, 1]] };
}
if (process.env.GAL) SPECS.push({ key: "gallery", F: 1, pal: pal({ wall: RED, accent: CREAM }), gallery: (process.env.GAL || "").split(",") });
// ---------- yaz ----------
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const bins = []; let off = 0;
const push = (typed) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); const pad = (4 - (b.length % 4)) % 4; const o = off; bins.push(b, Buffer.alloc(pad)); off += b.length + pad; return o; };
const manifest = { version: 2, models: {} };
let seed = 101;
for (const sp of SPECS) {
  seed += 17;
  if (only && !only.has(sp.key)) continue;
  const { B, bounds } = sp.gallery ? gallery(sp) : sp.ready ? readyModel(sp.ready, sp.pal) : building({ ...sp, seed });
  const mm = { bounds, groups: {}, floors: sp.F };
  let tris = 0;
  for (const [g, G] of Object.entries(B.g)) {
    const nv = G.p.length / 3; if (!nv || !G.idx.length) continue;
    const nor = new Int8Array(nv * 4); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) nor[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, G.n[i * 3 + k])) * 127);
    const col = new Uint8Array(nv * 4); for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) col[i * 4 + k] = Math.round(Math.max(0, Math.min(1, G.c[i * 3 + k])) * 255); col[i * 4 + 3] = 255; }
    const idx = nv < 65536 ? new Uint16Array(G.idx) : new Uint32Array(G.idx);
    tris += G.idx.length / 3;
    mm.groups[g] = { verts: nv, count: G.idx.length, pos: push(new Float32Array(G.p)), nor: push(nor), uv: push(new Float32Array(G.uv)), col: push(col), idx: push(idx), idx32: nv >= 65536 };
  }
  mm.tris = tris;
  manifest.models[sp.key] = mm;
  const [mn, mx] = bounds;
  console.log(sp.key.padEnd(10), 'tris', String(tris).padStart(6), 'size', (mx[0] - mn[0]).toFixed(1), 'x', (mx[2] - mn[2]).toFixed(1), 'h', mx[1].toFixed(1), Object.keys(mm.groups).join(','));
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'buildings.bin'), Buffer.concat(bins));
fs.writeFileSync(path.join(OUT, 'buildings.json'), JSON.stringify(manifest));
console.log('bin bytes', off);
