// Bina modelleri (Quaternius "Downtown City MegaKit" ücretsiz sürümünün parçalarından üretilmiş, CC0) — yükleme, yerleştirme ve LOD.
// Veri assets/web/ içinde: buildings.json + buildings.bin (önceden birleştirilmiş geometri) ve tex/*.jpg.
//  - Her bina çeşidi ("kind") doku gruplarına ayrılmış tek geometridir (tuğla, açık tuğla, taş, metal, arduvaz, pencere…).
//  - Yakın binalar: tam model, her çeşit × doku grubu için tek InstancedMesh.
//  - Uzak binalar: açılışta her çeşidin 4 cephesi + çatısı dokuya "fotoğraflanır", 10 üçgenlik kutu çizilir.
//  - Pencereler: sahte oda derinliği (interior mapping) — camın arkasında oda varmış gibi görünür.
//  - Görüş alanı dışındakiler hiç çizilmez; gölgeyi basit görünmez kutular verir.
import { trackedFetch } from './progress.js';
import * as THREE from 'three';

const TEX = {
  brick: ['RedBrick_BaseColor', 'RedBrick_Normal'], pale: ['PaleBrick_BaseColor', 'RedBrick_Normal'], trim: ['Trim_BaseColor', 'Trim_Normal'],
  metal: ['MetalConcrete_BaseColor', 'MetalConcrete_Normal'], concrete: ['Concrete_BaseColor'], roof: ['Concrete_Asphalt_BaseColor'],
  slate: ['RoofSlate_BaseColor', 'RoofSlate_Normal'], orn: ['Ornaments_BaseColor'], win: ['win_atlas'],
};
const TINTED = new Set(['brick', 'pale', 'trim', 'metal']);
const UP = new THREE.Vector3(0, 1, 0);

// Pencere atlası 3 karo: aydınlık oda 1 | aydınlık oda 2 | karanlık oda. uv.x = karo + yerel u.
// Oda resmi tek noktalı perspektifle çekilmiş: arka duvar resmin ortasında ~%59 boyutta.
const WIN_FRAG = /* glsl */ `
vec4 winSample = vec4(1.0);
{
  vec2 wuv = vMapUv * vec2(3.0, 1.0);
  float tile = floor(wuv.x);
  vec2 luv = vec2(wuv.x - tile, wuv.y);
  vec3 p = -vViewPosition;
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  vec2 dux = dFdx(luv), duy = dFdy(luv);
  vec3 Ng = normalize(cross(dpx, dpy));
  vec3 r1 = cross(dpy, Ng), r2 = cross(Ng, dpx);
  float det = dot(dpx, r1);
  vec2 img = luv;
  if (abs(det) > 1e-12) {
    vec3 gu = (r1 * dux.x + r2 * duy.x) / det;
    vec3 gv = (r1 * dux.y + r2 * duy.y) / det;
    vec3 V = normalize(p);
    if (dot(Ng, V) > 0.0) Ng = -Ng;
    float rz = max(dot(V, -Ng), 0.05);
    float ru = dot(V, gu), rv = dot(V, gv);
    const float DM = 3.0, S = 0.59;
    float tz = DM / rz;
    float tu = ru > 1e-5 ? (1.0 - luv.x) / ru : (ru < -1e-5 ? -luv.x / ru : 1e9);
    float tv = rv > 1e-5 ? (1.0 - luv.y) / rv : (rv < -1e-5 ? -luv.y / rv : 1e9);
    float t = min(tz, min(tu, tv));
    vec2 h = clamp(luv + vec2(ru, rv) * t, 0.0, 1.0);
    float hz = rz * t;
    float z0 = S * DM / (1.0 - S);
    img = 0.5 + (h - 0.5) * (z0 / (z0 + hz));
  }
  winSample = textureGrad(map, vec2((tile + clamp(img.x, 0.003, 0.997)) / 3.0, img.y), dFdx(vMapUv), dFdy(vMapUv));
  diffuseColor *= winSample;
}
`;

function loadTex(url) { return new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, () => rej(new Error('doku yüklenemedi: ' + url)))); }

