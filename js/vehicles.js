// Araç türleri, modelleri ve sürüş fiziği
import { trackedFetch } from './progress.js';
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './util.js';
import { WATER_Y } from './world.js';
import { textDecal, radialTexture } from './textures.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const TYPES = {
  // accel: m/sn² (kalkış), maxSpeed: m/sn (×3,6 = km/sa), gears: motor sesindeki vites sayısı
  sport: { name: 'Veloce GT', len: 4.5, wid: 1.9, wheelR: 0.345, mass: 1250, accel: 17, maxSpeed: 66, gears: 6, reverse: 13, brake: 36, grip: 10.5, latMax: 15, steer: 0.55, hp: 900, colors: ['#e3262f', '#ffcc00', '#1e1e24', '#f5f5f5', '#ff5fa2', '#20c4ff'] },
  sedan: { name: 'Cortez', len: 4.7, wid: 1.9, wheelR: 0.33, mass: 1400, accel: 10, maxSpeed: 47, gears: 5, reverse: 11, brake: 30, grip: 8, latMax: 11, steer: 0.6, hp: 1000, colors: ['#8a9bb0', '#2d4f7c', '#7c2d3a', '#d9d4c7', '#3f6b4f', '#5a5a5a', '#c7a46b', '#9b6bd9'] },
  hatch: { name: 'Pico', len: 4.15, wid: 1.85, wheelR: 0.31, mass: 1100, accel: 12, maxSpeed: 41, gears: 5, reverse: 11, brake: 30, grip: 8.5, latMax: 11.5, steer: 0.64, hp: 850, colors: ['#e8c21e', '#d94a3a', '#3aa0d9', '#f0ede4', '#4bb07a', '#ef7fb0'] },
  taxi: { name: 'Cortez Taksi', len: 4.7, wid: 1.9, wheelR: 0.33, mass: 1400, accel: 11.5, maxSpeed: 51, gears: 4, reverse: 11, brake: 30, grip: 8, latMax: 11, steer: 0.6, hp: 1000, colors: ['#ffc21a'] },
  pickup: { name: 'Bayou Hauler', len: 5.2, wid: 2.05, wheelR: 0.405, mass: 2100, accel: 9, maxSpeed: 44, gears: 4, reverse: 10, brake: 26, grip: 7, latMax: 10, steer: 0.55, hp: 1300, colors: ['#a33b20', '#2f4f6f', '#e0dcd0', '#3d3d3d', '#6b7f3a', '#d98c2b'] },
  van: { name: 'Mule', len: 5.0, wid: 1.95, wheelR: 0.31, mass: 2300, accel: 6.5, maxSpeed: 35, gears: 4, reverse: 9, brake: 24, grip: 6.5, latMax: 9, steer: 0.55, hp: 1400, colors: ['#d4d4cf', '#ffd42a', '#3d5a80', '#b8bcc0', '#8c2f2f'] },
  police: { name: 'Interceptor', len: 4.7, wid: 1.9, wheelR: 0.33, mass: 1600, accel: 14.5, maxSpeed: 61, gears: 5, reverse: 12, brake: 34, grip: 9.5, latMax: 13, steer: 0.58, hp: 1200, colors: ['#eef0f4'] },
  moto: { name: 'Raya 600', len: 2.1, wid: 0.75, wheelR: 0.32, mass: 220, accel: 18.5, maxSpeed: 57, gears: 6, reverse: 4, brake: 30, grip: 11, latMax: 14, steer: 0.75, hp: 450, colors: ['#e3262f', '#20c4ff', '#ffcc00', '#111111', '#7dff6b'] },
  boat: { name: 'Marlin 33', len: 6.5, wid: 2.4, wheelR: 0.0, mass: 1800, accel: 9.5, maxSpeed: 40, gears: 1, waterTop: 17.5, reverse: 6, brake: 8, grip: 1.6, latMax: 6, steer: 0.6, hp: 900, colors: ['#f5f5f5'], water: true },
  // Wild West at arabası: önde at (animasyonlu), arkada araba; ~50 km/sa, motor sesi yok (nal sesi)
  // binek at: Wild West'e köprüden yalnız atla geçilir (hasar almaz: hp çok yüksek)
  horse: { name: 'At', len: 2.6, wid: 0.9, wheelR: 0, mass: 500, accel: 7, maxSpeed: 16, gears: 1, reverse: 2, brake: 18, grip: 9, latMax: 12, steer: 0.9, hp: 1e7, colors: ['#ffffff'] },
  wagon: { name: 'Diligencia', len: 6.4, wid: 1.8, wheelR: 0.5, mass: 900, accel: 5, maxSpeed: 14, gears: 1, reverse: 2.5, brake: 14, grip: 6, latMax: 8, steer: 0.55, hp: 700, colors: ['#ffffff'] },
};
// at arabası modelleri: Wild West kiti (araba + tekerlekler) ve hayvan kiti (at) — main.js açılışta verir
let WAGON = null;
export function setWagonKits(west, animals) { WAGON = { west, animals }; }
// binek at için yalnız hayvan kiti (Wild West'ten önce, köprü başında gerekir)
export function setAnimalKit(animals) { WAGON = { west: WAGON?.west || null, animals }; }
const CARRIAGE_S = 1.3;   // paketteki araba küçük (2,4 m) → 3,1 m
const HORSE_S = 1.15;     // at modeli (cidago ~1,3 m) → gerçek boyuna yakın
// nal vuruşları: [adım döngüsündeki yeri 0..1, şiddet] — dörtnal "dı-gı-dık" + duraklama, yürüyüş 4 eşit tık
const HOOF_RUN = [[0.02, 0.75], [0.12, 0.85], [0.22, 1]];
const HOOF_WALK = [[0.05, 1], [0.3, 0.8], [0.55, 1], [0.8, 0.8]];

