// Isla Selva nehri: su yüzeyi (akan pırıltı + kıyı köpüğü), tepedeki gölet, şelale, basamak taşları,
// ahşap köprü, sazlar ve nilüferler. Yatak/su seviyesi/geçitler forest.js'de (RIVER, CROSS, POND, POOL).
// Hepsi birkaç çizim çağrısı: su, şelale, taşlar, köprü, saz, nilüfer, çiçek, köpük.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { RIVER, CROSS, POND, POOL, MESA, isleHeight, bridgeDeck } from './forest.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------- malzemeler ----------
function riverMaterial(uTime, fall) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0, envMapIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uFall = { value: new THREE.Vector2(fall.x, fall.z) };
    sh.vertexShader = 'attribute vec2 riv;\nvarying vec2 vRiv;\nvarying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvRiv = riv; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime;\nuniform vec2 uFall;\nvarying vec2 vRiv;\nvarying vec3 vWp;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float e = abs(vRiv.x);
        vec3 c = mix(vec3(0.05, 0.30, 0.78), vec3(0.16, 0.52, 0.90), smoothstep(0.1, 1.0, e));
        // akışla kayan pırıltılar
        vec2 g = vec2(vRiv.x * 5.0, vRiv.y * 0.8 - uTime * 1.1);
        vec2 id = floor(g), f = fract(g) - 0.5;
        float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453), h2 = fract(h * 17.31);
        vec2 o = vec2(h - 0.5, h2 - 0.5) * 0.5;
        float sp = step(0.5, h2) * (1.0 - smoothstep(0.05, 0.11, length((f - o) * vec2(1.0, 2.2))));
        sp *= 0.55 + 0.45 * sin(uTime * 3.0 + h * 40.0);
        c = mix(c, vec3(1.0), clamp(sp, 0.0, 1.0));
        // kıyı köpüğü
        float fo = smoothstep(0.84, 0.98, e + 0.06 * sin(vRiv.y * 1.3 + uTime * 1.5) + 0.04 * sin(vRiv.y * 3.7 - uTime));
        c = mix(c, vec3(0.93, 0.97, 1.0), fo);
        // şelalenin düştüğü yerde köpük
        vec2 dv = vWp.xz - uFall;
        float fd = length(dv) + 0.5 * sin(atan(dv.y, dv.x) * 6.0 + uTime * 2.5);
        c = mix(c, vec3(0.97, 0.99, 1.0), smoothstep(3.0, 1.5, fd));
        diffuseColor.rgb = c;
      }`);
  };
  m.customProgramCacheKey = () => 'isleRiver';
  return m;
}
function fallMaterial(uTime, len) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uLen = { value: len };
    sh.vertexShader = 'attribute vec2 fuv;\nvarying vec2 vFuv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFuv = fuv;');
    sh.fragmentShader = 'uniform float uTime;\nuniform float uLen;\nvarying vec2 vFuv;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float u = vFuv.x, v = vFuv.y;
        vec3 c = mix(vec3(0.22, 0.58, 0.94), vec3(0.55, 0.82, 1.0), smoothstep(0.45, 1.0, abs(u)));
        float col = floor(u * 9.0), h = fract(sin(col * 91.7 + 3.1) * 43758.5);
        float st = fract(v * (0.45 + h * 0.4) - uTime * (1.5 + h) + h * 5.0);
        c = mix(c, vec3(1.0), smoothstep(0.7, 0.9, st) * 0.85);
        vec2 g = vec2(u * 12.0, v * 3.0 - uTime * 7.0), id = floor(g);
        float hh = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5);
        c = mix(c, vec3(1.0), step(0.78, hh) * (1.0 - smoothstep(0.12, 0.2, length(fract(g) - 0.5))));
        c = mix(c, vec3(1.0), smoothstep(0.6, 0.0, v) * 0.6 + smoothstep(uLen - 1.6, uLen, v));
        diffuseColor.rgb = c;
      }`);
  };
  m.customProgramCacheKey = () => 'isleFall';
  return m;
}

