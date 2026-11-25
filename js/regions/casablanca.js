// Casablanca: uçakla gidilen ortaçağ liman şehri (uzak slot, flight.js CASA). Binalar, surlar, kale, liman, ağaçlar ve
// arazi "Medieval City" paketinin demo sahnesinden yerleşimiyle birlikte gelir (tools/casablanca/convert.mjs →
// assets/web/casablanca.json + .bin). Kod ve veri yalnız buraya uçulunca iner; Palmera'ya dönünce bellekten silinir.
// Çizim: tür başına bir InstancedMesh (köşe konumu Int16, kutu ölçüsü örnek matrisine katılır), kopya başına uzaklık +
// görüş alanı ayıklaması. Zemin: dönüştürücünün çıkardığı 1 m'lik yükseklik ızgarası; çarpışma: hazır kutular.
// Pist: şehrin batısında, denizde taş dolgu üstünde (uçak doğu ucunda, şehre yakın durur).
import * as THREE from 'three';
import { CASA, CASA_RW, AIRPORTS, buildBoard, boardColliders, planeCollider } from '../flight.js';
import { textDecal, radialTexture } from '../textures.js';
import { trackedFetch } from '../progress.js';
import { palmModel, colorGeom, mergeGeoms, instanced } from '../world.js';
import { mulberry32 } from '../util.js';

// şehre giriş kapısı (yerel eksen): batı surundaki geçidin önünde, pistten gelen yolun ucunda; batıya bakar
// sur hattında (güney suru z −19,4'te biter, kuzey suru −9,2'de başlar): kuleler iki sur ucuna gömülür;
// paketin buradaki sekizgen kulesi + kapı koridoru dönüştürücüde çıkarıldı (convert.mjs REMOVE)
const GATE = { x0: -158, x1: -152, z: -14.3, hw: 3.2, W: 8, T: 3.6 };

const RW = CASA_RW, O = CASA;
// pistin dolgusu (yerel eksen): pist + güneyde apron; doğu ucu kıyıya (sur dibine) dayanır
const FILL = { x0: RW.x0 - 30, x1: -162, z0: RW.z - 30, z1: RW.z + 46 };
// uzaklık ayıklaması (m): kaliteye göre
const DIST = { low: 240, medium: 340, high: 480 };

export async function load(base = 'assets/web/') {
  const get = (f, how) => trackedFetch(base + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r[how](); });
  const [j, bin] = await Promise.all([get('casablanca.json', 'json'), get('casablanca.bin', 'arrayBuffer')]);
  return { j, bin };
}

// harita (mini + büyük): kurulumda zemin ve bina izlerinden bir kez çizilir
let mapData = null;
export const MAP = {
  x0: 0, z0: 0, w: 1, h: 1, labels: [],
  draw(ctx) {
    const d = mapData; if (!d) return;
    const W = Math.ceil(this.w), H = Math.ceil(this.h), img = ctx.createImageData(W, H), px = img.data;
    const sea = [18, 60, 92], lo = [232, 170, 62], hi = [200, 150, 70];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = this.x0 + x + 0.5, wz = this.z0 + y + 0.5, g = d.ground(wx, wz), q = (y * W + x) * 4;
      let c = sea;
      if (g > -0.5) { const t = Math.min(1, Math.max(0, (g - 8) / 14)); c = lo.map((v, i) => v + (hi[i] - v) * t); }
      px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const r = (x0, z0, x1, z1, col) => { ctx.fillStyle = col; ctx.fillRect(x0 - this.x0, z0 - this.z0, x1 - x0, z1 - z0); };
    r(O.x + FILL.x0, O.z + FILL.z0, O.x + FILL.x1, O.z + FILL.z1, '#9a948a');
    r(O.x + RW.x0, O.z + RW.z - RW.hw, O.x + RW.x1, O.z + RW.z + RW.hw, '#4a4a52');
    for (const b of d.rects) r(b[0], b[1], b[2], b[3], '#7a5a48');
    // kapıya giden taş yol + kapı
    r(d.road[0], d.gate.zc - 2.9, d.road[1], d.gate.zc + 2.9, '#e8d9b4');
    r(O.x + GATE.x0 - 0.7, d.gate.zc - GATE.W - GATE.T, O.x + GATE.x1 + 0.7, d.gate.zc - GATE.hw, '#23806c');
    r(O.x + GATE.x0 - 0.7, d.gate.zc + GATE.hw, O.x + GATE.x1 + 0.7, d.gate.zc + GATE.W + GATE.T, '#23806c');
  },
};

