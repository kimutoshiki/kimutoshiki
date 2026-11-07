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
import { getWorldTime } from '../scene/world-time.js';
import { createGardenBoundary } from '../scene/garden-boundary.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';

// This test retains the actual authored geometry, materials, bounds and rays.
// Canvas pixels are inert; it makes no claim about browser/GPU rendering.
const linearGradients = [];
const context = new Proxy({}, {
  get(object, key) {
    if (key === 'createImageData' || key === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => { const gradient = { stops: [], addColorStop(offset,color) { this.stops.push({offset,color}); } }; if (key === 'createLinearGradient') linearGradients.push(gradient); return gradient; };
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
function assertAuditoriumClockFaces(root,time,label) {
  assert.ok(root,'The actual auditorium remains available for '+label);
  root.updateWorldMatrix(true,true);
  for(let side=1;side<=4;side++) {
    const face=root.getObjectByName('Clock face '+side);assert.ok(face,'Retained clock face '+side+' for '+label);
    assert.equal(face.userData.localTime,time.label,'Every auditorium face shows the same Japan time');
    assert.equal(face.userData.clockTimeZone,'Asia/Tokyo');
    const hands=face.children.filter(object=>object.userData.worldClockHand);
    assert.equal(hands.length,2,'Both original hands survive static batching on '+label+' face '+side);
    for(const [kind,length] of [['hour',.55],['minute',.78]]) {
      const hand=hands.find(object=>object.userData.worldClockHand===kind);
      assert.ok(hand?.isMesh&&!hand.isInstancedMesh,'The '+kind+' hand remains an individually movable authored mesh');
      close(hand.scale.y,length,1e-10,'Original clock hand length is preserved');
      const base=face.worldToLocal(hand.localToWorld(new T.Vector3(0,-.5,0)));
      const tip=face.worldToLocal(hand.localToWorld(new T.Vector3(0,.5,0)));
      const angle=time.clockAngles[kind],expectedTip=new T.Vector3(-Math.sin(angle)*length,Math.cos(angle)*length,.1);
      assert.ok(base.distanceTo(new T.Vector3(0,0,.1))<1e-6,'Actual '+kind+' hand base stays at the dial centre: '+label+' face '+side);
      assert.ok(tip.distanceTo(expectedTip)<1e-6,'Actual '+kind+' hand tip follows clockwise Japan time, not rotation around its own centre: '+label+' face '+side);
      assert.ok(Math.hypot(tip.x,tip.y)<1.1&&tip.z>.07,'Moving hand stays within and in front of the original opaque dial');
    }
  }
}
const landscape = createWorldLandscape(T);
assert.equal(typeof landscape.then, 'undefined', 'Ground geometry is synchronous');
assert.deepEqual(requests, [], 'Ground construction never requests external assets');
assert.ok(landscape.stats.triangles < 200000 && landscape.stats.drawCalls < 24 && landscape.stats.geometryBytes < 250000, 'Initial garden geometry has bounded triangle/draw budgets');
assert.ok(!landscape.group.children.some(object => object.isLight), 'Garden geometry adds no lighting passes');
// Chromium visual QA caught the horizon-sized two-triangle grass plane
// covering the raised home floor in downward views. Guard the actual world
// triangle size used by the confirmed fix; ray support alone misses that bug.
const horizonGround=landscape.group.getObjectByName('Unbroken ground to the horizon');
assert.ok(horizonGround?.isMesh,'The continuous horizon ground remains actual geometry');
horizonGround.updateWorldMatrix(true,false);
const groundPositions=horizonGround.geometry.getAttribute('position'),groundIndices=horizonGround.geometry.index;
const groundVertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let maximumGroundEdge=0;
const groundIndexCount=groundIndices?.count??groundPositions.count;
for(let i=0;i<groundIndexCount;i+=3) {
  for(let vertex=0;vertex<3;vertex++)groundVertices[vertex].fromBufferAttribute(groundPositions,groundIndices?groundIndices.getX(i+vertex):i+vertex).applyMatrix4(horizonGround.matrixWorld);
  for(let vertex=0;vertex<3;vertex++)maximumGroundEdge=Math.max(maximumGroundEdge,groundVertices[vertex].distanceTo(groundVertices[(vertex+1)%3]));
}
assert.ok(maximumGroundEdge<=80,'Horizon ground uses short triangles to preserve floor/rug depth in downward views: '+maximumGroundEdge+'m');
const horizonBounds=new T.Box3().setFromObject(horizonGround),horizonSize=horizonBounds.getSize(new T.Vector3());
assert.ok([...horizonBounds.min.toArray(),...horizonBounds.max.toArray()].every(Number.isFinite),'Horizon ground bounds remain finite');
close(horizonSize.x,1800,1e-6,'Ground subdivision retains the full horizon width');close(horizonSize.z,1800,1e-6,'Ground subdivision retains the full horizon depth');
close(horizonBounds.min.y,-.008,1e-7,'Subdivided ground stays below the house floor');close(horizonBounds.max.y,-.008,1e-7,'Subdivided ground remains flat');
report.horizonGround={triangles:groundIndexCount/3,maximumEdgeMetres:maximumGroundEdge};
checks.push('Actual horizon ground triangles stay below 80 m edges, guarding the browser-confirmed floor/rug depth fix');
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
for (const path of ['scene/world.js', 'scene/home-interior.js', 'scene/home-navigation.js', 'scene/world-time.js', 'scene/landmark-clocks.js', 'scene/garden-boundary.js', 'scene/room-model.js', 'scene/world-landscape.js', 'scene/world-landmarks.js', 'scene/cat-life.js', 'scene/surface-materials.js', 'scene/static-batching.js', ...preservedFiles]) {
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
async function pendingWorld({ defaultSeated = false, now = () => new Date('2026-11-06T03:15:30Z') } = {}) {
  const canvas = new Canvas(), renderer = new Renderer(canvas), model = deferred(), initialCat = deferred(), fullCat = deferred();
  const calls = [], errors = [], progress = [], selected = [], events = []; let ready = 0;
  canvas.addEventListener('worldstate', event => events.push(event.detail));
  const requestCount = runtimeRequests.length;
  const pending = mountWorld({ canvas, rendererFactory: () => renderer, reducedMotion: false, now, ...(defaultSeated ? {} : { seated: false }),
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
  close(renderer.renders[0].camera.position.y, defaultSeated ? HOME.seated.position[1] : HOME.eyeHeight, 1e-8, 'First camera respects the selected seated or walking eye height');
  assert.equal(engine.getState().seated, defaultSeated);
  assert.equal(engine.getState().lightingMode, 'auto');
  assert.equal(engine.getState().time.label, getWorldTime(now()).label, 'Initial clock is actual Japan time');
  const first = renderer.renders[0];
  assert.ok(first.camera.position.x > HOME.bounds.minX && first.camera.position.x < HOME.bounds.maxX && first.camera.position.z > HOME.bounds.minZ && first.camera.position.z < HOME.bounds.maxZ, 'The first view is physically inside the retained home');
  assert.ok(first.scene.getObjectByName('A quiet room for learning'), 'The actual original furnished room is in the first frame');
  frame(); await until(() => calls.includes('landmarks'), 'Outdoor architecture starts after the first home frame');
  assert.deepEqual(errors, []);
  return { canvas, renderer, engine, model, initialCat, fullCat, calls, errors, progress, selected, events, get ready() { return ready; } };
}
let generalWorldDate=new Date('2026-11-06T03:15:30Z');
const running = await pendingWorld({now:()=>generalWorldDate}), worldScene = running.renderer.renders[0].scene;
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
checks.push('Explicit walking mode renders the original warm home at 1.62 m eye height with a real clear doorway');
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
const outdoorAuditorium=liveMonuments.targets.find(target=>target.id==='landmark-okuma-auditorium').object;
const deskAuditorium=home.getObjectByName('desk-okuma-auditorium');
assert.equal(liveMonuments.clocks.length,4,'Outdoor owner retains all four movable face records');
for(const iso of ['2026-11-06T03:00:00Z','2026-11-05T18:00:00Z','2026-11-05T21:00:00Z','2026-11-06T00:00:00Z','2026-11-05T21:30:00Z','2026-11-06T14:47:42Z']) {
  generalWorldDate=new Date(iso);frame(32);const expected=getWorldTime(generalWorldDate);
  assertAuditoriumClockFaces(outdoorAuditorium,expected,'life-size auditorium');
  assertAuditoriumClockFaces(deskAuditorium,expected,'desk auditorium');
}
generalWorldDate=new Date('2026-11-06T03:15:30Z');frame(32);
report.auditoriumClocks={facesPerModel:4,modelScales:2,testedJapanTimes:['12:00','03:00','06:00','09:00','06:30','23:47:42']};
checks.push('All four faces of both original auditoriums retain real moving hands; their base/tip geometry proves centre pivots and clockwise Japan time across six poses');


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
  assert.ok(position().distanceTo(new T.Vector3(HOME.seated.position[0], HOME.eyeHeight, HOME.seated.position[2])) < .25, 'Walk returns to the indoor seat position while standing');
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
// The default experience is seated. An explicit action raises only eye height;
// the existing walking fixture above opts into seated:false for route coverage.
let currentJapanDate = new Date('2026-11-06T03:15:30Z');
const seatedWorld = await pendingWorld({ defaultSeated: true, now: () => currentJapanDate });
seatedWorld.engine.setPaused(true); frame(3);
const seatedScene = seatedWorld.renderer.renders[0].scene, initialSeatCamera = seatedWorld.renderer.renders[0].camera;
const seatState = () => seatedWorld.engine.getState();
const seatPoint = () => { const p=seatState().position;return new T.Vector3(p.x,p.y,p.z); };
assert.deepEqual(seatPoint().toArray(),HOME.seated.position,'Default camera begins at the authored seated position');
const seatedBefore = seatPoint(), seatedDirection = initialSeatCamera.getWorldDirection(new T.Vector3());
seatedWorld.engine.setMovement({forward:1,right:1});seatedWorld.engine.look(1,.3);seatedWorld.engine.zoom(-1);
key(seatedWorld.canvas,'keydown','w');
pointer(seatedWorld.canvas,'pointerdown',300,300);pointer(seatedWorld.canvas,'pointermove',650,500);pointer(seatedWorld.canvas,'pointerup',650,500);
const seatedWheel=new Event('wheel',{cancelable:true});Object.assign(seatedWheel,{deltaY:-100});seatedWorld.canvas.dispatchEvent(seatedWheel);
assert.equal(seatedWheel.defaultPrevented,false,'A seated scene leaves native wheel scrolling available');
assert.equal(seatedWorld.engine.leave(),false);assert.equal(seatedWorld.engine.goToLandmark(LANDMARK_SITES[0].key),false);
frame(35);assert.deepEqual(seatPoint(),seatedBefore,'Movement, dragging, wheel and landmark routes cannot move the seated camera');
assert.ok(seatedWorld.renderer.renders.at(-1).camera.getWorldDirection(new T.Vector3()).distanceTo(seatedDirection)<1e-9,'Seated input preserves the initial desk view');
key(window,'keyup','w');
assert.equal(seatedWorld.engine.standUp(),true);assert.equal(seatState().posture,'standing-up');
const riseStart=milliseconds;let previousSeatPoint=seatPoint(),riseFrames=0;
while(seatState().posture==='standing-up'&&riseFrames<60) {
  seatedWorld.engine.setMovement({forward:1,right:1});frame();riseFrames++;
  const next=seatPoint();close(next.x,HOME.seated.position[0],1e-10,'Standing never jumps sideways');close(next.z,HOME.seated.position[2],1e-10,'Standing never jumps forward');
  assert.ok(next.y>=previousSeatPoint.y&&next.y-previousSeatPoint.y<.06,'Eye rises smoothly without a vertical teleport');previousSeatPoint=next;
}
assert.equal(seatState().posture,'walking');close(seatPoint().y,HOME.eyeHeight,1e-10,'Standing reaches physical eye height');
assert.ok(riseFrames>=12&&riseFrames<=35,'Standing spans the intended roughly .9-second transition');
assert.ok(milliseconds-riseStart>=850&&milliseconds-riseStart<1200,'Standing uses elapsed time instead of an instant camera swap');
assert.ok(seatedWorld.engine.leave(),'Standing unlocks walking to the garden');
let postureSteps=0;
while(seatState().travel&&postureSteps++<4000)frame();
assert.equal(seatState().mode,'outside');
const beforeSit=seatPoint();assert.ok(seatedWorld.engine.sitDown());assert.deepEqual(seatPoint(),beforeSit,'Sit down first routes home without teleporting X/Z');
previousSeatPoint=seatPoint();let loweringFrames=0;
while(seatState().posture!=='seated'&&postureSteps++<8000) {
  frame();const next=seatPoint();
  assert.ok(next.distanceTo(previousSeatPoint)<.19,'Returning to the seat remains a continuous physical walk');
  if(seatState().posture==='sitting-down'||next.y<HOME.eyeHeight-1e-6) {
    close(next.x,HOME.seated.position[0],1e-7,'Lowering begins only at the seat X');close(next.z,HOME.seated.position[2],1e-7,'Lowering begins only at the seat Z');
    assert.ok(next.y<=previousSeatPoint.y&&previousSeatPoint.y-next.y<.06,'Sitting lowers the eye smoothly');loweringFrames++;
  } else close(next.y,HOME.eyeHeight,1e-7,'The walk home keeps standing eye height');
  previousSeatPoint=next;
}
assert.equal(seatState().posture,'seated');assert.ok(loweringFrames>=12);assert.deepEqual(seatPoint().toArray(),HOME.seated.position);
assert.ok(seatedWorld.renderer.renders.at(-1).camera.quaternion.angleTo(initialSeatCamera.quaternion)<1e-6,'Sitting restores the authored initial desk view');
checks.push('Default first view is seated at 1.18 m with movement blocked; standing rises over .9 seconds without X/Z movement, and sitting walks home before lowering continuously');

await until(()=>seatedScene.getObjectByName('desk-okuma-auditorium'),'Delayed desk auditorium becomes available for current-time checks');
let seatedOutdoorAuditorium;
const seatedDeskAuditorium=seatedScene.getObjectByName('desk-okuma-auditorium');
const clockHour=seatedScene.getObjectByName('Wall hour hand'),clockMinute=seatedScene.getObjectByName('Wall minute hand');
const boundaryGroup=seatedScene.getObjectByName('Red brick garden walls and warm promenade lamps');
assert.ok(clockHour&&clockMinute&&boundaryGroup,'The real scene contains its moving clock and garden lights');
const gardenLights=[],groundPools=[];boundaryGroup.traverse(object=>{if(object.isPointLight)gardenLights.push(object);if(object.name==='Soft warm ground light pool')groundPools.push(object);});
assert.ok(gardenLights.every(light=>!light.visible),'Daylight-off lamps do not occupy material shader light slots');
assert.ok(gardenLights.length>=4&&gardenLights.length<=6,'Night uses a bounded number of actual streetlights');
assert.equal(groundPools.length,gardenLights.length);
for(const light of gardenLights){assert.equal(light.castShadow,false,'Streetlights add no cube shadow passes');assert.ok(light.distance>0&&light.distance<=16);assert.equal(light.intensity,0,'Streetlights are off at actual Japan noon');}
function checkActualTime(mode='auto') {
  const expected=getWorldTime(currentJapanDate,mode),actual=seatState().time;
  assert.equal(actual.dateISO,expected.dateISO);assert.equal(actual.label,expected.label);assert.equal(actual.timeZone,'Asia/Tokyo');assert.equal(actual.dateTime,currentJapanDate.toISOString());
  close(clockHour.rotation.z,expected.hourAngle,1e-10,'Real hour hand follows actual Japan seconds');close(clockMinute.rotation.z,expected.minuteAngle,1e-10,'Real minute hand follows actual Japan seconds');
  assertAuditoriumClockFaces(seatedDeskAuditorium,expected,'paused desk auditorium');
  if(seatedOutdoorAuditorium)assertAuditoriumClockFaces(seatedOutdoorAuditorium,expected,'paused life-size auditorium');

  assert.deepEqual(linearGradients.at(-1).stops,expected.skyStops,'Actual sky texture is painted from the same Japan-time lighting snapshot');
  close(seatedScene.environmentIntensity,expected.environmentIntensity,1e-10,'Environment reflection intensity follows the clock snapshot');
  close(seatedWorld.renderer.toneMappingExposure,expected.exposure,1e-10,'Rendering exposure follows the clock snapshot');
  return expected;
}
checkActualTime();
const minuteBefore=clockMinute.rotation.z,initialSky=seatedScene.background,clockDraws=seatedWorld.renderer.renders.length;
let initialSkyDisposals=0;initialSky.addEventListener('dispose',()=>initialSkyDisposals++);
currentJapanDate=new Date('2026-11-06T03:15:31Z');frame(32);checkActualTime();
assert.notEqual(clockMinute.rotation.z,minuteBefore,'A paused scene still advances real clock hands');assert.ok(seatedWorld.renderer.renders.length>clockDraws);
assert.equal(seatedScene.background,initialSky,'A clock-only second retains the same sky and its GPU caches');assert.equal(initialSkyDisposals,0);
const fixedClockDraws=seatedWorld.renderer.renders.length;frame(65);assert.equal(seatedWorld.renderer.renders.length,fixedClockDraws,'An unchanged clock and paused scene remain idle');
currentJapanDate=new Date('2026-11-06T09:15:00Z');frame(32);const evening=checkActualTime();assert.equal(evening.phase,'dusk');assert.notEqual(seatedScene.background,initialSky,'A lighting change replaces the identity used by Three cube-map and PMREM caches');assert.equal(seatedScene.environment,seatedScene.background);assert.equal(initialSkyDisposals,1,'Previous sky and its cached GPU maps are released exactly once');
const eveningSky=seatedScene.background;let eveningSkyDisposals=0;eveningSky.addEventListener('dispose',()=>eveningSkyDisposals++);
for(const light of gardenLights)assert.ok(light.intensity>0&&light.intensity<34,'Streetlights fade on during Japan dusk');
// Complete the outdoor factory after the clock has moved from noon to dusk.
// Newly attached hands must immediately use the fresh snapshot, not source pose
// or the time captured when the asynchronous request originally started.
const delayedClockLandmarks=await createWorldLandmarks(T);seatedWorld.model.resolve(delayedClockLandmarks);
await until(()=>seatState().landmarksReady,'Delayed outdoor clock geometry installs at actual dusk');
seatedOutdoorAuditorium=delayedClockLandmarks.targets.find(target=>target.id==='landmark-okuma-auditorium').object;
assertAuditoriumClockFaces(seatedOutdoorAuditorium,getWorldTime(currentJapanDate),'late-loaded dusk auditorium');

const beforeHidden=seatedWorld.renderer.renders.length;
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
currentJapanDate=new Date('2026-11-06T15:00:00Z');frame(40);assert.equal(seatedWorld.renderer.renders.length,beforeHidden,'Hidden scenes suspend clock drawing');
document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));frame();const midnight=checkActualTime();
assert.notEqual(seatedScene.background,eveningSky,'Returning to a newly dark sky refreshes the cached texture identity');assert.equal(eveningSkyDisposals,1);
assert.equal(midnight.dateISO,'2026-11-07');assert.equal(midnight.label,'00:00');assert.equal(midnight.phase,'night');
for(const light of gardenLights)assert.ok(light.intensity>=30,'Visible tab resumes with the actual midnight streetlight intensity');
assert.ok(gardenLights.every(light=>light.visible),'All six real street lights are active after dark');
for(const pool of groundPools){assert.ok(pool.visible&&pool.material.opacity>0&&pool.material.opacity<=.14);close(pool.getWorldPosition(new T.Vector3()).y,.0015,1e-7,'Lamp pool stays at ground contact');}
const lanternMaterials=new Set();boundaryGroup.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])if(/lantern glass|lantern.*bulb/i.test(material.name))lanternMaterials.add(material);});
assert.ok(lanternMaterials.size>=2);for(const material of lanternMaterials)assert.ok(material.emissiveIntensity>1,'Lantern glass and visible bulbs actually glow at night');
seatedWorld.engine.setLightingMode('day');frame();checkActualTime('day');for(const light of gardenLights)assert.equal(light.intensity,0);assert.equal(seatState().time.label,'00:00','Manual day preview does not falsify the clock');
seatedWorld.engine.setLightingMode('auto');frame();checkActualTime();for(const light of gardenLights)assert.ok(light.intensity>=30);
assert.ok(seatedWorld.events.some(value=>value.time?.label==='00:00'&&value.time?.dateISO==='2026-11-07'),'UI state receives the same fresh Japan date and time on resume');
report.seatedTime={riseFrames,loweringFrames,streetlights:gardenLights.length,resumedJapanDate:midnight.dateISO,resumedJapanTime:midnight.label};
checks.push('Room and all eight auditorium faces keep actual Japan time while paused, including late geometry and midnight tab resume; sky and lamps follow the same snapshot');
const finalSky=seatedScene.background;let finalSkyDisposals=0;finalSky.addEventListener('dispose',()=>finalSkyDisposals++);
seatedWorld.engine.dispose();assert.equal(frames.size,0);assert.equal(finalSkyDisposals,1,'Unmount releases the current sky cache once');

// Check physical masonry and its exact production collision boxes independently
// of the walking bounds, so an invisible numeric limit cannot stand in for a wall.
const boundaryFixture=createGardenBoundary(T,{bounds:WORLD_BOUNDS});boundaryFixture.group.updateMatrixWorld(true);
const boundaryObstacles=boundaryFixture.collisions.map(({box})=>({minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z}));
const cx=(WORLD_BOUNDS.minX+WORLD_BOUNDS.maxX)/2,cz=(WORLD_BOUNDS.minZ+WORLD_BOUNDS.maxZ)/2;
for(const [side,spawn,vector,inside] of [
  ['east',{x:WORLD_BOUNDS.maxX-3,z:cz,yaw:Math.PI/2},new T.Vector3(1,0,0),p=>p.x<=WORLD_BOUNDS.maxX-.7],
  ['west',{x:WORLD_BOUNDS.minX+3,z:cz,yaw:-Math.PI/2},new T.Vector3(-1,0,0),p=>p.x>=WORLD_BOUNDS.minX+.7],
  ['north',{x:cx,z:WORLD_BOUNDS.maxZ-3,yaw:0},new T.Vector3(0,0,1),p=>p.z<=WORLD_BOUNDS.maxZ-.7],
  ['south',{x:cx,z:WORLD_BOUNDS.minZ+3,yaw:Math.PI},new T.Vector3(0,0,-1),p=>p.z>=WORLD_BOUNDS.minZ+.7],
]) {
  for(const y of [.12,1.18,1.62,2.5]) {
    raycaster.set(new T.Vector3(spawn.x,y,spawn.z),vector);raycaster.far=4;
    const hit=raycaster.intersectObject(boundaryFixture.group,true).find(value=>value.object.isMesh&&!value.object.material?.transparent);
    assert.ok(hit&&hit.object.castShadow&&hit.object.receiveShadow,'Real opaque shadowed boundary blocks the '+side+' side at '+y+'m');
  }
  const walker=createWalkNavigation({bounds:WORLD_BOUNDS,obstacles:boundaryObstacles,spawn,radius:.20,eyeHeight:HOME.eyeHeight});walker.setInput({forward:1,right:0});for(let i=0;i<100;i++)walker.update(.05);
  assert.ok(inside(walker.getState().position),'The actual '+side+' wall stops walking before the outer numerical bound');walker.dispose();
}
raycaster.far=Infinity;
for(const {bounds} of worldBoxes)for(const obstacle of boundaryFixture.collisions)assert.ok(!bounds.intersectsBox(obstacle.box),'Garden masonry and lamps never intersect the complete original monuments');
const boundaryResources=watchResources(boundaryFixture.group);boundaryFixture.dispose();boundaryFixture.dispose();for(const count of boundaryResources.values())assert.equal(count,1,'Boundary and lamp resources dispose exactly once');
checks.push('Four real brick boundaries block rays and production walking at seated/standing heights, remain clear of original monuments and release resources once');

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
