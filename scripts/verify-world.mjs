import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from '../js/vendor/three.module.min.js';
import { createWorldLandscape } from '../scene/world-landscape.js';
import { createWorldLandmarks } from '../scene/world-landmarks.js';
import { createOkumaAuditorium } from '../js/models/okuma-auditorium.js';
import { createOkumaStatue } from '../js/models/okuma-statue.js';
import { createKaratsuCastle } from '../js/models/karatsu-castle.js';
import { createKaratsuBank } from '../js/models/karatsu-bank.js';
import { createWorldNavigation } from '../scene/world-navigation.js';
import { mountWorld } from '../scene/world.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';
import * as WorldThree from '../scene/world-three.js';

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
assert.equal(typeof landscape.then, 'undefined', 'Terrain construction must complete synchronously');
assert.deepEqual(requests, [], 'Terrain never requests an image or model');
assert.ok(landscape.stats.triangles < 100000, 'The first terrain frame has a bounded triangle budget');
assert.ok(landscape.stats.draws < 24, 'The first terrain frame has a bounded draw budget');
assert.ok(landscape.cameraPlan.platformBounds.min[0] <= -24 && landscape.cameraPlan.platformBounds.max[0] >= 24);
assert.ok(landscape.sea.userData.worldSea && landscape.sea.receiveShadow, 'The sea remains a physical shadow receiver');
assert.ok(!landscape.group.children.some(object => object.isLight), 'Landscape creates no additional lighting passes');
const groundRays = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
function support(x, z) {
  groundRays.set(new T.Vector3(x, 50, z), down);
  return groundRays.intersectObject(landscape.group, true).find(hit => hit.object.isMesh);
}
for (const [x, z] of [[-20, -17], [20, -17], [-20, 12], [20, 12], [0, 4]]) {
  const hit = support(x, z); assert.ok(hit, 'The main explorable terrace is continuous');
  assert.ok(hit.object.receiveShadow, 'The main walking surface receives true WebGL shadows');
  close(hit.point.y, .05, .015, 'Walking support stays on the paved terrace');
}
checks.push('Synchronous terrain with no external requests; bounded geometry/draws, continuous shadow-receiving plaza');

