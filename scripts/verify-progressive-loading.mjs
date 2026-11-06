import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import { StudyCanvasRenderer } from '../scene/study-software.js?v=20261106-craft1';
import { mountStudy } from '../scene/study.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';
import { roomPixelRatio } from '../scene/render-budget.js';

assert.equal(roomPixelRatio(390, 844, 3), 2, 'High-density phones keep the original crisp 2x render');
assert.ok(Math.abs(roomPixelRatio(1920, 1080, 2) - Math.sqrt(4200000 / (1920 * 1080))) < 1e-10);
assert.equal(roomPixelRatio(3840, 2160, 1), 1, 'Large screens never fall below their native CSS pixel resolution');

// Keep the actual room, supplied skeleton, controls, lifecycle and triangle
// picking. Only browser painting and image pixels are replaced in this test.
const ctx = new Proxy({}, {
  get(o, key) {
    if (key === 'createImageData' || key === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return text => ({ width: text.length * 10 });
    return o[key] ?? (() => {});
  },
  set(o, key, value) { o[key] = value; return true; },
});
class Canvas extends EventTarget {
  clientWidth = 1280; clientHeight = 800; width = 1280; height = 800; style = {};
  getContext(kind) { return kind === 'webgl2' ? null : ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
}
globalThis.document = Object.assign(new EventTarget(), {
  hidden: false, fonts: { ready: Promise.resolve() },
  createElement: () => new Canvas(),
  createElementNS: () => Object.assign(new EventTarget(), { style: {}, width: 1600, height: 900 }),
});
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1;
globalThis.window = new EventTarget(); globalThis.matchMedia = () => ({ matches: false });
T.TextureLoader.prototype.load = function (url, onLoad) {
  const texture = new T.Texture(); queueMicrotask(() => onLoad?.(texture)); return texture;
};
// Exercise the WebGL scheduling/picking path with the fallback's actual scene
// object, without pretending that this test measures GPU or rasterized quality.
Object.defineProperty(StudyCanvasRenderer.prototype, 'software', { get() { return false; }, set() {} });
const renders = new Map(), pendingFrames = new Map(), invalidations = new Map(); let nextId = 1, ms = 0;
const nativeInvalidate = StudyCanvasRenderer.prototype.invalidate;
StudyCanvasRenderer.prototype.invalidate = function () {
  invalidations.set(this.canvas, (invalidations.get(this.canvas) || 0) + 1);
  return nativeInvalidate.call(this);
};
globalThis.requestAnimationFrame = callback => { const id = nextId++; pendingFrames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => pendingFrames.delete(id);
StudyCanvasRenderer.prototype.render = function (scene, camera) {
  const previous = renders.get(this.canvas); scene.updateMatrixWorld(true); camera.updateMatrixWorld();
  renders.set(this.canvas, { scene, camera: camera.clone(), calls: (previous?.calls || 0) + 1, pixelRatio: this.getPixelRatio() });
};
function frame(count = 1) {
  for (let i = 0; i < count; i++) {
    const callbacks = [...pendingFrames.values()]; assert.ok(callbacks.length, 'The live room schedules its next frame');
    pendingFrames.clear(); ms += 33; callbacks.forEach(callback => callback(ms));
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function deadline(promise) {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('The room mount waited for an unresolved cat request')), 5000); })]); }
  finally { clearTimeout(timeout); }
}
async function mountPending() {
  const initial = deferred(), full = deferred(), canvas = new Canvas(), events = [], errors = [], requested = [];
  let ready = 0;
  canvas.addEventListener('roomcatchange', event => events.push(event.detail));
  const engine = await deadline(mountStudy({
    canvas, pins: { querySelectorAll: () => [] }, now: () => new Date('2026-11-06T12:00:00+09:00'),
    loadCat(detail = 'room') { requested.push(detail); return detail === 'full' ? full.promise : initial.promise; },
    onSelect() {}, onError(error) { errors.push(error); }, onReady() { ready++; },
  }));
  engine.setPaused(true); await settle(); frame(3);
  const rendered = renders.get(canvas);
  assert.ok(rendered?.calls > 0, 'Room frames draw while the cat request is still unresolved');
  assert.equal(ready, 1, 'Room readiness does not depend on downloading/decoding the cat');
  assert.deepEqual(errors, []); assert.deepEqual(requested, ['room']);
  assert.equal(engine.getCatState().ready, false);
  assert.ok(!engine.getActions().some(action => action.kind === 'cat-life'), 'Pending cats have no enabled action');
  const room = rendered.scene.getObjectByName('A quiet room for learning'); assert.ok(room);
  assert.equal(room.getObjectByName('Original Waseda and Karatsu desk miniatures').children.length, 4);
  const cat = room.getObjectByName('Wandering tabby cat'); assert.ok(cat);
  assert.equal(cat.children.length, 0); assert.equal(room.getObjectByName('Cat floor contact').visible, false);
  engine.setFreeMovement(true); const beforeInspect = renders.get(canvas).calls;
  engine.inspect('cat'); frame();
  assert.equal(room.visible, true, 'Pending-cat inspection must leave the working room visible');
  assert.equal(rendered.scene.getObjectByName('360 degree inspection').visible, false);
  assert.ok(renders.get(canvas).calls >= beforeInspect);
  return { engine, canvas, initial, full, events, errors, requested, room, cat };
}
function pointer(canvas, type, x, y) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  canvas.dispatchEvent(event);
}

