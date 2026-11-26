// Demir ligi görevi "Banka Soygunu" (Wild West): köprünün kasaba ucundaki daireden başlar →
// ata bin, Grand Hotel'e git → barda duran kanun kaçağını yumrukla etkisiz hale getir (3 yumruk), altıpatlarını al (6 mermi) →
// silah elindeyken bankanın kasa dairesinde E'ye basılı tut (paraları al) → şerif + iki yardımcısı atla kovalar, ateş eder →
// paraları Palmera'daki teslim noktasına götür (atlılar 80 m'den yakınken teslim edilmez).
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp } from './util.js';
import { revolverMesh, hitsObstacle } from './weapons.js';
import { rig, pose } from './westlife.js';

const HOTEL_DOOR = { x: -838, z: -47.6 };          // Grand Hotel giriş kapısının önü (west.js hotelLayout(-838, …))
const DROP = { x: -300, z: -120 };                 // Palmera: teslim noktası (cadde kavşağı)
const ROB_TIME = 4;                                // kasada E basılı tutma süresi (sn)
const RIDER_HP = 100, BULLET = 50;                 // atlı: 2 kurşunda düşer
const RIDER_SPEED = 14.5;                          // oyuncunun atı 16 m/sn: yavaş yavaş açılabilir
const POSSE_SPAWN = [{ x: -942, z: -34, h: Math.PI / 2 }, { x: -946, z: -46, h: Math.PI / 2 }, { x: -962, z: -40, h: Math.PI / 2 }];   // hepsi ana caddede (kuzey yolundan gelen atlı binalara takılıyordu)

export class HeistMission {
  constructor(g, mgr, m) {
    this.g = g; this.mgr = mgr; this.m = m;
    this.stage = 'hotel'; this.robT = 0; this.riders = []; this.gun = null; this.horse = null;
    mgr.setObjective('Ata bin ve Grand Hotel\'e git.', HOTEL_DOOR, 'ground');
    // önceki denemede öldürülen kanun kaçağı yeniden barda
    const t = this.target(); if (t?.dead) this.life.revive(t);
  }
  get life() { return this.g.world.west?.life || null; }
  target() { return this.life?.cowboys.find((c) => c.id === 'barfly') || null; }

  update(dt) {
    const g = this.g, P = g.player, mgr = this.mgr, W = g.world.west;
    if (this.stage === 'hotel') {
      if (W && Math.hypot(P.pos.x - HOTEL_DOOR.x, P.pos.z - HOTEL_DOOR.z) < 9) {
        this.stage = 'fight';
        const t = this.target();
        mgr.setObjective('Barda duran adamı yumruklarınla etkisiz hale getir (attan in, sol tık).', t ? { x: t.x, z: t.z } : HOTEL_DOOR, 'car');
      }
    } else if (this.stage === 'fight') {
      const t = this.target();
      if (!t) return;   // bölge yeniden yükleniyor
      if (t.dead) {
        // silah yere düşer
        this.gun = revolverMesh(); this.gun.scale.setScalar(1.6);
        this.gun.position.set(t.x + 0.6, t.y + 0.06, t.z + 0.3); this.gun.rotation.set(Math.PI / 2, 0, 0.8);
        g.scene.add(this.gun);
        this.stage = 'pickup';
        g.hud.notify('Adam yere serildi. Altıpatlarını al!', 3);
        mgr.setObjective('Yerdeki altıpatları al.', { x: this.gun.position.x, z: this.gun.position.z }, 'car');
      }
    } else if (this.stage === 'pickup') {
      this.gun.rotation.z += dt * 1.5;
      if (!P.vehicle && Math.hypot(P.pos.x - this.gun.position.x, P.pos.z - this.gun.position.z) < 1.3) {
        g.scene.remove(this.gun); this.gun = null;
        P.giveGun(6);
        g.audio?.jingle?.('cp');
        g.hud.notify('Altıpatlar alındı: 6 mermi. Sol tık ateş, R silah değiştir.', 4);
        this.stage = 'bank';
        const B = W.bank;
        mgr.setObjective('Bankaya git, kasa dairesine gir ve paraları al.', { x: B.points.vault[0], z: B.points.vault[1] }, 'car');
      }
    } else if (this.stage === 'bank') {
      const B = W?.bank; if (!B) return;
      const [vx, vz] = B.points.vault;
      const inVault = !P.vehicle && Math.hypot(P.pos.x - vx, P.pos.z - vz) < 2.4;
      if (!inVault) { this.robT = Math.max(0, this.robT - dt * 2); return; }
      if (P.weapon !== 'gun') { mgr.prompt = 'Silahını çek: R ile altıpatları seç.'; return; }
      if (g.input.down('KeyE')) this.robT += dt;
      else this.robT = Math.max(0, this.robT - dt);
      const pct = Math.min(100, Math.round(this.robT / ROB_TIME * 100));
      mgr.prompt = `E'ye basılı tut: paraları torbaya doldur… %${pct}`;
      if (this.robT >= ROB_TIME) this.robbed();
    } else if (this.stage === 'flee') {
      this.updateRiders(dt);
      const d = Math.hypot(P.pos.x - DROP.x, P.pos.z - DROP.z);
      if (d < 7) {
        const near = this.riders.some((r) => !r.dead && Math.hypot(r.v.pos.x - P.pos.x, r.v.pos.z - P.pos.z) < 80);
        if (near) mgr.prompt = 'Şerifin adamları peşinde! Önce onlardan kurtul.';
        else { if (P.vehicle) P.exitVehicle(true); this.mgr.finish(true); }
      }
    }
  }

