// Drift Park: Veloce GT ile caddede hızlan, el frenini çekip kaydır, sarı çizgili park yerine park et.
// Kurallar (kullanıcıyla kararlaştırıldı, 2026-11-26):
//  - Caddenin başında 3-2-1 geri sayım; trafik açık, park yeri hep boş tutulur.
//  - Drift: el freni en az DRIFT_MIN hızda çekilince başlar; el freni tek kullanımlık (Space bırakılınca araç kaldığı hızla yuvarlanır,
//    bir daha çekilemez); gaz ve fren/geri vites kilitli (ileri-geri manevra yok),
//    araç kayıp durduğu yerde kalır → sonuç.
//  - Puanlar (0–100): süre (park oyununun fast süresinde ya da daha hızlı 100, zero süresinde 0, arası doğrusal), hizalama (0° → 100, 15° → 0),
//    ortalama (merkezde 100, köşe çizgiye değince 0). Çarpma cezası: hafif −10, orta −25, sert −50.
//    Toplam = süre + hizalama + ortalama − ceza (≥ 0); en iyi park = hizalama + ortalama (süre dahil değil).
//  - Bitince kamera tam tepeye geçer; ideal konumun hayaleti ve aracın izi görünür.
import * as THREE from 'three';
import { clamp, wrapAngle } from './util.js';

const DRIFT_MIN = 30 / 3.6;   // el freni en az 30 km/sa'te çekilirse drift sayılır
const STOP_V = 0.3;            // bu hızın altında 0,4 sn kalınca araç durmuş sayılır
const MAX_TIME = 90;           // bu süreyi aşan deneme biter
const ALIGN_MAX = 15;          // derece
const GHOST_PAD_W = 0.6, GHOST_PAD_L = 2.0;   // beyaz kesikli hedef bölge: araç + bu kadar (m)
const CLEAR_BEFORE = 100;       // park yerinin önünde bu kadar park şeridi boş tutulur (m)
const RELEASE_GRACE = 3;       // son el freni bırakıldıktan sonra park alanına girmek için süre (sn)
const PASS_MARGIN = 0;         // aracın merkezi sarı park alanının bitiş çizgisini geçer geçmez başarısız (eskiden 8 m pay vardı)

// park oyunları (puan kuralları sunucuda: server/db.php PARKS, aynı id). Izgara: XS/ZS caddeleri, yarı genişlik 7 m;
// sağ park şeridinin ortası cadde ekseninden 5,4 m, sağ sürüş şeridi 2,4 m.
// start: araç konumu + yönü (h: 0 güney +z, π kuzey −z, π/2 doğu +x, −π/2 batı −x)
// route: rotanın köşe kavşakları (sırayla); küçük haritadaki GPS bunlardan geçer (en kısa yol park yerini geçip geri döndürüyordu)
// spot: park yerinin merkezi + uzun ekseni ('z' kuzey-güney, 'x' doğu-batı); pass: son düzlükteki gidiş yönü (park yerini geçti mi)
// align: false → hizalama puanı yok (yola paralel park: araç zaten kendiliğinden hizalanıyor); toplam = süre + ortalama − ceza,
// en iyi park = yalnız ortalama. İleride açılı/dik park yerlerinde align: true.
// minKmh: bu hızın altında Space (el freni) çalışmaz; drift ancak bu hızda ya da üstünde başlar (yoksa DRIFT_MIN)
// brakes: el freni hakkı (varsayılan 1). Son hak dışındakiler köşe drifti (bırakınca araç normale döner);
//   son hak park drifti (gaz/fren kilitli, bırakınca bir daha çekilemez, araç durunca sonuç).
// weather: 'sun' (kuru) | 'cloudy' | 'rain' (ıslak, kaygan zemin: zorluk için); hour: sabit saat (varsayılan 13) — her deneme aynı koşulda
export const PARKS = [
  // Kolay: x = −60 caddesinde dümdüz kuzeye, park yeri sağ şeritte (L: 7 → 14, kullanıcı: 2 kat uzun)
  { id: 1, title: 'Virajsız Park', level: 'Kolay', start: { x: -57.6, z: 190, h: Math.PI }, spot: { x: -54.6, z: -2, axis: 'z' }, pass: { x: 0, z: -1 }, route: [],
    W: 3.2, L: 14.0, fast: 7.5, zero: 20, align: false, minKmh: 70, weather: 'sun' },
  // Orta: x = −220 caddesinde kuzeye 150 m, z = 40 kavşağında sağa (doğu), park yeri dönüşten 205 m sonra sağ şeritte;
  // 2 el freni hakkı: biri köşede, biri park ederken
  { id: 2, title: 'Tek Viraj', level: 'Orta', start: { x: -217.6, z: 190, h: Math.PI }, spot: { x: -15, z: 45.4, axis: 'x' }, pass: { x: 1, z: 0 }, route: [[-220, 40]],
    W: 3.2, L: 14.0, fast: 15, zero: 35, align: false, minKmh: 70, brakes: 2, weather: 'sun' },
  // Zor: x = −140 caddesinde kuzeye, ikinci kavşakta (z = 40) sola (batı), 2 sokak git, x = −300'de sağa (kuzey),
  // park yeri 3. sokak bölümünde (z = −120…−200 arası, ortası −160) sağ şeritte; dönüşten ~200 m
  { id: 3, title: '2 Viraj', level: 'Zor', start: { x: -137.6, z: 190, h: Math.PI }, spot: { x: -294.6, z: -160, axis: 'z' }, pass: { x: 0, z: -1 }, route: [[-140, 40], [-300, 40]],
    W: 3.2, L: 14.0, fast: 22, zero: 48, align: false, minKmh: 70, brakes: 3, weather: 'sun' },   // 3 hak: iki köşe + park
];