// ---------- hazır araç modelleri (assets/web/vehicles.json + .bin) ----------
// Oyun türü → model. Polis ve taksi sedan gövdesine tabela/lamba eklenerek yapılır.
const MODEL_OF = { sport: 'sport', sedan: 'sedan', taxi: 'sedan', police: 'sedan', hatch: 'hatch', pickup: 'pickup', van: 'van', boat: 'boat' };
let VKIT = null;
// Modelin sivri burnu zaten +Z'de (ölçüldü: +Z ucu yarım genişlik ~0,8 m, -Z kıç aynası ~1,2 m) → çevirme yok.
// BOAT_LIFT: gövde su çizgisinin üstüne kaldırılır (yoksa dalgalar teknenin içinden görünür).
const BOAT_LIFT = 0.3;
const BOAT_SEAT = [0.45, 0.1 + BOAT_LIFT, -0.3];   // sürücü koltuğu (gövde yerel)
export async function loadVehicleKit(base = 'assets/web/') {
  const [j, bin, atlas] = await Promise.all([
    trackedFetch(base + 'vehicles.json').then((r) => { if (!r.ok) throw new Error('vehicles.json ' + r.status); return r.json(); }),
    trackedFetch(base + 'vehicles.bin').then((r) => { if (!r.ok) throw new Error('vehicles.bin ' + r.status); return r.arrayBuffer(); }),
    new THREE.TextureLoader().loadAsync(base + 'tex/veh_atlas.png'),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = false; atlas.minFilter = THREE.LinearFilter;
  const GI = { paint: 0, rest: 1, head: 2, tail: 3, glass: 4 };
  // kendi dokusu olan modeller (tekne)
  const maps = {};
  await Promise.all(Object.values(j.models).filter((m) => m.tex).map(async (m) => {
    const t = await new THREE.TextureLoader().loadAsync(base + m.tex);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    maps[m.tex] = t;
  }));
  const geo = (d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, d.pos, d.count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, d.nor, d.count * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(bin, d.uv, d.count * 2), 2, true));
    if (d.groups) for (const [n, s, c] of d.groups) g.addGroup(s, c, GI[n]);
    g.computeBoundingSphere();
    g.userData.shared = true;   // araç silinince atılmasın
    return g;
  };
  const models = {};
  for (const [k, m] of Object.entries(j.models)) {
    models[k] = { body: geo(m.body), wheels: m.wheels.map((w) => ({ geo: geo(w.geo), pivot: w.pivot, front: w.front })), roof: m.roof, side: m.side, map: m.tex ? maps[m.tex] : null };
  }
  const rest = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1a2430', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  VKIT = { models, rest, glass };
  return VKIT;
}

function buildKitVehicle(type, M, S, paint, brake, parts, root, body) {
  if (M.map) { paint.map = M.map; paint.metalness = 0.15; paint.roughness = 0.4; }
  const mesh = new THREE.Mesh(M.body, [paint, VKIT.rest, S.head, brake, VKIT.glass]);
  mesh.castShadow = true; body.add(mesh);
  if (type === 'boat') {
    mesh.position.y = BOAT_LIFT;
    // seyir fenerleri (gece): baş beyaz, kıç = fren malzemesi
    body.add(box(0.18, 0.08, 0.06, S.head, 0, 0.75 + BOAT_LIFT, 3.1), box(0.16, 0.08, 0.06, brake, 0, 0.9 + BOAT_LIFT, -3.15));
    parts.seat = new THREE.Vector3(BOAT_SEAT[0], BOAT_SEAT[1], BOAT_SEAT[2]);
  }
  for (const w of M.wheels) {
    const pivot = new THREE.Group(); pivot.position.fromArray(w.pivot);
    const wheel = new THREE.Mesh(w.geo, VKIT.rest); wheel.castShadow = true;
    pivot.add(wheel); root.add(pivot);
    parts.wheels.push(wheel);
    if (w.front) parts.frontPivots.push(pivot);
  }
  const [roofY, rz0, rz1] = M.roof, rz = (rz0 + rz1) / 2, sx = M.side;
  if (type === 'police') {
    for (const s of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: S.polisTex, transparent: true }));
      dec.position.set(s * (sx + 0.03), 0.62, -0.1); dec.rotation.y = s * Math.PI / 2; body.add(dec);
    }
    const red = new THREE.MeshBasicMaterial({ color: '#ff1030', toneMapped: false });
    const blue = new THREE.MeshBasicMaterial({ color: '#1040ff', toneMapped: false });
    body.add(box(1.2, 0.08, 0.28, S.dark, 0, roofY + 0.03, rz));
    body.add(box(0.5, 0.12, 0.26, red, -0.3, roofY + 0.12, rz), box(0.5, 0.12, 0.26, blue, 0.3, roofY + 0.12, rz));
    parts.sirenRed = red; parts.sirenBlue = blue;
  }
  if (type === 'taxi') {
    const sign = box(0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: '#fff4b0', toneMapped: false }), 0, roofY + 0.1, rz);
    body.add(sign);
    for (const s of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: S.taxiTex }));
      dec.position.set(s * (sx + 0.02), 0.62, -0.1); dec.rotation.y = s * Math.PI / 2; body.add(dec);
    }
    parts.taxiSign = sign.material;
  }
}