  // kasa boşaltıldı: alarm, kaçış atı, şerif + 2 yardımcı
  robbed() {
    const g = this.g, W = g.world.west, B = W.bank, mgr = this.mgr;
    this.stage = 'flee';
    g.audio?.jingle?.('money');
    g.hud.big('PARALAR TORBADA', 'Şerif ve adamları atla peşinde!', '#ffb020', 3);
    // banka önünde hazır bir at (oyuncunun kendi atı uzakta kalmış olabilir)
    this.horse = g.addVehicle('horse', { x: B.x + 4.5, y: g.world.surfaceHeight(B.x + 4.5, B.z + 5), z: B.z + 5, heading: Math.PI / 2, persistent: true });
    this.horse.persistent = true;
    for (let i = 0; i < 3; i++) this.spawnRider(POSSE_SPAWN[i], i === 0 ? 'sheriff' : i === 1 ? 'gunman' : 'outlaw', i);
    mgr.setObjective('Paraları Palmera\'ya götür: küçük haritadaki sarı çizgiyi takip et.', DROP, 'ground');
  }

  spawnRider(s, kind, i) {
    const g = this.g, W = g.world.west;
    const v = g.addVehicle('horse', { x: s.x, y: g.world.surfaceHeight(s.x, s.z), z: s.z, heading: s.h, persistent: true });
    v.persistent = true; v.posse = true;
    const K = W.kit?.chars?.kinds[kind] || W.kit?.chars?.kinds.sheriff;
    let obj = null, R = null;
    if (K) {
      obj = cloneSkinned(K.root); R = rig(obj);
      obj.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
      const st = v.parts.seat;
      obj.position.set(st.x, st.y - 0.62, st.z);
      v.parts.body.add(obj);
      pose(R, 0, 0, 0, 0, 'ride');
    }
    const r = { v, obj, R, hp: RIDER_HP, dead: false, fireT: 2 + i * 0.6 + Math.random(), stuck: 0, revT: 0, lostT: 0, ph: 0,
      off: { x: Math.cos(i * 2.1) * 5, z: Math.sin(i * 2.1) * 5 } };
    v.ai = { update: (dt) => this.drive(r, dt), isPosse: true };
    this.riders.push(r);
  }

