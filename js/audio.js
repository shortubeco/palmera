// Web Audio ile kodla üretilen radyo kanalları ve ses efektleri
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Araç türüne göre motor sesi.
// base: rölanti Hz, range: en yüksek devirde base'in kaç katı eklenir, w: 3 osilatörün dalgası,
// r: 2. ve 3. osilatörün frekans oranı, mix: 3 osilatörün seviyesi, lp/lpR: filtre tabanı ve devirle artışı,
// q: filtre rezonansı (yüksek = vızıltılı/sert), am/amR: ateşleme titreşiminin derinliği ve frekans oranı, vol: ses.
const ENG_PITCH = 0.6, ENG_TONE = 0.6;
const ENGINES = {
  sport:  { base: 52, range: 3.6, w: ['sawtooth', 'square', 'sawtooth'], r: [0.5, 1.505], mix: [0.6, 0.5, 0.3], lp: 520, lpR: 2600, q: 4, am: 0.22, amR: 0.5, vol: 1.15 },   // V8, sert ve tiz bağıran
  police: { base: 46, range: 3.3, w: ['sawtooth', 'square', 'triangle'], r: [0.5, 2.0], mix: [0.6, 0.55, 0.25], lp: 400, lpR: 2000, q: 3, am: 0.3, amR: 0.5, vol: 1.1 },   // kaslı V8
  sedan:  { base: 40, range: 3.0, w: ['sawtooth', 'sine', 'triangle'], r: [0.5, 2.0], mix: [0.45, 0.6, 0.2], lp: 300, lpR: 1200, q: 1, am: 0.1, amR: 1.0, vol: 0.9 },   // yumuşak 4 silindir
  taxi:   { base: 37, range: 2.8, w: ['sawtooth', 'square', 'sawtooth'], r: [0.5, 1.02], mix: [0.5, 0.45, 0.25], lp: 280, lpR: 1100, q: 2, am: 0.25, amR: 0.25, vol: 0.95 },   // yorgun, hafif takırtılı
  hatch:  { base: 60, range: 3.4, w: ['square', 'sawtooth', 'square'], r: [1.0, 2.01], mix: [0.45, 0.35, 0.2], lp: 520, lpR: 1800, q: 5, am: 0.35, amR: 0.333, vol: 0.8 },   // küçük 3 silindir, vızıltılı
  pickup: { base: 30, range: 2.6, w: ['sawtooth', 'square', 'sine'], r: [0.5, 0.25], mix: [0.6, 0.6, 0.5], lp: 220, lpR: 900, q: 2, am: 0.45, amR: 0.5, vol: 1.2 },   // iri V8, pes gürleme
  van:    { base: 33, range: 2.4, w: ['square', 'sawtooth', 'square'], r: [2.0, 0.5], mix: [0.5, 0.3, 0.4], lp: 260, lpR: 1000, q: 6, am: 0.5, amR: 0.25, vol: 1.0 },   // dizel takırtısı
  moto:   { base: 75, range: 4.2, w: ['sawtooth', 'square', 'sawtooth'], r: [2.0, 0.5], mix: [0.6, 0.25, 0.35], lp: 450, lpR: 2200, q: 4, am: 0.4, amR: 0.5, vol: 1.8 },   // yüksek devirli, cırlak
  boat:   { base: 42, range: 2.6, w: ['square', 'sawtooth', 'sine'], r: [0.5, 1.5], mix: [0.5, 0.4, 0.3], lp: 250, lpR: 800, q: 1, am: 0.3, amR: 0.333, vol: 1.0 },   // boğuk dıştan takma
  horse:  { base: 30, range: 1, w: ['sine', 'sine', 'sine'], r: [1, 1], mix: [0, 0, 0], lp: 100, lpR: 0, q: 1, am: 0, amR: 1, vol: 0 },   // binek at: motor yok
  wagon:  { base: 30, range: 1, w: ['sine', 'sine', 'sine'], r: [1, 1], mix: [0, 0, 0], lp: 100, lpR: 0, q: 1, am: 0, amR: 1, vol: 0 },   // at arabası: motor yok (vehicles.js nal sesi çalar)
};

