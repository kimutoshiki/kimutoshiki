import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from '../js/vendor/three.module.min.js';
import * as WorldThree from '../scene/world-three.js';
import { createWorldLandscape } from '../scene/world-landscape.js';
import { createWorldLandmarks } from '../scene/world-landmarks.js';
import { createOkumaAuditorium } from '../js/models/okuma-auditorium.js';
import { createOkumaStatue } from '../js/models/okuma-statue.js';
import { createKaratsuCastle } from '../js/models/karatsu-castle.js';
import { createKaratsuBank } from '../js/models/karatsu-bank.js';
import { HOME, WORLD_BOUNDS, WAYPOINTS, LANDMARK_SITES, LANDMARK_RESERVATIONS } from '../scene/world-layout.js';
import { mountWorld } from '../scene/world.js';
import { createWalkNavigation } from '../scene/home-navigation.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';

// This test retains the actual authored geometry, materials, bounds and rays.
// Canvas pixels are inert; it makes no claim about browser/GPU rendering.
const context = new Proxy({}, {
  get(object, key) {
    if (key === 'createImageData' || key === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return value => ({ width: value.length * 10 });
    return object[key] ?? (() => {});
  },
  set(object, key, value) { object[key] = value; return true; },
});
globalThis.document = Object.assign(new EventTarget(), {
  hidden: false,
  fonts: { ready: new Promise(() => {}) },
  createElement: () => ({ width: 512, height: 512, getContext: () => context }),
});
const requests = [];
T.TextureLoader.prototype.load = function (url) { requests.push(url); throw new Error('Unexpected asset request while building first world geometry: ' + url); };
const checks = [], report = {};
const finite = value => Number.isFinite(value);
function resources(root) {
  const result = { geometry: new Set(), material: new Set(), texture: new Set() };
  root.traverse(object => {
    if (object.geometry) result.geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      result.material.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) result.texture.add(value);
    }
  });
  return result;
}
function geometrySummary(root, relativeTo = root) {
  root.updateWorldMatrix(true, true);
  const inverse = relativeTo.matrixWorld.clone().invert(), instance = new T.Matrix4(), transform = new T.Matrix4(), point = new T.Vector3();
  const sum = [0, 0, 0], square = [0, 0, 0], bounds = new T.Box3();
  let triangles = 0, vertices = 0, meshes = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry, positions = geometry.getAttribute('position');
    for (let instanceIndex = 0; instanceIndex < (object.isInstancedMesh ? object.count : 1); instanceIndex++) {
      transform.multiplyMatrices(inverse, object.matrixWorld);
      if (object.isInstancedMesh) { object.getMatrixAt(instanceIndex, instance); transform.multiply(instance); }
      const count = geometry.index?.count ?? positions.count;
      triangles += count / 3;
      for (let i = 0; i < count; i++) {
        const index = geometry.index ? geometry.index.getX(i) : i;
        point.fromBufferAttribute(positions, index).applyMatrix4(transform);
        assert.ok(point.toArray().every(finite), 'Every original/merged world vertex stays finite');
        bounds.expandByPoint(point); vertices++;
        point.toArray().forEach((value, axis) => { sum[axis] += value; square[axis] += value * value; });
      }
    }
  });
  return { triangles, vertices, meshes, sum, square, bounds };
}
function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}
const landscape = createWorldLandscape(T);
assert.equal(typeof landscape.then, 'undefined', 'Ground geometry is synchronous');
assert.deepEqual(requests, [], 'Ground construction never requests external assets');
assert.ok(landscape.stats.triangles < 200000 && landscape.stats.drawCalls < 24 && landscape.stats.geometryBytes < 250000, 'Initial garden geometry has bounded triangle/draw budgets');
assert.ok(!landscape.group.children.some(object => object.isLight), 'Garden geometry adds no lighting passes');
const raycaster = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
function groundAt(root, x, z, height = 1) {
  root.updateWorldMatrix(true, true);
  raycaster.set(new T.Vector3(x, height, z), down);
  return raycaster.intersectObject(root, true).find(hit => hit.object.isMesh && hit.object.visible && !hit.object.material?.transparent);
}
function assertGround(root, x, z, label, height = 1) {
  const hit = groundAt(root, x, z, height);
  assert.ok(hit, 'Continuous physical ground under ' + label);
  close(hit.point.y, HOME.floorY, .015, 'Ground stays level under ' + label);
  assert.ok(hit.object.receiveShadow, 'Walking support receives WebGL shadows: ' + label);
}
// Sample the entire navigable garden, not a small presentation slab. A floating
// island, stair down to water or unsupported outskirts cannot pass this check.
for (let x = WORLD_BOUNDS.minX + .5; x < WORLD_BOUNDS.maxX; x += 7) {
  for (let z = WORLD_BOUNDS.minZ + .5; z < WORLD_BOUNDS.maxZ; z += 7) assertGround(landscape.group, x, z, 'garden ' + [x, z], .03);
}
for (let i = 1; i < WAYPOINTS.length; i++) {
  const a = WAYPOINTS[i - 1], b = WAYPOINTS[i];
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    assertGround(landscape.group, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 'route ' + i, .03);
  }
}
// Intersect the rendered Float32 triangles, not only the polygon-union metadata.
// Previously these exact junctions had two coplanar stone rectangles. A nearest
// support ray alone cannot detect that visible z-fighting regression.
const paving = landscape.group.getObjectByName('Continuous limestone paving union');
assert.ok(paving?.isMesh && paving.userData.pavingUnion, 'Stone paths and rotated aprons form one explicit paving union');
const pavingPlan = paving.userData.pavingUnion, stoneMeshes = [];
landscape.group.traverse(object => {
  if (object.isMesh && (Array.isArray(object.material) ? object.material.includes(landscape.materials.stone) : object.material === landscape.materials.stone)) stoneMeshes.push(object);
});
assert.equal(pavingPlan.footprints.length, 10, 'Union retains six connecting paths and all four rotated architectural aprons');
const triangle = new T.Triangle(), barycentric = new T.Vector3(), localHit = new T.Vector3();
function stoneCoverage(x, z) {
  raycaster.set(new T.Vector3(x, .05, z), down);
  const hits = raycaster.intersectObjects(stoneMeshes, false).filter(hit => Math.abs(hit.point.y + .001) < 1e-6);
  let interiors = 0;
  for (const hit of hits) {
    const positions = hit.object.geometry.getAttribute('position');
    triangle.a.fromBufferAttribute(positions, hit.face.a);
    triangle.b.fromBufferAttribute(positions, hit.face.b);
    triangle.c.fromBufferAttribute(positions, hit.face.c);
    hit.object.worldToLocal(localHit.copy(hit.point)); triangle.getBarycoord(localHit, barycentric);
    // Shared edges legitimately return both adjacent triangles. Ignore their
    // edge hits, while retaining every triangle covering an actual open area.
    if (Math.min(barycentric.x, barycentric.y, barycentric.z) > 1e-7) interiors++;
  }
  assert.ok(interiors <= 1, 'No double coplanar stone coverage at ' + [x,z] + ': ' + interiors);
  return { interiors, edgesOnly: hits.length > 0 && interiors === 0 };
}
for (const [x,z] of [[-1.371,7.123],[-1.113,14.731],[1.137,21.813],[-1.357,38.217],[1.413,55.271]]) {
  const coverage = stoneCoverage(x,z);
  assert.equal(coverage.interiors, 1, 'Former overlapping path junction has exactly one real supporting triangle: ' + [x,z]);
}
// Independent odd/even containment compares the original footprints with real
// rendered triangles throughout the garden, including rotated apron crossings.
function insidePolygon(x,z,polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if ((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
let pavingSamples = 0, stoneSamples = 0;
for (let x=-49.813;x<46;x+=1.37) for(let z=3.429;z<86;z+=1.19) {
  const expected=pavingPlan.footprints.some(({polygon})=>insidePolygon(x,z,polygon)), coverage=stoneCoverage(x,z);
  if(coverage.edgesOnly)continue;
  assert.equal(coverage.interiors, Number(expected), 'Rendered union preserves original stone footprint without holes/overlap at ' + [x,z]);
  pavingSamples++; if(expected)stoneSamples++;
}
assert.ok(stoneSamples>1000, 'Dense coverage check exercises the paths and all rotated aprons');
for(const mesh of stoneMeshes) {
  const positions=mesh.geometry.getAttribute('position'), uvs=mesh.geometry.getAttribute('uv'), point=new T.Vector3();
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    close(uvs.getX(i),point.x/3.2,2e-5,'Stone joint UVs share one continuous world X coordinate');
    close(uvs.getY(i),point.z/3.2,2e-5,'Stone joint UVs share one continuous world Z coordinate');
    close(point.y,-.001,1e-6,'All stone union triangles share one flush elevation');
  }
}
report.paving = { checkedSamples: pavingSamples, stoneSamples, formerJunctions: 5 };
checks.push('Real stone triangles cover every original path/apron footprint once, including five formerly overlapping junctions; shared world UVs keep joints continuous');
checks.push('Synchronous continuous ground supports the entire metre-scale walkable garden and home-to-garden routes within 15 mm of floor level');
let timer;
const landmarks = await Promise.race([
  createWorldLandmarks(T),
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Original landmarks must not wait for unresolved fonts/images')), 8000); }),
]).finally(() => clearTimeout(timer));
assert.deepEqual(requests, [], 'All four outdoor architectures render without images or fonts');
const factories = { 'okuma-auditorium': createOkumaAuditorium, 'okuma-statue': createOkumaStatue, 'karatsu-castle': createKaratsuCastle, 'karatsu-bank': createKaratsuBank };
assert.deepEqual(landmarks.targets.map(target => target.id).sort(), LANDMARK_SITES.map(site => 'landmark-' + site.key).sort());
const worldBoxes = [], originals = new Map();
for (const site of LANDMARK_SITES) {
  const id = 'landmark-' + site.key, target = landmarks.targets.find(value => value.id === id);
  const actual = target.object.getObjectByName(site.name);
  assert.ok(actual, 'Complete original architecture remains named: ' + id);
  close(target.object.position.x, site.position[0], 1e-8, 'Landmark location x');
  close(target.object.position.z, site.position[1], 1e-8, 'Landmark location z');
  const sourceModel = factories[site.key](T), source = sourceModel.architecture || sourceModel.group.getObjectByName(site.name);
  source.removeFromParent();
  const before = geometrySummary(source), after = geometrySummary(actual); originals.set(site.key, before);
  assert.equal(after.triangles, before.triangles, 'Original architectural triangles retained: ' + id);
  assert.equal(after.vertices, before.vertices, 'Original triangle topology retained: ' + id);
  for (let axis = 0; axis < 3; axis++) {
    close(after.bounds.min.getComponent(axis), before.bounds.min.getComponent(axis), 5e-5, 'Original geometry minimum');
    close(after.bounds.max.getComponent(axis), before.bounds.max.getComponent(axis), 5e-5, 'Original geometry maximum');
    close(after.sum[axis] / after.vertices, before.sum[axis] / before.vertices, 2e-5, 'Original vertex position mean');
    close(after.square[axis] / after.vertices, before.square[axis] / before.vertices, .002, 'Original vertex second moment');
  }
  const body = actual.parent;
  close(body.scale.x, body.scale.y, 1e-12, 'Original architecture uniform scale x/y');
  close(body.scale.y, body.scale.z, 1e-12, 'Original architecture uniform scale y/z');
  target.object.traverse(object => {
    if (!object.isMesh) return;
    assert.ok(object.castShadow && object.receiveShadow, 'Every complete monument surface participates in real shadows: ' + id);
    assert.equal(object.userData.targetId, id, 'Visible geometry retains its navigation target');
  });
  const bounds = new T.Box3().setFromObject(target.object);
  close(bounds.getSize(new T.Vector3()).y, site.height, .005, 'Full-size monument height in metres');
  close(bounds.min.y, HOME.floorY, .005, 'Original architecture foundation touches ground without a floating plinth');
  assertGround(landscape.group, site.position[0], site.position[1], id);
  assert.ok(bounds.min.x >= WORLD_BOUNDS.minX && bounds.max.x <= WORLD_BOUNDS.maxX && bounds.min.z >= WORLD_BOUNDS.minZ && bounds.max.z <= WORLD_BOUNDS.maxZ, 'Complete monument fits on walkable real ground');
  const reservation = LANDMARK_RESERVATIONS.find(value => value.id === id);
  assert.ok(reservation && reservation.minX <= bounds.min.x && reservation.maxX >= bounds.max.x && reservation.minZ <= bounds.min.z && reservation.maxZ >= bounds.max.z,
    'The initial reservation contains every final architectural protrusion: ' + id);
  worldBoxes.push({ id, bounds });
  for (const set of Object.values(resources(sourceModel.group))) for (const resource of set) resource.dispose();
  for (const set of Object.values(resources(source))) for (const resource of set) resource.dispose();
}
for (let a = 0; a < worldBoxes.length; a++) for (let b = a + 1; b < worldBoxes.length; b++) assert.ok(!worldBoxes[a].bounds.intersectsBox(worldBoxes[b].bounds), 'Independent outdoor monuments never intersect');
const auditorium = landmarks.targets.find(target => target.id === 'landmark-okuma-auditorium').object;
for (let face = 1; face <= 4; face++) assert.ok(auditorium.getObjectByName('Clock face ' + face), 'All four original clock faces retained');
assert.ok(landmarks.stats.total.drawCalls < 160, 'Full outdoor architectures remain batched');
report.landmarks = landmarks.stats.models.map(({id,height,width,depth}) => ({id,height,width,depth}));
checks.push('Four original life-size architectures preserve every triangle, vertex moments, proportions and clock faces, with grounded nonintersecting foundations and real shadows');

const preservedFiles = ['js/models/okuma-auditorium.js', 'js/models/okuma-statue.js', 'js/models/karatsu-castle.js', 'js/models/karatsu-bank.js'];
report.sourceSha256 = Object.fromEntries(await Promise.all(preservedFiles.map(async path => [path, createHash('sha256').update(await readFile(new URL('../' + path, import.meta.url))).digest('hex')])));
assert.deepEqual(report.sourceSha256, {
  'js/models/okuma-auditorium.js': '612350f76ba1b70429a33fd1c5b2197c3aafd25ad1a3d0c5012cff4ffb0cf188',
  'js/models/okuma-statue.js': '2185a3dc140922c473761ebcaae54867fab0ac008a997ad22f1e6de62d67173f',
  'js/models/karatsu-castle.js': 'd11944352081b6e4585063904ced21526d996df60eda55dea68c058b6052d620',
  'js/models/karatsu-bank.js': '8fd587c485105b64ea23689748b833b163d0972eeba6119816c7a9c2e020529c',
}, 'The four original model sources remain byte-for-byte preserved');
for (const path of ['scene/world.js', 'scene/home-interior.js', 'scene/home-navigation.js', 'scene/room-model.js', 'scene/world-landscape.js', 'scene/world-landmarks.js', 'scene/cat-life.js', 'scene/surface-materials.js', 'scene/static-batching.js', ...preservedFiles]) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  assert.ok(!/import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*vendor\/three/.test(source), 'Runtime factory never imports the entire vendor Three namespace: ' + path);
  for (const [, name] of source.matchAll(/\b(?:T|THREE)\.([A-Z]\w*)/g)) assert.ok(name in WorldThree, 'Explicit Three palette includes ' + path + ' dependency ' + name);
}
checks.push('Explicit Three palette covers runtime factory dependencies without a full vendor namespace import');
function watchResources(root) {
  const counts = new Map();
  for (const set of Object.values(resources(root))) for (const resource of set) {
    if (counts.has(resource)) continue;
    counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  return counts;
}
for (const owner of [landmarks, landscape]) {
  const counts = watchResources(owner.group); owner.dispose(); owner.dispose();
  for (const [resource, count] of counts) assert.equal(count, 1, 'Every outdoor-owned resource releases exactly once: ' + resource.type);
}
checks.push('Outdoor geometry/material/procedural texture ownership is complete and idempotent');

// Production scheduling and real scene geometry. No WebGL/browser pixels are
// simulated: only GPU rendering, canvas text pixels and asynchronous asset
// delivery are replaced. The GLB skin, poses, bounds and mesh rays are real.
class Canvas extends EventTarget {
  clientWidth = 1280; clientHeight = 800; style = {};
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
  focus() {}
}
class Renderer {
  constructor(canvas) { this.canvas = canvas; this.shadowMap = {}; this.ratio = 1; this.renders = []; this.disposed = 0; this.capabilities = { maxTextureSize: 4096, getMaxAnisotropy: () => 4 }; }
  getPixelRatio() { return this.ratio; }
  setPixelRatio(value) { this.ratio = value; }
  setSize(width, height) { this.size = [width, height]; }
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(); this.renders.push({ scene, camera: camera.clone(), shadowUpdate: this.shadowMap.needsUpdate, ratio: this.ratio }); this.shadowMap.needsUpdate = false; }
  dispose() { this.disposed++; }
}
globalThis.window = new EventTarget(); globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => ({ matches: false });
const frames = new Map(); let frameId = 0, milliseconds = 0;
globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function frame(count = 1) {
  for (let i = 0; i < count; i++) { const callbacks = [...frames.values()]; frames.clear(); milliseconds = Math.max(milliseconds + 34, performance.now() + 34); callbacks.forEach(callback => callback(milliseconds)); }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate, message) {
  const deadline = performance.now() + 8000;
  while (!predicate()) { assert.ok(performance.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const runtimeRequests = [];
T.TextureLoader.prototype.load = function (url) { runtimeRequests.push(url); return new T.Texture(); };
function pointer(canvas, type, x, y, id = 1) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { button: 0, pointerId: id, clientX: x, clientY: y }); canvas.dispatchEvent(event); return event;
}
function key(canvas, type, value, extras = {}) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { key: value, code: value.length === 1 ? 'Key' + value.toUpperCase() : value, ...extras }); canvas.dispatchEvent(event); return event;
}
async function pendingWorld() {
  const canvas = new Canvas(), renderer = new Renderer(canvas), model = deferred(), initialCat = deferred(), fullCat = deferred();
  const calls = [], errors = [], progress = [], selected = [], events = []; let ready = 0;
  canvas.addEventListener('worldstate', event => events.push(event.detail));
  const requestCount = runtimeRequests.length;
  const pending = mountWorld({ canvas, rendererFactory: () => renderer, reducedMotion: false,
    loadLandmarks() { calls.push('landmarks'); return model.promise; },
    loadCat(detail) { calls.push('cat-' + detail); return (detail === 'full' ? fullCat : initialCat).promise; },
    onReady() { ready++; }, onError(error) { errors.push(error); }, onProgress(value) { progress.push(value); }, onSelect(id) { selected.push(id); },
  });
  assert.equal(renderer.renders.length, 1, 'The original furnished home renders synchronously before mount returns its Promise');
  assert.equal(runtimeRequests.length, requestCount, 'First furnished home frame issues no photographic/surface request');
  assert.deepEqual(calls, [], 'No landmark/cat request precedes the first furnished home draw');
  const engine = await pending;
  assert.equal(ready, 1, 'The furnished home is immediately usable while all outdoor assets remain pending');
  assert.equal(engine.getState().mode, 'inside');
  assert.ok(!engine.getState().landmarksReady && !engine.getState().catReady);
  close(renderer.renders[0].camera.position.y, 1.62, 1e-8, 'First camera is at actual standing eye height');
  const first = renderer.renders[0];
  assert.ok(first.camera.position.x > HOME.bounds.minX && first.camera.position.x < HOME.bounds.maxX && first.camera.position.z > HOME.bounds.minZ && first.camera.position.z < HOME.bounds.maxZ, 'The first view is physically inside the retained home');
  assert.ok(first.scene.getObjectByName('A quiet room for learning'), 'The actual original furnished room is in the first frame');
  frame(); await until(() => calls.includes('landmarks'), 'Outdoor architecture starts after the first home frame');
  assert.deepEqual(errors, []);
  return { canvas, renderer, engine, model, initialCat, fullCat, calls, errors, progress, selected, events, get ready() { return ready; } };
}
const running = await pendingWorld(), worldScene = running.renderer.renders[0].scene;
const room = worldScene.getObjectByName('A quiet room for learning');
const home = worldScene.getObjectByName('Home · the original warm study');
assert.ok(home, 'Original warm room is retained');
const colors = new Set(); home.traverse(object => {
  for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) if (material.color) colors.add('#' + material.color.getHexString());
});
for (const color of ['#62432f', '#936a43', '#34251d', '#424d3e', '#d0c5b2']) assert.ok(colors.has(color), 'Original warm home material retained: ' + color);
const homeScale = room.getWorldScale(new T.Vector3()); close(homeScale.x, HOME.scale, 1e-8, 'Original room is converted to human-scale metres');
assertGround(worldScene, HOME.spawn.x, HOME.spawn.z, 'standing home spawn');
// Trace a capsule-width horizontal sweep through the real doorway. Rays must
// clear both directions, while rays beside the opening must hit an opaque wall.
worldScene.updateMatrixWorld(true);
const physicalMeshes = []; home.traverse(object => { if (object.isMesh && object.visible && !object.material?.transparent) physicalMeshes.push(object); });
for (const x of [HOME.door.x - .22, HOME.door.x, HOME.door.x + .22]) for (const y of [.12, .85, 1.62, 1.9]) for (const direction of [-1, 1]) {
  raycaster.set(new T.Vector3(x, y, HOME.door.z - direction * .45), new T.Vector3(0, 0, direction)); raycaster.far = .9;
  assert.equal(raycaster.intersectObjects(physicalMeshes, false).length, 0, 'Doorway provides a real unobstructed human-width passage ' + [x,y,direction]);
}
for (const side of [-1, 1]) {
  raycaster.set(new T.Vector3(HOME.door.x + side * (HOME.door.width / 2 + .25), 1.62, HOME.door.z - .45), new T.Vector3(0, 0, 1)); raycaster.far = .9;
  assert.ok(raycaster.intersectObjects(physicalMeshes, false).length, 'Real wall exists beside the door opening');
}
const frontWindow = home.userData.home.frontWindow;
assert.ok(frontWindow?.transparent && frontWindow.walkable === false, 'Front window metadata distinguishes glazing from the walking doorway');
assert.ok(frontWindow.width >= 1 && frontWindow.head - frontWindow.sill >= 1, 'Front garden window has a full physical aperture');
const windowMeshes=[];home.traverse(object=>{if(object.isMesh&&object.visible)windowMeshes.push(object);});
let windowRays=0;
for(const fx of [.15,.34,.66,.85])for(const fy of [.12,.34,.71,.88])for(const direction of [-1,1]) {
  const x=frontWindow.min[0]+frontWindow.width*fx, y=frontWindow.sill+(frontWindow.head-frontWindow.sill)*fy;
  raycaster.set(new T.Vector3(x,y,frontWindow.z-direction*.45),new T.Vector3(0,0,direction));raycaster.far=.9;
  assert.equal(raycaster.intersectObjects(physicalMeshes,false).length,0,'Front window opening is not backed by an opaque wall: '+[x,y,direction]);
  const glazing=raycaster.intersectObjects(windowMeshes,false).filter(hit=>{
    const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
    return material?.transparent && material.opacity>0 && material.opacity<.25 && !material.depthWrite;
  });
  assert.ok(glazing.length>0,'Actual clear glazing spans the recessed window aperture in both directions');windowRays++;
}
// The transparent aperture still has a real sill/head and structural framing.
for(const [x,y] of [[frontWindow.min[0]-.12,1.62],[frontWindow.max[0]+.12,1.62],[frontWindow.x,frontWindow.sill-.15],[frontWindow.x,frontWindow.head+.15],[frontWindow.mullionX,1.2],[frontWindow.x-.3,frontWindow.transomY]]) {
  raycaster.set(new T.Vector3(x,y,frontWindow.z-.45),new T.Vector3(0,0,1));raycaster.far=.9;
  assert.ok(raycaster.intersectObjects(physicalMeshes,false).length,'Actual wall/frame remains around the glazed aperture: '+[x,y]);
}
const windowNavigation=createWalkNavigation({bounds:WORLD_BOUNDS,spawn:{x:frontWindow.x,z:frontWindow.min[2]-.6,yaw:0,pitch:0},radius:.20,eyeHeight:HOME.eyeHeight,
  obstacles:home.userData.home.collisions.map(({min,max})=>({minX:min[0],maxX:max[0],minZ:min[2],maxZ:max[2]}))});