// ---------- yardımcılar ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// [geometri, renk, matris] parçalarını tek, köşe renkli geometriye birleştir
function merged(parts) {
  const P = [], N = [], C = [], col = new THREE.Color();
  for (const [g0, hex, m] of parts) {
    let g = g0.clone(); if (m) g.applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    col.set(hex);
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) C.push(col.r, col.g, col.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere();
  return g;
}
function instanced(geo, mat, list, cast = false) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((o, i) => {
    _q.setFromAxisAngle(UP, o.ry || 0);
    _m.compose(_p.set(o.x, o.y, o.z), _q, o.sv || _s.setScalar(o.s || 1));
    im.setMatrixAt(i, _m);
  });
  im.count = list.length;
  im.castShadow = cast; im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------- su yüzeyleri ----------
// köşe: [x, y, z, riv.x (kenara göre: |1| = kıyı), riv.y (akış boyunca m)]
function waterGeometry() {
  const P = [], R = [];
  const push = (v) => { P.push(v[0], v[1], v[2]); R.push(v[3], v[4]); };
  // yukarı bakan üçgen (a, b, c) sırasını garanti et
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    if (uz * vx - ux * vz > 0) { push(a); push(b); push(c); } else { push(a); push(c); push(b); }
  };
  const pts = RIVER.pts.filter((p) => p.dn < 1.05), NC = 8;
  const rows = pts.map((p) => {
    const ext = (p.w + 1.2) / p.w, row = [];
    for (let j = 0; j <= NC; j++) {
      const t = -ext + (2 * ext * j) / NC;
      row.push([p.x - p.tz * t * p.w, p.wl, p.z + p.tx * t * p.w, t, p.s]);
    }
    return row;
  });
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < NC; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
    tri(a, b, c); tri(a, c, d);
  }
  // daire dilimi: açı a → (x, z) = (cx + sin a·r, cz + cos a·r)
  const disc = (cx, cz, y, r, a0, a1, wNorm, sOff, N = 18) => {
    for (let k = 0; k < N; k++) {
      const t0 = a0 + (a1 - a0) * k / N, t1 = a0 + (a1 - a0) * (k + 1) / N;
      tri([cx, y, cz, 0, sOff], [cx + Math.sin(t0) * r, y, cz + Math.cos(t0) * r, r / wNorm, sOff + t0 * r], [cx + Math.sin(t1) * r, y, cz + Math.cos(t1) * r, r / wNorm, sOff + t1 * r]);
    }
  };
  // şelale havuzu: şeridin başlangıcının arkasında kalan yarım daire
  const p0 = RIVER.pts[0], aT = Math.atan2(p0.tx, p0.tz);
  disc(p0.x, p0.z, p0.wl, p0.w + 1.2, aT + Math.PI / 2, aT + Math.PI * 1.5, p0.w, 0);
  // tepedeki gölet
  disc(POND.x, POND.z, POND.y, POND.r + 0.7, 0, Math.PI * 2, POND.r, 100, 24);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('riv', new THREE.Float32BufferAttribute(R, 2));
  const n = new Float32Array(P.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

// şelale: göletin ağzından kayalık yamacını izleyerek havuza inen şerit.
// Yükseklik çizilen zemin modelinden (ışınla) alınır: 3 m'lik üçgenler formülden alçakta kalabilir.
function fallGeometry(ground) {
  const x0 = MESA.x, zTop = POND.z + POND.r - 1.0, zEnd = POOL.z - POOL.r * 0.45;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  ground?.updateMatrixWorld();
  const meshY = (x, z) => {
    if (!ground) return isleHeight(x, z);
    ray.set(from.set(x, 50, z), down);
    const hit = ray.intersectObject(ground, false)[0];
    return hit ? hit.point.y : isleHeight(x, z);
  };
  // şerit genişliğindeki en yüksek zemin (kenarlar zemine gömülmesin), üstüne ince pay
  const surf = (z, hw) => Math.max(meshY(x0, z), meshY(x0 - hw * 0.9, z), meshY(x0 + hw * 0.9, z)) + 0.12;
  const prof = [];
  let y = POND.y, v = 0, prev = null;
  const wl0 = RIVER.pts[0].wl;
  for (let z = zTop; z <= zEnd + 1e-6; z += 0.5) {
    y = Math.min(y, Math.max(surf(z, 1.7 + 0.6 * (z - zTop) / (zEnd - zTop)), wl0 - 0.05));
    if (prev) v += Math.hypot(z - prev[0], y - prev[1]);
    prof.push([z, y, v]); prev = [z, y];
  }
  const P = [], F = [], NC = 6;
  const wAt = (k) => 1.7 + 0.6 * (k / (prof.length - 1));
  const vert = (k, j) => { const [z, yy, vv] = prof[k], u = -1 + 2 * j / NC; return [x0 + u * wAt(k), yy, z, u, vv]; };
  const push = (a) => { P.push(a[0], a[1], a[2]); F.push(a[3], a[4]); };
  for (let k = 0; k + 1 < prof.length; k++) for (let j = 0; j < NC; j++) {
    const a = vert(k, j), b = vert(k, j + 1), c = vert(k + 1, j + 1), d = vert(k + 1, j);
    push(a); push(c); push(b); push(a); push(d); push(c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('fuv', new THREE.Float32BufferAttribute(F, 2));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return { geo: g, len: v, end: { x: x0, z: zEnd } };
}

// ---------- ahşap köprü ----------
function bridgeGeometry(c, world) {
  const parts = [], wood = ['#8a5a33', '#7c4f2c', '#946238'], yaw = Math.atan2(c.ax, c.az);
  const L = 2 * c.hl, at = (t) => [c.x + c.ax * (t * L - c.hl), c.z + c.az * (t * L - c.hl)];
  const slope = (t) => (bridgeDeck(c, Math.min(1, t + 0.01)) - bridgeDeck(c, Math.max(0, t - 0.01))) / ((Math.min(1, t + 0.01) - Math.max(0, t - 0.01)) * L);
  // yerel +z = köprü ekseni, yerel +x = yan
  const place = (g, hex, t, lat, dy, pitch = true) => {
    const [x, z] = at(t), lx = Math.cos(yaw) * lat, lz = -Math.sin(yaw) * lat;
    _e.set(pitch ? -Math.atan(slope(t)) : 0, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    parts.push([g, hex, new THREE.Matrix4().compose(_p.set(x + lx, bridgeDeck(c, t) + dy, z + lz), _q, _s.set(1, 1, 1))]);
  };
  const nP = Math.ceil(L / 0.34);
  for (let i = 0; i <= nP; i++) place(box(2 * c.hw + 0.25, 0.1, 0.3), wood[i % 3], i / nP, 0, -0.05);
  const nS = 10;
  for (let i = 0; i < nS; i++) {
    const t = (i + 0.5) / nS, seg = L / nS * Math.hypot(1, slope(t)) + 0.05;
    for (const s of [-1, 1]) {
      place(box(0.14, 0.22, seg), '#6b4426', t, s * (c.hw + 0.05), -0.2);
      place(box(0.08, 0.08, seg), '#8a5a33', t, s * (c.hw + 0.05), 1.0);
    }
  }
  const nPost = Math.max(4, Math.round(L / 1.1));
  for (let i = 0; i <= nPost; i++) for (const s of [-1, 1]) place(box(0.13, 1.08, 0.13), '#6b4426', i / nPost, s * (c.hw + 0.05), 0.48, false);
  // korkuluk çarpışması: 0,5 m'de bir küçük daire (oyuncu aradan geçemesin)
  const nC = Math.ceil(L / 0.5);
  for (let i = 0; i <= nC; i++) {
    const t = i / nC, [x, z] = at(t), d = bridgeDeck(c, t);
    for (const s of [-1, 1]) world.addCircle(x + Math.cos(yaw) * s * (c.hw + 0.05), z - Math.sin(yaw) * s * (c.hw + 0.05), 0.12, d - 0.3, d + 1.1);
  }
  return merged(parts);
}

// ---------- bitkiler ----------
function reedGeometry() {
  const rnd = mulberry32(91), parts = [];
  for (let k = 0; k < 7; k++) {
    const h = 0.9 + rnd() * 0.6, a = rnd() * 6.28, r = rnd() * 0.22;
    _e.set((rnd() - 0.5) * 0.35, a, (rnd() - 0.5) * 0.35); _q.setFromEuler(_e);
    const m = new THREE.Matrix4().compose(_p.set(Math.cos(a) * r, h / 2, Math.sin(a) * r), _q, _s.set(1, 1, 1));
    parts.push([new THREE.ConeGeometry(0.07, h, 4), k % 2 ? '#8fae3c' : '#a8b84a', m]);
  }
  for (let k = 0; k < 3; k++) {
    const a = rnd() * 6.28, r = 0.05 + rnd() * 0.15, h = 1.2 + rnd() * 0.4;
    parts.push([new THREE.CylinderGeometry(0.015, 0.02, h, 4).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r), '#7d9a36']);
    parts.push([new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6).translate(Math.cos(a) * r, h + 0.05, Math.sin(a) * r), '#b5492f']);
  }
  return merged(parts);
}
function lotusGeometry() {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2;
    _e.set(0.6, a, 0, 'YXZ'); _q.setFromEuler(_e);
    const m = new THREE.Matrix4().compose(_p.set(Math.sin(a) * 0.07, 0.11, Math.cos(a) * 0.07), _q, _s.set(1, 1, 1));
    parts.push([new THREE.ConeGeometry(0.07, 0.24, 4), '#f25aa6', m]);
  }
  parts.push([new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.09, 0), '#ffd84a']);
  return merged(parts);
}