export class DriftPark {
  constructor(game) {
    this.game = game;
    this.active = false; this.state = 'off';
    this.vis = new THREE.Group(); this.vis.userData.keep = true; this.vis.visible = false;
    game.scene.add(this.vis);
    this.makeDom();
  }

  // ---------- başlat / bitir ----------
  begin(id) {
    const g = this.game, P = g.player, w = g.world;
    const def = PARKS.find((p) => String(p.id) === String(id)) || PARKS[0];
    // puan kuralları sunucudan (server/db.php PARKS → oyun.php PARK_CFG); yerleşim burada
    const sc = window.PARK_CFG?.[def.id];
    if (sc) Object.assign(def, { title: sc.title, level: sc.level, fast: sc.fast, zero: sc.zero, align: sc.align });
    this.def = def;
    this.lastId = def.id;   // 'Oyunun başına dön' kapatılmış olsa da bu park oyununun başına götürür
    this.runId = null;
    // park yeri: sağ park şeridi; ang = uzun eksenin yönü (0: z boyunca, π/2: x boyunca)
    this.spot = { x: def.spot.x, z: def.spot.z, ang: def.spot.axis === 'x' ? Math.PI / 2 : 0, W: def.W, L: def.L };
    // dünya eksenlerinde yarı boyutlar (çizgiler, boşaltma)
    this.spot.ex = def.spot.axis === 'x' ? def.L / 2 : def.W / 2;
    this.spot.ez = def.spot.axis === 'x' ? def.W / 2 : def.L / 2;
    this.spot.y = w.surfaceHeight(this.spot.x, this.spot.z);
    // önceki deneme: aracı kaldır
    if (P.vehicle) P.exitVehicle(true);
    if (this.car && g.vehicles.includes(this.car)) g.removeVehicle(this.car);
    const sx = def.start.x, sz = def.start.z, h = def.start.h;
    this.car = g.addVehicle('sport', { x: sx, y: w.surfaceHeight(sx, sz), z: sz, heading: h, color: '#d4d4cf', persistent: true });
    this.car.persistent = true;
    // çarpma cezası: aracın hasar olayları (aynı çarpışma 0,6 sn içinde bir kez sayılır)
    const orig = this.car.damage.bind(this.car);
    this.car.damage = (a, gm) => { orig(a, gm); this.onHit(a); };
    P.respawn(sx, sz, h); P.enterVehicle(this.car);
    g.cam.yaw = h; g.cam.pitch = 0.2; g._camInit = false;
    this.active = true; this.state = 'count'; this.cd = 3.2; this.t = 0; this.stillT = 0; this.crawlT = 0; this.outT = 0;
    this.hits = []; this.lastHit = -9; this.slowWarn = -9; this.hbLeft = def.brakes || 1; this.lastWarned = false; this.showBrakes(); this.result = null; this.lastCount = null;
    this.clearSpot();
    this.buildVisuals();
    // küçük haritada park yeri: görev hedefi gibi yıldız + sarı GPS çizgisi (köşeli rotalarda yolu gösterir)
    this.wp = 0;
    g.missions.objective = { x: this.spot.x, z: this.spot.z, kind: 'ground', path: (def.route || []).slice() };
    if (g.hud) { g.hud.route = null; g.hud.routeT = 0; }
    this.dom.result.style.display = 'none';
    this.dom.timer.style.display = 'block'; this.dom.timer.textContent = '0,00';
    g.police?.setLevel?.(0);
    // hava ve saat: her denemede aynı (adil); yağmur ıslak zemin = kaygan (vehicles.js surf)
    g.env.hour = def.hour ?? 13;
    g.env.setWeather(def.weather || 'sun');
    g.env.envTimer = 0;
    g.audio?.setDrift?.(true);   // Drift Park müziği: geri sayımda giriş
    // sağ üst rozet: bu park oyunu + rekorlar (ilk açılışta sunucudan alınır)
    if (g.league.parkBest || g.league.offline) g.league.updateBadge(); else g.league.refreshParks();
  }
  end() {
    const g = this.game;
    this.active = false; this.state = 'off';
    g.audio?.setDrift?.(false);   // Drift Park müziği susar
    g.league.updateBadge();   // rozet: KEŞİF
    this.vis.visible = false;
    if (!g.missions.active) g.missions.objective = null;
    for (const s of this.closedSpots || []) s.cooldown = 0;   // kapatılan park noktaları yeniden kullanılabilir
    this.closedSpots = null;
    for (const k of ['timer', 'gauge', 'result', 'warn', 'brakes']) this.dom[k].style.display = 'none';
    if (this.car) { this.car.persistent = false; this.car.controls.handbrake = false; }
    g._camInit = false;
  }

