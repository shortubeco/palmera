// Havaalanları ve uçuşlar: Palmera (Isla Faro) ↔ uzak şehirler.
// Akış: kalkış tabelasında E → şehir seç (bilet) → uçağın merdiveninde F → kalkış sahnesi → beyaz bulut geçişi
// (bu sırada eski bölge silinir, gidilen yüklenir) → iniş sahnesi: doğudan alçalır, piste değer, frenler,
// pistin batı ucunda U dönüşüyle park yerine gelir, motorlar susar → F ile in.
// Tek uçak vardır: oyuncu hangi havaalanındaysa orada bekler.
import * as THREE from 'three';
import { textDecal } from './textures.js';

// Casablanca: uzak slot (Palmera kumsalından ~2,9 km doğuda; kamera 2,6 km'den ötesini çizmez).
// Şehir (js/regions/casablanca.js) bu noktanın çevresinde, kendi yerel ekseninde kurulur.
export const CASA = { x: 3200, z: 200 };
// Casablanca pisti (yerel eksen): şehrin batısında denizde, taş dolgu üstünde; uçak DOĞU ucunda (şehre yakın) durur,
// pist ekseni batı surundaki şehir kapısının (casablanca.js GATE, x −155, z −14,3) hizasında
export const CASA_RW = { x0: -860, x1: -260, z: -14.3, hw: 17, y: 8.6 };

// plane: uçağın park yeri (pistin batı ucu, burun +x yönünde, heading π/2); exit: merdivenin dibi;
// board: kalkış tabelası (ön yüzü +z); rwX1: pistin doğu ucu (iniş doğudan, tekerlek bu ucun 40 m içinde yere değer)
// dir −1: her şey x'te aynalı (uçak pistin doğu ucunda batıya bakar, iniş batıdan gelir; rwX1 o zaman batı uç)
const CP = { x: CASA.x + CASA_RW.x1 - 18, z: CASA.z + CASA_RW.z };
export const AIRPORTS = {
  palmera: { title: 'Palmera City', region: null, board: { x: -405, z: 607.5 }, plane: { x: -418, z: 660, heading: Math.PI / 2 }, exit: { x: -409, z: 651.6 }, rwX1: -40 },
  casablanca: { title: 'Casablanca', region: 'casablanca', dir: -1, board: { x: CP.x - 3, z: CP.z + 27 }, plane: { x: CP.x, z: CP.z, heading: -Math.PI / 2 }, exit: { x: CP.x - 9, z: CP.z + 8.4 }, rwX1: CASA.x + CASA_RW.x0 },
};