windowNavigation.setInput({forward:1,right:0});for(let i=0;i<100;i++)windowNavigation.update(.05);
assert.ok(windowNavigation.getState().position.z<=frontWindow.min[2]-.20+1e-6,'A person cannot walk through the glazed window instead of the door');windowNavigation.dispose();
report.frontWindow = { clearBidirectionalRays: windowRays, walkingBlocked: true };
checks.push('Front garden window has real transparent glazing, 32 clear bidirectional aperture rays, solid frame/wall surrounds and a nonwalkable collision boundary');
raycaster.far = Infinity;
checks.push('First frame is the original warm furnished home at 1.62 m eye height; its real walls contain a clear human-width door opening');
// Keep the real outdoor factory unresolved while walking. Its eventual
// geometry must never appear around someone who entered an unreserved site.
let earlyWalkingFrames = 0;
const earlyPosition = () => running.engine.getState().position;
function outsideReservedBuildings() {
  const p=earlyPosition();
  for(const box of LANDMARK_RESERVATIONS) assert.ok(!(p.x>box.minX && p.x<box.maxX && p.z>box.minZ && p.z<box.maxZ),
    'Walking before assets finish cannot enter the future building footprint: '+box.id);
}
function finishEarlyRoute(label, reserved=true) {
  let budget=4000;
  while(running.engine.getState().travel && budget-->0) {
    frame();earlyWalkingFrames++;if(reserved)outsideReservedBuildings();
  }
  assert.ok(budget>0,'Physical route remains reachable during progressive loading: '+label);
}
assert.equal(running.engine.getState().landmarksReady,false,'Outdoor geometry remains delayed for the reservation regression');
for(const site of LANDMARK_SITES) {
  assert.ok(running.engine.goToLandmark('landmark-'+site.key),'Reserved footprints still permit arrival before assets load: '+site.key);
  finishEarlyRoute(site.key);
  const arrival=earlyPosition();assert.ok(Math.hypot(arrival.x-site.arrival[0],arrival.z-site.arrival[1])<.25,'Preload walk reaches safe architectural arrival');
  const direction=running.renderer.renders.at(-1).camera.getWorldDirection(new T.Vector3());
  const towardCenter=Math.atan2(site.position[0]-arrival.x,site.position[1]-arrival.z);
  running.engine.look(towardCenter-Math.atan2(direction.x,direction.z),0);running.engine.setMovement({forward:1,right:0});
  const steps=Math.ceil(Math.hypot(site.position[0]-arrival.x,site.position[1]-arrival.z)/(.034*2.4))+90;
  for(let i=0;i<steps;i++){frame();earlyWalkingFrames++;outsideReservedBuildings();}
  running.engine.stopMovement();
  assert.equal(running.engine.getState().landmarksReady,false,'Movement does not force the delayed architectural factory to finish');
}
const beforeArchitecture={...earlyPosition()};
const liveMonuments = await createWorldLandmarks(T); running.model.resolve(liveMonuments);
await until(() => running.engine.getState().landmarksReady, 'Delayed architecture installs after the early walking challenge');
assert.deepEqual(earlyPosition(),beforeArchitecture,'Installing architecture never relocates or encloses the early visitor');
assert.ok(running.engine.returnHome(),'Visitor beside the newly visible building can still return through the real door');finishEarlyRoute('home after geometry arrives',false);
assert.equal(running.engine.getState().mode,'inside');
report.progressiveWalking={frames:earlyWalkingFrames,reservedSites:LANDMARK_RESERVATIONS.length};
checks.push('Before outdoor assets resolve, reserved real-size footprints block entry into all four future buildings while every arrival stays reachable; loading leaves the visitor free to walk home');

