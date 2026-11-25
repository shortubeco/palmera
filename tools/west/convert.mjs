// Wild West paketlerini (assets/wild west/) oyunun okuyacağı west.json + west.bin biçimine çevirir.
// Kullanım: cd tools/west; npm install; node convert.mjs "../../assets/wild west" <çıkış klasörü>
// Çıkış: kinds[ad] = { group, size:[w,h,d], parts:[{ mat, count, pos, nor, col, uv? }] }
//   yerel eksen: Y yukarı, taban y = 0, x/z kutu ortası; ön yüz +Z (SPECS'teki rot ile çevrilir).
//   mat: 'vc' (yalnız köşe rengi) ya da dokulu ('wood0'..'wood5', 'roof', 'sign_*'; dokular tex/west/ altında).
//   col: sRGB Uint8 (palet dokuları köşe rengine işlenir), oyunda doğrusala çevrilir.
// Paketler: "Low Poly Wild West Environment" (env_, 3 hazır bina Unity prefab'larından birleştirilir),
//   "Wild West Village" (vil_, cm → m), "Aletheia" (al_, Z yukarı), at arabası parçaları (araç için ayrı).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};

const [, , SRC, OUT] = process.argv;
const ENV = path.join(SRC, 'Low Poly Wild West Environment');
const VIL = path.join(SRC, 'Wild West Village');
const ALE = path.join(SRC, 'Aletheia');

// ---------- PNG (8 bit, RGB/RGBA/palet, taramasız) ----------
function readPNG(file) {
  const b = fs.readFileSync(file);
  let o = 8, w, h, depth, type, plte = null; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; if (d[12]) throw new Error('interlaced ' + file); }
    else if (t === 'PLTE') plte = d;
    else if (t === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (depth !== 8) throw new Error('depth ' + depth + ' ' + file);
  const bpp = { 2: 3, 6: 4, 3: 1, 0: 1, 4: 2 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      if (type === 2 || type === 6) { px[q] = cur[x * bpp]; px[q + 1] = cur[x * bpp + 1]; px[q + 2] = cur[x * bpp + 2]; px[q + 3] = type === 6 ? cur[x * bpp + 3] : 255; }
      else if (type === 3) { const k = cur[x]; px[q] = plte[k * 3]; px[q + 1] = plte[k * 3 + 1]; px[q + 2] = plte[k * 3 + 2]; px[q + 3] = 255; }
      else { px[q] = px[q + 1] = px[q + 2] = cur[x * bpp]; px[q + 3] = 255; }
    }
    prev = cur;
  }
  return { w, h, px };
}
const PAL = {
  low_poly_wild_west: readPNG(path.join(ENV, 'Textures/low_poly_wild_west.png')),
  'wild-west-village': readPNG(path.join(VIL, 'Textures/wild-west-village-colors.png')),
};
function samplePal(p, u, v) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(p.w - 1, Math.floor(u * p.w)), y = Math.min(p.h - 1, Math.floor((1 - v) * p.h)), q = (y * p.w + x) * 4;
  return [p.px[q], p.px[q + 1], p.px[q + 2]];
}

// ---------- malzeme adı → anahtar ----------
const TINT = { roof: [255, 125, 125] };   // roof.mat _Color (1, 0.24, 0.24) biraz açıldı
function matKey(name) {
  if (/^wood\d$/.test(name)) return name;
  if (/^roof(_mat\d)?$/.test(name)) return 'roof';
  const s = /^(bank|hotel|saloon|sheriff|store)-sign$/.exec(name); if (s) return 'sign_' + s[1];
  if (PAL[name]) return 'pal:' + name;
  return null;
}
const toSRGB = (c) => [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) * 255));

