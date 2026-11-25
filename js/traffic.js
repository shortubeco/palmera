// Trafik ışıkları, yapay zekalı sürücüler, park etmiş araçlar ve yayalar
import * as THREE from 'three';
import { clamp, damp, wrapAngle, pick } from './util.js';
import { Vehicle } from './vehicles.js';
import { buildHumanoid, animate, randomLook } from './humanoid.js';
import { WATER_Y } from './world.js';

// ---------- yol ağı yardımcıları ----------
export function nearestNode(world, x, z, filter) {
  let best = null, bd = Infinity;
  for (const n of world.nodes) {
    if (filter && !filter(n)) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
export function shortestPath(world, fromId, toId) {
  const N = world.nodes.length;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[fromId] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === toId) break;
    done[u] = 1;
    const nu = world.nodes[u];
    for (const a of nu.adj) {
      const nv = world.nodes[a.to];
      const w = Math.hypot(nv.x - nu.x, nv.z - nu.z) / (a.hw >= 10 ? 1.6 : 1);
      if (dist[u] + w < dist[a.to]) { dist[a.to] = dist[u] + w; prev[a.to] = u; }
    }
  }
  const path = [];
  for (let v = toId; v !== -1; v = prev[v]) { path.unshift(v); if (v === fromId) break; }
  return path[0] === fromId ? path : [fromId];
}
// noktaya en yakın kenar ve yön
export function nearestEdge(world, x, z, hx, hz) {
  let best = null, bd = Infinity;
  for (const e of world.edges) {
    const A = world.nodes[e.a], B = world.nodes[e.b];
    const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / L2, 0, 1);
    const px = A.x + dx * t, pz = A.z + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = { e, t, fwd: (dx * hx + dz * hz) >= 0 }; }
  }
  if (!best) return null;
  return best.fwd ? { from: best.e.a, to: best.e.b, hw: best.e.hw } : { from: best.e.b, to: best.e.a, hw: best.e.hw };
}