await until(() => running.engine.getState().landmarksReady, 'Life-size outdoor architecture installs without cat/image/font waits');
await until(() => running.calls.some(value => value.startsWith('cat-')), 'Cat refinement starts after useful geometry');
assert.equal(running.ready, 1, 'Progressive additions never repeat home ready');
assert.ok(!runtimeRequests.some(url => /images\/(?:photos|navigation|garden)|photo-wall|wall-atlas/.test(String(url))), 'Obsolete room photo walls/navigation/garden photos are never requested');
const sun = worldScene.children.find(object => object.isDirectionalLight && object.castShadow);
assert.ok(sun && running.renderer.shadowMap.enabled && running.renderer.shadowMap.type === T.PCFSoftShadowMap, 'An actual WebGL directional shadow caster lights the scene');
assert.ok(sun.shadow.mapSize.x >= 2048 && running.renderer.renders.some(draw => draw.shadowUpdate));
sun.updateWorldMatrix(true, false); sun.target.updateWorldMatrix(true, false); sun.shadow.updateMatrices(sun);
for (const {id,bounds} of worldBoxes) for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
  const projected = new T.Vector3(x,y,z).project(sun.shadow.camera);
  assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1, 'Actual shadow frustum contains complete life-size monument: ' + id);
}
checks.push('Home is useful before asynchronous outdoor assets; no obsolete photo loads; real shadow frustum covers all complete outdoor monuments');
// The four tiny desk originals remain part of the familiar home as well as
// appearing at actual architectural scale in the surrounding garden.
await until(() => LANDMARK_SITES.every(site => home.getObjectByName('desk-' + site.key)), 'All four original desk miniatures install without waiting for fonts');
for (const site of LANDMARK_SITES) {
  const display = home.getObjectByName('desk-' + site.key), architecture = display.getObjectByName(site.name);
  assert.ok(architecture, 'Desk retains complete original ' + site.name);
  const summary = geometrySummary(architecture), original = originals.get(site.key);
  assert.equal(summary.triangles, original.triangles, 'Desk original architectural topology preserved');
  assert.equal(summary.vertices, original.vertices, 'Desk original vertices preserved');
  const bounds = new T.Box3().setFromObject(display), size = bounds.getSize(new T.Vector3());
  assert.ok(size.x < .5 && size.y < .6 && size.z < .5, 'The desk model stays realistically miniature');
  assert.ok(bounds.min.y > .7 && bounds.max.y < 1.5, 'Desk model is on the original waist-height desk');
}
checks.push('All four complete original architectural miniatures remain on the original desk');