// ---------- yardımcılar ----------
function loadFBX(file) {
  const buf = fs.readFileSync(file);
  const r = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(file) + '/');
  r.updateMatrixWorld(true);
  return r;
}
// mesh'i (çok malzemeli olabilir) M matrisiyle malzeme parçalarına ayırır: [{ key, col, g }]
// matNames: Unity prefab'ından gelen malzeme adları (FBX'tekinin yerine)
function splitMesh(o, M, matNames = null) {
  const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
  g0.applyMatrix4(M);
  if (M.determinant() < 0) {   // aynalanmış: üçgen sırası ters
    for (const a of Object.values(g0.attributes)) for (let i = 0; i < a.count; i += 3) for (let c = 0; c < a.itemSize; c++) {
      const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t);
    }
  }
  const mats = [].concat(o.material);
  const groups = g0.groups.length ? g0.groups : [{ start: 0, count: g0.attributes.position.count, materialIndex: 0 }];
  const out = [];
  for (const gr of groups) {
    const fm = mats[gr.materialIndex] || mats[0];
    const name = matNames ? (matNames[gr.materialIndex] ?? matNames[0]) : fm.name;
    let key = matKey(name), col = null;
    if (!key) { key = 'vc'; col = toSRGB(fm.color); }
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g0.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) continue;
      g.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    }
    out.push({ key, col, g });
  }
  return out;
}

const bins = []; let off = 0;
function push(arr) {
  const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bins.push(b);
  const o = off; off += b.length; return o;
}
// parçaları malzemeye göre birleştir, rot (derece, Y) ve ölçek uygula, tabanı y=0 ve x/z ortaya al, bin'e yaz
const out = { version: 1, kinds: {} };
function emit(name, group, parts, { rot = 0, scale = 1, extra = null } = {}) {
  const R = new THREE.Matrix4().makeRotationY(rot * Math.PI / 180).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  const box = new THREE.Box3();
  for (const p of parts) { p.g.applyMatrix4(R); p.g.computeBoundingBox(); box.union(p.g.boundingBox); }
  const sh = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  // palet ve düz renkler tek 'vc' grubunda; dokulular kendi grubunda
  const byKey = new Map();
  for (const p of parts) { const k = /^(vc|pal:)/.test(p.key) ? 'vc' : p.key; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
  const k = { group, size: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => +v.toFixed(3)), parts: [] };
  let tris = 0;
  for (const [key, list] of byKey) {
    let n = 0; for (const p of list) n += p.g.attributes.position.count;
    const textured = key !== 'vc';
    const pos = new Float32Array(n * 3), nor = new Int8Array(n * 4), col = new Uint8Array(n * 4), uv = textured ? new Float32Array(n * 2) : null;
    let w = 0;
    for (const p of list) {
      const P = p.g.attributes.position, N = p.g.attributes.normal, U = p.g.attributes.uv;
      const pal = p.key.startsWith('pal:') ? PAL[p.key.slice(4)] : null, tint = TINT[p.key] || [255, 255, 255];
      for (let i = 0; i < P.count; i++, w++) {
        pos[w * 3] = P.getX(i) - sh.x; pos[w * 3 + 1] = P.getY(i) - sh.y; pos[w * 3 + 2] = P.getZ(i) - sh.z;
        const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
        nor[w * 4] = Math.round(nx / l * 127); nor[w * 4 + 1] = Math.round(ny / l * 127); nor[w * 4 + 2] = Math.round(nz / l * 127);
        const c = pal ? samplePal(pal, U.getX(i), U.getY(i)) : p.col || tint;
        col[w * 4] = c[0]; col[w * 4 + 1] = c[1]; col[w * 4 + 2] = c[2]; col[w * 4 + 3] = 255;
        if (uv) { uv[w * 2] = U ? U.getX(i) : 0; uv[w * 2 + 1] = U ? U.getY(i) : 0; }
      }
    }
    const part = { mat: key, count: n, pos: push(pos), nor: push(nor), col: push(col) };
    if (uv) part.uv = push(uv);
    k.parts.push(part);
    tris += n / 3;
  }
  if (extra) Object.assign(k, extra(sh));
  out.kinds[name] = k;
  console.log(name.padEnd(22), group.padEnd(5), 'size', k.size.map((v) => v.toFixed(1)).join(' x ').padEnd(18), 'tris', String(tris).padStart(5), 'mats', k.parts.map((p) => p.mat).join(','));
  return sh;
}

