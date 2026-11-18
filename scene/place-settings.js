// The Blender scenes carry the same metre-based origins and collision volumes
// used when authoring their streets, building footprints, trees and terrain.
import {loadBlenderAsset} from './blender-assets.js';

const assets = {waseda: 'waseda-campus', karatsu: 'karatsu-town'};

export async function createRegionalLandscape(T, region, {signal, loadAsset = loadBlenderAsset} = {}) {
  if (!Object.hasOwn(assets, region)) throw new RangeError('Unknown walking region');
  const asset = await loadAsset(assets[region], {signal});
  try {
    const group = asset.scene;
    let metadata, water;
    const leaves = [];
    group.traverse(object => {
      if (object.userData.region === region && object.userData.collisionBoxes) metadata = object.userData;
      if (object.userData.leafDetail) leaves.push(object);
      if (!object.isMesh) return;
      object.castShadow = !/Beyond_the_walkable|Coastal_horizon|paving|asphalt|gravel|water|ground/i.test(object.name);
      object.receiveShadow = true;
      if (object.material.name === 'sea') water = object.material.map;
    });
    if (!metadata) throw new Error('Missing regional ground plan in ' + assets[region]);
    const [x, z] = metadata.origin;
    group.position.set(x, 0, z);
    group.updateWorldMatrix(true, true);
    const foliage = leaves.map((object, i) => ({
      object, position: object.getWorldPosition(new T.Vector3()), rest: object.rotation.y, phase: i * 2.39996,
    }));
    const nearWater = eye => !!water && (eye.z < 655 || eye.x > 2320) && eye.x > 2130;
    const collisions = JSON.parse(metadata.collisionBoxes).map(([id, x0, y0, z0, x1, y1, z1]) => ({
      id, box: new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1)),
    }));
    return {group, collisions,
      wantsMotion(eye) {
        return nearWater(eye) || foliage.some(({position}) => (eye.x - position.x) ** 2 + (eye.z - position.z) ** 2 < 18 ** 2);
      },
      update(eye, seconds) {
      // The trunk, branches and sculpted crown stay visible at all distances.
      // Resolve the tiny folded leaves only while walking among these trees.
        for (const {position, object, rest, phase} of foliage) {
          const distanceSquared = (eye.x - position.x) ** 2 + (eye.z - position.z) ** 2;
          object.visible = distanceSquared < 34 ** 2;
          if (distanceSquared < 18 ** 2 && Number.isFinite(seconds)) {
            object.rotation.y = rest + .005 * Math.sin(seconds * 1.07 + phase) + .0018 * Math.sin(seconds * 2.13 + phase);
          }
        }
        if (nearWater(eye) && Number.isFinite(seconds)) water.offset.set((seconds * .006) % 1, (seconds * .002) % 1);
      }, dispose: asset.dispose};
  } catch (error) { asset.dispose(); throw error; }
}
