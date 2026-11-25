// FBX dosyalarını okuyup nesne/boyut bilgisi döker
import fs from 'node:fs';
import path from 'node:path';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

export function loadFBX(file) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new FBXLoader().parse(ab, path.dirname(file) + '/');
}
if (process.argv[1].endsWith('probe.mjs')) {
  const dir = process.argv[2];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.fbx'))) {
    const root = loadFBX(path.join(dir, f));
    root.updateMatrixWorld(true);
    console.log('==', f, 'rootScale', root.scale.toArray());
    root.traverse((o) => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o);
      const g = o.geometry;
      const uv = g.attributes.uv;
      let umin = 9, umax = -9, vmin = 9, vmax = -9;
      for (let i = 0; i < uv.count; i++) { umin = Math.min(umin, uv.getX(i)); umax = Math.max(umax, uv.getX(i)); vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i)); }
      console.log(o.name, 'tris', (g.index ? g.index.count : g.attributes.position.count) / 3, 'mats', Array.isArray(o.material) ? o.material.length : 1,
        'min', b.min.toArray().map((v) => v.toFixed(2)).join(','), 'max', b.max.toArray().map((v) => v.toFixed(2)).join(','),
        'uv', [umin, umax, vmin, vmax].map((v) => v.toFixed(2)).join(','), 'pos', o.position.toArray().map((v) => v.toFixed(2)).join(','), 'rot', o.rotation.toArray().slice(0, 3).map((v) => v.toFixed(2)).join(','));
    });
  }
}
