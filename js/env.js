// Gökyüzü, gün döngüsü, hava durumu, su, yağmur ve ıslak zemin yansımaları
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';
import { WATER_Y } from './world.js';
import * as T from './textures.js';

// saat, zenit, ufuk, güneş rengi, güneş şiddeti, yarıküre gök, yarıküre yer, yarıküre şiddeti, sis
const KEYS = [
  [0.0, '#06051c', '#211548', '#7f8fd0', 0.55, '#4a4a8c', '#221a30', 0.7, '#160f33'],
  [4.6, '#080726', '#2c1b50', '#7f8fd0', 0.5, '#4a4a8c', '#221a30', 0.7, '#1b1236'],
  [5.8, '#2c2c6c', '#d97a8e', '#ff9a70', 0.8, '#6a5a9a', '#3a2a30', 0.6, '#8a5a7a'],
  [7.0, '#4a7ad0', '#ffc6a6', '#ffd4a8', 2.2, '#a0b8e0', '#6a5a50', 0.85, '#d6b6b2'],
  [9.0, '#2d74d6', '#a9d6f2', '#fff4e2', 3.2, '#bcd8ff', '#8a7a60', 1.0, '#b8d4ea'],
  [16.0, '#2d74d6', '#acd6f0', '#fff0d8', 3.0, '#bcd8ff', '#8a7a60', 1.0, '#bcd4e6'],
  [17.6, '#3f62c4', '#ffc28c', '#ffc27e', 2.5, '#a8acdf', '#7a6050', 0.9, '#e4b693'],
  [18.6, '#3b2c8c', '#ff7aa8', '#ff9a6a', 1.7, '#b6a6c8', '#6a5050', 0.85, '#e58fae'],
  [19.4, '#2a1a72', '#d257b6', '#ff8a86', 0.9, '#9286b0', '#3a2a40', 0.75, '#a85aa8'],
  [20.3, '#100a3a', '#5a2c80', '#8a90d0', 0.55, '#5a5294', '#1d1a28', 0.62, '#33205a'],
  [21.5, '#07061f', '#2a1850', '#7f8fd0', 0.55, '#4a4a8c', '#221a30', 0.7, '#191035'],
  [24.0, '#06051c', '#211548', '#7f8fd0', 0.55, '#4a4a8c', '#221a30', 0.7, '#160f33'],
].map((k) => [k[0], new THREE.Color(k[1]), new THREE.Color(k[2]), new THREE.Color(k[3]), k[4], new THREE.Color(k[5]), new THREE.Color(k[6]), k[7], new THREE.Color(k[8])]);