// ---------- 1) Environment paketi: tek FBX, düğüm adlarıyla ----------
const envRoot = loadFBX(path.join(ENV, 'low_poly_wild_west_environment.fbx'));
const envNodes = [];   // FBX sırasıyla mesh düğümleri
envRoot.traverse((o) => { if (o.isMesh) envNodes.push(o); });
const envByName = (n) => envNodes.find((o) => o.name === n);
const ENV_PROPS = {
  windmill: ['windmill'], water_tank: ['water_tank'], well: ['well', 'well_cylinder', 'well_rope', 'well_bucket'],
  tree0: ['tree0', 'tree0_leaves0', 'tree0_leaves1'], tree1: ['tree1'],
  cactus0: ['cactus0'], cactus1: ['cactus1'], cactus2: ['cactus2'],
  barrel: ['barrel'], crate0: ['crate0'], crate1: ['crate1'], trade_cart: ['trade_cart'],
  fountain: ['horses_drinking_fountain0', 'water'], bench: ['bench0'], chair: ['chair0'], table: ['table0'],
  hitching_post: ['hitching_post'], hay_roll: ['hay_roll'], hay_block: ['hay_block'], bull_skull: ['bull_skull'],
  fence: ['fence0'], sack: ['sack1'], big_sign: ['big_sign'], info_sign: ['info_sign0'],
  light_post0: ['light_post0'], light_post1: ['light_post1'], lamp0: ['lamp0'], lamp1: ['lamp1'], lamp2: ['lamp2'],
  tumbleweed: ['tumbleweed'], chest: ['chest_box', 'chest_lid'], ladder: ['ladder'], flag: ['flag0'],
  rock0: ['rock0'], rock1: ['rock1'], rock2: ['rock2'], rock3: ['rock3'], rock4: ['rock4'], cooking_pot: ['cooking_pot'],
  // Grand Hotel iç mekânı + yarım (salon) kapılar
  counter: ['counter'], table2: ['table2'], table3: ['table3'], chair1: ['chair1'], seat: ['seat'],
  bottle: ['bottle'], jug: ['jug'], moonshine_jug: ['moonshine_jug'], milk_jug: ['milk_jug'], broom: ['broom'],
  gun0: ['gun0'], gun1: ['gun1'], hat: ['hat'], bucket: ['bucket0'], saloon_door0: ['saloon_door0'], saloon_door1: ['saloon_door1'],
};
for (const [n, nodes] of Object.entries(ENV_PROPS)) {
  const parts = [];
  for (const nn of nodes) { const o = envByName(nn); if (!o) throw new Error('yok: ' + nn); parts.push(...splitMesh(o, o.matrixWorld)); }
  emit('env_' + n, 'prop', parts);
}

// at arabası: gövde + tekerlekler (tekerlek merkezleri gövde çerçevesinde 'wheels' olarak yazılır)
{
  const body = envByName('carriage');
  const wheels = ['carriage_fl_wheel', 'carriage_fr_wheel', 'carriage_rl_wheel', 'carriage_rr_wheel'].map(envByName);
  const centers = wheels.map((w) => new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()));
  emit('carriage', 'veh', splitMesh(body, body.matrixWorld),
    { extra: (s) => ({ wheels: centers.map((c) => [c.x - s.x, c.y - s.y, c.z - s.z].map((v) => +v.toFixed(3))) }) });
  for (const [i, nm] of [[0, 'carriage_wheel_f'], [2, 'carriage_wheel_r']]) {
    const c = centers[i];
    emit(nm, 'veh', splitMesh(wheels[i], new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z).multiply(wheels[i].matrixWorld)));
  }
}

