// Kılıç ve yay (kodla çizilen low-poly modeller), oklar (uçuş + yerçekimi + hayvana isabet),
// Pasarela Selva'nın ada ucundaki silah standı. Kılıç/yay oyuncunun ön koluna takılır (humanoid armR/armL .el).
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0, flatShading: true, ...o.extra });
const STEEL = mat('#d9dde3', { r: 0.25, m: 0.85 }), GOLD = mat('#c9a03a', { r: 0.35, m: 0.8 }), GRIP = mat('#4a2c18', { r: 0.9 });
const WOOD = mat('#8a5a2b', { r: 0.8 }), STRING = mat('#eee8d8', { r: 1 });
const bx = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; return o; };

// kılıç: kabza başlangıcı (0,0,0), namlu +Z yönünde (~1 m)
export function swordMesh() {
  const g = new THREE.Group();
  g.add(bx(0.04, 0.04, 0.2, GRIP, 0, 0, 0));
  g.add(bx(0.06, 0.06, 0.06, GOLD, 0, 0, -0.12));          // topuz
  g.add(bx(0.28, 0.05, 0.06, GOLD, 0, 0, 0.12));           // balçak
  g.add(bx(0.07, 0.015, 0.85, STEEL, 0, 0, 0.57));         // namlu
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4).rotateX(Math.PI / 2).scale(1, 0.3, 1), STEEL);
  tip.position.z = 1.06; g.add(tip);
  return g;
}
// yay: tutamak (0,0,0); kollar yerel ±Z boyunca (kol öndeyken dikey durur), sırtı yerel -Y'de (ileri)
export function bowMesh() {
  const g = new THREE.Group(), pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 5 - 1; pts.push([t * 0.62, -0.16 * (1 - t * t)]); }
  for (let i = 0; i < 10; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1], L = Math.hypot(z1 - z0, y1 - y0);
    const seg = bx(0.035, 0.035, L + 0.01, WOOD, 0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = -Math.atan2(y1 - y0, z1 - z0); g.add(seg);
  }
  g.add(bx(0.05, 0.05, 0.14, GRIP, 0, -0.16, 0));
  g.add(bx(0.008, 0.008, 1.24, STRING, 0, 0, 0));          // kiriş
  return g;
}
// ok: uç +Z'de (z = 0,5), boy ~1 m; tüyler parlak kırmızı/beyaz (uzaktan görünsün)
function arrowGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.04, 0.04, 0.9),
    new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI / 2).translate(0, 0, 0.52),
    new THREE.BoxGeometry(0.008, 0.13, 0.2).translate(0, 0, -0.36),
    new THREE.BoxGeometry(0.13, 0.008, 0.2).translate(0, 0, -0.36),
    new THREE.BoxGeometry(0.045, 0.045, 0.06).translate(0, 0, -0.22),
  ];
  const cols = ['#b07a3e', '#e4e7ec', '#ff3b3b', '#ffffff', '#ff3b3b'];
  const P = [], C = [], c = new THREE.Color();
  parts.forEach((p, i) => { const g = p.toNonIndexed(); c.set(cols[i]); P.push(...g.attributes.position.array); for (let k = 0; k < g.attributes.position.count; k++) C.push(c.r, c.g, c.b); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// Ok engeli: binalar/kutular tam, ağaç ve kayaların çarpışma dairesinin yalnız iç yarısı.
// (Ağaç daireleri yürürken yapraklara girilmesin diye geniş; oklar o geniş alana takılırsa ormanda hiç isabet olmuyordu.)
function hitsObstacle(w, x, y, z) {
  const cell = w.grid.get(Math.floor(x / w.CELL) * 10007 + Math.floor(z / w.CELL));
  if (!cell) return false;
  for (const bi of cell.b) {
    const b = w.boxes[bi];
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y > b.y0 && y < b.y1) return true;
  }
  for (const ci of cell.c) {
    const c = w.circles[ci];
    if (y < c.y0 || y > c.y1) continue;
    if (Math.hypot(x - c.x, z - c.z) < Math.max(0.15, c.r * 0.5)) return true;
  }
  return false;
}

// ---------- oklar ----------
// speed m/sn (yavaş: uçuşu gözle izlenebilsin), stuck: saplanan okun kalma süresi (sn)
const ARROW = { speed: 34, gravity: 6, life: 4, stuck: 30, max: 40 };
export class Arrows {
  constructor(scene) {
    this.list = [];
    this.mesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }), ARROW.max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.userData.keep = true;
    scene.add(this.mesh);
    // uçan okun arkasında parlak iz (gece de görünür)
    const tg = new THREE.BoxGeometry(0.09, 0.09, 1).translate(0, 0, -0.5);
    this.trail = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: '#ffb52e', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), ARROW.max);
    this.trail.count = 0; this.trail.frustumCulled = false; this.trail.userData.keep = true;
    scene.add(this.trail);
    // nişangâh (yay seçiliyken)
    const ch = this.cross = document.createElement('div');
    ch.style.cssText = 'position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(255,255,255,.85);border-radius:50%;box-shadow:0 0 4px #000;pointer-events:none;display:none;z-index:5';
    document.body.appendChild(ch);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1); this._d = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  // dir: hedefe giden vektör; compensate: yerçekimi düşüşü kadar yukarı nişan al (hedefe tam varsın)
  shoot(from, dir, compensate = false) {
    if (this.list.length >= ARROW.max) this.list.shift();
    const d = dir.clone();
    if (compensate) { const t = d.length() / ARROW.speed; d.y += 0.5 * ARROW.gravity * t * t; }
    this.list.push({ p: from.clone(), v: d.normalize().multiplyScalar(ARROW.speed), t: 0, stuck: false });
  }
  update(dt, game) {
    const P = game.player;
    this.cross.style.display = P.weapon === 'bow' && !P.vehicle && !P.dead && game.state === 'play' ? 'block' : 'none';
    const W = game.world.wildlife, w = game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t += dt;
      if (a.host) {
        // hayvana saplı: hayvanın modeliyle birlikte hareket eder (devrilince de); hayvan kaybolunca silinir
        // (bölge boşaltılınca hayvan sahneden çıkar: parent yok)
        if (!a.host.obj.visible || !a.host.obj.parent || a.host.respawned !== a.hostGen || a.t > ARROW.stuck) { this.list.splice(i, 1); continue; }
        a.host.obj.updateMatrixWorld();
        a.p.copy(a.lp).applyMatrix4(a.host.obj.matrixWorld);
        a.v.copy(a.ld).transformDirection(a.host.obj.matrixWorld);
        continue;
      }
      if (a.stuck) { if (a.t > ARROW.stuck) this.list.splice(i, 1); continue; }
      if (a.t > ARROW.life) { this.list.splice(i, 1); continue; }
      const p0 = a.p.clone();
      a.v.y -= ARROW.gravity * dt;
      a.p.addScaledVector(a.v, dt);
      // hayvana isabet: ok gövdeye saplanır (uç 0,3 m içeride), hayvanın yerel uzayında saklanır
      const hit = W && W.arrowHit(p0, a.p, game);
      if (hit) {
        const d = a.v.clone().normalize();
        const tip = new THREE.Vector3(hit.x, hit.y, hit.z).addScaledVector(d, 0.3 - 0.5);
        hit.a.obj.updateMatrixWorld();
        const inv = new THREE.Matrix4().copy(hit.a.obj.matrixWorld).invert();
        a.lp = tip.applyMatrix4(inv);
        a.ld = d.clone().transformDirection(inv);
        a.host = hit.a; a.hostGen = hit.a.respawned; a.t = 0;
        a.host.obj.updateMatrixWorld();
        a.p.copy(a.lp).applyMatrix4(a.host.obj.matrixWorld);
        continue;
      }
      // zemine / ağaç gövdesine / binaya saplan
      const gy = w.surfaceHeight(a.p.x, a.p.z, a.p.y);
      if (a.p.y <= gy || hitsObstacle(w, a.p.x, a.p.y, a.p.z)) {
        if (a.p.y < gy) a.p.y = gy + 0.05;
        a.stuck = true; a.t = 0;
      }
    }
    // çizim: ok + (uçarken) arkasında hızla uzayan iz
    let n = 0, nt = 0;
    const ts = new THREE.Vector3();
    for (const a of this.list) {
      this._d.copy(a.v).normalize();
      this._q.setFromUnitVectors(this._z, this._d);
      this.mesh.setMatrixAt(n++, this._m.compose(a.p, this._q, this._s));
      if (!a.stuck && !a.host) {
        ts.set(1, 1, Math.min(4, 0.5 + a.t * 12));
        this.trail.setMatrixAt(nt++, this._m.compose(a.p, this._q, ts));
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
    this.trail.count = nt; this.trail.instanceMatrix.needsUpdate = true;
  }
}

// ---------- silah standı: taşa saplı kılıç + yanına dayalı yay (köprünün ada ucunda) ----------
export function weaponStand(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0).scale(1.2, 0.7, 1), mat('#8e8f94', { r: 0.95 }));
  stone.position.y = 0.2; stone.castShadow = true; stone.receiveShadow = true; g.add(stone);
  const sword = swordMesh(); sword.rotation.x = Math.PI / 2; sword.position.set(0, 1.35, 0); g.add(sword);   // ucu taşın içinde
  const bow = bowMesh(); bow.rotation.set(-Math.PI / 2 + 0.25, 0.4, 0); bow.position.set(0.75, 0.62, 0.1); g.add(bow);
  // yumuşak parıltı halkası
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  glow.position.y = 0.04; g.add(glow);
  g.userData = { sword, bow, glow, keep: true };
  return g;
}
