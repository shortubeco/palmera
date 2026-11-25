// Görevler: işaretler, hedefler, kontrol noktaları
import * as THREE from 'three';
import { WATER_Y } from './world.js';
import { formatMoney } from './util.js';
import { fmtTime, LEAGUES, SIDE_REWARD } from './league.js';

function beamMesh(color, radius = 1.6, height = 60) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24, 1, true), mat);
  cyl.position.y = height / 2;
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
  g.add(cyl, ring);
  g.userData = { mat, ringMat };
  return g;
}

function labelSprite(m, sub) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,8,30,0.85)';
  g.beginPath(); g.roundRect(4, 4, 632, 152, 26); g.fill();
  g.lineWidth = 6; g.strokeStyle = m.color; g.stroke();
  g.fillStyle = m.color; g.beginPath(); g.arc(80, 80, 54, 0, 7); g.fill();
  g.fillStyle = '#000'; g.font = '900 72px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(m.name[0], 80, 84);
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '900 44px Arial Black, Impact, sans-serif';
  g.fillText(m.name, 152, 62);
  g.fillStyle = m.color; g.font = '700 30px Arial, sans-serif';
  g.fillText(sub, 152, 116);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, toneMapped: false, depthWrite: false }));
  s.renderOrder = 8;
  return s;
}