// iniş yolu (park yerine göre): doğudan batıya süzülüş → yere değme → frenleme → batı ucunda sola U dönüşü → park
const LAND = { glide: 620, alt: 44, vAir: 68, vTaxi: 6, R: 7, park: 10 };
function landingPath(A, groundY) {
  // aynalı havaalanında (dir −1) yol park yerinden geçen x = p.x doğrusuna göre aynalanır
  const d = A.dir || 1, p = A.plane, mx = (x) => p.x + d * (x - p.x);
  const R = LAND.R, xc = p.x - LAND.park, zr = p.z - 2 * R, xt = mx(A.rwX1) - 40;
  const L1 = LAND.glide, L2 = xt - xc, L3 = Math.PI * R, L4 = LAND.park;
  const total = L1 + L2 + L3 + L4;
  // s (yol boyu, m) → { x, y, z, h (heading), v (hız), pitch, ground }
  return {
    total, touch: L1,
    at(s) {
      const k = this.local(s);
      if (d < 0) { k.x = mx(k.x); k.h = -k.h; }
      return k;
    },
    local(s) {
      if (s < L1) {   // süzülüş: hafif burun yukarı, sonda burnu kaldırıp yumuşak değme
        const u = s / L1, x = xt + (L1 - s);
        const y = groundY + LAND.alt * Math.pow(1 - u, 1.35);
        return { x, y, z: zr, h: -Math.PI / 2, v: LAND.vAir, pitch: 0.05 + Math.max(0, u - 0.85) * 0.5, ground: false };
      }
      s -= L1;
      if (s < L2) {   // frenleme: hız² doğrusal azalır
        const u = s / L2, v = Math.sqrt(LAND.vAir ** 2 * (1 - u) + LAND.vTaxi ** 2 * u);
        return { x: xt - s, y: groundY, z: zr, h: -Math.PI / 2, v, pitch: Math.max(0, 0.12 - s * 0.004), ground: true };
      }
      s -= L2;
      if (s < L3) {   // U dönüşü (sola): batıya giderken başlar, doğuya bakarak biter
        const f = s / R;
        return { x: xc - R * Math.sin(f), y: groundY, z: zr + R - R * Math.cos(f), h: Math.atan2(-Math.cos(f), Math.sin(f)), v: LAND.vTaxi, pitch: 0, ground: true };
      }
      s = Math.min(s - L3, L4);   // park yerine yavaşça yaklaş
      return { x: xc + s, y: groundY, z: p.z, h: Math.PI / 2, v: Math.max(0.8, LAND.vTaxi * Math.sqrt(1 - s / L4)), pitch: 0, ground: true };
    },
  };
}
// her havaalanından gidilebilen yerler: [hedef, bilet fiyatı]
export const ROUTES = {
  palmera: [['casablanca', 150]],
  casablanca: [['palmera', 150]],
};
// uçağın gövde çarpışma kutusu (park yerinde): world.addBox ile eklenir
export function planeCollider(world, A) {
  const p = A.plane, gy = world.surfaceHeight(p.x, p.z);   // pist yüksekliği (Casablanca 8,6 m)
  world.addBox(p.x - 15, p.x + 15, p.z - 2.1, p.z + 2.1, gy - 5, gy + 5, 'plane');
  // merdiven (buildPlane: yerel x 2,05…5,65, z 8,45…9,55): oyuncu içinden geçmesin, dibinde dursun
  const h = p.heading, sx = Math.cos(h), sz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const lx of [FUSE_R + 0.15, FUSE_R + 0.15 + 3.6]) for (const lz of [8.4, 9.6]) {
    const wx = p.x + sx * lx + fx * lz, wz = p.z + sz * lx + fz * lz;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  world.addBox(x0, x1, z0, z1, gy - 5, gy + 4, 'plane');
}

