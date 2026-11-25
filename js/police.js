// Aranma seviyesi, polis arabaları, yaya polisler, barikatlar ve helikopter
import * as THREE from 'three';
import { clamp, damp, wrapAngle, pick } from './util.js';
import { Driver, Ped, nearestNode, shortestPath } from './traffic.js';
import { textDecal } from './textures.js';

const THRESH = [1, 6, 14, 26, 42];
const CARS_FOR = [1, 2, 3, 4, 5, 6];
const COP_LOOK = { skin: '#d9a27c', shirt: '#2b4a8a', pants: '#1a2236', hair: '#1b1209', shoes: '#111', hat: true, capColor: '#1a2236', female: false };

class CopDriver extends Driver {
  constructor(game, v, from, to) {
    super(game, v, from, to, { cruiseMul: 1 });
    this.isCop = true; this.path = null; this.repath = 0; this.deployed = false;
  }
  pickNext() {
    if (this.path) {
      const i = this.path.indexOf(this.to);
      if (i >= 0 && i + 1 < this.path.length) return this.path[i + 1];
    }
    return super.pickNext();
  }
  update(dt) {
    const g = this.game, v = this.v, police = g.police, P = g.player;
    if (v.wrecked || v.inWater) { v.controls.throttle = 0; v.controls.brake = 0; v.controls.handbrake = true; v.siren = false; return; }
    v.siren = police.level > 0;
    if (police.level === 0) { this.ignoreLights = false; this.cruiseMul = 1; this.path = null; return super.update(dt); }
    this.ignoreLights = true;
    const target = police.seen ? P.pos : police.lastKnown;
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    const sees = police.seen && dist < 60 && !g.world.lineBlocked(v.pos.x, v.pos.y + 1.2, v.pos.z, P.pos.x, P.pos.y + 1, P.pos.z);
    if (sees || (dist < 20 && !police.seen)) {
      let tx = target.x, tz = target.z;
      if (P.vehicle && police.seen) {
        const k = clamp(dist / 22, 0, 1.1);
        tx += P.vehicle.vx * k; tz += P.vehicle.vz * k;
      }
      let desired = 70;
      if (!P.vehicle) {
        desired = clamp((dist - 9) * 1.2, 0, 30);
        if (dist < 16 && v.speed < 3 && !this.deployed) { this.deployed = true; police.deployOfficers(v); }
      } else if (dist < 12) desired = 70;
      if (!police.seen && dist < 20) desired = 6;
      this.drive(dt, tx, tz, desired);
      return;
    }
    // yol ağı üzerinden takip
    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 2;
      const goal = nearestNode(g.world, target.x, target.z);
      this.path = shortestPath(g.world, this.to, goal.id);
      if (this.path.length > 1) this.next = this.path[1];
    }
    this.cruiseMul = 1.9;
    const r = this.route(dt);
    const ob = this.obstacleLimit(r.desired);
    const desired = Math.max(Math.min(r.desired, ob.desired + 3), ob.minGap < 4 ? 0 : 3);
    this.drive(dt, r.tx, r.tz, desired);
  }
}