const loaded = await mountPending(), supplied = await loadTabbyFixture();
const callsBeforeInstall = renders.get(loaded.canvas).calls;
const invalidationsBeforeInstall = invalidations.get(loaded.canvas);
loaded.initial.resolve(supplied); await settle();
assert.ok(invalidations.get(loaded.canvas) > invalidationsBeforeInstall, 'Installation invalidates the paused renderer before any pointer event');
assert.equal(loaded.engine.getCatState().ready, true); assert.deepEqual(loaded.events, [{ ready: true }]);
assert.equal(supplied.scene.parent, loaded.cat); assert.equal(loaded.room.getObjectByName('Cat floor contact').visible, true);
const action = loaded.engine.getActions().find(value => value.kind === 'cat-life'); assert.ok(action);
// The deferred result must refit click geometry immediately, even before a
// subsequent paused frame has had an opportunity to perform a revision check.
const body = supplied.scene.getObjectByName('Cat_•_continuous_anatomical_surface'); assert.ok(body?.isSkinnedMesh);
let clicked = false;
// Cat actions deliberately keep the room camera in place, so viewchange has
// no focusedAction ID. Its real onActivate reaction is the observable result.
loaded.cat.userData.catState = 'awaiting-click';
const camera = renders.get(loaded.canvas).camera, center = new T.Box3().setFromObject(body, true).getCenter(new T.Vector3());
const points = [center];
const positions = body.geometry.attributes.position;
for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 24))) points.push(body.getVertexPosition(i, new T.Vector3()).applyMatrix4(body.matrixWorld));
for (const point of points) {
  const projected = point.clone().project(camera);
  if (Math.abs(projected.x) >= .98 || Math.abs(projected.y) >= .98 || projected.z < -1 || projected.z > 1) continue;
  const x = (projected.x + 1) * 640, y = (1 - projected.y) * 400;
  pointer(loaded.canvas, 'pointerdown', x, y); pointer(loaded.canvas, 'pointerup', x, y);
  clicked = loaded.cat.userData.catState === 'look';
  if (clicked) break;
}
assert.equal(clicked, true, 'A newly installed cat can be selected with real pointer triangle picking while paused');
frame(); assert.ok(renders.get(loaded.canvas).calls > callsBeforeInstall, 'The paused room redraws after the original cat arrives');
loaded.engine.inspect('cat'); frame();
assert.equal(loaded.room.visible, false, 'The loaded cat becomes inspectable');
assert.ok(loaded.requested.includes('full'), 'Close inspection retains the progressive full-detail request');
for (const [width, height, dpr] of [[1920, 1080, 2], [390, 844, 3], [3840, 2160, 1]]) {
  loaded.canvas.clientWidth = width; loaded.canvas.clientHeight = height; globalThis.devicePixelRatio = dpr;
  window.dispatchEvent(new Event('resize')); frame();
  assert.equal(renders.get(loaded.canvas).pixelRatio, roomPixelRatio(width, height, dpr), 'Live resize applies the framebuffer budget');
}
// Moving the same CSS-size window between displays can change only DPR. A
// paused room still needs one redraw after the framebuffer is resized, then
// must return to doing no redundant draws once that frame has settled.
loaded.canvas.clientWidth = 1920; loaded.canvas.clientHeight = 1080; globalThis.devicePixelRatio = 2;
window.dispatchEvent(new Event('resize')); frame(); await settle(); frame(2);
const beforeDprChange = renders.get(loaded.canvas).calls;
globalThis.devicePixelRatio = 1; window.dispatchEvent(new Event('resize')); frame();
assert.ok(renders.get(loaded.canvas).calls > beforeDprChange, 'A DPR-only resize redraws a settled paused room');
assert.equal(renders.get(loaded.canvas).pixelRatio, 1);
const afterDprChange = renders.get(loaded.canvas).calls;
frame(3); assert.equal(renders.get(loaded.canvas).calls, afterDprChange, 'Unchanged paused frames stop redrawing after the DPR update');
globalThis.devicePixelRatio = 1;
loaded.engine.dispose(); assert.equal(pendingFrames.size, 0);