// at arabası: araba (Wild West kiti, köşe renkli) + 4 tekerlek + at (iskeletli, AnimationMixer) + iki ok (araba sapı)
const wagonMats = {};
function buildWagon(cfg, S, parts, root, body) {
  const K = WAGON?.west, H = WAGON?.animals?.kinds.horse, CS = CARRIAGE_S;
  const matOf = (m) => wagonMats[m] || (wagonMats[m] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: m === 'vc' ? null : K.tex[m] }));
  const ck = K?.kinds.carriage;
  const cLen = ck ? ck.size[2] * CS : 3.8, cz = -cfg.len / 2 + cLen / 2;
  if (ck) {
    const g = new THREE.Group(); g.position.z = cz; g.scale.setScalar(CS); body.add(g);
    for (const p of ck.geos) { const m = new THREE.Mesh(p.g, matOf(p.mat)); m.castShadow = true; g.add(m); }
    ck.wheels.forEach((c, i) => {
      const wk = K.kinds[i < 2 ? 'carriage_wheel_f' : 'carriage_wheel_r'];
      const pivot = new THREE.Group(); pivot.position.set(c[0] * CS, c[1] * CS, cz + c[2] * CS); root.add(pivot);
      const wheel = new THREE.Group(); wheel.scale.setScalar(CS); pivot.add(wheel);
      for (const p of wk.geos) { const m = new THREE.Mesh(p.g, matOf(p.mat)); m.position.y = -wk.size[1] / 2; m.castShadow = true; wheel.add(m); }
      parts.wheels.push(wheel);
      if (i < 2) parts.frontPivots.push(pivot);
    });
  } else body.add(box(1.6, 1.6, cLen, S.wood, 0, 1.2, cz));
  // at: arabanın önünde, oklar arasında
  const hz = cfg.len / 2 - 1.5 * HORSE_S;
  if (H) {
    const obj = cloneSkinned(H.root);
    obj.position.z = hz; obj.scale.setScalar(HORSE_S); obj.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
    body.add(obj);
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const [n, c] of Object.entries(H.clips)) { actions[n] = mixer.clipAction(c); actions[n].play(); actions[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
    parts.horse = { mixer, actions, cur: 'idle' };
  } else body.add(box(0.5, 1.4, 2.2, S.dark, 0, 1.1, hz));
  // oklar (araba sapı) ve boyunduruk
  const front = cz + cLen / 2;
  for (const s of [-1, 1]) {
    const L = hz + 0.7 - front, pole = box(0.07, 0.07, L, S.wood, s * 0.45, 1.0, front + L / 2);
    body.add(pole);
  }
  body.add(box(1.0, 0.08, 0.08, S.wood, 0, 1.0, hz + 0.7));
  // sürücü yeri: arabanın ön ucundaki bank ('ride' pozunda kalça mesh'in ~0,45 m üstünde)
  body.add(box(1.1, 0.1, 0.45, S.wood, 0, 1.05, front - 0.1));
  parts.seat = new THREE.Vector3(0, 0.66, front - 0.1);
}

// binek at: iskeletli at (animasyon hıza göre) + eyer + üzengiler; sürücü eyerde 'ride' pozunda
function buildHorse(S, parts, body) {
  const H = WAGON?.animals?.kinds.horse;
  const saddle = new THREE.MeshStandardMaterial({ color: '#5a3320', roughness: 0.7 });
  if (H) {
    const obj = cloneSkinned(H.root);
    obj.scale.setScalar(HORSE_S); obj.position.z = -0.35 * HORSE_S;   // gövde ortası araç merkezinde
    obj.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
    body.add(obj);
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const [n, c] of Object.entries(H.clips)) { actions[n] = mixer.clipAction(c); actions[n].play(); actions[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
    parts.horse = { mixer, actions, cur: 'idle' };
  } else body.add(box(0.55, 1.2, 2.3, S.dark, 0, 1.0, 0));
  // eyer, eyer örtüsü, üzengiler
  body.add(box(0.62, 0.1, 0.75, saddle, 0, 1.47, -0.12), box(0.7, 0.04, 0.95, new THREE.MeshStandardMaterial({ color: '#8a2a22', roughness: 0.9 }), 0, 1.43, -0.12));
  for (const s of [-1, 1]) body.add(box(0.03, 0.42, 0.03, saddle, s * 0.33, 1.2, -0.1), box(0.1, 0.03, 0.12, S.dark, s * 0.33, 0.98, -0.1));
  parts.seat = new THREE.Vector3(0, 1.08, -0.18);
}

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: '#0e1620', metalness: 0.9, roughness: 0.08 });
  shared.tire = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  shared.rim = new THREE.MeshStandardMaterial({ color: '#c8c8cc', metalness: 0.9, roughness: 0.25 });
  shared.dark = new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.6, metalness: 0.3 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: '#e0e0e4', metalness: 1, roughness: 0.15 });
  shared.head = new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false });
  shared.white = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, metalness: 0.2 });
  shared.seat = new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.9 });
  shared.wood = new THREE.MeshStandardMaterial({ color: '#9a6a3a', roughness: 0.7 });
  shared.poolTex = radialTexture();
  shared.headPool = new THREE.MeshBasicMaterial({ map: shared.poolTex, color: '#fff2cc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  shared.polisTex = textDecal('POLİS', '#0b2a6b', 'rgba(0,0,0,0)', 256, 64);
  shared.taxiTex = textDecal('TAKSİ', '#111', '#ffe25a', 256, 64);
  return shared;
}
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true;
  return mesh;
}
function taperedBox(w, h, d, topScaleX, topScaleZ, topShiftZ, m) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) { p.setX(i, p.getX(i) * topScaleX); p.setZ(i, p.getZ(i) * topScaleZ + topShiftZ); }
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
  return mesh;
}

