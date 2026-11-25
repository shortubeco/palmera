// Tüm dokular burada canvas ile kodla üretilir (dışarıdan indirilen dosya yok).
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function noise(ctx, w, h, amount, rnd, alpha = 0.12) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Bina cephesi: 8x8 hücre, her hücre bir pencere. map + emissiveMap döner.
export function facadeTextures(style, seed = 1) {
  const rnd = mulberry32(seed);
  const S = 512, N = 8, cs = S / N;
  const [c, g] = canvas(S, S);
  const [e, ge] = canvas(S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 6000, rnd, 0.06);
  const litChance = { glass: 0.38, hotel: 0.5, resi: 0.33, industrial: 0.12 }[style];
  const warm = ['#ffd890', '#ffcf7a', '#ffe2b0', '#fff1c8', '#ffb86b'];
  const cool = ['#9fe7ff', '#c8f0ff', '#ffa8e8', '#b9a8ff'];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x * cs, py = y * cs;
      let wx, wy, ww, wh;
      if (style === 'glass') {
        wx = px + 3; wy = py + 6; ww = cs - 6; wh = cs - 12;
        const gr = g.createLinearGradient(px, py, px + cs, py + cs);
        gr.addColorStop(0, '#3a5670'); gr.addColorStop(1, '#1b2c3f');
        g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(wx, wy, ww * 0.4, wh);
      } else if (style === 'hotel') {
        wx = px + 12; wy = py + 14; ww = cs - 24; wh = cs - 26;
        g.fillStyle = '#2a3846'; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(160,220,255,0.25)'; g.fillRect(wx + 2, wy + 2, ww * 0.3, wh - 4);
        // balkon korkuluğu / saçak
        g.fillStyle = '#ffffff'; g.fillRect(px + 4, py + cs - 10, cs - 8, 5);
        g.fillStyle = '#c9c4ba'; g.fillRect(px + 4, py + cs - 5, cs - 8, 3);
      } else if (style === 'resi') {
        wx = px + 18; wy = py + 14; ww = cs - 36; wh = cs - 26;
        g.fillStyle = '#25303a'; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = '#cfc8bc'; g.fillRect(wx - 3, wy + wh, ww + 6, 4);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      } else {
        // endüstriyel oluklu sac
        for (let k = 0; k < cs; k += 6) {
          g.fillStyle = k % 12 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
          g.fillRect(px + k, py, 3, cs);
        }
        if (y % 4 === 0) {
          wx = px + 8; wy = py + 20; ww = cs - 16; wh = 16;
          g.fillStyle = '#2b3138'; g.fillRect(wx, wy, ww, wh);
        } else continue;
      }
      if (rnd() < litChance) {
        const col = rnd() < 0.85 ? warm[Math.floor(rnd() * warm.length)] : cool[Math.floor(rnd() * cool.length)];
        ge.fillStyle = col;
        ge.globalAlpha = 0.55 + rnd() * 0.45;
        ge.fillRect(wx, wy, ww, wh);
        ge.globalAlpha = 1;
        // perde/silüet
        if (rnd() < 0.4) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(wx + ww * rnd() * 0.6, wy, ww * 0.35, wh); }
      }
    }
  }
  const map = tex(c);
  const em = tex(e);
  return { map, emissiveMap: em };
}

export function asphaltTexture() {
  const rnd = mulberry32(77);
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#3a3b3f'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 40000, rnd, 0.10);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(20,20,22,${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    let x = rnd() * S, y = rnd() * S; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.08})`;
    g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill();
  }
  return tex(c);
}

export function tilesTexture(base = '#b9b2a6', line = '#8f887d', n = 4) {
  const rnd = mulberry32(31);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  noise(g, S, S, 9000, rnd, 0.08);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * S / n, 0); g.lineTo(i * S / n, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * S / n); g.lineTo(S, i * S / n); g.stroke();
  }
  return tex(c);
}

export function sandTexture() {
  const rnd = mulberry32(5);
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e9d2a6'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 50000, rnd, 0.09);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(180,150,100,0.12)'; g.lineWidth = 2;
    g.beginPath();
    const y = rnd() * S; g.moveTo(0, y);
    g.bezierCurveTo(S * 0.3, y + 10, S * 0.6, y - 10, S, y);
    g.stroke();
  }
  return tex(c);
}