// ---------- sürücü ----------
export class Driver {
  constructor(game, v, from, to, opts = {}) {
    this.game = game; this.v = v; this.from = from; this.to = to;
    this.lane = opts.lane ?? null;
    this.next = this.pickNext();
    this.stage = 0; this.stuck = 0; this.reverseT = 0; this.angry = 0; this.blockedT = 0;
    this.ignoreLights = !!opts.ignoreLights;
    this.cruiseMul = opts.cruiseMul || (0.85 + Math.random() * 0.3);
    this.lostCheck = 0;
  }
  edgeHw(a, b) { const n = this.game.world.nodes[a]; const e = n.adj.find((q) => q.to === b); return e ? e.hw : 7; }
  laneOff(hw) { return hw >= 10 ? (this.lane === 1 ? 7.4 : 2.6) : 2.0; }
  pickNext() {
    const nodes = this.game.world.nodes;
    const B = nodes[this.to], A = nodes[this.from];
    const opts = B.adj.filter((a) => a.to !== this.from);
    if (!opts.length) return this.from;
    const dx = B.x - A.x, dz = B.z - A.z;
    const straight = opts.find((a) => { const C = nodes[a.to]; return Math.abs((C.x - B.x) * dz - (C.z - B.z) * dx) < 1 && ((C.x - B.x) * dx + (C.z - B.z) * dz) > 0; });
    if (straight && Math.random() < 0.55) return straight.to;
    return pick(opts).to;
  }
  advance() {
    this.from = this.to; this.to = this.next; this.next = this.pickNext(); this.stage = 0;
  }
  relocate() {
    const v = this.v;
    const r = nearestEdge(this.game.world, v.pos.x, v.pos.z, Math.sin(v.heading), Math.cos(v.heading));
    if (r) { this.from = r.from; this.to = r.to; this.next = this.pickNext(); this.stage = 0; }
  }
  // hedef noktası + istenen hız
  route(dt) {
    const g = this.game, nodes = g.world.nodes, v = this.v;
    const A = nodes[this.from], B = nodes[this.to];
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const rx = -dz, rz = dx;
    const hw = this.edgeHw(this.from, this.to);
    const off = this.laneOff(hw);
    const relx = v.pos.x - A.x, relz = v.pos.z - A.z;
    const along = relx * dx + relz * dz;
    const lat = relx * rx + relz * rz;
    const stopDist = (dx !== 0 ? B.hwx : B.hwz) + 5;
    const exitAlong = L - stopDist;
    const spd = Math.max(0, v.forwardSpeed);
    let cruise = (hw >= 10 ? 25 : 13.5) * this.cruiseMul;
    if (this.angry > 0) cruise *= 1.6;
    let desired = cruise, tx, tz;
    // kaybolma kontrolü
    this.lostCheck -= dt;
    if (this.lostCheck <= 0) {
      this.lostCheck = 1;
      if (Math.abs(lat - off) > 12 || along < -15 || along > L + 25) { this.relocate(); return this.route(0); }
    }
    const C = nodes[this.next];
    let d2x = C.x - B.x, d2z = C.z - B.z; const L2 = Math.hypot(d2x, d2z) || 1; d2x /= L2; d2z /= L2;
    const turning = Math.abs(d2x - dx) + Math.abs(d2z - dz) > 0.5;
    if (this.stage === 0) {
      const la = Math.min(along + 6 + spd * 0.35, exitAlong + 5);
      tx = A.x + dx * la + rx * off; tz = A.z + dz * la + rz * off;
      const remain = exitAlong - along;
      const redAhead = B.light && !this.ignoreLights && this.angry <= 0 && g.traffic.phase[dx !== 0 ? 'EW' : 'NS'] === 'R';
      if (along > exitAlong - 0.5 && !(redAhead && remain > -3)) this.stage = 1;
      if (turning && remain < 30) desired = Math.min(desired, 7.5 + Math.max(0, remain) * 0.35);
      // ışık
      if (B.light && !this.ignoreLights && this.angry <= 0) {
        const ph = g.traffic.phase[dx !== 0 ? 'EW' : 'NS'];
        if (ph !== 'G' && remain > -0.5) {
          const canGo = ph === 'Y' && remain < spd * 0.8;
          if (!canGo) desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 5 * (remain - 0.3))));
        }
      }
    } else {
      const hw2 = this.edgeHw(this.to, this.next), off2 = this.laneOff(hw2);
      const r2x = -d2z, r2z = d2x;
      const proj2 = (v.pos.x - B.x) * d2x + (v.pos.z - B.z) * d2z;
      const t = Math.max(proj2 + 5 + spd * 0.25, turning ? 2 : 6);
      tx = B.x + r2x * off2 + d2x * t; tz = B.z + r2z * off2 + d2z * t;
      const entryDist = (d2x !== 0 ? B.hwx : B.hwz) + 3;
      if (turning) desired = Math.min(desired, 8);
      if (proj2 > entryDist) this.advance();
    }
    return { tx, tz, desired };
  }
  obstacleLimit(desired) {
    const g = this.game, v = this.v;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
    let minGap = Infinity, blockedByPlayer = false, blockedByAI = false;
    const look = 8 + Math.max(0, v.forwardSpeed) * 1.4;
    // latExt: engelin bizim sağ eksenimizdeki yarı genişliği, lonExt: ileri eksendeki yarı uzunluğu
    const check = (x, z, latExt, lonExt, kind) => {
      const ox = x - v.pos.x, oz = z - v.pos.z;
      const f = ox * fx + oz * fz;
      if (f <= 0 || f > look + lonExt) return;
      const l = Math.abs(ox * rx + oz * rz);
      if (l > v.cfg.wid / 2 + latExt + 0.4) return;
      const gap = f - v.cfg.len / 2 - lonExt;
      if (gap < minGap) { minGap = gap; blockedByPlayer = kind === 'player'; blockedByAI = kind === 'ai'; }
    };
    const patient = this.patienceT > 0; // uzun süre kilitlendiyse diğer AI'lara aldırmadan yavaşça geç
    for (const o of g.vehicles) {
      if (o === v) continue;
      if (Math.abs(o.pos.x - v.pos.x) > 40 || Math.abs(o.pos.z - v.pos.z) > 40) continue;
      const cosd = Math.cos(o.heading - v.heading), sind = Math.abs(Math.sin(o.heading - v.heading));
      const isAI = o.ai && o.driver === 'ai' && !o.wrecked;
      if (isAI) {
        if (patient) continue;
        // karşıdan gelen / kesişen AI: yalnızca çok yakınsa ve öncelik onda ise bekle (kilitlenmeyi önler)
        if (cosd < 0.3) {
          const d = Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z);
          if (d > (v.cfg.len + o.cfg.len) / 2 + 3 || v.id < o.id) continue;
        }
      }
      const latExt = sind * o.cfg.len / 2 + Math.abs(cosd) * o.cfg.wid / 2;
      const lonExt = Math.abs(cosd) * o.cfg.len / 2 + sind * o.cfg.wid / 2;
      check(o.pos.x, o.pos.z, latExt, lonExt, o.driver === 'player' ? 'player' : isAI ? 'ai' : 'other');
    }
    for (const p of g.peds) {
      if (p.state === 'dead' || Math.abs(p.pos.x - v.pos.x) > 25 || Math.abs(p.pos.z - v.pos.z) > 25) continue;
      check(p.pos.x, p.pos.z, 0.4, 0.4, 'ped');
    }
    if (!g.player.vehicle) check(g.player.pos.x, g.player.pos.z, 0.4, 0.4, 'player');
    if (minGap < Infinity) desired = Math.min(desired, Math.max(patient ? 2.5 : 0, (minGap - 2.2) * 0.9));
    return { desired, blockedByPlayer, blockedByAI, minGap };
  }
  update(dt) {
    const v = this.v, c = v.controls;
    if (v.wrecked || v.inWater) { c.throttle = 0; c.brake = 0; c.handbrake = true; return; }
    this.angry = Math.max(0, this.angry - dt);
    this.patienceT = Math.max(0, (this.patienceT || 0) - dt);
    const r = this.route(dt);
    let { tx, tz, desired } = r;
    const ob = this.obstacleLimit(desired);
    // başka bir AI yüzünden uzun süre (ışık değil) beklediyse sabrı tükenir, yavaşça devam eder
    if (ob.blockedByAI && ob.desired < 0.5 && desired > 2) {
      this.waitT = (this.waitT || 0) + dt;
      if (this.waitT > 5) { this.patienceT = 3; this.waitT = 0; }
    } else this.waitT = 0;
    desired = ob.desired;
    if (ob.blockedByPlayer && desired < 1 && v.speed < 1) {
      this.blockedT += dt;
      if (this.blockedT > 2.5 && Math.random() < dt * 0.8) this.game.audio?.horn(v.pos, 0.35);
    } else this.blockedT = 0;
    this.drive(dt, tx, tz, desired);
  }  drive(dt, tx, tz, desired) {
    const v = this.v, c = v.controls;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
    const ox = tx - v.pos.x, oz = tz - v.pos.z;
    const ang = Math.atan2(ox * rx + oz * rz, ox * fx + oz * fz);
    const vF = v.forwardSpeed;
    // sıkışma
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      c.throttle = 0; c.brake = 1; c.steer = -Math.sign(ang || 1); c.handbrake = false;
      return;
    }
    if (desired > 2 && Math.abs(vF) < 0.6) { this.stuck += dt; if (this.stuck > 2.5) { this.stuck = 0; this.reverseT = 1.4; } }
    else this.stuck = Math.max(0, this.stuck - dt);
    c.steer = clamp(ang * 2.2, -1, 1);
    if (Math.abs(ang) > 1.6 && vF < 4) { c.steer = Math.sign(ang); }
    const err = desired - vF;
    c.throttle = clamp(err * 0.45, 0, 1);
    c.brake = clamp(-err * 0.35, 0, 1);
    c.handbrake = desired < 0.3 && Math.abs(vF) < 0.8;
  }
}