const asset = await loadTabbyFixture(new URL('../models/tabby-cat-world.glb', import.meta.url));
running.initialCat.resolve(asset); await until(() => running.engine.getState().catReady, 'Real supplied tabby skeleton installs independently');
running.engine.setPaused(true); frame(3);
const liveCat = worldScene.getObjectByName('Wandering tabby cat');
assert.ok(liveCat && asset.scene.parent === liveCat, 'The runtime uses the supplied animated tabby GLB');
assert.ok(asset.animations.some(clip => clip.name === 'Walk') && asset.scene.getObjectByName('Cat_•_continuous_anatomical_surface')?.isSkinnedMesh, 'The supplied cat remains rigged with its actual walk clip');
const catBox = new T.Box3().setFromObject(asset.scene, true), catSize = catBox.getSize(new T.Vector3());
assert.ok(catSize.y > .40 && catSize.y < .60, 'The source cat remains a realistic roughly 49 cm tall pet, not an enlarged room ornament: ' + catSize.y);
assert.ok(Math.abs(catBox.min.y - HOME.floorY) < .025, 'Actual animated cat paws touch the real floor: ' + catBox.min.y);
const catContact = worldScene.getObjectByName('Cat floor contact'), catContactPosition = catContact.getWorldPosition(new T.Vector3());
assert.ok(catContactPosition.y >= -.005 && catContactPosition.y <= .015, 'Cat contact shadow stays on its actual floor');
report.cat = { height: catSize.y, floorGap: catBox.min.y - HOME.floorY };
running.engine.focus('cat'); frame();
await until(() => running.calls.includes('cat-full'), 'Explicit cat attention requests original full detail');
running.engine.reset(); frame();
const full = await loadTabbyFixture('full'); running.fullCat.resolve(full); await settle(); frame();
assert.equal(asset.scene.parent, liveCat, 'A late full-detail response cannot override leaving cat focus');
assert.equal(full.scene.parent, null, 'Original groom remains cached after leaving cat focus');
running.engine.focus('cat'); frame(); assert.equal(full.scene.parent, liveCat, 'Returning to cat attention reuses full-detail GLB');
running.engine.reset(); frame(); assert.equal(asset.scene.parent, liveCat, 'Leaving cat attention restores efficient LOD');
checks.push('Supplied rigged tabby retains realistic dimensions, floor contact, authored clips and race-safe full-detail refinement');

