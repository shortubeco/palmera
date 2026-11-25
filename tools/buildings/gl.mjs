import fs from 'fs'; import path from 'path';
export function loadPiece(src, name) {
  const g = JSON.parse(fs.readFileSync(path.join(src, name + '.gltf'), 'utf8'));
  const bin = fs.readFileSync(path.join(src, g.buffers[0].uri));
  const read = (ai) => {
    const a = g.accessors[ai], bv = g.bufferViews[a.bufferView];
    const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const sz = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[a.componentType];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || nc * sz;
    const out = new Float64Array(a.count * nc);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < nc; c++) {
      const o = base + i * stride + c * sz;
      out[i * nc + c] = a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5123 ? bin.readUInt16LE(o) : a.componentType === 5125 ? bin.readUInt32LE(o) : bin[o];
    }
    return out;
  };
  const prims = [];
  for (const p of g.meshes[0].primitives) prims.push({ mat: g.materials[p.material].name, P: read(p.attributes.POSITION), N: read(p.attributes.NORMAL), UV: p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null, I: read(p.indices) });
  return prims;
}
