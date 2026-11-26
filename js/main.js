// Palmera City — ana oyun döngüsü
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, damp, dampAngle, wrapAngle, formatMoney } from './util.js';
import { World, WATER_Y } from './world.js';
import { Environment, randomStartHour } from './env.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Vehicle, loadVehicleKit, setWagonKits, setAnimalKit } from './vehicles.js';
import { Traffic, Driver } from './traffic.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys, STATIONS } from './audio.js';
import { loadBuildingKit } from './buildings.js';
import { loadNatureKit, isleDN, onFoot, FOOT } from './forest.js';
import { loadAnimalKit } from './wildlife.js';
import { loadWestKit, loadWestMeta, WBR, WEST_X, HORSE_SPOTS } from './west.js';
import { Arrows } from './weapons.js';
import { downloadProgress, setBar } from './progress.js';
import { Flights, AIRPORTS, CASA } from './flight.js';
import { League } from './league.js';

// yükleme çubuklarının saydığı dosyalar
const BOOT_FILES = ['buildings.json', 'buildings.bin', 'vehicles.json', 'vehicles.bin', 'west.json'];

// boşaltılan bölge nesnelerinin GPU kaynaklarını (geometri, malzeme, doku, iskelet) sil;
// sahnede kalan bir şeyin ya da kalıcı hayvan kitinin kullandıkları silinmez (ortak malzemeler güvende)
function disposeUnused(roots, scene, keepKit) {
  const geos = new Set(), mats = new Set(), texs = new Set(), skels = new Set();
  const collect = (o, G, M, T, S) => {
    if (o.geometry) G.add(o.geometry);
    if (S && o.skeleton) S.add(o.skeleton);
    for (const m of [].concat(o.material || [])) {
      M.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) T.add(v);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) T.add(u.value);
    }
  };
  for (const r of roots) r.traverse((o) => collect(o, geos, mats, texs, skels));
  const kG = new Set(), kM = new Set(), kT = new Set();
  scene.traverse((o) => collect(o, kG, kM, kT, null));
  for (const K of Object.values(keepKit?.kinds || {})) K.root?.traverse((o) => collect(o, kG, kM, kT, null));
  for (const g of geos) if (!kG.has(g)) g.dispose();
  for (const m of mats) if (!kM.has(m)) m.dispose();
  for (const t of texs) if (!kT.has(t)) t.dispose();
  for (const s of skels) s.dispose();
}

