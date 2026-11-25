// Palmera City — şehir yerleşimi, zemin yüksekliği, çarpışma ve geometri üretimi
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './util.js';
import * as T from './textures.js';
import { CityBuildings } from './buildings.js';
import { Forest, FOOT, footDeck, onFoot, isleHeight, isleDN, riverDeck, isleWater } from './forest.js';
import { AIRPORTS, planeCollider } from './flight.js';
import { buildRiver } from './river.js';
import { Wildlife } from './wildlife.js';
import { WildWest, WEST_X, WBR, westHeight, onWestBridge, westDeck, onRope, ropeDeck, westNoVehicle, buildWestBridge, buildBridgeGate, GATE_X } from './west.js';

// En yüksek bina 7 kat (~24 m): kodla üretilen binalar da bu sınırı aşmaz
const MAX_H = 24;

export const XS = [-460, -380, -300, -220, -140, -60, 20, 100, 180];
export const ZS = [-440, -360, -280, -200, -120, -40, 40, 120, 200, 280, 360];
export const hwX = (i) => (i === 0 ? 10 : 7);
export const HWZ = 7;
export const WATER_Y = -0.7;
export const BRIDGE = { x: -460, z0: 420, z1: 560, hw: 10, H: 9 };
export const ISLAND = { x0: -540, x1: 40, z0: 540, z1: 740 };
// Palmera Havalimanı pisti (Isla Faro): 400 × 34 m, ada yollarının arasında
export const AIRPORT_RW = { x0: -440, x1: -40, z0: 643, z1: 677 };
// Pasarela Selva başındaki kapı (köprü güvertesi FOOT.z0'da başlar)
const SELVA_GATE_Z = FOOT.z0 + 2.5;
export const PIERS = [-20, 20, 60];
// [x0, z0, x1, z1] dikdörtgenlerinden delikleri ({hx0, hx1, hz0, hz1}) çıkar → kalan dikdörtgenler
function cutRects(rects, holes) {
  for (const h of holes) {
    const out = [];
    for (const r of rects) {
      if (h.hx1 <= r[0] || h.hx0 >= r[2] || h.hz1 <= r[1] || h.hz0 >= r[3]) { out.push(r); continue; }
      const x0 = Math.max(r[0], h.hx0), x1 = Math.min(r[2], h.hx1), z0 = Math.max(r[1], h.hz0), z1 = Math.min(r[3], h.hz1);
      if (z0 > r[1]) out.push([r[0], r[1], r[2], z0]);
      if (z1 < r[3]) out.push([r[0], z1, r[2], r[3]]);
      if (x0 > r[0]) out.push([r[0], z0, x0, z1]);
      if (x1 < r[2]) out.push([x1, z0, r[2], z1]);
    }
    rects = out;
  }
  return rects;
}
// orta iskeleden Gece Teknesi'nin (poi.dock 40, 468) yanına uzanan yan iskele
export const FINGER = { x0: 23, x1: 38.3, z0: 465.8, z1: 470.2, y: 0.6 };
export const deckHeight = (z) => BRIDGE.H * Math.sin(Math.PI * clamp((z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0), 0, 1));
const NBX = XS.length - 1, NBZ = ZS.length - 1;

