import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import { clone as cloneSkeleton } from '../js/vendor/SkeletonUtils.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';
import { createRoomCat } from '../scene/cat-life.js';

const context = new Proxy({}, {
  get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
});
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const asset = await loadTabbyFixture();
const cat = createRoomCat(T, { asset });
const meshes = [], skinned = [];
cat.model.traverse(object => {
  if (object.isMesh) meshes.push(object);
  if (object.isSkinnedMesh) skinned.push(object);
});
const safeBounds = new Map(skinned.map(mesh => [mesh, mesh.boundingSphere.clone()]));
const vertex = new T.Vector3();
let checkedVertices = 0;
function pose(name, fraction) {
  cat.mixer.stopAllAction();
  const clip = asset.animations.find(value => value.name === name);
  const action = cat.mixer.clipAction(clip).reset().setLoop(T.LoopOnce, 1).play();
  action.clampWhenFinished = true;
  action.time = clip.duration * fraction;
  cat.mixer.update(0); cat.group.updateMatrixWorld(true);
}

// Sample the real deformed geometry, including all four clips used by the
// room's habits. These bounds are broad-phase guards, never click hit boxes.
for (const name of ['Idle', 'Walk', 'Stretch', 'Lie_Roll_Rest']) {
  for (let frame = 0; frame <= 20; frame++) {
    pose(name, frame / 20);
    for (const mesh of skinned) {
      const count = mesh.geometry.attributes.position.count;
      for (let index = 0; index < count; index += 31) {
        mesh.getVertexPosition(index, vertex);
        assert.ok(mesh.boundingSphere.containsPoint(vertex), `${name}: ${mesh.name} leaves its picking sphere`);
        if (mesh.boundingBox) assert.ok(mesh.boundingBox.containsPoint(vertex));
        checkedVertices++;
      }
      mesh.getVertexPosition(count - 1, vertex);
      assert.ok(mesh.boundingSphere.containsPoint(vertex));
    }
  }
}
for (const mesh of skinned) {
  assert.deepEqual(mesh.boundingSphere, safeBounds.get(mesh), 'Animation does not rescan or mutate the fixed picking bounds');
  assert.equal(mesh.boundingBox, null, 'No oversized bounding box is introduced into inspection framing');
  if (!/groom|fur strand/i.test(mesh.name)) assert.equal(mesh.raycast, T.SkinnedMesh.prototype.raycast, 'Exact triangle picking remains native');
}

// First hover while idle, then click the visibly stretched front paw. Three's
// original first-pose bounds reject this ray; the conservative guards must not.
pose('Idle', 0);
const firstPoseBounds = new Map(skinned.map(mesh => {
  mesh.computeBoundingSphere();
  const original = mesh.boundingSphere.clone();
  mesh.boundingSphere.copy(safeBounds.get(mesh));
  return [mesh, original];
}));
const eye = new T.Vector3(0, 3.48, 8.24);
const body = cat.model.getObjectByName('Cat_•_continuous_anatomical_surface');
const ray = new T.Raycaster();
const idleCenter = firstPoseBounds.get(body).center.clone().applyMatrix4(body.matrixWorld);
ray.set(eye, idleCenter.sub(eye).normalize());
assert.ok(ray.intersectObjects(meshes, false).length, 'Initial hover reaches the idle cat');
pose('Stretch', .4);
body.getVertexPosition(42450, vertex).applyMatrix4(body.matrixWorld);
ray.set(eye, vertex.clone().sub(eye).normalize());
for (const [mesh, bounds] of firstPoseBounds) mesh.boundingSphere.copy(bounds);
assert.equal(ray.intersectObjects(meshes, false).length, 0, 'Fixture reproduces the stale first-pose broad-phase rejection');
for (const [mesh, bounds] of safeBounds) mesh.boundingSphere.copy(bounds);
const hits = ray.intersectObjects(meshes, false);
assert.ok(hits.some(hit => hit.object === body), 'The same ray reaches the real stretched paw triangles');
const groom = meshes.find(mesh => /groom|fur strand/i.test(mesh.name));
assert.ok(groom); const groomHits = []; groom.raycast(ray, groomHits);
assert.equal(groomHits.length, 0, 'Dense grooming remains excluded from picking');

// A sphere used for the ray broad phase must not enlarge 360-degree framing.
const inspected = cloneSkeleton(cat.group);
inspected.updateMatrixWorld(true);
const framed = new T.Box3().setFromObject(inspected);
inspected.traverse(object => { if (object.isSkinnedMesh) { object.boundingSphere = null; object.boundingBox = null; } });
const unguarded = new T.Box3().setFromObject(inspected);
assert.ok(framed.min.distanceTo(unguarded.min) < 1e-8 && framed.max.distanceTo(unguarded.max) < 1e-8, 'Conservative ray spheres do not change normal pose-based inspection framing');
const skeletons = new Set(); inspected.traverse(object => { if (object.skeleton) skeletons.add(object.skeleton); });
skeletons.forEach(skeleton => skeleton.dispose());
cat.dispose();
console.log(JSON.stringify({ result: 'PASS', skinnedMeshes: skinned.length, checkedVertices, checks: [
  'Real GLB habit vertices stay inside fixed source-space picking bounds',
  'Idle-hover then Stretch-paw ray reproduces and fixes the original miss',
  'Native triangle picking and disabled groom picking are preserved',
  'Skeleton-cloned inspection retains tight pose framing',
] }, null, 2));
