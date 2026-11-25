// Kutulardan kurulan insan modeli ve basit animasyonları
import * as THREE from 'three';

const geoCache = {};
const matCache = {};
function geo(key, f) { return geoCache[key] || (geoCache[key] = f()); }
function mat(color, extra) {
  const k = color + (extra ? JSON.stringify(Object.keys(extra)) : '');
  if (extra && extra.map) return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...(extra || {}) }));
}
const SKINS = ['#f1c7a3', '#d9a27c', '#b5794f', '#8d5a3b', '#5f3b26', '#f6d6bd'];
const SHIRTS = ['#ffffff', '#ff7aa8', '#59c3ff', '#ffd23f', '#6bff9e', '#b48cff', '#ff8a5b', '#2a2a2a', '#e94f4f', '#4fe9c9', '#f0e6d2'];
const PANTS = ['#2e3a59', '#1f1f24', '#c9b48a', '#6b4f3a', '#f0f0f0', '#3a5f3a', '#7a7a80'];
const HAIRS = ['#1b1209', '#3b2412', '#7a4a1a', '#d9b26a', '#111111', '#a0a0a0'];

export function randomLook(r = Math.random) {
  const p = (a) => a[Math.floor(r() * a.length)];
  return { skin: p(SKINS), shirt: p(SHIRTS), pants: p(PANTS), hair: p(HAIRS), shoes: p(['#222', '#f4f4f4', '#7a4a2a', '#c0392b']), female: r() < 0.5, hat: r() < 0.15, shorts: r() < 0.35 };
}

export function buildHumanoid(look) {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torsoMat = look.shirtTex ? mat(look.shirt, { map: look.shirtTex }) : mat(look.shirt);
  const torso = new THREE.Mesh(geo('torso' + (look.female ? 'f' : ''), () => new THREE.BoxGeometry(look.female ? 0.4 : 0.46, 0.6, 0.25).translate(0, 0.32, 0)), torsoMat);
  torso.castShadow = true;
  hips.add(torso);
  const pelvis = new THREE.Mesh(geo('pelvis', () => new THREE.BoxGeometry(0.4, 0.16, 0.24).translate(0, 0.0, 0)), mat(look.pants));
  hips.add(pelvis);
  const neck = new THREE.Group(); neck.position.y = 0.66; hips.add(neck);
  const head = new THREE.Mesh(geo('head', () => new THREE.BoxGeometry(0.24, 0.27, 0.25).translate(0, 0.15, 0)), mat(look.skin));
  head.castShadow = true;
  neck.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(geo('eye', () => new THREE.BoxGeometry(0.045, 0.03, 0.01)), mat('#1a1a1a'));
    eye.position.set(s * 0.055, 0.18, 0.127); neck.add(eye);
  }
  const mouth = new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.08, 0.015, 0.01)), mat('#7a3b2e'));
  mouth.position.set(0, 0.08, 0.127); neck.add(mouth);
  const hair = new THREE.Mesh(geo('hair' + (look.female ? 'f' : ''), () => (look.female ? new THREE.BoxGeometry(0.27, 0.22, 0.28).translate(0, 0.24, -0.03) : new THREE.BoxGeometry(0.26, 0.08, 0.27).translate(0, 0.3, -0.01))), mat(look.hair));
  neck.add(hair);
  if (look.female) {
    const back = new THREE.Mesh(geo('hairback', () => new THREE.BoxGeometry(0.26, 0.3, 0.06).translate(0, 0.1, -0.14)), mat(look.hair));
    neck.add(back);
  }
  if (look.hat) {
    const hat = new THREE.Mesh(geo('cap', () => new THREE.BoxGeometry(0.27, 0.08, 0.36).translate(0, 0.32, 0.04)), mat(look.capColor || '#c0392b'));
    neck.add(hat);
  }
  if (look.glasses) {
    const g = new THREE.Mesh(geo('glasses', () => new THREE.BoxGeometry(0.25, 0.06, 0.03).translate(0, 0.19, 0.13)), mat('#0a0a0a', { metalness: 0.8, roughness: 0.2 }));
    neck.add(g);
  }
  const mkArm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * (look.female ? 0.26 : 0.3), 0.58, 0); hips.add(sh);
    const up = new THREE.Mesh(geo('arm', () => new THREE.BoxGeometry(0.12, 0.34, 0.12).translate(0, -0.15, 0)), torsoMat);
    sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    const lo = new THREE.Mesh(geo('farm', () => new THREE.BoxGeometry(0.11, 0.32, 0.11).translate(0, -0.15, 0)), mat(look.skin));
    el.add(lo);
    up.castShadow = lo.castShadow = true;
    return { sh, el };
  };
  const mkLeg = (s) => {
    const hp = new THREE.Group(); hp.position.set(s * 0.11, -0.04, 0); hips.add(hp);
    const up = new THREE.Mesh(geo('thigh', () => new THREE.BoxGeometry(0.16, 0.46, 0.18).translate(0, -0.22, 0)), mat(look.pants));
    hp.add(up);
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    const lo = new THREE.Mesh(geo('shin', () => new THREE.BoxGeometry(0.15, 0.44, 0.16).translate(0, -0.22, 0)), mat(look.shorts ? look.skin : look.pants));
    kn.add(lo);
    const shoe = new THREE.Mesh(geo('shoe', () => new THREE.BoxGeometry(0.16, 0.1, 0.28).translate(0, -0.44, 0.05)), mat(look.shoes));
    kn.add(shoe);
    up.castShadow = lo.castShadow = true;
    return { hp, kn };
  };
  const armL = mkArm(1), armR = mkArm(-1), legL = mkLeg(1), legR = mkLeg(-1);
  return { root, hips, torso, neck, armL, armR, legL, legR, phase: Math.random() * 6 };
}