// ---------- Geometri toplayıcı (tek mesh içine çok kutu) ----------
class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  quad(o, U, V, su, sv, n, col, uv) {
    const a = [o[0], o[1], o[2]];
    const b = [o[0] + U[0] * su, o[1] + U[1] * su, o[2] + U[2] * su];
    const c = [b[0] + V[0] * sv, b[1] + V[1] * sv, b[2] + V[2] * sv];
    const d = [o[0] + V[0] * sv, o[1] + V[1] * sv, o[2] + V[2] * sv];
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
    const [u0, v0, u1, v1] = uv || [0, 0, 1, 1];
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  rawQuad(a, b, c, d, n, col, uv = [0, 0, 1, 0, 1, 1, 0, 1]) {
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
    this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]);
  }
  // x0..x1, y0..y1, z0..z1 eksen hizalı kutu. o: { uS, vS, uO, vO, top:Batch|false, sides:true, topCol }
  box(x0, y0, z0, x1, y1, z1, col, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const uS = o.uS || 1, vS = o.vS || 1, uO = o.uO || 0, vO = o.vO || 0, vb = o.vBase ?? y0;
    const v0 = (y0 - vb + vO) / vS, v1 = (y1 - vb + vO) / vS;
    if (o.sides !== false) {
      this.quad([x1, y0, z1], [0, 0, -1], [0, 1, 0], d, h, [1, 0, 0], col, [(uO + z0 * 0.37) / uS, v0, (uO + z0 * 0.37 + d) / uS, v1]);
      this.quad([x0, y0, z0], [0, 0, 1], [0, 1, 0], d, h, [-1, 0, 0], col, [(uO + z1 * 0.29) / uS, v0, (uO + z1 * 0.29 + d) / uS, v1]);
      this.quad([x0, y0, z1], [1, 0, 0], [0, 1, 0], w, h, [0, 0, 1], col, [(uO + x0 * 0.31) / uS, v0, (uO + x0 * 0.31 + w) / uS, v1]);
      this.quad([x1, y0, z0], [-1, 0, 0], [0, 1, 0], w, h, [0, 0, -1], col, [(uO + x1 * 0.23) / uS, v0, (uO + x1 * 0.23 + w) / uS, v1]);
    }
    const tb = o.top === undefined ? this : o.top;
    if (tb) {
      const ts = o.topScale || 0;
      tb.quad([x0, y1, z1], [1, 0, 0], [0, 0, -1], w, d, [0, 1, 0], o.topCol || col,
        ts ? [x0 / ts, -z1 / ts, x1 / ts, -z0 / ts] : [0, 0, 1, 1]);
    }
    if (o.bottom) {
      this.quad([x0, y0, z0], [1, 0, 0], [0, 0, 1], w, d, [0, -1, 0], col);
    }
  }
  build(mat, { cast = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}

export function colorGeom(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function mergeGeoms(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0; for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + n) * 3);
    o += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
export function instanced(geom, mat, list, { cast = false, receive = false } = {}) {
  const m = new THREE.InstancedMesh(geom, mat, Math.max(1, list.length));
  const o = new THREE.Object3D();
  list.forEach((t, i) => {
    o.position.set(t.x, t.y || 0, t.z);
    o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    if (t.sx) o.scale.set(t.sx, t.sy, t.sz); else o.scale.setScalar(t.s || 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (t.color) m.setColorAt(i, t.color);
  });
  m.count = list.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

const PASTELS = ['#f7b2c4', '#a8e6cf', '#c9b6f2', '#ffd3a5', '#9fe2f0', '#fff1a8', '#ffffff', '#f6c1e0', '#b8f0e0'];
const STUCCO = ['#e8d5c0', '#d9b99b', '#c98f74', '#efe2d0', '#b9a4c9', '#9fc4c9', '#e3c4a8', '#cfd8dc', '#d4a5a5', '#f2d0a9'];
const GLASS = ['#9fb8d0', '#7f9ab8', '#b5c7d6', '#8fb3c4', '#c6c0d8', '#a7c4bc'];
const NEON = ['#ff2fa8', '#22e6ff', '#b14bff', '#ff6a3d', '#3dff8e', '#ffe14d', '#ff4f6d'];
const HOTEL_NAMES = ['Corallo', 'Flaminga', 'Bahía', 'Neptuno', 'Pelican', 'Orquídea', 'Luna Mar', 'Seaglass', 'Soleil', 'Marlin', 'Azulejo', 'Palomar', 'La Brisa', 'Cayo Rosa', 'Paraíso', 'Mirage', 'Aqua', 'Belvedere', 'Costa', 'Oasis'];
// hazır bina modellerine verilen ton (tuğla/taş dokusuyla çarpılır)
const KIT_TINTS = ['#ffffff', '#ffffff', '#f4e6dc', '#ffd9d0', '#e4efe6', '#fff0d0', '#dfe6f2', '#f2dcef', '#cfcfcf', '#ffe2c8', '#d8f0ec', '#bdb6b0'];
// bina çeşidi grupları (assets/web/buildings.json anahtarları)
const KIT_GEN = /^(?!row_)/;            // genel şehir: sığ sıra evler hariç
const KIT_HOTEL = /^(hotel_|painted_)/;  // sahil otelleri: pastel
const KIT_ROW = /^row_/;                 // 8 m derinlikte sıra evler (ara sokak, liman arkası)
const KIT_DEPOT = /^(depot_|loft_)/;     // depo / sanayi
const KIT_CIVIC = /^(office_|classic_)/; // hastane, karakol
const KIT_ANY = /.*/;
const ANNEX = ['#8f6a5c', '#a07d6a', '#7d6a62', '#b59a86', '#6f6a70', '#9c8a7a'];
const SHOP_NAMES =['BAR', 'CAFÉ', 'DÖVME', 'PİZZA', 'DİSKO', 'KULÜP 86', 'TACO', 'BİLARDO', 'MOTEL', 'SALSA', 'LİKÖR', 'ARCADE', 'SUSHI', 'JAZZ'];

export class World {
  constructor(kit = null, { westMeta = null, quality = 'low' } = {}) {
    this.rnd = mulberry32(20261120);
    this.city = kit ? new CityBuildings(kit) : null;
    this.westMeta = westMeta; this.quality = quality;
    this.boxes = []; this.circles = [];
    this.grounds = [];   // uzak bölge zeminleri (addGround / removeGround)
    this.pools = [];   // otel havuzları: { x0, x1, z0, z1, floor, y } (içine girilir, ~1 m derin)
    this.grid = new Map(); this.CELL = 16;
    this.blocks = [];
    this.nodes = []; this.edges = [];
    this.lamps = []; this.lightSources = [];
    this.parkingSpots = [];
    this.pedPaths = [];
    this.signMats = []; this.neonMats = []; this.lampMats = []; this.billboardMats = [];
    this.facadeMats = [];
    this.trafficLampMeshes = {};
    this.animated = [];
    this.poi = {};
    this.makeBlocks();
    this.makeGraph();
  }

  // ---------- yerleşim verisi ----------
  makeBlocks() {
    for (let i = 0; i < NBX; i++) {
      for (let j = 0; j < NBZ; j++) {
        const x0 = XS[i] + hwX(i), x1 = XS[i + 1] - hwX(i + 1);
        const z0 = ZS[j] + HWZ, z1 = ZS[j + 1] - HWZ;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        let type = 'resi';
        if (i === 7) type = 'hotel';
        else if (i === 3 && j === 7) type = 'park';
        else if (i === 4 && j === 7) type = 'police';
        else if (i === 2 && j === 3) type = 'hospital';
        else if (i >= 4 && i <= 6 && j <= 5) type = 'downtown';
        else if (j === 9) type = 'industrial';
        this.blocks.push({ i, j, x0, x1, z0, z1, cx, cz, type });
      }
    }
  }
  makeGraph() {
    const id = (i, j) => i * ZS.length + j;
    for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++)
      this.nodes[id(i, j)] = { id: id(i, j), x: XS[i], z: ZS[j], light: true, adj: [], hwx: hwX(i), hwz: HWZ };
    const link = (a, b, hw) => {
      const e = { a, b, hw, len: Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z) };
      this.edges.push(e);
      this.nodes[a].adj.push({ to: b, hw }); this.nodes[b].adj.push({ to: a, hw });
    };
    for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++) {
      if (i + 1 < XS.length) link(id(i, j), id(i + 1, j), HWZ);
      if (j + 1 < ZS.length) link(id(i, j), id(i, j + 1), hwX(i));
    }
    const add = (x, z) => { const n = { id: this.nodes.length, x, z, light: false, adj: [], hwx: 7, hwz: 7 }; this.nodes.push(n); return n.id; };
    const i1 = add(-460, 620), i2 = add(-20, 620), i3 = add(-20, 700), i4 = add(-460, 700);
    this.nodes[i1].hwx = 10;
    link(id(0, ZS.length - 1), i1, 10);
    link(i1, i2, 7); link(i2, i3, 7); link(i3, i4, 7); link(i4, i1, 7);
  }

  blockAt(x, z) {
    let i = -1, j = -1;
    for (let k = 0; k < NBX; k++) if (x >= XS[k] && x < XS[k + 1]) { i = k; break; }
    if (i < 0) return null;
    for (let k = 0; k < NBZ; k++) if (z >= ZS[k] && z < ZS[k + 1]) { j = k; break; }
    if (j < 0) return null;
    const b = this.blocks[i * NBZ + j];
    return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? b : null;
  }

  baseHeight(x, z) {
    // uzak slotlardaki bölgelerin düz zeminleri (uçakla gidilen yerler; bölge kurulunca eklenir)
    for (const g of this.grounds) if (x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1) return g.fn ? g.fn(x, z) : g.y;
    if (x > 700) return -4;   // açık deniz
    if (x < WEST_X) return westHeight(x, z);   // batı: boğaz + Wild West + Cañón Rojo
    if (z < -540) return isleHeight(x, z);   // kuzey: deniz + Isla Selva
    if (z > 440) {
      if (x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1) return 0.05;
      if (z < 492) for (const p of PIERS) if (x > p - 3 && x < p + 3) return 0.6;
      if (x > FINGER.x0 - 0.1 && x < FINGER.x1 && z > FINGER.z0 && z < FINGER.z1) return FINGER.y;
      return -4;
    }
    if (x > 290) return x < 340 ? lerp(0.1, -4, (x - 290) / 50) : -4;
    if (x >= 197) return 0.1;
    if (x >= 187) return 0.25;
    if (z < -447 || x < -470) return 0.15;
    if (z > 367) return 0.05;
    const pool = this.poolAt(x, z);
    if (pool) return pool.floor;
    if (this.blockAt(x, z)) return 0.2;
    return 0;
  }
  onBridge(x, z) { return Math.abs(x - BRIDGE.x) < BRIDGE.hw + 0.6 && z > BRIDGE.z0 && z < BRIDGE.z1; }
  // y verilirse köprü altında mı üstünde mi olduğuna bakılır
  surfaceHeight(x, z, y) {
    let h = this.baseHeight(x, z);
    if (this.onBridge(x, z)) {
      const d = deckHeight(z);
      if (y === undefined || y > d - 1.8) h = Math.max(h, d);
    }
    if (onFoot(x, z)) {
      const d = footDeck(z);
      if (y === undefined || y > d - 1.6) h = Math.max(h, d);
    }
    if (z < -700 && z > -860) {   // Isla Selva nehri: köprü ve basamak taşları
      const d = riverDeck(x, z, y);
      if (d !== null) h = Math.max(h, d);
    }
    if (x < WEST_X + 1) {   // Wild West: Puente Oeste ve kanyon yaya köprüsü
      if (onWestBridge(x, z)) { const d = westDeck(x); if (y === undefined || y > d - 1.8) h = Math.max(h, d); }
      else if (onRope(x, z)) { const d = ropeDeck(z); if (y === undefined || y > d - 1.6) h = Math.max(h, d); }
      else if (this.west) { const d = this.west.deckAt(x, z, y); if (d !== null) h = Math.max(h, d); }   // Grand Hotel merdiveni + üst kat
    }
    return h;
  }
  // nehir/gölet su yüzeyi (yürüyerek geçilen sığ su), yoksa null
  riverWater(x, z) {
    if (z > -540) { const p = this.poolAt(x, z); return p ? p.y : null; }   // otel havuzları
    return isleWater(x, z);
  }
  isWater(x, z, y) { return this.surfaceHeight(x, z, y) < WATER_Y - 0.35; }
  // araç (tekne dahil) giremez: Pasarela Selva (başındaki kapıdan itibaren), Isla Selva ve çevresi
  // v verilirse türüne bakılır: Puente Oeste (köprü başından karşı uca) yalnız ata açık; tekne altından geçer
  noVehicle(x, z, v) {
    if (v && v.type !== 'horse' && v.type !== 'boat' && x < GATE_X + 3 && x > WBR.x1 - 3 && Math.abs(z - WBR.z) < WBR.hw + 3) return true;
    if (x < WEST_X) return westNoVehicle(x, z);
    if (Math.abs(x - FOOT.x) < FOOT.hw + 2.5 && z < SELVA_GATE_Z + 2.5 && z > FOOT.z1 - 1) return true;
    return z < -560 && isleDN(x, z) < 1.12;
  }

  // ---------- çarpışma ----------
  addBox(x0, x1, z0, z1, y0, y1, tag) {
    const b = { x0, x1, z0, z1, y0, y1, tag };
    const idx = this.boxes.length; this.boxes.push(b);
    const S = this.CELL;
    for (let gx = Math.floor(x0 / S); gx <= Math.floor(x1 / S); gx++)
      for (let gz = Math.floor(z0 / S); gz <= Math.floor(z1 / S); gz++) {
        const k = gx * 10007 + gz;
        let a = this.grid.get(k); if (!a) { a = { b: [], c: [] }; this.grid.set(k, a); }
        a.b.push(idx);
      }
    return b;
  }
  addCircle(x, z, r, y0 = -5, y1 = 20) {
    const c = { x, z, r, y0, y1 };
    const idx = this.circles.length; this.circles.push(c);
    const S = this.CELL;
    for (let gx = Math.floor((x - r) / S); gx <= Math.floor((x + r) / S); gx++)
      for (let gz = Math.floor((z - r) / S); gz <= Math.floor((z + r) / S); gz++) {
        const k = gx * 10007 + gz;
        let a = this.grid.get(k); if (!a) { a = { b: [], c: [] }; this.grid.set(k, a); }
        a.c.push(idx);
      }
  }
  // Bir çemberi (x,z,r) dikey aralık [y, y+h] ile binalardan dışarı iter. pos değiştirilir.
  collideCircle(pos, r, y, h = 1.8, out = null) {
    const S = this.CELL;
    let hit = null;
    const seenB = this._seenB || (this._seenB = new Set()); seenB.clear();
    const seenC = this._seenC || (this._seenC = new Set()); seenC.clear();
    for (let gx = Math.floor((pos.x - r) / S); gx <= Math.floor((pos.x + r) / S); gx++)
      for (let gz = Math.floor((pos.z - r) / S); gz <= Math.floor((pos.z + r) / S); gz++) {
        const cell = this.grid.get(gx * 10007 + gz); if (!cell) continue;
        for (const bi of cell.b) {
          if (seenB.has(bi)) continue; seenB.add(bi);
          const b = this.boxes[bi];
          if (y + h < b.y0 || y > b.y1 - 0.01) continue;
          const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let nx, nz, pen;
          if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
          else {
            const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bo = b.z1 - pos.z;
            const m = Math.min(l, rr, t, bo);
            if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
            pen = m + r;
          }
          pos.x += nx * pen; pos.z += nz * pen;
          if (!hit || pen > hit.pen) hit = { nx, nz, pen, box: b };
        }
        for (const ci of cell.c) {
          if (seenC.has(ci)) continue; seenC.add(ci);
          const c = this.circles[ci];
          if (y + h < c.y0 || y > c.y1) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), pen = rr - d;
          const nx = dx / d, nz = dz / d;
          pos.x += nx * pen; pos.z += nz * pen;
          if (!hit || pen > hit.pen) hit = { nx, nz, pen, circle: c };
        }
      }
    return hit;
  }
  pointBlocked(x, y, z) {
    const cell = this.grid.get(Math.floor(x / this.CELL) * 10007 + Math.floor(z / this.CELL));
    if (!cell) return false;
    for (const bi of cell.b) {
      const b = this.boxes[bi];
      if (b.y1 > 2.2 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y > b.y0 && y < b.y1) return true;
    }
    return false;
  }
  lineBlocked(ax, ay, az, bx, by, bz, step = 2.5) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this.pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return true;
    }
    return false;
  }
  // Kameranın duvar içine girmemesi için: a'dan b'ye ilk engele kadar oran
  rayFraction(ax, ay, az, bx, by, bz) {
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(2, Math.ceil(L / 0.25));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (this.pointBlocked(x, y, z) || y < this.surfaceHeight(x, z, y) + 0.15) return Math.max(0, (k - 1) / n);
    }
    return 1;
  }

  // ---------- inşa ----------
  build(scene) {
    const rnd = this.rnd;
    this.scene = scene;
    const B = {
      glass: new Batch(), hotel: new Batch(), resi: new Batch(), ind: new Batch(),
      roof: new Batch(), misc: new Batch(), cont: new Batch(), neon: new Batch(), lines: new Batch(),
      walk: new Batch(), road: new Batch(), grass: new Batch(), sand: new Batch(), water: new Batch(),
    };
    this.B = B;
    const styleCfg = {
      glass: { uS: 25.6, vS: 28.8 }, hotel: { uS: 32, vS: 27.2 }, resi: { uS: 36, vS: 28 }, ind: { uS: 48, vS: 40 },
    };
    const building = (style, x0, z0, x1, z1, h, col, y0 = 0) => {
      const cfg = styleCfg[style];
      B[style].box(x0, y0, z0, x1, h, z1, C(col), { uS: cfg.uS, vS: cfg.vS, uO: Math.floor(rnd() * 8) * cfg.uS / 8, vO: Math.floor(rnd() * 8) * cfg.vS / 8, vBase: 0, top: B.roof, topCol: C('#8a8790') });
      this.addBox(x0, x1, z0, z1, -5, h, 'bld');
    };
    this.building = building;

    // --- zemin parçaları ---
    // ana kara temeli (rıhtım duvarları)
    B.misc.box(-540, -4, -540, 290, -0.05, 440, C('#8d8a84'), { top: false });
    B.misc.box(ISLAND.x0, -4, ISLAND.z0, ISLAND.x1, 0.04, ISLAND.z1, C('#9a968e'), { top: B.walk, topScale: 6 });
    // kaldırımlar (bloklar)
    for (const b of this.blocks) {
      if (b.type === 'park') {
        B.walk.box(b.x0, 0, b.z0, b.x1, 0.2, b.z1, C('#c8c1b5'), { top: false });
        B.grass.quad([b.x0, 0.2, b.z1], [1, 0, 0], [0, 0, -1], b.x1 - b.x0, b.z1 - b.z0, [0, 1, 0], C('#ffffff'), [b.x0 / 8, b.z0 / 8, b.x1 / 8, b.z1 / 8]);
      } else B.walk.box(b.x0, 0, b.z0, b.x1, 0.2, b.z1, C('#ffffff'), { top: false });   // üst yüz aşağıda (havuz delikleriyle)
    }
    // gezinti yolu, kuzey ve batı şeritler, liman
    B.walk.box(187, 0, -447, 197, 0.25, 440, C('#f3e2d0'), { topScale: 4 });
    B.grass.box(-540, 0, -540, 197, 0.15, -447, C('#ffffff'), { topScale: 8 });
    B.grass.box(-540, 0, -447, -470, 0.15, 440, C('#ffffff'), { topScale: 8 });
    B.walk.box(-450, 0, 367, 187, 0.05, 440, C('#a7a39b'), { topScale: 8 });
    // otoyol liman geçişi asfalt şeridi
    B.road.quad([-470, 0.06, 440], [1, 0, 0], [0, 0, -1], 20, 73, [0, 1, 0], C('#ffffff'), [-470 / 12, -440 / 12, -450 / 12, -367 / 12]);
    // iskeleler
    for (const p of PIERS) {
      B.misc.box(p - 3, -3, 440, p + 3, 0.6, 492, C('#8a6a4a'), {});
      for (let z = 446; z < 492; z += 8) for (const sx of [-2.6, 2.6]) B.misc.box(p + sx - 0.25, -4, z - 0.25, p + sx + 0.25, 0.9, z + 0.25, C('#5b4630'));
      for (let z = 444; z < 492; z += 12) this.addCircle(p - 2.6, z, 0.3, -5, 0.6);
    }
    // Gece Teknesi yan iskelesi: güverte, iki yanda direkler, uçta babalar
    {
      const F = FINGER;
      B.misc.box(F.x0, -3, F.z0, F.x1, F.y, F.z1, C('#8a6a4a'), {});
      for (let x = F.x0 + 3; x < F.x1; x += 5) for (const z of [F.z0 + 0.3, F.z1 - 0.3]) {
        B.misc.box(x - 0.22, -4, z - 0.22, x + 0.22, 0.95, z + 0.22, C('#5b4630'));
        this.addCircle(x, z, 0.28, -5, 0.95);
      }
      for (const z of [F.z0 + 0.4, F.z1 - 0.4]) B.misc.box(F.x1 - 0.55, F.y, z - 0.2, F.x1 - 0.15, F.y + 0.45, z + 0.2, C('#2b2b30'));
    }
    // ada yolları
    const islandRoad = (x0, z0, x1, z1) => B.road.quad([x0, 0.06, z1], [1, 0, 0], [0, 0, -1], x1 - x0, z1 - z0, [0, 1, 0], C('#ffffff'), [x0 / 12, z0 / 12, x1 / 12, z1 / 12]);
    islandRoad(-470, 613, -13, 627); islandRoad(-470, 693, -13, 707); islandRoad(-467, 613, -453, 707); islandRoad(-27, 613, -13, 707);
    islandRoad(-470, 540, -450, 613);

    this.buildRoadMarkings();
    this.buildBlocks();
    this.buildHarbor();
    this.buildIsland();
    this.buildBeach();
    this.buildBridge();
    this.buildBorders();
    this.buildLamps();
    this.buildTrafficLights();
    this.buildPalms();
    this.buildFootBridge();
    // Isla Selva ve Wild West açılışta kurulmaz: oyuncu köprülerine yaklaşınca main.js buildSelva/buildWest çağırır.
    // Puente Oeste baştan durur (bölgeye ondan geçilir; hiçbir bölge gizlemesine girmez: keep).
    this.forest = null; this.wildlife = null; this.west = null;
    const wb = buildWestBridge(this); wb.userData.keep = true; scene.add(wb);
    const gate = buildBridgeGate(this); gate.userData.keep = true; scene.add(gate);   // köprü başı: yalnız atlılar
    // harita için Wild West bina izleri: yalnız tür listesiyle kuru yerleşim (çarpışma eklenmez)
    if (this.westMeta) { this.westPlan = new WildWest(this, this.westMeta, this.quality, true); this.westPlan.layout(); }
    // blok kaldırım üst yüzleri: otel havuzlarının yeri boş kalır (havuz çukuru görünsün)
    for (const b of this.blocks) {
      if (b.type === 'park') continue;
      for (const r of cutRects([[b.x0, b.z0, b.x1, b.z1]], this.pools))
        B.walk.quad([r[0], 0.2, r[3]], [1, 0, 0], [0, 0, -1], r[2] - r[0], r[3] - r[1], [0, 1, 0], C('#ffffff'), [r[0] / 4, -r[3] / 4, r[2] / 4, -r[1] / 4]);
    }

    // --- malzemeler ---
    const facade = (style, seed, opts) => {
      const { map, emissiveMap } = T.facadeTextures(style, seed);
      const m = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, vertexColors: true, roughness: opts.r, metalness: opts.m });
      this.facadeMats.push(m);
      return m;
    };
    const add = (m) => { scene.add(m); return m; };
    add(B.glass.build(facade('glass', 11, { r: 0.25, m: 0.55 })));
    add(B.hotel.build(facade('hotel', 12, { r: 0.7, m: 0.05 })));
    add(B.resi.build(facade('resi', 13, { r: 0.85, m: 0.02 })));
    add(B.ind.build(facade('industrial', 14, { r: 0.8, m: 0.2 })));
    add(B.roof.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    const miscMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
    add(B.misc.build(miscMat));
    const contTex = T.containerTexture(); contTex.repeat.set(1, 1);
    add(B.cont.build(new THREE.MeshStandardMaterial({ vertexColors: true, map: contTex, roughness: 0.7, metalness: 0.3 })));
    const tilesTex = T.tilesTexture();
    this.walkMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tilesTex, roughness: 0.9 });
    add(B.walk.build(this.walkMat, { cast: false }));
    const grassTex = T.grassTexture();
    add(B.grass.build(new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 }), { cast: false }));
    this.neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    add(B.neon.build(this.neonMat, { cast: false, receive: false }));
    // yaya köprüsü + deniz tabanı: şehir gizlense de görünür (keep)
    add(this.fb.misc.build(miscMat)).userData.keep = true;
    add(this.fb.neon.build(this.neonMat, { cast: false, receive: false })).userData.keep = true;
    this.linesMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    add(B.lines.build(this.linesMat, { cast: false }));

    // asfalt
    this.asphaltTex = T.asphaltTexture();
    this.roadMat = new THREE.MeshStandardMaterial({ map: this.asphaltTex, roughness: 0.92, metalness: 0.0, color: new THREE.Color('#ffffff') });
    const roadStripMat = this.roadMat.clone();
    roadStripMat.vertexColors = true; roadStripMat.polygonOffset = true; roadStripMat.polygonOffsetFactor = -1; roadStripMat.polygonOffsetUnits = -1;
    this.roadStripMat = roadStripMat;
    add(B.road.build(roadStripMat, { cast: false }));
    const roadGeo = new THREE.PlaneGeometry(657, 814, 1, 1);
    roadGeo.rotateX(-Math.PI / 2);
    const uvs = roadGeo.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 657 / 12, uvs.getY(i) * 814 / 12);
    const road = new THREE.Mesh(roadGeo, this.roadMat);
    road.position.set((-470 + 187) / 2, 0, (-447 + 367) / 2);
    road.receiveShadow = true;
    scene.add(road);

    // deniz tabanı
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#4b6b6a', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -4.05; floor.userData.keep = true;
    scene.add(floor);

    this.buildSignsDeferred.forEach((f) => f());
  }

  // ---------- sonradan yüklenen bölgeler (main.js, köprüye yaklaşınca; kitler null olabilir) ----------
  // Isla Selva: orman + nehir + hayvanlar + silah standı (nesneleri keep + selva işaretli)
  buildSelva(scene, nature, animals) {
    this.natureKit = nature; this.animalKit = this.animalKit || animals;
    this.forest = new Forest(this, nature, this.quality);
    this.forest.build(scene, (s) => { buildRiver(this, s); this.wildlife = new Wildlife(this, s, animals); });
  }
  // Wild West + Cañón Rojo (nesneleri "west" işaretli)
  buildWest(scene, westKit, animals) {
    this.animalKit = this.animalKit || animals;
    this.west = new WildWest(this, westKit, this.quality);
    this.west.build(scene);
  }
  // bölge boşaltılınca (main.js unloadRegion): sahne nesneleri ve çarpışmalar orada silinir, burada yalnız referanslar
  // (hayvan kiti kalır: köprü başındaki binek at ve sonraki yüklemeler kullanır)
  unloadSelva() { this.forest = null; this.wildlife = null; this.natureKit = null; }
  // uzak bölge zemini: { x0, x1, z0, z1, y } dikdörtgen düz alan ya da { …, fn(x, z) } yükseklik fonksiyonu
  addGround(key, g) { this.grounds.push({ key, ...g }); }
  removeGround(key) { this.grounds = this.grounds.filter((g) => g.key !== key); }
  unloadWest() { this.west = null; }
  // bir bölgenin çarpışmalarını sil: kutular [b0, b1), daireler [c0, c1) (kurulumda art arda eklenmişlerdi)
  removeColliders(b0, b1, c0, c1) {
    const DB = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 1e9, y1: -1e9, tag: 'dead' }, DC = { x: 0, z: 0, r: 0, y0: 1e9, y1: -1e9 };
    for (const [k, a] of this.grid) {
      a.b = a.b.filter((i) => i < b0 || i >= b1);
      a.c = a.c.filter((i) => i < c0 || i >= c1);
      if (!a.b.length && !a.c.length) this.grid.delete(k);
    }
    // dizinin sonundaysa kısalt (tekrar tekrar yükle-boşalt dizileri büyütmesin), değilse ölü kayıt bırak
    if (b1 === this.boxes.length) this.boxes.length = b0; else this.boxes.fill(DB, b0, b1);
    if (c1 === this.circles.length) this.circles.length = c0; else this.circles.fill(DC, c0, c1);
  }

  // ---------- yol çizgileri ----------
  buildRoadMarkings() {
    const L = this.B.lines;
    const W = C('#f2f2ea'), Y = C('#f5c542');
    const strip = (x0, z0, x1, z1, col, y = 0.02) => L.quad([x0, y, z1], [1, 0, 0], [0, 0, -1], x1 - x0, z1 - z0, [0, 1, 0], col);
    for (const e of this.edges) {
      const A = this.nodes[e.a], Bn = this.nodes[e.b];
      const vertical = A.x === Bn.x;
      const y = A.light && Bn.light ? 0.02 : 0.08;
      if (!A.light || !Bn.light) continue; // köprü/ada ayrı
      if (vertical) {
        const x = A.x, za = Math.min(A.z, Bn.z) + HWZ, zb = Math.max(A.z, Bn.z) - HWZ;
        const hw = e.hw;
        if (hw === 7) {
          strip(x - 0.25, za + 6, x - 0.1, zb - 6, Y, y); strip(x + 0.1, za + 6, x + 0.25, zb - 6, Y, y);
          for (let z = za + 8; z < zb - 8; z += 9) { strip(x - 3.6, z, x - 3.45, z + 4, W, y); strip(x + 3.45, z, x + 3.6, z + 4, W, y); }
        } else {
          for (let z = za + 8; z < zb - 8; z += 9) { strip(x - 5.1, z, x - 4.95, z + 4, W, y); strip(x + 4.95, z, x + 5.1, z + 4, W, y); }
          // orta bariyer
          this.B.misc.box(x - 0.35, 0, za + 9, x + 0.35, 0.9, zb - 9, C('#bdbab2'));
          this.B.neon.box(x - 0.36, 0.7, za + 9, x + 0.36, 0.78, zb - 9, C('#ffb347'), { top: false });
          this.addBox(x - 0.35, x + 0.35, za + 9, zb - 9, -1, 0.9, 'barrier');
        }
        strip(x - hw + 0.4, za + 6, x - hw + 0.55, zb - 6, W, y); strip(x + hw - 0.55, za + 6, x + hw - 0.4, zb - 6, W, y);
        // yaya geçitleri + dur çizgileri
        for (const [zc, s] of [[za, 1], [zb, -1]]) {
          for (let xx = x - hw + 1; xx < x + hw - 1; xx += 1.4) strip(xx, Math.min(zc + s * 0.8, zc + s * 3.8), xx + 0.7, Math.max(zc + s * 0.8, zc + s * 3.8), W, y);
        }
        strip(x + 0.3, za + 4.6, x + hw - 0.5, za + 5.1, W, y);
        strip(x - hw + 0.5, zb - 5.1, x - 0.3, zb - 4.6, W, y);
      } else {
        const z = A.z, xa = Math.min(A.x, Bn.x) + this.nodes[A.x < Bn.x ? e.a : e.b].hwx, xb = Math.max(A.x, Bn.x) - this.nodes[A.x < Bn.x ? e.b : e.a].hwx;
        strip(xa + 6, z - 0.25, xb - 6, z - 0.1, Y, y); strip(xa + 6, z + 0.1, xb - 6, z + 0.25, Y, y);
        for (let x = xa + 8; x < xb - 8; x += 9) { strip(x, z - 3.6, x + 4, z - 3.45, W, y); strip(x, z + 3.45, x + 4, z + 3.6, W, y); }
        strip(xa + 6, z - 6.6, xb - 6, z - 6.45, W, y); strip(xa + 6, z + 6.45, xb - 6, z + 6.6, W, y);
        for (const [xc, s] of [[xa, 1], [xb, -1]]) {
          for (let zz = z - 6; zz < z + 6; zz += 1.4) strip(Math.min(xc + s * 0.8, xc + s * 3.8), zz, Math.max(xc + s * 0.8, xc + s * 3.8), zz + 0.7, W, y);
        }
        strip(xa + 4.6, z - 6.5, xa + 5.1, z - 0.3, W, y);
        strip(xb - 5.1, z + 0.3, xb - 4.6, z + 6.5, W, y);
      }
    }
  }

  // ---------- neon tabela ----------
  sign(text, color, x, y, z, rotY, height = 2.4, opts = {}) {
    this.buildSignsDeferred = this.buildSignsDeferred || [];
    this.buildSignsDeferred.push(() => {
      const { texture, aspect } = T.neonSignTexture(text, color, opts);
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true }); // düz tabela: tek geçiş yeter (çizim çağrısı yarıya iner)
      mat.userData.base = new THREE.Color(color);
      this.signMats.push(mat);
      const w = height * aspect;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
      m.position.set(x, y, z); m.rotation.y = rotY;
      m.renderOrder = 2;
      this.scene.add(m);
    });
    this.lightSources.push({ x, y, z, color: new THREE.Color(color), kind: 'neon', w: Math.min(10, height * 2) });
  }
  billboard(x, y, z, rotY, w, h, seed) {
    this.buildSignsDeferred = this.buildSignsDeferred || [];
    this.B.misc.box(x - 0.2, y - h / 2 - 3, z - 0.2, x + 0.2, y - h / 2, z + 0.2, C('#555'));
    this.buildSignsDeferred.push(() => {
      const t = T.billboardTexture(seed);
      const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.2, roughness: 0.6 });
      this.billboardMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.y = rotY;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#2a2a30' }));
      back.position.set(x - Math.sin(rotY) * 0.2, y, z - Math.cos(rotY) * 0.2); back.rotation.y = rotY;
      this.scene.add(m, back);
    });
  }

  // ---------- bloklar ----------
  buildBlocks() {
    const rnd = this.rnd, B = this.B;
    const pickc = (arr) => arr[Math.floor(rnd() * arr.length)];
    const hotelNames = [...HOTEL_NAMES];
    for (const b of this.blocks) {
      const ix0 = b.x0 + 4.5, ix1 = b.x1 - 4.5, iz0 = b.z0 + 4.5, iz1 = b.z1 - 4.5;
      // yaya yolu
      this.pedPaths.push({ type: 'rect', x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0 + 2, z1: b.z1 - 2, block: b });
      if (b.type === 'downtown') {
        const mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
        const lots = !this.city && rnd() < 0.18 ? [[ix0, iz0, ix1, iz1]] : [[ix0, iz0, mx - 1.5, mz - 1.5], [mx + 1.5, iz0, ix1, mz - 1.5], [ix0, mz + 1.5, mx - 1.5, iz1], [mx + 1.5, mz + 1.5, ix1, iz1]];
        for (const [x0, z0, x1, z1] of lots) {
          if (lots.length > 1 && rnd() < 0.14) { this.plaza(x0, z0, x1, z1); continue; }
          // köşe parseli: caddeye bakan iki kenarda bina sıraları, arkada avlu binası
          if (this.city) { this.kitLot(x0, z0, x1, z1, x0 === ix0 ? 'W' : 'E', z0 === iz0 ? 'N' : 'S'); continue; }
          const sh = rnd() * 3;
          const ax0 = x0 + sh, ax1 = x1 - sh * rnd(), az0 = z0 + sh * rnd(), az1 = z1 - sh;
          const big = lots.length === 1;
          const h = big ? MAX_H : 12 + rnd() * (MAX_H - 12);
          const glass = rnd() < 0.75;
          const col = glass ? pickc(GLASS) : pickc(STUCCO);
          const style = glass ? 'glass' : 'resi';
          if (h > 70 && rnd() < 0.65) {
            const h1 = h * (0.5 + rnd() * 0.2);
            this.building(style, ax0, az0, ax1, az1, h1, col);
            const k = 0.18 + rnd() * 0.12;
            const w = ax1 - ax0, d = az1 - az0;
            const bx0 = ax0 + w * k, bx1 = ax1 - w * k, bz0 = az0 + d * k, bz1 = az1 - d * k;
            B[style].box(bx0, h1, bz0, bx1, h, bz1, C(col), { uS: style === 'glass' ? 25.6 : 36, vS: style === 'glass' ? 28.8 : 28, vBase: 0, top: B.roof, topCol: C('#7d7a84') });
            this.addBox(bx0, bx1, bz0, bz1, -5, h, 'bld');
            this.roofTop(bx0, bz0, bx1, bz1, h);
            if (rnd() < 0.7) this.neonOutline(ax0, az0, ax1, az1, h1 + 0.1, pickc(NEON));
          } else {
            this.building(style, ax0, az0, ax1, az1, h, col);
            this.roofTop(ax0, az0, ax1, az1, h);
          }
          if (rnd() < 0.55) this.neonOutline(ax0, az0, ax1, az1, h + 0.15, pickc(NEON));
          if (h < 70 && rnd() < 0.5) {
            const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2;
            this.billboard(cx, h + 6, cz, rnd() < 0.5 ? 0 : Math.PI / 2, 14, 7, Math.floor(rnd() * 1000));
          }
        }
      } else if (b.type === 'hotel') {
        const mz = (iz0 + iz1) / 2;
        for (const [z0, z1] of [[iz0, mz - 1.5], [mz + 1.5, iz1]]) {
          if (this.city) { this.kitHotel(ix0, ix1, z0, z1, hotelNames); continue; }
          const depth = 20 + rnd() * 14;
          const hx1 = ix1, hx0 = ix1 - depth;
          const floors = 4 + Math.floor(rnd() * 4); // en çok 7 kat
          const H = floors * 3.4;
          const col = pickc(PASTELS);
          this.building('hotel', hx0, z0, hx1, z1, H, col);
          const cz = (z0 + z1) / 2;
          const accent = pickc(PASTELS.filter((p) => p !== col));
          // art-deco merkez kanat
          B.misc.box(hx1, 0, cz - 2.6, hx1 + 1.4, H + 6, cz + 2.6, C(accent), {});
          this.addBox(hx1, hx1 + 1.4, cz - 2.6, cz + 2.6, -5, H + 6, 'bld');
          // kat bantları
          for (let f = 2; f < floors; f += 2) B.misc.box(hx1, f * 3.4 - 0.15, z0, hx1 + 0.7, f * 3.4 + 0.25, z1, C('#ffffff'), {});
          // giriş saçağı
          B.misc.box(hx1, 3.2, cz - 6, hx1 + 4, 3.6, cz + 6, C('#ffffff'), {});
          const nc = pickc(NEON);
          this.B.neon.box(hx1 + 3.95, 3.15, cz - 6, hx1 + 4.1, 3.3, cz + 6, C(nc), {});
          // çatı neon çizgileri ve kanat kenarları
          this.B.neon.box(hx1 + 0.02, H - 0.25, z0, hx1 + 0.18, H - 0.05, z1, C(nc), {});
          this.B.neon.box(hx1 + 1.4, 0.5, cz - 2.65, hx1 + 1.55, H + 6, cz - 2.5, C(nc), {});
          this.B.neon.box(hx1 + 1.4, 0.5, cz + 2.5, hx1 + 1.55, H + 6, cz + 2.65, C(nc), {});
          const name = hotelNames.splice(Math.floor(rnd() * hotelNames.length), 1)[0] || 'Hotel';
          this.sign(name, nc, hx1 + 1.6, H + 2.6, cz + 10 > z1 ? cz - 8 : cz + 8.5, Math.PI / 2, 3.6);
          this.sign('HOTEL', '#ffffff', hx1 + 1.6, 5.2, cz, Math.PI / 2, 1.3, { font: '900 110px Arial Black, Impact, sans-serif' });
          // arka bahçe havuz
          if (hx0 - ix0 > 12) {
            const px0 = ix0 + 3, px1 = hx0 - 3, pz0 = z0 + 3, pz1 = z1 - 3;
            this.swimPool(px0, px1, pz0, pz1);
            this.palm(px0 + 1, pz0 + 1); this.palm(px1 - 1, pz1 - 1);
          }
          this.palm(ix1 + 3.2, z0 + 2); this.palm(ix1 + 3.2, z1 - 2);
        }
      } else if (b.type === 'resi' || b.type === 'hospital' || b.type === 'police') {
        if (b.type === 'hospital') { this.special(b, 'HASTANE', '#ff3355', '#f4f4f4'); continue; }
        if (b.type === 'police') { this.special(b, 'POLİS', '#2f7bff', '#d9dde3'); continue; }
        const cx = (ix0 + ix1) / 2;
        // ara sokak kuzey-güney yönünde
        for (const [sx0, sx1, face] of [[ix0, cx - 3, -1], [cx + 3, ix1, 1]]) {
          if (this.city) { this.kitStrip(sx0, sx1, iz0, iz1, face < 0 ? 'W' : 'E'); continue; }
          let z = iz0;
          while (z < iz1 - 6) {
            const len = Math.min(iz1 - z, 12 + rnd() * 16);
            const h = 7 + Math.floor(rnd() * 5) * 3.5;
            this.building('resi', sx0, z, sx1, z + len, h, pickc(STUCCO));
            // dükkan tabelası caddeye bakan yüze
            if (rnd() < 0.45) {
              const nc = pickc(NEON);
              const txt = pickc(SHOP_NAMES);
              if (face < 0) this.sign(txt, nc, sx0 - 0.15, 4.2, z + len / 2, -Math.PI / 2, 1.5, { font: '900 120px Arial Black, Impact, sans-serif' });
              else this.sign(txt, nc, sx1 + 0.15, 4.2, z + len / 2, Math.PI / 2, 1.5, { font: '900 120px Arial Black, Impact, sans-serif' });
            }
            if (rnd() < 0.25) this.neonOutline(sx0, z, sx1, z + len, h + 0.1, pickc(NEON));
            z += len;
          }
        }
        // ara sokakta çöp kutuları ve lamba
        for (let z = iz0 + 8; z < iz1 - 6; z += 18 + rnd() * 10) {
          const s = rnd() < 0.5 ? -1 : 1;
          const x = cx + s * 2.1;
          this.B.misc.box(x - 0.6, 0.2, z - 1, x + 0.6, 1.5, z + 1, C(rnd() < 0.5 ? '#2f6b3a' : '#3a4a6b'), {});
          this.addBox(x - 0.6, x + 0.6, z - 1, z + 1, -1, 1.5, 'prop');
        }
        this.lamps.push({ x: cx - 2.8, z: (iz0 + iz1) / 2, dir: 0, alley: true, base: 0.2 });
        if (rnd() < 0.6) { const nc = pickc(NEON); this.sign(pickc(SHOP_NAMES), nc, cx - 2.85, 5, iz0 + 14 + rnd() * 20, Math.PI / 2, 1.1, { font: '900 120px Arial Black, Impact, sans-serif' }); }
      } else if (b.type === 'industrial') {
        const mx = (ix0 + ix1) / 2;
        const split = rnd() < 0.6;
        const parts = split ? [[ix0, mx - 2], [mx + 2, ix1]] : [[ix0, ix1]];
        for (const [x0, x1] of parts) {
          const z1 = iz1 - 6 - rnd() * 8;
          if (this.city) {
            // kuzey caddeye bakan depo/loft sırası, arka yüzde yükleme kapısı
            for (const q of this.kitRow('N', iz0, x0, x1, Math.min(16, z1 - iz0), [3, 5], KIT_DEPOT)) {
              const qx = (q.min.x + q.max.x) / 2;
              B.misc.box(qx - 3, 0.2, q.max.z, qx + 3, 4.6, q.max.z + 0.15, C('#3e4448'), {});
            }
            continue;
          }
          const h = 8 + rnd() * 6;
          this.building('ind', x0, iz0, x1, z1, h, pickc(['#9aa3a8', '#b0a48e', '#8d9a8a', '#a88e7d', '#7d8da8']));
          B.misc.box(x0, h, iz0, x1, h + 0.6, z1, C('#6d6a66'), {});
          // yükleme kapısı
          B.misc.box((x0 + x1) / 2 - 3, 0.2, z1, (x0 + x1) / 2 + 3, 5, z1 + 0.15, C('#3e4448'), {});
        }
        for (let k = 0; k < 3; k++) this.container(ix0 + 6 + rnd() * (ix1 - ix0 - 14), iz1 - 3, rnd() < 0.5 ? 0 : 1, 0.2);
      } else if (b.type === 'park') {
        this.plaza(ix0, iz0, ix1, iz1, true);
      }
    }
  }
  // Sahil oteli: Ocean Drive'a (doğu) bakan pastel bina sırası, giriş saçağı, isim tabelası, arkada havuz
  kitHotel(ix0, ix1, z0, z1, hotelNames) {
    const rnd = this.rnd, B = this.B;
    const pickc = (arr) => arr[Math.floor(rnd() * arr.length)];
    const row = this.kitRow('E', ix1, z0, z1, 20, [4, 7], KIT_HOTEL);
    row.forEach((b, i) => {
      const nc = pickc(NEON), cz = (b.min.z + b.max.z) / 2, fx = b.max.x;
      // giriş saçağı (her binada); isim + HOTEL tabelası sıranın ilk binasında
      B.misc.box(fx, 3.95, cz - 3, fx + 3.2, 4.3, cz + 3, C('#ffffff'), {});
      this.B.neon.box(fx + 3.15, 3.9, cz - 3, fx + 3.3, 4.05, cz + 3, C(nc), {});
      if (i === 0) {
        const name = hotelNames.splice(Math.floor(rnd() * hotelNames.length), 1)[0] || 'Hotel';
        this.sign(name, nc, fx + 0.6, b.max.y + 2.2, cz, Math.PI / 2, 3);
        this.sign('HOTEL', '#ffffff', fx + 0.3, 5.1, cz, Math.PI / 2, 0.9, { font: '900 110px Arial Black, Impact, sans-serif' });
      }
      if (i === 0 || rnd() < 0.4) this.neonOutline(b.min.x, b.min.z, b.max.x, b.max.z, b.max.y + 0.1, nc);
    });
    const hx0 = row.reduce((m, b) => Math.min(m, b.min.x), ix1);
    if (hx0 - ix0 > 12) {
      const px0 = ix0 + 3, px1 = hx0 - 3, pz0 = z0 + 3, pz1 = z1 - 3;
      this.swimPool(px0, px1, pz0, pz1);
      this.palm(px0 + 1, pz0 + 1); this.palm(px1 - 1, pz1 - 1);
    }
    this.palm(ix1 + 3.2, z0 + 2); this.palm(ix1 + 3.2, z1 - 2);
  }
  special(b, label, color, bodyCol) {
    const ix0 = b.x0 + 5, ix1 = b.x1 - 5, iz0 = b.z0 + 8, iz1 = b.z1 - 14;
    const cx = (ix0 + ix1) / 2;
    let roofY = 18, roofZ = (iz0 + iz1) / 2;
    if (this.city) {
      // ön (güney) cadde: taş/ofis binaları; arka (kuzey) caddeye de bir sıra
      const front = this.kitRow('S', iz1, ix0, ix1, 16, [5, 7], KIT_CIVIC);
      const dF = front.reduce((m, q) => Math.max(m, q.max.z - q.min.z), 0);
      this.kitRow('N', iz0, ix0, ix1, Math.min(16, iz1 - iz0 - dF - 2), [3, 6], KIT_CIVIC);
      const mid = front.find((q) => cx >= q.min.x && cx <= q.max.x) || front[0];
      if (mid) { roofY = mid.max.y + 0.05; roofZ = (mid.min.z + mid.max.z) / 2; }
      this.sign(label, color, cx, Math.min(12, roofY - 3), iz1 + 0.6, 0, 3.2, { font: '900 120px Arial Black, Impact, sans-serif' });
      this.B.neon.box(ix0, 4.0, iz1 + 0.15, ix1, 4.25, iz1 + 0.3, C(color), {});
    } else {
      this.building('resi', ix0, iz0, ix1, iz1, 18, bodyCol);
      this.B.misc.box(ix0 - 0.5, 18, iz0 - 0.5, ix1 + 0.5, 19, iz1 + 0.5, C(color), {});
      this.sign(label, color, cx, 12, iz1 + 0.3, 0, 3.2, { font: '900 120px Arial Black, Impact, sans-serif' });
      this.B.neon.box(ix0, 8, iz1 + 0.05, ix1, 8.25, iz1 + 0.2, C(color), {});
      roofY = 19;
    }
    if (label === 'HASTANE') {
      this.B.neon.box(cx - 0.6, roofY, roofZ - 3, cx + 0.6, roofY + 0.4, roofZ + 3, C('#ff2244'), {});
      this.B.neon.box(cx - 3, roofY, roofZ - 0.6, cx + 3, roofY + 0.4, roofZ + 0.6, C('#ff2244'), {});
      this.poi.hospital = { x: (ix0 + ix1) / 2, z: b.z1 - 2, heading: 0 };
    } else {
      this.poi.police = { x: (ix0 + ix1) / 2, z: b.z1 - 2, heading: 0 };
      this.parkingSpots.push({ x: ix0 + 6, z: iz1 + 6, heading: Math.PI / 2, type: 'police', fixed: true });
      this.parkingSpots.push({ x: ix0 + 13, z: iz1 + 6, heading: Math.PI / 2, type: 'police', fixed: true });
    }
  }
  // ---------- hazır bina modelleri ----------
  // Modeli, ön yüzü 'face' yönündeki cadde çizgisine (frontLine) yaslayarak koyar; a0: sıra boyunca başlangıç.
  placeKit(kind, face, frontLine, a0, s, stretch, tint) {
    const rot = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 }[face];
    const sc = new THREE.Vector3(s * stretch, s, s);
    const lb = this.city.localBox(kind, rot, sc);
    let x, z;
    if (face === 'W') { x = frontLine - lb.min.x; z = a0 - lb.min.z; }
    else if (face === 'E') { x = frontLine - lb.max.x; z = a0 - lb.min.z; }
    else if (face === 'N') { z = frontLine - lb.min.z; x = a0 - lb.min.x; }
    else { z = frontLine - lb.max.z; x = a0 - lb.min.x; }
    const box = this.city.add(kind, x, z > 367 ? 0.05 : 0.2, z, rot, sc, tint); // liman ve ada zemini daha alçak
    this.addBox(box.min.x, box.max.x, box.min.z, box.max.z, -5, box.max.y, 'bld');
    return box;
  }
  // Cadde boyunca bina sırası: [a0, a1] aralığını doldurur (derinlik ≤ maxDepth). Yerleşen kutuları döndürür.
  // floors: [en az, en çok] kat — şehir merkezi daha yüksek, eski mahalle daha alçak
  // pick: çeşit adı süzgeci (KIT_GEN, KIT_HOTEL, KIT_ROW, KIT_DEPOT, KIT_CIVIC)
  kitRow(face, frontLine, a0, a1, maxDepth, floors = [3, 7], pick = KIT_GEN) {
    const rnd = this.rnd, models = this.city.kit.models;
    const width = (k) => models[k].max.x - models[k].min.x;
    const depth = (k) => models[k].max.z - models[k].min.z;
    const L = a1 - a0;
    const seq = []; let total = 0, prev = null;
    const pool = this.city.kit.kinds.filter((k) => pick.test(k) && models[k].floors >= floors[0] && models[k].floors <= floors[1]);
    for (let guard = 0, miss = 0; guard < 30 && miss < 4; guard++) {
      const s = miss ? 0.94 : 0.94 + rnd() * 0.12; // sığmazsa en küçük ölçekle yeniden dene
      let opts = pool.filter((k) => depth(k) * s <= maxDepth && total + width(k) * s <= L);
      if (opts.length > 1) opts = opts.filter((k) => k !== prev); // yan yana aynı bina olmasın
      if (!opts.length) { miss += 2; continue; }
      miss = 0;
      const k = opts[Math.floor(rnd() * opts.length)];
      seq.push({ k, s }); total += width(k) * s; prev = k;
    }
    if (!seq.length) return [];
    const stretch = Math.min(1.12, L / total);
    const gap = (L - total * stretch) / seq.length;
    let a = a0 + gap / 2;
    const out = [];
    for (const { k, s } of seq) {
      out.push(this.placeKit(k, face, frontLine, a, s, stretch, KIT_TINTS[Math.floor(rnd() * KIT_TINTS.length)]));
      a += width(k) * s * stretch + gap;
    }
    return out;
  }
  // Eski mahalle şeridi: caddeye bakan bina sırası + arkada ara sokağa bakan alçak ek binalar
  kitStrip(sx0, sx1, iz0, iz1, face) {
    const rnd = this.rnd;
    const pickc = (arr) => arr[Math.floor(rnd() * arr.length)];
    const W = sx1 - sx0;
    const boxes = this.kitRow(face, face === 'W' ? sx0 : sx1, iz0, iz1, W > 22 ? W - 9 : W, [3, 6]);
    // ara sokağa bakan arka sıra (sığ sıra evler); sığmazsa eski alçak ek binalar
    const dFront = boxes.reduce((m, b) => Math.max(m, b.max.x - b.min.x), 0);
    const back = boxes.length ? this.kitRow(face === 'W' ? 'E' : 'W', face === 'W' ? sx1 : sx0, iz0, iz1, W - dFront - 0.4, [2, 4], KIT_ROW) : [];
    for (const b of boxes) {
      const back0 = face === 'W' ? b.max.x : sx0, back1 = face === 'W' ? sx1 : b.min.x;
      if (!back.length && back1 - back0 > 2.5) this.building('resi', back0, b.min.z, back1, b.max.z, Math.min(b.max.y * 0.6, 7 + Math.floor(rnd() * 3) * 3.5), pickc(ANNEX));
      if (rnd() < 0.4) {
        const nc = pickc(NEON), zc = (b.min.z + b.max.z) / 2;
        if (face === 'W') this.sign(pickc(SHOP_NAMES), nc, b.min.x - 0.25, 4.6, zc, -Math.PI / 2, 1.4, { font: '900 120px Arial Black, Impact, sans-serif' });
        else this.sign(pickc(SHOP_NAMES), nc, b.max.x + 0.25, 4.6, zc, Math.PI / 2, 1.4, { font: '900 120px Arial Black, Impact, sans-serif' });
      }
      if (rnd() < 0.18) this.neonOutline(b.min.x, b.min.z, b.max.x, b.max.z, b.max.y + 0.1, pickc(NEON));
    }
  }
  // Şehir merkezi köşe parseli: fx ('W'|'E') ve fz ('N'|'S') kenarları caddeye bakar
  kitLot(x0, z0, x1, z1, fx, fz) {
    const rnd = this.rnd;
    const pickc = (arr) => arr[Math.floor(rnd() * arr.length)];
    const rowA = this.kitRow(fx, fx === 'W' ? x0 : x1, z0, z1, Math.min(17.5, (x1 - x0) * 0.6), [5, 7]);
    const dA = rowA.reduce((m, b) => Math.max(m, b.max.x - b.min.x), 0);
    const bx0 = fx === 'W' ? x0 + dA + 0.6 : x0, bx1 = fx === 'W' ? x1 : x1 - dA - 0.6;
    const rowB = this.kitRow(fz, fz === 'N' ? z0 : z1, bx0, bx1, Math.min(17.5, (z1 - z0) * 0.6), [5, 7]);
    const dB = rowB.reduce((m, b) => Math.max(m, b.max.z - b.min.z), 0);
    for (const b of [...rowA, ...rowB]) if (rnd() < 0.3) this.neonOutline(b.min.x, b.min.z, b.max.x, b.max.z, b.max.y + 0.1, pickc(NEON));
    // arkada yükselen kule
    const tx0 = bx0 + 1, tx1 = bx1 - 1;
    const tz0 = fz === 'N' ? z0 + dB + 1 : z0 + 1, tz1 = fz === 'N' ? z1 - 1 : z1 - dB - 1;
    // avlu: parseller arasındaki geçide bakan alçak bina sırası; sığmazsa kutu
    if (tx1 - tx0 > 7 && tz1 - tz0 > 7) {
      const inner = this.kitRow(fz === 'N' ? 'S' : 'N', fz === 'N' ? tz1 : tz0, tx0, tx1, tz1 - tz0, [2, 5], KIT_ANY);
      if (!inner.length) {
        const h = 7 + Math.floor(rnd() * 3) * 3.5;
        this.building('resi', tx0, tz0, tx1, tz1, h, pickc(ANNEX));
        if (rnd() < 0.4) this.roofTop(tx0, tz0, tx1, tz1, h);
      }
    }
  }
  // otel havuzu: taş kenar (güverte), içi ~1 m derin çukur (fayans taban + duvarlar), su yüzeyi
  swimPool(px0, px1, pz0, pz1) {
    const B = this.B, DECK = 0.35, FLOOR = -0.65, WY = 0.24;
    const wx0 = px0 + 1.5, wx1 = px1 - 1.5, wz0 = pz0 + 1.5, wz1 = pz1 - 1.5, deck = C('#f4efe6');
    B.misc.box(px0, 0.2, pz0, px1, DECK, wz0, deck, {});
    B.misc.box(px0, 0.2, wz1, px1, DECK, pz1, deck, {});
    B.misc.box(px0, 0.2, wz0, wx0, DECK, wz1, deck, {});
    B.misc.box(wx1, 0.2, wz0, px1, DECK, wz1, deck, {});
    B.misc.box(wx0, FLOOR - 0.1, wz0, wx1, FLOOR, wz1, C('#6fcfe0'), {});
    const wall = C('#dff3f6'), t = 0.12;
    B.misc.box(wx0, FLOOR, wz0, wx1, DECK - 0.01, wz0 + t, wall, {});
    B.misc.box(wx0, FLOOR, wz1 - t, wx1, DECK - 0.01, wz1, wall, {});
    B.misc.box(wx0, FLOOR, wz0, wx0 + t, DECK - 0.01, wz1, wall, {});
    B.misc.box(wx1 - t, FLOOR, wz0, wx1, DECK - 0.01, wz1, wall, {});
    B.water.quad([wx0, WY, wz1], [1, 0, 0], [0, 0, -1], wx1 - wx0, wz1 - wz0, [0, 1, 0], C('#3fd0e8'));
    // x0..z1: yürünen iç alan; hx0..hz1: kaldırım üst yüzünde açılacak delik
    this.pools.push({ x0: wx0 + t, x1: wx1 - t, z0: wz0 + t, z1: wz1 - t, floor: FLOOR, y: WY, hx0: wx0, hx1: wx1, hz0: wz0, hz1: wz1 });
  }
  poolAt(x, z) {
    for (const p of this.pools) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p;
    return null;
  }
  plaza(x0, z0, x1, z1, park = false) {
    const B = this.B, rnd = this.rnd;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r = Math.min(x1 - x0, z1 - z0) * (park ? 0.18 : 0.25);
    // çeşme
    B.misc.box(cx - r, 0.2, cz - r, cx + r, 0.9, cz + r, C('#e9e2d6'), {});
    B.water.quad([cx - r + 0.6, 0.85, cz + r - 0.6], [1, 0, 0], [0, 0, -1], 2 * r - 1.2, 2 * r - 1.2, [0, 1, 0], C('#3fd0e8'));
    B.misc.box(cx - 0.5, 0.9, cz - 0.5, cx + 0.5, 3.2, cz + 0.5, C('#f4efe6'), {});
    this.addBox(cx - r, cx + r, cz - r, cz + r, -1, 0.9, 'prop');
    const n = park ? 12 : 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
      const d = r + 4 + rnd() * (park ? 18 : 4);
      const px = clamp(cx + Math.cos(a) * d, x0 + 1, x1 - 1), pz = clamp(cz + Math.sin(a) * d, z0 + 1, z1 - 1);
      this.palm(px, pz);
    }
    // banklar
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const bx = cx + Math.cos(a) * (r + 2), bz = cz + Math.sin(a) * (r + 2);
      const along = k % 2 === 0;
      B.misc.box(bx - (along ? 0.3 : 1.2), 0.2, bz - (along ? 1.2 : 0.3), bx + (along ? 0.3 : 1.2), 0.7, bz + (along ? 1.2 : 0.3), C('#8a5a3a'), {});
    }
    if (park) {
      this.sign('Palmiye Parkı', '#3dff8e', cx, 4.5, z1 + 2.5, 0, 1.6);
      this.pedPaths.push({ type: 'rect', x0: cx - r - 2.5, x1: cx + r + 2.5, z0: cz - r - 2.5, z1: cz + r + 2.5 });
    }
  }
  neonOutline(x0, z0, x1, z1, y, col) {
    const N = this.B.neon, c = C(col), t = 0.18;
    N.box(x0 - t, y, z0 - t, x1 + t, y + 0.22, z0, c, { top: false });
    N.box(x0 - t, y, z1, x1 + t, y + 0.22, z1 + t, c, { top: false });
    N.box(x0 - t, y, z0, x0, y + 0.22, z1, c, { top: false });
    N.box(x1, y, z0, x1 + t, y + 0.22, z1, c, { top: false });
  }
  roofTop(x0, z0, x1, z1, h) {
    const rnd = this.rnd, B = this.B;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r = rnd();
    if (r < 0.35) {
      B.misc.box(cx - 0.25, h, cz - 0.25, cx + 0.25, h + 12 + rnd() * 10, cz + 0.25, C('#555b66'), {});
      this.blinkers = this.blinkers || [];
      this.blinkers.push({ x: cx, y: h + 22, z: cz });
    } else if (r < 0.6) {
      B.misc.box(cx - 4, h, cz - 4, cx + 4, h + 0.3, cz + 4, C('#3b3f46'), {});
      B.neon.box(cx - 1.5, h + 0.31, cz - 0.2, cx + 1.5, h + 0.36, cz + 0.2, C('#ffe14d'), {});
      B.neon.box(cx - 1.5, h + 0.31, cz - 2, cx - 1.1, h + 0.36, cz + 2, C('#ffe14d'), {});
      B.neon.box(cx + 1.1, h + 0.31, cz - 2, cx + 1.5, h + 0.36, cz + 2, C('#ffe14d'), {});
    } else {
      B.misc.box(x0 + 2, h, z0 + 2, x0 + 2 + (x1 - x0) * 0.3, h + 3, z0 + 2 + (z1 - z0) * 0.3, C('#9a9aa0'), {});
    }
  }
  container(x, z, rotated, y = 0.05, col) {
    const cols = ['#d9482b', '#2b6cd9', '#2bb07a', '#e0a526', '#7a3ad9', '#d92b7a', '#3a9ad9', '#8a8a8a'];
    col = col || cols[Math.floor(this.rnd() * cols.length)];
    const L = 12, W = 2.5, H = 2.6;
    const [w, d] = rotated ? [L, W] : [W, L];
    this.B.cont.box(x - w / 2, y, z - d / 2, x + w / 2, y + H, z + d / 2, C(col), { uS: 3, vS: H, top: this.B.cont });
    this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, -5, y + H, 'cont');
  }

  // ---------- liman ----------
  buildHarbor() {
    const rnd = this.rnd, B = this.B;
    // depolar
    for (const [x0, x1] of [[-440, -350], [-330, -250], [-230, -190]]) {
      if (this.city) {
        // caddeye (kuzey) bakan depolar + rıhtıma (güney) bakan sıra evler
        const row = this.kitRow('N', 374, x0, x1, 16, [3, 5], KIT_DEPOT);
        const d = row.reduce((m, q) => Math.max(m, q.max.z - q.min.z), 0);
        this.kitRow('S', 400, x0, x1, 400 - 374 - d - 0.6, [2, 4], KIT_ROW);
        continue;
      }
      this.building('ind', x0, 374, x1, 400, 11, ['#9aa3a8', '#b0a48e', '#7d8da8'][Math.floor(rnd() * 3)]);
      B.misc.box(x0, 11, 374, x1, 11.6, 400, C('#6d6a66'), {});
    }
    // görev garajı
    const gx0 = 118, gx1 = 152;
    if (this.city) this.kitRow('N', 378, gx0, gx1, 16, [3, 4], /^depot_/);
    else this.building('ind', gx0, 378, gx1, 404, 9, '#c96b8b');
    B.misc.box(gx0 + 9, 0.05, 377.6, gx1 - 9, 3.8, 377.75, C('#2b2b33'), {});
    this.B.neon.box(gx0 + 9, 3.8, 377.55, gx1 - 9, 4.0, 377.7, C('#ff2fa8'), {});
    this.sign('GARAJ', '#ff2fa8', (gx0 + gx1) / 2, 5.4, 377.45, Math.PI, 1.8, { font: '900 120px Arial Black, Impact, sans-serif' });
    this.poi.garage = { x: (gx0 + gx1) / 2, z: 373 };
    // konteyner yığınları
    for (let x = -170; x < -40; x += 14) for (let z = 392; z < 428; z += 13) {
      if (rnd() < 0.25) continue;
      const stack = 1 + Math.floor(rnd() * 3);
      const col = undefined;
      for (let s = 0; s < stack; s++) this.container(x, z, false, 0.05 + s * 2.6, col);
    }
    // vinçler
    for (const x of [-300, -230, 100]) this.crane(x, 426);
    // babalar
    for (let x = -440; x < 180; x += 16) { this.B.misc.box(x - 0.3, 0.05, 437.6, x + 0.3, 0.8, 438.2, C('#222'), {}); }
    this.sign('Liman · Puerto Palmera', '#22e6ff', -110, 6, 368.5, Math.PI, 1.4);
    this.poi.dock = { x: 40, z: 468 };
    this.pedPaths.push({ type: 'line', x0: -420, z0: 432, x1: 170, z1: 432 });
  }
  crane(x, z) {
    const B = this.B, c = C('#e2a12a');
    for (const dx of [-5, 5]) for (const dz of [-4, 4]) {
      B.misc.box(x + dx - 0.5, 0.05, z + dz - 0.5, x + dx + 0.5, 30, z + dz + 0.5, c, {});
      this.addBox(x + dx - 0.5, x + dx + 0.5, z + dz - 0.5, z + dz + 0.5, -5, 30, 'crane');
    }
    B.misc.box(x - 6, 30, z - 30, x + 6, 33, z + 14, c, {});
    B.misc.box(x - 3, 33, z - 4, x + 3, 37, z + 4, C('#d0d0d0'), {});
    this.blinkers = this.blinkers || [];
    this.blinkers.push({ x, y: 37.5, z }, { x, y: 33.5, z: z + 14 });
  }
  // Isla Faro = Palmera Havalimanı: pist (doğu–batı), terminal, kule, rüzgâr tulumu; uçak + kalkış tabelası flight.js'te
  buildIsland() {
    const B = this.B, L = B.lines, W = C('#f2f2ea'), Y = 0.07;
    const RW = AIRPORT_RW;
    // pist asfaltı + işaretler (kenar çizgileri, orta kesikli çizgi, iki uçta eşik çizgileri)
    B.road.quad([RW.x0, Y, RW.z1], [1, 0, 0], [0, 0, -1], RW.x1 - RW.x0, RW.z1 - RW.z0, [0, 1, 0], C('#c4c4c8'), [RW.x0 / 12, RW.z0 / 12, RW.x1 / 12, RW.z1 / 12]);
    const strip = (x0, z0, x1, z1) => L.quad([x0, Y + 0.02, z1], [1, 0, 0], [0, 0, -1], x1 - x0, z1 - z0, [0, 1, 0], W);
    strip(RW.x0, RW.z0 + 1, RW.x1, RW.z0 + 1.6); strip(RW.x0, RW.z1 - 1.6, RW.x1, RW.z1 - 1);
    const zc = (RW.z0 + RW.z1) / 2;
    for (let x = RW.x0 + 60; x < RW.x1 - 50; x += 30) strip(x, zc - 0.4, x + 15, zc + 0.4);
    for (const ex of [RW.x0 + 3, RW.x1 - 25]) for (let i = 0; i < 8; i++) { const z = RW.z0 + 3 + i * 3.6 + (i >= 4 ? 1.6 : 0); strip(ex, z, ex + 22, z + 1.6); }
    // pist kenar ışıkları: batı ucu yeşil, doğu ucu kırmızı, arası sarı (gece neon gibi parlar)
    for (let x = RW.x0; x <= RW.x1; x += 25) for (const z of [RW.z0 - 0.8, RW.z1 + 0.8]) {
      const c = x === RW.x0 ? '#3cff7a' : x + 25 > RW.x1 ? '#ff4040' : '#ffd27a';
      B.neon.box(x - 0.2, 0.05, z - 0.2, x + 0.2, 0.5, z + 0.2, C(c), {});
    }
    // terminal (cam cephe), önünde saçak + direkler, tabela
    this.building('glass', -442, 558, -372, 600, 11, '#cfe6f0');
    B.misc.box(-442, 4.2, 600, -372, 4.6, 605, C('#e9e2d6'), {});
    for (let x = -440; x <= -374; x += 11) { B.misc.box(x - 0.15, 0.05, 604.3, x + 0.15, 4.2, 604.7, C('#9aa0a8'), {}); this.addCircle(x, 604.5, 0.2, -5, 4.2); }
    this.sign('PALMERA HAVALİMANI', '#29e7ff', -407, 8.6, 600.3, 0, 1.5);
    // kule
    B.misc.box(-345, 0.05, 570, -337, 22, 578, C('#e2ddd2'), {});
    this.addBox(-345, -337, 570, 578, -5, 22, 'bld');
    this.building('glass', -347.5, 567.5, -334.5, 580.5, 26.5, '#bfe0ee', 22);
    B.misc.box(-348, 26.5, 567, -334, 27.2, 581, C('#8a8790'), {});
    B.neon.box(-341.3, 27.2, 573.7, -340.7, 28.4, 574.3, C('#ff4040'), {});
    // rüzgâr tulumu
    B.misc.box(-60.1, 0.05, 685.9, -59.9, 6, 686.1, C('#55595f'), {});
    B.misc.box(-59.9, 5.1, 685.7, -56.5, 5.8, 686.3, C('#ff7a1a'), {});
    this.addCircle(-60, 686, 0.2, -5, 6);
    planeCollider(this, AIRPORTS.palmera);
    this.poi.airport = { x: AIRPORTS.palmera.board.x, z: AIRPORTS.palmera.board.z };
    // deniz feneri
    B.misc.box(18, 0.05, 715, 30, 2, 727, C('#e9e2d6'), {});
    for (let k = 0; k < 10; k++) B.misc.box(21 + k * 0.08, 2 + k * 2.4, 718 + k * 0.08, 27 - k * 0.08, 4.4 + k * 2.4, 724 - k * 0.08, C(k % 2 ? '#d23c3c' : '#f4f4f4'), {});
    this.addBox(18, 30, 715, 727, -5, 26, 'bld');
    B.neon.box(22.5, 26, 719.5, 25.5, 28, 722.5, C('#fff4c0'), {});
    this.poi.lighthouse = { x: 24, y: 27, z: 721 };
    this.sign('Isla Faro', '#ffe14d', 24, 4.5, 727.3, 0, 1.2);
  }

  // ---------- kumsal ----------
  buildBeach() {
    const sandTex = T.sandTexture();
    const g = new THREE.PlaneGeometry(163, 980, 60, 120);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 278.5, z = pos.getZ(i) - 50;
      let y;
      if (x < 290) y = 0.1 + Math.sin(x * 0.11 + z * 0.05) * 0.08 * Math.min(1, (x - 197) / 10);
      else y = lerp(0.1, -4, (x - 290) / 50);
      pos.setY(i, y);
      uv.setXY(i, x / 10, z / 10);
    }
    g.computeVertexNormals();
    this.sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
    const m = new THREE.Mesh(g, this.sandMat);
    m.position.set(278.5, 0, -50);
    m.receiveShadow = true;
    this.scene.add(m);
    const rnd = this.rnd, B = this.B;
    // cankurtaran kuleleri
    const tc = ['#ff7ab6', '#7ae0ff', '#ffe36e', '#b38cff', '#7dffb0'];
    for (let z = -420; z < 420; z += 110) {
      const x = 255, c = C(tc[Math.floor(rnd() * tc.length)]);
      for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) B.misc.box(x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, 2.6, z + dz + 0.12, C('#f4f4f4'), {});
      B.misc.box(x - 1.8, 2.6, z - 1.8, x + 1.8, 4.8, z + 1.8, c, {});
      B.misc.box(x - 2.1, 4.8, z - 2.1, x + 2.1, 5.1, z + 2.1, C('#f4f4f4'), {});
      B.misc.box(x + 1.8, 0, z - 0.6, x + 4.5, 0.25, z + 0.6, C('#f4f4f4'), {});
      this.addBox(x - 1.4, x + 1.4, z - 1.4, z + 1.4, -1, 5, 'prop');
    }
    // şemsiyeler
    const umbs = [];
    const uc = ['#ff4f7b', '#ffd23f', '#13e2c5', '#ffffff', '#ff7ad9', '#3a86ff'];
    for (let k = 0; k < 90; k++) {
      const x = 215 + rnd() * 65, z = -440 + rnd() * 860;
      umbs.push({ x, y: 0.1, z, ry: rnd() * 6, color: new THREE.Color(uc[Math.floor(rnd() * uc.length)]) });
      if (rnd() < 0.6) B.misc.box(x + 0.6, 0.1, z - 0.4, x + 2.4, 0.4, z + 0.4, C('#f4f4f4'), {});
    }
    const ug = new THREE.ConeGeometry(1.6, 0.6, 8, 1, true); ug.translate(0, 2.4, 0);
    const pg = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5); pg.translate(0, 1.2, 0);
    this.scene.add(instanced(ug, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), umbs, { cast: true }));
    this.scene.add(instanced(pg, new THREE.MeshStandardMaterial({ color: '#ddd' }), umbs));
    for (let z = -430; z < 430; z += 22 + rnd() * 10) this.palm(192 + (rnd() - 0.5) * 2, z);
    for (let k = 0; k < 70; k++) this.palm(200 + rnd() * 80, -500 + rnd() * 930);
    this.pedPaths.push({ type: 'line', x0: 192, z0: -440, x1: 192, z1: 430 });
    this.pedPaths.push({ type: 'line', x0: 230, z0: -420, x1: 240, z1: 420 });
    this.sign('Palmera Beach', '#ff2fa8', 192, 6.5, -60, Math.PI / 2, 2.2);
    B.misc.box(191.7, 0, -66, 192.3, 5.4, -65.4, C('#ddd'), {}); B.misc.box(191.7, 0, -54.6, 192.3, 5.4, -54, C('#ddd'), {});
  }

  // ---------- köprü ----------
  buildBridge() {
    const B = this.B, x = BRIDGE.x, hw = BRIDGE.hw;
    const deck = new Batch();
    const step = 4;
    for (let z = BRIDGE.z0; z < BRIDGE.z1; z += step) {
      const z2 = z + step, y1 = deckHeight(z), y2 = deckHeight(z2);
      deck.rawQuad([x - hw, y2, z2], [x + hw, y2, z2], [x + hw, y1, z], [x - hw, y1, z], [0, 1, 0], C('#ffffff'), [(x - hw) / 12, z2 / 12, (x + hw) / 12, z2 / 12, (x + hw) / 12, z / 12, (x - hw) / 12, z / 12]);
      // alt yüz ve yanlar
      B.misc.rawQuad([x - hw - 0.8, y1 - 1.6, z], [x + hw + 0.8, y1 - 1.6, z], [x + hw + 0.8, y2 - 1.6, z2], [x - hw - 0.8, y2 - 1.6, z2], [0, -1, 0], C('#7d7a75'));
      for (const s of [-1, 1]) {
        const xs = x + s * (hw + 0.8);
        if (s > 0) B.misc.rawQuad([xs, y1 - 1.6, z], [xs, y1 + 1.1, z], [xs, y2 + 1.1, z2], [xs, y2 - 1.6, z2], [1, 0, 0], C('#d8d4cc'));
        else B.misc.rawQuad([xs, y1 - 1.6, z2 - step], [xs, y2 - 1.6, z2], [xs, y2 + 1.1, z2], [xs, y1 + 1.1, z], [-1, 0, 0], C('#d8d4cc'));
        // korkuluk
        const xi = x + s * hw;
        B.misc.box(Math.min(xi, xs), (y1 + y2) / 2 - 0.2, z, Math.max(xi, xs), (y1 + y2) / 2 + 1.1, z2, C('#e7e3da'), {});
        // neon şerit
        B.neon.box(xs + (s > 0 ? 0 : -0.12), (y1 + y2) / 2 - 1.2, z, xs + (s > 0 ? 0.12 : 0), (y1 + y2) / 2 - 1.0, z2, C('#22e6ff'), { top: false });
      }
      // kesik şerit çizgileri
      if ((z / step) % 2 === 0) for (const lx of [-5, 5]) B.lines.rawQuad([x + lx - 0.08, y2 + 0.03, z2 - 1], [x + lx + 0.08, y2 + 0.03, z2 - 1], [x + lx + 0.08, y1 + 0.03, z + 1], [x + lx - 0.08, y1 + 0.03, z + 1], [0, 1, 0], C('#f2f2ea'));
      B.lines.rawQuad([x - 0.15, y2 + 0.03, z2], [x + 0.15, y2 + 0.03, z2], [x + 0.15, y1 + 0.03, z], [x - 0.15, y1 + 0.03, z], [0, 1, 0], C('#f5c542'));
    }
    this.bridgeDeck = deck;
    // korkuluk çarpışmaları (y0 = 0 → altından tekne geçer)
    this.addBox(x - hw - 1, x - hw, BRIDGE.z0 + 18, BRIDGE.z1 - 18, 2.5, 30, 'rail');
    this.addBox(x + hw, x + hw + 1, BRIDGE.z0 + 18, BRIDGE.z1 - 18, 2.5, 30, 'rail');
    // kuleler + kablolar
    for (const zt of [465, 515]) for (const s of [-1, 1]) {
      const xt = x + s * (hw + 2.2);
      B.misc.box(xt - 1.2, -4, zt - 1.2, xt + 1.2, 38, zt + 1.2, C('#ece7dd'), {});
      B.neon.box(xt - 1.25, 36, zt - 1.25, xt + 1.25, 36.4, zt + 1.25, C('#ff2fa8'), {});
      this.addBox(xt - 1.2, xt + 1.2, zt - 1.2, zt + 1.2, -5, 40, 'pylon');
      this.blinkers = this.blinkers || []; this.blinkers.push({ x: xt, y: 38.6, z: zt });
    }
    B.misc.box(x - hw - 3.4, 34, 464, x + hw + 3.4, 35.5, 466, C('#ece7dd'), {});
    B.misc.box(x - hw - 3.4, 34, 514, x + hw + 3.4, 35.5, 516, C('#ece7dd'), {});
    const cable = [];
    for (const zt of [465, 515]) for (const s of [-1, 1]) {
      const xt = x + s * (hw + 1);
      for (let k = 1; k <= 9; k++) for (const dir of [-1, 1]) {
        const zc = zt + dir * k * 5;
        cable.push(xt, 35, zt, xt, deckHeight(zc) + 1, zc);
      }
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
    this.cableMat = new THREE.LineBasicMaterial({ color: '#bfefff', toneMapped: false });
    this._deferred = () => { this.scene.add(deck.build(this.roadStripMat, { cast: true })); this.scene.add(new THREE.LineSegments(cg, this.cableMat)); };
    this.sign('Puente Coral', '#22e6ff', x, 31.5, 465.8, 0, 2);
    this.sign('Puente Coral', '#22e6ff', x, 31.5, 514.2, Math.PI, 2);
    // otoyol tabelaları
    for (const z of [-200, 120]) {
      B.misc.box(x - 11, 0, z - 0.2, x - 10.6, 7.5, z + 0.2, C('#888'), {});
      B.misc.box(x + 10.6, 0, z - 0.2, x + 11, 7.5, z + 0.2, C('#888'), {});
      B.misc.box(x - 10.6, 6.2, z - 0.15, x + 10.6, 6.6, z + 0.15, C('#888'), {});
      this.addCircle(x - 10.8, z, 0.4); this.addCircle(x + 10.8, z, 0.4);
      this.buildSignsDeferred = this.buildSignsDeferred || [];
      this.buildSignsDeferred.push(() => {
        for (const [dz, rot, txt] of [[0.2, 0, z < 0 ? 'I-95 · LİMAN ↓ · KÖPRÜ' : 'I-95 · ADA · LİMAN ↓'], [-0.2, Math.PI, z < 0 ? 'I-95 · KUZEY ↑' : 'I-95 · ŞEHİR MERKEZİ ↑']]) {
          const t = T.textDecal(txt, '#ffffff', '#1d6b3a', 512, 96, '900 40px Arial, sans-serif');
          const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
          m.position.set(x, 8.2, z + dz); m.rotation.y = rot;
          this.scene.add(m);
        }
      });
    }
  }

  // ---------- Pasarela Selva: Isla Selva'ya dar ahşap yaya köprüsü ----------
  buildFootBridge() {
    // kendi geometrisi: adadayken şehir gizlenince köprü görünür kalsın
    const B = this.fb = { misc: new Batch(), neon: new Batch() }, x = FOOT.x, hw = FOOT.hw;
    const wood = [C('#8a6a4a'), C('#94714e'), C('#7f6143')], dark = C('#5b4630'), rail = C('#6e5338');
    let k = 0;
    for (let z = FOOT.z0; z > FOOT.z1 + 1e-6; z -= 1, k++) {
      const z2 = Math.max(z - 1, FOOT.z1), y1 = footDeck(z), y2 = footDeck(z2);
      // tahta döşeme (üst), kenar kirişleri, alt yüz
      B.misc.rawQuad([x - hw, y1, z], [x + hw, y1, z], [x + hw, y2, z2], [x - hw, y2, z2], [0, 1, 0], wood[k % 3]);
      B.misc.rawQuad([x - hw, y1 - 0.35, z], [x - hw, y2 - 0.35, z2], [x + hw, y2 - 0.35, z2], [x + hw, y1 - 0.35, z], [0, -1, 0], dark);
      B.misc.rawQuad([x + hw, y1 - 0.35, z], [x + hw, y2 - 0.35, z2], [x + hw, y2, z2], [x + hw, y1, z], [1, 0, 0], dark);
      B.misc.rawQuad([x - hw, y1 - 0.35, z], [x - hw, y1, z], [x - hw, y2, z2], [x - hw, y2 - 0.35, z2], [-1, 0, 0], dark);
      // korkuluk: 2 m'de bir dikme, üstte tutamak
      if (k % 2 === 0) {
        const zb = Math.max(z - 2, FOOT.z1), ya = (y1 + footDeck(zb)) / 2;
        for (const s of [-1, 1]) {
          const xi = x + s * (hw - 0.08);
          B.misc.box(xi - 0.07, y1 - 0.1, z - 0.07, xi + 0.07, y1 + 1.05, z + 0.07, rail, {});
          B.misc.box(xi - 0.06, ya + 0.98, zb, xi + 0.06, ya + 1.1, z, rail, {});
          B.misc.box(xi - 0.04, ya + 0.5, zb, xi + 0.04, ya + 0.58, z, rail, {});
        }
      }
      // kazıklar ve fenerler (8 m'de bir)
      if (k % 8 === 4) {
        for (const s of [-1, 1]) {
          const xp = x + s * (hw - 0.2);
          B.misc.box(xp - 0.16, -4, z - 0.16, xp + 0.16, y1 - 0.35, z + 0.16, dark, {});
        }
        const s = (k / 8) % 2 < 1 ? 1 : -1, xl = x + s * (hw - 0.08);
        B.neon.box(xl - 0.1, y1 + 1.1, z - 0.1, xl + 0.1, y1 + 1.3, z + 0.1, C('#ffcf7a'), {});
      }
    }
    // korkuluk çarpışması (4 m'lik parçalar; altından yüzülür)
    for (let z = FOOT.z0; z > FOOT.z1; z -= 4) {
      const z2 = Math.max(z - 4, FOOT.z1), lo = Math.min(footDeck(z), footDeck(z2)), hi = Math.max(footDeck(z), footDeck(z2));
      this.addBox(x + hw - 0.15, x + hw + 0.1, z2, z, lo - 0.4, hi + 1.1, 'rail');
      this.addBox(x - hw - 0.1, x - hw + 0.15, z2, z, lo - 0.4, hi + 1.1, 'rail');
    }
    this.poi.selva = { x, z: FOOT.z1 };
  }

  buildBorders() {
    const B = this.B;
    // şehrin çevresinde duvar yok (kullanıcı isteği); kısıtlama yalnız köprü başlarında.
    // Pasarela Selva başında kapı: taş direkler + kemer + tabela; ortada baba (araç geçemez, yaya geçer)
    const gx0 = FOOT.x - 1.8, gx1 = FOOT.x + 1.8, gz = SELVA_GATE_Z;
    const stone = C('#d8cfbf');
    B.misc.box(gx0 - 0.6, 0, gz - 1.8, gx0, 4.4, gz + 1.8, stone, {});
    B.misc.box(gx1, 0, gz - 1.8, gx1 + 0.6, 4.4, gz + 1.8, stone, {});
    this.addBox(gx0 - 0.6, gx0, gz - 1.8, gz + 1.8, -5, 4.4, 'wall');
    this.addBox(gx1, gx1 + 0.6, gz - 1.8, gz + 1.8, -5, 4.4, 'wall');
    B.misc.box(gx0 - 0.6, 3.9, gz - 1.1, gx1 + 0.6, 4.5, gz + 1.1, C('#7a5a3a'), {});
    for (const bx of [FOOT.x - 1.0, FOOT.x + 1.0]) {
      // babalar: aradaki 1,5 m'den yaya geçer, araç geçemez
      B.misc.box(bx - 0.16, 0, gz - 0.16, bx + 0.16, 1.0, gz + 0.16, C('#4a4a50'), {});
      B.neon.box(bx - 0.17, 0.85, gz - 0.17, bx + 0.17, 0.95, gz + 0.17, C('#7dffb0'), {});
      this.addCircle(bx, gz, 0.22, -5, 1.2);
    }
    this.sign('Isla Selva', '#7dffb0', FOOT.x, 5.3, gz + 1.2, 0, 1.1);
    this.sign('YAYA YOLU', '#ffffff', FOOT.x, 3.05, gz + 1.2, 0, 0.45);
    // yürüme yolu: caddeden köprü başına
    B.walk.box(FOOT.x - 1.4, 0, FOOT.z0 - 0.5, FOOT.x + 1.4, 0.18, -447, C('#e6d6bf'), { topScale: 4 });
    for (const z of [-490, -515]) for (const s of [-1, 1]) {
      // yol kenarı alçak fener
      const x = FOOT.x + s * 2.1;
      B.misc.box(x - 0.1, 0, z - 0.1, x + 0.1, 0.9, z + 0.1, C('#3a3a40'), {});
      B.neon.box(x - 0.14, 0.9, z - 0.14, x + 0.14, 1.1, z + 0.14, C('#ffcf7a'), {});
      this.addCircle(x, z, 0.15, -5, 1.2);
    }
    // otoyolun batısında palmiye sırası (Puente Oeste yolu z = WBR.z ± 9 boş)
    const g0 = WBR.z - 9, g1 = WBR.z + 9;
    for (let z = -460; z < 430; z += 30) { const pz = z + this.rnd() * 6; if (pz < g0 - 3 || pz > g1 + 3) this.palm(-472.5, pz); }
    // otoyoldan köprüye asfalt şerit + yol başında "Wild West" tabelası
    B.road.quad([WEST_X, 0.17, WBR.z + WBR.hw], [1, 0, 0], [0, 0, -1], -470 - WEST_X, WBR.hw * 2, [0, 1, 0], C('#ffffff'), [WEST_X / 12, (WBR.z - WBR.hw) / 12, -470 / 12, (WBR.z + WBR.hw) / 12]);
    this.sign('WILD WEST', '#ffb347', -490, 6.2, WBR.z - WBR.hw - 1.2, Math.PI / 2, 1.3);
    this.sign('Puente Oeste →', '#ffffff', -490, 4.9, WBR.z - WBR.hw - 1.2, Math.PI / 2, 0.55);
    B.misc.box(-490.15, 0, WBR.z - WBR.hw - 1.35, -489.85, 4.6, WBR.z - WBR.hw - 1.05, C('#3a3a40'), {});
    this.addCircle(-490, WBR.z - WBR.hw - 1.2, 0.25, -5, 5);
    for (let x = -520; x < 190; x += 26) this.palm(x + this.rnd() * 6, -458);
  }

  // ---------- sokak lambaları ----------
  buildLamps() {
    for (const e of this.edges) {
      const A = this.nodes[e.a], Bn = this.nodes[e.b];
      const vertical = A.x === Bn.x;
      const len = e.len;
      if (A.light !== Bn.light) continue;
      const start = 14, end = len - 14;
      for (let t = start; t < end; t += 34) {
        for (const s of [-1, 1]) {
          if (vertical) {
            const z = Math.min(A.z, Bn.z) + t + (s > 0 ? 17 : 0);
            if (z > Math.max(A.z, Bn.z) - 12) continue;
            const x = A.x + s * (e.hw + 0.9);
            if (x > 187 && x < 189 && false) continue;
            this.lamps.push({ x, z, dir: s > 0 ? Math.PI : 0, base: 0 });
          } else {
            const x = Math.min(A.x, Bn.x) + t + (s > 0 ? 17 : 0);
            if (x > Math.max(A.x, Bn.x) - 12) continue;
            const z = A.z + s * (e.hw + 0.9);
            this.lamps.push({ x, z, dir: s > 0 ? Math.PI / 2 : -Math.PI / 2, base: 0 });
          }
        }
      }
      // park yerleri
      if (A.light && Bn.light) {
        for (let t = 22; t < len - 22; t += 26) {
          if (this.rnd() > 0.28) continue;
          const s = this.rnd() < 0.5 ? -1 : 1;
          if (vertical) {
            const z = Math.min(A.z, Bn.z) + t, x = A.x + s * (e.hw - 1.3);
            this.parkingSpots.push({ x, z, heading: s > 0 ? Math.PI : 0 });
          } else {
            const x = Math.min(A.x, Bn.x) + t, z = A.z + s * (e.hw - 1.3);
            this.parkingSpots.push({ x, z, heading: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
          }
        }
      }
    }
    // lamba modeli: direk + kol; kol yerel +X yönünde
    const pole = colorGeom(new THREE.CylinderGeometry(0.1, 0.16, 7.2, 6).translate(0, 3.6, 0), '#3a3d44');
    const arm = colorGeom(new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(1.1, 7.1, 0), '#3a3d44');
    const head = colorGeom(new THREE.BoxGeometry(0.9, 0.18, 0.4).translate(2.1, 7.0, 0), '#2a2d33');
    const poleGeo = mergeGeoms([pole, arm, head]);
    const bulb = new THREE.BoxGeometry(0.75, 0.05, 0.3).translate(2.1, 6.9, 0);
    const list = [], bulbs = [], pools = [];
    for (const l of this.lamps) {
      const base = l.base ?? this.surfaceHeight(l.x, l.z);
      // dir: kolun baktığı yön (yola doğru) -> rotation.y öyle ki yerel +X o yöne baksın
      const toRoad = l.alley ? 0 : l.dir;
      const ry = toRoad;
      list.push({ x: l.x, y: base, z: l.z, ry });
      bulbs.push({ x: l.x, y: base, z: l.z, ry });
      const hx = l.x + Math.cos(ry) * 2.1, hz = l.z - Math.sin(ry) * 2.1;
      pools.push({ x: hx, y: this.surfaceHeight(hx, hz) + 0.04, z: hz, rx: -Math.PI / 2 });
      this.lightSources.push({ x: hx, y: base + 6.9, z: hz, color: new THREE.Color('#ffb26b'), kind: 'lamp', w: 3 });
      if (!l.alley) this.addCircle(l.x, l.z, 0.22, -1, 8);
    }
    this.scene.add(instanced(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), list, { cast: true }));
    this.lampBulbMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
    this.scene.add(instanced(bulb, this.lampBulbMat, bulbs));
    const poolGeo = new THREE.PlaneGeometry(13, 13);
    this.poolMat = new THREE.MeshBasicMaterial({ map: T.radialTexture(), color: '#ff9b4a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const pm = instanced(poolGeo, this.poolMat, pools);
    pm.renderOrder = 1;
    this.scene.add(pm);
  }

  // ---------- trafik ışıkları ----------
  buildTrafficLights() {
    const poles = [], heads = [], lamps = { NS: [[], [], []], EW: [[], [], []] };
    for (const n of this.nodes) {
      if (!n.light) continue;
      // dört yaklaşım yönü: hareket yönü d
      const dirs = [[0, -1, 'NS'], [0, 1, 'NS'], [1, 0, 'EW'], [-1, 0, 'EW']];
      for (const [dx, dz, grp] of dirs) {
        // bu yönden gelen yol var mı?
        const fromX = n.x - dx * 80, fromZ = n.z - dz * 80;
        if (!n.adj.some((a) => { const m = this.nodes[a.to]; return Math.abs(m.x - fromX) < 1 && Math.abs(m.z - fromZ) < 1; })) continue;
        // sağ vektör: hareket (dx,dz) için sağ = (-dz, dx)?  ileri (sin h, cos h), sağ (-cos h, sin h)
        const h = Math.atan2(dx, dz);
        const rx = -Math.cos(h), rz = Math.sin(h);
        const hwAlong = dx !== 0 ? n.hwx : n.hwz; // yaklaşılan yolun yarı genişliği (dik yön)
        const hwCross = dx !== 0 ? n.hwz : n.hwx;
        const roadHw = dx !== 0 ? n.hwz : n.hwx; void hwAlong;
        const px = n.x + rx * (roadHw + 1) - dx * (hwCross + 1.5);
        const pz = n.z + rz * (roadHw + 1) - dz * (hwCross + 1.5);
        // yerel +Z = -d (araçlara bakar), yerel +X = sağ
        const ry = Math.atan2(-dx, -dz);
        const t = { x: px, y: this.surfaceHeight(px, pz), z: pz, ry };
        poles.push(t); heads.push(t);
        for (let k = 0; k < 3; k++) lamps[grp][k].push(t);
        this.addCircle(px, pz, 0.25, -1, 8);
      }
    }
    // yerel: direk (0,0,0), kol -X yönünde (yola doğru: sağ vektörün tersi)
    const L = 5.5;
    const pole = colorGeom(new THREE.CylinderGeometry(0.12, 0.15, 6, 6).translate(0, 3, 0), '#2c2f36');
    const arm = colorGeom(new THREE.BoxGeometry(L, 0.14, 0.14).translate(L / 2, 5.8, 0), '#2c2f36');
    const g = mergeGeoms([pole, arm]);
    // kol yolun ortasına doğru uzanmalı: yerel +X = sağ, yol solda → kolu -X'e çevir
    g.scale(-1, 1, 1);
    const pm = instanced(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }), poles, { cast: true });
    this.scene.add(pm);
    const hg = new THREE.BoxGeometry(0.45, 1.25, 0.35).translate(-L + 0.4, 5.2, 0);
    this.scene.add(instanced(hg, new THREE.MeshStandardMaterial({ color: '#1e2024', roughness: 0.6 }), heads));
    const cols = ['#ff2a2a', '#ffb000', '#2aff6a'];
    for (const grp of ['NS', 'EW']) {
      this.trafficLampMeshes[grp] = [];
      for (let k = 0; k < 3; k++) {
        const lg = new THREE.CircleGeometry(0.14, 10).translate(-L + 0.4, 5.6 - k * 0.38, 0.18);
        const mat = new THREE.MeshBasicMaterial({ color: cols[k], toneMapped: false });
        mat.userData.base = new THREE.Color(cols[k]);
        const m = instanced(lg, mat, lamps[grp][k]);
        this.scene.add(m);
        this.trafficLampMeshes[grp].push(mat);
      }
    }
  }

  // ---------- palmiyeler ----------
  palm(x, z) { (this.palms = this.palms || []).push({ x, z }); }
  buildPalms() {
    const rnd = this.rnd;
    this.timeUniform = { value: 0 };
    const { trunk, crown, trunkMat, crownMat } = palmModel(rnd, this.timeUniform);
    const list = (this.palms || []).map((p) => {
      this.addCircle(p.x, p.z, 0.4, -1, 9);
      return { x: p.x, y: this.surfaceHeight(p.x, p.z) - 0.1, z: p.z, ry: rnd() * Math.PI * 2, s: 0.8 + rnd() * 0.45 };
    });
    this.scene.add(instanced(trunk, trunkMat, list, { cast: true }));
    this.scene.add(instanced(crown, crownMat, list, { cast: true }));
  }

  finalize() {
    if (this._deferred) this._deferred();
    // havuz / çeşme suyu
    // yarı saydam: havuzun fayans tabanı görünsün
    const wm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, emissive: '#0a5a6a', emissiveIntensity: 0.3, transparent: true, opacity: 0.72, depthWrite: false });
    this.scene.add(this.B.water.build(wm, { cast: false }));
    // uçak ikaz ışıkları
    if (this.blinkers) {
      const g = new THREE.SphereGeometry(0.35, 6, 5);
      this.blinkMat = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false });
      this.scene.add(instanced(g, this.blinkMat, this.blinkers));
    }
  }

  // Gece katsayısı vb. her karede
  update(dt, env, t) {
    this.timeUniform.value = t;
    const n = env.night;
    this.west?.setNight(n);
    for (const m of this.facadeMats) m.emissiveIntensity = 0.04 + n * 0.85;
    if (this.city) this.city.setNight(n);
    for (const m of this.signMats) m.color.copy(m.userData.base).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(0.55 + n * 2.6);
    this.neonMat.color.setScalar(0.5 + n * 2.6);
    this.lampBulbMat.color.setRGB(1, 0.85, 0.62).multiplyScalar(0.4 + n * 3.5);
    this.poolMat.opacity = n * (0.45 + env.wet * 0.35);
    this.cableMat.color.setRGB(0.75, 0.94, 1).multiplyScalar(0.4 + n * 2.0);
    for (const m of this.billboardMats) m.emissiveIntensity = 0.15 + n * 1.4;
    if (this.blinkMat) this.blinkMat.color.setRGB(1, 0.1, 0.1).multiplyScalar(Math.sin(t * 3) > 0.3 ? 2 + n * 3 : 0.15);
    // ıslak asfalt
    const w = env.wet;
    this.roadMat.roughness = 0.92 - w * 0.72;
    this.roadMat.color.setScalar(1 - w * 0.45);
    this.roadStripMat.roughness = this.roadMat.roughness; this.roadStripMat.color.copy(this.roadMat.color);
    this.walkMat.roughness = 0.9 - w * 0.55;
    this.walkMat.color.setScalar(1 - w * 0.3);
  }
  setTrafficLights(phase) {
    // phase: { NS: 'G'|'Y'|'R', EW: ... }
    for (const grp of ['NS', 'EW']) {
      const st = phase[grp];
      const mats = this.trafficLampMeshes[grp];
      mats[0].color.copy(mats[0].userData.base).multiplyScalar(st === 'R' ? 3 : 0.12);
      mats[1].color.copy(mats[1].userData.base).multiplyScalar(st === 'Y' ? 3 : 0.12);
      mats[2].color.copy(mats[2].userData.base).multiplyScalar(st === 'G' ? 3 : 0.12);
    }
  }
}