// ---------- uçak modeli (kodla): burun yerel +Z, tekerlek altı y = 0 ----------
const FUSE_R = 1.9, FUSE_Y = 3.0;
function buildPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.45, metalness: 0.15 });
  const pink = new THREE.MeshStandardMaterial({ color: '#ff4fa0', roughness: 0.5 });
  const teal = new THREE.MeshStandardMaterial({ color: '#21c7d9', roughness: 0.5 });
  const grey = new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.4, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1d2230', roughness: 0.3, metalness: 0.2 });
  const tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
  const win = new THREE.MeshStandardMaterial({ color: '#223044', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0, roughness: 0.2 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  // gövde, burun, kuyruk konisi
  add(new THREE.CylinderGeometry(FUSE_R, FUSE_R, 21, 24), white, 0, FUSE_Y, 0.5, Math.PI / 2);
  const nose = add(new THREE.SphereGeometry(FUSE_R, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, FUSE_Y, 11, Math.PI / 2);
  nose.scale.set(1, 2.3, 1);
  add(new THREE.CylinderGeometry(0.55, FUSE_R, 8, 24), white, 0, FUSE_Y + 0.6, -14, -Math.PI / 2 + 0.15);
  // kokpit camı, yolcu pencere şeritleri, pembe/camgöbeği şerit
  add(new THREE.BoxGeometry(2.3, 0.55, 1.4), dark, 0, FUSE_Y + 0.95, 13.1, -0.5);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 0.42, 17), win, s * (FUSE_R - 0.02), FUSE_Y + 0.55, -0.6);
    add(new THREE.BoxGeometry(0.08, 0.32, 27), pink, s * (FUSE_R - 0.03), FUSE_Y - 0.35, -1.5);
    add(new THREE.BoxGeometry(0.08, 0.16, 27), teal, s * (FUSE_R - 0.03), FUSE_Y - 0.62, -1.5);
  }
  // kapı (sol ön: yerel +x)
  add(new THREE.BoxGeometry(0.06, 1.9, 0.95), grey, FUSE_R + 0.01, FUSE_Y - 0.15, 9);
  // yazı: PALMERA AIR (iki yan)
  const tex = textDecal('PALMERA AIR', '#ff3fa4', 'rgba(0,0,0,0)', 512, 96, 'italic 900 64px Impact, Arial Black, sans-serif');
  const decal = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const d = add(new THREE.PlaneGeometry(7, 1.3), decal, s * (FUSE_R + 0.03), FUSE_Y + 1.25, 2, 0, s * Math.PI / 2);
    d.castShadow = false;
  }
  // kanatlar (geriye ok açılı), motorlar, kanat ucu
  for (const s of [-1, 1]) {
    const wing = add(new THREE.BoxGeometry(12.5, 0.32, 4.2), white, s * 7.6, FUSE_Y - 1.0, -1.2, 0, s * 0.38, s * 0.06);
    void wing;
    add(new THREE.BoxGeometry(0.25, 1.4, 1.3), teal, s * 13.6, FUSE_Y - 0.2, -4.8, 0, 0, s * -0.25);
    add(new THREE.CylinderGeometry(0.85, 0.75, 3.8, 18), grey, s * 5.2, FUSE_Y - 1.95, 0.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 18), dark, s * 5.2, FUSE_Y - 1.95, 2.4, Math.PI / 2);
    add(new THREE.BoxGeometry(0.25, 0.8, 1.6), white, s * 5.2, FUSE_Y - 1.35, 0.2);
    // fan: göbek + 8 kanat, motor ağzında döner (kalkışta hızlanır, inince yavaşlayıp durur)
    const fan = new THREE.Group(); fan.position.set(s * 5.2, FUSE_Y - 1.95, 2.5);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 12), grey); hub.rotation.x = Math.PI / 2; hub.position.z = 0.1; fan.add(hub);
    for (let k = 0; k < 8; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.04), grey);
      b.position.set(Math.sin(k * Math.PI / 4) * 0.36, Math.cos(k * Math.PI / 4) * 0.36, 0); b.rotation.z = -k * Math.PI / 4; b.rotation.y = 0.5;
      fan.add(b);
    }
    g.add(fan); (g.userData.fans = g.userData.fans || []).push(fan);
  }
  // kuyruk: dikey (camgöbeği, pembe çizgi) + yatay dengeleyiciler
  add(new THREE.BoxGeometry(0.32, 5.2, 3.6), teal, 0, FUSE_Y + 3.6, -14.6, -0.42);
  add(new THREE.BoxGeometry(0.34, 0.5, 3.4), pink, 0, FUSE_Y + 4.6, -15.1, -0.42);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(5, 0.22, 2.2), white, s * 2.8, FUSE_Y + 1.1, -15.6, 0, s * 0.3);
  // iniş takımı
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14);
  add(new THREE.CylinderGeometry(0.12, 0.12, FUSE_Y - 1.2, 8), grey, 0, (FUSE_Y - 1.2) / 2 + 0.5, 9.5);
  add(wheel, tire, 0, 0.55, 9.5, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.16, 0.16, FUSE_Y - 1.5, 8), grey, s * 2.4, (FUSE_Y - 1.5) / 2 + 0.5, -1.2);
    add(wheel, tire, s * 2.4, 0.55, -0.9, 0, 0, Math.PI / 2);
    add(wheel, tire, s * 2.4, 0.55, -1.6, 0, 0, Math.PI / 2);
  }
  // seyir fenerleri (sol kırmızı, sağ yeşil, kuyruk beyaz)
  const navMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  add(new THREE.SphereGeometry(0.18, 8, 6), navMat('#ff3030'), 13.9, FUSE_Y - 0.2, -5.4);
  add(new THREE.SphereGeometry(0.18, 8, 6), navMat('#30ff60'), -13.9, FUSE_Y - 0.2, -5.4);
  add(new THREE.SphereGeometry(0.2, 8, 6), navMat('#ffffff'), 0, FUSE_Y + 6.2, -16.4);
  // merdiven (kapıdan yere, +x yönünde)
  const stairs = new THREE.Group();
  const steps = 9, sillY = FUSE_Y - 1.1, run = 3.6;
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const st = new THREE.Mesh(new THREE.BoxGeometry(run / steps + 0.05, 0.12, 1.1), grey);
    st.position.set(FUSE_R + 0.15 + run * (1 - t) + run / steps / 2, sillY * t - 0.06, 9); st.castShadow = true;
    stairs.add(st);
  }
  for (const dz of [-0.6, 0.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(run, sillY), 0.08, 0.06), dark);
    rail.position.set(FUSE_R + 0.15 + run / 2, sillY / 2 + 0.95, 9 + dz); rail.rotation.z = -Math.atan2(sillY, run);
    stairs.add(rail);
  }
  g.add(stairs);
  g.userData.stairs = stairs; g.userData.win = win;
  return g;
}