// kind 'league': o ligin görevi (ödül lig kuralına göre azalır, sunucu hesaplar); 'side': yardım görevi (herkese açık, $500)
export const MISSIONS = [
  { id: 'steal', kind: 'league', name: 'Altın Veloce', giver: 'Lola', start: { x: 192, z: -150 }, color: '#ff2fa8',
    intro: 'Altın Veloce GT\'yi çal ve limana getir. Küçük haritadaki sarı çizgiyi takip et.' },
  { id: 'escape', kind: 'side', name: 'Mavi Işıklar', giver: 'Rico', start: { x: -100, z: -31 }, color: '#2f7bff',
    intro: 'Rico: "Polis telsizini dinledim, adını biliyorlar. Üç yıldızla başla ve onları ek — saklan, ara sokaklara dal, görüş alanından çık."' },
  { id: 'delivery', kind: 'side', name: 'Sıcak Paket', giver: 'Mama Tess', start: { x: -260, z: 47 }, color: '#ffb000',
    intro: 'Mama Tess: "Şu paketleri soğumadan dağıtmalısın. Motor kapının önünde. Saat işliyor!"' },
  { id: 'boat', kind: 'side', name: 'Gece Teknesi', giver: 'Kaptan Ruiz', start: { x: 40, z: 434 }, color: '#22e6ff',
    intro: 'Kaptan Ruiz: "Marlin\'e atla, şamandıraları sırayla geç ve kumsal iskelesine yanaş. Sahil güvenlik uyanmadan bitir!"' },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.markers = [];
    this.run = null;   // süren görevin oyun içi süresi (duraklatma hariç) + lig ödülü
    for (const m of MISSIONS) {
      const b = beamMesh(m.color, 1.5, 45);
      const y = game.world.surfaceHeight(m.start.x, m.start.z);
      b.position.set(m.start.x, y, m.start.z);
      game.scene.add(b);
      const label = labelSprite(m, m.kind === 'league' ? 'LİG GÖREVİ · içine gir, E\'ye bas' : `YARDIM GÖREVİ · ${formatMoney(SIDE_REWARD)}`);
      label.position.set(m.start.x, y + 7, m.start.z);
      game.scene.add(label);
      this.markers.push({ m, mesh: b, label });
    }
    this.cpMesh = beamMesh('#ffe14d', 4.5, 40); this.cpMesh.visible = false; game.scene.add(this.cpMesh);
    this.targetMesh = beamMesh('#ff2fa8', 2.2, 25); this.targetMesh.visible = false; game.scene.add(this.targetMesh);
    this.prompt = null;
  }
  // lig görevi yalnız o ligdeki oyuncuya görünür; yardım görevleri herkese
  available(m) { return m.kind === 'side' || this.game.league.mission === m.id; }
  get blips() {
    const out = [];
    if (!this.active) for (const mk of this.markers) if (this.available(mk.m)) out.push({ x: mk.m.start.x, z: mk.m.start.z, color: mk.m.color, label: mk.m.name[0] });
    if (this.objective) out.push({ x: this.objective.x, z: this.objective.z, color: '#ffe14d', label: '★', target: true });
    return out;
  }
  update(dt) {
    const g = this.game, P = g.player;
    const t = g.time;
    for (const mk of this.markers) {
      const on = !this.active && !g.cityHidden && this.available(mk.m);   // Isla Selva'dayken şehir işaretleri de gizli
      mk.mesh.visible = on;
      mk.mesh.userData.mat.opacity = 0.25 + Math.sin(t * 3) * 0.08;
      mk.mesh.rotation.y = t;
      // tabela: uzaktayken büyüsün ki okunabilsin
      mk.label.visible = on;
      const cd = g.camera.position.distanceTo(mk.label.position);
      const k = Math.min(9, Math.max(1, cd / 18));
      mk.label.scale.set(7 * k, 1.75 * k, 1);
      mk.label.position.y = mk.mesh.position.y + 5 + 1.75 * k * 0.5 + Math.sin(t * 2) * 0.2;
    }
    this.prompt = null;
    if (!this.active && !P.dead) {
      let near = null, nearD = Infinity;
      for (const mk of this.markers) {
        if (!this.available(mk.m)) continue;
        const d = Math.hypot(P.pos.x - mk.m.start.x, P.pos.z - mk.m.start.z);
        if (d < nearD) { nearD = d; near = mk; }
      }
      if (near && nearD < 5) {
        const m = near.m;
        if (P.vehicle) this.prompt = `"${m.name}" görevi burada — başlatmak için F ile araçtan in, sonra E'ye bas.`;
        else if (g.police.level > 0) this.prompt = 'Görev için önce aranma seviyeni sıfırla (polisten saklan).';
        else {
          const L = g.league.L;
          this.prompt = m.kind === 'league'
            ? `E: "${m.name}" — ${g.league.title} Ligi görevi. Ödül ${formatMoney(L.start)}'dan başlar, saniyede ${formatMoney(L.decay)} azalır.`
            : `E: "${m.name}" — yardım görevi (${formatMoney(SIDE_REWARD)})`;
          if (g.input.hit('KeyE')) this.start(m);
        }
      } else if (near && nearD < 25 && !P.vehicle) {
        this.prompt = `"${near.m.name}" görev işareti yakında — ışık sütununun içine gir.`;
      } else if (!P.vehicle && g.input.hit('KeyE') && near) {
        g.hud.hint(this.directions(near.m, nearD), 9);
      }
    }
    if (this.active) {
      const r = this.run;
      r.t += dt;
      if (r.league) {
        r.reward = r.league.start - r.league.decay * r.t;
        if (r.reward <= 0) { r.reward = 0; this.fail('Süre doldu: ödül sıfırlandı.'); }
      }
      if (this.active) this.active.update(dt);
    }
    // kontrol noktası / hedef görseli
    if (this.objective) {
      const o = this.objective;
      const mesh = o.kind === 'car' ? this.targetMesh : this.cpMesh;
      (o.kind === 'car' ? this.cpMesh : this.targetMesh).visible = false;
      mesh.visible = true;
      const y = o.kind === 'water' ? WATER_Y : g.world.surfaceHeight(o.x, o.z, 100);
      mesh.position.set(o.x, y, o.z);
      mesh.userData.mat.opacity = 0.3 + Math.sin(t * 5) * 0.1;
    } else { this.cpMesh.visible = false; this.targetMesh.visible = false; }
  }
  // En yakın görevin yerini anlaşılır şekilde tarif et
  directions(m, dist) {
    const g = this.game, P = g.player.pos, f = g.camForward;
    const dx = m.start.x - P.x, dz = m.start.z - P.z;
    const d = Math.hypot(dx, dz) || 1;
    const fwd = (dx * f.x + dz * f.z) / d;
    const right = (dx * -f.z + dz * f.x) / d;
    let rel;
    if (fwd > 0.7) rel = 'tam önünde';
    else if (fwd < -0.7) rel = 'arkanda';
    else if (right > 0) rel = fwd > 0 ? 'sağ önünde' : 'sağ arkanda';
    else rel = fwd > 0 ? 'sol önünde' : 'sol arkanda';
    const letter = m.name[0];
    return `Burada görev yok. En yakın görev "${m.name}", ${Math.round(dist)} metre ${rel}. ` +
      `Mini haritada "${letter}" harfli renkli yuvarlak o yeri gösterir. Oraya gidince yerden göğe uzanan renkli bir ışık sütunu ve üstünde "${letter} · ${m.name}" tabelası göreceksin. ` +
      `Yürüyerek sütunun içine gir; ekranın sol üstünde "E: görevi başlat" yazınca E'ye bas.`;
  }
  start(m) {
    const g = this.game;
    // (saat görevde değişmez: oyun açılışında rastgele seçilir — env.js randomStartHour)
    // hava da her görevde değişir: güneşli %40, bulutlu %30, yağmurlu %30 (art arda aynısı gelmez)
    const WX = ['sun', 'sun', 'cloudy', 'cloudy', 'rain', 'rain', 'sun', 'cloudy', 'rain', 'sun'];
    let w; do { w = WX[Math.floor(Math.random() * WX.length)]; } while (w === this.lastWeather);
    this.lastWeather = w;
    g.env.setWeather(w);
    g.hud.mission(m.name + ' Görevi', m.intro);
    g.hud.big(m.name.toUpperCase(), 'Görev başladı', m.color, 2.5);
    g.audio?.jingle('start');
    const ctor = { steal: StealMission, escape: EscapeMission, delivery: DeliveryMission, boat: BoatMission }[m.id];
    this.run = { t: 0, league: m.kind === 'league' ? LEAGUES[g.league.me.league] : null, reward: 0 };
    if (this.run.league) this.run.reward = this.run.league.start;
    g.league.startMission(m.kind, m.id);
    this.active = new ctor(g, this, m);
  }
  setObjective(text, pos, kind) {
    this.objText = text;
    this.objective = pos ? { x: pos.x, z: pos.z, kind } : null;
    this.game.hud.objective(text);
  }
  finish(success, msg) {
    const g = this.game, a = this.active;
    if (!a) return;
    a.cleanup?.();
    const run = this.run;
    this.active = null; this.objective = null; this.timer = null; this.run = null;
    g.hud.objective('');
    if (success) {
      // ödülü sunucu hesaplar (lig: başlangıç ödülü − kesinti × süre; yardım: sabit)
      // büyük yazı tek kez: sunucu yanıtı gelince (ödül + süre ile); eskiden önce "kaydediliyor…" da çıkıyordu → iki kez görünüyordu
      g.audio?.jingle('win');
      g.league.finishMission(a.m.kind, run.t * 1000).then((r) => {
        if (r.error) { g.hud.big('GÖREV TAMAMLANDI', r.error, '#ff4f6d'); return; }
        if (r.timeout) { g.hud.big('SÜRE DOLDU', 'Ödül sıfırlandı', '#ff4f6d'); return; }
        g.audio?.jingle('money');
        const sub = a.m.kind === 'league'
          ? `+${formatMoney(r.reward)} · süre ${fmtTime(r.timeMs)}${r.newBest ? ' · YENİ REKOR!' : ''}`
          : `+${formatMoney(r.reward)}`;
        // lig atlanmadıysa: tekrar oynamaya teşvik (kullanıcı metni)
        g.hud.big('GÖREV TAMAMLANDI', sub, '#ffe14d', r.levelUp ? 4 : 7, r.levelUp ? '' : 'Oyunun başına dön ve görevi tekrarlayıp daha çok para kazan (ESC\'ye bas).');
        if (r.levelUp) setTimeout(() => g.onLevelUp(r.levelUp), 3000);
      });
    } else {
      g.league.failMission();
      if (!this.silentFail) { g.hud.big('GÖREV BAŞARISIZ', msg || '', '#ff4f6d'); g.audio?.jingle('fail'); }
      g.onMissionFailed?.(a.m, msg);
    }
  }
  fail(msg) { this.finish(false, msg); }
  onPlayerDown(silent) { if (this.active) { this.silentFail = !!silent; this.fail('Görev iptal oldu'); this.silentFail = false; } }
  // sessizce iptal (yeniden başlatırken)
  cancel() {
    const a = this.active; if (!a) return;
    a.cleanup?.();
    this.active = null; this.objective = null; this.timer = null; this.run = null;
    this.game.league.failMission();
    this.game.hud.objective('');
  }
}