// palmiye modeli (kodla): gövde + yapraklar, rüzgârda sallanır (timeUniform). Palmera ve Casablanca ortak.
export function palmModel(rnd, timeUniform) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.32, 9, 7, 9, true);
  trunk.translate(0, 4.5, 0);
  const tp = trunk.attributes.position;
  const tcol = new Float32Array(tp.count * 3);
  // gövde: sıcak kahverengi (ceviz), halkalar biraz koyu; tepeye doğru hafif açılır
  const bark = new THREE.Color('#7b5130'), barkTop = new THREE.Color('#9a6a3e'), tc = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + 0.03 * y * y);
    const ring = (Math.floor(y * 2.2) % 2) ? 0.72 : 1;
    tc.copy(bark).lerp(barkTop, y / 9).multiplyScalar(ring);
    tcol[i * 3] = tc.r; tcol[i * 3 + 1] = tc.g; tcol[i * 3 + 2] = tc.b;
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  trunk.computeVertexNormals();
  const topX = 0.03 * 81, topY = 9;
  // yapraklar
  const P = [], Cc = [], N = [];
  const leaves = 9, segs = 7, Lf = 4.6;
  for (let k = 0; k < leaves; k++) {
    const a = (k / leaves) * Math.PI * 2 + rnd() * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const lift = 0.5 + rnd() * 0.4;
    const pts = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, d = t * Lf;
      const cx = topX + dx * d, cz = dz * d, cy = topY + lift * d - 0.28 * d * d;
      const w = 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04;
      pts.push([[cx + sx * w, cy - w * 0.35, cz + sz * w], [cx, cy, cz], [cx - sx * w, cy - w * 0.35, cz - sz * w]]);
    }
    const g1 = [0.18 + rnd() * 0.08, 0.45 + rnd() * 0.15, 0.16];
    for (let s = 0; s < segs; s++) {
      for (const [i0, i1] of [[0, 1], [1, 2]]) {
        const a0 = pts[s][i0], a1 = pts[s][i1], b0 = pts[s + 1][i0], b1 = pts[s + 1][i1];
        P.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
        for (let q = 0; q < 6; q++) { Cc.push(g1[0] * (0.8 + s * 0.05), g1[1], g1[2]); N.push(0, 1, 0); }
      }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  crown.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  crown.computeVertexNormals();
  const coco = colorGeom(new THREE.SphereGeometry(0.22, 6, 5).translate(topX + 0.25, topY - 0.3, 0.1), '#5a3d1f');
  const crownAll = mergeGeoms([crown, coco]);
  const sway = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeUniform;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        float k = max(0.0, position.y - 3.0) / 6.0;
        transformed.x += sin(uTime * 1.1 + ph) * 0.18 * k * k;
        transformed.z += cos(uTime * 0.9 + ph) * 0.12 * k * k;`);
    };
    return mat;
  };
  return { trunk, crown: crownAll,
    trunkMat: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })),
    crownMat: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })) };
}