// ---------- kurulum ----------
export function buildRiver(world, scene) {
  const uTime = world.timeUniform;
  const rnd = mulberry32(4242);
  const fall = fallGeometry(world.forest?.ground);
  const water = new THREE.Mesh(waterGeometry(), riverMaterial(uTime, fall.end));
  water.receiveShadow = true;
  const fallMesh = new THREE.Mesh(fall.geo, fallMaterial(uTime, fall.len));
  scene.add(water, fallMesh);

  // geçitler
  const stones = [];
  const nearCross = (x, z, r) => CROSS.some((c) => Math.hypot(c.x - x, c.z - z) < (c.bridge ? c.hl : c.w) + r);
  for (const c of CROSS) {
    if (c.bridge) {
      const m = new THREE.Mesh(bridgeGeometry(c, world), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    } else for (const s of c.stones) stones.push({ x: s.x, y: s.top - 0.22, z: s.z, ry: rnd() * 6.28, sv: new THREE.Vector3(1 + rnd() * 0.2, 1, 0.85 + rnd() * 0.2) });
  }
  const stoneGeo = new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.4, 0.85);
  if (stones.length) scene.add(instanced(stoneGeo, new THREE.MeshStandardMaterial({ color: '#e3e5ea', roughness: 0.8, flatShading: true }), stones, true));

  // şelalenin dibinde köpük öbekleri
  const foam = [];
  for (let k = 0; k < 7; k++) {
    const a = rnd() * 6.28, r = 0.6 + rnd() * 1.4;
    foam.push({ x: fall.end.x + Math.cos(a) * r, y: RIVER.pts[0].wl + 0.05, z: fall.end.z + Math.sin(a) * r * 0.7, ry: rnd() * 6.28, sv: new THREE.Vector3(0.5 + rnd() * 0.4, 0.18, 0.5 + rnd() * 0.4) });
  }
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, flatShading: true }), foam));

  // sazlar (kıyı boyunca), nilüferler (havuz, gölet, nehir kenarı)
  const reeds = [], pads = [], lotus = [];
  const P = RIVER.pts;
  const fallClear = (x, z) => Math.abs(x - MESA.x) < 3.5 && z < POOL.z;
  for (let i = 0; i < P.length; i += 3) {
    const p = P[i];
    if (p.dn > 0.92 || p.s < 6) continue;
    for (const o of [-1, 1]) {
      if (rnd() > 0.55) continue;
      const d = p.w - 0.5 + rnd() * 1.0, x = p.x - p.tz * o * d, z = p.z + p.tx * o * d;
      if (nearCross(x, z, 2.5) || fallClear(x, z)) continue;
      reeds.push({ x, y: isleHeight(x, z) - 0.05, z, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
    }
    if (rnd() < 0.16) {
      const o = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.4) * p.w, x = p.x - p.tz * o, z = p.z + p.tx * o;
      if (!nearCross(x, z, 2)) pads.push({ x, y: p.wl + 0.03, z, ry: rnd() * 6.28, s: 0.35 + rnd() * 0.25 });
    }
  }
  const padIn = (cx, cz, r, y, n, avoid) => {
    for (let k = 0, t = 0; k < n && t < n * 6; t++) {
      const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 3.2) continue;
      pads.push({ x, y: y + 0.03, z, ry: rnd() * 6.28, s: 0.35 + rnd() * 0.25 }); k++;
    }
  };
  padIn(POOL.x, POOL.z, POOL.r * 0.85, P[0].wl, 9, fall.end);
  padIn(POND.x, POND.z - 0.8, POND.r * 0.7, POND.y, 5, { x: POND.x, z: POND.z + POND.r });
  for (const p of pads) if (rnd() < 0.4) lotus.push({ x: p.x + 0.12, y: p.y, z: p.z, ry: rnd() * 6.28, s: 0.9 + rnd() * 0.5 });
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  scene.add(instanced(reedGeometry(), plantMat, reeds, world.quality !== 'low'));
  const padGeo = new THREE.CircleGeometry(1, 12, 0.4, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2);
  scene.add(instanced(padGeo, new THREE.MeshStandardMaterial({ color: '#b5d63c', roughness: 0.7, side: THREE.DoubleSide }), pads));
  scene.add(instanced(lotusGeometry(), plantMat, lotus));
}