  // atlı sürüşü: oyuncuya (kendi kaymasıyla) yönel, yakınken yavaşla, sıkışınca geri çık; menzildeyse ateş et
  drive(r, dt) {
    const g = this.g, v = r.v, c = v.controls, P = g.player, tp = P.vehicle ? P.vehicle.pos : P.pos;
    if (r.dead) { c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = true; return; }
    const dx = tp.x - v.pos.x, dz = tp.z - v.pos.z, dist = Math.hypot(dx, dz);
    const tx = tp.x + (dist > 12 ? r.off.x : 0), tz = tp.z + (dist > 12 ? r.off.z : 0);
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const ox = tx - v.pos.x, oz = tz - v.pos.z;
    const ang = Math.atan2(ox * -fz + oz * fx, ox * fx + oz * fz);
    const vF = v.forwardSpeed;
    if (r.revT > 0) { r.revT -= dt; c.throttle = 0; c.brake = 1; c.steer = -Math.sign(ang || 1); c.handbrake = false; return; }
    const desired = dist > 16 ? RIDER_SPEED : dist > 8 ? 6 : 0;
    if (desired > 2 && Math.abs(vF) < 0.8) { r.stuck += dt; if (r.stuck > 2) { r.stuck = 0; r.revT = 1.3; } } else r.stuck = Math.max(0, r.stuck - dt);
    c.steer = clamp(ang * 2.2, -1, 1);
    const err = desired - vF;
    c.throttle = clamp(err * 0.45, 0, 1); c.brake = clamp(-err * 0.35, 0, 1); c.handbrake = false;
    // binicinin duruşu: dörtnalda hafif zıplar
    r.ph += Math.abs(vF) * dt * 0.9;
    if (r.R) pose(r.R, Math.min(1, Math.abs(vF) / 12), r.ph, 0, g.time, 'ride');
    // ateş: 38 m içinde, arada duvar yoksa
    r.fireT -= dt;
    if (dist < 38 && r.fireT <= 0) {
      r.fireT = 1.5 + Math.random() * 1.3;
      const sx = v.pos.x + fx * 0.6, sy = v.pos.y + 2.3, sz = v.pos.z + fz * 0.6;
      if (this.clear(sx, sy, sz, tp.x, tp.y + 1.2, tp.z)) this.shootAt(sx, sy, sz, dist);
    }
  }
  clear(x0, y0, z0, x1, y1, z1) {
    const w = this.g.world, L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    for (let t = 1.5; t < L - 1; t += 0.6) {
      const k = t / L, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, z = z0 + (z1 - z0) * k;
      if (hitsObstacle(w, x, y, z)) return false;
    }
    return true;
  }
  shootAt(x, y, z, dist) {
    const g = this.g, P = g.player, moving = P.vehicle ? Math.abs(P.vehicle.speed) : P.speedNow || 0;
    const hit = Math.random() < clamp(0.42 - dist * 0.009 - moving * 0.012, 0.08, 0.42);
    const tx = P.pos.x + (hit ? 0 : (Math.random() - 0.5) * 4), ty = P.pos.y + (P.vehicle ? 2 : 1.1) + (hit ? 0 : Math.random() * 1.5), tz = P.pos.z + (hit ? 0 : (Math.random() - 0.5) * 4);
    g.effects.muzzle(x, y, z, tx, ty, tz);
    g.audio?.gunshot({ x, y, z });
    if (hit) P.damage(P.vehicle ? 7 : 9, 'shot');
    else g.effects.sparks?.(tx, Math.max(ty - 1, P.pos.y + 0.1), tz, 3);
  }
  updateRiders(dt) {
    const P = this.g.player;
    for (const r of this.riders) {
      if (r.dead) {
        // binici attan düşer (devrilir), at durur
        if (r.obj) { r.fallT = Math.min(1, (r.fallT || 0) + dt * 2); r.obj.rotation.z = r.fallT * 1.4; r.obj.position.x = r.v.parts.seat.x + r.fallT * 0.9; r.obj.position.y = r.v.parts.seat.y - 0.62 - r.fallT * 1.1; }
        continue;
      }
      // çok geride kalan atlı izini kaybeder
      const d = Math.hypot(r.v.pos.x - P.pos.x, r.v.pos.z - P.pos.z);
      r.lostT = d > 200 ? r.lostT + dt : 0;
      if (r.lostT > 4) { r.dead = true; r.lost = true; this.removeRider(r); this.g.hud.notify('Bir atlı izini kaybetti.', 2.5); }
    }
    this.riders = this.riders.filter((r) => !r.lost);
  }

  // oyuncunun kurşunu: atlılar (binici gövdesi ~ eyerin 0,9 m üstü)
  rayHit(o, d, maxT) {
    let best = null;
    for (const r of this.riders) {
      if (r.dead) continue;
      const cx = r.v.pos.x - o.x, cy = r.v.pos.y + 2.0 - o.y, cz = r.v.pos.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > maxT) continue;
      const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t;
      if (px * px + py * py * 0.4 + pz * pz < 0.6 * 0.6 && (!best || t < best.t)) best = { t, r };
    }
    return best;
  }
  shot(hit, g) {
    const r = hit.r; r.hp -= BULLET;
    g.effects.hit?.(r.v.pos.x, r.v.pos.y + 2, r.v.pos.z);
    if (r.hp <= 0 && !r.dead) {
      r.dead = true;
      const left = this.riders.filter((q) => !q.dead).length;
      g.hud.notify(left ? `Atlı vuruldu! ${left} atlı kaldı.` : 'Bütün atlılar etkisiz! Yol açık.', 3);
    }
  }

  // binici modeli kasabadaki kovboylarla ortak geometri kullanır: removeVehicle geometrileri attığı için önce ayrılır
  removeRider(r) {
    if (r.obj) { r.obj.parent?.remove(r.obj); r.obj = null; }
    if (this.g.vehicles.includes(r.v)) this.g.removeVehicle(r.v);
  }
  cleanup() {
    const g = this.g;
    if (this.gun) { g.scene.remove(this.gun); this.gun = null; }
    for (const r of this.riders) this.removeRider(r);
    this.riders = [];
    if (this.horse && g.vehicles.includes(this.horse)) this.horse.persistent = false;
  }
}