let deadline;
const landmarks = await Promise.race([
  createWorldLandmarks(T),
  new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Monuments waited for fonts or another unresolved asset')), 8000); }),
]).finally(() => clearTimeout(deadline));
assert.deepEqual(requests, [], 'Original monuments must not request external assets to become visible');
const expected = [
  ['landmark-okuma-auditorium', 'Okuma auditorium architecture', createOkumaAuditorium, [-12, -7]],
  ['landmark-karatsu-castle', 'Five-tier keep', createKaratsuCastle, [13, -9]],
  ['landmark-karatsu-bank', 'Landmark architecture', createKaratsuBank, [9, 8]],
  ['landmark-okuma-statue', 'Okuma statue monument', createOkumaStatue, [-4, 5]],
];
assert.deepEqual(landmarks.targets.map(target => target.id), expected.map(([id]) => id));
const worldBoxes = [];
for (const [id, architectureName, factory, position] of expected) {
  const target = landmarks.targets.find(value => value.id === id), actual = target.object.getObjectByName(architectureName);
  assert.ok(actual, 'Complete original architecture remains named: ' + id);
  assert.equal(target.object.position.x, position[0]); assert.equal(target.object.position.z, position[1]);
  assert.ok(target.anchor.toArray().every(finite));
  const sourceModel = factory(T), source = sourceModel.architecture || sourceModel.group.getObjectByName(architectureName);
  assert.ok(source); source.removeFromParent();
  const before = geometrySummary(source), after = geometrySummary(actual);
  assert.equal(after.triangles, before.triangles, 'No original architectural triangles are removed: ' + id);
  assert.equal(after.vertices, before.vertices, 'Original triangle topology is retained: ' + id);
  for (let axis = 0; axis < 3; axis++) {
    close(after.bounds.min.getComponent(axis), before.bounds.min.getComponent(axis), 5e-5, 'Original architecture minimum');
    close(after.bounds.max.getComponent(axis), before.bounds.max.getComponent(axis), 5e-5, 'Original architecture maximum');
    close(after.sum[axis] / after.vertices, before.sum[axis] / before.vertices, 2e-5, 'Original vertex position mean');
    close(after.square[axis] / after.vertices, before.square[axis] / before.vertices, .002, 'Original vertex position second moment');
  }
  const body = actual.parent;
  close(body.scale.x, body.scale.y, 1e-12, 'Architecture keeps a uniform scale');
  close(body.scale.y, body.scale.z, 1e-12, 'Architecture keeps a uniform scale');
  target.object.traverse(object => {
    if (!object.isMesh) return;
    assert.ok(object.castShadow && object.receiveShadow, 'Every retained monument surface participates in real shadows');
    assert.equal(object.userData.targetId, id, 'Visible monument triangles retain their navigation target');
  });
  const bounds = new T.Box3().setFromObject(target.object), ground = support(position[0], position[1]);
  assert.ok(ground, 'Each foundation stands over real terrain');
  assert.ok(bounds.min.y - ground.point.y >= -.005 && bounds.min.y - ground.point.y <= .005,
    'Foundation contact remains within 5 mm of the real terrain: ' + id + ' gap=' + (bounds.min.y - ground.point.y));
  const upper = landscape.cameraPlan.platformBounds;
  assert.ok(bounds.min.x >= upper.min[0] && bounds.max.x <= upper.max[0] && bounds.min.z >= upper.min[2] && bounds.max.z <= upper.max[2], 'Every monument fits entirely on the main terrace');
  worldBoxes.push({ id, bounds });
  const sourceResources = resources(source);
  for (const set of Object.values(sourceResources)) set.forEach(resource => resource.dispose());
}
for (let a = 0; a < worldBoxes.length; a++) for (let b = a + 1; b < worldBoxes.length; b++) {
  assert.ok(!worldBoxes[a].bounds.intersectsBox(worldBoxes[b].bounds), 'Independent world monuments never intersect');
}
const auditorium = landmarks.targets[0].object.getObjectByName('Okuma auditorium architecture');
for (let face = 1; face <= 4; face++) assert.ok(auditorium.getObjectByName('Clock face ' + face), 'All four authored clock faces remain');
assert.ok(landmarks.stats.total.drawCalls < 160, 'Complete world monuments remain statically batched');
checks.push('Four complete original architectures retain triangles, shape moments, uniform scale, clock faces and target IDs');
checks.push('All four foundations physically contact real terrain, fit within the terrace and remain mutually separated');

