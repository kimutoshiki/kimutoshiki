// Each placement gets its own transform hierarchy and joints. GPU geometry and
// decoded images are shared by placements of the same Blender export.
import { GLTFLoader } from '../js/vendor/GLTFLoader.js';
import { clone as cloneRig } from '../js/vendor/SkeletonUtils.js';

const library = new Map();
const directory = new URL('../assets/models/blender/', import.meta.url);
const abortError = () => new DOMException('Asset request cancelled', 'AbortError');

function releaseSource(asset) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  asset.scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [].concat(node.material || [])) materials.add(material);
    node.skeleton?.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) {texture.dispose(); texture.image?.close?.();}
}

async function readAsset(key, signal) {
  const revision = key === 'study-room' ? '20261118-study2' : 'atelier1';
  const response = await fetch(new URL(key + '.glb?v=' + revision, directory), {signal});
  if (!response.ok) throw new Error(key + ' model: HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  const header = new DataView(bytes);
  if (bytes.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid Blender model: ' + key);
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,header.getUint32(12,true))));
  const loader = new GLTFLoader();
  let decoder;
  try {
    if (metadata.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
      const { DRACOLoader } = await import('../js/vendor/DRACOLoader.js');
      decoder = new DRACOLoader().setDecoderPath(new URL('../js/vendor/draco/', import.meta.url).href).setWorkerLimit(2);
      loader.setDRACOLoader(decoder);
    }
    return await loader.parseAsync(bytes, directory.href);
  } finally {decoder?.dispose();}
}

export async function loadBlenderAsset(key, {signal} = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error('Invalid model key');
  if (signal?.aborted) throw abortError();
  let entry = library.get(key);
  if (!entry) {
    entry = {count:0, abort:new AbortController(), source:null};
    entry.pending = readAsset(key, entry.abort.signal).then(source => {
      if (entry.count === 0) {releaseSource(source); throw abortError();}
      entry.source = source;
      return source;
    });
    library.set(key, entry);
  }
  entry.count++;
  let released = false, cancel;
  const release = () => {
    if (released) return;
    released = true;
    if (--entry.count) return;
    if (library.get(key) === entry) library.delete(key);
    entry.abort.abort();
    if (entry.source) releaseSource(entry.source);
  };
  try {
    const pending = signal ? Promise.race([entry.pending, new Promise((_,reject) => {
      cancel = () => reject(abortError());
      signal.addEventListener('abort', cancel, {once:true});
    })]) : entry.pending;
    const source = await pending;
    const scene = cloneRig(source.scene);
    const instances = new Map();
    function own(material) {
      if (!instances.has(material)) instances.set(material, material.clone());
      return instances.get(material);
    }
    scene.traverse(node => {
      if (node.material) node.material = Array.isArray(node.material) ? node.material.map(own) : own(node.material);
    });
    return {scene, animations:source.animations, dispose() {
      if (released) return;
      scene.traverse(node => node.skeleton?.dispose());
      for (const material of instances.values()) material.dispose();
      release();
    }};
  } catch (error) {release(); throw error;}
  finally {if (cancel) signal.removeEventListener('abort',cancel);}
}
