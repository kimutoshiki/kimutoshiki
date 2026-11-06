/**
 * Build the distant-world LOD from the supplied animated cat. The original
 * room/full exports are inputs only and remain unchanged.
 *
 * Offline build dependencies: @gltf-transform/{core,extensions,functions},
 * draco3dgltf, meshoptimizer, sharp. Install them in a tools directory, then:
 * node scripts/optimize-world-cat.mjs --tools /absolute/path/to/tools
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argumentsMap = new Map();
for (let i = 2; i < process.argv.length; i += 2) argumentsMap.set(process.argv[i], process.argv[i + 1]);
const tools = argumentsMap.get('--tools');
const require = createRequire(tools ? path.resolve(tools, 'package.json') : import.meta.url);
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, prune, dedup, resample, textureCompress, draco } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf'), sharp = require('sharp');
await MeshoptSimplifier.ready;
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const input = path.resolve(root, argumentsMap.get('--input') || 'models/tabby-cat-room.glb');
const output = path.resolve(root, argumentsMap.get('--output') || 'models/tabby-cat-world.glb');
if (input === output || /tabby-cat(?:-room)?\.glb$/.test(path.basename(output))) throw new Error('The original cat exports are read-only inputs');
const source = await fs.readFile(input), sourceHash = crypto.createHash('sha256').update(source).digest('hex');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const document = await io.read(input);
const listAnimations = () => document.getRoot().listAnimations().map(animation => ({
  name: animation.getName(), channels: animation.listChannels().length,
  duration: Math.max(...animation.listSamplers().map(sampler => sampler.getInput().getMax([])[0])),
}));
const animationsBefore = listAnimations();
const removed = [];
for (const node of document.getRoot().listNodes()) {
  if (!node.getMesh() || !/groom|guard hair|soft fur edge/i.test(node.getName())) continue;
  removed.push(node.getName()); node.setMesh(null);
}
// Skin weights, joint attributes, source coat UVs and facial features participate
// in the simplifier. Groom strands are unnecessary at 30–60 screen pixels.
await document.transform(
  prune(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: .14, error: .002, lockBorder: true }),
  resample({ tolerance: 0.0002 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /coat/i, resize: [512, 512], quality: 86, effort: 80 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /iris|nose/i, resize: [256, 256], quality: 84, effort: 80 }),
  dedup(), prune(),
  draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 12 }),
);
const animationsAfter = listAnimations();
if (JSON.stringify(animationsBefore.map(a => [a.name, a.duration])) !== JSON.stringify(animationsAfter.map(a => [a.name, a.duration]))) throw new Error('LOD transformation changed clip identities or durations');
const triangles = document.getRoot().listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n, primitive) => n + (primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);
const meshes = document.getRoot().listMeshes().length;
const jointCount = document.getRoot().listSkins().reduce((sum, skin) => sum + skin.listJoints().length, 0);
const bytes = await io.writeBinary(document);
if (bytes.length > 500000) throw new Error(`World cat transfer budget exceeded: ${bytes.length}`);
if (triangles > 40000) throw new Error(`World cat triangle budget exceeded: ${triangles}`);
await fs.writeFile(output, bytes);
if (crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex') !== sourceHash) throw new Error('Source asset unexpectedly changed');
// Decode through the exact vendored runtime path, then compare the retained
// skeleton's sampled poses. This catches malformed joint/weight export and
// accidental changes to animation semantics rather than only counting bytes.
const T = await import('../js/vendor/three.module.min.js');
const { loadTabbyFixture } = await import('./helpers/load-tabby-fixture.mjs');
const [original, distant] = await Promise.all([loadTabbyFixture(pathToFileURL(input)), loadTabbyFixture(pathToFileURL(output))]);
const sourceBones = new Map(), worldBones = new Map();
original.scene.traverse(object => { if (object.isBone) sourceBones.set(object.name, object); });
let maxWeightError = 0;
distant.scene.traverse(object => {
  if (object.isBone) worldBones.set(object.name, object);
  if (!object.isSkinnedMesh) return;
  const weights = object.geometry.attributes.skinWeight, joints = object.geometry.attributes.skinIndex;
  for (let i = 0; i < weights.count; i++) {
    maxWeightError = Math.max(maxWeightError, Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1));
    for (const joint of [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)]) assert.ok(joint >= 0 && joint < object.skeleton.bones.length);
  }
});
assert.equal(worldBones.size, sourceBones.size); assert.equal(worldBones.size, 37); assert.ok(maxWeightError < .005);
const sourceMixer = new T.AnimationMixer(original.scene), worldMixer = new T.AnimationMixer(distant.scene);
let maxBonePositionDelta = 0, maxBoneAngleDelta = 0, checkedBonePoses = 0;
for (const clip of original.animations) {
  sourceMixer.stopAllAction(); worldMixer.stopAllAction();
  sourceMixer.clipAction(clip).reset().play(); worldMixer.clipAction(distant.animations.find(value => value.name === clip.name)).reset().play();
  for (let sample = 0; sample < 25; sample++) {
    const time = clip.duration * sample / 25; sourceMixer.setTime(time); worldMixer.setTime(time);
    original.scene.updateMatrixWorld(true); distant.scene.updateMatrixWorld(true);
    for (const [name, sourceBone] of sourceBones) {
      const worldBone = worldBones.get(name); assert.ok(worldBone);
      maxBonePositionDelta = Math.max(maxBonePositionDelta, sourceBone.getWorldPosition(new T.Vector3()).distanceTo(worldBone.getWorldPosition(new T.Vector3())));
      maxBoneAngleDelta = Math.max(maxBoneAngleDelta, sourceBone.getWorldQuaternion(new T.Quaternion()).angleTo(worldBone.getWorldQuaternion(new T.Quaternion())));
      checkedBonePoses++;
    }
  }
}
// This LOD is authored for distant 30–60 px views. At source metric scale,
// sampled joint drift stays below 3 mm / 2 degrees. Close inspection uses the
// unchanged original high-density asset instead of magnifying this LOD.
assert.ok(maxBonePositionDelta < .003); assert.ok(maxBoneAngleDelta < .035);
const glbJSON = JSON.parse(Buffer.from(bytes).subarray(20, 20 + Buffer.from(bytes).readUInt32LE(12)).toString());
assert.ok(glbJSON.buffers.every(buffer => !buffer.uri));
assert.ok(glbJSON.images.every(image => image.bufferView !== undefined && !image.uri));
console.log(JSON.stringify({
  input: path.relative(root, input), output: path.relative(root, output), sourceBytes: source.length,
  outputBytes: bytes.length, triangles, meshes, jointCount, removed,
  maxWeightError, checkedBonePoses, maxBonePositionDelta, maxBoneAngleDelta,
  textureBytes: document.getRoot().listTextures().map(texture => ({ name: texture.getName(), bytes: texture.getImage().length })),
  animations: animationsAfter, sourceSha256: sourceHash,
  outputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
}, null, 2));
