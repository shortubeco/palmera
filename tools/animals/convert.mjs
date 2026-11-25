// "Animals_FREE" (Unity Asset Store) iskeletli hayvan modellerini oyunun okuyacağı animals.json'a çevirir.
// Kullanım: cd tools/animals; npm install; node convert.mjs "<assets/animals/Animals_FREE/Meshes>" <çıkış klasörü>
// Çıkış: three.js ObjectLoader biçimi ({ kinds: { tiger: <obje JSON>, deer: ... } }); her obje bir Group:
// içinde SkinnedMesh + kemikler, animations = gömülü klipler (idle/walk/run...). Baş +Z'ye bakar, ayaklar y = 0.
// Doku ayrı: Textures/Texture.png → tex/animals.png (tools/nature/atlas.ps1 ile 512'ye küçültülür).
import fs from 'node:fs';
import path from 'node:path';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};

const [, , SRC, OUT] = process.argv;
// oyundaki ad, dosya, baş kemiği (yön tespiti)
const SPECS = [
  ['tiger', 'Tiger_001.fbx', 'jaw'],
  ['deer', 'Deer_001.fbx', 'scull'],
  ['horse', 'Horse_001.fbx', 'scull'],   // Wild West: ağıl atları + at arabası (idle, walk, run, eat)
];

const out = { version: 1, kinds: {} };
for (const [name, file, head] of SPECS) {
  const buf = fs.readFileSync(path.join(SRC, file));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), SRC + '/');
  root.updateMatrixWorld(true);
  // yön: baş kemiği -Z'deyse 180° çevir
  let hb = null; root.traverse((o) => { if (o.isBone && o.name === head) hb = o; });
  const hp = new THREE.Vector3(); hb.getWorldPosition(hp);
  if (hp.z < 0) root.rotation.y += Math.PI;
  root.updateMatrixWorld(true);
  // ayaklar y = 0
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  // malzeme: düz (doku oyunda verilir)
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh) { mesh = o; o.material = new THREE.MeshStandardMaterial({ name: 'animal' }); } });
  // kök kemiğin yatay kayması (x/z) animasyondan çıkarılır: hayvan oyunda kodla ilerler
  for (const clip of root.animations) {
    for (const t of clip.tracks) {
      if (!/^Root\.position$/.test(t.name)) continue;
      const v = t.values;
      for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
    }
    clip.name = clip.name.replace(/^.*_\d+_/, '');   // Tiger_001_walk → walk
  }
  const json = root.toJSON();
  json.animations = root.animations.map((c) => THREE.AnimationClip.toJSON(c));
  const fb = new THREE.Box3().setFromObject(root);
  json.meta = { name, size: fb.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), clips: root.animations.map((c) => [c.name, +c.duration.toFixed(2)]) };
  out.kinds[name] = json;
  console.log(name.padEnd(6), 'verts', mesh.geometry.attributes.position.count, 'bones', mesh.skeleton.bones.length, 'size', json.meta.size.join(' x '), 'clips', json.meta.clips.map((c) => c.join(' ')).join(', '), hp.z < 0 ? '(180° çevrildi)' : '');
}
fs.mkdirSync(OUT, { recursive: true });
// sayıları kısalt (dosya boyutu)
const txt = JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(5) : v));
fs.writeFileSync(path.join(OUT, 'animals.json'), txt);
console.log('animals.json', (txt.length / 1024 / 1024).toFixed(2), 'MB');