export function build(game, kit) {
  const world = game.world, scene = game.scene, { j, bin } = kit;
  if (game.env) game.env.fogScale = 0.4;   // kullanıcı: uzak kum tepeleri soluk kalmasın
  const objs = [];
  const tag = (o) => { o.userData.region = 'casablanca'; scene.add(o); objs.push(o); return o; };

  // ---------- zemin: yükseklik ızgarası (çift doğrusal) + pist dolgusu ----------
  const H = j.hf, hv = new Int16Array(bin, H.off, H.w * H.h), SEA = j.sea;
  const cell = (i, k) => { if (i < 0 || k < 0 || i >= H.w || k >= H.h) return SEA; const v = hv[k * H.w + i]; return v === -32768 ? SEA : v / 100; };
  const hfAt = (lx, lz) => {
    const fx = (lx - H.x0) / H.res - 0.5, fz = (lz - H.z0) / H.res - 0.5, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
    const a = cell(i, k), b = cell(i + 1, k), c = cell(i, k + 1), d = cell(i + 1, k + 1);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
  hfAt.H = H;
  const ground = (x, z) => {
    const lx = x - O.x, lz = z - O.z;
    const h = hfAt(lx, lz);
    if (lx > FILL.x0 && lx < FILL.x1 && lz > FILL.z0 && lz < FILL.z1) return Math.max(RW.y, h);
    return h;
  };
  world.addGround('casablanca', { x0: O.x - 1500, x1: O.x + 1500, z0: O.z - 1500, z1: O.z + 1500, fn: ground });

  // ---------- çarpışma kutuları (dm) ----------
  const cv = new Int16Array(bin, j.col.off, j.col.n * 6), rects = [];
  for (let n = 0; n < j.col.n; n++) {
    const q = n * 6, x0 = cv[q] / 10 + O.x, z0 = cv[q + 1] / 10 + O.z, x1 = cv[q + 2] / 10 + O.x, z1 = cv[q + 3] / 10 + O.z;
    world.addBox(x0, x1, z0, z1, cv[q + 4] / 10, cv[q + 5] / 10, 'bld');
    rects.push([x0, z0, x1, z1]);
  }

  // ---------- modeller ----------
  const U = { night: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFlag;\nvarying float vLit;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vFlag = color.a;
        vColor.rgb = pow(vColor.rgb, vec3(2.2));   // paket renkleri sRGB
        vec4 cwp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vLit = step(fract(sin(dot(floor(cwp.xyz / vec3(1.7, 2.9, 1.7)), vec3(12.9898, 78.233, 37.719))) * 43758.5453), 0.55);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlag;\nvarying float vLit;\nuniform float uNight;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vColor.rgb;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float isWin = step(abs(vFlag - 0.502), 0.1), isLamp = step(abs(vFlag - 0.251), 0.1);
        totalEmissiveRadiance += isWin * vLit * uNight * vec3(1.0, 0.62, 0.28) * 1.7;
        totalEmissiveRadiance += isLamp * (0.12 + uNight * 2.2) * vec3(1.0, 0.55, 0.18);`);
  };
  // aynı veri (aynalı türler köşeleri paylaşır) tek GPU tamponu olsun
  const attrs = new Map();
  const attr = (key, make) => attrs.get(key) || attrs.set(key, make()).get(key);
  // gölge her kalitede; yalnız kameraya yakın kopyası olan türler gölge düşürür (gölge geçişi ucuz kalsın)
  const shadows = true, SHR = game.quality === 'low' ? 60 : 110;
  let D = DIST[game.quality] || DIST.low;
  const kinds = j.kinds.map((k) => {
    const p = k.parts[0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', attr('p' + p.pos, () => new THREE.BufferAttribute(new Int16Array(bin, p.pos, p.vcount * 3), 3, true)));
    g.setAttribute('normal', attr('n' + p.nor, () => new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, p.nor, p.vcount * 4), 4), 3, 0, true)));
    g.setAttribute('color', attr('c' + p.col, () => new THREE.BufferAttribute(new Uint8Array(bin, p.col, p.vcount * 4), 4, true)));
    g.setIndex(new THREE.BufferAttribute(p.vcount > 65535 ? new Uint32Array(bin, p.idx, p.icount) : new Uint16Array(bin, p.idx, p.icount), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.75);
    // nicelenmiş [−1, 1] konumu → ham model (cm) dönüşümü
    // (düz parçalarda bir eksen 0: ölçek 0 olursa örnek normalleri NaN olur → küçük bir kalınlık verilir)
    const b = k.box, sz = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const sc = sz.map((s) => Math.max(s * 32767 / 65535, 1e-3));
    const Dm = new THREE.Matrix4().makeScale(...sc).setPosition(...sz.map((s, i) => b[i] + (s > 1e-6 ? s * 32768 / 65535 : sc[i])));
    return { g, Dm, list: [], always: /^(terrain_|cliff_)/.test(k.name) };
  });
  const OM = new THREE.Matrix4().makeTranslation(O.x, 0, O.z), M = new THREE.Matrix4();
  for (const r of j.inst) {
    const K = kinds[r[0]];
    M.set(r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], 0, 0, 0, 1);
    const W = OM.clone().multiply(M).multiply(K.Dm), e = W.elements;
    const rad = Math.sqrt(e[0] ** 2 + e[1] ** 2 + e[2] ** 2 + e[4] ** 2 + e[5] ** 2 + e[6] ** 2 + e[8] ** 2 + e[9] ** 2 + e[10] ** 2);
    K.list.push({ e: new Float32Array(e), s: new THREE.Sphere(new THREE.Vector3(e[12], e[13], e[14]), rad), i: K.list.length });
  }
  for (const K of kinds) {
    if (!K.list.length) continue;
    const m = new THREE.InstancedMesh(K.g, mat, K.list.length);
    m.frustumCulled = false;   // ayıklama kopya başına aşağıda
    m.count = 0; m.visible = false;
    const big = Math.max(...K.list.map((I) => I.s.radius));
    K.canCast = shadows && big > 1 && !K.always; m.castShadow = false; m.receiveShadow = shadows;
    K.mesh = m; K.order = new Int32Array(K.list.length).fill(-1);
    tag(m);
  }

  // ---------- havalimanı: dolgu, pist, işaretler, ışıklar, terminal, tabela ----------
  const box = new Box(), lines = new Box(), lamps = new Box();
  const Y = RW.y, X = (x) => O.x + x, Z = (z) => O.z + z;
  box.box(X(FILL.x0), -4.5, Z(FILL.z0), X(FILL.x1), Y - 0.02, Z(FILL.z1), '#a9a08e');
  box.box(X(FILL.x0) - 0.6, -4.5, Z(FILL.z0) - 0.6, X(FILL.x1), Y - 0.6, Z(FILL.z0), '#8a8274');   // taş rıhtım eteği
  box.box(X(RW.x0), Y - 0.02, Z(RW.z - RW.hw), X(RW.x1), Y + 0.02, Z(RW.z + RW.hw), '#4a4a50');
  const Wc = '#f2f2ea', y1 = Y + 0.025, y2 = Y + 0.035;
  lines.box(X(RW.x0), y1, Z(RW.z - RW.hw + 1), X(RW.x1), y2, Z(RW.z - RW.hw + 1.6), Wc);
  lines.box(X(RW.x0), y1, Z(RW.z + RW.hw - 1.6), X(RW.x1), y2, Z(RW.z + RW.hw - 1), Wc);
  for (let x = RW.x0 + 60; x < RW.x1 - 50; x += 30) lines.box(X(x), y1, Z(RW.z - 0.4), X(x + 15), y2, Z(RW.z + 0.4), Wc);
  for (const ex of [RW.x0 + 4, RW.x1 - 26]) for (let i = 0; i < 8; i++) {
    const z = RW.z - RW.hw + 3 + i * 3.6 + (i >= 4 ? 1.6 : 0);
    lines.box(X(ex), y1, Z(z), X(ex + 22), y2, Z(z + 1.6), Wc);
  }
  for (let x = RW.x0; x <= RW.x1; x += 30) for (const z of [RW.z - RW.hw - 0.8, RW.z + RW.hw + 0.8]) {
    const c = x === RW.x0 ? '#ff4040' : x >= RW.x1 - 1 ? '#3cff7a' : '#ffd27a';
    lamps.box(X(x) - 0.2, Y, Z(z) - 0.2, X(x) + 0.2, Y + 0.45, Z(z) + 0.2, c);
  }
  // terminal: apronun güneydoğusunda taş bina + kırmızı saçak (sur dibinde)
  const T0 = { x0: -232, x1: -196, z0: RW.z + 30, z1: RW.z + 44 };
  box.box(X(T0.x0), Y, Z(T0.z0), X(T0.x1), Y + 6, Z(T0.z1), '#e6dcc6');
  box.box(X(T0.x0) - 1, Y + 6, Z(T0.z0) - 2.5, X(T0.x1) + 1, Y + 6.5, Z(T0.z1) + 1, '#a3473c');
  box.box(X(-216), Y, Z(T0.z0) - 0.1, X(-212), Y + 2.7, Z(T0.z0) + 0.05, '#5a3a2a');
  world.addBox(X(T0.x0), X(T0.x1), Z(T0.z0), Z(T0.z1), -5, Y + 6.5, 'bld');
  const fmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  tag(box.mesh(fmat, shadows));
  tag(lines.mesh(fmat, false));
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  tag(lamps.mesh(lampMat, false));
  const t = textDecal('CASABLANCA HAVALİMANI', '#ffffff', '#7a2a24', 1024, 112, '900 56px Georgia, serif');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.55), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  sign.position.set(X(-214), Y + 7.4, Z(T0.z0) - 0.3); sign.rotation.y = Math.PI;
  tag(sign);
  const board = buildBoard('casablanca'); board.position.y = Y; tag(board);
  boardColliders(world, 'casablanca');
  planeCollider(world, AIRPORTS.casablanca);

  // ---------- şehir kapısı, kapıya giden yol, sokak lambaları, palmiyeler ----------
  const gate = buildGate(world, ground, tag, shadows);
  const deco = buildStreetDeco(world, ground, rects, hfAt, tag, shadows, gate);

  // harita
  mapData = { ground, rects, gate, road: deco.road };
  const x0 = O.x + Math.min(H.x0, FILL.x0) - 20, x1 = O.x + H.x0 + H.w * H.res + 20, z0 = O.z + H.z0 - 20, z1 = O.z + H.z0 + H.h * H.res + 20;
  Object.assign(MAP, { x0, z0, w: x1 - x0, h: z1 - z0,
    labels: [['Casablanca', O.x - 20, O.z - 60], ['Liman', O.x - 190, O.z + 215], ['Kale', O.x - 30, O.z - 250], ['Havalimanı', X((RW.x0 + RW.x1) / 2), Z(RW.z - 30)]] });

  // ---------- kopya başına ayıklama ----------
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  function update(camera) {
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const cp = camera.position;
    for (const K of kinds) {
      const m = K.mesh; if (!m) continue;
      let n = 0, changed = false, near = false;
      for (const I of K.list) {
        const d = I.s.center.distanceTo(cp) - I.s.radius;
        if (d < SHR) near = true;
        if (!K.always && d > D) continue;
        if (d > 25 && !frustum.intersectsSphere(I.s)) continue;   // yakındakiler gölge için hep çizilir
        if (K.order[n] !== I.i) { K.order[n] = I.i; m.instanceMatrix.array.set(I.e, n * 16); changed = true; }
        n++;
      }
      if (n !== m.count) { m.count = n; changed = true; }
      if (changed) m.instanceMatrix.needsUpdate = true;
      m.visible = n > 0;
      m.castShadow = K.canCast && near;
    }
  }

  return {
    objs,
    update,
    setDist(d) { D = d; },   // test: kuşbakışı görüntü için
    uniforms: U,
    setNight(n) {
      U.night.value = n; lampMat.color.setScalar(0.35 + n * 2.2);
      deco.coreMat.color.setRGB(1, 0.76, 0.42).multiplyScalar(0.35 + n * 3.2);
      deco.poolMat.opacity = n * 0.6;
      for (const m of gate.signMats) m.emissiveIntensity = n * 0.45;
    },
    unload() { world.removeGround('casablanca'); mapData = null; if (game.env) game.env.fogScale = 1; },
  };
}

// ---------- şehir kapısı (kodla): at nalı kemer, yeşil çini çerçeve, iki kule, mazgallar, CASABLANCA yazısı ----------
// Kemer açıklığı 5,2 m, kemer tepesi ~8,3 m; kapı yerel x0..x1 (5 m derin), z = GATE.z çevresinde
function buildGate(world, ground, tag, shadows) {
  const G = GATE, X = (x) => O.x + x, zc = O.z + G.z;
  // taban: ayak izindeki en alçak zemin (yamaçta havada kalmasın; alt kısım toprağa gömülür)
  let base = 1e9;
  for (let u = -G.W - G.T; u <= G.W + G.T; u += 1) for (const x of [G.x0, G.x1]) base = Math.min(base, ground(X(x), zc + u));
  const floorY = ground(X((G.x0 + G.x1) / 2), zc);
  const parts = [];
  // şekil (u = z farkı, v = yükseklik) → dünya: x = X(x1) − w (+ derinlik), y = base + v, z = zc + u (doğru yönlü dönüşüm)
  const place = (geo, xa, xb) => {
    const p = geo.attributes.position, d = xb - xa;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, X(xb) - p.getZ(i) * d, base + p.getY(i), zc + p.getX(i));   // derinlik 1 → d
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    return geo.computeVertexNormals(), geo;
  };
  const extrude = (pts, xa, xb, col) => {
    const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    parts.push(colorGeom(place(g.toNonIndexed(), xa, xb), col));
  };
  // at nalı kemer: kemer çemberi omuzun 0,8 m üstünde merkezli (açıklıktan biraz geniş); tepe ~10,3 m
  const SPRING = 6.2, CY = 7.0;
  const arch = (half, dir) => {   // dir −1: soldan sağa (üstten), +1: sağdan sola
    const r = Math.hypot(half, CY - SPRING), a0 = Math.atan2(SPRING - CY, -half), a1 = Math.atan2(SPRING - CY, half) - 2 * Math.PI;
    const out = [];
    for (let k = 1; k < 24; k++) { const a = a0 + (a1 - a0) * (k / 24); out.push([r * Math.cos(a), CY + r * Math.sin(a)]); }
    return dir < 0 ? out : out.reverse();
  };
  // surlar 15–20 m: kapı duvarı 16,5 m, kuleler 21 m (+ külah)
  const H = 16.5, TH = 21, CREAM = '#f1e6cd', TILE = '#23806c', SAND = '#d2bb8e', DARK = '#3b2f25';
  // ana duvar (kemer açıklığı oyuk)
  extrude([[-G.W, -3], [-G.hw, -3], [-G.hw, SPRING], ...arch(G.hw, -1), [G.hw, SPRING], [G.hw, -3], [G.W, -3], [G.W, H], [-G.W, H]], G.x0, G.x1, CREAM);
  // iki yüzde yeşil çini kemer çerçevesi (0,25 m dışarı taşar)
  const fr = G.hw + 0.75;
  const frame = [[-fr, -0.2], [-G.hw, -0.2], [-G.hw, SPRING], ...arch(G.hw, -1), [G.hw, SPRING], [G.hw, -0.2], [fr, -0.2], [fr, SPRING], ...arch(fr, 1), [-fr, SPRING]];
  extrude(frame, G.x0 - 0.25, G.x0, TILE);
  extrude(frame, G.x1, G.x1 + 0.25, TILE);
  // kemer içi tavan (açıklığın içinde koyu ahşap kirişler) + eşik taşı
  const box = (x0, y0, z0, x1, y1, z1, col) => parts.push(colorGeom(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), col));
  box(X(G.x0) + 0.4, floorY - 0.4, zc - G.hw, X(G.x1) - 0.4, floorY + 0.06, zc + G.hw, SAND);
  // kat bandı (korniş), taban kaidesi, mazgallar
  box(X(G.x0) - 0.35, base + H - 1.7, zc - G.W - 0.1, X(G.x1) + 0.35, base + H - 1.2, zc + G.W + 0.1, TILE);
  box(X(G.x0) - 0.22, base - 3, zc - G.W, X(G.x1) + 0.22, floorY + 0.7, zc - G.hw - 0.75, SAND);
  box(X(G.x0) - 0.22, base - 3, zc + G.hw + 0.75, X(G.x1) + 0.22, floorY + 0.7, zc + G.W, SAND);
  for (let u = -G.W + 0.35; u < G.W - 0.3; u += 1.55) box(X(G.x0), base + H, zc + u, X(G.x1), base + H + 0.9, zc + u + 0.85, CREAM);
  // kuleler: kare gövde, korniş, mazgal, yeşil çini piramit külah, sivri tepe
  for (const s of [-1, 1]) {
    const za = zc + s * G.W, zb = zc + s * (G.W + G.T), z0 = Math.min(za, zb), z1 = Math.max(za, zb), xa = X(G.x0) - 0.7, xb = X(G.x1) + 0.7;
    box(xa, base - 3, z0, xb, base + TH, z1, CREAM);
    box(xa - 0.25, base + TH - 0.4, z0 - 0.25, xb + 0.25, base + TH + 0.1, z1 + 0.25, TILE);
    for (const [mx, mz] of [[xa, z0], [xb - 0.9, z0], [xa, z1 - 0.9], [xb - 0.9, z1 - 0.9], [(xa + xb) / 2 - 0.45, z0], [(xa + xb) / 2 - 0.45, z1 - 0.9]]) box(mx, base + TH + 0.1, mz, mx + 0.9, base + TH + 1.0, mz + 0.9, CREAM);
    const cone = new THREE.ConeGeometry(Math.hypot(xb - xa, z1 - z0) / 2 * 0.8, 4.2, 4, 1, true).rotateY(Math.PI / 4).translate((xa + xb) / 2, base + TH + 0.1 + 2.1, (z0 + z1) / 2);
    parts.push(colorGeom(cone, TILE));
    parts.push(colorGeom(new THREE.CylinderGeometry(0.05, 0.07, 1.4, 5).translate((xa + xb) / 2, base + TH + 4.8, (z0 + z1) / 2), '#c9a23a'));
    parts.push(colorGeom(new THREE.SphereGeometry(0.2, 6, 4).translate((xa + xb) / 2, base + TH + 5.0, (z0 + z1) / 2), '#e0b84a'));
    // kule pencereleri (koyu yarıklar) iki yüzde, iki katta
    for (const fx of [xa - 0.02, xb + 0.02]) for (const wy of [9.5, 15.5]) box(fx - 0.03, base + wy, (z0 + z1) / 2 - 0.4, fx + 0.03, base + wy + 2, (z0 + z1) / 2 + 0.4, DARK);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(mergeGeoms(parts), mat); mesh.castShadow = shadows; mesh.receiveShadow = true;
  tag(mesh);
  // yazılar: batı yüzü CASABLANCA, doğu yüzü havalimanı
  const sign = (text, sub, x, ry) => {
    const t = textDecal(text, '#f3d27a', '#14503f', 1024, 160, '900 92px Georgia, serif');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.75), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: '#f3d27a', emissiveMap: t, emissiveIntensity: 0 }));
    m.position.set(x, base + 12.4, zc); m.rotation.y = ry; tag(m);
    void sub; return m.material;
  };
  const signMats = [sign('CASABLANCA', '', X(G.x0) - 0.27, -Math.PI / 2), sign('✈ HAVALİMANI', '', X(G.x1) + 0.27, Math.PI / 2)];
  // çarpışma: kemerin iki yanı + kuleler; açıklığın üstü (kamera için)
  world.addBox(X(G.x0) - 0.7, X(G.x1) + 0.7, zc - G.W - G.T, zc - G.hw, -5, base + TH, 'bld');
  world.addBox(X(G.x0) - 0.7, X(G.x1) + 0.7, zc + G.hw, zc + G.W + G.T, -5, base + TH, 'bld');
  world.addBox(X(G.x0), X(G.x1), zc - G.hw, zc + G.hw, base + SPRING + 0.4, base + H, 'bld');
  // kemerin iki yanında duvar fenerleri (iki yüzde)
  const wallLamps = [];
  for (const fx of [X(G.x0) - 0.45, X(G.x1) + 0.45]) for (const s of [-1, 1]) wallLamps.push({ x: fx, y: floorY + 4.6, z: zc + s * (G.hw + 1.9) });
  return { base, floorY, zc, signMats, wallLamps };
}

// ---------- kapıya giden taş yol + sokak lambaları + palmiyeler ----------
function buildStreetDeco(world, ground, rects, hfAt, tag, shadows, gate) {
  const X = (x) => O.x + x, rnd = mulberry32(7171);
  const zc = gate.zc;
  // taş yol: uçağın durduğu pist ucundan kapıya (zemine 4 m'lik parçalarla oturur)
  const road = [];
  const strip = (xa, xb, za, zb, col, dy) => {
    for (let x = xa; x < xb; x += 4) {
      const x2 = Math.min(xb, x + 4), y = ground((x + x2) / 2, (za + zb) / 2) + dy;
      road.push(colorGeom(new THREE.BoxGeometry(x2 - x + 0.02, 0.08, zb - za).translate((x + x2) / 2, y, (za + zb) / 2), col));
    }
  };
  const RX0 = X(RW.x1 + 2), RX1 = X(GATE.x0) + 0.5;
  strip(RX0, RX1, zc - 2.4, zc + 2.4, '#ddcca4', 0.02);
  strip(RX0, RX1, zc - 2.9, zc - 2.4, '#a88d63', 0.03);
  strip(RX0, RX1, zc + 2.4, zc + 2.9, '#a88d63', 0.03);
  const rm = new THREE.Mesh(mergeGeoms(road), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  rm.receiveShadow = true; tag(rm);

  const lamps = [], palms = [];
  // yol boyunca: lambalar ve aralarında palmiyeler
  for (let x = RX0 + 6; x < RX1 - 8; x += 14) {
    for (const s of [-1, 1]) {
      lamps.push({ x, z: zc + s * 3.6 });
      if (x + 7 < RX1 - 10) palms.push({ x: x + 7, z: zc + s * 5.2 });
    }
  }
  // kapının iki yanında birer palmiye
  for (const s of [-1, 1]) palms.push({ x: X(GATE.x0) - 4, z: zc + s * (GATE.W + GATE.T + 2) });

  // ---------- şehir içi: çarpışma kutularından 1 m'lik doluluk ızgarası → bina uzaklığı + sur içi testi ----------
  const H = hfAt.H, OX = O.x + H.x0, OZ = O.z + H.z0, W = H.w, Hh = H.h;
  const occ = new Uint8Array(W * Hh);
  for (const [x0, z0, x1, z1] of rects) {
    const i0 = Math.max(0, Math.floor(x0 - OX)), i1 = Math.min(W - 1, Math.ceil(x1 - OX) - 1);
    const k0 = Math.max(0, Math.floor(z0 - OZ)), k1 = Math.min(Hh - 1, Math.ceil(z1 - OZ) - 1);
    for (let k = k0; k <= k1; k++) occ.fill(1, k * W + i0, k * W + i1 + 1);
  }
  // en yakın binaya uzaklık (iki geçişli yaklaşık uzaklık dönüşümü, m)
  const dist = new Float32Array(W * Hh);
  for (let q = 0; q < dist.length; q++) dist[q] = occ[q] ? 0 : 1e9;
  const R2 = Math.SQRT2;
  for (let k = 0; k < Hh; k++) for (let i = 0; i < W; i++) {
    const q = k * W + i; let d = dist[q];
    if (i > 0) d = Math.min(d, dist[q - 1] + 1);
    if (k > 0) { d = Math.min(d, dist[q - W] + 1); if (i > 0) d = Math.min(d, dist[q - W - 1] + R2); if (i < W - 1) d = Math.min(d, dist[q - W + 1] + R2); }
    dist[q] = d;
  }
  for (let k = Hh - 1; k >= 0; k--) for (let i = W - 1; i >= 0; i--) {
    const q = k * W + i; let d = dist[q];
    if (i < W - 1) d = Math.min(d, dist[q + 1] + 1);
    if (k < Hh - 1) { d = Math.min(d, dist[q + W] + 1); if (i < W - 1) d = Math.min(d, dist[q + W + 1] + R2); if (i > 0) d = Math.min(d, dist[q + W - 1] + R2); }
    dist[q] = d;
  }
  // sur içi: dört yönde de bir yapıya rastlanır
  const left = new Uint8Array(W * Hh), right = new Uint8Array(W * Hh), up = new Uint8Array(W * Hh), down = new Uint8Array(W * Hh);
  for (let k = 0; k < Hh; k++) {
    let a = 0; for (let i = 0; i < W; i++) { const q = k * W + i; a |= occ[q]; left[q] = a; }
    a = 0; for (let i = W - 1; i >= 0; i--) { const q = k * W + i; a |= occ[q]; right[q] = a; }
  }
  for (let i = 0; i < W; i++) {
    let a = 0; for (let k = 0; k < Hh; k++) { const q = k * W + i; a |= occ[q]; up[q] = a; }
    a = 0; for (let k = Hh - 1; k >= 0; k--) { const q = k * W + i; a |= occ[q]; down[q] = a; }
  }
  const cand = [];
  for (let k = 2; k < Hh - 2; k += 2) for (let i = 2; i < W - 2; i += 2) {
    const q = k * W + i;
    if (occ[q] || !(left[q] && right[q] && up[q] && down[q])) continue;
    const lx = H.x0 + i + 0.5, lz = H.z0 + k + 0.5;
    if (lx < -150) continue;   // sur dışı / havalimanı
    const h = hfAt(lx, lz);
    if (h < 7.5) continue;
    const slope = Math.max(Math.abs(hfAt(lx + 1, lz) - hfAt(lx - 1, lz)), Math.abs(hfAt(lx, lz + 1) - hfAt(lx, lz - 1)));
    if (slope > 0.5) continue;
    cand.push({ x: O.x + lx, z: O.z + lz, d: dist[q] });
  }
  // karıştır, aralıklı seç
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const far = (list, p, r) => list.every((o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 > r * r);
  let nl = 0, np = 0;
  for (const c of cand) {   // lambalar: sokak kenarı (binaya 1,6–3 m)
    if (nl >= 170) break;
    if (c.d >= 1.6 && c.d <= 3 && far(lamps, c, 19)) { lamps.push(c); nl++; }
  }
  for (const c of cand) {   // palmiyeler: meydan ve açık alanlar (binaya ≥ 4,5 m)
    if (np >= 110) break;
    if (c.d >= 4.5 && far(palms, c, 13) && far(lamps, c, 3)) { palms.push(c); np++; }
  }

  // ---------- lamba modeli: demir direk + fener (çekirdek gece yanar) ----------
  const IRON = '#28231f';
  const poleGeo = mergeGeoms([
    colorGeom(new THREE.BoxGeometry(0.34, 0.45, 0.34).translate(0, 0.22, 0), IRON),
    colorGeom(new THREE.CylinderGeometry(0.06, 0.09, 3.3, 6).translate(0, 1.9, 0), IRON),
    colorGeom(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 6).translate(0, 3.4, 0), IRON),
    colorGeom(new THREE.ConeGeometry(0.3, 0.34, 6).translate(0, 4.09, 0), IRON),
    colorGeom(new THREE.SphereGeometry(0.06, 5, 4).translate(0, 4.3, 0), '#b89434'),
  ]);
  const coreGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.48, 6);
  const coreMat = new THREE.MeshBasicMaterial({ color: '#ffc27a', toneMapped: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#ffa552', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const poles = [], cores = [], pools = [];
  for (const l of lamps) {
    const y = world.surfaceHeight(l.x, l.z);
    poles.push({ x: l.x, y, z: l.z, ry: rnd() });
    cores.push({ x: l.x, y: y + 3.68, z: l.z });
    pools.push({ x: l.x, y: y + 0.06, z: l.z, rx: -Math.PI / 2 });
    world.addCircle(l.x, l.z, 0.2, -5, y + 4.4);
  }
  for (const l of gate.wallLamps) { cores.push(l); pools.push({ x: l.x, y: gate.floorY + 0.06, z: l.z, rx: -Math.PI / 2 }); }
  // duvar fenerlerinin çerçevesi (kısa kol + şapka)
  const wallGeo = mergeGeoms([colorGeom(new THREE.ConeGeometry(0.3, 0.34, 6).translate(0, 0.41, 0), IRON), colorGeom(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 6).translate(0, -0.28, 0), IRON)]);
  const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 });
  tag(instanced(poleGeo, lm, poles, { cast: shadows }));
  tag(instanced(wallGeo, lm, gate.wallLamps));
  tag(instanced(coreGeo, coreMat, cores));
  const pm = instanced(new THREE.PlaneGeometry(10, 10), poolMat, pools); pm.renderOrder = 1; tag(pm);

  // ---------- palmiyeler (Palmera'nınkiyle aynı model, rüzgârda sallanır) ----------
  const { trunk, crown, trunkMat, crownMat } = palmModel(rnd, world.timeUniform);
  const plist = palms.map((p) => {
    world.addCircle(p.x, p.z, 0.4, -5, 30);
    return { x: p.x, y: world.surfaceHeight(p.x, p.z) - 0.1, z: p.z, ry: rnd() * Math.PI * 2, s: 0.85 + rnd() * 0.4 };
  });
  tag(instanced(trunk, trunkMat, plist, { cast: shadows }));
  tag(instanced(crown, crownMat, plist, { cast: shadows }));
  console.info(`Casablanca: ${lamps.length} lamba, ${palms.length} palmiye`);
  return { coreMat, poolMat, road: [RX0, RX1] };
}

// kutu toplayıcı (köşe renkli, tek malzeme)
class Box {
  constructor() { this.p = []; this.c = []; }
  box(x0, y0, z0, x1, y1, z1, hex) {
    const c = new THREE.Color(hex), col = [c.r, c.g, c.b];
    const q = (a, b, cc, d) => { this.p.push(...a, ...b, ...cc, ...a, ...cc, ...d); for (let i = 0; i < 6; i++) this.c.push(...col); };
    q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
  }
  mesh(mat, shadow = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
}