function position() { const {x,y,z} = running.engine.getState().position; return new T.Vector3(x,y,z); }
let travelSamples = 0, crossedDoor = 0;
function travelToEnd(label, maximum = 12000) {
  let previous = position(), complete = false;
  for (let i = 0; i < maximum; i++) {
    frame(); const state = running.engine.getState(), next = position(); travelSamples++;
    close(next.y, 1.62, 1e-8, 'Walking eye stays physically 1.62m above level floor');
    assert.ok(next.distanceTo(previous) <= .18, 'Travel advances continuously without camera teleport: ' + label);
    for (const {id,bounds} of worldBoxes) assert.ok(!bounds.clone().expandByScalar(.20).containsPoint(next), 'Walking never enters architecture: ' + id);
    if ((previous.z - HOME.door.z) * (next.z - HOME.door.z) <= 0 && previous.z !== next.z) {
      const t = (HOME.door.z - previous.z) / (next.z - previous.z), x = previous.x + (next.x - previous.x) * t;
      assert.ok(Math.abs(x - HOME.door.x) <= HOME.door.width / 2 - .20, 'The camera actually crosses through the doorway'); crossedDoor++;
    }
    // A downward physical ray at each sampled camera point rules out walking
    // above empty ground or standing on furniture excluded from nav obstacles.
    if (i % 12 === 0) assertGround(worldScene, next.x, next.z, label + ' step ' + i);
    previous = next;
    if (!state.travel) { complete = true; break; }
  }
  assert.ok(complete, 'Automated physical route completes: ' + label);
}
running.engine.returnHome(); travelToEnd('return from cat');
running.engine.leave(); travelToEnd('home exit'); assert.equal(running.engine.getState().mode, 'outside');
for (const site of LANDMARK_SITES) {
  assert.ok(running.engine.goToLandmark('landmark-' + site.key), 'Runtime accepts physical route to ' + site.key + ' from ' + JSON.stringify(running.engine.getState())); travelToEnd('visit ' + site.key);
  assert.equal(running.engine.getState().mode, 'outside');
  assert.ok(position().distanceTo(new T.Vector3(site.arrival[0], HOME.eyeHeight, site.arrival[1])) < .25, 'Walk reaches actual monument arrival ' + site.key + ': ' + position().toArray() + ' expected ' + site.arrival);
  running.engine.returnHome(); travelToEnd('return from ' + site.key);
  assert.equal(running.engine.getState().mode, 'inside');
  assert.ok(position().distanceTo(new T.Vector3(HOME.spawn.x, HOME.eyeHeight, HOME.spawn.z)) < .25, 'Walk returns to original indoor spawn');
}
assert.ok(crossedDoor >= 8, 'Repeated landmark trips genuinely cross the physical door in both directions');
report.travelSamples = travelSamples;
checks.push('Paused ambience still allows continuous 1.62 m walking through the actual door, around real buildings, to every landmark and home again');