export function grassTexture() {
  const rnd = mulberry32(9);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#4f8a3c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = 60 + rnd() * 80;
    g.fillStyle = `rgba(${v * 0.5},${v + 40},${v * 0.35},0.35)`;
    g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3);
  }
  return tex(c);
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const S = 128;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, srgb: false });
}

// Islak zemindeki uzun neon yansıması
export function streakTexture() {
  const W = 64, H = 256;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = y / H;
      let a = Math.exp(-dx * dx * 5) * Math.pow(1 - dy, 1.6) * (0.75 + 0.25 * Math.sin(y * 0.9 + x * 0.3));
      a *= Math.min(1, dy * 8 + 0.2);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}

export function softDotTexture() {
  const S = 64;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, srgb: false });
}

// Neon tabela: saydam zemin üzerinde parlayan yazı
export function neonSignTexture(text, color, opts = {}) {
  const font = opts.font || 'italic 900 120px "Brush Script MT", "Segoe Script", cursive';
  const [m, mg] = canvas(16, 16);
  mg.font = font;
  const tw = Math.ceil(mg.measureText(text).width) + 80;
  const H = 200;
  const [c, g] = canvas(Math.min(2048, tw), H);
  g.font = font;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 28;
  g.strokeStyle = color; g.lineWidth = 10;
  g.strokeText(text, c.width / 2, H / 2 + 6);
  g.shadowBlur = 12;
  g.fillStyle = '#ffffff';
  g.lineWidth = 4; g.strokeStyle = '#fff';
  g.strokeText(text, c.width / 2, H / 2 + 6);
  const t = tex(c, { repeat: false });
  return { texture: t, aspect: c.width / H };
}

// Uydurma markalar için reklam panosu
export function billboardTexture(seed) {
  const rnd = mulberry32(seed);
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  const ads = [
    ['SOLARA', 'cola', '#ff4f7b', '#ffd23f'],
    ['KRAKEN', 'enerji içeceği', '#13e2c5', '#1b1464'],
    ['PALMERA', 'BAY · 98.4 FM', '#ff7ad9', '#2a0a4a'],
    ['MOJITO', 'beach club', '#7cff8a', '#073b4c'],
    ['VELOCE', 'GT · hıza doğ', '#f7f7f7', '#d7263d'],
    ['LUXOR', 'güneş gözlükleri', '#ffcf56', '#232323'],
    ['ATLAS', 'sigorta · "her ihtimale"', '#5ee7ff', '#102a43'],
  ];
  const ad = ads[Math.floor(rnd() * ads.length)];
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, ad[3]); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = ad[2]; g.globalAlpha = 0.25;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, 30 + rnd() * 90, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  g.font = '900 104px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.fillStyle = ad[2];
  g.shadowColor = ad[2]; g.shadowBlur = 20;
  g.fillText(ad[0], W / 2, 140);
  g.shadowBlur = 0;
  g.font = 'italic 700 36px Georgia, serif'; g.fillStyle = '#fff';
  g.fillText(ad[1], W / 2, 200);
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
  return tex(c, { repeat: false });
}

// Oyuncunun desenli Hawaii gömleği
export function shirtTexture() {
  const rnd = mulberry32(42);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#ff5f9e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 14;
    g.fillStyle = rnd() < 0.5 ? '#fff3b0' : '#7ef2e0';
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * Math.PI * 2;
      g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.28, a, 0, 7); g.fill();
    }
    g.fillStyle = '#ff9f1c'; g.beginPath(); g.arc(x, y, r * 0.25, 0, 7); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = '#1f9d55'; g.lineWidth = 4;
    const x = rnd() * S, y = rnd() * S;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 10, x + 34, y + 8); g.stroke();
  }
  return tex(c);
}

export function textDecal(text, fg = '#111', bg = 'rgba(0,0,0,0)', w = 256, h = 64, font = '900 44px Arial Black, Impact, sans-serif') {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
  return tex(c, { repeat: false });
}

export function containerTexture() {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 3, S); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, S, 4); g.fillRect(0, S - 4, S, 4);
  return tex(c);
}
