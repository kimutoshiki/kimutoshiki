import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import { createPhotoWall } from '../scene/photo-wall.js';
import { createWallNavigation, WALL_LINKS } from '../scene/wall-navigation.js';

const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
T.TextureLoader.prototype.load = () => new T.Texture();
const room = new T.Group(), palette = { darkWood: new T.MeshStandardMaterial(), brass: new T.MeshStandardMaterial() };
const photos = createPhotoWall(T, { room, palette, targets: [] });
const menu = createWallNavigation(T, { room });
room.updateMatrixWorld(true);
let writes = 0, selectors = 0, worldUpdates = 0, frustumUpdates = 0;
const nativeWorldUpdate = T.Object3D.prototype.updateWorldMatrix;
T.Object3D.prototype.updateWorldMatrix = function (...args) { worldUpdates++; return nativeWorldUpdate.apply(this, args); };
const nativeFrustumUpdate = T.Frustum.prototype.setFromProjectionMatrix;
T.Frustum.prototype.setFromProjectionMatrix = function (...args) { frustumUpdates++; return nativeFrustumUpdate.apply(this, args); };
function createAnchors() {
  const anchors = new Map(WALL_LINKS.map(link => [link.id, {
    style: new Proxy({}, { set(object, key, value) { writes++; object[key] = value; return true; } }),
    classList: { toggle() {} },
  }]));
  return { anchors, container: { querySelector(selector) { selectors++; return anchors.get(selector.match(/"(.*?)"/)[1]); } } };
}
let { anchors, container } = createAnchors();
const camera = new T.PerspectiveCamera(50, 1280 / 720, .025, 80);
camera.position.set(0, 3.48, 8.24); camera.lookAt(0, 2.98, -.35); camera.updateMatrixWorld();
let visibleLinks = 0, photoChecks = 0;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message);
function checkProjection(width, height, hidden = false) {
  menu.update(camera, container, width, height, { hidden });
  for (const target of menu.targets) {
    const link = anchors.get(target.key), center = new T.Vector3().setFromMatrixPosition(target.object.matrixWorld);
    const normal = new T.Vector3(0, 0, 1).transformDirection(target.object.matrixWorld);
    // Independent original two-matrix projection, without cached world corners.
    const points = target.corners.map(corner => {
      const point = corner.clone().applyMatrix4(target.object.matrixWorld).project(camera);
      return { x: (point.x * .5 + .5) * width, y: (-point.y * .5 + .5) * height, z: point.z };
    });
    const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
    const off = hidden || normal.dot(camera.position.clone().sub(center)) <= 0 || points.every(point => point.z < -1 || point.z > 1) || maxX < 0 || minX > width || maxY < 0 || minY > height;
    assert.equal(link.style.visibility, off ? 'hidden' : 'visible'); assert.equal(link.tabIndex, off ? -1 : 0);
    if (off) continue;
    visibleLinks++;
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    close(parseFloat(link.style.left), minX, 'Link x matches the original projection');
    close(parseFloat(link.style.top), minY, 'Link y matches the original projection');
    close(parseFloat(link.style.width), w, 'Link width is unchanged');
    close(parseFloat(link.style.height), h, 'Link height is unchanged');
    const outline = [...link.style.clipPath.matchAll(/(-?[\d.e+-]+)%/g)].map(match => Number(match[1]));
    assert.equal(outline.length, points.length * 2);
    points.forEach((point, index) => {
      close(outline[index * 2], (point.x - minX) / w * 100, 'Silhouette x is unchanged');
      close(outline[index * 2 + 1], (point.y - minY) / h * 100, 'Silhouette y is unchanged');
    });
  }
}
function checkPhotoVisibility() {
  const frustum = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const expected = new Map();
  for (const record of [...photos.frames, ...photos.atlas.panels]) {
    const object = record.frame || record.panel;
    const center = new T.Vector3().setFromMatrixPosition(object.matrixWorld);
    const normal = new T.Vector3(0, 0, 1).transformDirection(object.matrixWorld);
    expected.set(record, record.queued || (normal.dot(camera.position.clone().sub(center)) > 0 && frustum.intersectsObject(record.image)));
  }
  photos.update(camera);
  for (const [record, shouldQueue] of expected) { assert.equal(record.queued, shouldQueue, 'Cached sphere preserves exact photo/map lazy-load eligibility'); photoChecks++; }
}
checkPhotoVisibility(); checkProjection(1280, 720);

// A changed room transform invalidates spatial caches even with the same camera.
room.position.set(.18, .04, -.06); room.rotation.y = .06; room.updateMatrixWorld(true);
checkPhotoVisibility(); checkProjection(1280, 720);
room.position.set(0, 0, 0); room.rotation.y = 0; room.updateMatrixWorld(true);

// Camera movement, lens zoom, viewport resize and inspection hide/show all keep
// the same pixel coordinates, silhouette and image-loading decisions.
for (const [width, height] of [[1280, 720], [390, 844], [320, 568]]) {
  camera.aspect = width / height;
  for (const zoom of [.65, 1, 2.4]) {
    camera.zoom = zoom; camera.updateProjectionMatrix();
    for (const look of [[0, 3, -1.4], [-2, 4, -1.4], [6.3, 3.7, 4.1], [-6.3, 3.7, 4.1], [1.4, 3.7, 9.3]]) {
      camera.lookAt(...look); camera.updateMatrixWorld();
      checkPhotoVisibility(); checkProjection(width, height);
      checkProjection(width, height, true); checkProjection(width, height);
    }
  }
}
assert.ok(visibleLinks > 20); assert.ok(photos.atlas.allQueued);

// No DOM writes, selector lookups, world-matrix recursion or frustum construction
// should be repeated by an unchanged view.
writes = selectors = worldUpdates = frustumUpdates = 0;
for (let frame = 0; frame < 1000; frame++) { photos.update(camera); menu.update(camera, container, 320, 568); }
assert.deepEqual({ writes, selectors, worldUpdates, frustumUpdates }, { writes: 0, selectors: 0, worldUpdates: 0, frustumUpdates: 0 });

// Replacing the accessible container is a real dirty condition, even if the
// camera and viewport are unchanged. Cached references must not target old DOM.
({ anchors, container } = createAnchors());
checkProjection(320, 568); assert.equal(selectors, 5);

// Once initialized, camera motion updates projection only, never fixed geometry.
worldUpdates = selectors = 0;
for (let frame = 0; frame < 100; frame++) {
  camera.rotation.y += .001; camera.updateMatrixWorld();
  photos.update(camera); menu.update(camera, container, 320, 568);
}
assert.equal(worldUpdates, 0); assert.equal(selectors, 0);
photos.dispose(); menu.dispose();
console.log(JSON.stringify({ result: 'PASS', visibleLinks, photoChecks, checks: [
  'Cached projections match original geometry at desktop/mobile sizes, zooms and directions',
  'All photo/map lazy-load decisions match native sphere visibility tests',
  'Room transforms and replacement accessible containers invalidate the right caches',
  '1000 stationary updates repeat no DOM, selectors, world transforms or frustum work',
  'Camera motion never recomputes fixed wall transforms or queries existing links',
] }, null, 2));