// Native shortcuts and viewport gestures must stay with the browser. Plain
// walking keys still move the actual camera and cease on release/blur.
frame(3); let stableDraws = running.renderer.renders.length; frame(12);
assert.equal(running.renderer.renders.length, stableDraws, 'Stable paused home does no redraw work');
globalThis.devicePixelRatio = 2; window.dispatchEvent(new Event('resize')); frame();
assert.equal(running.renderer.renders.length, stableDraws + 1, 'DPR-only resize redraws paused framebuffer');
assert.ok(running.renderer.renders.at(-1).ratio > 1); globalThis.devicePixelRatio = 1;
const beforeShortcut = position();
for (const extras of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
  for (const value of ['w', 'ArrowUp', '+', 'Home']) assert.equal(key(running.canvas, 'keydown', value, extras).defaultPrevented, false, 'Modified browser shortcut remains native');
}
frame(3); assert.deepEqual(position(), beforeShortcut, 'Browser shortcuts never move walking camera');
const wheel = new Event('wheel', { cancelable: true }); Object.assign(wheel, { ctrlKey: true, deltaY: -100 }); running.canvas.dispatchEvent(wheel);
assert.equal(wheel.defaultPrevented, false, 'Browser pinch-zoom remains native');
const initialKey = position(); key(running.canvas, 'keydown', 's'); frame(5); key(window, 'keyup', 's'); frame();
assert.ok(position().distanceTo(initialKey) > .05, 'Plain WASD keys walk the real camera');
const releasedKey = position(); frame(10); assert.ok(position().distanceTo(releasedKey) < .001, 'Keyup stops walking');
key(running.canvas, 'keydown', 's'); frame(2); window.dispatchEvent(new Event('blur')); frame();
const blurPosition = position(); frame(10); assert.ok(position().distanceTo(blurPosition) < .001, 'Window blur stops held movement');
pointer(running.canvas, 'pointerdown', 300, 300, 1); pointer(running.canvas, 'pointerdown', 500, 300, 2);
pointer(running.canvas, 'pointermove', 600, 300, 2); pointer(running.canvas, 'pointercancel', 300, 300, 1); pointer(running.canvas, 'pointerup', 600, 300, 2);
assert.deepEqual(running.selected, [], 'Canceled/multitouch gestures never select a distant target');
const hiddenDraws = running.renderer.renders.length; document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); frame(3);
assert.equal(running.renderer.renders.length, hiddenDraws, 'Background tabs suspend all scene drawing');
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); frame();
assert.ok(running.renderer.renders.length > hiddenDraws, 'Visible tabs refresh their scene');
checks.push('Pause suppresses redraws, DPR refresh works, browser shortcuts remain native, WASD release/blur stop movement, canceled multitouch cannot click and hidden tabs suspend rendering');