export async function loadBuildingKit(quality, base = 'assets/web/') {
  const ok = (r) => { if (!r.ok) throw new Error(r.url + ' ' + r.status); return r; };
  const [man, bin] = await Promise.all([
    trackedFetch(base + 'buildings.json').then(ok).then((r) => r.json()),
    trackedFetch(base + 'buildings.bin').then(ok).then((r) => r.arrayBuffer()),
  ]);
  const used = new Set();
  for (const m of Object.values(man.models)) for (const g of Object.keys(m.groups)) used.add(g);
  const names = new Set();
  for (const [g, list] of Object.entries(TEX)) if (used.has(g)) list.forEach((n, i) => { if (i === 0 || quality !== 'low') names.add(n); });
  const tex = {};
  await Promise.all([...names].map(async (n) => {
    const t = await loadTex(base + 'tex/' + n + '.jpg');
    t.flipY = false; // glTF UV düzeni
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = n.includes('Normal') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = quality === 'low' ? 2 : 4;
    if (n === 'win_atlas') { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / 3, 1); }
    t.needsUpdate = true;
    tex[n] = t;
  }));
  const models = {};
  for (const [key, m] of Object.entries(man.models)) {
    const groups = {};
    for (const [g, d] of Object.entries(m.groups)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, d.pos, d.verts * 3), 3));
      geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, d.nor, d.verts * 4), 4), 3, 0, true));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, d.uv, d.verts * 2), 2));
      geo.setAttribute('color', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Uint8Array(bin, d.col, d.verts * 4), 4), 3, 0, true));
      geo.setIndex(new THREE.BufferAttribute(d.idx32 ? new Uint32Array(bin, d.idx, d.count) : new Uint16Array(bin, d.idx, d.count), 1));
      groups[g] = geo;
    }
    const [mn, mx] = m.bounds;
    // gövde kutusu (çıkıntılar hariç)
    models[key] = { groups, tris: m.tris, floors: m.floors || 5, min: new THREE.Vector3(mn[0], 0, mn[2]), max: new THREE.Vector3(mx[0], mx[1], Math.min(mx[2], 0.6)) };
  }
  const std = (o) => (o.map ? new THREE.MeshStandardMaterial({ vertexColors: true, ...o }) : null); // dokusu yüklenmeyen grup kullanılmıyor
  const N = (n) => tex[n] || null;
  const mats = {
    brick: std({ map: tex.RedBrick_BaseColor, normalMap: N('RedBrick_Normal'), roughness: 0.92 }),
    pale: std({ map: tex.PaleBrick_BaseColor, normalMap: N('RedBrick_Normal'), roughness: 0.9 }),
    trim: std({ map: tex.Trim_BaseColor, normalMap: N('Trim_Normal'), roughness: 0.85 }),
    metal: std({ map: tex.MetalConcrete_BaseColor, normalMap: N('MetalConcrete_Normal'), roughness: 0.6, metalness: 0.3 }),
    concrete: std({ map: tex.Concrete_BaseColor, roughness: 0.95 }),
    roof: std({ map: tex.Concrete_Asphalt_BaseColor, roughness: 0.95 }),
    slate: std({ map: tex.RoofSlate_BaseColor, normalMap: N('RoofSlate_Normal'), roughness: 0.7 }),
    orn: std({ map: tex.Ornaments_BaseColor, roughness: 0.7, metalness: 0.2 }),
  };
  for (const g of Object.keys(mats)) if (!mats[g]) delete mats[g];
  if (tex.win_atlas) {
    const t = tex.win_atlas;
    const w = mats.win = new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ffe7c4'), emissiveIntensity: 0, roughness: 0.12, metalness: 0.35 });
    w.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', WIN_FRAG)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= winSample.rgb * winSample.rgb * 1.6;');
    };
    w.customProgramCacheKey = () => 'winInterior';
  }
  return { models, mats, tex, kinds: Object.keys(models) };
}

