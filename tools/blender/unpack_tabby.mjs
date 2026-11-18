// Convert the owner's compressed source to a temporary, ordinary GLB for
// Blender distributions lacking the optional Draco IO extension.
import fs from 'node:fs/promises';
import vm from 'node:vm';

const [source, target] = process.argv.slice(2);
const dracoRoot = new URL('../../js/vendor/draco/', import.meta.url);
const header = await fs.readFile(source);
const jsonLength = header.readUInt32LE(12);
const gltf = JSON.parse(header.subarray(20,20 + jsonLength));
const binary = header.subarray(28 + jsonLength);
const sandbox = { WebAssembly, TextEncoder, TextDecoder, console, setTimeout, clearTimeout };
vm.runInNewContext(await fs.readFile(new URL('draco_wasm_wrapper.js',dracoRoot),'utf8'), sandbox);
const binaryDecoder = await fs.readFile(new URL('draco_decoder.wasm',dracoRoot));
const library = await new Promise((resolve,reject) => sandbox.DracoDecoderModule({
  wasmBinary: binaryDecoder, onModuleLoaded: resolve, onAbort: reject
}));
const types = {
  5121: ['DT_UINT8',Uint8Array], 5123: ['DT_UINT16',Uint16Array],
  5125: ['DT_UINT32',Uint32Array], 5126: ['DT_FLOAT32',Float32Array]
};
const pieces = [binary];
let end = binary.length;
function append(accessor, bytes) {
  const pad = (4 - end % 4) % 4;
  if (pad) {pieces.push(Buffer.alloc(pad)); end += pad;}
  accessor.bufferView = gltf.bufferViews.length;
  delete accessor.byteOffset;
  gltf.bufferViews.push({buffer:0,byteOffset:end,byteLength:bytes.length});
  pieces.push(bytes); end += bytes.length;
}
for (const mesh of gltf.meshes) for (const part of mesh.primitives) {
  const encoded = part.extensions?.KHR_draco_mesh_compression;
  if (!encoded) continue;
  const v=gltf.bufferViews[encoded.bufferView];
  const buffer=binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  const decoder = new library.Decoder(), geometry = new library.Mesh();
  try {
    const status = decoder.DecodeArrayToMesh(new Int8Array(buffer), buffer.byteLength, geometry);
    if (!status.ok()) throw Error(status.error_msg());
    for (const [name, id] of Object.entries(encoded.attributes)) {
      const att=decoder.GetAttributeByUniqueId(geometry,id), accessor=gltf.accessors[part.attributes[name]];
      const [type,ArrayType]=types[accessor.componentType];
      const size=geometry.num_points()*att.num_components()*ArrayType.BYTES_PER_ELEMENT;
      const ptr=library._malloc(size);
      if(!decoder.GetAttributeDataArrayForAllPoints(geometry,att,library[type],size,ptr)) throw Error(name);
      append(accessor,Buffer.from(library.HEAPU8.slice(ptr,ptr+size)));library._free(ptr);
    }
    const count=geometry.num_faces()*3;
    const ptr=library._malloc(count*4);decoder.GetTrianglesUInt32Array(geometry,count*4,ptr);
    const accessor=gltf.accessors[part.indices], [,ArrayType]=types[accessor.componentType];
    append(accessor,Buffer.from(new ArrayType(new Uint32Array(library.HEAPU8.buffer,ptr,count)).buffer));
    library._free(ptr);
    delete part.extensions.KHR_draco_mesh_compression;
    if (!Object.keys(part.extensions).length) delete part.extensions;
  } finally {library.destroy(geometry);library.destroy(decoder);}
}
for (const tex of gltf.textures) if (tex.extensions?.EXT_texture_webp) {
  tex.source=tex.extensions.EXT_texture_webp.source;delete tex.extensions.EXT_texture_webp;
  if (!Object.keys(tex.extensions).length) delete tex.extensions;
}
for (const key of ['extensionsRequired','extensionsUsed']) {
  gltf[key]=(gltf[key]||[]).filter(n=>!['KHR_draco_mesh_compression','EXT_texture_webp'].includes(n));
  if(!gltf[key].length)delete gltf[key];
}
const total=(end+3)&~3;
gltf.buffers[0].byteLength=total;
const json=Buffer.from(JSON.stringify(gltf)), jsonSize=(json.length+3)&~3;
const out=Buffer.alloc(28+jsonSize+total);
out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
out.writeUInt32LE(jsonSize,12);out.write('JSON',16);out.fill(32,20,20+jsonSize);json.copy(out,20);
out.writeUInt32LE(total,20+jsonSize);out.write('BIN\0',24+jsonSize);
Buffer.concat(pieces).copy(out,28+jsonSize);
await fs.writeFile(target,out);
