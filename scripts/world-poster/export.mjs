import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoURL = new URL('../../', import.meta.url);
const repo = fileURLToPath(repoURL);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/world-poster/export.mjs [--out DIRECTORY]');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) {
  throw new Error('Expected --out DIRECTORY; use --help for usage.');
}
const out = path.resolve(args[1] || path.join(repo, 'work/world-poster'));
await mkdir(path.join(out, 'textures'), { recursive: true });
const fromRepo = file => import(new URL(file, repoURL).href);
const T = await fromRepo('js/vendor/three.module.min.js');

function canvas(width = 300, height = 150) {
  const result = createCanvas(width, height);
  result.style = {};
  return result;
}

// The real modules use CanvasTexture and TextureLoader, without needing a DOM.
globalThis.document = {
  fonts: { ready: Promise.resolve() },
  createElement: () => canvas(),
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
const pending = new Set(), errors = [];
T.TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  const texture = new T.Texture();
  const local = String(url).startsWith('file:')
    ? fileURLToPath(url)
    : path.join(repo, String(url).replace(/^\//, ''));
  const job = loadImage(local).then(image => {
    texture.image = image;
    texture.needsUpdate = true;
    onLoad?.(texture);
  }).catch(error => {
    errors.push(`${local}: ${error.message}`);
    onError?.(error);
  }).finally(() => pending.delete(job));
  pending.add(job);
  return texture;
};

const { createWorldLandscape } = await fromRepo('scene/world-landscape.js');
const { createWorldLandmarks } = await fromRepo('scene/world-landmarks.js');
const { loadSurfaceMaterials } = await fromRepo('scene/surface-materials.js');
const { createHomeInterior } = await fromRepo('scene/home-interior.js');
const layout = await fromRepo('scene/world-layout.js');
const scene = new T.Group();
const landscape = createWorldLandscape(T, {});
const landmarks = await createWorldLandmarks(T, {});
scene.add(landscape.group, landmarks.group);
loadSurfaceMaterials(T, landmarks.group);

// Decode the original rig with the existing Draco fixture helper. Its test
// images are placeholders, so restore every image from the actual GLB BIN.
const { loadTabbyFixture } = await fromRepo('scripts/helpers/load-tabby-fixture.mjs');
const asset = await loadTabbyFixture('room');
const bytes = await readFile(path.join(repo, 'models/tabby-cat-room.glb'));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binOffset = 28 + jsonLength;
const images = new Map();
for (let i = 0; i < gltf.images.length; i++) {
  const view = gltf.bufferViews[gltf.images[i].bufferView];
  const start = binOffset + (view.byteOffset || 0);
  const image = await loadImage(bytes.subarray(start, start + view.byteLength));
  const surface = canvas(image.width, image.height), ctx = surface.getContext('2d');
  ctx.drawImage(image, 0, 0);
  images.set(i, {
    data: ctx.getImageData(0, 0, image.width, image.height).data,
    width: image.width,
    height: image.height,
  });
}
asset.scene.traverse(object => {
  const materials = Array.isArray(object.material)
    ? object.material : object.material ? [object.material] : [];
  for (const material of materials) {
    for (const texture of Object.values(material)) {
      if (texture?.isTexture && images.has(texture.userData.sourceIndex)) {
        texture.image = images.get(texture.userData.sourceIndex);
        texture.needsUpdate = true;
      }
    }
  }
});
const home = createHomeInterior(T, { catAsset: asset });
await home.loadMiniatures();
home.refine();
scene.add(home.group);
loadSurfaceMaterials(T, home.group);
const cat = home.cat.group;
cat.scale.setScalar(1 / (1.8 * layout.HOME.scale));
home.cat.mixer?.update(.8);
while (pending.size) await Promise.all([...pending]);
if (errors.length) throw new Error(errors.join('\n'));
scene.updateMatrixWorld(true);

const geometries = [], materials = [], textures = [], objects = [], chunks = [];
const geometryIds = new Map(), materialIds = new Map(), textureIds = new Map();
let offset = 0;
function addArray(array) {
  const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const spec = { offset, bytes: buffer.length, length: array.length, type: array.constructor.name };
  chunks.push(buffer);
  offset += buffer.length;
  return spec;
}

async function textureId(texture) {
  if (!texture?.image) return null;
  if (textureIds.has(texture.uuid)) return textureIds.get(texture.uuid);
  const id = textures.length;
  textures.push(null);
  textureIds.set(texture.uuid, id);
  const source = texture.image;
  const width = source.width || source.naturalWidth, height = source.height || source.naturalHeight;
  const surface = canvas(width, height), ctx = surface.getContext('2d');
  // Native canvas also exposes a .data() method; only typed arrays are pixels.
  if (ArrayBuffer.isView(source.data)) {
    const rgba = ctx.createImageData(width, height);
    const channels = source.data.length / (width * height);
    const scale = source.data instanceof Float32Array ? 255 : 1;
    for (let i = 0; i < width * height; i++) {
      for (let k = 0; k < 3; k++) {
        rgba.data[i * 4 + k] = source.data[i * channels + Math.min(k, channels - 1)] * scale;
      }
      rgba.data[i * 4 + 3] = channels === 4 ? source.data[i * channels + 3] * scale : 255;
    }
    ctx.putImageData(rgba, 0, 0);
  } else ctx.drawImage(source, 0, 0, width, height);
  const file = `textures/texture-${id}.png`;
  const pixels = surface.toBuffer('image/png');
  await writeFile(path.join(out, file), pixels);
  textures[id] = {
    id, file, width, height, sha256: createHash('sha256').update(pixels).digest('hex'),
    repeat: texture.repeat.toArray(), offset: texture.offset.toArray(),
    rotation: texture.rotation, flipY: texture.flipY, colorspace: texture.colorSpace,
  };
  return id;
}

async function materialId(material, tint) {
  const key = material.uuid + (tint ? ':' + tint.toArray().join(',') : '');
  if (materialIds.has(key)) return materialIds.get(key);
  const id = materials.length;
  materials.push(null);
  materialIds.set(key, id);
  const color = material.color?.clone() || new T.Color(1, 1, 1);
  if (tint) color.multiply(tint);
  materials[id] = {
    id, name: material.name || `material-${id}`, color: color.toArray(),
    unlit: !!material.isMeshBasicMaterial, alphaTest: material.alphaTest || 0,
    roughness: material.roughness ?? 1, metalness: material.metalness ?? 0,
    opacity: material.opacity ?? 1, transparent: !!material.transparent, side: material.side,
    emissive: material.emissive?.toArray() || [0, 0, 0],
    emissiveIntensity: material.emissiveIntensity ?? 0, clearcoat: material.clearcoat || 0,
    bumpScale: material.bumpScale || 0, normalScale: material.normalScale?.toArray(),
    vertexColors: !!material.vertexColors,
    map: await textureId(material.map), bumpMap: await textureId(material.bumpMap),
    normalMap: await textureId(material.normalMap), roughnessMap: await textureId(material.roughnessMap),
    alphaMap: await textureId(material.alphaMap),
  };
  return id;
}

function geometryId(object) {
  const geometry = object.geometry;
  const key = geometry.uuid + (object.isSkinnedMesh ? ':' + object.uuid : '');
  if (geometryIds.has(key)) return geometryIds.get(key);
  const id = geometries.length;
  geometryIds.set(key, id);
  const { position, normal, uv, color } = geometry.attributes;
  const positions = new Float32Array(position.count * 3);
  const normals = normal ? new Float32Array(position.count * 3) : null;
  const uvs = uv ? new Float32Array(position.count * 2) : null;
  const colors = color ? new Float32Array(position.count * 3) : null;
  const v = new T.Vector3();
  for (let i = 0; i < position.count; i++) {
    if (object.isSkinnedMesh) object.getVertexPosition(i, v);
    else v.fromBufferAttribute(position, i);
    if (object.userData.worldSea) {
      // Evaluate the production ocean vertex shader at time0.
      const phaseA = v.x * .038 + v.y * .023, phaseB = v.x * .071 - v.y * .052;
      v.z += Math.sin(phaseA) * .16 + Math.sin(phaseB) * .075;
      positions.set(v.toArray(), i * 3);
      if (normal) {
        v.set(-Math.cos(phaseA) * .00608 - Math.cos(phaseB) * .005325,
          -Math.cos(phaseA) * .00368 + Math.cos(phaseB) * .0039, 1).normalize();
        normals.set(v.toArray(), i * 3);
      }
    } else {
      positions.set(v.toArray(), i * 3);
      if (normal) normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
    }
    if (uv) uvs.set([uv.getX(i), uv.getY(i)], i * 2);
    if (color) colors.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3);
  }
  const indices = geometry.index
    ? Uint32Array.from({ length: geometry.index.count }, (_, i) => geometry.index.getX(i))
    : Uint32Array.from({ length: position.count }, (_, i) => i);
  geometries.push({
    id, name: geometry.name || object.name, positions: addArray(positions),
    normals: normals && !object.isSkinnedMesh ? addArray(normals) : null,
    uvs: uvs ? addArray(uvs) : null, colors: colors ? addArray(colors) : null,
    indices: addArray(indices), groups: geometry.groups,
  });
  return id;
}

const meshes = [];
scene.traverseVisible(object => { if (object.isMesh) meshes.push(object); });
const matrix = new T.Matrix4(), tint = new T.Color();
function isCat(object) {
  for (let parent = object; parent; parent = parent.parent) if (parent === cat) return true;
  return false;
}
for (const object of meshes) {
  const geometry = geometryId(object);
  const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
  for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
    let color;
    if (object.isInstancedMesh) {
      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);
      if (object.instanceColor) { object.getColorAt(i, tint); color = tint; }
    } else matrix.copy(object.matrixWorld);
    objects.push({
      name: object.name || object.parent?.name || 'World mesh', geometry,
      matrix: matrix.toArray(),
      materials: await Promise.all(sourceMaterials.map(material => materialId(material))),
      instanceColor: color?.toArray() || [1,1,1],
      castShadow: object.castShadow, receiveShadow: object.receiveShadow, cat: isCat(object),
    });
  }
}
const sourceHashes = {};
for (const name of (await readdir(path.join(repo, 'scene'))).filter(name => name.endsWith('.js') && !name.includes('world-chunk') && !name.includes('.bundle.'))) {
  const file = `scene/${name}`;
  sourceHashes[file] = createHash('sha256').update(await readFile(path.join(repo, file))).digest('hex');
}
for (const file of ['js/models/okuma-auditorium.js', 'js/models/okuma-statue.js', 'js/models/karatsu-castle.js', 'js/models/karatsu-bank.js', 'models/tabby-cat-room.glb', 'scripts/world-poster/export.mjs', 'scripts/world-poster/render.py', 'scripts/world-poster/encode.mjs']) {
  sourceHashes[file] = createHash('sha256').update(await readFile(path.join(repo, file))).digest('hex');
}
const lights = [];
const roomFill = new T.PointLight('#ffe4bd', 2.3, 8, 1); roomFill.position.set(.2, 2.12, 1.25);
scene.add(roomFill);
scene.updateMatrixWorld(true);
scene.traverseVisible(object => {
  if (!object.isLight) return;
  const position = object.getWorldPosition(new T.Vector3()).toArray();
  lights.push({type: object.type, name: object.name, position, color: object.color.toArray(), intensity: object.intensity, distance: object.distance, decay: object.decay});
});
const skyCanvas = canvas(256, 128), skyContext = skyCanvas.getContext('2d');
const gradient = skyContext.createLinearGradient(0, 0, 0, 128);
for (const [offset, color] of [[0,'#91adb5'],[.43,'#cfdbd7'],[.51,'#eee9da'],[.65,'#8f9b7c'],[1,'#596449']]) gradient.addColorStop(offset, color);
skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 256, 128);
await writeFile(path.join(out, 'sky.png'), skyCanvas.toBuffer('image/png'));
const camera = layout.REVIEW_VIEWS.interior;
const data = {
  geometries, materials, textures, objects, lights, sourceHashes,
  landscapeStats: landscape.stats, landmarkStats: landmarks.stats, homeMetadata: home.metadata,
  camera, mobileCamera: {...camera, fov: layout.worldFov(650 / 1000)}, environment: {file: 'sky.png', indirectStrength: .65, cameraStrength: 1},
  reviewViews: {
    doorway: layout.REVIEW_VIEWS.doorway,
    exterior: layout.REVIEW_VIEWS.garden,
    house: layout.REVIEW_VIEWS.house,
    contact: {position: [-.65, .45, 1.1], target: [-.67, .15, .285], fov: 55},
  },
  cat: {source: 'models/tabby-cat-room.glb', position: cat.getWorldPosition(new T.Vector3()).toArray(), scale: asset.scene.getWorldScale(new T.Vector3()).toArray(), pose: 'Idle +0.8 seconds'},
  sun: { position: [-38, 55, -12], target: [0, 0, 35], energy: 2.6, color: new T.Color('#ffe4bd').toArray() },
  windowLight: {position: [-3,3,-2.3], target: [0,.1,1.1], energy: .65, color: new T.Color('#fff0d5').toArray()},
  fog: {density: .00165, color: '#dce0d1'},
};
await writeFile(path.join(out, 'snapshot-metadata.json'), JSON.stringify({camera: data.camera, mobileCamera: data.mobileCamera, reviewViews: data.reviewViews, cat: data.cat, sun: data.sun, lights: data.lights, windowLight: data.windowLight, fog: data.fog, sourceHashes, textureHashes: textures.map(({file,sha256}) => ({file,sha256})), geometry: {objects: objects.length, geometries: geometries.length, materials: materials.length, textures: textures.length, bytes: offset}}, null, 2));
await writeFile(path.join(out, 'scene.bin'), Buffer.concat(chunks));
await writeFile(path.join(out, 'scene.json'), JSON.stringify(data));
console.log(JSON.stringify({
  objects: objects.length, geometries: geometries.length, materials: materials.length,
  textures: textures.length, bytes: offset, errors,
}));