// state: idle | walk | run | jump | sit | ride | down | dead | punch | shoot | swim | fall
export function animate(h, state, speed, dt, extra = 0) {
  const r = h.root;
  h.phase += dt * (state === 'run' ? 11 : state === 'walk' ? 7.5 * Math.max(0.6, speed / 1.5) : state === 'swim' ? 3.5 : 2);
  const p = h.phase;
  let aL = 0, aR = 0, lL = 0, lR = 0, kL = 0, kR = 0, eL = -0.15, eR = -0.15, lean = 0, hy = 0.95, bob = 0, armSpreadL = 0, armSpreadR = 0;
  let legSpreadL = 0, legSpreadR = 0;   // bacağın kalçadan yana açılması (ata binişte)
  r.rotation.x = 0; r.rotation.z = 0;
  switch (state) {
    case 'walk': {
      const s = Math.sin(p);
      lL = s * 0.55; lR = -s * 0.55; aL = -s * 0.45; aR = s * 0.45;
      kL = Math.max(0, -Math.cos(p)) * 0.6; kR = Math.max(0, Math.cos(p)) * 0.6;
      bob = Math.abs(Math.cos(p)) * 0.04; break;
    }
    case 'run': {
      const s = Math.sin(p);
      lL = s * 0.95; lR = -s * 0.95; aL = -s * 0.9; aR = s * 0.9; eL = eR = -1.3;
      kL = Math.max(0, -Math.cos(p)) * 1.3 + 0.2; kR = Math.max(0, Math.cos(p)) * 1.3 + 0.2;
      lean = 0.18; bob = Math.abs(Math.cos(p)) * 0.08; break;
    }
    case 'flee': {
      const s = Math.sin(p);
      lL = s * 0.95; lR = -s * 0.95; aL = -2.6 + s * 0.3; aR = -2.6 - s * 0.3; eL = eR = -0.6;
      kL = Math.max(0, -Math.cos(p)) * 1.3 + 0.2; kR = Math.max(0, Math.cos(p)) * 1.3 + 0.2;
      lean = 0.12; bob = Math.abs(Math.cos(p)) * 0.08; break;
    }
    case 'jump': lL = -0.5; lR = 0.3; kL = 0.9; kR = 0.3; aL = -2.2; aR = -2.0; eL = eR = -0.3; break;
    case 'fall': lL = 0.4; lR = -0.4; aL = -2.8; aR = -2.6; break;
    case 'sit': lL = lR = -1.45; kL = kR = 1.45; aL = aR = -0.9; eL = eR = -0.5; hy = 0.5; break;
    case 'ride': lL = lR = -1.0; kL = kR = 1.2; aL = aR = -1.15; eL = eR = -0.3; lean = 0.35; hy = 0.75; armSpreadL = 0.25; armSpreadR = -0.25; break;
    // ata binmiş: bacaklar iki yana açık, dizler bükük (baldırlar atın gövdesini sarar), kollar dizginde; at koşunca hafif zıplar
    case 'horse': lL = lR = -0.45; kL = kR = 0.85; legSpreadL = 0.55; legSpreadR = -0.55; aL = aR = -0.85; eL = eR = -0.75; armSpreadL = 0.12; armSpreadR = -0.12; lean = 0.12 + extra * 0.12; hy = 0.5; bob = Math.abs(Math.sin(h.phase * 2.2)) * 0.06 * extra; break;
    case 'boat': lL = lR = -0.25; kL = kR = 0.4; aL = aR = -1.1; eL = eR = -0.5; lean = 0.1; hy = 0.85; armSpreadL = 0.2; armSpreadR = -0.2; break;
    case 'punch': {
      const t = extra; // 0..1
      const k = Math.sin(Math.min(1, t) * Math.PI);
      aR = -1.55 * k - 0.2; eR = -0.1; aL = -0.9; eL = -1.7; lean = 0.15 * k; lL = 0.3; lR = -0.3; kR = 0.2; break;
    }
    case 'slash': {   // kılıç: kol baş üstünden öne-aşağı iner
      const t = Math.min(1, extra);
      const k = t < 0.3 ? t / 0.3 : 1;          // önce kaldır
      const s = t < 0.3 ? 0 : (t - 0.3) / 0.7;  // sonra savur
      aR = -2.8 * k + 2.3 * s; eR = -0.35 + 0.25 * s; armSpreadR = -0.35 * (1 - s);
      aL = -0.5; eL = -0.9; lean = 0.05 + 0.2 * s; lL = 0.35; lR = -0.3; kR = 0.25; break;
    }
    case 'bow': {     // yay: sol kol ileri (yay), sağ kol kirişi çeker
      const t = Math.min(1, extra);
      aL = -1.55; eL = 0; armSpreadL = 0.15; aR = -1.45; eR = -1.6 + 0.9 * t; armSpreadR = -0.2; lL = 0.3; lR = -0.25; break;
    }
    case 'shoot': aR = -1.55; eR = 0; aL = -1.3; eL = -0.4; armSpreadL = -0.5; break;
    case 'swim': {
      const s = Math.sin(p);
      r.rotation.x = 1.2; aL = -2.8 + s * 1.2; aR = -2.8 - s * 1.2; lL = s * 0.4; lR = -s * 0.4; hy = 0.95; break;
    }
    case 'hands': aL = aR = -2.9; eL = eR = -0.3; break;
    case 'down': case 'dead':
      r.rotation.x = -Math.PI / 2; aL = -2.8; aR = -0.4; lL = 0.2; lR = -0.1; kL = 0.3; hy = 0.95; armSpreadL = 0.5; armSpreadR = -0.6; break;
    default: { // idle
      const s = Math.sin(p * 0.8);
      aL = s * 0.03; aR = -s * 0.03; bob = s * 0.01; armSpreadL = 0.08; armSpreadR = -0.08;
    }
  }
  const k = 1 - Math.exp(-dt * 18);
  const L = (o, v) => o + (v - o) * k;
  h.armL.sh.rotation.x = L(h.armL.sh.rotation.x, aL); h.armR.sh.rotation.x = L(h.armR.sh.rotation.x, aR);
  h.armL.sh.rotation.z = L(h.armL.sh.rotation.z, armSpreadL); h.armR.sh.rotation.z = L(h.armR.sh.rotation.z, armSpreadR);
  h.armL.el.rotation.x = L(h.armL.el.rotation.x, eL); h.armR.el.rotation.x = L(h.armR.el.rotation.x, eR);
  h.legL.hp.rotation.x = L(h.legL.hp.rotation.x, lL); h.legR.hp.rotation.x = L(h.legR.hp.rotation.x, lR);
  h.legL.kn.rotation.x = L(h.legL.kn.rotation.x, kL); h.legR.kn.rotation.x = L(h.legR.kn.rotation.x, kR);
  h.legL.hp.rotation.z = L(h.legL.hp.rotation.z, legSpreadL); h.legR.hp.rotation.z = L(h.legR.hp.rotation.z, legSpreadR);
  h.hips.rotation.x = L(h.hips.rotation.x, lean);
  h.hips.position.y = hy + bob;
}