// Çizgi film görünümü: son ekran rengi (ton eşlemeden sonra, ekran uzayında) — canlı, doygun, sıcak ışık / mor gölge.
// Tek tam ekran geçişi; kapatılınca (?toon=0) pass devre dışı, görüntü eskisiyle birebir aynı.
const TOON_GRADE = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 0.5 }, uContrast: { value: 0.32 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uSat, uContrast, uNight; varying vec2 vUv;
void main(){
  vec4 tex = texture2D(tDiffuse, vUv);
  vec3 c = clamp(tex.rgb, 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // canlılık: soluk renkler çok, zaten doygun olanlar az artar; çok karanlıkta artmaz (gürültü olmasın)
  float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float k = uSat * (1.0 - s * 0.7) * smoothstep(0.03, 0.2, l);
  c = clamp(mix(vec3(l), c, 1.0 + k), 0.0, 1.0);
  // S eğrisi karşıtlık (gece yumuşak, yoksa karanlık yerler kapkara olur)
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast * (1.0 - uNight * 0.6));
  // ayrık ton: gölgeler mor-maviye, ışıklar sıcak sarıya
  float w = smoothstep(0.15, 0.75, l);
  c += vec3(0.025, -0.01, 0.06) * (1.0 - w) * (1.0 - l);
  c += vec3(0.05, 0.025, -0.03) * w * l;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
}`,
};

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

class Game {
  constructor(kit, westMeta = null) {
    this.westMeta = westMeta;
    // oyuncunun ligi ve parası sunucuda (oyun.php gömer: window.PLAYER); ödül/harcama league.js üzerinden
    this.league = new League(this);
    this.money = this.league.me.money;
    this.quality = params.get('q') || localStorageGet('pn_quality') || 'low';
    this.time = 0;
    this.state = 'title';
    this.vehicles = []; this.peds = [];
    this.camForward = new THREE.Vector3(0, 0, -1);

    const canvas = $('game');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(this.quality === 'high' ? Math.min(devicePixelRatio, 1.5) : this.quality === 'low' ? 0.8 : 1);
    r.setSize(innerWidth, innerHeight);
    // gölgeler her kalitede açık; düşükte ucuz filtre + küçük harita + dar alan (aşağıda, env kurulunca)
    r.shadowMap.enabled = true;
    r.shadowMap.type = this.quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2600);
    this.camera.position.set(260, 30, 80);

    this.world = new World(kit, { westMeta, quality: this.quality });
    this.world.build(this.scene);
    this.arrows = new Arrows(this.scene);
    this.world.finalize();
    if (this.world.city) this.world.city.finalize(r, this.scene, this.quality);
    // şehre ait sahne nesneleri: Isla Selva'dayken gizlenir (orman, yaya köprüsü, deniz tabanı "keep")
    // Wild West nesneleri ("west"): yalnız batı kıyısına yakınken çizilir; oradayken Palmera + Isla Selva gizlenir
    this.cityObjs = this.scene.children.filter((o) => !o.userData.keep && !o.userData.west);
    this.westObjs = this.scene.children.filter((o) => o.userData.west);
    this.selvaObjs = this.scene.children.filter((o) => o.userData.keep && o.userData.selva);
    this.cityHidden = false; this.inWest = false; this.westShown = true;
    // Isla Selva ve Wild West köprülerinin ortasında yüklenir, uzun süre gidilmeyince boşaltılır (defineRegions)
    this.defineRegions();
    const ov = this.regionEl = document.createElement('div');
    ov.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);padding:14px 28px;background:rgba(12,8,24,0.8);color:#ffd9a0;font:700 22px Georgia,serif;border-radius:10px;z-index:60;display:none;pointer-events:none;letter-spacing:1px;text-align:center';
    ov.innerHTML = '<div></div><div class="rg-bar"><div></div></div>';
    this.regionText = ov.firstChild; this.regionBar = ov.querySelector('.rg-bar div');
    document.body.appendChild(ov);
    this.env = new Environment(r, this.scene, this.world);
    if (this.quality === 'medium') this.env.sunLight.shadow.mapSize.set(1024, 1024);
    if (this.quality === 'low') {   // düşük: oyuncunun çevresinde ±40 m, 1024² (yakın gölgeler yine net)
      const sh = this.env.sunLight.shadow, sc = sh.camera;
      sh.mapSize.set(1024, 1024);
      sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.updateProjectionMatrix();
    }
    // yeni üye (hiç görev başlatmamış): ilk oyun 15:00'te; sonraki açılışlarda saat rastgele (env.randomStartHour)
    // hava da açılışta rastgele (yeni üyenin ilk oyunu güneşli)
    if (this.league.me.played === false) { this.env.hour = 15; this.env.clock = 15; this.env.setWeather('sun'); }
    else this.env.randomWeather();
    if (params.get('t')) this.env.hour = parseFloat(params.get('t'));
    if (params.get('rain')) this.env.forceRain();
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);
    this.audio = new AudioSys(params.get('mute') === '1');
    this.env.onThunder = () => this.audio.thunder();

    const sp = params.get('pos') ? params.get('pos').split(',').map(Number) : [190.5, 52];
    this.player = new Player(this, sp[0], sp[1]);
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.hud = new HUD(this);
    this.league.updateBadge();
    this.missions = new Missions(this);
    this.flights = new Flights(this);   // havaalanı: uçak + kalkış tabelası + uçuş sahnesi
    // başka şehirdeyken kapatıldıysa "OYNA" orada devam eder; "Palmera'dan başla" baştan (Palmera) açar
    const city = this.league.me.city;
    this.pendingCity = !params.get('pos') && city !== 'palmera' && AIRPORTS[city] ? city : null;

    // başlangıç araçları
    this.addVehicle('sport', { x: 186.2, y: 0, z: 56, heading: Math.PI, color: '#d4d4cf' });
    this.addVehicle('moto', { x: 186.4, y: 0, z: 66, heading: Math.PI, color: '#20c4ff' });
    this.lastCar = null;

    // farlar
    this.headlight = new THREE.SpotLight('#fff1d6', 0, 80, 0.6, 0.45, 1.5);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight, this.headlight.target);

    // son işlem
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.55, 0.85);
    if (this.quality !== 'low') this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.toonPass = new ShaderPass(TOON_GRADE);
    this.composer.addPass(this.toonPass);
    // çizgi film görünümü: varsayılan açık; ?toon=0 / ?toon=1 ya da localStorage pn_toon ('off' / 'on')
    const tq = params.get('toon');
    this.setToon(tq != null ? tq !== '0' : localStorageGet('pn_toon') !== 'off');

    this.cam = { yaw: -Math.PI / 2, pitch: 0.18, lookT: 0, dist: 1 };
    this.effects.setScale(innerHeight, this.camera.fov);
    addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.mapOpen = false; this.paused = false; this.steerAssist = true;
    this.setupUI();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    if (params.get('autostart') === '1') this.start();
    if (params.get('debug') === '1') window.game = this;
  }

  setupUI() {
    const q = $('quality');
    q.value = this.quality;
    q.addEventListener('change', () => { localStorageSet('pn_quality', q.value); location.search = updateParam('q', q.value); });
    const snd = $('sound');
    snd.checked = params.get('mute') !== '1' && localStorageGet('pn_sound') !== 'off';
    snd.addEventListener('change', () => localStorageSet('pn_sound', snd.checked ? 'on' : 'off'));
    $('play').addEventListener('click', () => { if (!snd.checked) this.audio.muted = true; this.start(); });
    // başka şehirde kalındıysa: OYNA orada devam eder, ikinci düğme Palmera'dan (oyunun başından) başlatır
    if (this.pendingCity) {
      $('play').textContent = `OYNA · ${AIRPORTS[this.pendingCity].title}`;
      $('playhome').classList.remove('hidden');
    }
    $('playhome').addEventListener('click', () => { if (!snd.checked) this.audio.muted = true; this.pendingCity = null; this.start(); });
    $('resume').addEventListener('click', () => this.setPaused(false));
    $('introX').addEventListener('click', () => this.closeIntro());
    $('introGo').addEventListener('click', () => this.closeIntro());
    $('prestart').addEventListener('click', () => this.restartGame());
    $('psound').addEventListener('click', () => { this.soundOff = !this.soundOff; this.audio.setMasterMuted(this.soundOff); $('psound').textContent = this.soundOff ? 'Ses: Kapalı' : 'Ses: Açık'; });
    document.addEventListener('pointerlockchange', () => {
      // oyunun kendi bıraktığı kilidin (bilet menüsü) olayı geç gelse de oyunu duraklatmasın
      if (!document.pointerLockElement && this.expectUnlock) { this.expectUnlock = false; return; }
      if (!document.pointerLockElement && this.state === 'play' && !this.mapOpen && !this.paused && this.wantLock && performance.now() > (this.lockGrace || 0)) this.setPaused(true);
    });
  }
  start() {
    if (this.state === 'play') return;
    this.state = 'play';
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.audio.init(); this.audio.resume();
    const lines = [];
    if (this.pendingCity) {
      // kalınan şehrin havaalanında, uçağın merdiveninin dibinde başla (bölge köprüdeki gibi yüklenir)
      const A = AIRPORTS[this.pendingCity];
      this.flights.reset();
      this.player.respawn(A.exit.x, A.exit.z, -Math.PI / 2);
      this.cam.yaw = Math.PI; this._camInit = false;
      lines.push(`${A.title}'nde kaldığın yerden devam ediyorsun. Palmera'ya dönmek için kalkış tabelasından bilet al.`);
      this.pendingCity = null;
    } else {
      const lg = this.league;
      // Tahta ligi (görev Altın Veloce, işaret Ocean Drive'ın kuzeyinde): başlangıçtan yol tarifi (kullanıcı metni)
      if (lg.me.league === 1 && lg.mission) lines.push(`Hedefin ${formatMoney(lg.L.limit)} toplamak. Önündeki beyaz arabaya bin ve caddeyi dümdüz takip et. Yolun sağında daire şeklinde bir ışık göreceksin. Arabadan inip dairenin içine gir ve E tuşuna bas. Görevin başlayacak.`);
      else lines.push(lg.mission
        ? `${lg.title} Ligi: hedefin ${formatMoney(lg.L.limit)}. Lig görevi ve yardım görevleri mini haritadaki renkli harfli yuvarlaklardır. Oraya git, ışık sütununun içine gir ve E'ye bas.`
        : `${lg.title} Ligi'nin görevi yakında eklenecek. Şimdilik yardım görevleriyle (${formatMoney(500)}) para kazanabilirsin.`);
    }
    lines.push('F: araca bin/in · M: harita · ESC: menü ve tuşlar');
    // açıklamalar oyun başlamadan, imleç serbestken gösterilir; ✕ / BAŞLA (ya da Enter) ile kapanınca fare kilitlenir
    if (params.get('autostart') === '1') { this.closeIntro(); return; }   // test: pencere yok
    $('introList').replaceChildren(...lines.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
    $('intro').classList.remove('hidden');
    this.introOpen = true;
  }
  // açıklama penceresini kapat ve oyunu başlat (tıklama / tuş basışı kullanıcı hareketi → fare kilidi alınabilir)
  closeIntro() {
    $('intro').classList.add('hidden');
    this.introOpen = false;
    this.input.pressed.clear();
    this.wantLock = true;
    this.lock();
    this.clock.getDelta();
  }
  lock() { try { const r = this.input.canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* jest gerekli */ } }
  setPaused(p) {
    this.paused = p;
    // duraklatan tuş basışı aynı anda devam ettirmesin
    if (p) { this.pausedAt = performance.now(); this.input.pressed.clear(); this.league.showRank(); }
    $('pause').classList.toggle('hidden', !p);
    if (!p) { this.lock(); this.clock.getDelta(); }
    this.audio.ctx && (p ? this.audio.ctx.suspend() : this.audio.ctx.resume());
  }
  // çizgi film görünümü aç/kapa: son renk geçişi + boyalı gökyüzü + daha az sis (kapalıyken eski görüntü)
  setToon(on) {
    this.toon = !!on;
    this.toonPass.enabled = this.toon;
    this.env.toon = this.toon;
    this.env.skyUniforms.uToon.value = this.toon ? 1 : 0;
    this.env.envTimer = 0;   // çevre haritası (yansımalar) yeni gökyüzüyle yenilensin
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
    this.effects.setScale(innerHeight, this.camera.fov);
  }

  // ---------- varlık yönetimi ----------
  addVehicle(type, opts) {
    const v = new Vehicle(type, opts);
    v.pos.y = this.world.surfaceHeight(v.pos.x, v.pos.z, (opts.y ?? 0) + 5);
    if (type === 'boat') v.pos.y = WATER_Y;
    this.scene.add(v.mesh); this.vehicles.push(v);
    v.update(0.0001, this);
    return v;
  }
  removeVehicle(v) {
    if (this.player.vehicle === v) return;
    const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1);
    this.scene.remove(v.mesh);
    v.mesh.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    v.parts.paint.dispose(); v.parts.brake.dispose();
    if (this.lastCar === v) this.lastCar = null;
  }
  // para yalnız sunucudan artar (görev ödülü); burada yalnız harcanır: reason 'ticket' | 'hospital' | 'fine'
  spend(n, reason) { this.league.spend(n, reason); }
  radioName() { const v = this.player.vehicle; if (!v) return ''; return STATIONS[this.audio.station].name; }

  // oyuncunun bulunduğu şehir sunucuya yazılır: başka şehirdeyse (uçakla gidilen) sonraki açılışta orada devam edilir
  persist() {
    if (this.state !== 'play') return;
    this.league.setCity(this.flights?.here || 'palmera');
  }

  // ---------- olaylar ----------
  onEnterVehicle(v) {
    this.lastCar = v;
    this.audio.setRadio(true, v.radio ?? this.audio.station);
    this.hud.radio(STATIONS[this.audio.station].name);
    this.cam.lookT = 0;
  }
  onExitVehicle(v) { v.radio = this.audio.station; this.audio.setRadio(false); }
  onPlayerHurt() { $('hurt').classList.remove('flash'); void $('hurt').offsetWidth; $('hurt').classList.add('flash'); }
  onPedKilled(p, byPlayer) {
    if (byPlayer) this.police.crime(p.role === 'cop' ? 'copKill' : 'kill', p.pos.x, p.pos.z);
  }
  onPedHurt(p, byPlayer) {
    if (byPlayer) this.police.crime(p.role === 'cop' ? 'cophurt' : 'assault', p.pos.x, p.pos.z);
  }
  onVehicleImpact(v, imp, x, y, z, nx, nz) {
    if (imp > 6) this.effects.sparks(x, y, z, Math.min(30, imp), nx, nz);
    this.audio.crash(imp, { x, y, z });
    const P = this.player;
    if (P.vehicle === v) {
      this.effects.shake = Math.max(this.effects.shake, Math.min(0.8, imp / 30));
      if (v.type === 'moto' && imp > 12) {
        const vx = v.vx, vz = v.vz;
        P.exitVehicle(true);
        P.vx = vx * 0.4; P.vz = vz * 0.4; P.vy = 5; P.fallT = 1.4;
        P.damage(imp * 1.2, 'crash');
      } else if (imp > 18) P.damage((imp - 18) * 1.5, 'crash');
    }
  }
  onExplosion(x, y, z, src) {
    this.effects.explosion(x, y, z);
    this.env.explosionFlash(x, y, z);
    this.audio.explosion({ x, y, z });
    this.traffic.alarm(x, z, 60);
    const P = this.player;
    if (P.vehicle === src) { P.exitVehicle(true); P.damage(200, 'explosion'); }
    for (const v of this.vehicles) {
      if (v === src || v.wrecked) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < 9) { v.damage(700 * (1 - d / 9), this); const k = (1 - d / 9) * 8; v.vx += (v.pos.x - x) / (d || 1) * k; v.vz += (v.pos.z - z) / (d || 1) * k; v.vy = k * 0.6; }
    }
    for (const p of this.peds) {
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < 7 && p.state !== 'dead') p.hit((p.pos.x - x) / (d || 1) * 8, (p.pos.z - z) / (d || 1) * 8, 200 * (1 - d / 7), !!(src && src.playerHitT > this.time - 15));
    }
    if (!P.vehicle) {
      const d = Math.hypot(P.pos.x - x, P.pos.z - z);
      if (d < 8) { P.damage(90 * (1 - d / 8), 'explosion'); P.fallT = 1; P.vx = (P.pos.x - x) / (d || 1) * 6; P.vz = (P.pos.z - z) / (d || 1) * 6; P.vy = 4; }
    }
    if (src && (src.playerHitT > this.time - 15 || src === P.vehicle || src === this.lastCar)) this.police.crime(src.type === 'police' ? 'copKill' : 'explode', x, z);
  }
  onVehicleSunk(v) {
    if (this.player.vehicle === v) { this.player.exitVehicle(true); this.player.pos.y = WATER_Y - 1.2; this.player.swimming = true; this.hud.notify('Araç battı!'); }
  }
  onWantedCleared(lvl) { if (this.state === 'play' && !this.player.dead) this.hud.notify(lvl >= 3 ? 'Polisten kurtuldun! Temiz iş.' : 'Aranma seviyesi sıfırlandı.'); }

  wasted() {
    const P = this.player;
    if (P.dead) return;
    if (P.vehicle) P.exitVehicle(true);
    P.dead = true;
    this.retryMission = this.missions.active ? this.missions.active.m : null;
    this.missions.onPlayerDown(true);
    const failed = this.retryMission ? 'Görev başarısız sayıldı. ' : '';
    this.hud.big('ÖLDÜN', '', '#ff3b4f', 2.4);
    this.audio.jingle('fail');
    setTimeout(() => this.showOver('ÖLDÜN', failed + 'Hastane masrafı $250.', '#ff3b4f', this.paidOptions(
      { label: 'Hastanede uyan (−$250)', fn: () => this.respawnAt('hospital', 250, 'hospital') }, 250, 'hospital'), true), 2200);
  }
  busted() {
    const P = this.player;
    if (P.dead) return;
    if (P.vehicle) P.exitVehicle(true);
    P.dead = true;
    this.retryMission = this.missions.active ? this.missions.active.m : null;
    this.missions.onPlayerDown(true);
    const fine = Math.max(100, Math.floor(this.money * 0.1));
    const failed = this.retryMission ? 'Görev başarısız sayıldı. ' : '';
    this.hud.big('TUTUKLANDIN', '', '#5d8bff', 2.4);
    this.audio.jingle('fail');
    setTimeout(() => this.showOver('TUTUKLANDIN', `${failed}Ceza $${fine}.`, '#5d8bff', this.paidOptions(
      { label: `Karakoldan çık (ceza −$${fine})`, fn: () => this.respawnAt('police', fine, 'fine') }, fine, 'fine'), true), 2200);
  }
  // ölüm / tutuklanma: hangi seçenek seçilirse seçilsin masraf ödenir (para sıralamayı etkiler, kaçamak olmasın)
  paidOptions(main, cost, reason) {
    const opts = [main];
    const m = this.retryMission;
    if (m) opts.push({ label: `Görevi tekrar dene: "${m.name}" (−$${cost})`, fn: () => { this.spend(cost, reason); this.restartGame(m); } });
    opts.push({ label: `Oyunun başına dön (−$${cost})`, fn: () => { this.spend(cost, reason); this.restartGame(); } });
    return opts;
  }
  // başarısız görev: ceza yok, hemen yeniden denenebilir
  onMissionFailed(m, msg) {
    if (this.player.dead) return; // ölüm/tutuklanma paneli zaten açılıyor
    this.retryMission = m;
    setTimeout(() => {
      if (this.player.dead || this.overOpen) return;
      this.showOver('GÖREV BAŞARISIZ', msg || '', '#ff4f6d', [{ label: 'Oynamaya devam et', fn: () => this.hideOver() }]);
    }, 1200);
  }
  // lig atlama: tebrik + yeni ligin bilgisi
  onLevelUp(u) {
    this.retryMission = null;
    this.showOver(u.from === u.to ? 'YENİ GÖREV AÇILDI!' : 'LİG ATLADIN!', this.league.levelUpText(u), '#ffd23f', [
      { label: 'Devam et', fn: () => this.hideOver() },
    ], true);
    this.audio.jingle('win');
  }
  // aranma seviyesini ve polis helikopterini temizle
  clearPolice() {
    this.police.level = 0; this.police.clear();
    if (this.police.heli) { this.scene.remove(this.police.heli.g); this.police.heli = null; this.police.spot.intensity = 0; this.police.cone.visible = false; this.audio.heli(null); }
  }
  respawnAt(where, cost, reason) {
    this.hideOver();
    this.flights.reset();
    this.police.level = 0; this.police.clear();
    this.spend(cost, reason);
    const p = this.world.poi[where];
    this.player.respawn(p.x, p.z, 0);
    this.cam.yaw = 0; this._camInit = false;
    this.persist();
  }
  // ---------- sonuç paneli (ölüm / tutuklanma / başarısız görev) ----------
  showOver(title, sub, color, options, only = false) {
    const opts = [...options];
    if (!only && this.retryMission) { const m = this.retryMission; opts.push({ label: `Görevi tekrar dene: "${m.name}"`, fn: () => this.restartGame(m) }); }
    if (!only) opts.push({ label: 'Oyunun başına dön', fn: () => this.restartGame() });
    this.overOpen = true; this.overOpts = opts;
    this.wantLock = false;
    try { document.exitPointerLock?.(); } catch (e) { /* yok */ }
    $('overT').textContent = title; $('overT').style.color = color; $('overS').textContent = sub;
    $('ohelp').textContent = 'Fareyle tıkla ya da numara tuşuna bas';
    const box = $('overBtns'); box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="okey">${i + 1}</span>${o.label}`;
      b.addEventListener('click', () => o.fn());
      box.appendChild(b);
    });
    $('over').classList.remove('hidden');
  }
  hideOver() {
    if (!this.overOpen) return;
    this.overOpen = false; this.overOpts = null;
    $('over').classList.add('hidden');
    this.wantLock = true; this.lock(); this.clock.getDelta();
  }
  // Oyunun başlangıç durumuna dön (para ve tamamlanan görevler korunur). m verilirse o görevi baştan başlat.
  restartGame(m, silent = false) {
    this.hideOver();
    if (this.paused) { this.paused = false; $('pause').classList.add('hidden'); this.audio.ctx?.resume(); }
    if (this.mapOpen) { this.mapOpen = false; $('bigmap').classList.add('hidden'); }
    const P = this.player;
    this.missions.cancel();
    this.flights.reset();
    this.clearPolice();
    if (P.vehicle) P.exitVehicle(true);
    for (const v of this.vehicles.slice()) this.removeVehicle(v);
    for (const s of this.world.parkingSpots) { s.vehicle = null; s.cooldown = 0; }
    for (const p of this.peds) p.dispose();
    this.peds.length = 0;
    this.addVehicle('sport', { x: 186.2, y: 0, z: 56, heading: Math.PI, color: '#d4d4cf' });
    this.addVehicle('moto', { x: 186.4, y: 0, z: 66, heading: Math.PI, color: '#20c4ff' });
    // hava yalnız oyunun başına dönüşte değişir (görevi yeniden başlatınca olduğu gibi kalır)
    if (m) {
      P.respawn(m.start.x, m.start.z, 0);
      this.cam.yaw = 0;
      this.missions.start(m);
    } else {
      P.respawn(190.5, 52, -Math.PI / 2);
      this.cam.yaw = -Math.PI / 2; this.env.hour = randomStartHour(); this.env.randomWeather(); this.env.envTimer = 0;
      if (!silent) this.hud.notify('Oyunun başına döndün. Paran ve ligin duruyor.', 5);
    }
    this.cam.pitch = 0.18; this._camInit = false;
    this.retryMission = null;
    this.wantLock = true; this.lock(); this.clock.getDelta();
  }
  // ---------- fizik etkileşimleri ----------
  collideVehicles() {
    const V = this.vehicles;
    for (let i = 0; i < V.length; i++) {
      const a = V[i];
      for (let j = i + 1; j < V.length; j++) {
        const b = V[j];
        if (Math.abs(a.pos.x - b.pos.x) > 8 || Math.abs(a.pos.z - b.pos.z) > 8 || Math.abs(a.pos.y - b.pos.y) > 2) continue;
        let done = false;
        for (const ca of a.circles()) {
          if (done) break;
          for (const cb of b.circles()) {
            const dx = ca.x - cb.x, dz = ca.z - cb.z, rr = ca.r + cb.r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
            const ma = a.cfg.mass * (a.driver ? 1 : 1.5), mb = b.cfg.mass * (b.driver ? 1 : 1.5);
            const ia = 1 / ma, ib = 1 / mb, s = ia + ib;
            a.pos.x += nx * pen * ia / s; a.pos.z += nz * pen * ia / s;
            b.pos.x -= nx * pen * ib / s; b.pos.z -= nz * pen * ib / s;
            const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (vrel < 0) {
              const jimp = -(1.3) * vrel / s;
              a.vx += nx * jimp * ia; a.vz += nz * jimp * ia;
              b.vx -= nx * jimp * ib; b.vz -= nz * jimp * ib;
              const oax = ca.x - a.pos.x, oaz = ca.z - a.pos.z, obx = cb.x - b.pos.x, obz = cb.z - b.pos.z;
              a.angVel += clamp((oax * nz - oaz * nx) * jimp * ia * 0.35, -2.5, 2.5);
              b.angVel -= clamp((obx * nz - obz * nx) * jimp * ib * 0.35, -2.5, 2.5);
              const imp = -vrel;
              if (imp > 3) {
                const dmg = (imp - 3) * 14;
                a.damage(dmg * (mb / (ma + mb)) * 2, this); b.damage(dmg * (ma / (ma + mb)) * 2, this);
                const cx = (ca.x + cb.x) / 2, cz = (ca.z + cb.z) / 2;
                const pv = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
                const other = pv === a ? b : a;
                if (pv) {
                  other.playerHitT = this.time;
                  this.onVehicleImpact(pv, imp, cx, a.pos.y + 0.7, cz, nx, nz);
                  if (other.type === 'police' && imp > 5 && pv.speed > 6 && pv.speed > other.speed) this.police.crime('ram', cx, cz);
                  if (other.ai instanceof Driver && !other.ai.isCop && Math.random() < 0.35) other.ai.angry = 10;
                } else if (imp > 6) { this.effects.sparks(cx, a.pos.y + 0.7, cz, 8); this.audio.crash(imp * 0.6, { x: cx, y: a.pos.y, z: cz }); }
              }
            }
            done = true; break;
          }
        }
      }
    }
  }
  collidePeds() {
    const P = this.player;
    for (const v of this.vehicles) {
      const sp = v.speed;
      if (sp < 2.5) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
      const hl = v.cfg.len / 2 + 0.35, hw = v.cfg.wid / 2 + 0.35;
      for (const p of this.peds) {
        if (p.state === 'dead' || p.state === 'down') continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        if (Math.abs(dx) > 5 || Math.abs(dz) > 5 || Math.abs(p.pos.y - v.pos.y) > 1.8) continue;
        const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
        if (Math.abs(lf) < hl && Math.abs(lr) < hw) {
          p.hit(v.vx, v.vz, sp * 9, v.driver === 'player');
          this.audio.crash(sp * 0.5, p.pos);
          if (v.driver === 'player') this.effects.shake = Math.max(this.effects.shake, 0.2);
        }
      }
      if (!P.vehicle && !P.dead && v.driver !== 'player') {
        const dx = P.pos.x - v.pos.x, dz = P.pos.z - v.pos.z;
        if (Math.abs(dx) < 5 && Math.abs(dz) < 5 && Math.abs(P.pos.y - v.pos.y) < 1.8) {
          const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
          if (Math.abs(lf) < hl && Math.abs(lr) < hw && sp > 3.5 && P.fallT <= 0) {
            P.vx = v.vx * 0.7; P.vz = v.vz * 0.7; P.vy = 3 + sp * 0.15; P.fallT = 1.3;
            P.damage(sp * 3.2, 'car');
            this.audio.crash(sp, P.pos);
          }
        }
      }
    }
  }

  // ---------- kamera ----------
  updateCamera(dt) {
    const P = this.player, cam = this.camera, c = this.cam, inp = this.input;
    // uçuş sahnesi: kamerayı uçak yönetir
    if (this.flights.camera(cam, dt)) {
      cam.getWorldDirection(this.camForward); this.camForward.y = 0; this.camForward.normalize();
      this._camInit = false;
      return;
    }
    const sens = 0.0023;
    if (inp.mouseDX || inp.mouseDY) {
      c.yaw -= inp.mouseDX * sens; c.pitch = clamp(c.pitch + inp.mouseDY * sens, -0.45, 1.15);
      c.lookT = 1.6;
    }
    // klavyeyle dönüş: J/L her zaman, ←/→ yürürken (araçta ←/→ direksiyondur)
    let turn = (inp.down('KeyJ') ? 1 : 0) - (inp.down('KeyL') ? 1 : 0);
    if (!P.vehicle) turn += (inp.down('ArrowLeft') ? 1 : 0) - (inp.down('ArrowRight') ? 1 : 0);
    // kısa dokunuşta az, basılı tutunca hızlı döner; bırakınca hemen durur
    c.turnVel = damp(c.turnVel || 0, clamp(turn, -1, 1) * 2.6, turn ? 4 : 14, dt);
    if (Math.abs(c.turnVel) > 0.01) { c.yaw += c.turnVel * dt; if (turn) c.lookT = 1.6; }
    if (inp.mouseDX) c.mouseT = 1.6;
    c.mouseT = Math.max(0, (c.mouseT || 0) - dt);
    // yaya hizalama yardımı: yürürken/koşarken, tuş ve fare bırakılınca yola paralel hale getir
    if (!P.vehicle && this.steerAssist && !turn && c.mouseT <= 0 && P.speedNow > 0.5) {
      const axis = Math.round(c.yaw / (Math.PI / 2)) * (Math.PI / 2);
      const diff = wrapAngle(axis - c.yaw);
      if (Math.abs(diff) < 0.27) c.yaw += diff * (1 - Math.exp(-5 * dt));
    }
    c.lookT = Math.max(0, c.lookT - dt);
    let target, dist, height, lookAhead, shoulder = 0;
    const v = P.vehicle;
    if (v) {
      if (c.lookT <= 0) {
        const behind = v.forwardSpeed < -3 && !inp.down('KeyS') ? v.heading : v.heading;
        c.yaw = dampAngle(c.yaw, behind, v.speed > 2 ? 3.2 : 1.2, dt);
        c.pitch = damp(c.pitch, 0.2, 2, dt);
      }
      const big = { moto: 4.6, boat: 10, pickup: 7.6, sport: 6.4, police: 7, sedan: 6.8, taxi: 6.8 }[v.type] || 6.8;
      dist = big + Math.min(2.5, v.speed * 0.045);
      if (inp.hit('KeyC')) c.far = !c.far;
      if (c.far) dist *= 1.6;
      target = new THREE.Vector3(v.pos.x, v.pos.y + (v.type === 'boat' ? 1.6 : 1.3), v.pos.z);
      height = 1.1; lookAhead = 3;
      cam.fov = damp(cam.fov, 68 + clamp(v.speed - 12, 0, 45) * 0.32, 3, dt);
    } else {
      target = new THREE.Vector3(P.pos.x, P.pos.y + 1.55, P.pos.z);
      dist = P.swimming ? 4.2 : 3.4 + (P.speedNow > 6 ? 0.6 : 0);
      height = 0.3; shoulder = 0.6; lookAhead = 0;
      cam.fov = damp(cam.fov, P.speedNow > 6 ? 74 : 68, 4, dt);
      if (P.dead) { dist = 6; shoulder = 0; }
    }
    cam.updateProjectionMatrix();
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx;
    const cp = Math.cos(c.pitch), spch = Math.sin(c.pitch);
    const desired = new THREE.Vector3(
      target.x - fx * dist * cp + rx * shoulder,
      target.y + dist * spch + height,
      target.z - fz * dist * cp + rz * shoulder);
    const pivot = new THREE.Vector3(target.x + rx * shoulder * 0.6, target.y, target.z + rz * shoulder * 0.6);
    const frac = this.world.rayFraction(pivot.x, pivot.y, pivot.z, desired.x, desired.y, desired.z);
    desired.lerpVectors(pivot, desired, Math.max(0.12, frac * 0.94));
    const gy = this.world.surfaceHeight(desired.x, desired.z, desired.y);
    if (desired.y < gy + 0.4) desired.y = gy + 0.4;
    if (desired.y < WATER_Y + 0.3 && !P.swimming) desired.y = WATER_Y + 0.3;
    if (!this._camInit) { cam.position.copy(desired); this._camInit = true; }
    const k = v ? 14 : 22;
    cam.position.x = damp(cam.position.x, desired.x, k, dt);
    cam.position.y = damp(cam.position.y, desired.y, k, dt);
    cam.position.z = damp(cam.position.z, desired.z, k, dt);
    if (v) cam.position.lerp(desired, Math.min(1, dt * 8));
    const look = new THREE.Vector3(fx * cp, -spch * 0.6 - 0.05, fz * cp);
    const lp = v ? new THREE.Vector3(target.x + fx * lookAhead, target.y + 0.3, target.z + fz * lookAhead) : cam.position.clone().addScaledVector(look, 10);
    if (!v) lp.y += 0.35;
    const sh = this.effects.shake;
    if (sh > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * sh * 0.4, (Math.random() - 0.5) * sh * 0.4, (Math.random() - 0.5) * sh * 0.4));
    cam.lookAt(lp);
    cam.getWorldDirection(this.camForward);
    this.camForward.y = 0; this.camForward.normalize();
    this.effects.setScale(innerHeight, cam.fov);
  }
  titleCamera(dt) {
    const t = this.time * 0.04;
    const cx = 120, cz = -40;
    this.camera.position.set(cx + Math.cos(t) * 160 + 120, 38 + Math.sin(t * 0.7) * 10, cz + Math.sin(t) * 220);
    this.camera.lookAt(60, 25, -60 + Math.sin(t) * 60);
    this.camera.getWorldDirection(this.camForward); this.camForward.y = 0; this.camForward.normalize();
  }

  // ---------- döngü ----------
  loop() {
    requestAnimationFrame(this.loop);
    const t0 = performance.now();
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.paused) {
      if ((this.input.hit('KeyP') || this.input.hit('Escape')) && performance.now() - (this.pausedAt || 0) > 250) this.setPaused(false);
      this.input.endFrame(); return;
    }
    if (this.introOpen) {
      // oyun başı açıklama penceresi: oyun bekler, sahne çizilir; Enter / Space da başlatır
      if (this.input.hit('Enter') || this.input.hit('NumpadEnter') || this.input.hit('Space')) this.closeIntro();
      this.updateCamera(dt);   // arkada oyuncunun başlayacağı yer görünsün
      this.input.endFrame(); this.composer.render(); return;
    }
    if (this.overOpen) {
      // panel açıkken oyun durur; 1/2/3 tuşlarıyla da seçilebilir
      for (let i = 0; i < (this.overOpts || []).length; i++) if (this.input.hit('Digit' + (i + 1)) || this.input.hit('Numpad' + (i + 1))) { this.overOpts[i].fn(); break; }
      this.input.endFrame(); this.composer.render(); return;
    }
    if (this.state === 'play' && !this.mapOpen && !this.flights.menuOpen && this.input.hit('Escape')) { this.setPaused(true); this.input.endFrame(); return; }
    this.frame(dt, true);
    this.frameMs = (this.frameMs || 16) * 0.9 + (performance.now() - t0) * 0.1;
  }
  // ---------- sonradan yüklenen bölgeler ----------
  // Her bölge: st 0 yok, 1 iniyor, 2 indi, 3 kurulu. Oyuncu köprünün ortasından geri dönünce bölge hemen
  // BOŞALTILIR (nesneler, çarpışmalar, bölge araçları, GPU kaynakları silinir;
  // dönünce köprünün ortasında yeniden yüklenir). Yeni ada = defineRegions'a yeni satır + world'de build/unload.
  defineRegions() {
    const off = (k) => params.get(k) === '0';
    const warn = (what) => (e) => { console.warn(what + ' yüklenemedi:', e); return null; };
    const W = this.world;
    const selvaMid = (FOOT.z0 + FOOT.z1) / 2, westMid = (WBR.x0 + WBR.x1) / 2;
    this.regions = {
      selva: {
        title: 'Isla Selva', files: ['nature.json', 'nature.bin', 'animals.json'],
        // içinde: köprünün ada yarısı ya da ada; dışarıda: köprü ortasının 10 m şehir tarafı ya da adanın biraz açığı
        // (arada 10 m pay: ortada durunca yükle-boşalt arasında gidip gelmesin)
        inside: (p) => isleDN(p.x, p.z) < 1.15 || (onFoot(p.x, p.z) && p.z < selvaMid),
        out: (p) => isleDN(p.x, p.z) > 1.3 && !(onFoot(p.x, p.z) && p.z < selvaMid + 10),
        load: () => (off('nkit') ? null : loadNatureKit().catch(warn('Doğa modelleri'))),
        build: (k, a) => W.buildSelva(this.scene, k, a),
        unload: () => W.unloadSelva(),
      },
      west: {
        title: 'Wild West', files: ['west.bin', 'west_chars.json', 'animals.json'],
        inside: (p) => p.x < westMid,
        out: (p) => p.x > westMid + 10,
        load: () => (off('wkit') ? null : loadWestKit(this.westMeta).catch(warn('Wild West modelleri'))),
        build: (k, a) => {
          W.buildWest(this.scene, k, a);
          // kasaba meydanında ve çiftlikte at arabası (radyo kapalı)
          setWagonKits(k, a);
          const ww = W.west;
          for (const [x, z, h] of [[ww.plaza.x + 4, ww.plaza.z + 6, -Math.PI / 2], [ww.ranch.x + 22, ww.ranch.z - 2, 0]]) {
            const v = this.addVehicle('wagon', { x, y: W.surfaceHeight(x, z), z, heading: h, persistent: true });
            v.radio = STATIONS.length - 1; v.region = 'west';
          }
        },
        unload: () => { W.unloadWest(); setWagonKits(null, W.animalKit); },
      },
      // uçakla gidilen uzak bölgeler: kodu da yalnız gidilince iner (js/regions/<ad>.js: build, MAP)
      // Casablanca: modelli ortaçağ liman şehri (assets/web/casablanca.* ← tools/casablanca/convert.mjs)
      casablanca: {
        title: 'Casablanca', files: ['casablanca.json', 'casablanca.bin'], noAnimals: true,
        inside: (p) => Math.abs(p.x - CASA.x) < 1500 && Math.abs(p.z - CASA.z) < 1500,
        out: (p) => Math.abs(p.x - CASA.x) > 1560 || Math.abs(p.z - CASA.z) > 1560,
        load: () => import('./regions/casablanca.js').then((mod) => mod.load().then((kit) => ({ mod, kit }))),
        build: (r) => { if (!r) return; const R = this.regions.casablanca; R.handle = r.mod.build(this, r.kit); R.map = r.mod.MAP; },
        unload: () => { const R = this.regions.casablanca; R.handle?.unload(); R.handle = null; R.map = null; R.mapCanvas = null; },
      },
    };
    for (const R of Object.values(this.regions)) Object.assign(R, { st: 0, objs: null });
  }
  requestRegion(name) {
    const R = this.regions[name]; if (R.st) return;
    // aynı anda tek bölge iner/kurulur; diğeri bitince (bir sonraki karede) sıradaki başlar
    if (Object.values(this.regions).some((o) => o !== R && (o.st === 1 || o.st === 2))) return;
    R.st = 1;
    // hayvan kiti bölgelerde ortak (Selva: kaplan/geyik, Wild West: at) ve köprü başındaki at için kalıcı
    if (!R.noAnimals) this.animalsP = this.animalsP || (params.get('akit') === '0' ? Promise.resolve(null) : loadAnimalKit().catch((e) => { console.warn('Hayvan modelleri yüklenemedi:', e); return null; }));
    Promise.all([R.load(), R.noAnimals ? null : this.animalsP]).then(([k, a]) => { R.kits = [k, a]; R.st = 2; })
      .catch((e) => { console.warn(R.title + ' yüklenemedi:', e); R.kits = [null, null]; R.st = 2; });
  }
  buildRegion(name) {
    const R = this.regions[name], [k, a] = R.kits, sc = this.scene, W = this.world;
    const before = new Set(sc.children), b0 = W.boxes.length, c0 = W.circles.length;
    R.build(k, a);
    // bölgenin sahne nesneleri ve çarpışmaları (kurulum eşzamanlı: aradaki her şey bu bölgenin)
    R.objs = sc.children.filter((o) => !before.has(o));
    R.col = [b0, W.boxes.length, c0, W.circles.length];
    for (const o of R.objs) {
      if (o.userData.west) { this.westObjs.push(o); o.visible = this.westShown; }
      else if (o.userData.selva) { this.selvaObjs.push(o); o.visible = !this.inWest; }
    }
    R.st = 3; R.kits = null;
  }
  // bölgeyi bellekten tamamen çıkar: nesneler, bölge araçları, çarpışmalar, GPU kaynakları
  unloadRegion(name) {
    const R = this.regions[name]; if (R.st !== 3) return;
    const sc = this.scene, removed = [...R.objs];
    for (const v of this.vehicles.slice()) {
      if (v.region === name && this.player.vehicle !== v) { removed.push(v.mesh); this.removeVehicle(v); }
    }
    sc.remove(...R.objs);
    const gone = new Set(R.objs);
    this.westObjs = this.westObjs.filter((o) => !gone.has(o));
    this.selvaObjs = this.selvaObjs.filter((o) => !gone.has(o));
    this.world.removeColliders(...R.col);
    R.unload();
    disposeUnused(removed, sc, this.world.animalKit);
    Object.assign(R, { st: 0, objs: null, col: null, armed: false, doneAt: 0, shown: false });
    console.info(R.title + ' bellekten boşaltıldı.');
  }
  // binek atlar: köprü başında (ve Wild West kuruluysa karşı uçta) birer at bekler; uzaklaşan/binilen gidince yenisi gelir
  ensureHorses() {
    if (!this.animalsP) this.animalsP = params.get('akit') === '0' ? Promise.resolve(null) : loadAnimalKit().catch((e) => { console.warn('Hayvan modelleri yüklenemedi:', e); return null; });
    if (!this.horseKitReady) {
      if (!this.horseKitWait) { this.horseKitWait = true; this.animalsP.then((a) => { setAnimalKit(a); this.horseKitReady = true; }); }
      return;
    }
    const P = this.player, fp = P.vehicle ? P.vehicle.pos : P.pos;
    for (const h of HORSE_SPOTS) {
      if (h.west && this.regions.west.st < 3) continue;
      if (Math.hypot(fp.x - h.x, fp.z - h.z) > 200) continue;   // araç temizliği 250 m'de siler: gelip gitmesin
      if (this.vehicles.some((v) => v.type === 'horse' && !v.wrecked && Math.hypot(v.pos.x - h.x, v.pos.z - h.z) < 30)) continue;
      const v = this.addVehicle('horse', { x: h.x, y: this.world.surfaceHeight(h.x, h.z), z: h.z, heading: h.heading });
      v.radio = STATIONS.length - 1;
      if (h.west) v.region = 'west';   // Wild West boşaltılınca karşı uçtaki at da gider (biniliyse kalır)
    }
  }
  // köprüye yaklaşınca indir, inince kur; oyuncu bölgeye girdiyse ve hazır değilse true (bekle)
  updateRegions(render) {
    const P = this.player, fp = P.vehicle ? P.vehicle.pos : P.pos;
    // bölgeler köprülerin ORTASI geçilince yüklenir (kullanıcı: köprüye yaklaşınca değil; iki bölge aynı anda değil).
    // Oyuncu ortada, bölge kurulana kadar "… yükleniyor" yazısıyla bekler.
    const inside = {};
    const now = performance.now();
    for (const [n, R] of Object.entries(this.regions)) {
      inside[n] = R.inside(fp);
      // köprünün ortasından geri dönülünce bölge hemen bellekten boşaltılır (kullanıcı seçimi: telefon için)
      if (R.st === 3 && R.out(fp)) this.unloadRegion(n);
      // indirme sürerken geri dönüldüyse inen kit kurulmadan bırakılır
      else if (R.st === 2 && R.out(fp)) Object.assign(R, { st: 0, kits: null, armed: false });
    }
    const dHead = Math.hypot(fp.x - WBR.x0, fp.z - WBR.z);
    // binek at köprü başında beklemeli: hayvan kiti (~2,6 MB) köprü başına ~260 m kala iner
    if (dHead < 260 || fp.x < WEST_X) this.ensureHorses();
    for (const n in inside) if (inside[n]) this.requestRegion(n);
    if (P.vehicle && P.vehicle.type !== 'horse' && P.vehicle.type !== 'boat' && dHead < 35)
      this.hud.hint("Wild West'e araçla girilmez: F ile in, köprü başındaki ata bin.", 0.4);
    let msg = null, wait = false, prog = 0;
    for (const [n, R] of Object.entries(this.regions)) {
      // çubuk: indirme %90'a kadar, kurulum son dilim; bitince tamamen yeşil kısa bir süre görünür
      const p = R.st === 1 ? 0.9 * downloadProgress(R.files) : R.st === 2 ? 0.92 : 1;
      if (R.st === 2) {
        // ekranda yazı bir kare görünsün, sonra kur (kurulum birkaç yüz ms sürebilir)
        if (!render || R.armed) {
          this.buildRegion(n);
          if (R.shown) R.doneAt = now;
        } else { R.armed = true; msg = R.title + ' yükleniyor…'; prog = p; }
      }
      if (inside[n] && R.st < 3) { wait = true; msg = R.title + ' yükleniyor…'; prog = p; }
      if (!msg && R.doneAt && now - R.doneAt < 600) { msg = R.title + ' hazır'; prog = 1; }
      R.shown = !!msg && msg.startsWith(R.title);
    }
    if (msg) { this.regionText.textContent = msg; setBar(this.regionBar, prog); }
    this.regionEl.style.display = msg ? 'block' : 'none';
    return wait;
  }
  // test/hata ayıklama: render etmeden simülasyonu ilerlet
  simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) this.frame(dt, false); }
  frame(dt, render) {
    const inp = this.input;
    if (this.state === 'play') {
      if (inp.hit('KeyM')) { this.mapOpen = !this.mapOpen; $('bigmap').classList.toggle('hidden', !this.mapOpen); if (this.mapOpen) this.hud.drawBigMap(); }
      if (inp.hit('KeyP')) this.setPaused(true);
    }
    if (this.mapOpen) { this.hud.update(0); this.input.endFrame(); if (render) this.composer.render(); return; }
    // bölge henüz yüklenmediyse (oyuncu köprünün öbür yarısında) oyun bekler
    if (this.updateRegions(render)) { this.input.endFrame(); if (render) this.composer.render(); return; }
    this.time += dt;
    const P = this.player;
    if (this.state === 'play') {
      if (P.vehicle && (inp.hit('KeyQ') || inp.hit('KeyE'))) {
        const st = this.audio.nextStation(inp.hit('KeyQ') ? -1 : 1);
        P.vehicle.radio = this.audio.station;
        this.hud.radio(st.name);
      }
      if (inp.hit('KeyV')) {
        this.steerAssist = !this.steerAssist;
        this.hud.notify(this.steerAssist ? 'Yola hizalama yardımı: AÇIK (araç ve yürüyüş yola kendiliğinden paralel olur)' : 'Yola hizalama yardımı: KAPALI');
      }
      // havaalanı: tabela/uçak tuşları önce (F ve E'yi kendisi alır); uçaktayken oyuncu güncellenmez
      if (this.flights.update(dt, inp)) P.prompt = this.flights.prompt;
      else { P.update(dt, inp, this.cam.yaw); if (this.flights.prompt && !P.prompt) P.prompt = this.flights.prompt; }
    }
    // araçlar
    for (const v of this.vehicles) {
      if (v.ai) v.ai.update(dt);
      const sub = v.speed > 28 ? 2 : 1;
      for (let s = 0; s < sub; s++) v.update(dt / sub, this);
    }
    this.collideVehicles();
    this.collidePeds();
    for (const p of this.peds) p.update(dt);
    this.traffic.update(dt);
    if (this.state === 'play') { this.police.update(dt); this.missions.update(dt); }
    this.cleanupVehicles();
    // çevre
    const focus = this.flights.focus() || (P.vehicle ? P.vehicle.pos : P.pos);
    if (this.state === 'play') this.updateCamera(dt); else this.titleCamera(dt);
    this.env.update(dt, this.state === 'play' ? focus : this.camera.position, this.camera);
    this.env.tickFlash(dt);
    this.world.update(dt, this.env, this.time);
    this.flights.setNight(this.env.night);
    for (const R of Object.values(this.regions)) {   // uzak bölgeler: gece ışıkları + uzaklık/görüş ayıklaması
      R.handle?.setNight?.(this.env.night);
      if (render) R.handle?.update?.(this.camera);
    }
    this.world.wildlife?.update(dt, this, this.camera);   // Isla Selva hayvanları
    if (this.westShown) this.world.west?.life?.update(dt, this);   // Wild West: kovboylar + atlar
    this.arrows.update(dt, this);                         // yayla atılan oklar
    this.effects.update(dt);
    this.bloom.strength = 0.38 + this.env.night * 0.42 + this.env.wet * 0.08;
    this.bloom.threshold = 0.92 - this.env.night * 0.1;
    this.toonPass.uniforms.uNight.value = this.env.night;
    // oyuncu farları
    const hv = P.vehicle;
    if (hv && this.env.night > 0.15 && !hv.wrecked && hv.type !== 'horse' && hv.type !== 'wagon') {   // at ve at arabasında far yok
      const fx = Math.sin(hv.heading), fz = Math.cos(hv.heading);
      this.headlight.position.set(hv.pos.x + fx * hv.cfg.len * 0.5, hv.pos.y + 0.9, hv.pos.z + fz * hv.cfg.len * 0.5);
      this.headlight.target.position.set(hv.pos.x + fx * 25, hv.pos.y - 1, hv.pos.z + fz * 25);
      this.headlight.intensity = 70 * this.env.night;
    } else this.headlight.intensity = 0;
    // araç far havuzları
    const vehHeadPool = this.env.night * 0.55;
    if (this.vehicles[0]) this.vehicles[0].parts && (this.vehiclesHeadPoolOpacity = vehHeadPool);
    const anyPool = this.vehicles.find((v) => v.mesh.children.length);
    if (anyPool) { const m = findPoolMat(anyPool); if (m) m.opacity = vehHeadPool; }
    // ses
    if (this.audio.ctx) {
      this.audio.listener = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
      let siren = 0;
      for (const v of this.vehicles) if (v.siren && !v.wrecked) siren = Math.max(siren, 1 - Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z) / 140);
      const ev = hv ? { rpm: rpmOf(hv), throttle: hv.controls.throttle, type: hv.type } : null;
      this.audio.updateLoops({ engine: ev, siren, skid: hv && hv.skidding, rain: this.env.rain, wind: hv ? hv.speed * hv.speed * (hv.type === 'horse' || hv.type === 'wagon' ? 0.004 : 0.02) : 0, inCar: !!hv });
    }
    if (this.state === 'play') {
      this.hud.update(dt);
      $('lockhint').classList.toggle('hidden', this.input.locked || this.mapOpen);
    }
    if (render) {
      // adada (ya da köprünün ada tarafındaki yarısında) yayayken şehir hiç çizilmez
      const P = this.player, fp = P.vehicle ? P.vehicle.pos : P.pos;
      const inSelva = !P.vehicle && (isleDN(fp.x, fp.z) < 1.05 || (onFoot(fp.x, fp.z) && fp.z < (FOOT.z0 + FOOT.z1) / 2));
      // Wild West: Puente Oeste'nin ortası geçilince Palmera ve Isla Selva çizilmez; Palmera'nın içindeyken de Wild West
      const inWest = fp.x < (WBR.x0 + WBR.x1) / 2, westShown = inWest || fp.x < WEST_X + 170;
      // uçakla gidilen uzak bölgelerde (açık denizin ötesi) Palmera ve Isla Selva gizli
      const abroad = fp.x > 1500;   // uçuşta oyuncu konumu varışta gidilen havaalanına taşınır
      const hide = inSelva || inWest || abroad, selvaOff = inWest || abroad;
      if (hide !== this.cityHidden) { this.cityHidden = hide; for (const o of this.cityObjs) o.visible = !hide; }
      // Palmera pistinde bekleyen uçak şehirle birlikte gizlenir (adası çizilmezken havada durmasın)
      this.flights.plane.visible = !(hide && this.flights.at === 'palmera' && this.flights.state === 'idle');
      if (selvaOff !== this.inWest) { this.inWest = selvaOff; for (const o of this.selvaObjs) o.visible = !selvaOff; }
      if (westShown !== this.westShown) { this.westShown = westShown; for (const o of this.westObjs) o.visible = westShown; }
      if (this.world.city && !hide) this.world.city.update(this.camera);
      if (!selvaOff) this.world.forest?.update(this.camera);
      if (westShown) this.world.west?.update(this.camera);
      this.composer.render();
    }
    this.input.endFrame();
  }
  cleanupVehicles() {
    const P = this.player.pos;
    for (const v of this.vehicles.slice()) {
      if (v.driver === 'player' || v.persistent || v.roadblock) continue;
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      const isCop = (v.ai && v.ai.isCop) || v.copCar;
      if (isCop) continue;
      if (v === this.lastCar && d < 400) continue;
      const parked = this.world.parkingSpots.some((s) => s.vehicle === v);
      if (parked) continue;
      const lim = v.wrecked ? 120 : 250;
      if (d > lim) this.removeVehicle(v);
      else if (v.ai instanceof Driver && d > 170 && !this.traffic.visibleFrom(v.pos.x, v.pos.z)) this.removeVehicle(v);
    }
  }
}

function rpmOf(v) {
  const sp = Math.abs(v.forwardSpeed), max = v.cfg.maxSpeed;
  // tekne: su sürtünmesi yüzünden gerçek en yüksek hız waterTop (~63 km/sa)
  if (v.type === 'boat') return clamp(sp / (v.cfg.waterTop || max), 0, 1) * 0.8 + v.controls.throttle * 0.2;
  const gears = v.cfg.gears || 5, span = max / gears;
  const g = Math.min(gears - 1, Math.floor(sp / span));
  return clamp(0.2 + ((sp - g * span) / span) * 0.75 + (g === 0 ? 0 : 0.05), 0.15, 1);
}
let poolMatCache = null;
function findPoolMat(v) {
  if (poolMatCache) return poolMatCache;
  v.mesh.traverse((o) => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending && o.material.map) poolMatCache = o.material; });
  return poolMatCache;
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* yok */ } }
function updateParam(k, v) { const p = new URLSearchParams(location.search); p.set(k, v); return p.toString(); }
void wrapAngle;

// açılış çubuğu: indirme %90'a kadar, şehir kurulumu son dilim; bitince tamamen yeşil, sonra ekran kaybolur
const bootBar = document.querySelector('#loading .ld-bar div');
let bootFloor = 0, bootDone = false;
(function tickBoot() {
  if (bootDone) return;
  setBar(bootBar, Math.max(bootFloor, 0.9 * downloadProgress(BOOT_FILES)));
  requestAnimationFrame(tickBoot);
})();
function hideLoading() {
  const ld = document.getElementById('loading');
  if (!ld || ld.classList.contains('done')) return;
  bootDone = true; setBar(bootBar, 1);
  setTimeout(() => { ld.classList.add('done'); setTimeout(() => ld.remove(), 700); }, 450);
}
// "Yükleniyor..." ekranı önce boyansın, ağır şehir kurulumu sonra başlasın
requestAnimationFrame(() => setTimeout(async () => {
  // hazır bina modelleri (yüklenemezse şehir eski kutu binalarla kurulur)
  let kit = null;
  // araç modelleri binalarla aynı anda iner (yüklenemezse kodla çizilen araçlar kullanılır)
  const vkit = params.get('vkit') === '0' ? null
    : loadVehicleKit().catch((e) => { console.warn('Araç modelleri yüklenemedi, basit araçlar kullanılıyor:', e); });
  // Isla Selva (doğa + hayvan) ve Wild West modelleri açılışta inmez: köprülerinin ortası geçilince (Game.updateRegions).
  // Açılışta yalnız Wild West tür listesi (14 KB): haritada bina izleri görünsün.
  const westMetaP = loadWestMeta().catch((e) => { console.warn('Wild West listesi yüklenemedi:', e); return null; });
  if (params.get('kit') !== '0') {
    try { kit = await loadBuildingKit(params.get('q') || localStorageGet('pn_quality') || 'low'); }
    catch (e) { console.warn('Bina modelleri yüklenemedi, basit binalar kullanılıyor:', e); }
  }
  await vkit;
  const westMeta = await westMetaP;
  // indirmeler bitti: çubuk kurulum dilimine geçsin ve boyansın, sonra (eşzamanlı, ağır) kurulum
  bootFloor = 0.92;
  await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
  try {
    const game = new Game(kit, westMeta);
    // ilk kare çizildikten sonra yükleme ekranını kaldır
    requestAnimationFrame(() => requestAnimationFrame(hideLoading));
    void game;
  } catch (e) {
    console.error(e);
    hideLoading();
    const el = document.getElementById('fatal');
    if (el) { el.textContent = 'Oyun başlatılamadı: ' + e.message; el.classList.remove('hidden'); }
  }
}, 30));
