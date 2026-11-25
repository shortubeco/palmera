// Isla Selva hayvanları: geyik (sürüler hâlinde dolaşır, bekler; oyuncudan/kaplandan kaçar) ve kaplan (sinsice dolaşır,
// oyuncu yaklaşınca dönüp bakar, kükrer — saldırmaz).
// Modeller: "Animals_FREE" (Unity Asset Store) → tools/animals/convert.mjs → assets/web/animals.json + tex/animals.png
// İskeletli (SkinnedMesh) + gömülü animasyonlar (idle, walk, run; kaplanda idle_rare). Her hayvan kendi AnimationMixer'ı.
import { trackedFetch } from './progress.js';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, mulberry32 } from './util.js';
import { ISLE, FOOT, isleDN, isleHeight, riverAt, mesaK, POND } from './forest.js';
import { weaponStand } from './weapons.js';

// silahlar: kılıç darbesi ve ok hasarı (geyik 2, kaplan 3 isabette ölür — kullanıcı: "tek okla ölmesinler")
const SWORD = { reach: 2.4, dmg: 60 }, ARROW_DMG = 45;
// silah standı: köprünün ada ucunda, patikanın yanında
export const STAND = { x: FOOT.x + 2.6, z: FOOT.z1 - 5 };

export async function loadAnimalKit(base = 'assets/web/') {
  const [j, tex] = await Promise.all([
    trackedFetch(base + 'animals.json').then((r) => { if (!r.ok) throw new Error('animals.json ' + r.status); return r.json(); }),
    new THREE.TextureLoader().loadAsync(base + 'tex/animals.png'),
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  const loader = new THREE.ObjectLoader(), kinds = {};
  for (const [name, json] of Object.entries(j.kinds)) {
    const root = loader.parse(json);
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false;   // animasyonla sınır küresi değişir; az sayıda hayvan
    });
    const clips = {};
    for (const c of root.animations) clips[c.name] = c;
    kinds[name] = { root, clips, meta: json.meta };
  }
  return { kinds };
}

// tür ayarları: yarıçap (çarpışma), yürüme/koşma hızı (m/sn, animasyona uygun), dönüş hızı
// kaplan saldırısı: menzil (m), pençe aralığı (sn), pençe hasarı (can 100 üzerinden)
const ATTACK = { reach: 1.9, every: 1.1, dmg: 20 };
const SPEC = {
  // hp: can; L: gövdenin yarım boyu, hc: gövde merkezi yüksekliği, br: gövde yarıçapı (ok isabeti için)
  deer: { r: 0.5, walk: 1.2, run: 8.5, turn: 2.6, walkClip: 1.2, runClip: 8.5, hp: 80, L: 0.65, hc: 1.0, br: 0.45 },
  tiger: { r: 0.7, walk: 1.5, run: 6, turn: 1.8, walkClip: 1.5, runClip: 6, hp: 130, L: 0.95, hc: 0.75, br: 0.45 },
};

export class Wildlife {
  constructor(world, scene, kit) {
    this.world = world; this.kit = kit;
    const rnd = this.rnd = mulberry32(8080);
    this.animals = [];
    // silah standı (kılıç + yay) — hayvan modelleri yüklenmese de durur
    this.stand = weaponStand(STAND.x, isleHeight(STAND.x, STAND.z), STAND.z);
    scene.add(this.stand);
    world.addCircle(STAND.x, STAND.z, 0.55, -5, isleHeight(STAND.x, STAND.z) + 0.6);
    if (!kit) return;
    const cast = true;   // gölge her kalitede
    // geyikler: 3 sürü × 3; kaplanlar: 5 (sürülerden ve birbirinden en az 45 m uzakta)
    const spots = [];
    for (let h = 0; h < 3; h++) {
      const c = this.randomSpot(); spots.push(c);
      for (let k = 0; k < 3; k++) this.add(scene, 'deer', c[0] + (rnd() - 0.5) * 8, c[1] + (rnd() - 0.5) * 8, h, cast);
    }
    for (let k = 0; k < 5; k++) {
      let c = this.randomSpot();
      for (let t = 0; t < 60 && spots.some((s) => Math.hypot(s[0] - c[0], s[1] - c[1]) < 45); t++) c = this.randomSpot();
      spots.push(c);
      this.add(scene, 'tiger', c[0], c[1], -1, cast);
    }
  }