// ---------- 2) Environment hazır binaları: Unity prefab YAML ----------
function* walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }
const metaNames = {};   // mesh fileID → [ad, aynı adın kaçıncısı] (aynı adlı mesh'ler FBX sırasıyla eşleşir)
{
  const seen = {};
  for (const l of fs.readFileSync(path.join(ENV, 'low_poly_wild_west_environment.fbx.meta'), 'utf8').split('\n')) {
    const m = /^\s+(43\d{5}): (.+?)\s*$/.exec(l); if (!m) continue;
    seen[m[2]] = seen[m[2]] || 0; metaNames[m[1]] = [m[2], seen[m[2]]++];
  }
}
const matByGuid = {};
for (const f of walk(SRC)) if (f.endsWith('.mat.meta')) matByGuid[/guid: (\w+)/.exec(fs.readFileSync(f, 'utf8'))[1]] = path.basename(f, '.mat.meta');
const ENV_GUID = /guid: (\w+)/.exec(fs.readFileSync(path.join(ENV, 'low_poly_wild_west_environment.fbx.meta'), 'utf8'))[1];
function nodeByMeta(fileID) {
  const e = metaNames[fileID]; if (!e) return null;
  const list = envNodes.filter((o) => o.name === e[0]);
  return list[e[1]] || list[0] || null;
}
function prefabKind(file, name, opt) {
  const docs = fs.readFileSync(file, 'utf8').split(/^--- !u!/m).slice(1).map((d) => {
    const m = /^(\d+) &(\d+)/.exec(d); return { type: +m[1], id: m[2], body: d };
  });
  const T = {}, GO = {}, MF = {}, MR = {};
  const vec = (s, k) => { const m = new RegExp(k + ': \\{x: ([-\\d.e]+), y: ([-\\d.e]+), z: ([-\\d.e]+)(?:, w: ([-\\d.e]+))?\\}').exec(s); return m ? m.slice(1).filter((x) => x !== undefined).map(Number) : null; };
  for (const d of docs) {
    const go = /m_GameObject: \{fileID: (\d+)\}/.exec(d.body)?.[1];
    if (d.type === 1) GO[d.id] = { name: /m_Name: (.*)/.exec(d.body)[1].trim(), active: !/m_IsActive: 0/.test(d.body) };
    else if (d.type === 4) T[d.id] = { go, p: vec(d.body, 'm_LocalPosition'), q: vec(d.body, 'm_LocalRotation'), s: vec(d.body, 'm_LocalScale'), father: /m_Father: \{fileID: (\d+)\}/.exec(d.body)[1] };
    else if (d.type === 33) { const m = /m_Mesh: \{fileID: (\d+), guid: (\w+)/.exec(d.body); if (m) MF[go] = { fid: m[1], guid: m[2] }; }
    else if (d.type === 23) MR[go] = { on: !/m_Enabled: 0/.test(d.body), mats: [...d.body.matchAll(/- \{fileID: 2100000, guid: (\w+)/g)].map((x) => matByGuid[x[1]]) };
  }
  const tByGo = {}; for (const [id, t] of Object.entries(T)) tByGo[t.go] = id;
  // Unity (sol el) → three: konum (−x, y, z), dönüş (x, −y, −z, w); kök dönüşümü yok sayılır
  const local = (t) => new THREE.Matrix4().compose(new THREE.Vector3(-t.p[0], t.p[1], t.p[2]), new THREE.Quaternion(t.q[0], -t.q[1], -t.q[2], t.q[3]), new THREE.Vector3(...t.s));
  const world = (id) => { const t = T[id]; return T[t.father] ? world(t.father).multiply(local(t)) : new THREE.Matrix4(); };
  const active = (id) => { const t = T[id]; return GO[t.go].active && (T[t.father] ? active(t.father) : true); };
  const parts = []; let miss = 0;
  for (const [go, mf] of Object.entries(MF)) {
    if (!MR[go] || !MR[go].on || !active(tByGo[go])) continue;
    const node = mf.guid === ENV_GUID ? nodeByMeta(mf.fid) : null;
    if (!node) { miss++; continue; }
    // Unity mesh'i düğümün dönme noktasına (RotationPivot) göredir; FBXLoader geometriyi pivotsuz tutar
    const rp = node.userData.transformData?.rotationPivot || [0, 0, 0];
    parts.push(...splitMesh(node, world(tByGo[go]).multiply(new THREE.Matrix4().makeTranslation(-rp[0], -rp[1], -rp[2])), MR[go].mats));
  }
  if (miss) console.log('  ', name, 'bulunamayan mesh', miss);
  return emit(name, 'bld', parts, opt);
}
for (const [f, n, rot] of [['Saloon', 'env_saloon', 180], ['Hotel', 'env_hotel', 0], ['Generic Building', 'env_generic', 180]])
  prefabKind(path.join(ENV, 'Prefabs/Buildings', f + '.prefab'), n, { rot });

// ---------- 3) Wild West Village: tek sahne FBX (cm) ----------
const vilRoot = loadFBX(path.join(VIL, 'Meshes/wild-west-village.fbx'));
const vilNodes = []; vilRoot.traverse((o) => { if (o.isMesh) vilNodes.push(o); });
const VIL_KINDS = {
  vil_house: 'Building', vil_saloon: 'Building1', vil_store: 'Building2', vil_hotel: 'Building3', vil_bank: 'Building4', vil_sheriff: 'Building5',
  vil_cart: 'Cart', vil_fence: 'Fence', vil_rail: 'Hitching-rail', vil_barrel: 'Barrel001', vil_box: 'Box002',
  vil_crate2: 'Crate2', vil_crate3: 'Crate3', vil_cactus1: 'Cactus1001', vil_cactus2: 'Cactus2001', vil_cactus3: 'Cactus3',
  vil_cactus4: 'Cactus4', vil_cactus5: 'Cactus5', vil_rock1: 'Rock1', vil_rock2: 'Rock2',
};
for (const [n, node] of Object.entries(VIL_KINDS)) {
  const o = vilNodes.find((x) => x.name === node); if (!o) { console.log('  yok', node); continue; }
  // yalnız geometri (düğüm konumu/dönüşü yok): tüm binalar aynı yerel eksende
  emit(n, /^vil_(house|saloon|store|hotel|bank|sheriff)$/.test(n) ? 'bld' : 'prop', splitMesh(o, new THREE.Matrix4()), { scale: 0.01 });
}

// ---------- 4) Aletheia: dosya başına bir model, Z yukarı ----------
const ZUP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
for (const f of fs.readdirSync(path.join(ALE, 'Models')).filter((n) => n.endsWith('.fbx'))) {
  const r = loadFBX(path.join(ALE, 'Models', f));
  const parts = [];
  r.traverse((o) => { if (o.isMesh) parts.push(...splitMesh(o, new THREE.Matrix4().multiplyMatrices(ZUP, o.matrixWorld))); });
  const n = path.basename(f, '.fbx');
  // bina ve tezgâhların ön yüzü (sundurma, kapı) +X'te → +Z'ye çevrilir
  emit('al_' + n, /building|booth|sawmill|stable|shed|tunnel|water_tank|gallows/.test(n) ? 'bld' : 'prop', parts, { rot: /building|booth/.test(n) ? -90 : 0 });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'west.bin'), Buffer.concat(bins));
fs.writeFileSync(path.join(OUT, 'west.json'), JSON.stringify(out));
// dokular: tex/west/
const TEX = path.join(OUT, 'tex/west'); fs.mkdirSync(TEX, { recursive: true });
for (let i = 0; i <= 5; i++) fs.copyFileSync(path.join(ENV, `Textures/wood${i}.png`), path.join(TEX, `wood${i}.png`));
fs.copyFileSync(path.join(ENV, 'Textures/roof.png'), path.join(TEX, 'roof.png'));
for (const s of ['bank', 'hotel', 'saloon', 'sheriff', 'store']) fs.copyFileSync(path.join(VIL, `Textures/${s}-sign.png`), path.join(TEX, `sign_${s}.png`));
console.log('kinds', Object.keys(out.kinds).length, 'bin', (off / 1024 / 1024).toFixed(2), 'MB');
