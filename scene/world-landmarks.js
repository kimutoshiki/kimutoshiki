import {loadBlenderAsset} from './blender-assets.js';
import {LANDMARK_SITES} from './world-layout.js';

/** Place grounded, metre-scale Blender exports without re-fitting their shapes. */
export async function createWorldLandmarks(T, {region, signal, loadAsset = loadBlenderAsset} = {}) {
  const sites = LANDMARK_SITES.filter(site => !region || site.region === region);
  const results = await Promise.allSettled(sites.map(site => loadAsset(site.key, {signal})));
  const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const dispose = () => loaded.forEach(asset => asset.dispose());
  const rejected = results.find(result => result.status === 'rejected');
  if (rejected) { dispose(); throw rejected.reason; }
  try {
    const group = new T.Group(), targets = [], models = [], clocks = [], hands = [];
    group.name = 'Blender landmark architecture';
    for (const [index, site] of sites.entries()) {
      const id = 'landmark-' + site.key, object = loaded[index].scene, faces = new Map();
      object.name = site.name;
      object.userData.targetId = id;
      object.position.set(site.position[0], site.foundationY || 0, site.position[1]);
      object.rotation.y = site.rotation;
      group.add(object);
      object.traverse(node => {
        if (node.isMesh) {
          node.castShadow = node.receiveShadow = true;
          node.userData.targetId = id;
          node.userData.landmarkId = site.key;
        }
        const kind = node.userData.worldClockHand;
        if (kind !== 'hour' && kind !== 'minute') return;
        const face = node.userData.clockFace;
        if (!faces.has(face)) faces.set(face, {face: node.parent});
        faces.get(face)[kind] = node;
        hands.push({node, kind});
      });
      clocks.push(...faces.values());
      const bounds = new T.Box3().setFromObject(object, true);
      const anchor = bounds.getCenter(new T.Vector3());
      anchor.y = bounds.max.y + .65;
      targets.push({id, title: site.title, object, anchor, bounds, arrival: site.arrival, lookHeight: site.lookHeight});
      models.push({id, name: site.name, height: bounds.max.y - bounds.min.y, baseHeight: bounds.min.y, worldBounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}});
    }
    return {group, targets, stats: {models}, clocks, updateClock(snapshot) {
      if (!snapshot?.clockAngles) return false;
      let changed = false;
      for (const {node, kind} of hands) {
        const value = snapshot.clockAngles[kind];
        if (Number.isFinite(value) && node.rotation.z !== value) { node.rotation.z = value; changed = true; }
      }
      return changed;
    }, dispose};
  } catch (error) { dispose(); throw error; }
}