export function buildVehicleMesh(type, color) {
  const S = sharedMats();
  const cfg = TYPES[type];
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // (2026-11-26: güneşi/gökyüzünü çok yansıtıyordu, tavan-kaput beyazlaşıyordu → metalness 0.55 → 0.3, roughness 0.32 → 0.5, envMapIntensity 0.35)
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5, envMapIntensity: 0.35 });
  const brake = new THREE.MeshBasicMaterial({ color: '#550000', toneMapped: false });
  const parts = { paint, brake, wheels: [], frontPivots: [], body, extras: [] };
  const L = cfg.len, W = cfg.wid, R = cfg.wheelR;
  if (type === 'wagon') { buildWagon(cfg, S, parts, root, body); return { root, parts }; }
  if (type === 'horse') { buildHorse(S, parts, body); return { root, parts }; }
  const M = VKIT && VKIT.models[MODEL_OF[type]];
  if (M) {
    buildKitVehicle(type, M, S, paint, brake, parts, root, body);
    if (type !== 'boat') {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.6, 9), S.headPool);
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, L / 2 + 4.5); pool.renderOrder = 1;
      root.add(pool);
    }
    root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
    return { root, parts };
  }
  // modeller yoksa (?vkit=0 ya da yükleme hatası) kodla çizilen kutu araçlar
  if (type === 'hatch' || type === 'van') type = 'sedan';
  const addWheels = (zF, zB, xOff, r = R, w = 0.28) => {
    for (const [z, front] of [[zF, true], [zB, false]]) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * xOff, r, z);
      const wheel = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), S.tire); t.rotation.z = Math.PI / 2; t.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 8), S.rim); rim.rotation.z = Math.PI / 2;
      wheel.add(t, rim); pivot.add(wheel); root.add(pivot);
      parts.wheels.push(wheel);
      if (front) parts.frontPivots.push(pivot);
    }
  };
  const lights = (yH, zF, zB, xs) => {
    for (const s of [-1, 1]) {
      body.add(box(0.36, 0.13, 0.06, S.head, s * xs, yH, zF));
      body.add(box(0.36, 0.12, 0.06, brake, s * xs, yH, zB));
    }
  };
  if (type === 'sport') {
    body.add(box(W, 0.42, L, paint, 0, R + 0.2, 0));
    const nose = taperedBox(W * 0.98, 0.16, L * 0.32, 0.92, 0.7, -0.15, paint); nose.position.set(0, R + 0.49, L * 0.33); body.add(nose);
    const cab = taperedBox(W * 0.86, 0.4, L * 0.42, 0.8, 0.62, -0.08, S.glass); cab.position.set(0, R + 0.61, -0.25); body.add(cab);
    body.add(box(W * 0.66, 0.04, L * 0.2, paint, 0, R + 0.83, -0.35));
    body.add(box(W * 0.9, 0.05, 0.35, paint, 0, R + 0.75, -L / 2 + 0.2));
    for (const s of [-1, 1]) body.add(box(0.06, 0.25, 0.08, S.dark, s * 0.6, R + 0.55, -L / 2 + 0.22));
    body.add(box(W * 1.01, 0.1, L * 0.98, S.dark, 0, R + 0.02, 0));
    lights(R + 0.32, L / 2 + 0.01, -L / 2 - 0.01, 0.62);
    addWheels(L * 0.32, -L * 0.32, W / 2 - 0.12, R, 0.3);
  } else if (type === 'sedan' || type === 'taxi' || type === 'police') {
    body.add(box(W, 0.55, L, paint, 0, R + 0.28, 0));
    const cab = taperedBox(W * 0.9, 0.5, L * 0.5, 0.86, 0.72, -0.05, S.glass); cab.position.set(0, R + 0.8, -0.15); body.add(cab);
    body.add(box(W * 0.78, 0.06, L * 0.33, type === 'police' ? S.white : paint, 0, R + 1.07, -0.2));
    body.add(box(W * 1.02, 0.12, 0.25, S.dark, 0, R + 0.1, L / 2 - 0.08));
    body.add(box(W * 1.02, 0.12, 0.25, S.dark, 0, R + 0.1, -L / 2 + 0.08));
    lights(R + 0.42, L / 2 + 0.01, -L / 2 - 0.01, 0.62);
    if (type === 'police') {
      for (const s of [-1, 1]) {
        const door = box(0.03, 0.42, L * 0.42, S.white, s * (W / 2 + 0.005), R + 0.3, -0.05); body.add(door);
        const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: S.polisTex, transparent: true }));
        dec.position.set(s * (W / 2 + 0.03), R + 0.32, -0.05); dec.rotation.y = s * Math.PI / 2; body.add(dec);
      }
      const red = new THREE.MeshBasicMaterial({ color: '#ff1030', toneMapped: false });
      const blue = new THREE.MeshBasicMaterial({ color: '#1040ff', toneMapped: false });
      body.add(box(1.3, 0.12, 0.3, S.dark, 0, R + 1.15, -0.15));
      const lr = box(0.55, 0.13, 0.28, red, -0.33, R + 1.2, -0.15), lb = box(0.55, 0.13, 0.28, blue, 0.33, R + 1.2, -0.15);
      body.add(lr, lb);
      parts.sirenRed = red; parts.sirenBlue = blue;
      body.add(box(1.2, 0.35, 0.12, S.dark, 0, R + 0.35, L / 2 + 0.12));
    }
    if (type === 'taxi') {
      const sign = box(0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: '#fff4b0', toneMapped: false }), 0, R + 1.22, -0.2);
      body.add(sign);
      for (const s of [-1, 1]) {
        const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: S.taxiTex }));
        dec.position.set(s * (W / 2 + 0.01), R + 0.35, -0.1); dec.rotation.y = s * Math.PI / 2; body.add(dec);
      }
      parts.taxiSign = sign.material;
    }
    addWheels(L * 0.31, -L * 0.31, W / 2 - 0.1);
  } else if (type === 'pickup') {
    body.add(box(W, 0.6, L, paint, 0, R + 0.38, 0));
    const cab = taperedBox(W * 0.94, 0.62, L * 0.3, 0.9, 0.85, -0.02, S.glass); cab.position.set(0, R + 0.99, L * 0.08); body.add(cab);
    body.add(box(W * 0.88, 0.06, L * 0.24, paint, 0, R + 1.32, L * 0.06));
    // kasa
    body.add(box(W, 0.4, 0.08, paint, 0, R + 0.88, -L / 2 + 0.04));
    for (const s of [-1, 1]) body.add(box(0.08, 0.4, L * 0.42, paint, s * (W / 2 - 0.04), R + 0.88, -L * 0.27));
    body.add(box(W * 0.9, 0.02, L * 0.42, S.dark, 0, R + 0.69, -L * 0.27));
    body.add(box(W * 1.04, 0.2, 0.25, S.chrome, 0, R + 0.18, L / 2));
    body.add(box(W * 1.04, 0.2, 0.25, S.chrome, 0, R + 0.18, -L / 2));
    lights(R + 0.55, L / 2 + 0.01, -L / 2 - 0.01, 0.7);
    addWheels(L * 0.32, -L * 0.3, W / 2 - 0.12, R, 0.34);
  } else if (type === 'moto') {
    body.add(box(0.22, 0.25, 1.2, paint, 0, R + 0.35, 0.05));
    body.add(box(0.34, 0.24, 0.5, paint, 0, R + 0.58, 0.25));
    body.add(box(0.3, 0.1, 0.62, S.dark, 0, R + 0.58, -0.3));
    body.add(box(0.7, 0.05, 0.05, S.chrome, 0, R + 0.82, 0.62));
    body.add(box(0.06, 0.5, 0.06, S.chrome, 0, R + 0.5, 0.72));
    body.add(box(0.1, 0.1, 0.5, S.chrome, 0.15, R + 0.15, -0.45));
    body.add(box(0.2, 0.15, 0.06, S.head, 0, R + 0.7, 0.83));
    body.add(box(0.16, 0.08, 0.06, brake, 0, R + 0.62, -0.62));
    const fw = new THREE.Group(); fw.position.set(0, R, 0.78);
    const rw = new THREE.Group(); rw.position.set(0, R, -0.7);
    for (const [g, front] of [[fw, true], [rw, false]]) {
      const wheel = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.14, 14), S.tire); t.rotation.z = Math.PI / 2; t.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.16, 8), S.rim); rim.rotation.z = Math.PI / 2;
      wheel.add(t, rim); g.add(wheel); body.add(g);
      parts.wheels.push(wheel); if (front) parts.frontPivots.push(g);
    }
    parts.seat = new THREE.Vector3(0, R + 0.62, -0.25);
  } else if (type === 'boat') {
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, L / 2); shape.lineTo(W / 2, L / 2); shape.lineTo(W / 2, -L * 0.1);
    shape.quadraticCurveTo(W * 0.35, -L * 0.42, 0, -L / 2); shape.quadraticCurveTo(-W * 0.35, -L * 0.42, -W / 2, -L * 0.1); shape.lineTo(-W / 2, L / 2);
    const hullG = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
    hullG.rotateX(-Math.PI / 2);
    // alt kısmı V şeklinde daralt
    const p = hullG.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.5) p.setX(i, p.getX(i) * 0.45);
    hullG.computeVertexNormals();
    const hull = new THREE.Mesh(hullG, paint); hull.position.y = -0.55; hull.castShadow = true; body.add(hull);
    const stripe = new THREE.MeshStandardMaterial({ color: '#ff2fa8', roughness: 0.4 });
    body.add(box(W * 1.01, 0.12, L * 0.55, stripe, 0, 0.25, L * 0.12));
    body.add(box(W * 0.9, 0.06, L * 0.85, S.wood, 0, 0.42, 0.25));
    const ws = taperedBox(W * 0.85, 0.5, 0.25, 0.9, 1, -0.2, S.glass); ws.position.set(0, 0.7, 0.9); body.add(ws);
    body.add(box(0.8, 0.5, 0.7, S.seat, -0.45, 0.65, -0.3));
    body.add(box(0.8, 0.5, 0.7, S.seat, 0.45, 0.65, -0.3));
    body.add(box(W * 0.85, 0.45, 0.6, S.seat, 0, 0.62, -L / 2 + 0.9));
    body.add(box(0.6, 0.9, 0.6, S.dark, 0, 0.5, -L / 2 - 0.25));
    body.add(box(0.25, 0.1, 0.06, S.head, 0, 0.48, L / 2 - 0.05));
    body.add(box(0.2, 0.1, 0.06, brake, 0, 0.8, -L / 2 - 0.56));
    parts.seat = new THREE.Vector3(0.45, 0.1, -0.3);
  }
  // gece far havuzu
  if (type !== 'boat') {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.wid * 2.6, 9), S.headPool);
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, L / 2 + 4.5);
    pool.renderOrder = 1;
    root.add(pool);
  }
  root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return { root, parts };
}