const preservedFiles = ['js/models/okuma-auditorium.js', 'js/models/okuma-statue.js', 'js/models/karatsu-castle.js', 'js/models/karatsu-bank.js'];
report.sourceSha256 = Object.fromEntries(await Promise.all(preservedFiles.map(async path => [path, createHash('sha256').update(await readFile(new URL('../' + path, import.meta.url))).digest('hex')])));
for (const path of ['scene/world.js', 'scene/world-landscape.js', 'scene/world-landmarks.js', 'scene/world-navigation.js', 'scene/cat-life.js', 'scene/surface-materials.js', 'scene/static-batching.js', ...preservedFiles]) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  for (const [, name] of source.matchAll(/\bT\.([A-Z]\w*)/g)) assert.ok(name in WorldThree, 'The tree-shaken runtime exports every factory dependency: ' + path + ' T.' + name);
}
checks.push('The explicit Three.js runtime exports every constructor/constant needed by lazy factories');
report.landscape = landscape.stats; report.landmarks = landmarks.stats.total;
for (const owner of [landmarks, landscape]) {
  const owned = resources(owner.group), counts = new Map();
  for (const set of Object.values(owned)) for (const resource of set) {
    counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  owner.dispose();
  for (const [resource, count] of counts) assert.equal(count, 1, 'Every world-owned resource is released exactly once: ' + resource.type);
  owner.dispose();
  for (const count of counts.values()) assert.equal(count, 1, 'World resource disposal is idempotent');
}
checks.push('Terrain/monument geometry, materials and procedural textures release exactly once');

// Exercise production scheduling, controls and ownership with the real scene.
// Only the renderer is replaced; no browser context or GPU output is implied.
class Canvas extends EventTarget {
  clientWidth = 1280; clientHeight = 800; style = {};
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
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
  for (let i = 0; i < count; i++) { const callbacks = [...frames.values()]; frames.clear(); milliseconds += 34; callbacks.forEach(callback => callback(milliseconds)); }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate, message) {
  const deadline = performance.now() + 5000;
  while (!predicate()) { assert.ok(performance.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const runtimeRequests = [];
T.TextureLoader.prototype.load = function (url) { runtimeRequests.push(url); return new T.Texture(); };
function pointer(canvas, type, x, y, id = 1) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { button: 0, pointerId: id, clientX: x, clientY: y }); canvas.dispatchEvent(event); return event;
}
function keyboard(canvas, key, extras = {}) {
  const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, ...extras }); canvas.dispatchEvent(event); return event;
}
async function pendingWorld() {
  const canvas = new Canvas(), renderer = new Renderer(canvas), model = deferred(), initialCat = deferred(), fullCat = deferred();
  const calls = [], errors = [], progress = [], selected = [], events = []; let ready = 0;
  canvas.addEventListener('worldstate', event => events.push(event.detail));
  const pending = mountWorld({ canvas, rendererFactory: () => renderer, reducedMotion: false,
    loadLandmarks() { calls.push('landmarks'); return model.promise; },
    loadCat(detail, options) { calls.push('cat-' + detail); return (detail === 'full' ? fullCat : initialCat).promise; },
    onReady() { ready++; }, onError(error) { errors.push(error); }, onProgress(value) { progress.push(value); }, onSelect(id) { selected.push(id); },
  });
  assert.equal(renderer.renders.length, 1, 'The real terrain frame is drawn synchronously before mount returns a Promise');
  assert.deepEqual(calls, [], 'No monument/cat request runs before the first terrain draw');
  const engine = await pending; engine.setPaused(true);
  frame(); await settle();
  assert.deepEqual(calls, ['landmarks']); assert.equal(ready, 0);
  frame(3); assert.ok(renderer.renders.length >= 2, 'The world remains drawable while all models are unresolved');
  assert.equal(engine.getState().landmarksReady, false); assert.equal(engine.getState().catReady, false);
  assert.deepEqual(errors, []);
  return { canvas, renderer, engine, model, initialCat, fullCat, calls, errors, progress, selected, events, get ready() { return ready; } };
}
const running = await pendingWorld(), liveMonuments = await createWorldLandmarks(T);
running.model.resolve(liveMonuments); await until(() => running.ready === 1, 'The architecture-only hero frame must become ready without any image callback');
assert.ok(running.engine.getState().landmarksReady && !running.engine.getState().catReady);
assert.equal(running.renderer.renders.at(-1).scene.getObjectByName('Waseda and Karatsu · landscape architecture'), liveMonuments.group);
await until(() => running.calls.includes('cat-world'), 'Cat loading starts independently after the useful hero frame');
assert.deepEqual(running.errors, []);
const worldScene = running.renderer.renders.at(-1).scene, directional = worldScene.children.find(object => object.isDirectionalLight);
assert.ok(directional?.castShadow && directional.shadow.mapSize.x >= 2048, 'The runtime uses an actual directional shadow caster');
assert.ok(running.renderer.shadowMap.enabled && running.renderer.shadowMap.type === T.PCFSoftShadowMap);
assert.ok(running.renderer.renders.some(draw => draw.shadowUpdate), 'Shadow maps are requested for initial/asset frames');
directional.updateWorldMatrix(true, false); directional.target.updateWorldMatrix(true, false); directional.shadow.updateMatrices(directional);
for (const { id, bounds } of worldBoxes) for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
  const projected = new T.Vector3(x, y, z).project(directional.shadow.camera);
  assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1, 'The real shadow frustum contains every original monument: ' + id);
}
checks.push('Production runtime renders real terrain before requests, then a complete architecture hero without waiting for images/fonts/cat');
checks.push('Real directional shadow settings and frustum cover every complete monument over the receiving terrain');