export class CityBuildings {
  constructor(kit) {
    this.kit = kit;
    this.items = [];
    this.nearDist = 140;
    this._frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
  }
  // Döndürülmüş + ölçeklenmiş gövdenin, orijine göre eksen hizalı kutusu
  localBox(kind, rotY, scale) {
    const m = this.kit.models[kind];
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(UP, rotY), scale);
    return new THREE.Box3(m.min.clone(), m.max.clone()).applyMatrix4(mat);
  }
  add(kind, x, y, z, rotY, scale, tint) {
    const m = this.kit.models[kind];
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rotY), scale);
    const box = new THREE.Box3(m.min.clone(), m.max.clone()).applyMatrix4(mat);
    // ön yüz düzlemi (yerel z=0) ve dışa bakan yönü: arkadan bakılınca tam model gerekmez
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    this.items.push({ kind, mat, box, sphere: box.getBoundingSphere(new THREE.Sphere()), tint: new THREE.Color(tint), fx: x, fz: z, nx, nz, backPlain: true });
    return box;
  }

  // Sahneye ekle: InstancedMesh'ler, uzak görünüm dokuları, gölge kutuları
  finalize(renderer, scene, quality) {
    this.nearDist = quality === 'high' ? 230 : quality === 'medium' ? 170 : 120;
    const shadows = renderer.shadowMap.enabled;
    this.byKind = {};
    for (const kind of this.kit.kinds) {
      const list = this.items.filter((it) => it.kind === kind);
      const cap = Math.max(1, list.length);
      const matAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
      matAttr.setUsage(THREE.DynamicDrawUsage);
      const colAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      const meshes = [];
      for (const [g, geo] of Object.entries(this.kit.models[kind].groups)) {
        const mesh = new THREE.InstancedMesh(geo, this.kit.mats[g], cap);
        mesh.instanceMatrix = matAttr;
        if (TINTED.has(g)) mesh.instanceColor = colAttr;
        mesh.count = 0; mesh.frustumCulled = false;
        mesh.castShadow = false; mesh.receiveShadow = shadows;
        scene.add(mesh); meshes.push(mesh);
      }
      this.byKind[kind] = { list, meshes, matAttr, colAttr };
    }
    this.bakeImpostors(renderer, scene, shadows);
    if (shadows) {
      // gölge: görünmez kutular (yalnız gölge haritasına çizilir)
      const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0.5, 0.5, 0.5);
      const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      const proxy = new THREE.InstancedMesh(g, m, Math.max(1, this.items.length));
      const t = new THREE.Matrix4(), s = new THREE.Matrix4();
      this.items.forEach((it, i) => {
        const b = it.box;
        t.makeTranslation(b.min.x, b.min.y, b.min.z); s.makeScale(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
        proxy.setMatrixAt(i, t.clone().multiply(s));
      });
      proxy.castShadow = true; proxy.receiveShadow = false; proxy.frustumCulled = false;
      scene.add(proxy);
    }
  }

  // Her çeşit için 4 cephe + çatı görüntüsünü tek bir doku atlasına çiz (satır başına 2 çeşit)
  bakeImpostors(renderer, scene, shadows) {
    const SLOT = [[0, 288], [288, 256], [544, 192], [736, 192], [928, 96]]; // ön, arka, sağ, sol, üst (x, genişlik)
    const CELL = 1024, ROW = 256, kinds = this.kit.kinds;
    const W = CELL * 2, H = ROW * Math.ceil(kinds.length / 2);
    const mk = () => new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4 });
    const rtA = mk(), rtE = mk();
    const albedo = {}, emis = {};
    for (const [g, m] of Object.entries(this.kit.mats)) {
      if (g === 'win') { // düz örnekleme yeterli; atlas tekrarı (1/3, 1) dokuda
        albedo[g] = new THREE.MeshBasicMaterial({ map: m.map, color: new THREE.Color(0.55, 0.55, 0.58) });
        emis[g] = new THREE.MeshBasicMaterial({ map: m.map, color: new THREE.Color('#ffe7c4').multiplyScalar(0.8) });
      } else {
        albedo[g] = new THREE.MeshBasicMaterial({ map: m.map, vertexColors: true });
        emis[g] = new THREE.MeshBasicMaterial({ color: 0x000000 });
      }
    }
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const bakeScene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    this.impostors = {};
    kinds.forEach((kind, idx) => {
      const md = this.kit.models[kind];
      const r = idx >> 1, cx0 = (idx & 1) * CELL;
      const mn = md.min, mx = md.max;
      const cx = (mn.x + mx.x) / 2, cy = (mn.y + mx.y) / 2, cz = (mn.z + mx.z) / 2;
      const hx = (mx.x - mn.x) / 2, hy = (mx.y - mn.y) / 2, hz = (mx.z - mn.z) / 2;
      const views = [
        { pos: [cx, cy, mx.z + 60], up: [0, 1, 0], hw: hx, hh: hy }, // ön (+z)
        { pos: [cx, cy, mn.z - 60], up: [0, 1, 0], hw: hx, hh: hy }, // arka
        { pos: [mx.x + 60, cy, cz], up: [0, 1, 0], hw: hz, hh: hy }, // sağ (+x)
        { pos: [mn.x - 60, cy, cz], up: [0, 1, 0], hw: hz, hh: hy }, // sol
        { pos: [cx, mx.y + 60, cz], up: [0, 0, -1], hw: hx, hh: hz }, // üst
      ];
      for (const [rt, mats] of [[rtA, albedo], [rtE, emis]]) {
        bakeScene.clear();
        for (const [g, geo] of Object.entries(md.groups)) bakeScene.add(new THREE.Mesh(geo, mats[g]));
        renderer.setClearColor(rt === rtA ? new THREE.Color(0.32, 0.3, 0.3) : new THREE.Color(0, 0, 0), 1);
        views.forEach((v, k) => {
          cam.position.set(...v.pos); cam.up.set(...v.up);
          cam.lookAt(cx, cy, cz);
          cam.left = -v.hw; cam.right = v.hw; cam.top = v.hh; cam.bottom = -v.hh;
          cam.updateProjectionMatrix();
          rt.viewport.set(cx0 + SLOT[k][0], r * ROW, SLOT[k][1], ROW);
          rt.scissor.set(cx0 + SLOT[k][0], r * ROW, SLOT[k][1], ROW);
          rt.scissorTest = true;
          renderer.setRenderTarget(rt);
          renderer.clear();
          renderer.render(bakeScene, cam);
        });
      }
      // uzak görünüm kutusu
      const u = (k, t) => (cx0 + SLOT[k][0] + t * SLOT[k][1]) / W;
      const v0 = (r * ROW) / H, v1 = ((r + 1) * ROW) / H;
      const P = [], Nn = [], UV = [], I = [];
      const face = (pts, n, k) => {
        const b = P.length / 3;
        pts.forEach((p) => P.push(...p));
        for (let i = 0; i < 4; i++) Nn.push(...n);
        UV.push(u(k, 0), v0, u(k, 1), v0, u(k, 1), v1, u(k, 0), v1);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      };
      const [x0, y0, z0, x1, y1, z1] = [mn.x, mn.y, mn.z, mx.x, mx.y, mx.z];
      face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], 0);
      face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], 1);
      face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], 2);
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], 3);
      face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], 4);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      geo.setIndex(I);
      this.impostors[kind] = geo;
    });
    rtA.scissorTest = rtE.scissorTest = false;
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const m of [...Object.values(albedo), ...Object.values(emis)]) m.dispose();
    this.impostorMat = new THREE.MeshStandardMaterial({ map: rtA.texture, emissiveMap: rtE.texture, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.85, metalness: 0.05 });
    this.rts = [rtA, rtE];
    for (const kind of this.kit.kinds) {
      const K = this.byKind[kind];
      const cap = Math.max(1, K.list.length);
      const mesh = new THREE.InstancedMesh(this.impostors[kind], this.impostorMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = shadows;
      scene.add(mesh);
      K.far = mesh;
    }
  }

  setNight(n) {
    if (this.kit.mats.win) this.kit.mats.win.emissiveIntensity = 0.04 + n * 1.3;
    if (this.impostorMat) this.impostorMat.emissiveIntensity = 0.03 + n * 1.25;
  }

  // Her karede: görünür binaları yakın (tam model) / uzak (kutu) olarak ayır
  update(camera) {
    if (!this.byKind) return;
    camera.updateMatrixWorld();
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pm);
    const cp = camera.position, nd2 = this.nearDist * this.nearDist;
    let nearTris = 0;
    for (const kind of this.kit.kinds) {
      const K = this.byKind[kind];
      let n = 0, f = 0;
      const ma = K.matAttr.array, ca = K.colAttr.array, fm = K.far.instanceMatrix.array, fc = K.far.instanceColor.array;
      for (const it of K.list) {
        const s = it.sphere;
        if (!this._frustum.intersectsSphere(s)) continue;
        const dx = s.center.x - cp.x, dy = s.center.y - cp.y, dz = s.center.z - cp.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        // arka cephe sade: kamera arkada ve biraz uzaktaysa uzak görünüm yeterli
        const behind = it.backPlain && d2 > 1600 && (cp.x - it.fx) * it.nx + (cp.z - it.fz) * it.nz < -2;
        if (d2 < nd2 && !behind) { it.mat.toArray(ma, n * 16); it.tint.toArray(ca, n * 3); n++; }
        else { it.mat.toArray(fm, f * 16); it.tint.toArray(fc, f * 3); f++; }
      }
      // örnek sayısı 0 olan mesh'i gizle: yoksa boş çizim çağrısı yine yapılır
      for (const m of K.meshes) { m.count = n; m.visible = n > 0; }
      if (n) { K.matAttr.needsUpdate = true; K.colAttr.needsUpdate = true; }
      K.far.count = f; K.far.visible = f > 0;
      if (f) { K.far.instanceMatrix.needsUpdate = true; K.far.instanceColor.needsUpdate = true; }
      nearTris += n * this.kit.models[kind].tris;
      K.nNear = n; K.nFar = f;
    }
    this.stats = { near: this.kit.kinds.reduce((a, k) => a + this.byKind[k].nNear, 0), far: this.kit.kinds.reduce((a, k) => a + this.byKind[k].nFar, 0), nearTris };
  }
}