// ---------- yaya ----------
let PID = 1;
export class Ped {
  constructor(game, x, z, opts = {}) {
    this.id = PID++;
    this.game = game;
    this.look = opts.look || randomLook();
    this.h = buildHumanoid(this.look);
    this.mesh = this.h.root;
    this.pos = new THREE.Vector3(x, game.world.surfaceHeight(x, z), z);
    this.heading = opts.heading ?? Math.random() * 6.28;
    this.state = opts.state || 'walk';
    this.role = opts.role || 'civ';
    this.health = opts.health || 100;
    this.path = opts.path || null; this.s = opts.s || 0; this.dir = Math.random() < 0.5 ? 1 : -1;
    this.speed = 1.1 + Math.random() * 0.5;
    this.timer = 0; this.vel = new THREE.Vector3(); this.idleT = 0;
    this.fleeFrom = null;
    this.anim = 'walk';
    this.persistent = !!opts.persistent;
    game.scene.add(this.mesh);
  }
  pathPoint(s) {
    const p = this.path;
    if (p.type === 'line') {
      const L = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
      const t = clamp(s / L, 0, 1);
      return [p.x0 + (p.x1 - p.x0) * t, p.z0 + (p.z1 - p.z0) * t, Math.atan2(p.x1 - p.x0, p.z1 - p.z0)];
    }
    const w = p.x1 - p.x0, d = p.z1 - p.z0, P = 2 * (w + d);
    s = ((s % P) + P) % P;
    if (s < w) return [p.x0 + s, p.z0, Math.PI / 2];
    s -= w; if (s < d) return [p.x1, p.z0 + s, 0];
    s -= d; if (s < w) return [p.x1 - s, p.z1, -Math.PI / 2];
    s -= w; return [p.x0, p.z1 - s, Math.PI];
  }
  pathLength() { const p = this.path; return p.type === 'line' ? Math.hypot(p.x1 - p.x0, p.z1 - p.z0) : 2 * (p.x1 - p.x0 + p.z1 - p.z0); }
  scare(x, z, t = 8) {
    if (this.state === 'dead' || this.state === 'down' || this.role === 'cop') return;
    this.state = 'flee'; this.fleeFrom = { x, z }; this.timer = t + Math.random() * 3;
    if (Math.random() < 0.3) this.game.audio?.scream(this.pos);
  }
  hit(vx, vz, power, byPlayer) {
    if (this.state === 'dead') return;
    const sp = Math.hypot(vx, vz);
    this.health -= power;
    this.vel.set(vx * 0.8, 3 + sp * 0.25, vz * 0.8);
    this.state = 'down'; this.timer = 2.5 + Math.random();
    this.heading = Math.atan2(-vx, -vz);
    this.game.effects.blood(this.pos.x, this.pos.y + 1, this.pos.z);
    if (this.health <= 0) {
      this.health = 0; this.dead = true;
      this.game.onPedKilled?.(this, byPlayer);
    } else this.game.onPedHurt?.(this, byPlayer);
    this.game.traffic.alarm(this.pos.x, this.pos.z, 25);
  }
  update(dt) {
    const g = this.game, w = g.world;
    let moveSpeed = 0;
    const prevX = this.pos.x, prevZ = this.pos.z;
    if (this.state === 'down' || this.state === 'dead') {
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gh = w.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (this.pos.y <= gh) { this.pos.y = gh; this.vel.multiplyScalar(0.8); this.vel.y = 0; this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt); }
      this.timer -= dt;
      if (this.state === 'down' && this.timer <= 0 && !this.dead) { this.state = this.role === 'cop' ? 'cop' : 'flee'; this.timer = 8; this.fleeFrom = { x: g.player.pos.x, z: g.player.pos.z }; }
      if (this.dead && this.timer <= 0) this.state = 'dead';
      this.anim = 'dead';
    } else if (this.role === 'cop') {
      moveSpeed = g.police.copBrain(this, dt);
    } else if (this.state === 'walk' && this.path) {
      if (this.idleT > 0) { this.idleT -= dt; this.anim = 'idle'; }
      else {
        this.s += this.dir * this.speed * dt;
        if (this.path.type === 'line') { const L = this.pathLength(); if (this.s > L) { this.s = L; this.dir = -1; } if (this.s < 0) { this.s = 0; this.dir = 1; } }
        const [x, z, hd] = this.pathPoint(this.s);
        this.pos.x = x; this.pos.z = z;
        this.heading = this.dir > 0 ? hd : hd + Math.PI;
        moveSpeed = this.speed; this.anim = 'walk';
        if (Math.random() < dt * 0.04) this.idleT = 1.5 + Math.random() * 4;
      }
    } else if (this.state === 'flee') {
      this.timer -= dt;
      const f = this.fleeFrom || g.player.pos;
      const ax = this.pos.x - f.x, az = this.pos.z - f.z;
      const target = Math.atan2(ax, az) + Math.sin(this.id + g.time * 0.7) * 0.5;
      this.heading = this.heading + wrapAngle(target - this.heading) * Math.min(1, dt * 4);
      moveSpeed = 5.2;
      this.pos.x += Math.sin(this.heading) * moveSpeed * dt; this.pos.z += Math.cos(this.heading) * moveSpeed * dt;
      this.anim = this.look.female ? 'flee' : 'run';
      if (this.timer <= 0) { this.state = 'roam'; this.timer = 0; }
    } else { // roam
      this.heading += Math.sin(g.time * 0.5 + this.id) * dt * 0.5;
      moveSpeed = this.speed;
      this.pos.x += Math.sin(this.heading) * moveSpeed * dt; this.pos.z += Math.cos(this.heading) * moveSpeed * dt;
      this.anim = 'walk';
    }
    if (this.state !== 'walk' && this.state !== 'down' && this.state !== 'dead') {
      // dünya çarpışması ve basamak kontrolü
      const hit = w.collideCircle(this.pos, 0.35, this.pos.y, 1.7);
      if (hit && this.state === 'roam') this.heading += 1.5 + Math.random();
      const gh = w.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (gh > this.pos.y + 0.6 || gh < WATER_Y - 0.3) { this.pos.x = prevX; this.pos.z = prevZ; this.heading += Math.PI * 0.7; }
      else this.pos.y = damp(this.pos.y, gh, 20, dt);
    } else if (this.state === 'walk') {
      this.pos.y = w.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
    }
    this.speedNow = moveSpeed;
    this.mesh.position.set(this.pos.x, this.pos.y + (this.anim === 'dead' ? 0.15 : 0), this.pos.z);
    this.mesh.rotation.y = this.heading;
    animate(this.h, this.anim, moveSpeed, dt, this.animExtra || 0);
  }
  dispose() { this.game.scene.remove(this.mesh); }
}