  // park yerindeki park etmiş araçları kaldır (park yeri hep boş)
  // park yerinin CLEAR_BEFORE (100 m) önünden 10 m arkasına kadar park şeridi (son düzlüğün yönüne göre) boş: drift'e yer kalsın.
  // (yalnız park yerini boşaltınca hemen önüne park etmiş araç drift'i engelliyordu)
  clearZone(x, z, pad = 0) {
    const S = this.spot, pd = this.def.pass, px = x - S.x, pz = z - S.z;
    const along = px * pd.x + pz * pd.z, lat = Math.abs(px * pd.z - pz * pd.x);   // lat: park yerinin ekseninden yana uzaklık
    return along > -(S.L / 2 + CLEAR_BEFORE + pad) && along < S.L / 2 + 10 + pad && lat < S.W / 2 + 2 + pad;
  }
  clearSpot() {
    const g = this.game;
    for (const v of g.vehicles.slice()) {
      if (v === this.car || v.driver === 'player') continue;
      if (this.clearZone(v.pos.x, v.pos.z, 1)) g.removeVehicle(v);
    }
    // bu aralıktaki park noktaları deneme boyunca kapalı (end'de ya da başka park oyunu başlarken açılır)
    for (const s of this.closedSpots || []) s.cooldown = 0;
    this.closedSpots = [];
    for (const s of g.world.parkingSpots) if (this.clearZone(s.x, s.z, 2)) { s.vehicle = null; s.cooldown = 1e9; this.closedSpots.push(s); }
  }

