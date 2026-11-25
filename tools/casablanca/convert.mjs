// Casablanca: "Medieval City" paketinin (assets/Casablanca, Unity) demo sahnesini (Demo/Demo_01.unity) oyunun
// okuyacağı casablanca.json + casablanca.bin biçimine çevirir.
// Kullanım: cd tools/casablanca; npm install; node convert.mjs "../../assets/Casablanca/Medieval City" <çıkış klasörü> [harita.png]
//
// Çıkış (koordinatlar bölgenin yerel ekseninde: three.js, Y yukarı, m; demo sahnesinin denizi WATER_Y'ye oturur):
//   kinds[i] = { name, box, tris, parts:[{ vcount, icount, pos (Int16×3, box'a göre −32768…32767 nicelenmiş), nor (Int8×4), col (Uint8×4 sRGB), idx (Uint16|Uint32) }] }
//     col alfası: 255 düz renk, 128 pencere (gece yanar), 64 fener/ateş (gece parlar); aynalanmış kopyalar ayrı tür (üçgen sırası ters)
//   inst = [[kind, m00, m01, m02, m03, m10, ... m23], ...]  (satır sıralı 3×4 dünya matrisi)
//   hf = { x0, z0, res, w, h, off }  yürünen zemin yüksekliği (Int16, cm; −32768 = zemin yok → deniz)
//   col = { off, n }  çarpışma kutuları (Int16×6, dm: x0, z0, x1, z1, y0, y1)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};

const [, , SRC, OUT, MAPPNG] = process.argv;
const SHIFT_Y = 8.3;          // demo denizi y = −9 → oyunun su seviyesi (−0,7)
const AREA = { x0: -480, x1: 380, z0: -470, z1: 470 };   // yürünen alan (yükseklik + çarpışma ızgarası)
const HF_RES = 1, COL_RES = 0.5;
const FAR = 1400;             // bundan uzak arazi parçaları atılır (görüş mesafesi)

function* walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }

