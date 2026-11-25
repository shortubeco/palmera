// Low Poly Nature Pack (BDStudios) FBX modellerini oyunun okuyacağı nature.json + nature.bin biçimine çevirir
// Kullanım: cd tools/nature; npm install; node convert.mjs "<assets/nature/Low Poly Nature Pack/Models>" <çıkış>
// Modeller Z yukarı (Unity'den), metre. Çıkış: Y yukarı, taban y=0, x/z ortası (0,0) gövde dibinde.
// Her türün iki LOD'u yazılır: [yakın, uzak]. Doku: renk atlası (uv), oyun tarafında tex/nature_atlas.png.
import fs from 'node:fs';
import path from 'node:path';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};   // "PSD doku desteklenmiyor" uyarıları

const [, , SRC, OUT] = process.argv;
// grup, dosya, [yakın LOD, uzak LOD]
const SPECS = [];
const tree = (n, vars, lods = [1, 2]) => { for (const v of vars) SPECS.push(['tree', `Trees/Tree${n}${v}.fbx`, lods]); };
tree('01', 'ABCDE'); tree('2', 'ABC'); tree('3', 'ABC'); tree('4', 'ABC'); tree('5', 'ABC');
tree('7', 'AB'); tree('8', 'AB'); tree('10', 'ABC'); tree('11', 'ABC'); tree('12', 'ABC'); tree('13', 'ABC');
for (let k = 1; k <= 5; k++) SPECS.push(['rock', `Rocks/Rock0${k}.fbx`, [0, 1]]);
for (let k = 1; k <= 8; k++) SPECS.push(['boulder', `Boulders/Boulder0${k}.fbx`, [0, 2]]);
for (const p of ['02A', '02C', '03A', '03B', '10A', '10C', '12A', '12C', '13A', '13C', '14A']) SPECS.push(['plant', `Plants/Plant${p}.fbx`, [2, 2]]);
for (const m of ['01A', '01B', '05A', '05C', '02A']) SPECS.push(['mushroom', `Mushrooms/Mushroom${m}.fbx`, [1, 2]]);
SPECS.push(['prop', 'House/CampFire.fbx', [0, 0]]);
SPECS.push(['prop', 'House/Barrel.fbx', [0, 0]]);
SPECS.push(['prop', 'House/Box01.fbx', [0, 0]]);
SPECS.push(['prop', 'House/Box02.fbx', [0, 0]]);

function loadFBX(file) {
  const buf = fs.readFileSync(file);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(file) + '/');
}
const bins = []; let off = 0;
function push(arr) {
  const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bins.push(b);
  const o = off; off += b.length; return o;
}
const ZUP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);   // (x,y,z) → (x, z, −y)

// bir LOD'un tüm parçalarını (gövde + yaprak) topla
function lodGeo(root, L) {
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = /_LOD(\d)$/.exec(o.name);
    if ((m ? +m[1] : 0) !== L) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(ZUP, o.matrixWorld));
    parts.push({ g, leaf: /l$/.test(o.name.replace(/_LOD\d$/, '')) });
  });
  return parts;
}
function write(parts, shift) {
  let n = 0; for (const p of parts) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Int8Array(n * 4), uv = new Uint16Array(n * 2);
  let w = 0;
  for (const { g } of parts) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++, w++) {
      pos[w * 3] = P.getX(i) - shift.x; pos[w * 3 + 1] = P.getY(i) - shift.y; pos[w * 3 + 2] = P.getZ(i) - shift.z;
      const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
      nor[w * 4] = Math.round(nx / l * 127); nor[w * 4 + 1] = Math.round(ny / l * 127); nor[w * 4 + 2] = Math.round(nz / l * 127);
      uv[w * 2] = Math.round(Math.min(1, Math.max(0, U.getX(i))) * 65535);
      uv[w * 2 + 1] = Math.round(Math.min(1, Math.max(0, U.getY(i))) * 65535);
    }
  }
  return { count: n, pos: push(pos), nor: push(nor), uv: push(uv) };
}

const out = { version: 1, kinds: {} };
let tot = 0;
for (const [group, file, lods] of SPECS) {
  const root = loadFBX(path.join(SRC, file)); root.updateMatrixWorld(true);
  const near = lodGeo(root, lods[0]);
  const far = lods[1] === lods[0] ? null : lodGeo(root, lods[1]);
  // taban: en alt nokta; x/z: ağaçta gövdenin dip ortası, diğerlerinde kutu ortası
  const box = new THREE.Box3(); for (const p of near) { p.g.computeBoundingBox(); box.union(p.g.boundingBox); }
  const trunk = near.filter((p) => !p.leaf);
  let cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, r = 0;
  if (group === 'tree' && trunk.length) {
    let sx = 0, sz = 0, n = 0;
    for (const { g } of trunk) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < box.min.y + 0.8) { sx += P.getX(i); sz += P.getZ(i); n++; } }
    if (n) { cx = sx / n; cz = sz / n; }
    for (const { g } of trunk) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < box.min.y + 1.2) r = Math.max(r, Math.hypot(P.getX(i) - cx, P.getZ(i) - cz)); }
  } else r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const shift = new THREE.Vector3(cx, box.min.y, cz);
  const name = path.basename(file, '.fbx');
  const k = { group, h: +(box.max.y - box.min.y).toFixed(2), r: +r.toFixed(2),
    w: +Math.max(box.max.x - cx, cx - box.min.x, box.max.z - cz, cz - box.min.z).toFixed(2),
    lods: [write(near, shift)] };
  if (far) k.lods.push(write(far, shift));
  // ağaç tacı (uzak görünüm için): yaprak parçalarının yükseklik aralığı, yarıçapı ve ortalama atlas uv'si
  const leaves = near.filter((p) => p.leaf);
  if (group === 'tree' && leaves.length) {
    const lb = new THREE.Box3(); let su = 0, sv = 0, n = 0;
    for (const { g } of leaves) {
      lb.union(g.boundingBox);
      const U = g.attributes.uv; for (let i = 0; i < U.count; i++) { su += U.getX(i); sv += U.getY(i); n++; }
    }
    k.crown = [+(lb.min.y - shift.y).toFixed(2), +(lb.max.y - shift.y).toFixed(2),
      +(Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) / 2 * 0.85).toFixed(2),
      +((lb.min.x + lb.max.x) / 2 - cx).toFixed(2), +((lb.min.z + lb.max.z) / 2 - cz).toFixed(2)];
    k.leafUV = [+(su / n).toFixed(4), +(sv / n).toFixed(4)];
  }
  out.kinds[name] = k;
  tot += k.lods.reduce((s, l) => s + l.count, 0);
  console.log(name.padEnd(14), group.padEnd(8), 'h', k.h, 'r', k.r, 'w', k.w, 'tris', k.lods.map((l) => l.count / 3).join('/'), k.crown ? 'crown ' + k.crown.join(',') + ' uv ' + k.leafUV.join(',') : '');
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'nature.bin'), Buffer.concat(bins));
fs.writeFileSync(path.join(OUT, 'nature.json'), JSON.stringify(out));
console.log('kinds', Object.keys(out.kinds).length, 'verts', tot, 'bin', off, 'bytes');
