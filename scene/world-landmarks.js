import {loadBlenderAsset} from './blender-assets.js';
import {LANDMARK_SITES} from './world-layout.js';

/** Place grounded, metre-scale Blender exports without re-fitting their shapes. */
export async function createWorldLandmarks(T, {region, key, signal, loadAsset = loadBlenderAsset} = {}) {
  const sites = LANDMARK_SITES.filter(site => (!region || site.region === region) && (!key || site.key === key));
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

/** Keep a separate request for each landmark, so reaching the bank need not
 * decode the castle. A district owns its landmarks until the visitor leaves. */
export function createRegionalLandmarks(T, region, createLandmarks = createWorldLandmarks) {
  const group = new T.Group(), targets = [], requests = new Map(), loaded = new Map();
  const controller = new AbortController();
  const sites = LANDMARK_SITES.filter(site => site.region === region);
  let clock;
  group.name = 'Blender landmark architecture';
  function ensure(key) {
    if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
    if (!sites.some(site => site.key === key)) return Promise.reject(new RangeError('Unknown landmark in ' + region));
    if (!requests.has(key)) {
      const pending = Promise.resolve().then(() => createLandmarks(T, {region, key, signal: controller.signal})).then(asset => {
        if (controller.signal.aborted) { asset.dispose(); throw controller.signal.reason; }
        loaded.set(key, asset);
        targets.push(...asset.targets);
        group.add(asset.group);
        if (clock) asset.updateClock?.(clock);
        return asset;
      }).catch(error => { requests.delete(key); throw error; });
      requests.set(key, pending);
    }
    return requests.get(key);
  }
  return {
    group, targets, sites, ensure,
    has: key => loaded.has(key),
    hasRequested: key => requests.has(key),
    updateClock(snapshot) {
      clock = snapshot;
      for (const asset of loaded.values()) asset.updateClock?.(snapshot);
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const asset of loaded.values()) asset.dispose();
      loaded.clear(); requests.clear(); group.clear(); targets.length = 0;
    },
  };
}
