// Parçacıklar (duman, kıvılcım, ateş, su), fren izleri
import * as THREE from 'three';

const pVert = `
attribute vec4 aColor; attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const pFrag = `
varying vec4 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

class PointSystem {
  constructor(scene, max, additive) {
    this.max = max; this.items = [];
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: pVert, fragmentShader: pFrag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.geom = g;
  }
  spawn(p) {
    if (this.items.length >= this.max) this.items.shift();
    p.age = 0;
    this.items.push(p);
  }
  update(dt) {
    const it = this.items;
    let w = 0;
    for (let i = 0; i < it.length; i++) {
      const p = it[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= (p.grav || 0) * dt;
      const dr = Math.exp(-(p.drag || 0) * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      it[w++] = p;
    }
    it.length = w;
    for (let i = 0; i < w; i++) {
      const p = it[i], t = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const c = p.c1 ? [p.c0[0] + (p.c1[0] - p.c0[0]) * t, p.c0[1] + (p.c1[1] - p.c0[1]) * t, p.c0[2] + (p.c1[2] - p.c0[2]) * t] : p.c0;
      this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2];
      const fadeIn = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1;
      this.col[i * 4 + 3] = p.a * (1 - t) * fadeIn;
      this.size[i] = p.s0 + (p.s1 - p.s0) * t;
    }
    this.geom.setDrawRange(0, w);
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.aColor.needsUpdate = true;
    this.geom.attributes.aSize.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new PointSystem(scene, 1400, false);
    this.glow = new PointSystem(scene, 1200, true);
    // fren izleri
    this.skidMax = 1600;
    this.skidPos = new Float32Array(this.skidMax * 18);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skidGeom = g;
    const m = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.skidMesh = new THREE.Mesh(g, m);
    this.skidMesh.frustumCulled = false; this.skidMesh.renderOrder = 1;
    scene.add(this.skidMesh);
    this.skidIdx = 0; this.skidCount = 0;
    this.shake = 0;
  }
  setScale(h, fov) {
    const s = h / (2 * Math.tan((fov * Math.PI) / 360));
    this.smoke.uniforms.uScale.value = s; this.glow.uniforms.uScale.value = s;
  }
  skid(track, x, y, z, active, w = 0.24) {
    if (!active) { track.last = null; return; }
    if (track.last) {
      const [lx, ly, lz] = track.last;
      const dx = x - lx, dz = z - lz;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) return;
      if (d < 3) {
        const nx = -dz / d * w, nz = dx / d * w;
        const yy = Math.max(y, ly) + 0.03;
        const a = [lx + nx, yy, lz + nz], b = [lx - nx, yy, lz - nz], c = [x - nx, yy, z - nz], e = [x + nx, yy, z + nz];
        this.skidPos.set([...a, ...b, ...c, ...a, ...c, ...e], this.skidIdx * 18);
        this.skidIdx = (this.skidIdx + 1) % this.skidMax;
        this.skidCount = Math.min(this.skidMax, this.skidCount + 1);
        this.skidGeom.setDrawRange(0, this.skidCount * 6);
        this.skidGeom.attributes.position.needsUpdate = true;
      }
    }
    track.last = [x, y, z];
  }
  tireSmoke(x, y, z, k = 1) {
    this.smoke.spawn({ x, y: y + 0.2, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 1.6, drag: 1.2, s0: 0.8, s1: 3.5 * k, c0: [0.85, 0.85, 0.88], a: 0.35 });
  }
  engineSmoke(x, y, z, dark) {
    this.smoke.spawn({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5), vy: 2 + Math.random(), vz: (Math.random() - 0.5), life: 2.2, drag: 0.8, s0: 0.6, s1: 3, c0: dark ? [0.08, 0.08, 0.08] : [0.6, 0.6, 0.62], a: dark ? 0.7 : 0.4 });
  }
  fire(x, y, z) {
    this.glow.spawn({ x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 2.5 + Math.random() * 2, vz: 0, life: 0.6, drag: 1, s0: 1.4, s1: 0.3, c0: [3, 1.4, 0.3], c1: [2, 0.3, 0.05], a: 0.9 });
  }
  sparks(x, y, z, n = 12, nx = 0, nz = 0) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x, y, z, vx: nx * 4 + (Math.random() - 0.5) * 9, vy: Math.random() * 5, vz: nz * 4 + (Math.random() - 0.5) * 9, life: 0.35 + Math.random() * 0.3, grav: 14, drag: 0.5, s0: 0.25, s1: 0.05, c0: [4, 2.6, 1], a: 1, floor: y - 1 });
    }
  }
  splash(x, y, z, n = 18, k = 1) {
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({ x, y, z, vx: (Math.random() - 0.5) * 5 * k, vy: 3 + Math.random() * 5 * k, vz: (Math.random() - 0.5) * 5 * k, life: 1, grav: 14, drag: 0.3, s0: 0.6, s1: 1.4, c0: [0.85, 0.95, 1], a: 0.7 });
    }
  }
  wake(x, y, z, vx, vz) {
    this.smoke.spawn({ x: x + (Math.random() - 0.5) * 1.2, y: y + 0.2, z: z + (Math.random() - 0.5) * 1.2, vx: vx * 0.1 + (Math.random() - 0.5) * 2, vy: 0.6, vz: vz * 0.1 + (Math.random() - 0.5) * 2, life: 1.8, drag: 1, s0: 0.8, s1: 3.2, c0: [0.95, 0.98, 1], a: 0.55 });
  }
  muzzle(x, y, z, tx, ty, tz) {
    this.glow.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.08, s0: 1.2, s1: 0.4, c0: [5, 3.5, 1.2], a: 1 });
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      this.glow.spawn({ x: x + (tx - x) * t, y: y + (ty - y) * t, z: z + (tz - z) * t, vx: 0, vy: 0, vz: 0, life: 0.06, s0: 0.25, s1: 0.1, c0: [4, 3, 1.5], a: 0.8 });
    }
  }
  blood(x, y, z) {
    for (let i = 0; i < 8; i++) this.smoke.spawn({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.6, grav: 10, s0: 0.25, s1: 0.4, c0: [0.5, 0.02, 0.02], a: 0.9, floor: y - 1.2 });
  }
  explosion(x, y, z) {
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 10;
      this.glow.spawn({ x, y: y + 0.8, z, vx: Math.cos(a) * s, vy: Math.random() * 10, vz: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, drag: 2.5, s0: 3 + Math.random() * 3, s1: 0.5, c0: [5, 2.5, 0.6], c1: [2, 0.4, 0.05], a: 1 });
    }
    for (let i = 0; i < 30; i++) {
      this.smoke.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + 1, z: z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 6, life: 3 + Math.random() * 2, drag: 1.2, s0: 2, s1: 9, c0: [0.12, 0.11, 0.1], a: 0.75, fadeIn: 0.1 });
    }
    this.sparks(x, y + 1, z, 30);
    this.shake = Math.max(this.shake, 1);
  }
  update(dt) {
    this.smoke.update(dt); this.glow.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