// ---------- kalkış tabelası (iki direk + panel, kanvas doku) ----------
export function buildBoard(airportKey) {
  const A = AIRPORTS[airportKey];
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const x = c.getContext('2d');
  x.fillStyle = '#0d1020'; x.fillRect(0, 0, 512, 288);
  x.fillStyle = '#ffd23f'; x.font = '900 34px Arial Black, Impact, sans-serif'; x.textBaseline = 'top';
  x.fillText('✈ KALKIŞ', 20, 14);
  x.fillStyle = '#8fe8ff'; x.font = '700 20px Arial, sans-serif'; x.fillText(A.title + ' Havalimanı', 220, 24);
  x.fillStyle = '#2a3150'; x.fillRect(16, 62, 480, 2);
  ROUTES[airportKey].forEach(([to, price], i) => {
    const y = 78 + i * 44;
    x.fillStyle = '#ffffff'; x.font = '900 28px Arial, sans-serif'; x.fillText(AIRPORTS[to].title.toLocaleUpperCase('tr'), 24, y);
    x.fillStyle = '#7dff9a'; x.fillText('$' + price, 330, y);
    x.fillStyle = '#ffd23f'; x.font = '700 20px Arial, sans-serif'; x.fillText('ZAMANINDA', 400, y + 5);
  });
  x.fillStyle = '#ff7ac0'; x.font = '700 22px Arial, sans-serif'; x.fillText('Bilet için tabelanın önünde E', 24, 246);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: '#3a3d48', roughness: 0.6 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.14), post); p.position.set(s * 1.75, 1.8, 0); g.add(p); }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.15, 0.16), post); panel.position.set(0, 2.45, -0.02); g.add(panel);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.97), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 2.45, 0.07); g.add(face);
  g.position.set(A.board.x, 0.05, A.board.z);
  return g;
}
export function boardColliders(world, airportKey) {
  const b = AIRPORTS[airportKey].board;
  const gy = world.surfaceHeight(b.x, b.z);
  for (const s of [-1, 1]) world.addCircle(b.x + s * 1.75, b.z, 0.2, gy - 5, gy + 3.6);
}