const asset = await loadTabbyFixture(new URL('../models/tabby-cat-world.glb', import.meta.url));
running.initialCat.resolve(asset); await until(() => running.engine.getState().catReady, 'The actual supplied skeleton installs after the independent cat request');
frame(3);
const catHolder = worldScene.getObjectByName('Original tabby · coastal promenade'), liveCat = catHolder.getObjectByName('Wandering tabby cat');
assert.ok(liveCat && asset.scene.parent === liveCat, 'The runtime retains the supplied animated GLB');
assert.ok(asset.animations.some(clip => clip.name === 'Walk') && asset.scene.getObjectByName('Cat_•_continuous_anatomical_surface')?.isSkinnedMesh);
const sourceCatBounds = new T.Box3().setFromObject(asset.scene, true);
assert.ok(sourceCatBounds.getSize(new T.Vector3()).length() > 2, 'The overview cat remains deliberately large enough to see');
const catContact = catHolder.getObjectByName('Cat floor contact'), contactPosition = catContact.getWorldPosition(new T.Vector3());
assert.ok(contactPosition.y >= .05 && contactPosition.y <= .06, 'The cat contact shadow stays above its actual opaque support');
running.engine.focus('cat'); frame();
await until(() => running.calls.includes('cat-full'), 'Focused cat requests its original full-detail source');
running.engine.reset(); frame();
const full = await loadTabbyFixture('full'); running.fullCat.resolve(full); await settle(); frame();
assert.equal(asset.scene.parent, liveCat, 'A full-detail request completed after reset cannot replace the efficient world LOD');
assert.equal(full.scene.parent, null, 'The detailed groom remains cached while viewing the whole landscape');
running.engine.focus('cat'); frame();
assert.equal(full.scene.parent, liveCat, 'Returning to the close cat view reuses full detail');
running.engine.reset(); frame();
assert.equal(asset.scene.parent, liveCat, 'Reset restores the world LOD after a completed close-up');
checks.push('Real supplied cat/skeleton, visible overview scale, above-ground contact, and full/world LOD ownership across reset');

// Pause, monitor/DPR changes, touch cancellation and browser shortcut behavior.
frame(4); const stableDraws = running.renderer.renders.length;
frame(12); assert.equal(running.renderer.renders.length, stableDraws, 'An unchanged paused world does no redraw work');
globalThis.devicePixelRatio = 2; window.dispatchEvent(new Event('resize')); frame();
assert.equal(running.renderer.renders.length, stableDraws + 1, 'A DPR-only resize redraws the otherwise paused framebuffer');
assert.ok(running.renderer.renders.at(-1).ratio > 1); globalThis.devicePixelRatio = 1;
const beforeKey = running.renderer.renders.at(-1).camera.position.clone();
assert.equal(keyboard(running.canvas, 'ArrowLeft', { ctrlKey: true }).defaultPrevented, false);
frame(); assert.deepEqual(running.renderer.renders.at(-1).camera.position, beforeKey, 'Browser-modified keys never move the world');
keyboard(running.canvas, 'ArrowLeft'); frame(); assert.notDeepEqual(running.renderer.renders.at(-1).camera.position, beforeKey);
const beforePinch = running.renderer.renders.at(-1).camera.position.clone();
pointer(running.canvas, 'pointerdown', 300, 300, 1); pointer(running.canvas, 'pointerdown', 500, 300, 2);
pointer(running.canvas, 'pointermove', 600, 300, 2); frame();
assert.notDeepEqual(running.renderer.renders.at(-1).camera.position, beforePinch, 'Real two-pointer pinch changes the world lens');
pointer(running.canvas, 'pointercancel', 300, 300, 1); pointer(running.canvas, 'pointerup', 600, 300, 2);
assert.deepEqual(running.selected, [], 'Canceled/multitouch gestures never become navigation clicks');
const hiddenDraws = running.renderer.renders.length; document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); frame(3);
assert.equal(running.renderer.renders.length, hiddenDraws, 'Background tabs suspend all world rendering');
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); frame();
assert.ok(running.renderer.renders.length > hiddenDraws, 'Visible tabs refresh their world once');
checks.push('Pause suppresses redraws, DPR-only resize redraws, browser shortcuts stay native, pinch/cancel and background suspension work');