// ---------- guid → dosya, malzeme renkleri ----------
const byGuid = {};
for (const f of walk(SRC)) if (f.endsWith('.meta')) { const g = /guid: (\w+)/.exec(fs.readFileSync(f, 'utf8'))?.[1]; if (g) byGuid[g] = f.slice(0, -5); }
const matInfo = (guid) => {
  const f = byGuid[guid]; if (!f || !f.endsWith('.mat')) return { name: '?', col: [150, 150, 150] };
  const t = fs.readFileSync(f, 'utf8');
  const c = /- _Color: \{r: ([\d.]+), g: ([\d.]+), b: ([\d.]+)/.exec(t);
  const name = path.basename(f, '.mat');
  // kum (zemin, tepeler, kayalık): paketin tanıtım görsellerindeki (assets/Casablanca/screens) doygun sarı
  if (COLOR_OVERRIDE[name]) return { name, col: COLOR_OVERRIDE[name] };
  return { name, col: c ? [c[1], c[2], c[3]].map((v) => Math.round(Math.min(1, +v) * 255)) : [150, 150, 150] };
};
// (oyunun güneşi + ton eşlemesi rengi açar: görseldeki tonu tutturmak için biraz koyu ve turuncu verilir)
const COLOR_OVERRIDE = { 'Terrain 1': [226, 146, 34] };
function matKind(name) {
  if (/^Window/.test(name)) return 'win';
  if (/^Light/.test(name)) return 'light';
  if (/^(Water|Sea)/.test(name)) return 'water';
  return 'vc';
}

// ---------- prefablar: mesh + malzemeler ----------
const prefabs = {};
function prefab(file) {
  if (prefabs[file]) return prefabs[file];
  const t = fs.readFileSync(file, 'utf8');
  const mf = /m_Mesh: \{fileID: (\d+), guid: (\w+)/.exec(t);
  const mats = [...t.matchAll(/- \{fileID: 2100000, guid: (\w+)/g)].map((m) => m[1]);
  return (prefabs[file] = { meshId: mf[1], fbx: byGuid[mf[2]], mats });
}
// FBX dosyası doğrudan sahneye konmuşsa: malzemeler FBX'in kendisinden
const modelPrefab = (file) => ({ meshId: null, fbx: file, mats: null });

// ---------- sahne ----------
const scene = fs.readFileSync(path.join(SRC, 'Demo/Demo_01.unity'), 'utf8');
const docs = scene.split(/^--- !u!/m).slice(1).map((d) => { const m = /^(\d+) &(\d+)( stripped)?/.exec(d); return { type: +m[1], id: m[2], stripped: !!m[3], body: d }; });
const vec = (s, k) => { const m = new RegExp(k + ': \\{x: ([-\\d.e]+), y: ([-\\d.e]+), z: ([-\\d.e]+)(?:, w: ([-\\d.e]+))?\\}').exec(s); return m ? m.slice(1).filter((x) => x !== undefined).map(Number) : null; };
const T = {}, GO = {}, PI = {};
for (const d of docs) {
  if (d.type === 1 && !d.stripped) GO[d.id] = { name: /m_Name: (.*)/.exec(d.body)?.[1].trim(), active: !/m_IsActive: 0/.test(d.body) };
  else if (d.type === 4) {
    if (d.stripped) T[d.id] = { pi: /m_PrefabInstance: \{fileID: (\d+)\}/.exec(d.body)[1] };
    else T[d.id] = { go: /m_GameObject: \{fileID: (\d+)\}/.exec(d.body)[1], p: vec(d.body, 'm_LocalPosition'), q: vec(d.body, 'm_LocalRotation'), s: vec(d.body, 'm_LocalScale'), father: /m_Father: \{fileID: (\d+)\}/.exec(d.body)[1] };
  } else if (d.type === 1001) {
    const parent = /m_TransformParent: \{fileID: (\d+)\}/.exec(d.body)[1];
    const src = /m_SourcePrefab: \{fileID: \d+, guid: (\w+)/.exec(d.body)?.[1];
    const mods = {}, matOv = {}; let active = true;
    for (const m of d.body.matchAll(/- target: \{fileID: \d+, guid: \w+, type: 3\}\s+propertyPath: (\S+)\s+value: (.*)\s+objectReference: \{fileID: (\d+)(?:, guid: (\w+))?/g)) {
      const k = m[1], v = m[2].trim();
      if (k === 'm_IsActive' && v === '0') active = false;
      const mm = /^m_Materials\.Array\.data\[(\d+)\]$/.exec(k);
      if (mm && m[4]) matOv[+mm[1]] = m[4];
      mods[k] = v;
    }
    const g = (k, def) => (mods[k] !== undefined && mods[k] !== '' ? +mods[k] : def);
    PI[d.id] = { parent, file: byGuid[src], active, matOv,
      p: [g('m_LocalPosition.x', 0), g('m_LocalPosition.y', 0), g('m_LocalPosition.z', 0)],
      q: [g('m_LocalRotation.x', 0), g('m_LocalRotation.y', 0), g('m_LocalRotation.z', 0), g('m_LocalRotation.w', 1)],
      s: [g('m_LocalScale.x', 1), g('m_LocalScale.y', 1), g('m_LocalScale.z', 1)] };
  }
}
const trs = (p, q, s) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion(...q), new THREE.Vector3(...s));
function worldOfT(id) {
  const t = T[id]; if (!t) return { m: new THREE.Matrix4(), act: true };
  if (t.pi) { const pi = PI[t.pi]; const w = worldOfT(pi.parent); return { m: w.m.multiply(trs(pi.p, pi.q, pi.s)), act: w.act && pi.active }; }
  const w = worldOfT(t.father); return { m: w.m.multiply(trs(t.p, t.q, t.s)), act: w.act && GO[t.go]?.active !== false };
}
// Unity (sol el) → three: F·M·F (F = x aynası); Unity mesh'i = FBX ham geometrisi ×0,01 (x aynalı) → toplam F·M·F·S(0,01)
const F = new THREE.Matrix4().makeScale(-1, 1, 1);
const S = new THREE.Matrix4().makeScale(0.01, 0.01, 0.01);
const SH = new THREE.Matrix4().makeTranslation(0, SHIFT_Y, 0);
const SKIP = /^(sky|sea|snow_mountain)$/;
// batı sur kapısının yerindeki parçalar çıkarılır (yerine oyunda kodla büyük şehir kapısı: casablanca.js buildGate)
const REMOVE = [['castle_tower_octagon', -155, -19.6], ['street_gate', -141.6, -14.3]];
const items = [];
for (const pi of Object.values(PI)) {
  if (!pi.file) continue;
  const w = worldOfT(pi.parent); if (!w.act || !pi.active) continue;
  const name = path.basename(pi.file).replace(/\.(prefab|fbx)$/i, '');
  if (SKIP.test(name)) continue;
  const pf = pi.file.endsWith('.prefab') ? prefab(pi.file) : modelPrefab(pi.file);
  const mats = pf.mats ? pf.mats.map((g, i) => pi.matOv[i] || g) : null;
  const M = SH.clone().multiply(F).multiply(w.m.multiply(trs(pi.p, pi.q, pi.s))).multiply(F).multiply(S);
  const e = M.elements;
  if (REMOVE.some(([n, x, z]) => n === name && Math.hypot(e[12] - x, e[14] - z) < 3)) { console.log('çıkarıldı', name); continue; }
  items.push({ name, pf, mats, M });
}
console.log('örnek', items.length);

// ---------- FBX geometrisi (ham, cm) ----------
const fbxCache = {};
function fbxMesh(file, meshId) {
  const key = file + '#' + meshId;
  if (fbxCache[key]) return fbxCache[key];
  const buf = fs.readFileSync(file);
  const r = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const meshes = []; r.traverse((o) => { if (o.isMesh) meshes.push(o); });
  let o = meshes[0];
  if (meshId && meshes.length > 1) {
    const meta = fs.readFileSync(file + '.meta', 'utf8');
    const nm = new RegExp('\\s' + meshId + ': (.+)').exec(meta)?.[1].trim();
    o = meshes.find((m) => m.name === nm) || o;
  }
  if (meshes.length > 1) console.log('  çok mesh', path.basename(file), meshes.length, '→', o.name);
  return (fbxCache[key] = o);
}

// ---------- türler (prefab + malzeme dizisi) ----------
const kinds = [], kindByKey = {};
const bins = []; let off = 0;
function push(arr) {
  const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bins.push(b);
  const o = off; off += b.length; return o;
}
const toSRGB = (v) => Math.round(Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
const FLAG = { vc: 255, win: 128, light: 64, water: 255 };   // köşe renginin alfası: pencere / fener işareti
const idxOf = new Map();   // tür → üçgen dizinleri (aynalı kopya türü için)
function kindFor(it) {
  const mirror = it.M.determinant() < 0;   // aynalanmış kopya: köşeleri paylaşan, üçgen sırası ters tür
  const base = it.name + '|' + (it.mats || []).join(','), key = base + (mirror ? '|m' : '');
  if (kindByKey[key] !== undefined) return kindByKey[key];
  if (mirror) {
    const b = kinds[kindFor({ ...it, M: new THREE.Matrix4() })];
    const k = { ...b, parts: b.parts.map((p, i) => {
      const idx = idxOf.get(b)[i].slice();
      for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
      return { ...p, idx: push(idx) };
    }) };
    kindByKey[key] = kinds.length; kinds.push(k);
    return kindByKey[key];
  }
  const o = fbxMesh(it.pf.fbx, it.pf.meshId);
  const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
  const rp = o.userData.transformData?.rotationPivot || [0, 0, 0];
  const fm = [].concat(o.material);
  const groups = g0.groups.length ? g0.groups : [{ start: 0, count: g0.attributes.position.count, materialIndex: 0 }];
  const P = g0.attributes.position, N = g0.attributes.normal;
  const by = {};
  // Unity alt-mesh sırası = FBX malzemelerinin üçgen listesinde İLK GÖRÜNÜŞ sırası (FBX malzeme dizini değil);
  // prefab'daki malzeme dizisi bu sıraya göredir. Malzemesi olmayan fazla alt-mesh Unity'de çizilmez.
  const order = [];
  for (const gr of groups) if (!order.includes(gr.materialIndex)) order.push(gr.materialIndex);
  for (const gr of groups) {
    let mi;
    if (it.mats) {
      const sub = order.indexOf(gr.materialIndex);
      if (sub >= it.mats.length) continue;
      mi = matInfo(it.mats[sub]);
    }
    else { const m = fm[gr.materialIndex] || fm[0]; mi = { name: m.name, col: [m.color.r, m.color.g, m.color.b].map(toSRGB) }; }
    const mk = matKind(mi.name);
    const col = mk === 'water' ? [70, 120, 170] : mi.col;
    (by.all = by.all || []).push({ start: gr.start, count: gr.count, col: [...col, FLAG[mk]] });
  }
  const box = new THREE.Box3();
  for (let i = 0; i < P.count; i++) box.expandByPoint(new THREE.Vector3(P.getX(i) - rp[0], P.getY(i) - rp[1], P.getZ(i) - rp[2]));
  const mn = box.min, sz = box.getSize(new THREE.Vector3());
  const k = { name: it.name, box: [...mn.toArray(), ...box.max.toArray()].map((v) => +v.toFixed(2)), parts: [] };
  let tris = 0;
  for (const [mk, list] of Object.entries(by)) {
    // köşe kaynaştırma (konum + normal + renk aynıysa)
    const map = new Map(), pos = [], nor = [], col = [], idx = [];
    // pencere malzemesi geniş yüzeylerde de kullanılmış (iç duvar, kapı boşluğu): yalnız küçük üçgenler gece yanar
    const WIN_MAX = 2.5e4;   // cm² (2,5 m²)
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    for (const gr of list) for (let i = gr.start; i < gr.start + gr.count; i++) {
      if ((i - gr.start) % 3 === 0) {
        va.fromBufferAttribute(P, i); vb.fromBufferAttribute(P, i + 1); vc.fromBufferAttribute(P, i + 2);
        const area = vb.sub(va).cross(vc.sub(va)).length() / 2;
        gr.flag = gr.col[3] === FLAG.win && area > WIN_MAX ? 255 : gr.col[3];
      }
      const cl = [gr.col[0], gr.col[1], gr.col[2], gr.flag];
      const x = P.getX(i) - rp[0], y = P.getY(i) - rp[1], z = P.getZ(i) - rp[2];
      const qx = Math.round((x - mn.x) / (sz.x || 1) * 65535) - 32768, qy = Math.round((y - mn.y) / (sz.y || 1) * 65535) - 32768, qz = Math.round((z - mn.z) / (sz.z || 1) * 65535) - 32768;
      const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
      const ax = Math.round(nx / l * 127), ay = Math.round(ny / l * 127), az = Math.round(nz / l * 127);
      const h = qx + ',' + qy + ',' + qz + ',' + ax + ',' + ay + ',' + az + ',' + cl.join(',');
      let v = map.get(h);
      if (v === undefined) { v = pos.length / 3; map.set(h, v); pos.push(qx, qy, qz); nor.push(ax, ay, az, 0); col.push(...cl); }
      idx.push(v);
    }
    const vcount = pos.length / 3, ia = vcount > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    const part = { vcount, icount: idx.length };
    part.pos = push(new Int16Array(pos)); part.nor = push(new Int8Array(nor)); part.col = push(new Uint8Array(col));
    part.idx = push(ia);
    k.parts.push(part); tris += idx.length / 3;
    (idxOf.get(k) || idxOf.set(k, []).get(k)).push(ia);
  }
  k.tris = tris;
  kindByKey[key] = kinds.length; kinds.push(k);
  return kindByKey[key];
}

// ---------- yerleşim + zemin/çarpışma için dünya üçgenleri ----------
// zemin: arazi, kayalık, platformlar, merdivenler, iskeleler; katı: geri kalan her şey (bina, sur, kule, ağaç, eşya)
const GROUND = /^(terrain_|cliff_|building_base|citadel_base|port_base|port_house_base|stone_stairs|port_wooden_bridge|street_green_belt|street_pond)/;
const NOSOLID = /^(banner|ladder_|fence_stick|door_canopy|balcony_)/;   // ince/havada: çarpışma yok
const inst = [];
const hfW = Math.round((AREA.x1 - AREA.x0) / HF_RES), hfH = Math.round((AREA.z1 - AREA.z0) / HF_RES);
const hf = new Float32Array(hfW * hfH).fill(-1e9);
const cW = Math.round((AREA.x1 - AREA.x0) / COL_RES), cH = Math.round((AREA.z1 - AREA.z0) / COL_RES);
const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
function worldTris(it, cb) {
  const o = fbxMesh(it.pf.fbx, it.pf.meshId);
  const g = o.geometry, P = g.attributes.position, I = g.index;
  const rp = o.userData.transformData?.rotationPivot || [0, 0, 0];
  const M = it.M.clone().multiply(new THREE.Matrix4().makeTranslation(-rp[0], -rp[1], -rp[2]));
  const n = I ? I.count : P.count;
  for (let t = 0; t < n; t += 3) {
    const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
    v0.fromBufferAttribute(P, a).applyMatrix4(M); v1.fromBufferAttribute(P, b).applyMatrix4(M); v2.fromBufferAttribute(P, c).applyMatrix4(M);
    cb(v0, v1, v2);
  }
}
// üçgeni xz ızgarasına tara: hücre merkezindeki yükseklik
function rasterTop(a, b, c, x0, z0, res, W, H, fn) {
  const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x), minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
  const i0 = Math.max(0, Math.ceil((minx - x0) / res - 0.5)), i1 = Math.min(W - 1, Math.floor((maxx - x0) / res - 0.5));
  const j0 = Math.max(0, Math.ceil((minz - z0) / res - 0.5)), j1 = Math.min(H - 1, Math.floor((maxz - z0) / res - 0.5));
  if (i0 > i1 || j0 > j1) return;
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(d) < 1e-9) return;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = x0 + (i + 0.5) * res, pz = z0 + (j + 0.5) * res;
    const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d, l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    fn(j * W + i, l1 * a.y + l2 * b.y + l3 * c.y);
  }
}
const solidItems = [];
for (const it of items) {
  const c = new THREE.Vector3().setFromMatrixPosition(it.M);
  if (Math.hypot(c.x, c.z) > FAR) continue;   // uzaktaki arazi parçaları
  const k = kindFor(it);
  const e = it.M.elements;   // sütun sıralı → satır sıralı 3×4
  inst.push([k, ...[e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]].map((v) => +v.toFixed(5))]);
  if (GROUND.test(it.name)) worldTris(it, (a, b, cc) => rasterTop(a, b, cc, AREA.x0, AREA.z0, HF_RES, hfW, hfH, (q, y) => { if (y > hf[q]) hf[q] = y; }));
  else if (!NOSOLID.test(it.name)) solidItems.push(it);
}
console.log('türler', kinds.length, 'tür üçgeni', kinds.reduce((s, k) => s + k.tris, 0), 'sahne üçgeni', inst.reduce((s, r) => s + kinds[r[0]].tris, 0));
const SEA = -4;
const ground = (x, z) => {
  const i = Math.floor((x - AREA.x0) / HF_RES), j = Math.floor((z - AREA.z0) / HF_RES);
  if (i < 0 || j < 0 || i >= hfW || j >= hfH) return SEA;
  const v = hf[j * hfW + i]; return v < -1e8 ? SEA : v;
};

// ---------- çarpışma: oyuncu boyundaki bant [zemin+0,35, zemin+1,9] içinde kalan katı yüzeyler ----------
const solid = new Uint8Array(cW * cH), top = new Float32Array(cW * cH).fill(-1e9);
let samples = 0;
for (const it of solidItems) worldTris(it, (a, b, c) => {
  const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x), minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
  if (maxx < AREA.x0 || minx > AREA.x1 || maxz < AREA.z0 || minz > AREA.z1) return;
  const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  const n = Math.max(1, Math.ceil(L / (COL_RES * 0.45)));
  for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
    const s = u / n, t = v / n, r = 1 - s - t;
    const x = a.x * r + b.x * s + c.x * t, y = a.y * r + b.y * s + c.y * t, z = a.z * r + b.z * s + c.z * t;
    const i = Math.floor((x - AREA.x0) / COL_RES), j = Math.floor((z - AREA.z0) / COL_RES);
    if (i < 0 || j < 0 || i >= cW || j >= cH) continue;
    samples++;
    const q = j * cW + i, g = ground(x, z);
    if (y > g + 0.35 && y < g + 1.9) solid[q] = 1;
    if (y > top[q]) top[q] = y;
  }
});
console.log('örnek nokta', samples);
// açgözlü dikdörtgen birleştirme
const used = new Uint8Array(cW * cH), rects = [];
for (let j = 0; j < cH; j++) for (let i = 0; i < cW; i++) {
  const q = j * cW + i; if (!solid[q] || used[q]) continue;
  let w = 1; while (i + w < cW && solid[q + w] && !used[q + w]) w++;
  let h = 1;
  grow: for (; j + h < cH; h++) { for (let k = 0; k < w; k++) { const r = (j + h) * cW + i + k; if (!solid[r] || used[r]) break grow; } }
  let ymax = -1e9, gmin = 1e9;
  for (let jj = j; jj < j + h; jj++) for (let ii = i; ii < i + w; ii++) {
    const r = jj * cW + ii; used[r] = 1; ymax = Math.max(ymax, top[r]);
    gmin = Math.min(gmin, ground(AREA.x0 + (ii + 0.5) * COL_RES, AREA.z0 + (jj + 0.5) * COL_RES));
  }
  rects.push([AREA.x0 + i * COL_RES, AREA.z0 + j * COL_RES, AREA.x0 + (i + w) * COL_RES, AREA.z0 + (j + h) * COL_RES, gmin - 3, ymax]);
}
console.log('çarpışma kutusu', rects.length);

