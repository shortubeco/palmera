// FBX araç modellerini oyunun okuyacağı vehicles.json + vehicles.bin biçimine çevirir
// node convert.mjs "<assets/vehicles dir>" "<out dir>"
import fs from 'node:fs';
import path from 'node:path';
import { loadFBX } from './probe.mjs';
const THREE = await import('three');

const [, , SRC, OUT] = process.argv;
// oyun adı ← dosya, hedef uzunluk (m); boat: tekerleksiz, kendi dokusu, y=0 su çizgisi (yOff model biriminde)
const LP = 'Low poly vehicle pack lite/Model/';
const SPECS = {
  sport: [LP + 'sport car 2.fbx', 4.5],
  sedan: [LP + 'sedan 1.fbx', 4.7],
  hatch: [LP + 'hatchback 1.fbx', 4.15],
  pickup: [LP + 'pickupTruck 1.fbx', 5.2],
  van: [LP + 'van 4.fbx', 5.0],
  boat: ['HQ Boats/3.models/boat_2.fbx', 6.5, { boat: true, tex: 'tex/boat_2.jpg', yOff: Number(process.env.BOAT_YOFF || 0) }],
};
// doku hücresi (4x4, üstten satır) → grup
function cellGroup(u, v) {
  const col = Math.min(3, Math.max(0, Math.floor(u * 4)));
  const row = Math.min(3, Math.max(0, Math.floor((1 - v) * 4)));
  const c = row * 4 + col;
  if (c === 0) return 'paint';
  if (c === 5) return 'tail';
  if (c === 6) return 'head';
  return 'rest';
}
const GROUPS = ['paint', 'rest', 'head', 'tail', 'glass'];

const bins = []; let off = 0;
function push(arr) {
  const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bins.push(b);
  const o = off; off += b.length; return o;
}
// birleşik (non-indexed) geometriyi gruplara göre sıralayıp yaz
function writeGeo(geo, M, center, groupFn) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(M);
  if (center) g.translate(-center.x, -center.y, -center.z);
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const tris = P.count / 3;
  const buckets = {};
  for (let t = 0; t < tris; t++) {
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) { u += UV.getX(t * 3 + k) / 3; v += UV.getY(t * 3 + k) / 3; }
    const gname = groupFn ? groupFn(u, v, t) : 'rest';
    (buckets[gname] ||= []).push(t);
  }
  const order = GROUPS.filter((n) => buckets[n]);
  const pos = new Float32Array(tris * 9), nor = new Int8Array(tris * 9), uv = new Uint16Array(tris * 6);
  const groups = []; let w = 0;
  for (const n of order) {
    const start = w;
    for (const t of buckets[n]) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        pos.set([P.getX(i), P.getY(i), P.getZ(i)], w * 3);
        const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
        nor.set([Math.round(nx / l * 127), Math.round(ny / l * 127), Math.round(nz / l * 127)], w * 3);
        uv.set([Math.round(Math.min(1, Math.max(0, UV.getX(i))) * 65535), Math.round(Math.min(1, Math.max(0, UV.getY(i))) * 65535)], w * 2);
        w++;
      }
    }
    groups.push([n, start, w - start]);
  }
  return { count: w, pos: push(pos), nor: push(nor), uv: push(uv), groups };
}