function buildHeli() {
  const g = new THREE.Group();
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.4, ...o });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), m('#1b2a4a')); body.scale.set(1, 0.9, 1.7); g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m('#0b1220', { metalness: 0.9, roughness: 0.1 }));
  glass.position.set(0, 0.2, 1.3); glass.rotation.x = Math.PI / 2.4; g.add(glass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.35, 3.2), m('#f2f2f2')); stripe.position.y = -0.3; g.add(stripe);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 5.5), m('#1b2a4a')); tail.position.set(0, 0.3, -4.2); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.8), m('#1b2a4a')); fin.position.set(0, 0.9, -6.7); g.add(fin);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), m('#333')); skid.position.set(s * 1.1, -1.55, 0.2); g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), m('#333')); strut.position.set(s * 1.1, -1.25, 0.6); g.add(strut);
  }
  const rotor = new THREE.Group(); rotor.position.y = 1.55;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.35), m('#222'));
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
  rotor.add(blade, blade2); g.add(rotor);
  const trot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.18), m('#222')); trot.position.set(0.25, 0.9, -6.9); g.add(trot);
  const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: textDecal('POLİS', '#ffffff', 'rgba(0,0,0,0)', 256, 64), transparent: true }));
  for (const s of [-1, 1]) { const d = dec.clone(); d.position.set(s * 1.52, 0.1, -0.4); d.rotation.y = s * Math.PI / 2; g.add(d); }
  const red = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false });
  const blue = new THREE.MeshBasicMaterial({ color: '#2040ff', toneMapped: false });
  const lr = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), red); lr.position.set(-0.5, -1.2, 1); g.add(lr);
  const lb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), blue); lb.position.set(0.5, -1.2, 1); g.add(lb);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, rotor, trot, red, blue };
}

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0; this.level = 0;
    this.seen = false; this.unseenT = 0; this.lastKnown = new THREE.Vector3();
    this.spawnT = 0; this.roadblockT = 10; this.roadblocks = [];
    this.bustT = 0; this.losT = 0;
    this.heli = null;
    this.flash = 0;
    // helikopter projektörü
    this.spot = new THREE.SpotLight('#e8f0ff', 0, 160, 0.22, 0.5, 1.5);
    this.spot.castShadow = false;
    game.scene.add(this.spot, this.spot.target);
    const cone = new THREE.ConeGeometry(9, 48, 20, 1, true); cone.translate(0, -24, 0);
    this.coneMat = new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.cone = new THREE.Mesh(cone, this.coneMat); this.cone.visible = false;
    game.scene.add(this.cone);
  }
  get units() { return this.game.vehicles.filter((v) => v.ai && v.ai.isCop); }
  get cops() { return this.game.peds.filter((p) => p.role === 'cop'); }
  evadeTime() { return 7 + this.level * 2.5; }
  levelFor(h) { let l = 0; for (let i = 0; i < 5; i++) if (h >= THRESH[i]) l = i + 1; return l; }

  setLevel(n, silent) {
    n = clamp(n, 0, 5);
    if (n === 0) { this.clear(); return; }
    const up = n > this.level;
    this.level = n;
    this.heat = Math.max(this.heat, THRESH[n - 1]);
    this.seen = true; this.unseenT = 0;
    this.lastKnown.copy(this.game.player.pos);
    if (up && !silent) { this.flash = 2; this.game.hud?.flashStars(); this.spawnT = 0; }
  }
  clear() {
    const was = this.level;
    this.level = 0; this.heat = 0; this.seen = false; this.unseenT = 0; this.bustT = 0;
    for (const rb of this.roadblocks) for (const v of rb.vehicles) v.roadblock = false;
    this.roadblocks = [];
    if (was > 0) this.game.onWantedCleared?.(was);
  }
  copsNear(x, z, r) {
    for (const v of this.units) if (!v.wrecked && Math.hypot(v.pos.x - x, v.pos.z - z) < r) return true;
    for (const c of this.cops) if (c.state !== 'dead' && Math.hypot(c.pos.x - x, c.pos.z - z) < r) return true;
    return false;
  }
  // suç bildirimi
  crime(type, x, z) {
    const add = { assault: 1, carjack: 1, kill: 4, copHit: 5, copKill: 9, explode: 3, ram: 2, cophurt: 3 }[type] || 1;
    const g = this.game;
    const copSaw = this.copsNear(x, z, 50);
    let reported = copSaw || type === 'kill' || type === 'copKill' || type === 'copHit' || type === 'explode' || type === 'cophurt';
    if (!reported && (type === 'assault' || type === 'carjack' || type === 'ram')) reported = g.traffic.witnesses(x, z, 30) > 0 && Math.random() < 0.6;
    if (!reported && this.level === 0) return;
    this.heat = Math.min(60, this.heat + add * (this.level === 0 && !copSaw && type !== 'kill' ? 1 : 1.3));
    const nl = Math.max(this.levelFor(this.heat), this.level || 1);
    if (nl !== this.level) this.setLevel(nl);
    else if (copSaw) { this.seen = true; this.unseenT = 0; this.lastKnown.set(x, g.player.pos.y, z); }
  }

  canSee(px, py, pz) {
    const g = this.game, P = g.player.pos;
    const d = Math.hypot(px - P.x, pz - P.z);
    if (d > 70) return false;
    return !g.world.lineBlocked(px, py, pz, P.x, P.y + 1.0, P.z);
  }

  spawnUnit() {
    const g = this.game, w = g.world, P = this.seen ? g.player.pos : this.lastKnown;
    for (let tries = 0; tries < 16; tries++) {
      const e = pick(w.edges);
      const A = w.nodes[e.a], B = w.nodes[e.b];
      const dA = Math.hypot(A.x - P.x, A.z - P.z), dB = Math.hypot(B.x - P.x, B.z - P.z);
      const from = dA > dB ? A : B, to = dA > dB ? B : A;
      const mid = (dA + dB) / 2;
      if (mid < 85 || mid > 200) continue;
      let dx = to.x - from.x, dz = to.z - from.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const t = 0.3 + Math.random() * 0.3;
      const off = e.hw >= 10 ? 2.6 : 2.0;
      const x = from.x + dx * L * t - dz * off, z = from.z + dz * L * t + dx * off;
      if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 70) continue;
      if (g.vehicles.some((v) => Math.abs(v.pos.x - x) < 10 && Math.abs(v.pos.z - z) < 10)) continue;
      const v = g.addVehicle('police', { x, y: w.surfaceHeight(x, z, 50), z, heading: Math.atan2(dx, dz) });
      v.vx = dx * 12; v.vz = dz * 12;
      v.ai = new CopDriver(g, v, from.id, to.id);
      v.driver = 'ai'; v.controls.handbrake = false;
      return v;
    }
    return null;
  }
  deployOfficers(v) {
    const g = this.game;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
    for (const s of [-1, 1]) {
      const x = v.pos.x + rx * s * 1.6, z = v.pos.z + rz * s * 1.6;
      const c = new Ped(g, x, z, { look: COP_LOOK, role: 'cop', state: 'cop', heading: v.heading, health: 120 });
      c.car = v; c.fireT = 1 + Math.random();
      g.peds.push(c);
    }
    v.driver = null; v.ai = null; v.siren = true; v.controls = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    v.copCar = true;
  }
  // yaya polis davranışı (Ped.update çağırır) → hareket hızı döner
  copBrain(c, dt) {
    const g = this.game, P = g.player, w = g.world;
    const prev = { x: c.pos.x, z: c.pos.z };
    const tgt = P.pos;
    let dx = tgt.x - c.pos.x, dz = tgt.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    let speed = 0;
    c.anim = 'idle';
    const goCar = this.level === 0 || (P.vehicle && dist > 24);
    if (goCar) {
      const car = c.car;
      if (car && !car.wrecked && !car.driver && g.vehicles.includes(car)) {
        const cx = car.pos.x - c.pos.x, cz = car.pos.z - c.pos.z, cd = Math.hypot(cx, cz);
        if (cd < 2.6) {
          // arabaya bin
          if (!car.ai) {
            const ne = nearestNode(w, car.pos.x, car.pos.z);
            const nb = w.nodes[pick(ne.adj).to];
            car.ai = new CopDriver(g, car, ne.id, nb.id); car.ai.deployed = this.level > 0; car.driver = 'ai';
          }
          c.remove = true;
          return 0;
        }
        c.heading = Math.atan2(cx, cz); speed = 5.5; c.anim = 'run';
      } else if (this.level === 0) {
        c.heading += Math.sin(g.time + c.id) * dt; speed = 1.3; c.anim = 'walk';
        c.persistent = false;
      } else { c.heading = Math.atan2(dx, dz); speed = 5.8; c.anim = 'run'; }
    } else {
      const los = dist < 40 && !w.lineBlocked(c.pos.x, c.pos.y + 1.5, c.pos.z, tgt.x, tgt.y + 1, tgt.z);
      c.heading = c.heading + wrapAngle(Math.atan2(dx, dz) - c.heading) * Math.min(1, dt * 8);
      const shooter = this.level >= 2 && los && dist < 30;
      if (shooter && dist > 4) {
        c.anim = 'shoot';
        c.fireT -= dt;
        if (c.fireT <= 0) { c.fireT = 1.3 + Math.random() * 1.2; this.shoot(c.pos.x + Math.sin(c.heading) * 0.5, c.pos.y + 1.4, c.pos.z + Math.cos(c.heading) * 0.5, dist); }
        if (dist > 14) { speed = 2.2; c.anim = 'shoot'; }
      } else if (dist > 1.3) { speed = dist > 6 ? 6 : 3.5; c.anim = 'run'; }
      else { c.anim = 'hands'; }
    }
    c.pos.x += Math.sin(c.heading) * speed * dt; c.pos.z += Math.cos(c.heading) * speed * dt;
    void prev;
    return speed;
  }
  shoot(x, y, z, dist, fromHeli) {
    const g = this.game, P = g.player;
    const veh = P.vehicle;
    const moving = veh ? veh.speed : P.speedNow || 0;
    let chance = clamp(0.42 - dist * 0.011 - moving * 0.014, 0.06, 0.45);
    if (fromHeli) chance *= 0.8;
    const hit = Math.random() < chance;
    const tx = P.pos.x + (hit ? 0 : (Math.random() - 0.5) * 4), ty = P.pos.y + 1.1 + (hit ? 0 : Math.random() * 2), tz = P.pos.z + (hit ? 0 : (Math.random() - 0.5) * 4);
    g.effects.muzzle(x, y, z, tx, ty, tz);
    g.audio?.gunshot({ x, y, z });
    if (hit) {
      if (veh) { veh.damage(18, g); if (Math.random() < 0.12) P.damage(3, 'shot'); }
      else P.damage(fromHeli ? 7 : 5, 'shot');
    } else g.effects.sparks(tx, Math.max(ty - 1, P.pos.y + 0.1), tz, 3);
    g.traffic.alarm(x, z, 30);
  }

  spawnRoadblock() {
    const g = this.game, w = g.world, P = g.player;
    const veh = P.vehicle;
    let fx = 0, fz = 0;
    if (veh && veh.speed > 3) { fx = veh.vx / veh.speed; fz = veh.vz / veh.speed; }
    else return;
    const cands = w.nodes.filter((n) => {
      if (!n.light) return false;
      const dx = n.x - P.pos.x, dz = n.z - P.pos.z, d = Math.hypot(dx, dz);
      return d > 110 && d < 220 && (dx * fx + dz * fz) / d > 0.8;
    });
    if (!cands.length) return;
    const n = pick(cands);
    // oyuncu tarafındaki yaklaşma kenarı
    let best = null, bd = -2;
    for (const a of n.adj) {
      const m = w.nodes[a.to];
      const dx = m.x - n.x, dz = m.z - n.z, L = Math.hypot(dx, dz);
      const dot = (dx * -fx + dz * -fz) / L;
      if (dot > bd) { bd = dot; best = { m, dx: dx / L, dz: dz / L, hw: a.hw }; }
    }
    if (!best) return;
    const cx = n.x + best.dx * 22, cz = n.z + best.dz * 22;
    const rx = -best.dz, rz = best.dx;
    const rb = { vehicles: [], t: 70, x: cx, z: cz };
    for (const s of [-1, 1]) {
      const x = cx + rx * s * (best.hw * 0.45), z = cz + rz * s * (best.hw * 0.45);
      const v = g.addVehicle('police', { x, y: w.surfaceHeight(x, z, 50), z, heading: Math.atan2(rx, rz) + (s > 0 ? 0.25 : -0.25) });
      v.siren = true; v.roadblock = true; v.copCar = true;
      rb.vehicles.push(v);
      const c = new Ped(g, x + best.dx * 4, z + best.dz * 4, { look: COP_LOOK, role: 'cop', state: 'cop', health: 120 });
      c.car = v; c.fireT = 1.5; g.peds.push(c);
    }
    this.roadblocks.push(rb);
    g.hud?.notify('Önünde polis barikatı var!');
  }

  updateHeli(dt) {
    const g = this.game, P = g.player;
    const want = this.level >= 4;
    if (want && !this.heli) {
      const h = buildHeli();
      const a = Math.random() * Math.PI * 2;
      h.pos = new THREE.Vector3(P.pos.x + Math.cos(a) * 180, 55, P.pos.z + Math.sin(a) * 180);
      h.vel = new THREE.Vector3(); h.fireT = 3; h.heading = 0; h.leaving = false;
      g.scene.add(h.g);
      this.heli = h;
    }
    const h = this.heli;
    if (!h) return;
    if (!want) h.leaving = true;
    const tgt = new THREE.Vector3();
    if (h.leaving) tgt.set(h.pos.x + (h.pos.x - P.pos.x), 80, h.pos.z + (h.pos.z - P.pos.z));
    else {
      const base = this.seen ? P.pos : this.lastKnown;
      const a = g.time * 0.35;
      tgt.set(base.x + Math.cos(a) * 22, Math.max(g.world.surfaceHeight(base.x, base.z) + 38, 40), base.z + Math.sin(a) * 22);
    }
    const dx = tgt.x - h.pos.x, dy = tgt.y - h.pos.y, dz = tgt.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    const maxV = 32;
    const desV = new THREE.Vector3(dx, 0, dz).multiplyScalar(Math.min(maxV, d * 0.8) / (d || 1));
    desV.y = dy * 0.8;
    h.vel.x = damp(h.vel.x, desV.x, 1.2, dt); h.vel.z = damp(h.vel.z, desV.z, 1.2, dt); h.vel.y = damp(h.vel.y, desV.y, 1.5, dt);
    h.pos.addScaledVector(h.vel, dt);
    const faceX = P.pos.x - h.pos.x, faceZ = P.pos.z - h.pos.z;
    h.heading = h.heading + wrapAngle(Math.atan2(faceX, faceZ) - h.heading) * Math.min(1, dt * 1.5);
    h.g.position.copy(h.pos);
    h.g.rotation.set(clamp(h.vel.length() * 0.008, 0, 0.25), h.heading, 0);
    h.rotor.rotation.y += dt * 30; h.trot.rotation.x += dt * 40;
    const ph = Math.floor(g.time * 4) % 2;
    h.red.color.setRGB(ph ? 5 : 0.2, 0.05, 0.05); h.blue.color.setRGB(0.05, 0.1, ph ? 0.2 : 5);
    // projektör
    const night = g.env.night;
    const hd = Math.hypot(P.pos.x - h.pos.x, P.pos.z - h.pos.z);
    if (!h.leaving && night > 0.2 && hd < 120) {
      this.spot.intensity = 1600 * night;
      this.spot.position.copy(h.pos).add(new THREE.Vector3(0, -1.6, 0));
      const aim = this.seen ? P.pos : this.lastKnown;
      this.spot.target.position.set(aim.x, aim.y, aim.z);
      this.cone.visible = true;
      this.cone.position.copy(this.spot.position);
      const dir = new THREE.Vector3().subVectors(this.spot.target.position, this.spot.position);
      const len = dir.length();
      this.cone.scale.set(len / 48 * 0.9, len / 48, len / 48 * 0.9);
      this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      this.coneMat.opacity = 0.09 * night;
    } else { this.spot.intensity = 0; this.cone.visible = false; }
    // ateş
    if (!h.leaving && this.level >= 5 && this.seen && hd < 70) {
      h.fireT -= dt;
      if (h.fireT <= 0) { h.fireT = 1.1 + Math.random(); this.shoot(h.pos.x, h.pos.y - 1.5, h.pos.z, hd, true); }
    }
    g.audio?.heli(h.pos);
    if (h.leaving && hd > 260) { g.scene.remove(h.g); this.heli = null; this.spot.intensity = 0; this.cone.visible = false; g.audio?.heli(null); }
  }

  update(dt) {
    const g = this.game, P = g.player;
    this.flash = Math.max(0, this.flash - dt);
    // görüş kontrolü
    this.losT -= dt;
    if (this.level > 0 && this.losT <= 0) {
      this.losT = 0.25;
      let saw = false;
      for (const v of this.units) if (!v.wrecked && this.canSee(v.pos.x, v.pos.y + 1.4, v.pos.z)) { saw = true; break; }
      if (!saw) for (const c of this.cops) if (c.state !== 'dead' && c.state !== 'down' && this.canSee(c.pos.x, c.pos.y + 1.6, c.pos.z)) { saw = true; break; }
      if (!saw) for (const rb of this.roadblocks) for (const v of rb.vehicles) if (!v.wrecked && this.canSee(v.pos.x, v.pos.y + 1.4, v.pos.z)) { saw = true; break; }
      if (!saw && this.heli && !this.heli.leaving) {
        const hd = Math.hypot(this.heli.pos.x - P.pos.x, this.heli.pos.z - P.pos.z);
        if (hd < 130 && !g.world.lineBlocked(this.heli.pos.x, this.heli.pos.y, this.heli.pos.z, P.pos.x, P.pos.y + 1, P.pos.z, 3)) saw = true;
      }
      this.seen = saw;
      if (saw) { this.lastKnown.copy(P.pos); }
    }
    if (this.level > 0) {
      if (this.seen) {
        this.unseenT = 0;
        // uzun kovalamaca ısınır
        if (P.vehicle && P.vehicle.speed > 18) this.heat = Math.min(60, this.heat + dt * 0.12);
        const nl = this.levelFor(this.heat);
        if (nl > this.level) this.setLevel(nl);
      } else {
        this.unseenT += dt;
        if (this.unseenT > this.evadeTime()) { this.clear(); }
      }
    }
    // birim sayısı
    this.spawnT -= dt;
    const units = this.units.filter((v) => !v.wrecked);
    const want = this.level > 0 ? CARS_FOR[this.level] : (g.quality === 'low' ? 0 : 1);
    if (this.spawnT <= 0) {
      this.spawnT = this.level > 0 ? 2.5 : 8;
      if (units.length < want) this.spawnUnit();
    }
    // fazla / uzak birimleri kaldır
    for (const v of this.game.vehicles.slice()) {
      if (!(v.ai && v.ai.isCop) && !v.copCar) continue;
      if (v.roadblock) continue;
      const d = Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z);
      if (v.driver !== 'player' && (d > 260 || (this.level === 0 && d > 160 && !g.traffic.visibleFrom(v.pos.x, v.pos.z)))) g.removeVehicle(v);
    }
    // barikat
    if (this.level >= 3) {
      this.roadblockT -= dt;
      if (this.roadblockT <= 0) { this.roadblockT = 22; if (this.roadblocks.length < 1) this.spawnRoadblock(); }
    }
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.t -= dt;
      const d = Math.hypot(rb.x - P.pos.x, rb.z - P.pos.z);
      if (rb.t <= 0 || d > 300) {
        for (const v of rb.vehicles) { v.roadblock = false; if (v.driver !== 'player' && d > 120) g.removeVehicle(v); }
        this.roadblocks.splice(i, 1);
      }
    }
    // yaya polis temizliği
    for (let i = g.peds.length - 1; i >= 0; i--) {
      const c = g.peds[i];
      if (c.role !== 'cop') continue;
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (c.remove || d > 200 || (this.level === 0 && d > 90 && !g.traffic.visibleFrom(c.pos.x, c.pos.z))) { c.dispose(); g.peds.splice(i, 1); }
    }
    // tutuklama
    if (this.level > 0 && !g.player.dead) {
      let pressure = false;
      if (!P.vehicle) {
        for (const c of this.cops) if (c.state === 'cop' && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 1.7) { pressure = true; break; }
        if (pressure && (P.speedNow || 0) > 5) pressure = false;
        this.bustT = pressure ? this.bustT + dt : Math.max(0, this.bustT - dt * 0.5);
        if (this.bustT > 1.4) g.busted();
      } else {
        if (P.vehicle.speed < 1.2) for (const v of this.units.concat(this.cops)) if (Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z) < 7) { pressure = true; break; }
        this.bustT = pressure ? this.bustT + dt * 0.4 : Math.max(0, this.bustT - dt);
        if (this.bustT > 1.4) g.busted();
      }
    } else this.bustT = 0;
    this.updateHeli(dt);
  }
}
