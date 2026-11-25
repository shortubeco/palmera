// Wild West sakinleri: kovboylar (şerif, kanun kaçağı, silahşor — kaldırımlarda dolaşır, durur, yakındaki oyuncuya döner,
// hızlı araç çarpınca düşüp kalkar) ve atlar (çiftlik ağıllarında dolaşan/otlayan, salon önünde bağlı duranlar).
// Kovboy modelleri: "Low-Poly Western Starter Pack" → tools/west/chars.mjs → assets/web/west_chars.json + tex/west/char_*.png
//   Animasyonları yok: yürüme/durma kemikleri kodla döndürülerek yapılır (bacak, diz, kol salınımı).
// At: hayvan kitinden (animals.json 'horse': idle, walk, run, eat).
import { trackedFetch } from './progress.js';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { damp, dampAngle, mulberry32 } from './util.js';

export async function loadCowboyKit(base = 'assets/web/') {
  const j = await trackedFetch(base + 'west_chars.json').then((r) => { if (!r.ok) throw new Error('west_chars.json ' + r.status); return r.json(); });
  const loader = new THREE.ObjectLoader(), tl = new THREE.TextureLoader(), kinds = {};
  await Promise.all(Object.entries(j.kinds).map(async ([name, json]) => {
    const tex = await tl.loadAsync(base + json.meta.tex);
    tex.colorSpace = THREE.SRGBColorSpace;
    const root = loader.parse(json);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    root.traverse((o) => { if (o.isSkinnedMesh) { o.material = mat; o.frustumCulled = false; } });
    kinds[name] = { root, meta: json.meta };
  }));
  return { kinds };
}

// ---------- kemikle yürüme ----------
const BONES = ['spine', 'chest', 'neck', 'head', 'upper_legL', 'lower_legL', 'footL', 'upper_legR', 'lower_legR', 'footR', 'upper_armL', 'lower_armL', 'upper_armR', 'lower_armR'];
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion();
// karakterin X/Y/Z eksenlerini her kemiğin ebeveyn uzayına çevir (dinlenme pozunda, obje döndürülmeden önce)
function rig(obj) {
  obj.updateMatrixWorld(true);
  const b = {}; obj.traverse((o) => { if (o.isBone && !b[o.name]) b[o.name] = o; });
  const R = {};
  for (const n of BONES) {
    const bone = b[n]; if (!bone) continue;
    const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq); pq.invert();
    R[n] = { bone, rest: bone.quaternion.clone(), x: X.clone().applyQuaternion(pq), y: Y.clone().applyQuaternion(pq), z: Z.clone().applyQuaternion(pq) };
  }
  return R;
}
function setBone(R, n, ax, a, ax2, a2) {
  const r = R[n]; if (!r) return;
  r.bone.quaternion.copy(r.rest);
  if (ax2) { _q.setFromAxisAngle(r[ax2], a2); r.bone.quaternion.premultiply(_q); }
  if (ax) { _q.setFromAxisAngle(r[ax], a); r.bone.quaternion.premultiply(_q); }
}
// w: 0 duruş … 1 tam yürüyüş, ph: adım evresi, look: başın yana dönüşü, t: zaman (nefes)
function pose(R, w, ph, look, t, sit = false) {
  if (sit) {
    // oturuş: uyluklar öne yatay, dizler bükük, kollar masaya uzanır
    setBone(R, 'upper_legL', 'x', -1.5); setBone(R, 'upper_legR', 'x', -1.5);
    setBone(R, 'lower_legL', 'x', 1.45); setBone(R, 'lower_legR', 'x', 1.45);
    setBone(R, 'footL', 'x', 0); setBone(R, 'footR', 'x', 0);
    setBone(R, 'upper_armL', 'x', -0.75, 'z', -1.05); setBone(R, 'upper_armR', 'x', -0.75, 'z', 1.05);
    setBone(R, 'lower_armL', 'x', -0.7); setBone(R, 'lower_armR', 'x', -0.7);
    setBone(R, 'spine', 'x', 0.08 + Math.sin(t * 1.7) * 0.015); setBone(R, 'chest', 'y', 0); setBone(R, 'head', 'y', look);
    return;
  }
  const s = Math.sin(ph), leg = 0.55 * w, arm = 0.4 * w;
  setBone(R, 'upper_legL', 'x', -leg * s); setBone(R, 'upper_legR', 'x', leg * s);
  setBone(R, 'lower_legL', 'x', 0.75 * w * Math.max(0, Math.sin(ph + 1.3)));
  setBone(R, 'lower_legR', 'x', 0.75 * w * Math.max(0, Math.sin(ph + 1.3 + Math.PI)));
  setBone(R, 'footL', 'x', -0.25 * w * Math.max(0, -s)); setBone(R, 'footR', 'x', -0.25 * w * Math.max(0, s));
  // kollar: A duruşundan aşağı indir (z), yürürken bacağa ters salla (x)
  setBone(R, 'upper_armL', 'x', arm * s, 'z', -1.05); setBone(R, 'upper_armR', 'x', -arm * s, 'z', 1.05);
  setBone(R, 'lower_armL', 'x', -0.25 - 0.2 * w); setBone(R, 'lower_armR', 'x', -0.25 - 0.2 * w);
  setBone(R, 'spine', 'x', 0.04 * w + Math.sin(t * 1.7) * 0.015);
  setBone(R, 'chest', 'y', 0.12 * w * s);
  setBone(R, 'head', 'y', look);
}