const skyVert = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`;
const skyFrag = `
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uMoonDir; uniform float uNight, uTime, uCloud, uRain, uFlash, uEnv, uToon;
varying vec3 vDir;
// çizgi film: değeri yumuşak kenarlı n basamağa böler (boyanmış gibi renk bantları)
float bands(float t, float n){ float s = t * n; return (floor(s) + smoothstep(0.4, 0.6, fract(s))) / n; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float gt = pow(smoothstep(-0.02, 0.65, h), 0.55);
  gt = mix(gt, bands(gt, 6.0), uToon);
  vec3 col = mix(uHorizon, uZenith, gt);
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.15, 0.05, uSunDir.y);
  col += uSunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.6) * sunUp * (1.0 - uRain * 0.8);
  if (uToon > 0.5) {
    // büyük, düz boyalı güneş + çevresinde yumuşak hale (gün batımında iri ve sıcak)
    float disc = smoothstep(0.9962, 0.9968, sd);
    float ring = smoothstep(0.985, 0.9962, sd) * (1.0 - disc);
    col = mix(col, uSunCol * mix(2.2, 1.2, uEnv) + vec3(0.25, 0.2, 0.05), disc * sunUp * (1.0 - uRain));
    col += uSunCol * ring * 0.35 * sunUp * (1.0 - uRain);
  } else {
    col += uSunCol * smoothstep(0.9993, 0.9997, sd) * mix(12.0, 1.5, uEnv) * sunUp * (1.0 - uRain);
  }
  // bulutlar
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.3);
    float cov = mix(0.58, 0.28, uCloud);
    float cm = smoothstep(cov, cov + 0.32, c) * smoothstep(0.0, 0.18, h);
    vec3 lit = mix(uZenith * 0.7 + uHorizon * 0.4, uSunCol * 1.1 + uHorizon * 0.6, 0.35 + 0.65 * pow(sd, 3.0));
    if (uToon > 0.5) {
      // keskin kenarlı bulut + iki tonlu boyama: güneşe bakan kenar aydınlık, alt/iç gölge
      cm = smoothstep(cov + 0.04, cov + 0.09, c) * smoothstep(0.0, 0.12, h);
      float c2 = fbm(uv * 1.3 - uSunDir.xz * 0.12);
      float edge = smoothstep(-0.01, 0.03, c - c2);
      vec3 shade = mix(uZenith, uHorizon, 0.55) * 0.82 + uSunCol * 0.08;
      vec3 light = uSunCol * 0.9 + uHorizon * 0.55;
      lit = mix(shade, light, edge * (0.45 + 0.55 * pow(sd, 2.0)) + 0.15);
      lit *= mix(1.0, 0.45, uNight);   // gece bulutlar ay ışığında sönük kalsın
    }
    lit = mix(lit, vec3(0.32,0.33,0.38) * (0.25 + 0.75*(1.0-uNight)), uRain * 0.75);
    col = mix(col, lit, cm * 0.85);
    // yıldızlar
    vec3 sp = floor(d * 380.0);
    float st = step(0.9982, hash3(sp)) * uNight * smoothstep(0.05, 0.35, h) * (1.0 - cm) * (1.0 - uRain);
    col += vec3(st) * (0.6 + 0.6 * sin(uTime * 3.0 + hash3(sp) * 50.0));
    // ay
    float md = dot(d, uMoonDir);
    col += vec3(0.95, 0.93, 1.0) * smoothstep(0.99955, 0.99975, md) * uNight * 2.5 * (1.0 - cm * 0.8);
    col += vec3(0.3, 0.32, 0.5) * pow(max(md, 0.0), 40.0) * uNight * 0.3;
  }
  col += vec3(0.8, 0.85, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}`;

const waterVert = `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const waterFrag = `
uniform float uTime, uFogDensity, uNight, uRain;
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uFogColor, uDeep;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vWorld.xz; float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(cos(p.x * 0.11 + t * 1.1), sin(p.y * 0.09 + t * 0.8)) * 0.07;
  g += vec2(0.3, 0.5) * cos(dot(p, vec2(0.3, 0.5)) * 0.7 + t * 1.7) * 0.09;
  g += vec2(-0.6, 0.2) * cos(dot(p, vec2(-0.6, 0.2)) * 1.3 + t * 2.3) * 0.05;
  float n1 = noise(p * 0.6 + t * 0.6) - noise(p * 0.6 - vec2(t * 0.5, 0.0));
  float n2 = noise(p.yx * 0.6 + t * 0.4) - noise(p.yx * 0.6 + vec2(0.0, t * 0.7));
  g += vec2(n1, n2) * (0.12 + uRain * 0.15);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, clamp(r.y * 1.6, 0.0, 1.0));
  vec3 col = mix(uDeep, sky, clamp(fres * 1.15, 0.0, 1.0));
  float spec = pow(max(dot(r, uSunDir), 0.0), 220.0) * smoothstep(-0.1, 0.05, uSunDir.y);
  col += uSunCol * spec * 4.0 * (1.0 - uRain);
  // gece şehir ışığı pırıltıları
  float sp = step(0.985, noise(p * 2.5 + t)) * uNight;
  col += vec3(1.0, 0.4, 0.8) * sp * 0.25;
  float d = length(vWorld - cameraPosition);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
}`;