const sceneResources = watchResources(worldScene), cachedGroomResources = watchResources(full.scene);
running.engine.dispose(); running.engine.dispose(); assert.equal(running.renderer.disposed, 1);
for (const [resource,count] of [...sceneResources,...cachedGroomResources]) assert.equal(count, 1, 'Mounted scene and cached cat resource released exactly once: ' + resource.type + ' ' + resource.name);
const disposedDraws = running.renderer.renders.length; frame(4); assert.equal(running.renderer.renders.length, disposedDraws);
assert.equal(frames.size, 0, 'Disposal cancels continuing frame callbacks');
const departed = await pendingWorld(), lateMonuments = await createWorldLandmarks(T);
departed.engine.dispose(); let releasedMonuments = 0;
const originalDispose = lateMonuments.dispose; lateMonuments.dispose = () => { releasedMonuments++; originalDispose(); };
departed.model.resolve(lateMonuments); await settle();
assert.equal(releasedMonuments, 1); assert.equal(departed.ready, 1, 'Disposed world never repeats initial ready');
const contextLost = await pendingWorld(), lostMonuments = await createWorldLandmarks(T);
const contextEvent = new Event('webglcontextlost', { cancelable: true }); contextLost.canvas.dispatchEvent(contextEvent);
assert.equal(contextEvent.defaultPrevented, true); assert.equal(contextLost.errors.length, 1);
let lostReleased = 0; const lostDispose = lostMonuments.dispose;
lostMonuments.dispose = () => { lostReleased++; lostDispose(); };
contextLost.model.resolve(lostMonuments); await settle();
assert.equal(contextLost.ready, 1, 'Context loss never triggers another ready'); assert.equal(lostReleased, 1, 'Context loss releases late architecture');
const lostDraws = contextLost.renderer.renders.length;
document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); frame(3);
assert.equal(contextLost.renderer.renders.length, lostDraws, 'Visibility changes cannot resurrect lost context');
contextLost.engine.dispose();
const fallbackErrors = [];
const fallback = await mountWorld({ canvas: new Canvas(), reducedMotion: true, rendererFactory() { throw new Error('Simulated unavailable WebGL'); }, onError(error) { fallbackErrors.push(error); } });
assert.equal(fallback.getState().webgl, false); assert.equal(fallbackErrors.length, 1); assert.equal(frames.size, 0); fallback.dispose();
checks.push('Idempotent disposal and context loss release delayed models and cannot restart rendering; unavailable WebGL preserves native fallback');
console.log(JSON.stringify({ result: 'PASS', evidence: 'Real geometry, raycasts, skeletal GLB and production lifecycle; renderer is stubbed, so this is not browser/GPU visual evidence.', checks, ...report }, null, 2));