const SPEED = 1.35;   // yürüme (m/sn)
const STRIDE = 1.5;   // bir adım evresi turunda alınan yol (m)

export class WestLife {
  constructor(west, scene, chars, animals) {
    this.west = west; this.world = west.world;
    this.rnd = mulberry32(1881);
    this.cowboys = []; this.horses = [];
    const T = west.townInfo;
    if (chars && T) {
      const types = ['sheriff', 'outlaw', 'gunman'];
      for (let i = 0; i < 16; i++) {
        const kind = types[i % 3], K = chars.kinds[kind]; if (!K) continue;
        const obj = cloneSkinned(K.root);
        const R = rig(obj);
        scene.add(obj);
        const p = this.walkPoint();
        const c = { kind, obj, R, x: p[0], z: p[1], y: 0, heading: this.rnd() * 6.28, state: 'idle', timer: this.rnd() * 4, tx: p[0], tz: p[1], w: 0, ph: this.rnd() * 6, look: 0, stuck: 0, downT: 0, fall: 0 };
        c.y = this.world.surfaceHeight(c.x, c.z);
        this.cowboys.push(c);
      }
      // yerinden ayrılmayanlar (Grand Hotel: barmen, barda dikilen, masada oturanlar)
      for (const f of west.folk || []) {
        const K = chars.kinds[f.kind]; if (!K) continue;
        const obj = cloneSkinned(K.root), R = rig(obj);
        scene.add(obj);
        this.cowboys.push({ kind: f.kind, obj, R, x: f.x, z: f.z, y: west.hotel.y, heading: f.heading, home: f.heading, fixed: true, sit: !!f.sit,
          state: 'idle', timer: 0, tx: f.x, tz: f.z, w: 0, ph: 0, look: 0, stuck: 0, downT: 0, fall: 0 });
      }
    }
    const H = animals?.kinds.horse;
    if (H) {
      for (const f of west.corrals) for (let i = 0; i < f.n; i++) this.addHorse(scene, H, f.x + (this.rnd() - 0.5) * 6, f.z + (this.rnd() - 0.5) * 6, this.rnd() * 6.28, f);
      for (const r of west.rails) {
        const h = this.addHorse(scene, H, r.x + (this.rnd() - 0.5) * 0.8, r.z + r.side * -2.1, r.side > 0 ? 0 : Math.PI, null);
        this.world.addCircle(h.x, h.z, 0.55, h.y - 1, h.y + 2);
      }
    }
  }