// ---------- uçuş yöneticisi ----------
export class Flights {
  constructor(game) {
    this.game = game;
    this.plane = buildPlane();
    this.plane.userData.keepFlight = true;
    game.scene.add(this.plane);
    this.at = null; this.here = 'palmera'; this.state = 'idle'; this.ticket = null; this.prompt = null; this.fan = 0;
    this.placePlane('palmera');
    // Palmera tabelası şehirle birlikte gizlenir
    const pb = buildBoard('palmera'); game.scene.add(pb); game.cityObjs?.push(pb);
    boardColliders(game.world, 'palmera');
    // beyaz bulut geçişi + yazı
    const f = this.fade = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;display:none;background:radial-gradient(ellipse at 50% 40%,#ffffff 0%,#eef4fb 55%,#cfdcec 100%);';
    f.innerHTML = '<div style="position:absolute;left:50%;top:26%;transform:translateX(-50%);font:italic 900 34px Impact,Arial Black,sans-serif;color:#ff3fa4;text-shadow:0 2px 0 #fff;letter-spacing:2px;white-space:nowrap"></div>';
    this.fadeText = f.firstChild;
    document.body.appendChild(f);
    // bilet menüsü
    const m = this.menu = document.createElement('div');
    m.id = 'flightmenu'; m.className = 'hidden';
    document.body.appendChild(m);
  }
  get menuOpen() { return this.state === 'menu'; }
  // oyuncunun bulunduğu havaalanı (bölgesinin içindeyse o, değilse Palmera)
  locationAirport() {
    const g = this.game, P = g.player, fp = P.vehicle ? P.vehicle.pos : P.pos;
    for (const [k, A] of Object.entries(AIRPORTS)) if (A.region && g.regions[A.region]?.inside(fp)) return k;
    return 'palmera';
  }
  placePlane(key) {
    const A = AIRPORTS[key], p = this.plane;
    p.position.set(A.plane.x, this.game.world.surfaceHeight(A.plane.x, A.plane.z), A.plane.z);
    p.rotation.set(0, A.plane.heading, 0);
    p.userData.stairs.visible = true;
    this.at = key; this.h = A.plane.heading;
  }
  // tamamen sıfırla (oyunun başına dönüş, ölüm sonrası doğma)
  reset() {
    if (this.state !== 'idle') this.game.player.mesh.visible = true;
    this.state = 'idle'; this.ticket = null; this.closeMenuDom();
    this.fade.style.display = 'none'; this.fade.style.opacity = 0;
    this.game.audio.jet?.(0); this.fan = 0;
    this.at = null;   // bir sonraki karede bulunulan havaalanına konur
  }
  openMenu() {
    const g = this.game, here = this.here;
    this.state = 'menu';
    const rows = ROUTES[here].map(([to, price], i) => `<button data-i="${i}"><span class="okey">${i + 1}</span>${AIRPORTS[to].title} <b>$${price}</b></button>`).join('');
    this.menu.innerHTML = `<div class="fbox"><h2>✈ ${AIRPORTS[here].title} — Kalkış</h2><p>Paran: $${Math.floor(g.money)}</p>${rows}<button data-i="x">Kapat <small>(E / Esc)</small></button><p class="ohelp">Numara tuşuna bas ya da tıkla</p></div>`;
    this.menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => (b.dataset.i === 'x' ? this.closeMenu() : this.choose(+b.dataset.i))));
    this.menu.classList.remove('hidden');
    g.wantLock = false; g.lockGrace = performance.now() + 800;
    if (document.pointerLockElement) g.expectUnlock = true;   // bu bırakmanın olayı duraklatma sanılmasın
    try { document.exitPointerLock?.(); } catch (e) { /* yok */ }
  }
  closeMenuDom() { this.menu.classList.add('hidden'); }
  closeMenu() {
    this.closeMenuDom();
    if (this.state === 'menu') this.state = 'idle';
    const g = this.game; g.wantLock = true; g.lockGrace = performance.now() + 800; g.lock(); g.clock.getDelta();
  }
  choose(i) {
    const g = this.game, r = ROUTES[this.here][i]; if (!r) return;
    const [to, price] = r;
    if (g.money < price) { g.hud.notify(`Yeterli paran yok: bilet $${price}.`, 3); return; }
    g.spend(price, 'ticket');
    this.ticket = to;
    this.closeMenu();
    g.hud.notify(`Bilet alındı: ${AIRPORTS[to].title}. Pistteki uçağın merdivenine git, F ile bin.`, 5);
    g.audio.jingle('cp');
  }
  // true dönerse oyuncu uçakta/menüde: Player.update çalışmaz
  update(dt, inp) {
    const g = this.game, P = g.player;
    this.prompt = null;
    if (this.state === 'idle') {
      const here = this.locationAirport();
      if (here !== this.here) { this.here = here; this.ticket = null; }
      if (this.at !== here) this.placePlane(here);
      if (P.vehicle || P.dead) return false;
      const A = AIRPORTS[here];
      const dB = Math.hypot(P.pos.x - A.board.x, P.pos.z - (A.board.z + 1.2));
      const dD = Math.hypot(P.pos.x - A.exit.x, P.pos.z - A.exit.z);
      if (dB < 3) {
        this.prompt = 'E: Uçuş seç (kalkış tabelası)';
        if (inp.hit('KeyE')) { inp.pressed.delete('KeyE'); this.openMenu(); return true; }
      } else if (dD > 6) this.justLanded = false;
      else if (dD < 3.2) {
        // yeni indiysen kapının dibindesin: uzaklaşana kadar "bilet al" deme
        if (!this.ticket) { if (!this.justLanded) this.prompt = 'Uçağa binmek için önce terminal önündeki kalkış tabelasından bilet al'; }
        else {
          this.prompt = `F: Uçağa bin → ${AIRPORTS[this.ticket].title}`;
          if (inp.hit('KeyF')) { inp.pressed.delete('KeyF'); this.board(); return true; }
        }
      }
      return false;
    }
    if (this.state === 'menu') {
      for (let i = 0; i < 9; i++) if (inp.hit('Digit' + (i + 1)) || inp.hit('Numpad' + (i + 1))) { this.choose(i); break; }
      if (this.state === 'menu' && (inp.hit('Escape') || inp.hit('KeyE'))) this.closeMenu();
      return true;
    }
    this.t += dt;
    const p = this.plane, h = this.h ?? AIRPORTS[this.at].plane.heading, fx = Math.sin(h), fz = Math.cos(h);
    if (this.state === 'board') {
      // binince motorlar çalışır: fanlar hızlanır, merdiven kalkar
      if (this.t > 1.0) p.userData.stairs.visible = false;
      this.fan = Math.min(1, this.fan + dt * 0.5);
      g.audio.jet?.(0.15);
      if (this.t > 1.8) { this.state = 'roll'; this.t = 0; }
    } else if (this.state === 'roll') {
      this.fan = 1;
      // kalkış koşusu: hızlan, 55 m/sn'de burnu kaldır, tırman; 12,5 sn'de bulutlara gir
      this.v = Math.min(80, this.v + 5.5 * dt);
      if (this.v > 55) this.pitch = Math.min(0.16, this.pitch + dt * 0.12);
      p.position.x += fx * this.v * dt; p.position.z += fz * this.v * dt;
      p.position.y += Math.sin(this.pitch) * this.v * dt;
      p.rotation.set(0, h, 0); p.rotateX(-this.pitch);
      if (this.t > 12.5) this.setFade(Math.min(1, (this.t - 12.5) / 1.3));
      if (this.t > 13.8) this.transfer();
      g.audio.jet?.(this.v / 80);
    } else if (this.state === 'transfer') {
      // gidilen bölge kurulana kadar beyaz ekran (main.updateRegions bölgeyi yükler; oyun o sırada bekler)
      const to = AIRPORTS[this.ticket], R = to.region && g.regions[to.region];
      if (this.t > 1.2 && (!R || R.st === 3)) {
        // iniş başlar: uçak gidilen pistin doğusunda, havada; beyaz ekran açılır
        const to2 = this.ticket;
        this.placePlane(to2);
        p.userData.stairs.visible = false;
        this.here = to2; this.state = 'land'; this.t = 0; this.s = 0;
        this.path = landingPath(AIRPORTS[to2], g.world.surfaceHeight(AIRPORTS[to2].plane.x, AIRPORTS[to2].plane.z));
        this.fadeText.textContent = '';
        this.poseOnPath();
      }
    } else if (this.state === 'land') {
      // iniş: yol boyunca ilerle; motor süzülüşte kısık, yere değince ters itki (ses yükselir), sonra rölanti
      this.setFade(Math.max(0, 1 - this.t / 1.5));
      if (this.t > 1.5) this.fade.style.display = 'none';
      const k = this.poseOnPath();
      this.s = Math.min(this.path.total, this.s + k.v * dt);
      const sinceTouch = this.s - this.path.touch;
      this.fan = 1;
      g.audio.jet?.(sinceTouch < 0 ? 0.45 : sinceTouch < 220 ? 0.75 - sinceTouch / 220 * 0.5 : 0.25);
      if (this.s >= this.path.total) { this.state = 'spool'; this.t = 0; }
    } else if (this.state === 'spool') {
      // durdu: motorlar susar (ses ve fanlar yavaşça), sonra merdiven iner
      this.fan = Math.max(0, 1 - this.t / 3.5);
      g.audio.jet?.(this.t < 3 ? 0.25 * (1 - this.t / 3) : 0);
      if (this.t > 2.2) p.userData.stairs.visible = true;
      if (this.t > 3.5) { this.state = 'landed'; g.audio.jet?.(0); }
    } else if (this.state === 'landed') {
      this.prompt = `${AIRPORTS[this.here].title} · F: Uçaktan in`;
      if (inp.hit('KeyF')) { inp.pressed.delete('KeyF'); this.disembark(); }
    }
    this.spinFans(dt);
    return this.state !== 'idle';
  }
  // iniş yolunda uçağı konumlandır (pozisyon, yön, burun açısı); o noktadaki bilgiyi döner
  poseOnPath() {
    const k = this.path.at(this.s), p = this.plane;
    p.position.set(k.x, k.y, k.z);
    p.rotation.set(0, k.h, 0); p.rotateX(-k.pitch);
    this.h = k.h;
    return k;
  }
  // motor fanları: this.fan 0..1 (tam güçte ~25 tur/sn görünür bulanıklık yerine yavaş ama belirgin dönüş)
  spinFans(dt) {
    for (const f of this.plane.userData.fans) f.rotation.z += this.fan * 30 * dt;
  }
  setFade(a) { this.fade.style.display = 'block'; this.fade.style.opacity = a; }
  board() {
    const g = this.game, P = g.player;
    // aranıyorsan da binebilirsin (polis uçağa gelmez); süren görev iptal olur
    if (g.missions.active) { g.missions.cancel(); g.hud.notify('Uçağa bindin: süren görev iptal oldu.', 4); }
    g.clearPolice();
    P.mesh.visible = false;
    this.state = 'board'; this.t = 0; this.v = 0; this.pitch = 0;
    g.hud.notify(`${AIRPORTS[this.ticket].title} uçuşu kalkıyor…`, 3);
  }
  transfer() {
    const g = this.game, P = g.player, to = AIRPORTS[this.ticket];
    this.setFade(1);
    this.fadeText.textContent = `✈ ${to.title}'e uçuluyor…`;
    // oyuncuyu gidilen havaalanına taşı: eski bölge "dışarıda" kalıp silinir, yenisi yüklenir
    P.pos.set(to.exit.x, g.world.surfaceHeight(to.exit.x, to.exit.z), to.exit.z);
    P.vx = P.vz = P.vy = 0;
    this.state = 'transfer'; this.t = 0;
    g.audio.jet?.(0);
  }
  disembark() {
    const g = this.game, P = g.player, A = AIRPORTS[this.here];
    P.respawn(A.exit.x, A.exit.z, -Math.PI / 2);
    P.health = Math.max(P.health, 100);
    this.state = 'idle'; this.ticket = null; this.justLanded = true;
    g.cam.yaw = Math.PI; g._camInit = false;
    g.hud.big(A.title, 'Hoş geldin!', '#29e7ff', 2.2);
    g.persist();
  }
  // uçuş sırasında kamera (true dönerse main kamerayı ellemez)
  camera(cam, dt) {
    if (this.state === 'idle' || this.state === 'menu') return false;
    // inişte yere değip yavaşlayınca (U dönüşü, motor susması) önden-yandan bakan sabit yönlü yer kamerası
    const ground = this.state === 'spool' || this.state === 'landed' || this.state === 'transfer' ||
      (this.state === 'land' && this.s > this.path.total - Math.PI * LAND.R - LAND.park - 25);
    const p = this.plane, h = ground ? AIRPORTS[this.here].plane.heading : this.h;
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const d = ground ? [fx * 20 + lx * 22, 5.5, fz * 20 + lz * 22] : [-fx * 38 + lx * 14, 9, -fz * 38 + lz * 14];
    cam.position.set(p.position.x + d[0], p.position.y + d[1], p.position.z + d[2]);
    cam.lookAt(p.position.x + (ground ? -fx * 3 : fx * 10), p.position.y + 3, p.position.z + (ground ? -fz * 3 : fz * 10));
    void dt;
    return true;
  }
  // gölge/ışık odağı uçuşta uçaktır
  focus() { return this.state === 'board' || this.state === 'roll' || this.state === 'land' ? this.plane.position : null; }
  setNight(n) { this.plane.userData.win.emissiveIntensity = n * 1.4; }
}
