import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import { createPhotoWall, PHOTO_WALL_COLLECTIONS } from '../scene/photo-wall.js';
import { PHOTO_CATALOG } from '../scene/photo-catalog.js';

const context = new Proxy({}, { get: (o, key) => o[key] ?? (() => {}), set: (o, key, value) => (o[key] = value, true) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
const requests = [], notifications = [];
let activePhotos = 0, maxActivePhotos = 0, activeMaps = 0, maxActiveMaps = 0;
T.TextureLoader.prototype.load = function(url, onLoad, onProgress, onError) {
  const isPhoto = url.includes('/journeys/');
  if (isPhoto) maxActivePhotos = Math.max(maxActivePhotos, ++activePhotos);
  else maxActiveMaps = Math.max(maxActiveMaps, ++activeMaps);
  requests.push({ url, isPhoto, done: false, onLoad(texture) { this.done = true; isPhoto ? activePhotos-- : activeMaps--; onLoad?.(texture); }, onError });
  return new T.Texture();
};
const room = new T.Group(), targets = [];
const palette = { darkWood: new T.MeshStandardMaterial({ color: '#372e20' }), brass: new T.MeshStandardMaterial({ color: '#a4874c' }) };
const wall = createPhotoWall(T, { room, palette, targets, onTextureLoad: id => notifications.push(id) });
room.updateMatrixWorld(true);
assert.equal(wall.frames.length, 30); assert.equal(PHOTO_CATALOG.length, 30);
assert.equal(new Set(wall.frames.map(frame => frame.photo.id)).size, 30);
assert.deepEqual(Object.fromEntries(Object.entries(PHOTO_WALL_COLLECTIONS).map(([key, ids]) => [key, ids.length])), { karatsu: 4, world: 11, japan: 4, europe: 11 });
const frameBounds = [];
for (const { photo, frame, image, wall: region } of wall.frames) {
  assert.ok(PHOTO_WALL_COLLECTIONS[region].includes(photo.id));
  assert.ok(photo.location && photo.location.split('・').every(part=>photo.originalName.includes(part)), 'Location is supported by the supplied filename');
  assert.equal(photo.title, photo.location); assert.equal(photo.subtitle, '', 'Only the place is displayed');
  assert.equal(image.userData.targetId, 'photo-' + photo.id);
  assert.ok(targets.some(target => target.id === image.userData.targetId));
  assert.ok(Math.abs(image.scale.x / image.scale.y - photo.width / photo.height) < 1e-9, 'Photo ratio: ' + photo.id);
  assert.ok(image.scale.x <= 1.04 + 1e-9 && image.scale.y <= .76 + 1e-9, 'Frames stay small: ' + photo.id);
  const bounds = new T.Box3().setFromObject(frame); frameBounds.push({ bounds, id: photo.id });
  assert.ok(bounds.min.x > -6.48 && bounds.max.x < 6.48 && bounds.min.z > -1.50 && bounds.max.z < 9.35);
  if (region === 'karatsu') assert.ok(bounds.max.y < 4.14, 'Keep sticker navigation clear');
  if (region === 'world' || region === 'europe') assert.ok(bounds.max.y < 3.50 || bounds.min.y > 4.60, 'Keep the middle of the map visible');
}
for (let i = 0; i < frameBounds.length; i++) for (let j = i + 1; j < frameBounds.length; j++) assert.ok(!frameBounds[i].bounds.intersectsBox(frameBounds[j].bounds), 'Frame overlap: ' + frameBounds[i].id + '/' + frameBounds[j].id);
const expectedNormals = { karatsu: [0, 0, 1], world: [-1, 0, 0], japan: [0, 0, -1], europe: [1, 0, 0] };
for (const { id, panel, image, src } of wall.atlas.panels) {
  assert.ok(Math.abs(image.scale.x / image.scale.y - 1672 / 941) < 1e-9, 'Whole map aspect ratio');
  const normal = new T.Vector3(0, 0, 1).transformDirection(panel.matrixWorld);
  assert.ok(normal.distanceTo(new T.Vector3(...expectedNormals[id])) < 1e-8, 'Map faces into room: ' + id);
  assert.equal(image.receiveShadow, true); assert.equal(image.material.roughness, .98);
  assert.deepEqual([...image.geometry.attributes.uv.array], [0, 1, 1, 1, 0, 0, 1, 0]);
  const content = await readFile(new URL('..' + src, import.meta.url));
  assert.equal(content.toString('ascii', 0, 4), 'RIFF'); assert.equal(content.toString('ascii', 8, 12), 'WEBP');
}
assert.equal(requests.filter(request => request.isPhoto).length, 2);
assert.equal(requests.filter(request => !request.isPhoto).length, 1);
assert.equal(wall.frames.filter(frame => frame.queued).length, 4);
function finishRequests() { for (let i = 0; i < requests.length; i++) if (!requests[i].done) requests[i].onLoad(new T.Texture()); }
finishRequests(); await wall.ready;
assert.equal(wall.frontProgress, 1); assert.equal(wall.photosLoaded, 4);
assert.equal(wall.atlas.panels.filter(panel => panel.loaded).length, 1);
assert.ok(notifications.includes('atlas-karatsu'));
const camera = new T.PerspectiveCamera(50, 1.6, .025, 80);
camera.position.set(0, 3.75, 4.12); camera.lookAt(-6.3, 3.75, 4.12); camera.updateMatrixWorld();
wall.update(camera); const afterTurn = requests.length; wall.update(camera);
assert.equal(requests.length, afterTurn, 'Stable view must not request duplicates');
finishRequests();
assert.ok(wall.atlas.panels.find(panel => panel.id === 'europe').loaded);
assert.equal(wall.atlas.panels.find(panel => panel.id === 'world').queued, false);
assert.ok(wall.photosLoaded > 4 && wall.photosLoaded < 30);
assert.equal(maxActivePhotos, 2); assert.equal(maxActiveMaps, 1);
for (const frame of wall.frames.filter(frame => frame.loaded)) {
  assert.equal(frame.image.material.map.colorSpace, T.SRGBColorSpace);
  assert.deepEqual(frame.image.material.map.repeat.toArray(), [1, 1]);
}
wall.dispose();
const lastCount = notifications.length, late = new T.Texture(); let releases = 0;
late.addEventListener('dispose', () => releases++); requests[0].onLoad(late);
assert.equal(notifications.length, lastCount); assert.equal(releases, 1);
console.log(JSON.stringify({ result: 'PASS', photos: 30, walls: { front: 'karatsu: 4', right: 'world: 11', back: 'japan: 4', left: 'europe: 11' }, initialPhotos: 4, maxConcurrentPhotos: maxActivePhotos, maxConcurrentMaps: maxActiveMaps, checks: ['Balanced world and Europe walls retain every original photograph exactly once', 'All labels contain only places supported by original filenames', 'Small uncropped frames have no intersections and clear sticker navigation', 'Side photos leave the middle of each map visible', 'All supplied maps preserve full UVs and source aspect ratio', 'Map orientation and shadow-receiving paper material', 'Visibility loads new walls, no duplicate requests, render callbacks and safe disposal'] }, null, 2));