  addHorse(scene, H, x, z, heading, pen) {
    const obj = cloneSkinned(H.root);
    obj.scale.setScalar(1.15);   // at arabasındakiyle aynı (vehicles.js HORSE_S)
    obj.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const [n, c] of Object.entries(H.clips)) { actions[n] = mixer.clipAction(c); actions[n].play(); actions[n].setEffectiveWeight(0); actions[n].time = this.rnd() * c.duration; }
    const h = { obj, mixer, actions, cur: null, x, z, y: this.world.surfaceHeight(x, z), heading, pen, state: 'idle', timer: 2 + this.rnd() * 6, tx: x, tz: z };
    this.setClip(h, pen ? 'eat' : 'idle');
    scene.add(obj);
    this.horses.push(h);
    this.placeHorse(h);
    return h;
  }
  setClip(h, n) {
    if (h.cur === n || !h.actions[n]) return;
    if (h.cur) h.actions[h.cur].setEffectiveWeight(0);
    h.actions[n].setEffectiveWeight(1); h.cur = n;
  }
  placeHorse(h) { h.obj.position.set(h.x, h.y, h.z); h.obj.rotation.y = h.heading; }

  // cadde / yan yol kenarında (doğru parçası) ya da meydanda rastgele nokta
  walkPoint() {
    const T = this.west.townInfo;
    if (this.rnd() < 0.12) return [T.plaza.x + (this.rnd() - 0.5) * 16, T.plaza.z + (this.rnd() - 0.5) * 14];
    const [x0, z0, x1, z1] = T.walks[Math.floor(this.rnd() * T.walks.length)], t = this.rnd();
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
  }

  update(dt, game) {
    const P = game.player, pp = P.vehicle ? P.vehicle.pos : P.pos, W = this.world, t = game.time;
    // salon kapıları: oyuncu (yayayken) ve yürüyen kovboylar iter
    const movers = P.vehicle ? [] : [{ x: P.pos.x, z: P.pos.z, vz: P.vz }];
    for (const c of this.cowboys) if (c.state === 'walk') movers.push({ x: c.x, z: c.z, vz: Math.cos(c.heading) * SPEED });
    this.west.updateDoors(dt, movers);
    for (const c of this.cowboys) {
      const dP = Math.hypot(c.x - pp.x, c.z - pp.z);
      if (dP > 220) { c.obj.visible = false; continue; }
      c.obj.visible = true;
      if (c.fixed) {
        // yerinde: ayaktaysa yakındaki oyuncuya döner, sonra eski yönüne
        const nearF = dP < 3.5 && !P.vehicle && !c.sit;
        c.heading = dampAngle(c.heading, nearF ? Math.atan2(P.pos.x - c.x, P.pos.z - c.z) : c.home, 3, dt);
        if (dP < 90) pose(c.R, 0, 0, c.sit && dP < 4 ? 0.4 * Math.sin(t * 0.6) : 0, t + c.x, c.sit);
        c.obj.position.set(c.x, c.y - (c.sit ? 0.33 : 0), c.z);
        c.obj.rotation.set(0, c.heading, 0);
        continue;
      }
      // hızlı araç çarptı: yere düş, sonra kalk
      if (c.downT > 0) {
        c.downT -= dt; c.fall = damp(c.fall, c.downT > 1 ? 1 : 0, 6, dt);
      } else {
        for (const v of game.vehicles) {
          if (v.speed < 4 || Math.abs(v.pos.x - c.x) > 5 || Math.abs(v.pos.z - c.z) > 5) continue;
          if (v.circles().some((q) => Math.hypot(q.x - c.x, q.z - c.z) < q.r + 0.35)) {
            c.downT = 5; c.state = 'idle'; c.timer = 2;
            const dx = c.x - v.pos.x, dz = c.z - v.pos.z, d = Math.hypot(dx, dz) || 1;
            c.x += dx / d * 1.2; c.z += dz / d * 1.2;
            game.audio?.punch(); game.effects?.hit?.(c.x, c.y + 1, c.z);
            break;
          }
        }
        c.fall = damp(c.fall, 0, 4, dt);
      }
      const near = dP < 3.2 && !P.vehicle;
      let moving = false;
      if (c.downT <= 0) {
        if (c.state === 'walk' && !near) {
          const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
          if (d < 0.6) { c.state = 'idle'; c.timer = 2 + this.rnd() * 7; }
          else {
            c.heading = dampAngle(c.heading, Math.atan2(dx, dz), 5, dt);
            const ox = c.x, oz = c.z, f = SPEED * dt;
            c.x += Math.sin(c.heading) * f; c.z += Math.cos(c.heading) * f;
            const p = this._p || (this._p = new THREE.Vector3());
            p.set(c.x, 0, c.z); W.collideCircle(p, 0.32, c.y, 1.7); c.x = p.x; c.z = p.z;
            // oyuncuya çarpmasın
            const ex = c.x - P.pos.x, ez = c.z - P.pos.z, e = Math.hypot(ex, ez);
            if (e < 0.75 && e > 1e-3) { c.x += ex / e * (0.75 - e); c.z += ez / e * (0.75 - e); }
            const prog = Math.hypot(c.x - ox, c.z - oz);
            c.stuck = prog < f * 0.3 ? c.stuck + dt : 0;
            if (c.stuck > 1.5) { c.state = 'idle'; c.timer = 1; c.stuck = 0; }
            moving = true;
            c.ph += prog / STRIDE * Math.PI * 2;
          }
        } else if (c.state === 'idle' || near) {
          if (!near) c.timer -= dt;
          if (c.timer <= 0) { [c.tx, c.tz] = this.walkPoint(); c.state = 'walk'; }
          if (near) c.heading = dampAngle(c.heading, Math.atan2(P.pos.x - c.x, P.pos.z - c.z), 4, dt);
        }
      }
      c.y = damp(c.y, W.surfaceHeight(c.x, c.z, c.y + 0.5), 12, dt);
      c.w = damp(c.w, moving ? 1 : 0, 6, dt);
      if (dP < 90) pose(c.R, c.w, c.ph, near ? 0.3 * Math.sin(t * 0.7) : 0, t + c.x);
      c.obj.position.set(c.x, c.y + c.fall * 0.15, c.z);
      c.obj.rotation.set(-c.fall * Math.PI / 2, c.heading, 0, 'YXZ');
    }
    // atlar: ağıldakiler dolaşır/otlar, bağlılar durur
    for (const h of this.horses) {
      const d = Math.hypot(h.x - pp.x, h.z - pp.z);
      if (d > 220) { h.obj.visible = false; continue; }
      h.obj.visible = true;
      if (h.pen) {
        h.timer -= dt;
        if (h.state === 'walk') {
          const dx = h.tx - h.x, dz = h.tz - h.z, dd = Math.hypot(dx, dz);
          if (dd < 0.5 || h.timer <= 0) { h.state = this.rnd() < 0.6 ? 'eat' : 'idle'; h.timer = 4 + this.rnd() * 8; this.setClip(h, h.state); }
          else { h.heading = dampAngle(h.heading, Math.atan2(dx, dz), 1.6, dt); h.x += Math.sin(h.heading) * 1.4 * dt; h.z += Math.cos(h.heading) * 1.4 * dt; }
        } else if (h.timer <= 0) {
          const k = h.pen.k - 1.6;
          h.tx = h.pen.x + (this.rnd() * 2 - 1) * k; h.tz = h.pen.z + (this.rnd() * 2 - 1) * k;
          h.state = 'walk'; h.timer = 12; this.setClip(h, 'walk');
        }
        h.y = W.surfaceHeight(h.x, h.z);
        this.placeHorse(h);
      } else if (h.state === 'idle' && h.timer <= 0) { h.timer = 5 + this.rnd() * 8; this.setClip(h, this.rnd() < 0.5 ? 'eat' : 'idle'); }
      else h.timer -= dt;
      if (d < 120) h.mixer.update(dt);
    }
  }
}