// ---------- yaz ----------
const hfI = new Int16Array(hfW * hfH);
for (let q = 0; q < hf.length; q++) hfI[q] = hf[q] < -1e8 ? -32768 : Math.round(hf[q] * 100);
const colI = new Int16Array(rects.length * 6);
rects.forEach((r, n) => r.forEach((v, k) => { colI[n * 6 + k] = Math.round(v * 10); }));
const out = {
  version: 1, shift: SHIFT_Y, sea: SEA,
  kinds, inst,
  hf: { x0: AREA.x0, z0: AREA.z0, res: HF_RES, w: hfW, h: hfH, off: push(hfI) },
  col: { n: rects.length, off: push(colI) },
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'casablanca.bin'), Buffer.concat(bins));
fs.writeFileSync(path.join(OUT, 'casablanca.json'), JSON.stringify(out));
console.log('bin', (off / 1048576).toFixed(2), 'MB, json', (fs.statSync(path.join(OUT, 'casablanca.json')).size / 1024).toFixed(0), 'KB');

// ---------- isteğe bağlı: kuşbakışı harita (zemin yüksekliği + çarpışma) ----------
if (MAPPNG) {
  const W = hfW, H = hfH, px = Buffer.alloc((W * 3 + 1) * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const v = hf[j * W + i], o = j * (W * 3 + 1) + 1 + i * 3;
      let c = v < -1e8 ? [30, 70, 120] : [Math.min(255, 90 + v * 6), Math.min(255, 110 + v * 5), 70];
      const ci = Math.floor(i * HF_RES / COL_RES), cj = Math.floor(j * HF_RES / COL_RES);
      if (solid[cj * cW + ci] || solid[cj * cW + ci + 1] || solid[(cj + 1) * cW + ci]) c = [200, 60, 60];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(MAPPNG, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
  console.log('harita', MAPPNG);
}