let VID = 1;
export class Vehicle {
  constructor(type, opts = {}) {
    this.id = VID++;
    this.type = type;
    this.cfg = TYPES[type];
    const color = opts.color || this.cfg.colors[Math.floor(Math.random() * this.cfg.colors.length)];
    this.color = color;
    const { root, parts } = buildVehicleMesh(type, color);
    this.mesh = root; this.parts = parts;
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.angVel = 0;
    this.steerVis = 0; this.health = this.cfg.hp; this.wrecked = false; this.burning = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    this.driver = null;   // 'player' | Ped | null
    this.ai = null;
    this.siren = false;
    this.pitch = 0; this.roll = 0; this.bodyY = 0;
    this.skidTracks = [{}, {}];
    this.drifting = 0; this.grounded = true; this.inWater = false; this.sinkTime = 0;
    this.lastHit = 0;
    this.persistent = !!opts.persistent;
    this.speedKmh = 0;
    this.radio = Math.floor(Math.random() * 4);
    this.mesh.position.copy(this.pos);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }
  forward(out) { out.x = Math.sin(this.heading); out.z = Math.cos(this.heading); return out; }
  circles() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const r = this.cfg.wid / 2;
    const off = Math.max(0, this.cfg.len / 2 - r);
    if (this.type === 'moto') return [{ x: this.pos.x + fx * 0.45, z: this.pos.z + fz * 0.45, r: 0.5, o: 0.45 }, { x: this.pos.x - fx * 0.45, z: this.pos.z - fz * 0.45, r: 0.5, o: -0.45 }];
    if (this.type === 'boat') return [{ x: this.pos.x + fx * 1.9, z: this.pos.z + fz * 1.9, r: 1.15, o: 1.9 }, { x: this.pos.x - fx * 1.9, z: this.pos.z - fz * 1.9, r: 1.25, o: -1.9 }, { x: this.pos.x, z: this.pos.z, r: 1.25, o: 0 }];
    return [{ x: this.pos.x + fx * off, z: this.pos.z + fz * off, r, o: off }, { x: this.pos.x - fx * off, z: this.pos.z - fz * off, r, o: -off }, { x: this.pos.x, z: this.pos.z, r, o: 0 }];
  }

  damage(amount, game) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0 && !this.burning) { this.health = 0; this.burning = 4.5; }
    // görsel hasar: boyayı koyulaştır
    const k = clamp(this.health / this.cfg.hp, 0, 1);
    this.parts.paint.color.set(this.color).lerp(new THREE.Color('#2a2622'), (1 - k) * 0.5);
    this.parts.paint.roughness = 0.5 + (1 - k) * 0.4;
  }

  update(dt, game) {
    const world = game.world;
    const cfg = this.cfg;
    const c = this.wrecked ? { throttle: 0, brake: 0, steer: 0, handbrake: true } : this.controls;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;

    const ground = world.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.6);
    const isBoat = !!cfg.water;
    const waterHere = ground < WATER_Y - 0.35;
    let floor = ground;
    if (isBoat && waterHere) floor = WATER_Y - 0.05 + Math.sin(game.time * 1.7 + this.id) * 0.06;
    this.grounded = this.pos.y <= floor + 0.12;
    const canDrive = !this.wrecked && this.grounded && (isBoat ? waterHere : !this.inWater);
    // yüzey tutuşu
    let surf = 1;
    if (!isBoat) {
      if (ground > 0.08 && ground < 0.13 && this.pos.x > 196) surf = 0.55; // kum
      surf *= 1 - game.env.wet * 0.22;
    }

    if (canDrive) {
      const thr = c.throttle, brk = c.brake;
      const max = cfg.maxSpeed * (this.health < cfg.hp * 0.25 ? 0.7 : 1);
      if (thr > 0) {
        if (vF < -0.5) vF += cfg.brake * thr * dt;
        else vF += cfg.accel * thr * Math.max(0, 1 - Math.pow(Math.max(0, vF) / max, 1.7)) * dt * (isBoat ? 1 : surf * 0.5 + 0.5);
      }
      if (brk > 0) {
        if (vF > 0.5) vF -= cfg.brake * brk * dt;
        else if (vF > -cfg.reverse) vF -= cfg.accel * 0.6 * brk * dt;
      }
      if (c.handbrake) vF = damp(vF, 0, isBoat ? 0.4 : 0.9, dt);
      // sürtünme
      const roll = isBoat ? 0.35 : 0.05;
      vF -= vF * roll * dt + vF * Math.abs(vF) * (isBoat ? 0.003 : 0.0007) * dt;
      if (thr === 0 && brk === 0 && Math.abs(vF) < 0.6) vF = damp(vF, 0, 3, dt);
      // direksiyon
      const speedK = 1 / (1 + Math.abs(vF) / (this.type === 'moto' ? 30 : 24));
      const target = c.steer * cfg.steer * speedK;
      this.steerVis = damp(this.steerVis, target, 10, dt);
      const wb = cfg.len * 0.62;
      let yawT = -vF * Math.tan(this.steerVis) / wb;
      if (isBoat) yawT = -this.steerVis * clamp(Math.abs(vF) / 8, 0, 1) * Math.sign(vF || 1) * 1.1;
      // yola hizalama yardımı: tuş bırakılınca, yol eksenine 15°'den yakınsa tam paralel hale getir
      if (c.assist && !isBoat && !c.handbrake && Math.abs(vF) > 3 && Math.abs(c.steer) < 0.05) {
        const axis = Math.round(this.heading / (Math.PI / 2)) * (Math.PI / 2);
        const diff = wrapAngle(axis - this.heading);
        if (Math.abs(diff) < 0.27) yawT += diff * 3.2 * Math.min(1, Math.abs(vF) / 8);
      }
      const hb = c.handbrake && Math.abs(vF) > 4;
      this.angVel = damp(this.angVel, yawT * (hb ? 1.5 : 1), hb ? 4 : 9, dt);
      // yanal tutuş
      let grip = cfg.grip * surf * (hb ? 0.22 : 1);
      if (!isBoat && this.type !== 'moto' && Math.abs(vF) < 26) grip *= 1 - 0.45 * c.throttle * Math.abs(c.steer) * (this.type === 'sport' ? 1 : 0.5); // güçle kayma
      const want = vR * (1 - Math.exp(-grip * dt));
      const maxL = (hb ? cfg.latMax * 0.35 : cfg.latMax) * surf * dt;
      vR -= clamp(want, -maxL, maxL);
      this.drifting = Math.abs(vR);
    } else {
      // havada ya da suda
      this.angVel = damp(this.angVel, 0, this.grounded ? 3 : 0.4, dt);
      if (this.grounded) { vF = damp(vF, 0, isBoat ? 3.5 : 1.5, dt); vR = damp(vR, 0, 3, dt); }
      this.steerVis = damp(this.steerVis, c.steer * cfg.steer, 8, dt);
      this.drifting = 0;
    }
    if (this.inWater && !isBoat) { vF = damp(vF, 0, 1.5, dt); vR = damp(vR, 0, 1.5, dt); this.angVel *= 0.95; }

    this.heading = wrapAngle(this.heading + this.angVel * dt);
    this.vx = fx * vF + rx * vR; this.vz = fz * vF + rz * vR;
    {
      const nx = this.pos.x + this.vx * dt, nz = this.pos.z + this.vz * dt;
      let gNew = world.surfaceHeight(nx, nz, this.pos.y + 0.6);
      if (isBoat && gNew < WATER_Y - 0.35) gNew = WATER_Y - 0.05;
      const step = isBoat ? 0.32 : 0.65;
      const noGo = world.noVehicle(nx, nz, this);   // yaya bölgesi (Isla Selva) / Wild West köprü başı (yalnız at): hasarsız görünmez sınır
      if (gNew > this.pos.y + step || noGo) {
        const sp = Math.hypot(this.vx, this.vz);
        this.vx *= -0.25; this.vz *= -0.25; this.angVel *= 0.5;
        if (sp > 5 && !noGo) { this.damage((sp - 5) * 12, game); game.onVehicleImpact?.(this, sp * 0.7, nx, this.pos.y + 0.5, nz, 0, 0); }
      } else { this.pos.x = nx; this.pos.z = nz; }
    }

    // dikey
    this.vy -= 24 * dt;
    if (this.inWater && !isBoat) this.vy = Math.max(this.vy, -1.2);
    this.pos.y += this.vy * dt;
    const g2 = isBoat && world.isWater(this.pos.x, this.pos.z, this.pos.y + 0.6) ? WATER_Y - 0.05 + Math.sin(game.time * 1.7 + this.id) * 0.06 : world.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.6);
    if (this.pos.y <= g2) {
      if (this.vy < -9 && !isBoat) { this.damage((-this.vy - 9) * 25, game); game.onVehicleImpact?.(this, -this.vy * 0.6, this.pos.x, this.pos.y, this.pos.z, 0, 0); }
      this.pos.y = g2;
      this.vy = Math.max(0, this.vy);
    }
    // suya batma (kara araçları)
    if (!isBoat) {
      const sub = this.pos.y < WATER_Y - 0.3;
      if (sub && !this.inWater) { this.inWater = true; game.effects.splash(this.pos.x, WATER_Y, this.pos.z, 30, 1.5); game.audio?.splash(); }
      if (this.inWater) {
        this.sinkTime += dt;
        if (this.sinkTime > 2.5 && !this.wrecked) { this.wrecked = true; this.health = 0; this.parts.paint.color.set('#203038'); game.onVehicleSunk?.(this); }
      }
    } else if (!this.wrecked) {
      const sp = Math.abs(vF);
      if (sp > 4 && waterHere && Math.random() < 0.7) game.effects.wake(this.pos.x - fx * 3, WATER_Y, this.pos.z - fz * 3, -this.vx, -this.vz);
    }

    // çarpışma: dünya
    if (!this._p) this._p = new THREE.Vector3();
    const circ = this.circles();
    for (const cc of circ) {
      const p = this._p.set(cc.x, 0, cc.z);
      const hit = world.collideCircle(p, cc.r, this.pos.y + 0.25, 1.2);
      if (hit) {
        const dx = p.x - cc.x, dz = p.z - cc.z;
        this.pos.x += dx; this.pos.z += dz;
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        if (vn < 0) {
          const e = 0.25;
          this.vx -= (1 + e) * vn * hit.nx; this.vz -= (1 + e) * vn * hit.nz;
          // sürtünme
          const tx = -hit.nz, tz = hit.nx;
          const vt = this.vx * tx + this.vz * tz;
          this.vx -= vt * 0.12 * tx; this.vz -= vt * 0.12 * tz;
          // dönme
          const ox = cc.x - this.pos.x, oz = cc.z - this.pos.z;
          const torque = (ox * hit.nz - oz * hit.nx) * vn;
          this.angVel += clamp(torque * 0.25, -3, 3);
          const imp = -vn;
          if (imp > 3) {
            if (!this.ai || this.driver === 'player') this.damage((imp - 3) * (imp - 3) * 2.2 + imp * 4, game);
            else this.damage((imp - 3) * 8, game);
            game.onVehicleImpact?.(this, imp, cc.x - hit.nx * cc.r, this.pos.y + 0.6, cc.z - hit.nz * cc.r, hit.nx, hit.nz);
          }
        }
      }
    }

    // yanma / patlama
    if (this.burning > 0 && !this.wrecked) {
      this.burning -= dt;
      if (Math.random() < 0.8) game.effects.fire(this.pos.x + fx * cfg.len * 0.3, this.pos.y + 1, this.pos.z + fz * cfg.len * 0.3);
      if (this.burning <= 0) this.explode(game);
    } else if (!this.wrecked && this.health < cfg.hp * 0.45 && Math.random() < (this.health < cfg.hp * 0.2 ? 0.5 : 0.18)) {
      game.effects.engineSmoke(this.pos.x + fx * cfg.len * 0.35, this.pos.y + 1.1, this.pos.z + fz * cfg.len * 0.35, this.health < cfg.hp * 0.2);
    }
    if (this.wrecked && this.burnAfter > 0) {
      this.burnAfter -= dt;
      if (Math.random() < 0.4) game.effects.fire(this.pos.x, this.pos.y + 0.8, this.pos.z);
      if (Math.random() < 0.3) game.effects.engineSmoke(this.pos.x, this.pos.y + 1.4, this.pos.z, true);
    }

    // drift izi + duman
    if (!isBoat && this.grounded && !this.inWater && this.type !== 'horse') {
      const sk = this.drifting > 3.2 || (c.handbrake && Math.abs(vF) > 6) || (c.brake > 0.5 && vF > 14) || (c.throttle > 0.9 && Math.abs(vF) < 6 && this.type === 'sport');
      const bx = this.pos.x - fx * cfg.len * 0.32, bz = this.pos.z - fz * cfg.len * 0.32;
      const hw = cfg.wid / 2 - 0.15;
      if (this.type === 'moto') game.effects.skid(this.skidTracks[0], bx, this.pos.y, bz, sk, 0.12);
      else {
        game.effects.skid(this.skidTracks[0], bx + rx * hw, this.pos.y, bz + rz * hw, sk);
        game.effects.skid(this.skidTracks[1], bx - rx * hw, this.pos.y, bz - rz * hw, sk);
      }
      if (sk && Math.random() < 0.6) game.effects.tireSmoke(bx, this.pos.y, bz, 1 + this.drifting * 0.05);
      this.skidding = sk;
    } else this.skidding = false;

    this.speedKmh = Math.abs(vF) * 3.6;
    this.updateVisual(dt, vF, game);
  }

  explode(game) {
    this.wrecked = true; this.burning = 0; this.burnAfter = 12;
    this.parts.paint.color.set('#1a1714'); this.parts.paint.roughness = 1; this.parts.paint.metalness = 0;
    this.vy = 6; this.angVel += (Math.random() - 0.5) * 2;
    game.onExplosion?.(this.pos.x, this.pos.y, this.pos.z, this);
  }

  updateVisual(dt, vF, game) {
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.y = this.heading;
    // eğim: zemine göre
    const cfg = this.cfg, w = game.world;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let tp = 0, tr = 0;
    if (this.grounded && !cfg.water) {
      const hf = w.surfaceHeight(this.pos.x + fx * cfg.len * 0.4, this.pos.z + fz * cfg.len * 0.4, this.pos.y + 0.6);
      const hb = w.surfaceHeight(this.pos.x - fx * cfg.len * 0.4, this.pos.z - fz * cfg.len * 0.4, this.pos.y + 0.6);
      tp = Math.atan2(hb - hf, cfg.len * 0.8);
    }
    const accel = (vF - (this._lastVF ?? vF)) / Math.max(dt, 1e-3);
    this._lastVF = vF;
    tp += clamp(-accel * 0.004, -0.06, 0.06);
    tr = clamp(this.angVel * vF * 0.0035, -0.09, 0.09);
    if (this.type === 'moto') tr = clamp(-this.angVel * Math.abs(vF) * 0.06, -0.75, 0.75);
    if (cfg.water) { tp = -clamp(Math.abs(vF) / cfg.maxSpeed, 0, 1) * 0.12 + Math.sin(game.time * 2 + this.id) * 0.02; tr = clamp(this.angVel * 0.15, -0.2, 0.2) + Math.sin(game.time * 1.3 + this.id) * 0.03; }
    if (!this.grounded && !cfg.water) tp = damp(this.pitch, clamp(-this.vy * 0.02, -0.3, 0.3), 2, dt);
    this.pitch = damp(this.pitch, tp, 8, dt);
    this.roll = damp(this.roll, tr, 6, dt);
    this.parts.body.rotation.x = this.pitch;
    this.parts.body.rotation.z = this.roll;
    if (this.type === 'moto') { m.rotation.z = 0; }
    if (this.inWater && !cfg.water) { this.parts.body.rotation.x = 0.25; }
    // tekerler
    if (cfg.wheelR > 0) {
      const spin = vF / cfg.wheelR * dt;
      for (const wh of this.parts.wheels) wh.rotation.x += spin;
      for (const p of this.parts.frontPivots) p.rotation.y = -this.steerVis * 1.1;
    }
    // at arabası: at hızına göre bekler / yürür / dörtnala koşar; sürücü oyuncuysa nal sesi
    const H = this.parts.horse;
    if (H) {
      const sp = Math.abs(vF), clip = this.wrecked || sp < 0.4 ? 'idle' : sp < 5.5 ? 'walk' : 'run';
      if (clip !== H.cur && H.actions[clip]) { H.actions[H.cur].setEffectiveWeight(0); H.actions[clip].setEffectiveWeight(1); H.cur = clip; }
      if (H.actions.walk) H.actions.walk.timeScale = Math.max(0.5, sp / 1.8);
      if (H.actions.run) H.actions.run.timeScale = Math.max(0.6, sp / 10);
      if (Math.hypot(this.pos.x - game.camera.position.x, this.pos.z - game.camera.position.z) < 150) H.mixer.update(dt);
      // nal sesi animasyonun adım döngüsüne bağlı: dörtnalda 3 hızlı vuruş + duraklama ("dıgıdık"),
      // yürüyüşte 4 eşit tık; tempo animasyonun timeScale'iyle (hızla) artar
      const A = H.actions[clip];
      if (clip !== 'idle' && A && this.driver === 'player') {
        const dur = A.getClip().duration || 1, ph = (A.time % dur) / dur;
        const beats = clip === 'run' ? HOOF_RUN : HOOF_WALK;
        const last = H.clipPh === clip ? H.ph : ph;
        for (const [b, k] of beats) {
          const hit = last <= ph ? b > last && b <= ph : b > last || b <= ph;   // döngü başa sardıysa
          if (hit && last !== ph) game.audio?.hoof(clip === 'run' ? k : 0.45 * k);
        }
        H.ph = ph; H.clipPh = clip;
      } else H.clipPh = null;
    }
    // ışıklar
    const braking = this.controls.brake > 0.1 && vF > 0.5;
    const rev = vF < -0.5;
    if (!this.wrecked) this.parts.brake.color.setRGB(rev ? 2 : (braking ? 4 : 0.5 + game.env.night * 1.2), rev ? 2 : 0.02, rev ? 2 : 0.02);
    else this.parts.brake.color.setRGB(0.05, 0, 0);
    if (this.parts.sirenRed) {
      const on = this.siren && !this.wrecked;
      const ph = Math.floor(game.time * 7 + this.id) % 2;
      this.parts.sirenRed.color.setRGB(on && ph ? 6 : 0.3, 0.02, 0.05);
      this.parts.sirenBlue.color.setRGB(0.02, 0.1, on && !ph ? 6 : 0.3);
    }
    if (this.parts.taxiSign) this.parts.taxiSign.color.setRGB(1, 0.95, 0.6).multiplyScalar(0.8 + game.env.night * 2);
  }
}
