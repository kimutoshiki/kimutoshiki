import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { DataTexture, LoadingManager } from '../../js/vendor/three.module.min.js';
import { GLTFLoader } from '../../js/vendor/GLTFLoader.js';
import { DRACOLoader } from '../../js/vendor/DRACOLoader.js';

let decoderReady;
async function localDecoder() {
  decoderReady ||= (async () => {
    const [source, wasmBinary] = await Promise.all([
      readFile(new URL('../../js/vendor/draco/draco_wasm_wrapper.js', import.meta.url), 'utf8'),
      readFile(new URL('../../js/vendor/draco/draco_decoder.wasm', import.meta.url)),
    ]);
    // No fetch, require, process, or DOM is exposed. The bundled WASM is supplied explicitly.
    const sandbox = { WebAssembly, TextDecoder, TextEncoder, console, setTimeout, clearTimeout };
    runInNewContext(source, sandbox, { filename: 'local-draco-wasm-wrapper.js', timeout: 5000 });
    return new Promise((resolve, reject) => {
      const pending = sandbox.DracoDecoderModule({
        wasmBinary,
        onModuleLoaded: draco => resolve({ draco }),
        onAbort: reason => reject(new Error('Local Draco initialization failed: ' + reason)),
      });
      pending?.catch(reject);
    });
  })();
  return decoderReady;
}

const arrayTypes = {
  Float32Array: [Float32Array, 'DT_FLOAT32'],
  Int8Array: [Int8Array, 'DT_INT8'], Int16Array: [Int16Array, 'DT_INT16'], Int32Array: [Int32Array, 'DT_INT32'],
  Uint8Array: [Uint8Array, 'DT_UINT8'], Uint16Array: [Uint16Array, 'DT_UINT16'], Uint32Array: [Uint32Array, 'DT_UINT32'],
};

/** Mirrors the vendored r185 worker's typed attributes and four-byte stride alignment. */
function decodeGeometryData(draco, buffer, config) {
  const decoder = new draco.Decoder(), bytes = new Int8Array(buffer);
  let mesh;
  try {
    const kind = decoder.GetEncodedGeometryType(bytes);
    if (kind !== draco.TRIANGULAR_MESH && kind !== draco.POINT_CLOUD) throw new Error('Unsupported Draco geometry type');
    mesh = kind === draco.TRIANGULAR_MESH ? new draco.Mesh() : new draco.PointCloud();
    const status = kind === draco.TRIANGULAR_MESH
      ? decoder.DecodeArrayToMesh(bytes, bytes.byteLength, mesh)
      : decoder.DecodeArrayToPointCloud(bytes, bytes.byteLength, mesh);
    if (!status.ok() || !mesh.ptr) throw new Error('Draco decode failed: ' + status.error_msg());
    const data = { attributes: [], index: null };
    for (const [name, id] of Object.entries(config.attributeIDs)) {
      const type = arrayTypes[config.attributeTypes[name]];
      if (!type) throw new Error('Unsupported Draco attribute component type: ' + config.attributeTypes[name]);
      const [TypedArray, dracoType] = type;
      const attribute = decoder.GetAttributeByUniqueId(mesh, id);
      if (!attribute?.ptr) throw new Error('Missing Draco attribute: ' + name);
      const count = mesh.num_points(), itemSize = attribute.num_components();
      const sourceStrideBytes = itemSize * TypedArray.BYTES_PER_ELEMENT;
      const stride = Math.ceil(sourceStrideBytes / 4) * 4 / TypedArray.BYTES_PER_ELEMENT;
      const sourceBytes = count * sourceStrideBytes, pointer = draco._malloc(sourceBytes);
      let array;
      try {
        const ok = decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, draco[dracoType], sourceBytes, pointer);
        if (!ok) throw new Error('Unable to decode Draco attribute: ' + name);
        const source = new TypedArray(draco.HEAPF32.buffer, pointer, count * itemSize);
        if (stride === itemSize) array = source.slice();
        else {
          array = new TypedArray(count * stride);
          for (let i = 0; i < count; i++) array.set(source.subarray(i * itemSize, (i + 1) * itemSize), i * stride);
        }
      } finally { draco._free(pointer); }
      data.attributes.push({ name, array, itemSize, stride, count, ...(name === 'color' ? { vertexColorSpace: config.vertexColorSpace } : {}) });
    }
    if (kind === draco.TRIANGULAR_MESH) {
      const count = mesh.num_faces() * 3, byteLength = count * 4, pointer = draco._malloc(byteLength);
      try {
        if (!decoder.GetTrianglesUInt32Array(mesh, byteLength, pointer)) throw new Error('Unable to decode Draco triangle indices');
        data.index = { array: new Uint32Array(draco.HEAPF32.buffer, pointer, count).slice(), itemSize: 1 };
      } finally { draco._free(pointer); }
    }
    return data;
  } finally {
    if (mesh) draco.destroy(mesh);
    draco.destroy(decoder);
  }
}

class LocalDracoLoader extends DRACOLoader {
  preload() { return this; }
  async decodeGeometry(buffer, config) {
    const { draco } = await localDecoder();
    // Use the actual browser loader's attribute construction and vertex color conversion.
    return this._createGeometry(decodeGeometryData(draco, buffer, config));
  }
}

/** Fresh real glTF scene, bones, skin weights and animation clips; only image pixels are placeholders. */
export async function loadTabbyFixture(file = 'room') {
  if (file === 'room' || file === 'full') file = new URL(file === 'full' ? '../../models/tabby-cat.glb' : '../../models/tabby-cat-room.glb', import.meta.url);
  const bytes = await readFile(file);
  const manager = new LoadingManager();
  manager.setURLModifier(url => { throw new Error('Fixture attempted external resource loading: ' + url); });
  const loader = new GLTFLoader(manager).setDRACOLoader(new LocalDracoLoader(manager));
  loader.register(parser => {
    // Scoped to this parser: no global DOM stubs or shared loader prototype changes.
    parser.loadImageSource = async sourceIndex => {
      const source = parser.json.images[sourceIndex];
      const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      texture.needsUpdate = true;
      texture.userData = { ...source.extras, mimeType: source.mimeType, fixtureImagePlaceholder: true, sourceIndex };
      return texture;
    };
    return { name: 'NodeFixtureImagePixels' };
  });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loader.parseAsync(buffer, '');
}