class StealMission {
  constructor(g, mgr, m) {
    this.g = g; this.mgr = mgr; this.m = m;
    const spots = [{ x: -53.8, z: -300, h: Math.PI }, { x: 13.8, z: -230, h: 0 }, { x: -133.8, z: -170, h: Math.PI }];
    const s = spots[Math.floor(Math.random() * spots.length)];
    this.car = g.addVehicle('sport', { x: s.x, y: g.world.surfaceHeight(s.x, s.z), z: s.z, heading: s.h, color: '#d4af37', persistent: true });
    this.car.parts.paint.metalness = 0.9; this.car.parts.paint.roughness = 0.2;
    this.car.persistent = true; this.car.missionCar = true;
    this.stage = 0;
    mgr.setObjective('Altın Veloce GT\'yi bul ve çal.', this.car.pos, 'car');
  }
  update() {
    const g = this.g, P = g.player, car = this.car;
    if (car.wrecked) return this.mgr.fail('Araba hurdaya döndü!');
    if (this.stage === 0) {
      this.mgr.objective.x = car.pos.x; this.mgr.objective.z = car.pos.z;
      if (P.vehicle === car) {
        this.stage = 1;
        g.police.setLevel(2);
        g.hud.notify('Alarm çaldı! Polis yolda.');
        this.mgr.setObjective('Arabayı Liman Garajı\'na götür. Önce polisi ek!', g.world.poi.garage, 'ground');
      }
    } else {
      if (P.vehicle !== car) { this.mgr.setObjective('Altın Veloce\'ye geri dön!', car.pos, 'car'); this.stage = 0; return; }
      const gp = g.world.poi.garage;
      const d = Math.hypot(car.pos.x - gp.x, car.pos.z - gp.z);
      if (d < 6) {
        if (g.police.level > 0) { g.hud.hint('Polis peşindeyken garaja giremezsin!'); return; }
        if (car.speed < 3) {
          P.exitVehicle(true);
          g.removeVehicle(car);
          this.mgr.finish(true);
        } else g.hint?.('Yavaşla');
      }
    }
  }
  cleanup() { if (this.g.vehicles.includes(this.car) && this.g.player.vehicle !== this.car) { this.car.persistent = false; this.car.missionCar = false; } }
}

