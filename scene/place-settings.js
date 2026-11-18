// The Blender scenes carry the same metre-based origins and collision volumes
// used when authoring their streets, building footprints, trees and terrain.
import {loadBlenderAsset} from './blender-assets.js';

const assets = {waseda: 'waseda-campus', karatsu: 'karatsu-town'};
const treePart = /trunk_and_live_branches|outer_leaf_sprays|inner_leaf_sprays|fine_growing_branchlets/;

function changeTier(distance, previous) {
  // Leave a margin at each boundary so a tree stays stable during small steps.
  if (distance < (previous === 0 ? 29 : 25) ** 2) return 0;
  if (distance < (previous <= 1 ? 74 : 67) ** 2) return 1;
  return 2;
}

export async function createRegionalLandscape(T, region, {signal, loadAsset = loadBlenderAsset} = {}) {
  if (!Object.hasOwn(assets, region)) throw new RangeError('Unknown walking region');
  const [groundResult, crownResult] = await Promise.allSettled([
    loadAsset(assets[region], {signal}),
    loadAsset(region + '-tree-crowns', {signal}),
  ]);
  const crowns = crownResult.status === 'fulfilled' ? crownResult.value : undefined;
  if (groundResult.status === 'rejected') { crowns?.dispose(); throw groundResult.reason; }
  const asset = groundResult.value;
  const dispose = () => { asset.dispose(); crowns?.dispose(); };
  try {
    const group = asset.scene;
    let metadata, water;
    const planting = new Map();
    group.traverse(object => {
      if (object.userData.region === region && object.userData.collisionBoxes) metadata = object.userData;
      if (!object.isMesh) return;
      const kind = object.name.replaceAll(' ', '_').match(treePart)?.[0];
      if (kind) {
        const key = object.position.toArray().map(value => value.toFixed(3)).join(',');
        if (!planting.has(key)) planting.set(key, {position: new T.Vector3(), tier: 2, shadow: false});
        planting.get(key)[kind] = object;
        object.castShadow = false;
      } else object.castShadow = !/Beyond_the_walkable|Coastal_horizon|paving|asphalt|gravel|water|ground/i.test(object.name);
      object.receiveShadow = true;
      if (object.material.name === 'sea') water = object.material.map;
      object.updateMatrix(); object.matrixAutoUpdate = false;
    });
    if (!metadata) throw new Error('Missing regional ground plan in ' + assets[region]);
    const [x, z] = metadata.origin;
    group.position.set(x, 0, z);
    group.updateWorldMatrix(true, true);
    const trees = [...planting.values()];
    const distantCrowns = new Map();
    crowns?.scene.traverse(node => {
      if (node.isMesh && Number.isInteger(node.userData.treeProxy)) distantCrowns.set(node.userData.treeProxy, node);
    });
    trees.forEach((tree, i) => {
      const movable = tree.outer_leaf_sprays || tree.inner_leaf_sprays;
      const anchor = tree.trunk_and_live_branches || movable || tree.fine_growing_branchlets;
      anchor.getWorldPosition(tree.position);
      tree.movable = movable;
      tree.rest = movable?.rotation.y;
      tree.phase = i * 2.39996;
      const outer = tree.outer_leaf_sprays;
      const variant = Number(outer?.name.replaceAll(' ', '_').match(/outer_leaf_sprays_(\d+)/)?.[1]);
      const source = distantCrowns.get(variant);
      if (source) {
        const crown = new T.Mesh(source.geometry, source.material);
        crown.name = 'Distant ' + outer.name;
        crown.position.copy(outer.position); crown.quaternion.copy(outer.quaternion);
        crown.scale.copy(source.scale).multiply(outer.scale); crown.updateMatrix(); crown.matrixAutoUpdate = false;
        crown.receiveShadow = true; crown.visible = false;
        outer.parent.add(crown); tree.crown = crown;
      }
    });
    const nearWater = eye => !!water && (eye.z < 655 || eye.x > 2320) && eye.x > 2130;
    const nearCanopy = (tree, eye, yaw) => {
      if (!tree.movable) return false;
      const x = tree.position.x - eye.x, z = tree.position.z - eye.z;
      return x*x + z*z < 21 ** 2 && (!Number.isFinite(yaw) || x*Math.sin(yaw) + z*Math.cos(yaw) > -4);
    };
    const collisions = JSON.parse(metadata.collisionBoxes).map(([id, x0, y0, z0, x1, y1, z1]) => ({
      id, box: new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1)),
    }));
    return {group, collisions,
      wantsMotion(eye, yaw) {
        return nearWater(eye) || trees.some(tree => nearCanopy(tree, eye, yaw));
      },
      update(eye, seconds) {
        let shadowChanged = false;
        for (const tree of trees) {
          const distance = (eye.x - tree.position.x) ** 2 + (eye.z - tree.position.z) ** 2;
          const tier = changeTier(distance, tree.tier);
          const shadow = distance < (tree.shadow ? 42 : 36) ** 2;
          if (shadow !== tree.shadow) shadowChanged = true;
          tree.tier = tier; tree.shadow = shadow;
          if (tree.trunk_and_live_branches) tree.trunk_and_live_branches.castShadow = shadow;
          if (tree.outer_leaf_sprays) {
            tree.outer_leaf_sprays.castShadow = shadow;
            if (tree.crown) { tree.outer_leaf_sprays.visible = tier < 2; tree.crown.visible = tier === 2; }
          }
          if (tree.inner_leaf_sprays) tree.inner_leaf_sprays.visible = tier === 0;
          if (tree.fine_growing_branchlets) tree.fine_growing_branchlets.visible = tier === 0;
          if (tree.movable && distance < 21 ** 2 && Number.isFinite(seconds)) {
            tree.movable.rotation.y = tree.rest + .005 * Math.sin(seconds * 1.07 + tree.phase) + .0018 * Math.sin(seconds * 2.13 + tree.phase);
            tree.movable.updateMatrix();
          }
        }
        if (nearWater(eye) && Number.isFinite(seconds)) water.offset.set((seconds * .006) % 1, (seconds * .002) % 1);
        return shadowChanged;
      }, dispose};
  } catch (error) { dispose(); throw error; }
}