export const STATIONS = [
  { name: 'Flamingo FM 87.6', genre: 'synthwave', bpm: 100 },
  { name: 'Neon Bass 98.4', genre: 'house', bpm: 124 },
  { name: 'Cayo Jazz 101.1', genre: 'jazz', bpm: 84 },
  { name: 'Radyo Caliente 104.5', genre: 'reggaeton', bpm: 96 },
  { name: 'Radyo Kapalı', genre: 'off', bpm: 0 },
];

const DRIFT_TRACK = { name: 'Drift Park', genre: 'drift', bpm: 116 };

export class AudioSys {
  constructor(muted) {
    this.muted = muted; this.ctx = null; this.station = 0; this.radioOn = false;
    this.musicMuted = false;   // müzik (radyo + Drift Park parçası) ayrı kapatılabilir; sesler çalmaya devam eder
    this.listener = { x: 0, y: 0, z: 0 };
    this.step = 0; this.nextTime = 0;
  }
  init() {
    if (this.muted || this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    this.comp = ctx.createDynamicsCompressor(); this.comp.connect(this.master);
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = 0; this.radioBus.connect(this.comp);
    this.radioFilter = ctx.createBiquadFilter(); this.radioFilter.type = 'lowpass'; this.radioFilter.frequency.value = 9000;
    this.radioFilter.connect(this.radioBus);
    this.music = ctx.createGain(); this.music.gain.value = this.musicMuted ? 0 : 0.55; this.music.connect(this.radioFilter);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.comp);
    // reverb
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.35; this.revSend.connect(this.reverb); this.reverb.connect(this.music);
    // delay
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.36;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.35;
    this.delSend = ctx.createGain(); this.delSend.gain.value = 0.3;
    this.delSend.connect(this.delay); this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.music);
    // gürültü tamponu
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // motor: 3 osilatör (her biri kendi seviyesiyle) → alçak geçiren → ateşleme titreşimi (AM) → ses
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    this.eng3 = ctx.createOscillator(); this.eng3.type = 'sawtooth';
    this.engM = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400;
    this.engAM = ctx.createGain(); this.engAM.gain.value = 1;
    this.engLfo = ctx.createOscillator(); this.engLfo.type = 'sine';
    this.engLfoG = ctx.createGain(); this.engLfoG.gain.value = 0;
    this.engLfo.connect(this.engLfoG); this.engLfoG.connect(this.engAM.gain);
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    [this.eng1, this.eng2, this.eng3].forEach((o, i) => { o.connect(this.engM[i]); this.engM[i].connect(this.engF); });
    this.engF.connect(this.engAM); this.engAM.connect(this.engG); this.engG.connect(this.sfx);
    this.eng1.start(); this.eng2.start(); this.eng3.start(); this.engLfo.start();
    this.engType = null;
    // siren
    this.sir = ctx.createOscillator(); this.sir.type = 'triangle';
    this.sirG = ctx.createGain(); this.sirG.gain.value = 0;
    this.sir.connect(this.sirG); this.sirG.connect(this.sfx); this.sir.start();
    // helikopter + kayma + yağmur (döngüsel gürültüler)
    const loop = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start();
      return { g, fl };
    };
    this.heliN = loop('lowpass', 300, 1);
    this.heliLfo = ctx.createOscillator(); this.heliLfo.frequency.value = 17;
    this.heliLfoG = ctx.createGain(); this.heliLfoG.gain.value = 0;
    this.heliLfo.connect(this.heliLfoG); this.heliLfoG.connect(this.heliN.g.gain); this.heliLfo.start();
    this.skidN = loop('bandpass', 1400, 4);
    this.rainN = loop('highpass', 2500, 0.5);
    this.windN = loop('lowpass', 500, 0.7);
    this.jetN = loop('bandpass', 700, 0.8);   // jet motoru (uçuş sahnesi)
    // Drift Park müziği: distorsiyonlu gitar zinciri (dalga şekillendirici → bant → alçak geçiren → müzik)
    this.gtrIn = ctx.createGain(); this.gtrIn.gain.value = 1;
    const ws = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 6) * 0.8; }
    ws.curve = curve; ws.oversample = '2x';
    const gHp = ctx.createBiquadFilter(); gHp.type = 'highpass'; gHp.frequency.value = 90;
    const gLp = ctx.createBiquadFilter(); gLp.type = 'lowpass'; gLp.frequency.value = 3200; gLp.Q.value = 0.8;
    const gOut = ctx.createGain(); gOut.gain.value = 0.32;
    this.gtrIn.connect(ws); ws.connect(gHp); gHp.connect(gLp); gLp.connect(gOut); gOut.connect(this.music);
    const gRev = ctx.createGain(); gRev.gain.value = 0.18; gOut.connect(gRev); gRev.connect(this.revSend);
    this.driftOn = false;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  // ---------- Drift Park müziği (özgün 80'ler otoyol rock'ı, 116 BPM, Mi minör) ----------
  // setDrift(true): geri sayımda giriş (susturulmuş gitar + zil); driftGo(): "BAŞLA!" anında tam parça; setDrift(false): yavaşça sus
  setDrift(on) {
    if (!this.ctx) return;
    this.driftOn = on;
    if (on) { this.step = 0; this.nextTime = this.ctx.currentTime + 0.08; }
    else { this.step = 0; }
    const radio = this.radioOn && STATIONS[this.station].genre !== 'off';
    this.radioBus.gain.setTargetAtTime(on || radio ? 0.5 : 0, this.ctx.currentTime, on ? 0.05 : 0.6);
  }
  driftGo() { if (this.ctx && this.driftOn) this.step = 32; }   // 3. ölçüden (tam parça) devam
  // jet uğultusu: k 0..1 (kalkışta güçlenir, perde yükselir); 0 → susar
  jet(k) {
    if (!this.jetN) return; const t = this.ctx.currentTime;
    this.jetN.g.gain.setTargetAtTime(k > 0 ? 0.05 + k * 0.12 : 0, t, k > 0 ? 0.3 : 0.6);
    this.jetN.fl.frequency.setTargetAtTime(500 + k * 1400, t, 0.4);
  }
  resume() { this.ctx?.resume?.(); }
  setMusicMuted(m) {
    this.musicMuted = m;
    if (this.music) this.music.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.1);
  }
  setMasterMuted(m) { if (this.master) this.master.gain.value = m ? 0 : 0.8; }

  // ---------- konum ----------
  att(p, max = 80) {
    if (!p) return 1;
    const L = this.listener;
    const d = Math.hypot(p.x - L.x, (p.y || 0) - L.y, p.z - L.z);
    return Math.max(0, 1 - d / max);
  }

  // ---------- radyo ----------
  setRadio(on, station) {
    if (station !== undefined) { this.station = station; if (!this.driftOn) { this.step = 0; if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08; } }
    this.radioOn = on;
    // Drift Park müziği çalarken radyo onu kesmez
    if (this.radioBus) this.radioBus.gain.setTargetAtTime(this.driftOn || (on && STATIONS[this.station].genre !== 'off') ? 0.5 : 0, this.ctx.currentTime, 0.15);
  }
  nextStation(dir = 1) { const n = (this.station + dir + STATIONS.length) % STATIONS.length; this.setRadio(this.radioOn, n); return STATIONS[n]; }
  schedule() {
    const ctx = this.ctx; if (!ctx || this.musicMuted) return;   // müzik kapalıyken nota hiç üretilmez
    // Drift Park müziği radyonun yerine çalar
    const st = this.driftOn ? DRIFT_TRACK : (this.radioOn ? STATIONS[this.station] : null);
    if (!st || st.genre === 'off') return;
    const dur = 60 / st.bpm / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this[st.genre](this.step, this.nextTime, dur);
      this.nextTime += dur; this.step++;
    }
  }
  env(g, t, a, peak, d, sus = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
  }
  osc(type, f, t, dur, peak, opts = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + (opts.glideT || dur));
    let node = o;
    if (opts.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(opts.lp, t); if (opts.lpEnd) fl.frequency.exponentialRampToValueAtTime(opts.lpEnd, t + dur); fl.Q.value = opts.q || 1; o.connect(fl); node = fl; }
    node.connect(g);
    g.connect(opts.out || this.music);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; g.connect(s); s.connect(this.revSend); }
    if (opts.del) { const s = ctx.createGain(); s.gain.value = opts.del; g.connect(s); s.connect(this.delSend); }
    this.env(g, t, opts.a ?? 0.005, peak, dur, opts.sus || 0.0001);
    o.start(t); o.stop(t + (opts.a ?? 0.005) + dur + 0.05);
  }
  noise(t, dur, peak, type, f, opts = {}) {
    const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = opts.q || 1;
    if (opts.fEnd) fl.frequency.exponentialRampToValueAtTime(opts.fEnd, t + dur);
    s.connect(fl); fl.connect(g); g.connect(opts.out || this.music);
    if (opts.rev) { const r = ctx.createGain(); r.gain.value = opts.rev; g.connect(r); r.connect(this.revSend); }
    this.env(g, t, opts.a ?? 0.002, peak, dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  kick(t, v = 0.9) { this.osc('sine', 150, t, 0.4, v, { glide: 42, glideT: 0.13 }); }
  snare(t, v = 0.35, rev = 0.4) { this.noise(t, 0.2, v, 'highpass', 1400, { rev }); this.osc('triangle', 190, t, 0.1, v * 0.6); }
  clap(t, v = 0.35) { for (let k = 0; k < 3; k++) this.noise(t + k * 0.011, 0.12, v, 'bandpass', 1500, { q: 2, rev: 0.3 }); }
  hat(t, v = 0.12, open = false) { this.noise(t, open ? 0.22 : 0.04, v, 'highpass', 7500); }

  synthwave(i, t, d) {
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, ch = prog[bar];
    if (s === 0 || s === 8) this.kick(t, 0.85);
    if (s === 4 || s === 12) this.snare(t, 0.4, 0.7);
    if (s % 2 === 0) this.hat(t, 0.06);
    if (s % 2 === 0) this.osc('sawtooth', mtof(ch[0] - 24 + (s % 4 === 2 ? 12 : 0)), t, d * 1.8, 0.22, { lp: 700, lpEnd: 250 });
    const arp = [0, 1, 2, 1];
    this.osc('square', mtof(ch[arp[s % 4]] + 12 + (s >= 8 ? 12 : 0)), t, d * 0.9, 0.05, { lp: 2600, del: 0.5 });
    if (s === 0) for (const n of ch) { this.osc('sawtooth', mtof(n), t, d * 15, 0.045, { a: 0.4, lp: 1500, detune: 8, rev: 0.4, sus: 0.03 }); this.osc('sawtooth', mtof(n), t, d * 15, 0.045, { a: 0.4, lp: 1500, detune: -8, sus: 0.03 }); }
    if (bar === 3 && s === 14) this.snare(t, 0.25, 0.8);
  }
  // Drift Park: 4 ölçülük döngü Mi5 · Re5 · Do5 · Re5 (güç akorları); 0–1. ölçü giriş, sonra tam parça.
  // Gitar: susturulmuş on altılık "çuğ" + vurgulu güç akoru vuruşları (distorsiyon zinciri gtrIn); bas sekizlik; büyük yankılı trampet.
  // Melodi (özgün): her 8 ölçünün ikinci yarısında kısa bir synth cevabı.
  drift(i, t, d) {
    const roots = [40, 38, 36, 38];                 // Mi2, Re2, Do2, Re2
    const bar = Math.floor(i / 16), s = i % 16, r = roots[bar % 4];
    const intro = bar < 2, cyc = bar % 8;
    const g = { out: this.gtrIn };
    // gitar: susturulmuş çuğ (kısa, kapalı) — vurgularda açık güç akoru (kök + beşli + oktav)
    const accent = [0, 3, 6, 10, 12].includes(s) || (cyc === 7 && s >= 12);
    if (intro) {
      if (s % 2 === 0) this.osc('sawtooth', mtof(r + 12), t, d * 0.45, 0.22, { lp: 900, ...g });
    } else if (accent) {
      for (const k of [0, 7, 12]) { this.osc('sawtooth', mtof(r + 12 + k), t, d * 1.8, 0.2, { lp: 2400, detune: 6, ...g }); this.osc('square', mtof(r + 12 + k), t, d * 1.8, 0.12, { lp: 1800, detune: -6, ...g }); }
    } else {
      this.osc('sawtooth', mtof(r + 12), t, d * 0.4, 0.18, { lp: 700, ...g });
    }
    // davul
    if (intro) { if (s % 2 === 0) this.hat(t, 0.05); if (bar === 1 && s >= 12) this.snare(t, 0.18 + (s - 12) * 0.05, 0.5); return; }
    if (s === 0 && cyc === 0) this.noise(t, 1.4, 0.16, 'highpass', 5000, { rev: 0.5 });   // zil (crash)
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.kick(t, 0.95);
    if (s === 4 || s === 12) { this.snare(t, 0.5, 1.0); this.noise(t, 0.12, 0.2, 'bandpass', 900, { q: 0.7 }); }
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.08 : 0.05);
    if (cyc === 7 && s >= 12) this.snare(t, 0.3 + (s - 12) * 0.06, 0.6);   // geçiş
    // bas: sekizlik, ölçü sonunda bir sonraki köke kayar
    if (s % 2 === 0) {
      const nr = roots[(bar + 1) % 4], n = s === 14 && nr !== r ? r + (nr > r ? 1 : -1) : r;
      this.osc('sawtooth', mtof(n), t, d * 1.6, 0.3, { lp: 520, lpEnd: 180, q: 3 });
    }
    // pad: ölçü başında
    if (s === 0) for (const k of [12, 19, 24]) this.osc('sawtooth', mtof(r + k), t, d * 15, 0.03, { a: 0.3, lp: 1400, detune: 9, rev: 0.4, sus: 0.02 });
    // melodi cevabı (ölçü 4–7 arası): Mi minör pentatonik
    if (cyc >= 4) {
      const mel = { 4: [[0, 71], [3, 74], [6, 76], [10, 74]], 5: [[0, 71], [6, 69], [10, 67]], 6: [[0, 67], [3, 69], [6, 71], [10, 74], [12, 76]], 7: [[0, 79], [4, 76], [8, 74]] }[cyc];
      const hit = mel.find(([st]) => st === s);
      if (hit) this.osc('square', mtof(hit[1]), t, d * 3, 0.06, { lp: 3000, del: 0.45, rev: 0.3, sus: 0.01 });
    }
  }
  house(i, t, d) {
    const prog = [[53, 56, 60, 63], [51, 55, 58, 62], [49, 53, 56, 60], [48, 51, 55, 58]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, ch = prog[bar];
    if (s % 4 === 0) this.kick(t, 0.95);
    if (s === 4 || s === 12) this.clap(t, 0.3);
    if (s % 4 === 2) this.hat(t, 0.09, true); else if (s % 2 === 1) this.hat(t, 0.04);
    if (s % 4 === 2) this.osc('sawtooth', mtof(ch[0] - 24), t, d * 1.5, 0.3, { lp: 900, lpEnd: 200, q: 6 });
    if (s === 3 || s === 10) for (const n of ch) this.osc('square', mtof(n), t, d * 1.2, 0.035, { lp: 2000, lpEnd: 500, rev: 0.3, del: 0.2 });
    if (s === 14 && bar % 2) this.osc('sine', mtof(ch[3] + 12), t, d * 2, 0.06, { del: 0.6 });
  }
  jazz(i, t, d) {
    const prog = [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 49, 55, 58, 61]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, ch = prog[bar];
    const sw = s % 4 === 2 ? d * 0.33 : 0;
    const tt = t + sw;
    if (s === 0 || s === 10) this.osc('sine', 90, tt, 0.25, 0.35, { glide: 50, glideT: 0.1 });
    if (s === 4 || s === 12) this.noise(tt, 0.25, 0.06, 'bandpass', 3000, { q: 0.6 });
    if ([0, 4, 6, 8, 12, 14].includes(s)) this.noise(tt, 0.3, 0.03, 'highpass', 6000);
    if (s % 4 === 0) {
      const walk = [ch[0] - 12, ch[0] - 12 + 3, ch[0] - 12 + 7, ch[0] - 12 + 5][(s / 4) | 0];
      this.osc('triangle', mtof(walk - 12 + 12), tt, d * 3.5, 0.28, { lp: 600 });
    }
    if (s === 0 || s === 6 || (s === 11 && bar % 2)) {
      for (const n of ch.slice(1)) {
        this.osc('sine', mtof(n), tt, d * (s === 0 ? 7 : 4), 0.06, { a: 0.01, rev: 0.25, sus: 0.002 });
        this.osc('triangle', mtof(n + 12), tt, d * 2, 0.012, { a: 0.005 });
      }
    }
    if (s === 13 && Math.random() < 0.5) this.osc('sine', mtof(ch[1 + Math.floor(Math.random() * 4)] + 12), tt, d * 2, 0.05, { rev: 0.4 });
  }
  reggaeton(i, t, d) {
    const prog = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, ch = prog[bar];
    if (s % 4 === 0) this.kick(t, 0.9);
    if (s === 3 || s === 6 || s === 11 || s === 14) this.snare(t, 0.3, 0.2);
    if (s % 2 === 0) this.noise(t, 0.05, 0.05, 'highpass', 8000);
    if (s === 0 || s === 6 || s === 8 || s === 14) this.osc('sine', mtof(ch[0] - 24), t, d * 3.5, 0.45, { glide: mtof(ch[0] - 25), glideT: d * 3 });
    if ([0, 3, 6, 8, 10, 12, 14].includes(s)) {
      const n = ch[[0, 1, 2, 1, 2, 0, 1][[0, 3, 6, 8, 10, 12, 14].indexOf(s)]] + 12;
      this.osc('sine', mtof(n), t, 0.22, 0.12, { a: 0.002 }); this.osc('sine', mtof(n) * 4, t, 0.05, 0.03);
    }
    if (s === 0 && bar === 0) for (const n of ch) this.osc('sawtooth', mtof(n + 12), t, d * 30, 0.02, { a: 0.6, lp: 1200, sus: 0.01, rev: 0.4 });
  }

  // ---------- sürekli sesler ----------
  updateLoops(st) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // motor
    if (st.engine) {
      const rpm = st.engine.rpm, thr = st.engine.throttle;
      const E = ENGINES[st.engine.type] || ENGINES.sedan;
      if (this.engType !== st.engine.type) {   // araç türü değişti: dalga biçimleri ve karışım
        this.engType = st.engine.type;
        this.eng1.type = E.w[0]; this.eng2.type = E.w[1]; this.eng3.type = E.w[2];
        E.mix.forEach((m, i) => this.engM[i].gain.setTargetAtTime(m, t, 0.05));
        this.engF.Q.setTargetAtTime(E.q, t, 0.05);
      }
      // ENG_PITCH / ENG_TONE: tüm motorları birlikte kalınlaştırır (kullanıcı: "çok tiz")
      const f = E.base * ENG_PITCH * (1 + rpm * E.range * 0.85);
      this.eng1.frequency.setTargetAtTime(f, t, 0.05);
      this.eng2.frequency.setTargetAtTime(f * E.r[0], t, 0.05);
      this.eng3.frequency.setTargetAtTime(f * E.r[1], t, 0.05);
      this.engF.frequency.setTargetAtTime((E.lp + rpm * E.lpR + thr * E.lpR * 0.5) * ENG_TONE, t, 0.05);
      // ateşleme titreşimi: düşük devirde belirgin, gazla biraz artar
      const depth = E.am * (1 - rpm * 0.5) * (0.7 + thr * 0.3);
      this.engLfo.frequency.setTargetAtTime(f * E.amR, t, 0.05);
      this.engLfoG.gain.setTargetAtTime(depth * 0.5, t, 0.05);
      this.engAM.gain.setTargetAtTime(1 - depth * 0.5, t, 0.05);
      this.engG.gain.setTargetAtTime((0.05 + thr * 0.07) * E.vol * 1.25, t, 0.08);
    } else this.engG.gain.setTargetAtTime(0, t, 0.1);
    // siren
    if (st.siren > 0) {
      const w = 700 + 380 * Math.sin(t * Math.PI * 2 * 0.45);
      this.sir.frequency.setTargetAtTime(w, t, 0.02);
      this.sirG.gain.setTargetAtTime(0.06 * st.siren, t, 0.1);
    } else this.sirG.gain.setTargetAtTime(0, t, 0.2);
    this.skidN.g.gain.setTargetAtTime(st.skid ? 0.07 : 0, t, 0.05);
    this.rainN.g.gain.setTargetAtTime(st.rain * 0.06, t, 0.5);
    this.windN.g.gain.setTargetAtTime(Math.min(0.08, st.wind * 0.0015), t, 0.2);
    // radyo araç dışında boğuk
    this.radioFilter.frequency.setTargetAtTime(st.inCar ? 12000 : 900, t, 0.2);
  }
  heli(p) {
    if (!this.ctx) return;
    const a = p ? this.att(p, 220) : 0;
    this.heliLfoG.gain.setTargetAtTime(a * 0.12, this.ctx.currentTime, 0.2);
    this.heliN.g.gain.setTargetAtTime(a * 0.1, this.ctx.currentTime, 0.2);
  }

  // ---------- tek seferlik ----------
  crash(k, p) {
    if (!this.ctx) return; const a = this.att(p, 90) * Math.min(1, k / 20); if (a <= 0.01) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.35, 0.5 * a, 'lowpass', 1800, { out: this.sfx, fEnd: 300 });
    this.osc('sine', 80, t, 0.25, 0.6 * a, { glide: 40, out: this.sfx });
    this.noise(t + 0.02, 0.2, 0.2 * a, 'highpass', 4000, { out: this.sfx });
  }
  explosion(p) {
    if (!this.ctx) return; const a = this.att(p, 260); if (a <= 0) return;
    const t = this.ctx.currentTime;
    this.noise(t, 2.2, 0.9 * a, 'lowpass', 2000, { out: this.sfx, fEnd: 80 });
    this.osc('sine', 70, t, 1.2, 0.9 * a, { glide: 25, out: this.sfx });
  }
  gunshot(p) {
    if (!this.ctx) return; const a = this.att(p, 160); if (a <= 0) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.12, 0.55 * a, 'lowpass', 3500, { out: this.sfx, fEnd: 400 });
    this.osc('square', 140, t, 0.05, 0.25 * a, { out: this.sfx, glide: 60 });
  }
  punch() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc('sine', 120, t, 0.12, 0.5, { glide: 50, out: this.sfx }); this.noise(t, 0.06, 0.25, 'lowpass', 1200, { out: this.sfx }); }
  horn(p, v = 1) {
    if (!this.ctx) return; const a = this.att(p, 70) * v; if (a <= 0) return;
    const t = this.ctx.currentTime;
    this.osc('square', 392, t, 0.35, 0.06 * a, { out: this.sfx, lp: 2000, sus: 0.05 }); this.osc('square', 494, t, 0.35, 0.05 * a, { out: this.sfx, lp: 2000, sus: 0.05 });
  }
  // kaplan kükremesi: boğuk gürültü + aşağı kayan pes testere dalga
  growl(p) {
    if (!this.ctx) return; const a = this.att(p, 70); if (a <= 0.02) return;
    const t = this.ctx.currentTime;
    this.noise(t, 1.5, 0.3 * a, 'lowpass', 450, { out: this.sfx, fEnd: 160, a: 0.15 });
    this.osc('sawtooth', 75, t, 1.4, 0.1 * a, { glide: 45, glideT: 1.3, lp: 420, lpEnd: 140, q: 3, out: this.sfx, a: 0.12 });
  }
  // tek nal vuruşu (vehicles.js at adım döngüsüne göre çağırır): toprağa tok gümleme
  // (alçak geçiren gürültü + hızla inen pes tını) + çok kısa sert tık; her vuruşta perde biraz değişir
  hoof(v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime, r = 0.85 + Math.random() * 0.3;
    this.noise(t, 0.07, 0.3 * v, 'lowpass', 520 * r, { out: this.sfx, fEnd: 180, q: 1.2 });
    this.osc('sine', 120 * r, t, 0.09, 0.32 * v, { glide: 52, glideT: 0.06, out: this.sfx });
    this.noise(t, 0.016, 0.07 * v, 'bandpass', 2300 * r, { out: this.sfx, q: 3 });
  }
  splash() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, 0.8, 0.4, 'lowpass', 1500, { out: this.sfx, fEnd: 300 }); }
  scream(p) {
    if (!this.ctx) return; const a = this.att(p, 40); if (a <= 0) return;
    const t = this.ctx.currentTime, f = 600 + Math.random() * 400;
    this.osc('sawtooth', f, t, 0.5, 0.025 * a, { glide: f * 0.6, lp: 2500, out: this.sfx, a: 0.05 });
  }
  thunder() { if (!this.ctx) return; const t = this.ctx.currentTime + 0.5 + Math.random(); this.noise(t, 3, 0.5, 'lowpass', 400, { out: this.sfx, fEnd: 60, a: 0.2 }); }
  jingle(kind) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const seq = { win: [72, 76, 79, 84, 88], start: [64, 67, 71], fail: [64, 60, 57, 52], cp: [79, 84], money: [84, 88], wanted: [76, 72] }[kind] || [72];
    seq.forEach((n, i) => this.osc('square', mtof(n), t + i * 0.09, 0.25, 0.06, { lp: 3000, out: this.sfx }));
  }
}