  // ---------- görseller: sarı çizgiler, uzaktan görünen ışık, (sonuçta) ideal konum hayaleti ----------
  buildVisuals() {
    const G = this.vis;
    for (const c of G.children.slice()) { G.remove(c); c.geometry?.dispose(); }
    const S = this.spot, y = S.y + 0.03, lw = 0.16;
    const yellow = new THREE.MeshBasicMaterial({ color: '#ffd21a', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const line = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, z1 - z0), yellow); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); G.add(m); };
    const hx = S.ex, hz = S.ez;
    line(S.x - hx, S.z - hz, S.x + hx, S.z - hz + lw); line(S.x - hx, S.z + hz - lw, S.x + hx, S.z + hz);
    line(S.x - hx, S.z - hz, S.x - hx + lw, S.z + hz); line(S.x + hx - lw, S.z - hz, S.x + hx, S.z + hz);
    // ortada artı işareti (merkezi gösterir)
    line(S.x - 0.4, S.z - 0.04, S.x + 0.4, S.z + 0.04); line(S.x - 0.04, S.z - 0.4, S.x + 0.04, S.z + 0.4);
    // uzaktan görünen sarı ışık sütunu (yaklaşınca solar)
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#ffd21a', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    // binaların (≤ 23 m) üstünden de görünsün: köşeli rotalarda park yeri arkada kalıyor
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 60, 20, 1, true), this.beamMat);
    beam.position.set(S.x, S.y + 30, S.z); G.add(beam); this.beam = beam;
    // sonuç için: ideal konum hayaleti (beyaz kesik çizgi) + aracın izi (camgöbeği)
    const cl = this.car ? this.car.cfg.len : 4.5, cw = this.car ? this.car.cfg.wid : 1.9;
    const rect = (w, l, col, dashed) => {
      const pts = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2], [-w / 2, -l / 2]].map(([a, b]) => new THREE.Vector3(a, 0, b));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.Line(geo, dashed ? new THREE.LineDashedMaterial({ color: col, dashSize: 0.3, gapSize: 0.2, toneMapped: false, depthTest: false })
        : new THREE.LineBasicMaterial({ color: col, toneMapped: false, depthTest: false }));
      if (dashed) m.computeLineDistances();
      m.renderOrder = 9; m.visible = false; G.add(m); return m;
    };
    // hedef bölge: araçtan biraz büyük (tam araç boyunda hiçbir sürücü içine sığdıramıyordu); yalnız görsel, puanı etkilemez
    this.ghost = rect(cw + GHOST_PAD_W, cl + GHOST_PAD_L, '#ffffff', true); this.ghost.position.set(S.x, S.y + 0.08, S.z); this.ghost.rotation.y = S.ang;
    this.trace = rect(cw, cl, '#22e6ff', false);
    G.visible = true;
  }

  // ---------- kontroller (oyuncu girdisinden sonra, araç fiziğinden önce) ----------
  control() {
    if (!this.active || !this.car) return;
    const v = this.car, c = v.controls;
    // geri sayım / sonuç: araç yerinde kilitli (fren değil el freni: duran araçta fren geri vitese geçiriyordu)
    if (this.state === 'count' || this.state === 'result') {
      c.throttle = 0; c.brake = 0; c.handbrake = true; c.steer = 0;
      if (this.state === 'count') { v.vx = v.vz = 0; v.angVel = 0; }
      return;
    }
    // köşe drifti: Space basılıyken el freni; bırakınca hak düşer, araç normale döner (gaz/fren serbest)
    if (this.state === 'corner' && !c.handbrake) {
      this.state = 'run'; this.hbLeft--;
      this.capBrakes();
    }
    if (this.state === 'run' && c.handbrake) {
      const min = this.def.minKmh ? this.def.minKmh / 3.6 : DRIFT_MIN;
      if (Math.abs(v.forwardSpeed) >= min) {
        if (this.hbLeft > 1) this.state = 'corner';
        else { this.state = 'slide'; this.hbUsed = false; }
      }
      else {
        c.handbrake = false;   // yavaşken Space çalışmaz
        if (this.t - (this.slowWarn ?? -9) > 2) { this.slowWarn = this.t; this.flash(`El freni için en az ${Math.round(min * 3.6)} km/sa`, 1.8); }
      }
    }
    // el freni tek kullanımlık: Space basılıyken çalışır; bırakılınca araç kaldığı hızla yuvarlanır ve el freni bir daha
    // çekilemez (ikinci Space ile tam ortada durmak engellenir). Gaz, fren ve geri vites kapalı; direksiyon serbest.
    if (this.state === 'slide') {
      c.throttle = 0; c.brake = 0;
      if (!c.handbrake && !this.hbUsed) { this.hbUsed = true; this.hbLeft = 0; this.showBrakes(); }
      if (this.hbUsed) {
        c.handbrake = false;
        if (this.game.input.hit('Space')) this.flash('El freni hakkın bitti', 1.6);   // ikinci basış: uyarı
      }
    }
  }

  onHit(a) {
    if (this.state !== 'run' && this.state !== 'slide' && this.state !== 'corner') return;
    if (this.t - this.lastHit < 0.6) return;
    this.lastHit = this.t;
    const pen = a < 25 ? 10 : a < 90 ? 25 : 50;
    this.hits.push(pen);
    this.flash(`Çarpma cezası −${pen}`, 1.5);
  }

  // ---------- her kare ----------
  update(dt) {
    if (!this.active) return;
    const g = this.game, P = g.player, v = this.car, S = this.spot;
    // ışık sütunu: uzaktan belirgin, yaklaşınca solar
    const dS = Math.hypot(v.pos.x - S.x, v.pos.z - S.z);
    g.missions.cpMesh.visible = false;   // görevlerin büyük hedef sütunu park yerini kapatmasın (kendi ışığımız var)
    // GPS: geçilen köşe rotadan düşer (çizgi hep ileriyi gösterir)
    const rt = this.def.route || [];
    if (this.wp < rt.length && Math.hypot(v.pos.x - rt[this.wp][0], v.pos.z - rt[this.wp][1]) < 14) {
      this.wp++;
      // virajı drift'siz döndüyse de o virajın hakkı düşer (yoksa son Space köşe drifti sayılıp park edilemiyordu)
      if (this.state !== 'corner') this.capBrakes();
      if (g.missions.objective) g.missions.objective.path = rt.slice(this.wp);
      if (g.hud) g.hud.routeT = 0;
    }
    this.beamMat.opacity = clamp((dS - 12) / 60, 0.04, 0.32);
    if (this.state === 'count') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0 && n <= 3) { g.hud.big(String(n), this.def.title + ' · ' + this.def.level, '#ffd21a', 0.9); g.audio?.jingle?.('cp'); }
      }
      if (this.cd <= 0) {
        // sunucuya: deneme başladı (çevrimdışı testte gönderilmez)
        if (!g.league.offline) this.runId = g.league.api('pstart', { park: this.def.id }).then((j) => (j.ok ? j.id : null));
        g.audio?.driftGo?.();   // müzik: tam parça
        this.state = 'run'; g.hud.big('BAŞLA!', 'Hızlan, el frenini çek ve park yerine kay', '#22e6ff', 1.2); g.audio?.jingle?.('start');
      }
      return;
    }
    if (this.state === 'result') return;
    this.t += dt;
    this.dom.timer.textContent = fmt(this.t);
    if (P.vehicle !== v) return this.finish(false, 'Araçtan indin.');
    if (v.wrecked || v.burning > 0) return this.finish(false, 'Araç hurdaya döndü.');
    if (this.t > MAX_TIME) return this.finish(false, 'Süre doldu.');
    // park yerini geçti (gidiş yönünde park yerinin sonundan 8 m ileride): başarısız
    { const pd = this.def.pass, px = v.pos.x - S.x, pz = v.pos.z - S.z;
      const along = px * pd.x + pz * pd.z, lat = Math.abs(px * pd.z - pz * pd.x);   // son düzlük boyunca ilerleme, düzlükten uzaklık
      if (along > S.L / 2 + PASS_MARGIN && lat < 12) return this.finish(false, 'Park yerini geçtin.'); }
    // canlı göstergeler (park yerine 30 m'den yakınken)
    const m = this.measure();
    const show = dS < 30;
    this.dom.gauge.style.display = show ? 'block' : 'none';
    if (show) {
      this.dom.gA.row.style.display = this.def.align === false ? 'none' : 'flex';
      setBar(this.dom.gA, m.align, `${dec(m.err, 1)}°`);
      setBar(this.dom.gC, m.inside ? m.center : 0, m.inside ? `${dec(m.off, 2)} m` : 'dışarıda');
    }
    // drift sonrası araç durunca sonuç
    if (this.state === 'slide') {
      const spd = Math.abs(v.speed);
      this.stillT = spd < STOP_V ? this.stillT + dt : 0;
      // park alanının içinde durdu: sonuç
      if (this.stillT > 0.4 && m.inside) return this.finish(true);
      // son el freni bırakıldı ya da araç dışarıda durdu: 3 sn içinde park alanına girmezse başarısız
      // (hemen değil — bu sürede süzülüp girebilir; eskiden araç sürtünmesiz yuvarlanıp oyuncu caddede kalakalıyordu)
      if (this.hbUsed || this.stillT > 0.4) {
        this.outT = m.inside ? 0 : (this.outT || 0) + dt;
        if (this.outT >= RELEASE_GRACE) return this.finish(false, this.hbUsed ? 'El freni bırakıldığında park alanının içinde değildin.' : 'Park alanının dışında kaldın.');
      }
      if (this.hbUsed) {
        this.crawlT = m.inside && spd < 1.0 ? (this.crawlT || 0) + dt : 0;   // park alanında çok yavaş yuvarlanıyor: beklemeden sonuç
        if (this.crawlT > 0.8) return this.finish(true);
      }
    }
  }

  // aracın park yerine göre durumu: hizalama hatası, merkezden uzaklık, dört köşe içeride mi, puanlar
  measure() {
    const v = this.car, S = this.spot;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = fz, rz = -fx;
    const ca = Math.cos(S.ang), sa = Math.sin(S.ang);
    const loc = (x, z) => { const dx = x - S.x, dz = z - S.z; return [dx * ca - dz * sa, dx * sa + dz * ca]; };   // [enine, boyuna]
    const hl = v.cfg.len / 2, hw = v.cfg.wid / 2;
    let inside = true;
    for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) {
      const [u, w] = loc(v.pos.x + fx * a + rx * b, v.pos.z + fz * a + rz * b);
      if (Math.abs(u) > S.W / 2 || Math.abs(w) > S.L / 2) inside = false;
    }
    let e = Math.abs(wrapAngle(v.heading - S.ang)); if (e > Math.PI / 2) e = Math.PI - e;   // ileri ya da geri bakması fark etmez
    const err = e * 180 / Math.PI;
    const [u, w] = loc(v.pos.x, v.pos.z);
    const slackW = Math.max(0.05, (S.W - v.cfg.wid) / 2), slackL = Math.max(0.05, (S.L - v.cfg.len) / 2);
    const ratio = Math.max(Math.abs(u) / slackW, Math.abs(w) / slackL);
    return {
      inside, err, off: Math.hypot(u, w),
      align: Math.round(100 * clamp(1 - err / ALIGN_MAX, 0, 1)),
      center: Math.round(100 * clamp(1 - ratio, 0, 1)),
    };
  }

  finish(parked, why) {
    const g = this.game, v = this.car, d = this.def;
    this.state = 'result';
    this.dom.gauge.style.display = 'none';
    const m = this.measure();
    const ok = parked && m.inside;
    const time = Math.round(this.t * 100) / 100;
    // süre puanı: fast saniyede ya da daha hızlı 100, zero saniyede 0, arası doğrusal (her salise fark eder)
    const timeScore = ok ? Math.round(100 * clamp((d.zero - time) / (d.zero - d.fast), 0, 1)) : 0;
    const penalty = this.hits.reduce((a, b) => a + b, 0);
    const useAlign = d.align !== false, align = useAlign ? m.align : 0;
    const R = this.result = ok
      ? { ok, useAlign, time, timeScore, align, err: m.err, center: m.center, off: m.off, penalty, total: Math.max(0, timeScore + align + m.center - penalty), park: align + m.center }
      : { ok, why: why || 'Park alanının dışında kaldın.', time, penalty };
    // tepeden görüntü: ideal konum (kesik beyaz) + aracın izi
    this.ghost.visible = true;
    this.trace.visible = true;
    this.beam.visible = false;   // tepeden bakınca park yerinin ortasında koyu daire gibi duruyordu
    this.trace.position.set(v.pos.x, this.spot.y + 0.1, v.pos.z); this.trace.rotation.y = v.heading;
    this.topT = 0;
    g.audio?.setDrift?.(false);   // müzik yavaşça susar
    g.audio?.jingle?.(ok ? 'win' : 'fail');
    this.showResult(R);
    this.submit(R, m);
  }

  // sunucuya sonuç: park edildiyse puanlar (süre puanı ve toplamı sunucu yeniden hesaplar), değilse başarısız
  async submit(R, m) {
    const g = this.game, p = this.runId; this.runId = null;
    if (g.league.offline || !p) { if (R.ok) this.records(g.league.offline ? { note: 'Çevrimdışı test: sonuç kaydedilmedi.' } : { note: 'Sonuç kaydedilemedi (deneme kaydı yok).' }); return; }
    const id = await p; if (!id) { if (R.ok) this.records({ note: 'Sonuç kaydedilemedi.' }); return; }
    if (!R.ok) { g.league.api('pfail', { id }); return; }
    const j = await g.league.api('pfinish', { id, ms: Math.round(R.time * 1000), center: R.center, align: m.align, penalty: R.penalty });
    if (this.result !== R) return;   // bu arada yeni deneme başladı
    this.records(j.ok ? j : { note: 'Sonuç kaydedilemedi: ' + (j.error || '') });
    if (j.ok && j.best) { g.league.parkBest = { ...(g.league.parkBest || {}), [this.def.id]: j.best }; g.league.updateBadge(); }   // rozet: yeni rekor
  }

  // sonuçta kamera: park yerinin tam tepesinden (yavaşça iner)
  camera(cam, dt) {
    if (!this.active || this.state !== 'result') return false;
    const S = this.spot;
    this.topT = Math.min(1, (this.topT || 0) + dt * 1.5);
    const k = 1 - (1 - this.topT) ** 3;
    // park alanı her iki yönde 1,5 kat payla sığsın (ekranın dikeyi z, yatayı x; yatay görüş açısı en-boy oranıyla genişler)
    const tanV = Math.tan(25 * Math.PI / 180), aspect = cam.aspect || innerWidth / innerHeight;
    const fit = Math.max(S.ez * 1.5 / tanV, S.ex * 1.5 / (tanV * aspect));
    const h = fit + 16 * (1 - k);   // yukarıdan inerek yaklaşır
    cam.position.set(S.x, S.y + h, S.z + 0.01);
    cam.lookAt(S.x, S.y, S.z);
    cam.fov = 50; cam.updateProjectionMatrix();
    return true;
  }

  // ---------- ekran öğeleri ----------
  makeDom() {
    const el = (css, parent = document.body) => { const d = document.createElement('div'); d.style.cssText = css; parent.appendChild(d); return d; };
    const timer = el('position:fixed;top:18px;left:50%;transform:translateX(-50%);font:900 34px Georgia,serif;color:#ffe9b0;text-shadow:0 0 4px #000,0 0 10px #000;z-index:6;display:none;pointer-events:none');
    const gauge = el('position:fixed;bottom:120px;left:50%;transform:translateX(-50%);width:320px;padding:10px 14px;background:rgba(12,8,24,.72);border-radius:10px;z-index:6;display:none;pointer-events:none;font:700 14px Arial,sans-serif;color:#fff');
    const bar = (label) => {
      const row = el('display:flex;align-items:center;gap:8px;margin:4px 0', gauge);
      el('width:92px', row).textContent = label;
      const track = el('flex:1;height:12px;background:#2a2340;border-radius:6px;overflow:hidden', row);
      const fill = el('height:100%;width:0;background:#ff4f6d;border-radius:6px', track);
      const val = el('width:70px;text-align:right', row);
      return { fill, val, row };
    };
    const gA = bar('Hizalama'), gC = bar('Park Puanı');
    const result = el('position:fixed;top:50%;right:4%;transform:translateY(-50%);width:340px;padding:18px 22px;background:rgba(12,8,24,.9);border:2px solid #ffd21a;border-radius:14px;z-index:20;display:none;font:15px Arial,sans-serif;color:#fff');
    // ekranın ortasında kısa uyarı (yan taraftaki bildirim fark edilmiyordu)
    const warn = el('position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);padding:10px 22px;background:rgba(12,8,24,.78);border:2px solid #ffd21a;border-radius:10px;font:900 26px Georgia,serif;color:#ffd21a;text-shadow:0 0 6px #000;z-index:7;display:none;pointer-events:none;white-space:nowrap;transition:opacity .25s');
    // el freni hakları (sürenin altında)
    const brakes = el('position:fixed;top:64px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;font:900 22px Arial,sans-serif;color:#ffe9b0;text-shadow:0 0 4px #000,0 0 8px #000;z-index:6;display:none;pointer-events:none;white-space:nowrap');
    this.dom = { timer, gauge, gA, gC, result, warn, brakes };
  }
  // geçilen viraj sayısı kadar hak harcanmış sayılır: kalan hak en çok (toplam − geçilen viraj); son virajdan sonra tam 1 (park)
  capBrakes() {
    const before = this.hbLeft;
    this.hbLeft = Math.min(this.hbLeft, (this.def.brakes || 1) - this.wp);
    this.showBrakes();
    if (this.hbLeft === 1 && (before !== 1 || this.state === 'run') && (this.def.brakes || 1) > 1 && !this.lastWarned) { this.lastWarned = true; this.flash('Son el freni: park et!', 1.8); }
  }
  showBrakes() {
    const n = this.def.brakes || 1, b = this.dom.brakes;
    b.style.display = this.active ? 'flex' : 'none';
    // büyük yazı + büyük yuvarlaklar (küçükken fark edilmiyordu): dolu sarı = kalan hak, gri = kullanılan
    const dot = (on) => `<span style="display:inline-block;width:22px;height:22px;border-radius:50%;box-sizing:border-box;` +
      (on ? 'background:#ffd21a;border:2px solid #fff3b0;box-shadow:0 0 10px #ffd21a,0 0 3px #000' : 'background:#3a3a3a;border:2px solid #777;box-shadow:0 0 3px #000') + '"></span>';
    b.innerHTML = '<span>El freni</span>' + dot(true).repeat(Math.max(0, this.hbLeft)) + dot(false).repeat(Math.max(0, n - this.hbLeft));
  }
  flash(text, dur = 1.6) {
    const w = this.dom.warn;
    w.textContent = text; w.style.display = 'block'; w.style.opacity = '1';
    clearTimeout(this._wT1); clearTimeout(this._wT2);
    this._wT1 = setTimeout(() => { w.style.opacity = '0'; }, dur * 1000);
    this._wT2 = setTimeout(() => { w.style.display = 'none'; }, dur * 1000 + 300);
  }
  showResult(R) {
    const g = this.game, box = this.dom.result;
    const row = (a, b, c = '') => `<div style="display:flex;justify-content:space-between;gap:8px;margin:6px 0"><span>${a}</span><span style="color:#bbb;flex:1;text-align:right">${c}</span><b style="width:44px;text-align:right">${b}</b></div>`;
    box.innerHTML = R.ok
      ? `<div style="font:900 24px Georgia,serif;color:#ffd21a;margin-bottom:8px">PARK ETTİN!</div>`
        + row('Park Süresi', R.timeScore, `${fmt(R.time)} sn`)
        + (R.useAlign ? row('Hizalama', R.align, `${dec(R.err, 1)}° sapma`) : '')
        + row('Park Puanı', R.center, `merkezden ${dec(R.off, 2)} m`)
        + row('Çarpma cezası', R.penalty ? '−' + R.penalty : '0')
        + `<hr style="border-color:#444">` + row('TOPLAM PUAN', R.total) + row('En iyi park puanı', R.park, R.useAlign ? 'hizalama + park puanı' : '')
      : `<div style="font:900 24px Georgia,serif;color:#ff4f6d;margin-bottom:8px">BAŞARISIZ OLDUN</div><div style="margin:8px 0">${R.why}</div>`;
    box.innerHTML += `<div style="display:flex;gap:10px;margin-top:14px"><button data-a="again" style="flex:1;padding:10px;font:700 15px Arial;background:#ffd21a;border:0;border-radius:8px;cursor:pointer">Tekrar dene (Enter)</button><button data-a="close" style="padding:10px 14px;font:700 15px Arial;background:#444;color:#fff;border:0;border-radius:8px;cursor:pointer">Kapat</button></div>`;
    box.style.display = 'block';
    box.querySelector('[data-a=again]').onclick = () => this.again();
    box.querySelector('[data-a=close]').onclick = () => this.close();
    // imleç serbest kalsın (düğmelere tıklanabilsin); bu bırakma duraklatma sanılmasın
    if (document.pointerLockElement) { g.expectUnlock = true; document.exitPointerLock(); }
    // Enter: tekrar dene. (ESC kısayolu yok: ESC duraklatma menüsünü açar; ikisi aynı anda çalışınca Drift Park kapanıyordu)
    this.onKey = (e) => { if (e.code === 'Enter') this.again(); };
    addEventListener('keydown', this.onKey);
  }
  // sonuç panelinin altı: oyuncunun bu park oyunundaki üç rekoru + sırası (yeni rekor işaretli)
  records(j) {
    const box = this.dom.result; let el = box.querySelector('.recs');
    if (!el) { el = document.createElement('div'); el.className = 'recs'; el.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #444;font-size:14px'; box.insertBefore(el, box.lastElementChild); }
    if (j.note) { el.innerHTML = `<div style="color:#bbb">${j.note}</div>`; return; }
    const B = j.best, N = j.newBest || {};
    const line = (label, val, rank, isNew) => `<div style="display:flex;justify-content:space-between;gap:8px;margin:4px 0"><span>${label}</span><span><b>${val}</b> <span style="color:#bbb">· ${rank}. / ${B.players}</span>${isNew ? ' <b style="color:#3ddc84">YENİ REKOR!</b>' : ''}</span></div>`;
    el.innerHTML = '<div style="color:#ffd21a;font-weight:700;margin-bottom:4px">Rekorların</div>'
      + line('En kısa süre', fmt(B.timeMs / 1000) + ' sn', B.timeRank, N.time)
      + line('Toplam puan', B.total, B.totalRank, N.total)
      + line('En iyi park', B.park, B.parkRank, N.park);
  }
  hideResult() {
    this.dom.result.style.display = 'none';
    if (this.onKey) { removeEventListener('keydown', this.onKey); this.onKey = null; }
    const g = this.game; g.wantLock = true; g.lock();
  }
  again() { this.hideResult(); this.begin(this.def.id); }
  close() { this.hideResult(); this.end(); }
}

function fmt(t) { return t.toFixed(2).replace('.', ','); }
function dec(x, n) { return x.toFixed(n).replace('.', ','); }   // Türkçe ondalık
function setBar(b, p, txt) {
  b.fill.style.width = p + '%';
  b.fill.style.background = p >= 80 ? '#3ddc84' : p >= 45 ? '#ffd21a' : '#ff4f6d';
  b.val.textContent = txt;
}
