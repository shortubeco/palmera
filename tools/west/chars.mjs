// "Low-Poly Western Starter Pack" karakterlerini (şerif, kanun kaçağı, silahşor) oyunun okuyacağı west_chars.json'a çevirir.
// Kullanım: cd tools/west; npm install; node chars.mjs "../../assets/wild west/Low-PolyWesternStarterPack/Character" <çıkış>
//   ardından dokular: powershell -File chars_atlas.ps1 "<Character/Textures>" <çıkış>/tex/west
// FBXLoader her SkinnedMesh için iskeleti iç içe kopyalıyor (aynı adlı kemik kendi kopyasının çocuğu). Burada tüm mesh'ler
// en dıştaki kopyaya bağlanır, kopyalar silinir; 3–4 parça (gövde, şapka, ceket, rozet) tek geometride birleşir,
// uv'ler 2×2 doku atlasına (512²) taşınır: hücre 0 gövde, 1 şapka, 2 ceket, 3 rozet → karakter başına tek çizim.
// Animasyon yok (oyunda kemikler kodla döndürülür). Yüz +Z, ayak y = 0, boy ~1,8 m.
import fs from 'node:fs';
import path from 'node:path';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};

const [, , SRC, OUT] = process.argv;
const CHARS = [['sheriff', 'sheriff'], ['outlaw', 'outlow'], ['gunman', 'gunman']];
const cellOf = (mat, base) => (mat === base ? 0 : mat === base + '_hat' ? 1 : mat === base + '_jacket' ? 2 : 3);

const out = { version: 1, kinds: {} };
for (const [name, base] of CHARS) {
  const buf = fs.readFileSync(path.join(SRC, 'Models', base + '.fbx'));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), SRC + '/');
  root.updateMatrixWorld(true);
  // en dıştaki kopyalar
  const primary = new Map();
  root.traverse((o) => { if (o.isBone && !primary.has(o.name)) primary.set(o.name, o); });
  const meshes = []; root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const skel = meshes[0].skeleton, bones = skel.bones.map((b) => primary.get(b.name));
  // parçaları birleştir: hepsi aynı kemik sırasına çevrilir
  const geos = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    const remap = m.skeleton.bones.map((b) => bones.indexOf(primary.get(b.name)));
    const si = g.attributes.skinIndex;
    for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, Math.max(0, remap[si.getComponent(i, c)]));
    const cell = cellOf([].concat(m.material)[0].name, base), ox = (cell % 2) * 0.5, oy = cell < 2 ? 0.5 : 0;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      // paket uv'leri 0..1 içinde (ölçüldü); kenar taşmasın diye hafif kırpılır
      uv.setXY(i, ox + THREE.MathUtils.clamp(uv.getX(i), 0.002, 0.998) * 0.5, oy + THREE.MathUtils.clamp(uv.getY(i), 0.002, 0.998) * 0.5);
    }
    return g;
  });
  const geo = mergeGeometries(geos);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ name: 'cowboy' }));
  mesh.name = name;
  // kopya kemikleri sil, mesh'i köke ekle, eski mesh'leri at
  for (const b of primary.values()) for (const c of [...b.children]) if (c.isBone && c.name === b.name) b.remove(c);
  for (const m of meshes) m.parent.remove(m);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, skel.boneInverses), meshes[0].bindMatrix);
  const json = root.toJSON();
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  json.meta = { name, size: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), tex: 'tex/west/char_' + name + '.png' };
  out.kinds[name] = json;
  console.log(name.padEnd(8), 'parça', meshes.length, 'köşe', geo.attributes.position.count, 'kemik', bones.length, 'boy', json.meta.size.join(' x '));
}
fs.mkdirSync(OUT, { recursive: true });
const txt = JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(5) : v));
fs.writeFileSync(path.join(OUT, 'west_chars.json'), txt);
console.log('west_chars.json', (txt.length / 1024).toFixed(0), 'KB');