running.engine.dispose(); assert.equal(running.renderer.disposed, 1);
const disposedFrames = running.renderer.renders.length; frame(4); assert.equal(running.renderer.renders.length, disposedFrames);
assert.equal(frames.size, 0, 'Disposal cancels every continuing animation callback');
const departed = await pendingWorld(), lateMonuments = await createWorldLandmarks(T);
departed.engine.dispose(); let releasedMonuments = 0;
const originalDispose = lateMonuments.dispose; lateMonuments.dispose = () => { releasedMonuments++; originalDispose(); };
departed.model.resolve(lateMonuments); await settle();
assert.equal(releasedMonuments, 1); assert.equal(departed.ready, 0); assert.ok(!departed.calls.some(call => call.startsWith('cat-')));
const contextLost = await pendingWorld(), lostMonuments = await createWorldLandmarks(T);
const contextEvent = new Event('webglcontextlost', { cancelable: true });
contextLost.canvas.dispatchEvent(contextEvent);
assert.equal(contextEvent.defaultPrevented, true); assert.equal(contextLost.errors.length, 1);
let lostReleased = 0; const lostDispose = lostMonuments.dispose;
lostMonuments.dispose = () => { lostReleased++; lostDispose(); };
contextLost.model.resolve(lostMonuments); await settle();
assert.equal(contextLost.ready, 0, 'A model completed after context loss must not declare the dead canvas ready');
assert.equal(lostReleased, 1, 'Context loss releases a later monument response');
const lostDraws = contextLost.renderer.renders.length;
document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); frame(3);
assert.equal(contextLost.renderer.renders.length, lostDraws, 'Visibility changes never restart a lost graphics context');
contextLost.engine.dispose();
const fallbackErrors = [];
const fallback = await mountWorld({ canvas: new Canvas(), reducedMotion: true, rendererFactory() { throw new Error('Simulated unavailable WebGL'); }, onError(error) { fallbackErrors.push(error); } });
assert.equal(fallback.getState().webgl, false); assert.equal(fallbackErrors.length, 1); assert.equal(frames.size, 0);
fallback.dispose();
checks.push('Disposed/lost-context worlds cannot resurrect from delayed models or visibility changes; unavailable WebGL keeps the poster without CPU rendering');

const nav = createWorldNavigation(T);
nav.setObstacles(worldBoxes.map(({ id, bounds }) => ({ id, box: bounds })));
let cameraObstacleSamples = 0;
for (const aspect of [320 / 568, 390 / 844, 1280 / 800, 2560 / 1440]) {
  nav.resize(aspect); nav.reset();
  for (const zoom of [-1000, 1000]) {
    nav.zoom(zoom);
    for (let rotation = 0; rotation < 64; rotation++) {
      const view = nav.rotate(Math.PI / 16, rotation % 2 ? 100 : -100);
      assert.ok([...view.position, ...view.target].every(finite), 'World navigation remains finite under extreme controls');
      assert.ok(view.position.y >= .6, 'Free orbit never falls below the coastal walking surface');
    }
  }
  for (const subject of worldBoxes) for (const zoom of [0, -100, 100]) for (const pitch of [-100, 100]) {
    nav.focus(subject.id, subject.bounds); nav.zoom(zoom); nav.rotate(0, pitch);
    for (let turn = 0; turn < 64; turn++) {
      const view = nav.rotate(Math.PI / 32, 0); cameraObstacleSamples++;
      for (const obstacle of worldBoxes) assert.ok(!obstacle.bounds.containsPoint(view.position),
        'A close orbit must never enter any original monument: viewing ' + subject.id + ', intersecting ' + obstacle.id);
    }
  }
}
report.cameraObstacleSamples = cameraObstacleSamples;
checks.push('Landscape camera stays finite, above terrain and outside every monument across mobile/desktop aspect ratios and extreme orbit/zoom');
const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const menu = homepage.match(/<nav\b[^>]*id="navigation"[\s\S]*?<\/nav>/)?.[0] || '';
for (const href of ['profile.html', 'research.html', 'blog.html', 'photos.html', 'contact.html']) assert.ok(menu.includes('href="' + href + '"'), 'Native page links work before JavaScript: ' + href);
assert.ok(!/js\/study-ui|scene\/study|loading-note|fonts\.googleapis|modulepreload/.test(homepage), 'The new homepage never starts old room, image/font-gated loading or module preloads');
for (const file of ['images/world/poster.webp', 'images/world/poster-mobile.webp']) {
  assert.ok(homepage.includes(file), 'Responsive world stills are declared directly in initial HTML');
  const bytes = await readFile(new URL('../' + file, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.ok(bytes.length < 160000, 'Initial-world stills remain small enough to arrive promptly');
}
assert.ok(/<img\b[^>]*fetchpriority="high"/.test(homepage));
checks.push('Immediate native navigation, small responsive shadowed-world stills and no old loading/module/font gate in initial HTML');
console.log(JSON.stringify({ result: 'PASS', checks, ...report }, null, 2));