const failed = await mountPending(), warnings = [], previousWarn = console.warn;
try {
  console.warn = (...values) => warnings.push(values);
  failed.initial.reject(new Error('Simulated cat download failure')); await settle(); frame();
} finally { console.warn = previousWarn; }
assert.equal(failed.engine.getCatState().ready, false); assert.equal(failed.room.visible, true);
assert.ok(!failed.engine.getActions().some(action => action.kind === 'cat-life'));
assert.deepEqual(failed.events, []); assert.deepEqual(failed.errors, []);
assert.equal(warnings.length, 1, 'A failed optional cat reports once without failing the room');
failed.engine.dispose(); assert.equal(pendingFrames.size, 0);

const departed = await mountPending(), late = await loadTabbyFixture();
const geometries = new Set(), materials = new Set(), textures = new Set();
late.scene.traverse(object => {
  if (object.geometry) geometries.add(object.geometry);
  for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
    materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  }
});
let disposedGeometry = 0, disposedMaterials = 0, disposedTextures = 0;
geometries.forEach(value => value.addEventListener('dispose', () => disposedGeometry++));
materials.forEach(value => value.addEventListener('dispose', () => disposedMaterials++));
textures.forEach(value => value.addEventListener('dispose', () => disposedTextures++));
departed.engine.dispose(); const departedRenders = renders.get(departed.canvas).calls;
departed.initial.resolve(late); await settle();
assert.ok(geometries.size > 0); assert.equal(disposedGeometry, geometries.size);
assert.equal(disposedMaterials, materials.size); assert.equal(disposedTextures, textures.size);
assert.equal(late.scene.parent, null); assert.equal(departed.cat.children.length, 0);
assert.deepEqual(departed.events, []); assert.equal(pendingFrames.size, 0);
assert.equal(renders.get(departed.canvas).calls, departedRenders, 'A late response cannot redraw or resurrect a disposed room');

console.log(JSON.stringify({ result: 'PASS', checks: [
  'Phone/Retina/4K sizing and DPR-only paused resize redraw once, then return to no redundant draws',
  'Room draws, original four miniatures and readiness before an unresolved cat request',
  'Pending cat inspection/actions guarded without hiding the room',
  'Real delayed GLB installation enables immediate paused triangle picking and redraw',
  'Loaded cat inspection retains the full-detail progressive request',
  'Download failure retains usable room and emits no false ready event',
  'Late response after disposal frees all geometry/materials/textures without resurrection',
] }, null, 2));