// ---------- trafik yöneticisi ----------
const CIV_TYPES = ['sedan', 'sedan', 'hatch', 'taxi', 'taxi', 'pickup', 'van', 'sport', 'sedan', 'hatch'];
const PARK_TYPES = ['sedan', 'hatch', 'sport', 'pickup', 'moto', 'taxi', 'sport', 'moto', 'van'];

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cycle = 0;
    this.phase = { NS: 'G', EW: 'R' };
    this.maxCars = game.quality === 'low' ? 12 : 20;
    this.maxPeds = game.quality === 'low' ? 22 : 38;
    this.spawnTimer = 0; this.parkTimer = 0; this.pedTimer = 0;
    for (const s of game.world.parkingSpots) { s.has = s.fixed || Math.random() < 0.55; s.vehicle = null; s.cooldown = 0; s.type = s.type || pick(PARK_TYPES); }
  }
  updateLights(dt) {
    this.cycle = (this.cycle + dt) % 30;
    const t = this.cycle;
    let ns = 'R', ew = 'R';
    if (t < 12) ns = 'G'; else if (t < 14.5) ns = 'Y';
    else if (t >= 15 && t < 27) ew = 'G'; else if (t >= 27 && t < 29.5) ew = 'Y';
    if (ns !== this.phase.NS || ew !== this.phase.EW) {
      this.phase = { NS: ns, EW: ew };
      this.game.world.setTrafficLights(this.phase);
    }
  }
  visibleFrom(x, z) {
    const cam = this.game.camera;
    const dx = x - cam.position.x, dz = z - cam.position.z;
    const d = Math.hypot(dx, dz);
    const f = this.game.camForward;
    return (dx * f.x + dz * f.z) / (d || 1) > 0.35;
  }
  spawnCar() {
    const g = this.game, w = g.world, p = g.player.pos;
    for (let tries = 0; tries < 12; tries++) {
      const e = pick(w.edges);
      const A = w.nodes[e.a], B = w.nodes[e.b];
      const fwd = Math.random() < 0.5;
      const from = fwd ? A : B, to = fwd ? B : A;
      let dx = to.x - from.x, dz = to.z - from.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const t = 0.2 + Math.random() * 0.5;
      const lane = Math.random() < 0.5 ? 0 : 1;
      const off = e.hw >= 10 ? (lane ? 7.4 : 2.6) : 2.0;
      const x = from.x + dx * L * t - dz * off, z = from.z + dz * L * t + dx * off;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 70 || d > 230) continue;
      if (d < 160 && this.visibleFrom(x, z)) continue;
      if (g.vehicles.some((v) => Math.abs(v.pos.x - x) < 14 && Math.abs(v.pos.z - z) < 14)) continue;
      const y = w.surfaceHeight(x, z, 50);
      const v = g.addVehicle(pick(CIV_TYPES), { x, y, z, heading: Math.atan2(dx, dz) });
      const sp = 8;
      v.vx = dx * sp; v.vz = dz * sp;
      v.ai = new Driver(g, v, from.id, to.id, { lane });
      v.driver = 'ai';
      v.controls.handbrake = false;
      return v;
    }
    return null;
  }
  alarm(x, z, r) {
    for (const p of this.game.peds) {
      if (p.state === 'walk' || p.state === 'roam') {
        const d = Math.hypot(p.pos.x - x, p.pos.z - z);
        if (d < r) p.scare(x, z);
      }
    }
  }
  witnesses(x, z, r = 35) {
    let n = 0;
    for (const p of this.game.peds) if (p.state !== 'dead' && p.state !== 'down' && Math.hypot(p.pos.x - x, p.pos.z - z) < r) n++;
    return n;
  }
  spawnPed() {
    const g = this.game, w = g.world, p = g.player.pos;
    for (let tries = 0; tries < 10; tries++) {
      const path = pick(w.pedPaths);
      const tmp = { path };
      const L = Ped.prototype.pathLength.call(tmp);
      const s = Math.random() * L;
      const [x, z] = Ped.prototype.pathPoint.call(tmp, s);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 30 || d > 120) continue;
      if (d < 70 && this.visibleFrom(x, z)) continue;
      const ped = new Ped(g, x, z, { path, s });
      g.peds.push(ped);
      return ped;
    }
    return null;
  }
  update(dt) {
    const g = this.game, p = g.player.pos;
    this.updateLights(dt);
    // AI araçları
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      const civ = g.vehicles.filter((v) => v.ai instanceof Driver && !v.ai.isCop).length;
      if (civ < this.maxCars) this.spawnCar();
    }
    // park yerleri
    this.parkTimer -= dt;
    if (this.parkTimer <= 0) {
      this.parkTimer = 0.7;
      for (const s of g.world.parkingSpots) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        s.cooldown = Math.max(0, s.cooldown - 0.7);
        if (s.vehicle) {
          const v = s.vehicle;
          const moved = Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 2 || v.driver;
          if (moved) { s.vehicle = null; s.cooldown = 120; v.loose = true; continue; }
          if (d > 210) { g.removeVehicle(v); s.vehicle = null; }
        } else if (s.has && s.cooldown <= 0 && d < 150 && (d > 75 || !this.visibleFrom(s.x, s.z))) {
          if (g.vehicles.some((v) => Math.abs(v.pos.x - s.x) < 5 && Math.abs(v.pos.z - s.z) < 5)) continue;
          const v = g.addVehicle(s.type, { x: s.x, y: g.world.surfaceHeight(s.x, s.z), z: s.z, heading: s.heading });
          s.vehicle = v;
        }
      }
    }
    // yayalar
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) {
      this.pedTimer = 0.3;
      const civ = g.peds.filter((q) => q.role === 'civ').length;
      if (civ < this.maxPeds) this.spawnPed();
    }
    for (let i = g.peds.length - 1; i >= 0; i--) {
      const q = g.peds[i];
      const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
      if (!q.persistent && (d > 170 || (q.state === 'dead' && d > 60 && !this.visibleFrom(q.pos.x, q.pos.z)))) { q.dispose(); g.peds.splice(i, 1); }
    }
  }
}