class EscapeMission {
  constructor(g, mgr, m) {
    this.g = g; this.mgr = mgr; this.m = m;
    g.police.setLevel(3);
    for (let i = 0; i < 2; i++) g.police.spawnUnit();
    mgr.setObjective('Polisten kurtul! (3 yıldız)', null);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.g.police.level === 0 && this.t > 1) this.mgr.finish(true);
  }
}

class DeliveryMission {
  constructor(g, mgr, m) {
    this.g = g; this.mgr = mgr; this.m = m;
    const x = -258, z = 40 + 2;
    this.bike = g.addVehicle('moto', { x: -262, y: 0, z: 40 + 4.5, heading: Math.PI / 2, color: '#ffb000', persistent: true });
    this.bike.persistent = true;
    void x; void z;
    this.cps = [{ x: -100, z: 116 }, { x: 100, z: -36 }, { x: 186, z: -300 }, { x: -60, z: -396 }];
    this.i = -1; this.time = 0;
    mgr.setObjective('Kapıdaki motosiklete bin.', this.bike.pos, 'car');
  }
  update(dt) {
    const g = this.g, P = g.player;
    if (this.bike.wrecked && this.i < 0) return this.mgr.fail('Motor parçalandı!');
    if (this.i < 0) {
      if (P.vehicle === this.bike) { this.i = 0; this.time = 55; this.mgr.setObjective('Paket 1/4: işaretli adrese götür!', this.cps[0], 'ground'); }
      return;
    }
    this.time -= dt;
    this.mgr.timer = this.time;
    if (this.time <= 0) return this.mgr.fail('Paketler soğudu! Süre doldu.');
    const cp = this.cps[this.i];
    if (Math.hypot(P.pos.x - cp.x, P.pos.z - cp.z) < 6) {
      g.audio?.jingle('cp');
      this.i++;
      if (this.i >= this.cps.length) { this.mgr.finish(true); return; }
      this.time += 18;
      g.hud.notify('+18 sn');
      this.mgr.setObjective(`Paket ${this.i + 1}/${this.cps.length}: işaretli adrese götür!`, this.cps[this.i], 'ground');
    }
  }
  cleanup() { this.bike.persistent = false; this.mgr.timer = null; }
}

class BoatMission {
  constructor(g, mgr, m) {
    this.g = g; this.mgr = mgr; this.m = m;
    const dock = g.world.poi.dock;
    this.boat = g.addVehicle('boat', { x: dock.x, y: WATER_Y, z: dock.z, heading: 0, persistent: true });
    this.boat.persistent = true;
    this.cps = [{ x: -200, z: 500 }, { x: -460, z: 495 }, { x: -300, z: 520 }, { x: 150, z: 510 }, { x: 380, z: 300 }, { x: 400, z: -60 }, { x: 330, z: -200 }];
    this.i = -1; this.time = 0;
    mgr.setObjective('İskeledeki Marlin teknesine bin.', this.boat.pos, 'car');
  }
  update(dt) {
    const g = this.g, P = g.player;
    if (this.boat.wrecked) return this.mgr.fail('Tekne battı!');
    if (this.i < 0) {
      if (P.vehicle === this.boat) { this.i = 0; this.time = 180; this.mgr.setObjective(`Şamandıra 1/${this.cps.length}`, this.cps[0], 'water'); }
      return;
    }
    this.time -= dt; this.mgr.timer = this.time;
    if (this.time <= 0) return this.mgr.fail('Süre doldu!');
    const cp = this.cps[this.i];
    if (Math.hypot(P.pos.x - cp.x, P.pos.z - cp.z) < 9) {
      g.audio?.jingle('cp');
      this.i++;
      if (this.i >= this.cps.length) { this.mgr.finish(true); return; }
      this.mgr.setObjective(this.i === this.cps.length - 1 ? 'Kumsal iskelesine yanaş!' : `Şamandıra ${this.i + 1}/${this.cps.length}`, this.cps[this.i], 'water');
    }
  }
  cleanup() { this.boat.persistent = false; this.mgr.timer = null; }
}