const rainVert = `
attribute float aEnd; attribute float aRnd;
uniform float uTime, uAmount; uniform vec3 uCam;
varying float vA;
void main(){
  vec3 p = position;
  vec3 w;
  w.xz = uCam.xz + mod(p.xz - uCam.xz + 35.0, 70.0) - 35.0;
  w.y = uCam.y - 18.0 + mod(p.y - uTime * (26.0 + aRnd * 8.0), 42.0);
  w.y -= aEnd * 1.1; w.x += aEnd * 0.18;
  vA = aRnd < uAmount ? 1.0 : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (vA < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const rainFrag = `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, 0.32 * vA); }`;

export const START_HOUR = 8;   // oyun açılışı ve "oyunun başına dön" saati (kullanıcı isteği)
export class Environment {
  constructor(renderer, scene, world) {
    this.renderer = renderer; this.scene = scene; this.world = world;
    this.hour = START_HOUR;     // sabah 08:00'de başla
    this.daySeconds = 1440;     // bir gün = 24 dakika
    this.night = 0; this.wet = 0; this.rain = 0; this.rainTarget = 0;
    this.flash = 0; this.lightningTimer = 8;
    // yağmur takvimi (oyun saati, mutlak): her yağmurdan sonra 2–7 gün sonra yeniden
    this.clock = this.hour;     // başlangıçtan beri geçen oyun saati (gün = 24)
    this.resetWeather();
    this.time = 0;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.cur = { zenith: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), fog: new THREE.Color(), sunInt: 1, hemiInt: 1 };

    // gökyüzü
    this.skyUniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
      uCloud: { value: 0.3 }, uRain: { value: 0 }, uFlash: { value: 0 }, uEnv: { value: 0 }, uToon: { value: 0 },
    };
    this.toon = false;   // çizgi film görünümü (main.js setToon)
    const skyMat = new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);
    // çevre haritası için ayrı sahne
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTimer = 0; this.envRT = null;

    // ışıklar
    this.sunLight = new THREE.DirectionalLight('#ffffff', 2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
    this.sunLight.shadow.bias = -0.0004; this.sunLight.shadow.normalBias = 0.05;
    scene.add(this.sunLight, this.sunLight.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    scene.add(this.hemi);
    this.flashLight = new THREE.PointLight('#ffb070', 0, 40, 1.6);
    scene.add(this.flashLight);

    scene.fog = new THREE.FogExp2('#ffffff', 0.0022);

    // deniz
    this.waterUniforms = {
      uTime: { value: 0 }, uFogDensity: { value: 0.002 }, uNight: { value: 0 }, uRain: { value: 0 },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color('#0d4f5c') },
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShaderMaterial({ uniforms: this.waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag }));
    water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
    scene.add(water);
    this.water = water;   // kamerayla kayar (uzak bölgelerde de deniz olsun); dalgalar dünya koordinatından

    // yağmur
    const N = 5000, pos = new Float32Array(N * 6), end = new Float32Array(N * 2), rnd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 70, y = Math.random() * 42, z = Math.random() * 70, r = Math.random();
      pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; rnd[i * 2] = rnd[i * 2 + 1] = r;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    rg.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    this.rainUniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color('#b8c8e8') } };
    this.rainMesh = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainUniforms, vertexShader: rainVert, fragmentShader: rainFrag, transparent: true, depthWrite: false }));
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);

    // ıslak zemin neon yansımaları
    const sg = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
    this.streakMat = new THREE.MeshBasicMaterial({ map: T.streakTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -6 });
    this.streakMax = 160;
    this.streaks = new THREE.InstancedMesh(sg, this.streakMat, this.streakMax);
    this.streaks.frustumCulled = false; this.streaks.count = 0; this.streaks.renderOrder = 3;
    for (let i = 0; i < this.streakMax; i++) this.streaks.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(this.streaks);
    this.streakTimer = 0;
    this._o = new THREE.Object3D();
  }

  get timeString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  sample(h) {
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
    const c = this.cur;
    c.zenith.copy(a[1]).lerp(b[1], t); c.horizon.copy(a[2]).lerp(b[2], t); c.sun.copy(a[3]).lerp(b[3], t);
    c.sunInt = lerp(a[4], b[4], t);
    c.hemiSky.copy(a[5]).lerp(b[5], t); c.hemiGround.copy(a[6]).lerp(b[6], t); c.hemiInt = lerp(a[7], b[7], t);
    c.fog.copy(a[8]).lerp(b[8], t);
  }

  // bir sonraki yağmur: 2–7 (tam sayı) gün sonra, o günün rastgele bir saatinde
  scheduleRain() {
    const days = 2 + Math.floor(Math.random() * 6);
    this.nextRainAt = (Math.floor(this.clock / 24) + days) * 24 + Math.random() * 24;
    this.rainEndAt = Infinity;
  }
  // yağmuru kes ve takvimi baştan kur (yeni oyun / başa dönüş)
  resetWeather() { this.rain = this.rainTarget = 0; this.wet = 0; this.scheduleRain(); }
  // hemen yağdır (test: ?rain=1); hours verilmezse durmaz
  forceRain(hours = Infinity) { this.rain = this.rainTarget = 1; this.wet = 1; this.nextRainAt = this.clock; this.rainEndAt = this.clock + hours; }

  // hava durumu: takvime göre başlar, 2–5 oyun saati sürer; dh = geçen oyun saati
  tickWeather(dh) {
    this.clock += dh;
    if (this.rainTarget === 0 && this.clock >= this.nextRainAt) {
      this.rainTarget = 0.55 + Math.random() * 0.45;
      this.rainEndAt = this.clock + 2 + Math.random() * 3;
    } else if (this.rainTarget > 0 && this.clock >= this.rainEndAt) {
      this.rainTarget = 0;
      this.scheduleRain();
    }
  }

  update(dt, focus, camera) {
    this.time += dt;
    const dh = dt * 24 / this.daySeconds;
    this.hour = (this.hour + dh) % 24;
    this.tickWeather(dh);
    this.rain += clamp(this.rainTarget - this.rain, -dt * 0.05, dt * 0.05);
    if (this.rain > 0.05) this.wet = Math.min(1, this.wet + dt * 0.03 * this.rain * 2);
    else this.wet = Math.max(0, this.wet - dt * 0.006);

    // şimşek
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.rain > 0.7) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) { this.flash = 1; this.lightningTimer = 6 + Math.random() * 14; this.onThunder?.(); }
    }

    const h = this.hour;
    this.sample(h);
    const c = this.cur;
    const a = ((h - 6.0) / 13.9) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.9, 0.38).normalize();
    this.moonDir.set(-Math.cos(a) * 0.8, Math.max(0.25, -Math.sin(a) * 0.8 + 0.35), -0.4).normalize();
    this.night = smoothstep(0.12, -0.14, this.sunDir.y);

    // yağmurda renkleri griye çek
    const grey = new THREE.Color(0.28, 0.3, 0.36).multiplyScalar(0.25 + 0.75 * (1 - this.night));
    const rk = this.rain * 0.7;
    const zen = c.zenith.clone().lerp(grey, rk), hor = c.horizon.clone().lerp(grey.clone().multiplyScalar(1.3), rk);
    const fogc = c.fog.clone().lerp(grey.clone().multiplyScalar(1.2), rk);

    const su = this.skyUniforms;
    su.uZenith.value.copy(zen); su.uHorizon.value.copy(hor); su.uSunDir.value.copy(this.sunDir); su.uSunCol.value.copy(c.sun);
    su.uMoonDir.value.copy(this.moonDir); su.uNight.value = this.night; su.uTime.value = this.time; su.uCloud.value = 0.25 + this.rain * 0.75;
    su.uRain.value = this.rain; su.uFlash.value = this.flash * 0.6;
    this.sky.position.copy(camera.position);
    this.water.position.x = Math.round(camera.position.x / 100) * 100;
    this.water.position.z = Math.round(camera.position.z / 100) * 100;

    // güneş / ay ışığı
    const sunUp = this.sunDir.y > 0.02;
    const ldir = sunUp ? this.sunDir : this.moonDir;
    const lint = sunUp ? c.sunInt * smoothstep(0.0, 0.12, this.sunDir.y) + 0.0 : 0.38;
    this.sunLight.intensity = Math.max(sunUp ? 0.1 : 0.3, lint) * (1 - this.rain * 0.65);
    this.sunLight.color.copy(sunUp ? c.sun : new THREE.Color('#8fa0e0'));
    // gölge kamerasını texel ızgarasına oturt
    const snap = 150 / 2048;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sunLight.position.set(fx + ldir.x * 200, focus.y + ldir.y * 200, fz + ldir.z * 200);
    this.sunLight.target.position.set(fx, focus.y, fz);
    this.hemi.color.copy(c.hemiSky); this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiInt * (1 - this.rain * 0.3) + this.flash * 2.5;

    this.scene.fog.color.copy(fogc);
    // fogScale: bölgeye göre sis çarpanı (Casablanca daha açık)
    // çizgi film görünümünde sis %30 az (uzak renkler solmasın)
    this.scene.fog.density = (0.0017 + this.night * 0.0006) * (this.fogScale ?? 1) * (this.toon ? 0.7 : 1) + this.rain * 0.0045;

    const wu = this.waterUniforms;
    wu.uTime.value = this.time; wu.uFogDensity.value = this.scene.fog.density; wu.uNight.value = this.night; wu.uRain.value = this.rain;
    wu.uZenith.value.copy(zen); wu.uHorizon.value.copy(hor); wu.uSunDir.value.copy(this.sunDir); wu.uSunCol.value.copy(c.sun);
    wu.uFogColor.value.copy(fogc);
    wu.uDeep.value.set('#0b5563').lerp(new THREE.Color('#050a1a'), this.night * 0.85).lerp(new THREE.Color('#1c2a30'), this.rain * 0.5);

    this.rainUniforms.uTime.value = this.time; this.rainUniforms.uAmount.value = this.rain;
    this.rainUniforms.uCam.value.copy(camera.position);
    this.rainUniforms.uColor.value.setRGB(0.7, 0.78, 0.92).multiplyScalar(0.4 + (1 - this.night) * 0.6);

    // çevre haritasını aralıklı yenile
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 3;
      this.skyUniforms.uEnv.value = 1;
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 1000);
      this.skyUniforms.uEnv.value = 0;
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }

    // yansıma şeritleri
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) { this.streakTimer = 0.12; this.updateStreaks(camera); }
    this.streakMat.color.setScalar(this.wet * (0.15 + this.night * 1.1) * 1.6);
    this.streaks.visible = this.wet > 0.02;
  }

  updateStreaks(camera) {
    if (this.wet < 0.02) { this.streaks.count = 0; return; }
    const cx = camera.position.x, cz = camera.position.z;
    const list = [];
    for (const s of this.world.lightSources) {
      const dx = s.x - cx, dz = s.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 170 * 170) list.push([d2, s]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const o = this._o;
    let n = 0;
    for (const [, s] of list) {
      if (n >= this.streakMax) break;
      const gy = this.world.surfaceHeight(s.x, s.z, s.y);
      const dx = cx - s.x, dz = cz - s.z;
      const d = Math.hypot(dx, dz) || 1;
      const L = Math.min(d * 0.8, (s.y - gy) * 2.2 + 5);
      o.position.set(s.x, gy + 0.06, s.z);
      o.rotation.set(0, Math.atan2(dx / d, dz / d), 0);
      o.scale.set(s.kind === 'neon' ? Math.min(6, s.w * 0.45) : 1.6, 1, L);
      o.updateMatrix();
      this.streaks.setMatrixAt(n, o.matrix);
      this.streaks.setColorAt(n, s.color);
      n++;
    }
    this.streaks.count = n;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
  }

  explosionFlash(x, y, z) {
    this.flashLight.position.set(x, y + 2, z);
    this.flashLight.intensity = 400;
  }
  tickFlash(dt) { this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 900); }
}
