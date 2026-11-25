// Oyuncu: yürüme, koşma, zıplama, yüzme, yumruk, araca binme/inme
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';
import { buildHumanoid, animate } from './humanoid.js';
import { shirtTexture } from './textures.js';
import { WATER_Y } from './world.js';
import { Ped } from './traffic.js';
import { swordMesh, bowMesh } from './weapons.js';

export class Player {
  constructor(game, x, z) {
    this.game = game;
    this.look = { skin: '#c98e66', shirt: '#ffffff', shirtTex: shirtTexture(), pants: '#efe8d8', hair: '#1b1209', shoes: '#f4f4f4', glasses: true };
    this.h = buildHumanoid(this.look);
    this.mesh = this.h.root;
    game.scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, game.world.surfaceHeight(x, z), z);
    this.heading = -Math.PI / 2; this.vx = 0; this.vz = 0; this.vy = 0;
    this.health = 100; this.vehicle = null; this.dead = false;
    this.onGround = true; this.swimming = false; this.punchT = 0; this.prompt = null;
    this.fallT = 0; this.speedNow = 0; this.hurtT = 0;
    // silahlar (Isla Selva köprü ucundaki standdan alınır): weapon = 'fist' | 'sword' | 'bow'
    this.weapons = { sword: false, bow: false }; this.weapon = 'fist'; this.bowT = 0;
  }
  get sword() { return this.weapon === 'sword'; }
  giveWeapons() {
    if (!this.swordMesh) {
      this.swordMesh = swordMesh(); this.swordMesh.position.set(0, -0.33, 0.02); this.swordMesh.rotation.x = 0.5;
      this.h.armR.el.add(this.swordMesh);
      this.bowMesh = bowMesh(); this.bowMesh.position.set(0, -0.33, 0);
      this.h.armL.el.add(this.bowMesh);
    }
    this.weapons.sword = this.weapons.bow = true;
    this.weapon = 'bow';
  }
  // R: sıradaki silah (yumruk → kılıç → yay)
  nextWeapon() {
    const order = ['fist', ...(this.weapons.sword ? ['sword'] : []), ...(this.weapons.bow ? ['bow'] : [])];
    this.weapon = order[(order.indexOf(this.weapon) + 1) % order.length];
    const names = { fist: 'Yumruk', sword: 'Kılıç', bow: 'Yay' };
    this.game.hud?.notify?.('Silah: ' + names[this.weapon], 1.5);
  }

  damage(amount, cause) {
    if (this.dead || this.game.godMode) return;
    this.health -= amount;
    this.hurtT = 0.4;
    this.game.onPlayerHurt?.(amount);
    if (this.health <= 0) { this.health = 0; this.game.wasted(cause); }
  }

  nearestVehicle() {
    let best = null, bd = Infinity;
    for (const v of this.game.vehicles) {
      if (v.wrecked || v.burning > 0) continue;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
      const reach = v.cfg.len / 2 + 1.6;
      if (d < reach && d < bd && Math.abs(v.pos.y - this.pos.y) < 3) { bd = d; best = v; }
    }
    return best;
  }

  enterVehicle(v) {
    const g = this.game;
    if (v.driver === 'ai' || (v.ai && v.ai.isCop)) {
      if (v.speed > 7) return;
      // sürücüyü dışarı at
      const left = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
      const isCop = v.type === 'police';
      const px = v.pos.x + left.x * (v.cfg.wid / 2 + 0.8), pz = v.pos.z + left.z * (v.cfg.wid / 2 + 0.8);
      if (isCop) {
        const c = new Ped(g, px, pz, { look: { skin: '#d9a27c', shirt: '#2b4a8a', pants: '#1a2236', hair: '#1b1209', shoes: '#111', hat: true, capColor: '#1a2236' }, role: 'cop', state: 'cop', health: 120 });
        c.fireT = 1.5; g.peds.push(c);
        g.police.crime('copHit', v.pos.x, v.pos.z);
      } else {
        const p = new Ped(g, px, pz, { state: 'flee' });
        p.fleeFrom = { x: v.pos.x, z: v.pos.z }; p.timer = 8;
        p.hit(left.x * 3, left.z * 3, 5, false);
        g.peds.push(p);
        g.police.crime('carjack', v.pos.x, v.pos.z);
        g.audio?.scream(v.pos);
      }
      v.ai = null;
    }
    this.vehicle = v; v.driver = 'player';
    v.controls.handbrake = false;
    v.persistentByPlayer = true;
    if (v.type === 'moto' || v.type === 'boat' || v.type === 'wagon' || v.type === 'horse') {
      v.parts.body.add(this.mesh);
      const s = v.parts.seat;
      this.mesh.position.set(s.x, v.type === 'moto' ? 0.29 : s.y, s.z);
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.visible = true;
    } else this.mesh.visible = false;
    this.swimming = false;
    g.onEnterVehicle?.(v);
  }

  exitVehicle(force = false) {
    const g = this.game, v = this.vehicle;
    if (!v) return;
    const fast = v.speed > 9 && !force;
    const sides = [{ x: Math.cos(v.heading), z: -Math.sin(v.heading) }, { x: -Math.cos(v.heading), z: Math.sin(v.heading) }];
    let placed = false;
    for (const s of sides) {
      const x = v.pos.x + s.x * (v.cfg.wid / 2 + 0.7), z = v.pos.z + s.z * (v.cfg.wid / 2 + 0.7);
      const p = new THREE.Vector3(x, 0, z);
      const gh = g.world.surfaceHeight(x, z, v.pos.y + 1);
      g.world.collideCircle(p, 0.35, gh, 1.7);
      if (Math.hypot(p.x - x, p.z - z) < 0.3 && Math.abs(gh - v.pos.y) < 1.5) { this.pos.set(x, Math.max(gh, v.pos.y), z); placed = true; break; }
    }
    if (!placed) {
      if (v.type === 'boat') { this.pos.set(v.pos.x + sides[0].x * 2.2, WATER_Y - 1.2, v.pos.z + sides[0].z * 2.2); }
      else this.pos.set(v.pos.x, v.pos.y + 1.6, v.pos.z);
    }
    if (this.mesh.parent !== g.scene) g.scene.add(this.mesh);
    this.mesh.visible = true;
    this.heading = v.heading;
    this.vx = fast ? v.vx * 0.5 : 0; this.vz = fast ? v.vz * 0.5 : 0; this.vy = fast ? 3 : 0;
    if (fast) { this.fallT = 1.0; this.damage(Math.min(30, v.speed * 0.8), 'fall'); }
    v.driver = null;
    v.controls = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    this.vehicle = null;
    g.onExitVehicle?.(v);
  }

  respawn(x, z, heading = 0) {
    if (this.vehicle) this.exitVehicle(true);
    if (this.mesh.parent !== this.game.scene) this.game.scene.add(this.mesh);
    this.pos.set(x, this.game.world.surfaceHeight(x, z), z);
    this.heading = heading; this.vx = this.vz = this.vy = 0;
    this.health = 100; this.dead = false; this.fallT = 0; this.swimming = false;
    this.mesh.visible = true;
  }

  update(dt, input, camYaw) {
    const g = this.game, w = g.world;
    this.prompt = null;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.dead) {
      animate(this.h, 'dead', 0, dt);
      this.mesh.position.set(this.pos.x, this.pos.y + 0.15, this.pos.z);
      return;
    }
    // araç içi
    if (this.vehicle) {
      const v = this.vehicle;
      const c = v.controls;
      const up = input.down('KeyW') || input.down('ArrowUp');
      const dn = input.down('KeyS') || input.down('ArrowDown');
      c.throttle = up ? 1 : 0; c.brake = dn ? 1 : 0;
      const st = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      // kısa basışta yumuşak, basılı tutunca tam direksiyon; bırakınca hızla ortala
      const rate = st === 0 ? 12 : (Math.sign(st) !== Math.sign(c.steer) && Math.abs(c.steer) > 0.05 ? 10 : 3.5);
      c.steer = damp(c.steer, st, rate, dt);
      if (st === 0 && Math.abs(c.steer) < 0.02) c.steer = 0;
      c.assist = g.steerAssist !== false && st === 0;
      c.handbrake = input.down('Space');
      if (input.hit('KeyH')) g.audio?.horn(v.pos, 1);
      this.pos.copy(v.pos);
      this.heading = v.heading;
      this.speedNow = v.speed;
      if (v.type === 'horse') animate(this.h, 'horse', 0, dt, Math.min(1, Math.abs(v.speed) / 12));   // ata binmiş: bacaklar iki yanda
      else if (v.type === 'moto' || v.type === 'wagon') animate(this.h, 'ride', 0, dt);
      else if (v.type === 'boat') animate(this.h, 'boat', 0, dt);
      if (this.swordMesh) this.swordMesh.visible = this.bowMesh.visible = false;
      if (input.hit('KeyF')) this.exitVehicle();
      // motosiklette sert çarpışmada fırla
      return;
    }

    // yaya
    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    // yürürken ←/→ kamerayı çevirir (main.js), yana adım yalnızca A/D
    const str = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
    let wx = fx * fwd + rx * str, wz = fz * fwd + rz * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    let maxS = this.swimming ? (sprint ? 3.6 : 2.4) : (sprint ? 8 : 4.6);
    // Isla Selva nehri: sığ suda yürüyerek ilerle (yavaşla, sıçrat)
    const wy = this.swimming ? null : w.riverWater(this.pos.x, this.pos.z);
    this.wading = wy !== null && this.pos.y < wy - 0.1;
    if (this.wading) {
      maxS *= 0.6;
      if (this.speedNow > 1.2 && Math.random() < dt * 5) g.effects.splash(this.pos.x, wy, this.pos.z, 4, 0.35);
    }
    if (this.fallT > 0) { this.fallT -= dt; maxS = 0; }
    if (this.punchT > 0) maxS *= 0.3;
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.vx = damp(this.vx, wx * maxS, accel, dt);
    this.vz = damp(this.vz, wz * maxS, accel, dt);
    if (wl > 0 && this.fallT <= 0) this.heading = dampAngle(this.heading, Math.atan2(wx, wz), 12, dt);
    // ←/→ ile kamera dönerken (dururken de) oyuncu kameranın baktığı yöne döner
    if (input.down('ArrowLeft') || input.down('ArrowRight')) this.faceCamT = 0.5;
    this.faceCamT = Math.max(0, (this.faceCamT || 0) - dt);
    if (wl === 0 && this.faceCamT > 0 && this.fallT <= 0 && !this.swimming) this.heading = dampAngle(this.heading, camYaw, 14, dt);
    this.speedNow = Math.hypot(this.vx, this.vz);

    // yatay hareket + basamak / tırmanma
    const ox = this.pos.x, oz = this.pos.z;
    const nx = ox + this.vx * dt, nz = oz + this.vz * dt;
    const gNew = w.surfaceHeight(nx, nz, this.pos.y + 0.5);
    if (gNew > this.pos.y + 0.55) {
      const climbable = gNew - this.pos.y < (this.swimming ? 2.3 : 1.4);
      // suda (yüzerken ya da havuz/nehir içinde yürürken) kenara kendiliğinden tırman
      if (climbable && (this.swimming || this.wading || input.down('Space'))) { this.pos.x = nx; this.pos.z = nz; this.pos.y = gNew; this.vy = 0; this.swimming = false; }
      else { this.vx *= 0.2; this.vz *= 0.2; }
      if (this.swimming && climbable) this.prompt = 'Kenara tırmanmak için ilerle';
    } else { this.pos.x = nx; this.pos.z = nz; }
    w.collideCircle(this.pos, 0.35, this.pos.y, 1.75);
    // tekneye atlama: teknenin gövdesine düşen / yüzerek giren oyuncu suya düşmez, tekneye biner
    for (const v of g.vehicles) {
      if (v.type !== 'boat' || v.wrecked || v.driver === 'ai' || (v.ai && v.ai.isCop)) continue;
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (Math.abs(along) < v.cfg.len / 2 - 0.2 && Math.abs(lat) < v.cfg.wid / 2 + 0.3 && this.pos.y < v.pos.y + 3 && this.pos.y > v.pos.y - 2.2) {
        this.enterVehicle(v);
        return;
      }
    }
    // araçlarla itişme
    for (const v of g.vehicles) {
      if (Math.abs(v.pos.x - this.pos.x) > 6 || Math.abs(v.pos.z - this.pos.z) > 6) continue;
      if (Math.abs(v.pos.y - this.pos.y) > 2) continue;
      for (const c of v.circles()) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z, rr = c.r + 0.35;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          this.pos.x += dx / d * (rr - d); this.pos.z += dz / d * (rr - d);
        }
      }
    }

    // dikey
    const ground = w.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
    const deepWater = ground < WATER_Y - 1.3;
    if (deepWater && this.pos.y <= WATER_Y - 1.0) {
      if (!this.swimming) { g.effects.splash(this.pos.x, WATER_Y, this.pos.z, 14, 0.8); g.audio?.splash(); }
      this.swimming = true; this.onGround = false;
      this.vy = 0;
      this.pos.y = damp(this.pos.y, WATER_Y - 1.25 + Math.sin(g.time * 2) * 0.05, 6, dt);
    } else {
      if (this.swimming && !deepWater) this.swimming = false;
      this.vy -= 22 * dt;
      if (this.onGround && input.hit('Space') && this.fallT <= 0) { this.vy = 6.8; this.onGround = false; }
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        if (this.vy < -15) this.damage((-this.vy - 15) * 6, 'fall');
        this.pos.y = ground; this.vy = 0; this.onGround = true;
      } else if (this.pos.y > ground + 0.25) this.onGround = false;
      else if (this.vy <= 0) { this.pos.y = damp(this.pos.y, ground, 25, dt); this.onGround = true; }
    }

    // silah değiştir
    if (input.hit('KeyR') && (this.weapons.sword || this.weapons.bow)) this.nextWeapon();
    // yay: ok at (kameranın baktığı yöne, hafif yukarı)
    this.bowT = Math.max(0, this.bowT - dt);
    if (this.weapon === 'bow') {
      if (input.clicked && this.bowT <= 0 && !this.swimming && this.fallT <= 0 && g.arrows) {
        this.bowT = 0.75;
        // nişangâh = kameranın baktığı yer; o ışın bir hayvana değiyorsa onun gövdesine, değilse 40 m ileriye
        const cdir = new THREE.Vector3(); g.camera.getWorldDirection(cdir);
        const cpos = g.camera.position;
        const tgt = w.wildlife?.aimTarget(cpos, cdir) || cpos.clone().addScaledVector(cdir, 40);
        const flat = Math.hypot(cdir.x, cdir.z) || 1;
        this.heading = Math.atan2(cdir.x, cdir.z);
        const from = new THREE.Vector3(this.pos.x + cdir.x / flat * 0.6, this.pos.y + 1.45, this.pos.z + cdir.z / flat * 0.6);
        const dir = tgt.clone().sub(from);
        g.arrows.shoot(from, dir, true);
        g.audio?.punch?.();
      }
    }
    // yumruk / kılıç
    this.punchT = Math.max(0, this.punchT - dt);
    if (this.weapon !== 'bow' && input.clicked && this.punchT <= 0 && !this.swimming && this.fallT <= 0) {
      this.punchT = 0.42; this.punchHit = false;
    }
    if (this.punchT > 0 && this.punchT < 0.26 && !this.punchHit) {
      this.punchHit = true;
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      // kılıçla: Isla Selva hayvanları (geyik, kaplan)
      let hitSomething = !!(this.sword && w.wildlife?.swordHit(this.pos, this.heading, g));
      for (const p of g.peds) {
        if (p.state === 'dead') continue;
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.7 && (dx * hx + dz * hz) / (d || 1) > 0.4) {
          p.hit(hx * 5, hz * 5, p.role === 'cop' ? 30 : 36, true);
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) g.audio?.punch();
    }

    // binme istemi
    const nv = this.nearestVehicle();
    if (nv && !this.swimming) this.prompt = nv.type === 'horse' ? 'F: Ata bin' : `F: ${nv.cfg.name}${nv.driver === 'ai' ? ' (sürücüyü indir)' : ''}`;
    // bindiyse burada bit: aşağıdaki satırlar dünya konumunu modele yazar; model artık aracın (at, motor, tekne)
    // gövdesinin çocuğu olduğundan sürücü yüzlerce metre öteye kayıp görünmez oluyordu
    if (input.hit('KeyF') && nv && this.fallT <= 0) { this.enterVehicle(nv); if (this.vehicle) return; }

    // animasyon
    let st = 'idle';
    if (this.swimming) st = 'swim';
    else if (this.fallT > 0) st = 'fall';
    else if (!this.onGround) st = 'jump';
    else if (this.punchT > 0) st = this.sword ? 'slash' : 'punch';
    else if (this.bowT > 0) st = 'bow';
    else if (this.speedNow > 5.5) st = 'run';
    else if (this.speedNow > 0.4) st = 'walk';
    const anim = st === 'walk' && this.speedNow > 3 ? 'run' : st;
    animate(this.h, anim, this.speedNow, dt, st === 'punch' || st === 'slash' ? 1 - this.punchT / 0.42 : st === 'bow' ? 1 - this.bowT / 0.75 : 0);
    // elde yalnız seçili silah görünür (araçtayken gizli)
    if (this.swordMesh) {
      this.swordMesh.visible = this.weapon === 'sword' && !this.vehicle; this.bowMesh.visible = this.weapon === 'bow' && !this.vehicle;
      // yay: beklerken kol aşağıda → dikey dursun; nişan alırken (kol önde) modelin kendi duruşu dikeydir
      this.bowMesh.rotation.x = st === 'bow' ? 0 : -Math.PI / 2;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
    void clamp; void wrapAngle;
  }
}
