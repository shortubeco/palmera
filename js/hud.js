// HUD: mini harita, yıldızlar, para, can, hız, radyo, mesajlar
import { formatMoney, clamp } from './util.js';
import { fmtTime } from './league.js';
import { XS, ZS, ISLAND, PIERS, FINGER, BRIDGE, AIRPORT_RW } from './world.js';
import { AIRPORTS } from './flight.js';
import { ISLE, FOOT, CLEARING, isleDN, trailLines, RIVER, POOL, POND } from './forest.js';
import { nearestNode, shortestPath } from './traffic.js';
import { westHeight, ROADS, WBR, ROPE, CTRAILS, WEST_X } from './west.js';

const X0 = -1480, Z0 = -1000, MW = 2240, MH = 1820;   // kuzeyde Isla Selva, batıda Wild West dahil
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      stars: $('stars'), money: $('money'), hp: $('hpfill'), clock: $('clock'), speedo: $('speedo'), speed: $('speed'),
      veh: $('vehname'), radio: $('radioname'), objective: $('objective'), notify: $('notify'), big: $('big'),
      bigT: $('bigtitle'), bigS: $('bigsub'), bigN: $('bignote'), prompt: $('prompt'), card: $('missioncard'), timer: $('mtimer'),
      radioPop: $('radiopop'), mapWrap: $('bigmap'),
      mreward: $('mreward'), mrMoney: $('mrmoney'), mrTime: $('mrtime'),
    };
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.bigCanvas = $('bigmapcanvas'); this.bctx = this.bigCanvas.getContext('2d');
    this.mapImg = this.renderMap();
    this.shownMoney = game.money;
    this.route = null; this.routeT = 0;
    this.textT = 0;
    this.starFlashT = 0;
    this.el.stars.innerHTML = '<small>ARANIYOR</small>' + '<span>★</span>'.repeat(5);
    this.starEls = [...this.el.stars.querySelectorAll('span')];
  }

  renderMap() {
    const w = this.game.world;
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    const P = (x, z) => [x - X0, z - Z0];
    const rect = (x0, z0, x1, z1, col) => { g.fillStyle = col; const [a, b] = P(x0, z0); g.fillRect(a, b, x1 - x0, z1 - z0); };
    g.fillStyle = '#123c5c'; g.fillRect(0, 0, MW, MH);
    rect(-540, -540, 290, 440, '#3b3a46');
    rect(197, -540, 300, 440, '#c9ad74');
    rect(ISLAND.x0, ISLAND.z0, ISLAND.x1, ISLAND.z1, '#45444f');
    rect(AIRPORT_RW.x0, AIRPORT_RW.z0, AIRPORT_RW.x1, AIRPORT_RW.z1, '#26262c');   // havaalanı pisti
    rect(-540, -540, 197, -447, '#2f5a33'); rect(-540, -447, -470, 440, '#2f5a33');
    rect(187, -447, 197, 440, '#d9cbb8');
    rect(-450, 367, 197, 440, '#55545e');
    for (const p of PIERS) rect(p - 3, 440, p + 3, 492, '#7a5a3a');
    rect(FINGER.x0, FINGER.z0, FINGER.x1, FINGER.z1, '#7a5a3a');
    for (const b of w.blocks) rect(b.x0, b.z0, b.x1, b.z1, b.type === 'park' ? '#2f6a35' : '#5a5966');
    // binalar
    g.fillStyle = '#2a2933';
    for (const bx of w.boxes) if (bx.tag === 'bld' || bx.tag === 'cont') { const [a, b] = P(bx.x0, bx.z0); g.fillRect(a, b, bx.x1 - bx.x0, bx.z1 - bx.z0); }
    // yollar
    g.strokeStyle = '#a4a3b3'; g.lineCap = 'square';
    for (const e of w.edges) {
      const A = w.nodes[e.a], B = w.nodes[e.b];
      g.lineWidth = e.hw * 2;
      g.beginPath(); g.moveTo(...P(A.x, A.z)); g.lineTo(...P(B.x, B.z)); g.stroke();
    }
    g.strokeStyle = '#cfcfdc'; g.lineWidth = 22;
    g.beginPath(); g.moveTo(...P(BRIDGE.x, BRIDGE.z0)); g.lineTo(...P(BRIDGE.x, BRIDGE.z1)); g.stroke();
    // Isla Selva: kıyı/orman, patikalar, yaya köprüsü
    for (let z = ISLE.cz - ISLE.rz * 1.2; z < ISLE.cz + ISLE.rz * 1.2; z += 3) {
      for (let x = ISLE.cx - ISLE.rx * 1.2; x < ISLE.cx + ISLE.rx * 1.2; x += 3) {
        const dn = isleDN(x + 1.5, z + 1.5);
        if (dn > 1.02) continue;
        g.fillStyle = dn > 0.9 ? '#c9ad74' : '#24502c';
        const [a, b] = P(x, z); g.fillRect(a, b, 3.2, 3.2);
      }
    }
    // nehir + şelale havuzu + gölet
    g.strokeStyle = g.fillStyle = '#3f8fd6'; g.lineCap = 'round';
    const rp = RIVER.pts.filter((p) => p.dn < 1.02);
    for (let i = 0; i + 1 < rp.length; i++) { g.lineWidth = rp[i].w * 2; g.beginPath(); g.moveTo(...P(rp[i].x, rp[i].z)); g.lineTo(...P(rp[i + 1].x, rp[i + 1].z)); g.stroke(); }
    for (const o of [POOL, POND]) { const [a, b] = P(o.x, o.z); g.beginPath(); g.arc(a, b, o.r, 0, 7); g.fill(); }
    g.strokeStyle = '#8f7452'; g.lineWidth = 3; g.lineJoin = 'round';
    for (const l of trailLines()) { g.beginPath(); l.forEach(([x, z], i) => (i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z)))); g.stroke(); }
    g.fillStyle = '#8f7452'; { const [a, b] = P(CLEARING.x, CLEARING.z); g.beginPath(); g.arc(a, b, CLEARING.r, 0, 7); g.fill(); }
    g.strokeStyle = '#b08a5e'; g.lineWidth = 3; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(...P(FOOT.x, -447)); g.lineTo(...P(FOOT.x, FOOT.z1)); g.stroke();
    // Wild West: çöl, mesa tepeleri, yollar, köprüler, binalar
    for (let z = -480; z < 800; z += 4) for (let x = X0; x < WEST_X; x += 4) {
      const h = westHeight(x + 2, z + 2);
      if (h < -0.4) continue;
      g.fillStyle = h > 9 ? '#8a4f2e' : h > 3.5 ? '#a8643a' : h < 0.3 ? '#c9b07e' : '#c79a62';
      const [a, b] = P(x, z); g.fillRect(a, b, 4.2, 4.2);
    }
    g.strokeStyle = '#8a6a44'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of ROADS) { g.lineWidth = r.hw * 2; g.beginPath(); r.pts.forEach(([x, z], i) => (i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z)))); g.stroke(); }
    g.strokeStyle = '#7a5636'; g.lineWidth = 2.5;
    for (const l of CTRAILS) { g.beginPath(); l.forEach(([x, z], i) => (i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z)))); g.stroke(); }
    g.lineCap = 'butt'; g.strokeStyle = '#6b4a2c';
    g.lineWidth = WBR.hw * 2; g.beginPath(); g.moveTo(...P(-470, WBR.z)); g.lineTo(...P(WBR.x1 - 4, WBR.z)); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(...P(ROPE.x, ROPE.z0)); g.lineTo(...P(ROPE.x, ROPE.z1)); g.stroke();
    g.fillStyle = '#4a2f1e';
    for (const [x0, z0, x1, z1] of (w.westPlan || w.west)?.boxes || []) { const [a, b] = P(x0, z0); g.fillRect(a, b, x1 - x0, z1 - z0); }
    // simgeler
    const poi = w.poi;
    const icon = (p, txt, col) => { if (!p) return; const [a, b] = P(p.x, p.z); g.fillStyle = col; g.beginPath(); g.arc(a, b, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, a, b + 1); };
    icon(poi.hospital, '+', '#e8344f'); icon(poi.police, 'P', '#2f6bff'); icon(poi.garage, 'G', '#ff2fa8');
    void XS; void ZS;
    return c;
  }

  // ---------- olaylar ----------
  notify(text, dur = 3) {
    const n = document.createElement('div'); n.className = 'toast'; n.textContent = text;
    this.el.notify.appendChild(n);
    setTimeout(() => n.classList.add('out'), dur * 1000);
    setTimeout(() => n.remove(), dur * 1000 + 600);
  }
  hint(text, dur = 0.3) { this.hintText = text; this.hintT = dur; this.textT = 0; }
  big(title, sub = '', color = '#fff', dur = 3.5, note = '') {
    const e = this.el;
    e.bigT.textContent = title; e.bigS.textContent = sub; e.bigT.style.color = color;
    e.bigN.textContent = note; e.bigN.style.display = note ? 'block' : 'none';
    e.big.style.animationDuration = Math.max(3.4, dur) + 's';   // uzun gösterim (ör. not satırı okunsun)
    e.big.classList.remove('show'); void e.big.offsetWidth; e.big.classList.add('show');
    clearTimeout(this._bigTO); this._bigTO = setTimeout(() => e.big.classList.remove('show'), dur * 1000);
  }
  mission(name, intro) {
    const e = this.el.card;
    e.innerHTML = `<div class="mc-title">${name}</div><div class="mc-text">${intro}</div>`;
    e.classList.add('show');
    clearTimeout(this._cardTO); this._cardTO = setTimeout(() => e.classList.remove('show'), 11000);
  }
  objective(text) { this.el.objective.textContent = text; this.el.objective.style.display = text ? 'block' : 'none'; this.route = null; this.routeT = 0; }
  radio(name) {
    const e = this.el.radioPop; e.textContent = '📻 ' + name;
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(this._rTO); this._rTO = setTimeout(() => e.classList.remove('show'), 2200);
  }
  flashStars() { this.starFlashT = 2; this.game.audio?.jingle('wanted'); }

  // ---------- kare güncellemesi ----------
  update(dt) {
    const g = this.game, P = g.player, e = this.el;
    this.textT -= dt;
    // para animasyonu
    this.shownMoney += (g.money - this.shownMoney) * Math.min(1, dt * 6);
    if (Math.abs(g.money - this.shownMoney) < 1) this.shownMoney = g.money;
    if (this.textT <= 0) {
      this.textT = 0.1;
      e.money.textContent = formatMoney(this.shownMoney);
      e.hp.style.width = clamp(P.health, 0, 100) + '%';
      e.hp.style.background = P.health < 30 ? '#ff3b4f' : '#4cff7a';
      e.clock.textContent = g.env.timeString;
      if (P.vehicle) {
        e.speedo.style.display = 'block';
        e.speed.textContent = Math.round(P.vehicle.speedKmh);
        e.veh.textContent = P.vehicle.cfg.name + (P.vehicle.health < P.vehicle.cfg.hp * 0.3 ? ' · hasarlı' : '');
        e.radio.textContent = g.radioName();
      } else e.speedo.style.display = 'none';
      const mt = g.missions.timer;
      if (mt != null) { e.timer.style.display = 'block'; e.timer.textContent = `${Math.floor(mt / 60)}:${String(Math.floor(mt % 60)).padStart(2, '0')}`; e.timer.classList.toggle('urgent', mt < 10); }
      else e.timer.style.display = 'none';
      // lig görevi: azalan ödül + geçen süre (yardım görevlerinde yalnız süre)
      const run = g.missions.run;
      if (run) {
        e.mreward.style.display = 'block';
        e.mrMoney.style.display = run.league ? '' : 'none';
        if (run.league) {
          e.mrMoney.textContent = formatMoney(run.reward);
          e.mrMoney.classList.toggle('low', run.reward < run.league.start * 0.25);
        }
        e.mrTime.textContent = '⏱ ' + fmtTime(run.t * 1000);
      } else e.mreward.style.display = 'none';
      const pr = (this.hintT > 0 && this.hintText) || g.missions.prompt || g.player.prompt;
      e.prompt.textContent = pr || ''; e.prompt.style.display = pr ? 'block' : 'none';
    }
    this.hintT = (this.hintT || 0) - dt;
    // yıldızlar
    this.starFlashT = Math.max(0, this.starFlashT - dt);
    const pol = g.police;
    const blink = (pol.level > 0 && !pol.seen && pol.unseenT > 1) || this.starFlashT > 0;
    const on = !blink || Math.floor(g.time * 4) % 2 === 0;
    this.starEls.forEach((s, i) => { s.className = i < pol.level ? (on ? 'on' : 'dim') : ''; });
    // yıldızlar yalnızca polis ararken görünür (canlarla karışmasın)
    this.el.stars.style.display = pol.level > 0 ? '' : 'none';
    this.drawMinimap(dt);
    if (g.mapOpen) this.drawBigMap();
  }

  computeRoute() {
    const g = this.game, o = g.missions.objective;
    if (!o || o.kind === 'water') { this.route = null; return; }
    const w = g.world, P = g.player.pos;
    const a = nearestNode(w, P.x, P.z), b = nearestNode(w, o.x, o.z);
    const path = shortestPath(w, a.id, b.id).map((id) => [w.nodes[id].x, w.nodes[id].z]);
    this.route = [[P.x, P.z], ...path, [o.x, o.z]];
  }

  // uzak bölgedeyken (uçakla gidilen) o bölgenin kendi haritası: { canvas, x0, z0, w, h, labels } ya da null
  regionMap() {
    const g = this.game, P = g.player.pos;
    for (const R of Object.values(g.regions || {})) {
      if (!R.map || R.st !== 3 || !R.inside(P)) continue;
      if (!R.mapCanvas) {
        const M = R.map, c = document.createElement('canvas'); c.width = Math.ceil(M.w); c.height = Math.ceil(M.h);
        M.draw(c.getContext('2d'), (x, z) => [x - M.x0, z - M.z0]);
        R.mapCanvas = c;
      }
      return { canvas: R.mapCanvas, x0: R.map.x0, z0: R.map.z0, w: R.map.w, h: R.map.h, labels: R.map.labels || [], title: R.title };
    }
    return null;
  }
  drawMinimap(dt) {
    const g = this.game, ctx = this.mctx, W = this.mini.width, H = this.mini.height;
    const P = g.player.pos;
    const RM = this.regionMap();
    const f = g.camForward;
    const theta = -Math.PI / 2 - Math.atan2(f.z, f.x);
    const spd = g.player.vehicle ? g.player.vehicle.speed : 0;
    this.zoom = (this.zoom || 1.3) + ((spd > 20 ? 0.75 : spd > 8 ? 1.0 : 1.4) - (this.zoom || 1.3)) * Math.min(1, dt * 2);
    const z = this.zoom * (W / 220);
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, 7); ctx.clip();
    ctx.fillStyle = '#123c5c'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.rotate(theta); ctx.scale(z, z);
    if (RM) ctx.drawImage(RM.canvas, -(P.x - RM.x0), -(P.z - RM.z0));
    else ctx.drawImage(this.mapImg, -(P.x - X0), -(P.z - Z0));
    // rota
    this.routeT -= dt;
    if (this.routeT <= 0) { this.routeT = 1.2; this.computeRoute(); }
    if (this.route && !RM) {
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 4 / z * 1.4; ctx.lineJoin = 'round';
      ctx.beginPath();
      this.route.forEach(([x, zz], i) => { const px = x - P.x, pz = zz - P.z; i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    // arama bölgesi
    const pol = g.police;
    if (pol.level > 0 && !pol.seen) {
      ctx.fillStyle = 'rgba(80,120,255,0.18)'; ctx.strokeStyle = 'rgba(120,160,255,0.6)'; ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.arc(pol.lastKnown.x - P.x, pol.lastKnown.z - P.z, 50 + pol.level * 15, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // blipler (dönmeyen ikonlar)
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const R = W / 2 - 8;
    const blip = (x, zz, col, size = 4, label, clampEdge = false, shape = 'dot') => {
      const rx = (x - P.x) * z, rz = (zz - P.z) * z;
      let sx = rx * cos - rz * sin, sy = rx * sin + rz * cos;
      const d = Math.hypot(sx, sy);
      if (d > R) { if (!clampEdge) return; sx *= R / d; sy *= R / d; }
      ctx.fillStyle = col;
      if (shape === 'sq') ctx.fillRect(W / 2 + sx - size, H / 2 + sy - size, size * 2, size * 2);
      else { ctx.beginPath(); ctx.arc(W / 2 + sx, H / 2 + sy, size, 0, 7); ctx.fill(); }
      if (label) { ctx.fillStyle = '#000'; ctx.font = `bold ${size * 1.4}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, W / 2 + sx, H / 2 + sy + 1); }
    };
    const flash = Math.floor(g.time * 6) % 2;
    for (const v of g.vehicles) {
      if (v.driver === 'player') continue;
      if ((v.ai && v.ai.isCop) || v.copCar) blip(v.pos.x, v.pos.z, flash ? '#ff3040' : '#3060ff', 3.5);
    }
    for (const c of g.peds) if (c.role === 'cop' && c.state !== 'dead') blip(c.pos.x, c.pos.z, flash ? '#3060ff' : '#ff3040', 2.5);
    if (pol.heli) blip(pol.heli.pos.x, pol.heli.pos.z, '#7fa0ff', 5, 'H', true);
    const poi = g.world.poi;
    if (!RM) {   // Palmera'ya ait işaretler uzak bölgede gösterilmez
      blip(poi.hospital.x, poi.hospital.z, '#e8344f', 6, '+', true, 'sq');
      blip(poi.police.x, poi.police.z, '#2f6bff', 6, 'P', true, 'sq');
      for (const b of g.missions.blips) blip(b.x, b.z, b.done ? '#bbbbbb' : b.color, b.target ? 7 : 7, b.label, true);
    }
    // havaalanı kalkış tabelası (✈)
    const ap = g.flights && AIRPORTS[g.flights.here];
    if (ap) blip(ap.board.x, ap.board.z, '#ffd23f', 6, '✈', true);
    // oyuncu oku
    const hd = g.player.vehicle ? g.player.vehicle.heading : g.player.heading;
    const ax = Math.sin(hd), az = Math.cos(hd);
    const ang = Math.atan2(ax * sin + az * cos, ax * cos - az * sin);
    playerTri(ctx, W / 2, H / 2, ang + Math.PI / 2, 1);
    // kuzey işareti
    const nx = sin * R, ny = -cos * R;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('K', W / 2 + nx, H / 2 + ny);
  }

  drawBigMap() {
    const g = this.game, c = this.bigCanvas, ctx = this.bctx;
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const RM = this.regionMap();
    document.querySelector('#bigmap .maphelp').textContent = (RM ? RM.title : 'Palmera City') + ' haritası · M ile kapat';
    if (RM) {
      // uzak bölge: kendi haritası, oyuncu ve tabela
      const s = Math.min(W / RM.w, H / RM.h) * 0.9, ox = (W - RM.w * s) / 2, oy = (H - RM.h * s) / 2;
      const T = (x, z) => [ox + (x - RM.x0) * s, oy + (z - RM.z0) * s];
      ctx.fillStyle = '#0b1622'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(RM.canvas, ox, oy, RM.w * s, RM.h * s);
      const ap = AIRPORTS[g.flights.here];
      if (ap) { const [a, b] = T(ap.board.x, ap.board.z); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(a, b, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✈', a, b + 1); }
      const P = g.player.pos, [pa, pb] = T(P.x, P.z);
      const hd = g.player.vehicle ? g.player.vehicle.heading : g.player.heading;
      playerTri(ctx, pa, pb, Math.atan2(Math.cos(hd), Math.sin(hd)) + Math.PI / 2, 1.35);
      ctx.font = 'italic 900 18px Georgia, serif'; ctx.textAlign = 'center';
      for (const [t, x, z] of RM.labels) { const [a, b] = T(x, z); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(t, a + 1, b + 1); ctx.fillStyle = '#ffd1ec'; ctx.fillText(t, a, b); }
      return;
    }
    const s = Math.min(W / MW, H / MH) * 0.95;
    const ox = (W - MW * s) / 2, oy = (H - MH * s) / 2;
    ctx.fillStyle = '#0b1622'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.mapImg, ox, oy, MW * s, MH * s);
    const T = (x, z) => [ox + (x - X0) * s, oy + (z - Z0) * s];
    const dot = (x, z, col, r, label) => { const [a, b] = T(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill(); if (label) { ctx.fillStyle = '#000'; ctx.font = `bold ${r * 1.3}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, a, b + 1); } };
    if (this.route) {
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3; ctx.beginPath();
      this.route.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    }
    for (const b of g.missions.blips) {
      dot(b.x, b.z, b.done ? '#bbbbbb' : b.color, 11, b.label);
      if (!b.target) { const [a, bb] = T(b.x, b.z); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'left'; ctx.fillText(MISSION_NAME(g, b) + (b.done ? ' ✓' : ''), a + 14, bb); }
    }
    // oyuncu: baktığı yönü gösteren ikizkenar üçgen (harita kuzey yukarı; dünya +z = ekran aşağı)
    const P = g.player.pos, [pa, pb] = T(P.x, P.z);
    const hd = g.player.vehicle ? g.player.vehicle.heading : g.player.heading;
    playerTri(ctx, pa, pb, Math.atan2(Math.cos(hd), Math.sin(hd)) + Math.PI / 2, 1.35);
    const labels = [['Şehir Merkezi', -40, -260], ['Otel Bölgesi', 140, -120], ['Palmera Beach', 250, 0], ['Liman', -150, 405], ['Havalimanı · Isla Faro', -250, 635], ['I-95 Otoyolu', -510, -100], ['Puente Coral', -420, 490], ['Eski Mahalle', -300, 0], ['Isla Selva', ISLE.cx, ISLE.cz - 40], ['Wild West', -880, -95], ['Cañón Rojo', -1130, 800], ['Puente Oeste', -628, -14]];
    ctx.font = 'italic 900 16px Georgia, serif'; ctx.textAlign = 'center';
    for (const [t, x, z] of labels) { const [a, b] = T(x, z); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(t, a + 1, b + 1); ctx.fillStyle = '#ffd1ec'; ctx.fillText(t, a, b); }
  }
}
// ikizkenar üçgen: tepe yerel -y yönünde, rot ile döndürülür
function playerTri(ctx, x, y, rot, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.8 / s; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(6.5, 8); ctx.lineTo(-6.5, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function MISSION_NAME(g, b) {
  const mk = g.missions.markers.find((m) => m.m.start.x === b.x && m.m.start.z === b.z);
  return mk ? mk.m.name : '';
}