  add(scene, sp, x, z, herd, cast) {
    const K = this.kit.kinds[sp];
    if (!this.ok(x, z)) [x, z] = this.randomSpot();
    const obj = cloneSkinned(K.root);
    obj.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = cast; });
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const [n, c] of Object.entries(K.clips)) { actions[n] = mixer.clipAction(c); actions[n].play(); actions[n].setEffectiveWeight(0); }
    const a = { sp, herd, obj, mixer, actions, cur: null, x, z, y: this.world.surfaceHeight(x, z), heading: this.rnd() * 6.28,
      speed: 0, state: 'idle', timer: this.rnd() * 5, tx: x, tz: z, stuck: 0, roarT: 0, rareT: 10 + this.rnd() * 20,
      cool: 0, chaseT: 0, hitT: 0, hp: SPEC[sp].hp, deadT: 0, roll: 1, respawned: 0 };
    // başlangıç pozu farklı olsun
    for (const act of Object.values(actions)) act.time = this.rnd() * act.getClip().duration;
    this.setClip(a, 'idle', 0);
    scene.add(obj);
    this.animals.push(a);
    this.place(a);
  }

  // yürünebilir nokta: ada içi; nehir, gölet ve kayalık yamacı dışı
  ok(x, z) {
    if (isleDN(x, z) > 0.82) return false;
    const q = riverAt(x, z); if (q && q.d < q.w + 1.2) return false;
    if (mesaK(x, z) > 0.02) return false;
    return Math.hypot(x - POND.x, z - POND.z) > POND.r + 2;
  }
  randomSpot() {
    for (let t = 0; t < 200; t++) {
      const x = ISLE.cx + (this.rnd() * 2 - 1) * ISLE.rx * 0.85, z = ISLE.cz + (this.rnd() * 2 - 1) * ISLE.rz * 0.85;
      if (this.ok(x, z)) return [x, z];
    }
    return [ISLE.cx, ISLE.cz + 30];
  }
  // yeni hedef: geyik sürüsünün ortasına yakın, kaplan serbest
  pickTarget(a) {
    let cx = a.x, cz = a.z, far = 35;
    if (a.herd >= 0) {
      const m = this.animals.filter((b) => b.herd === a.herd);
      cx = m.reduce((s, b) => s + b.x, 0) / m.length; cz = m.reduce((s, b) => s + b.z, 0) / m.length; far = 12;
    }
    for (let t = 0; t < 30; t++) {
      const ang = this.rnd() * 6.28, d = 4 + this.rnd() * far, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
      if (this.ok(x, z)) { a.tx = x; a.tz = z; return; }
    }
    [a.tx, a.tz] = this.randomSpot();
  }
  flee(a, fx, fz) {
    const ang = Math.atan2(a.x - fx, a.z - fz) + (this.rnd() - 0.5) * 0.8;
    let x = a.x + Math.sin(ang) * 30, z = a.z + Math.cos(ang) * 30;
    for (let t = 0; t < 12 && !this.ok(x, z); t++) { const b = ang + (this.rnd() - 0.5) * 2.5; x = a.x + Math.sin(b) * 24; z = a.z + Math.cos(b) * 24; }
    if (!this.ok(x, z)) [x, z] = this.randomSpot();
    a.tx = x; a.tz = z; a.state = 'flee'; a.timer = 4 + this.rnd() * 2;
  }
  // animasyon geçişi (yumuşak)
  setClip(a, name, fade = 0.3) {
    if (!a.actions[name] || a.cur === name) return;
    const next = a.actions[name];
    if (a.cur) { a.actions[a.cur].fadeOut(fade); next.reset().setEffectiveWeight(1).fadeIn(fade); }
    else next.setEffectiveWeight(1);
    a.cur = name;
  }
  place(a) {
    a.obj.position.set(a.x, a.y, a.z);
    a.obj.rotation.y = a.heading;
  }

  update(dt, game, camera) {
    const P = game.player, pp = P.vehicle ? P.vehicle.pos : P.pos;
    // oyuncu adadan uzaktaysa hesaplama ve animasyon yok
    if (Math.hypot(pp.x - ISLE.cx, pp.z - ISLE.cz) > ISLE.rx + 250) return;
    // silah standı: yanına gelen oyuncu kılıç ve yayı alır
    const U = this.stand.userData;
    U.glow.material.opacity = 0.3 + 0.25 * Math.sin(game.time * 3);
    const has = P.weapons?.sword && P.weapons?.bow;
    U.sword.visible = U.bow.visible = U.glow.visible = !has;
    if (!has && !P.vehicle && !P.dead && Math.hypot(pp.x - STAND.x, pp.z - STAND.z) < 2.2) {
      P.giveWeapons?.();
      game.hud?.notify?.('Kılıç ve yay aldın! R: silah değiştir · Sol tık: saldır / ok at', 6);
      game.audio?.jingle?.('cp');
    }
    if (!this.animals.length) return;
    const tigers = this.animals.filter((a) => a.sp === 'tiger' && a.state !== 'dead');
    const cam = camera.position;
    for (const a of this.animals) {
      const S = SPEC[a.sp];
      if (a.state === 'dead') { this.updateDead(a, dt, pp, cam); continue; }
      const dp = Math.hypot(pp.x - a.x, pp.z - a.z);
      a.timer -= dt; a.roarT -= dt;
      // tehditler
      if (a.sp === 'deer') {
        let fx = null, fz = null;
        if (dp < 14 && !P.vehicle) { fx = pp.x; fz = pp.z; }
        for (const t of tigers) if (Math.hypot(t.x - a.x, t.z - a.z) < 13) { fx = t.x; fz = t.z; }
        if (fx !== null && a.state !== 'flee') for (const b of this.animals) if (b.herd === a.herd) this.flee(b, fx, fz);
      } else {
        // kaplan: yaklaşan oyuncuya önce kükrer (uyarı), sonra atılır, dibindeyse pençe atar
        a.cool -= dt;
        const reachable = !P.vehicle && !P.dead && !P.swimming && this.ok(pp.x, pp.z);
        if (reachable && dp < 14 && a.cool <= 0 && (a.state === 'idle' || a.state === 'walk')) {
          a.state = 'face'; a.timer = 1.3;
          if (a.roarT <= 0) { a.roarT = 6; game.audio?.growl?.({ x: a.x, y: a.y + 1, z: a.z }); }
          game.hud?.notify?.('Bir kaplan seni fark etti! Kaç!', 2.5);
        }
        if ((a.state === 'face' || a.state === 'charge' || a.state === 'attack') && (!reachable || dp > 30 || a.chaseT > 18)) {
          // peşini bıraktı: uzaklaş, bir süre saldırma
          a.state = 'walk'; this.pickTarget(a); a.timer = 10; a.cool = P.dead ? 25 : 12; a.chaseT = 0;
        }
      }
      // durum makinesi
      let want = 0;
      if (a.state === 'flee') {
        want = S.run;
        if (a.timer <= 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 2) { a.state = 'idle'; a.timer = 2 + this.rnd() * 3; }
      } else if (a.state === 'face') {   // uyarı: oyuncuya dön
        a.heading = turnTo(a.heading, Math.atan2(pp.x - a.x, pp.z - a.z), S.turn * 2, dt);
        if (a.timer <= 0) { a.state = 'charge'; a.chaseT = 0; }
      } else if (a.state === 'charge') {   // atıl
        a.chaseT += dt; a.tx = pp.x; a.tz = pp.z; want = S.run;
        if (dp < ATTACK.reach) { a.state = 'attack'; a.hitT = 0.35; }
      } else if (a.state === 'attack') {   // pençe: ATTACK.every saniyede bir
        a.chaseT += dt;
        a.heading = turnTo(a.heading, Math.atan2(pp.x - a.x, pp.z - a.z), S.turn * 3, dt);
        if (dp > ATTACK.reach + 0.8) a.state = 'charge';
        else if ((a.hitT -= dt) <= 0) {
          a.hitT = ATTACK.every;
          P.damage(ATTACK.dmg, 'tiger');
          // darbe: oyuncuyu biraz geri it
          const k = 3.5 / Math.max(dp, 0.3); P.vx = (pp.x - a.x) * k; P.vz = (pp.z - a.z) * k;
          game.audio?.growl?.({ x: a.x, y: a.y + 1, z: a.z });
          game.cam && (game.cam.shake = Math.max(game.cam.shake || 0, 0.4));
        }
      } else if (a.state === 'walk') {
        want = S.walk;
        if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.5 || a.timer <= 0) { a.state = 'idle'; a.timer = 5 + this.rnd() * 10; }
      } else if (a.timer <= 0) { a.state = 'walk'; this.pickTarget(a); a.timer = 12 + this.rnd() * 10; }
      // yönel + ilerle
      if (want > 0) a.heading = turnTo(a.heading, Math.atan2(a.tx - a.x, a.tz - a.z), S.turn * (a.state === 'flee' ? 2 : 1), dt);
      a.speed += (want - a.speed) * Math.min(1, dt * (a.state === 'flee' ? 4 : 2.5));
      if (a.speed > 0.05) {
        const ox = a.x, oz = a.z;
        const nx = a.x + Math.sin(a.heading) * a.speed * dt, nz = a.z + Math.cos(a.heading) * a.speed * dt;
        if (this.ok(nx, nz)) { a.x = nx; a.z = nz; } else this.pickTarget(a);
        const p = { x: a.x, z: a.z };
        this.world.collideCircle(p, S.r, a.y, 1.2);
        if (this.ok(p.x, p.z)) { a.x = p.x; a.z = p.z; }
        const moved = Math.hypot(a.x - ox, a.z - oz);
        a.stuck = moved < a.speed * dt * 0.3 ? a.stuck + dt : Math.max(0, a.stuck - dt);
        if (a.stuck > 0.8) { a.stuck = 0; this.pickTarget(a); }
        a.y += (this.world.surfaceHeight(a.x, a.z) - a.y) * Math.min(1, dt * 10);
      }
      // animasyon: hıza göre bekleme / yürüme / koşma; kaplanda ara sıra özel bekleme
      if (a.speed > (S.walk + S.run) * 0.5) { this.setClip(a, 'run'); a.actions.run.timeScale = a.speed / S.runClip; }
      else if (a.speed > 0.3) { this.setClip(a, 'walk'); a.actions.walk.timeScale = clamp(a.speed / S.walkClip, 0.5, 1.6); }
      else if (a.sp === 'tiger' && a.state === 'idle' && (a.rareT -= dt) <= 0 && a.actions.idle_rare) {
        this.setClip(a, 'idle_rare'); a.rareT = 25 + this.rnd() * 25;
      } else if (a.cur !== 'idle_rare' || a.actions.idle_rare.time > a.actions.idle_rare.getClip().duration - 0.4) this.setClip(a, 'idle');
      // oyuncuyu hayvanın içinden it
      if (!P.vehicle && dp < S.r + 0.4 && dp > 1e-3) {
        const k = (S.r + 0.4 - dp) / dp; pp.x += (pp.x - a.x) * k; pp.z += (pp.z - a.z) * k;
      }
      this.place(a);
      // animasyonu yalnız yakında oynat (uzakta donar)
      if (Math.hypot(cam.x - a.x, cam.z - a.z) < 150) a.mixer.update(dt);
    }
  }

  // ---------- avlanma ----------
  // hasar: geyik sürüsü kaçar; kaplan hemen saldırır; can biterse ölür
  damage(a, dmg, fx, fz, game) {
    if (a.state === 'dead') return;
    a.hp -= dmg;
    game.audio?.punch?.();
    if (a.hp <= 0) { this.kill(a, fx, fz, game); return; }
    if (a.sp === 'deer') { for (const b of this.animals) if (b.herd === a.herd && b.state !== 'dead') this.flee(b, fx, fz); }
    else {
      a.cool = 0; a.chaseT = 0; a.state = 'charge';
      if (a.roarT <= 0) { a.roarT = 4; game.audio?.growl?.({ x: a.x, y: a.y + 1, z: a.z }); }
    }
  }
  kill(a, fx, fz, game) {
    a.state = 'dead'; a.deadT = 0; a.speed = 0; a.hp = 0;
    // vurulduğu yönün tersine devrilir
    const side = Math.sin(Math.atan2(a.x - fx, a.z - fz) - a.heading);
    a.roll = side >= 0 ? 1 : -1;
    game.hud?.notify?.(a.sp === 'tiger' ? 'Kaplanı avladın!' : 'Bir geyik avladın.', 3);
    if (a.sp === 'deer') for (const b of this.animals) if (b.herd === a.herd && b.state !== 'dead') this.flee(b, fx, fz);
  }
  // ölü: yana devril, bir süre yat, toprağa gömül; 90 sn sonra adanın uzak bir yerinde yenisi
  updateDead(a, dt, pp, cam) {
    a.deadT += dt;
    const k = Math.min(1, a.deadT / 0.6), sink = Math.max(0, a.deadT - 40) * 0.25;
    a.obj.position.set(a.x, a.y + 0.22 * k - sink, a.z);
    a.obj.rotation.set(0, a.heading, a.roll * Math.PI / 2 * k);
    a.obj.visible = a.deadT < 46;
    if (a.deadT > 90) {
      let s = this.randomSpot();
      for (let t = 0; t < 30 && Math.hypot(s[0] - pp.x, s[1] - pp.z) < 70; t++) s = this.randomSpot();
      a.x = s[0]; a.z = s[1]; a.y = this.world.surfaceHeight(a.x, a.z);
      a.hp = SPEC[a.sp].hp; a.state = 'idle'; a.timer = 3; a.cool = 0; a.obj.visible = true;
      a.respawned++;   // üstüne saplı eski oklar silinsin
      this.place(a);
    }
    void cam;
  }
  // kılıç: önündeki en yakın hayvan
  swordHit(pos, heading, game) {
    const hx = Math.sin(heading), hz = Math.cos(heading);
    let best = null, bd = 1e9;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const dx = a.x - pos.x, dz = a.z - pos.z, d = Math.hypot(dx, dz);
      if (d - SPEC[a.sp].r > SWORD.reach || Math.abs(a.y - pos.y) > 2) continue;
      if (d > 0.6 && (dx * hx + dz * hz) / d < 0.2) continue;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) this.damage(best, SWORD.dmg, pos.x, pos.z, game);
    return !!best;
  }
  // nişan: kamera ışınına en yakın (80 m içinde) canlı hayvanın gövde merkezi, yoksa null
  aimTarget(cpos, cdir) {
    let best = null, bt = 1e9;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const S = SPEC[a.sp], cx = a.x, cy = a.y + S.hc, cz = a.z;
      const t = (cx - cpos.x) * cdir.x + (cy - cpos.y) * cdir.y + (cz - cpos.z) * cdir.z;
      if (t < 2 || t > 80 || t > bt) continue;
      const px = cpos.x + cdir.x * t - cx, py = cpos.y + cdir.y * t - cy, pz = cpos.z + cdir.z * t - cz;
      // gövde boyu + biraz pay (uzakta nişan kolaylığı)
      if (Math.hypot(px, py, pz) < S.L + 0.5 + t * 0.02) { bt = t; best = new THREE.Vector3(cx, cy, cz); }
    }
    return best;
  }
  // ok: p0→p1 doğru parçası hayvanın gövdesine (yatay kapsül) değdi mi
  arrowHit(p0, p1, game) {
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const S = SPEC[a.sp];
      if (Math.abs(a.x - p1.x) > 6 || Math.abs(a.z - p1.z) > 6) continue;
      const fx = Math.sin(a.heading), fz = Math.cos(a.heading), cy = a.y + S.hc;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
        const along = clamp((x - a.x) * fx + (z - a.z) * fz, -S.L, S.L);
        const ax = a.x + fx * along, az = a.z + fz * along;
        if (Math.hypot(x - ax, y - cy, z - az) < S.br) { this.damage(a, ARROW_DMG, p0.x, p0.z, game); return { a, x, y, z }; }
      }
    }
    return null;
  }
}
function turnTo(h, target, rate, dt) {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + clamp(d, -rate * dt, rate * dt);
}