const out = { version: 1, models: {} };
for (const [key, [file, targetLen, opt = {}]] of Object.entries(SPECS)) {
  const root = loadFBX(path.join(SRC, file));
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const len0 = box.max.z - box.min.z;
  const s = targetLen / len0;
  const S = new THREE.Matrix4().makeScale(s, s, s);
  // zemine oturt (tekerlek altı y=0) — tekne: model y=0 + yOff su çizgisi; boyda ortala
  const zc = (box.max.z + box.min.z) / 2;
  const T = new THREE.Matrix4().makeTranslation(0, opt.boat ? -(opt.yOff || 0) * s : -box.min.y * s, -zc * s);
  const base = new THREE.Matrix4().multiplyMatrices(T, S);
  if (opt.flip) base.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));   // burnu +Z'ye çevir
  const m = { body: null, wheels: [] };
  if (opt.tex) m.tex = opt.tex;
  const bodyBox = new THREE.Box3();
  const bodyParts = [];
  const triName = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const M = new THREE.Matrix4().multiplyMatrices(base, o.matrixWorld);
    if (/Wheel/.test(o.name)) {
      const g = o.geometry.clone().applyMatrix4(M); g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      const r = (g.boundingBox.max.y - g.boundingBox.min.y) / 2;
      const front = /^F/.test(o.name);
      m.wheels.push({ name: o.name, front, pivot: c.toArray().map((v) => +v.toFixed(4)), r: +r.toFixed(3), geo: writeGeo(o.geometry, M, c, null) });
    } else {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(M);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.computeBoundingBox(); bodyBox.union(g.boundingBox);
      bodyParts.push(g);
      for (let t = 0; t < g.attributes.position.count / 3; t++) triName.push(o.name);
    }
  });
  // gövde parçalarını tek geometride birleştir
  const cat = (name, n) => { const a = new Float32Array(bodyParts.reduce((s, g) => s + g.attributes[name].count * n, 0)); let o = 0; for (const g of bodyParts) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; } return new THREE.BufferAttribute(a, n); };
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', cat('position', 3)); merged.setAttribute('normal', cat('normal', 3)); merged.setAttribute('uv', cat('uv', 2));
  m.body = writeGeo(merged, new THREE.Matrix4(), null, opt.boat ? (u, v, t) => (/glass/i.test(triName[t]) ? 'glass' : 'paint') : cellGroup);
  // tavan yüksekliği / boyu ve yan yüzey (yazı, tepe lambası yerleşimi için)
  const P = merged.attributes.position;
  let roofY = 0, side = 0;
  for (const win of [0.4, 0.8, 1.6, 3]) {
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getZ(i)) < win) roofY = Math.max(roofY, P.getY(i));
    if (roofY > 0.5) break;
  }
  for (const win of [0.6, 1.2, 2.4]) {
    for (let i = 0; i < P.count; i++) if (P.getY(i) > 0.4 && P.getY(i) < 0.8 && Math.abs(P.getZ(i)) < win) side = Math.max(side, Math.abs(P.getX(i)));
    if (side > 0.5) break;
  }
  let rz0 = 9, rz1 = -9;
  for (let i = 0; i < P.count; i++) if (P.getY(i) > roofY - 0.06) { rz0 = Math.min(rz0, P.getZ(i)); rz1 = Math.max(rz1, P.getZ(i)); }
  m.roof = [+roofY.toFixed(3), +rz0.toFixed(3), +rz1.toFixed(3)];
  m.side = +side.toFixed(3);
  const sz = bodyBox.getSize(new THREE.Vector3());
  m.size = [+sz.x.toFixed(3), +sz.y.toFixed(3), +sz.z.toFixed(3)];
  m.wheelR = +(m.wheels.reduce((a, w) => a + w.r, 0) / m.wheels.length).toFixed(3);
  // yan ayna dahil genişlik; gövde genişliği için z ortasındaki kesit yerine %90
  out.models[key] = m;
  console.log(key, 'scale', s.toFixed(4), 'size', m.size.join(' x '), 'wheelR', m.wheelR, 'roof', m.roof.join(','), 'side', m.side, 'groups', JSON.stringify(m.body.groups), 'wheels', m.wheels.map((w) => w.name + '@' + w.pivot.map((v) => v.toFixed(2)).join(',')).join(' '));
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'vehicles.bin'), Buffer.concat(bins));
fs.writeFileSync(path.join(OUT, 'vehicles.json'), JSON.stringify(out));
console.log('bin', off, 'bytes');
