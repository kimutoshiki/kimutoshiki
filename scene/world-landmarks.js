/* Original Waseda / Karatsu architecture, at approximate real-world heights.
 * Native proportions stay uniform and every foundation meets the garden floor. */
import { createOkumaAuditorium } from '../js/models/okuma-auditorium.js?v=20261106-craft1';
import { createOkumaStatue } from '../js/models/okuma-statue.js?v=20261106-craft1';
import { createKaratsuCastle } from '../js/models/karatsu-castle.js?v=20261106-craft1';
import { createKaratsuBank } from '../js/models/karatsu-bank.js?v=20261106-craft1';
import { prepareBoxSurfaceUVs, ensureSurfaceUV, SURFACES } from './surface-materials.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats } from './static-batching.js';
import { captureLandmarkClocks, updateLandmarkClocks } from './landmark-clocks.js';

import { LANDMARK_SITES } from './world-layout.js';
const FACTORIES = { 'okuma-auditorium': createOkumaAuditorium, 'karatsu-castle': createKaratsuCastle, 'karatsu-bank': createKaratsuBank, 'okuma-statue': createOkumaStatue };
const SITES = LANDMARK_SITES.map(site => ({...site, factory: FACTORIES[site.key]}));

function resources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}

function releaseExcept(owned, retained) {
  for (const key of ['geometries', 'materials', 'textures']) {
    for (const resource of owned[key]) if (!retained?.[key].has(resource)) resource.dispose();
  }
}

function prepareSurfaces(T, root) {
  prepareBoxSurfaceUVs(T, root);
  root.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const spec = SURFACES[material.userData.surface?.key];
      if (spec) ensureSurfaceUV(T, object.geometry, spec.span);
    }
    object.geometry.userData.surfaceUVPrepared = true;
  });
}

/** Build only after the landscape's first frame. Yield between the four
 * factories so a moving camera / loading UI keeps receiving frame callbacks. */
export async function createWorldLandmarks(T, { onTextureLoad } = {}) {
  const group = new T.Group(); group.name = 'Waseda and Karatsu · life-size garden landmarks';
  const targets = [], stats = { models: [], geometryPolicy: 'Original architecture at approximate real-world height, uniformly scaled and grounded at y=0; continuous garden.' };
  const ownedTextures = new Set(), clocks = [], protectedHands = new Set();
  let disposed = false;
  try {
    for (const site of SITES) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const model = site.factory(T), generated = resources(model.group);
      const architecture = model.architecture || model.group.getObjectByName(site.name);
      if (!architecture || architecture.name !== site.name) throw new Error('Missing complete world architecture: ' + site.key);
      architecture.removeFromParent();
      const modelClocks = captureLandmarkClocks(architecture);
      clocks.push(...modelClocks);
      for (const clock of modelClocks) { protectedHands.add(clock.hour); protectedHands.add(clock.minute); }
      const retained = resources(architecture);
      releaseExcept(generated, retained);
      retained.textures.forEach(texture => ownedTextures.add(texture));

      const monument = new T.Group(); monument.name = site.title + ' · landscape monument';
      monument.position.set(site.position[0], 0, site.position[1]);
      monument.rotation.y = site.rotation;
      monument.userData = { targetId: 'landmark-' + site.key, landmarkId: site.key, title: site.title };
      group.add(monument);

      architecture.updateWorldMatrix(true, true);
      const nativeBounds = new T.Box3().setFromObject(architecture);
      const nativeSize = nativeBounds.getSize(new T.Vector3()), nativeCenter = nativeBounds.getCenter(new T.Vector3());
      const scale = site.height / nativeSize.y;
      const body = new T.Group(); body.name = site.title + ' · original architecture at uniform scale';
      body.scale.setScalar(scale);
      body.position.set(-nativeCenter.x * scale, -nativeBounds.min.y * scale, -nativeCenter.z * scale);
      body.add(architecture); monument.add(body);

      // The original architecture meets grade directly. No presentation plinth,
      // bronze frame or independent island sits beneath a life-size building.

      monument.traverse(object => {
        if (object.isMesh || object.isLine) {
          object.userData.targetId = monument.userData.targetId;
          object.userData.landmarkId = site.key;
        }
        if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      // Project physical UVs before merging differently sized source parts.
      prepareSurfaces(T, monument);
      const clockFaces = new Set();
      architecture.traverse(object => { if (/^Clock face [1-4]$/.test(object.name)) clockFaces.add(object); });
      const architectureBatch = mergeStaticDraws(T, architecture, { byParent: false, preserveGroups: clockFaces, protectedObjects: protectedHands });
      mergeStaticDraws(T, monument, { skipRoots: new Set([body]) });
      monument.updateWorldMatrix(true, true);
      const finalBounds = new T.Box3().setFromObject(monument);
      const anchor = finalBounds.getCenter(new T.Vector3()); anchor.y = finalBounds.max.y + .65;
      targets.push({ id: monument.userData.targetId, title: site.title, object: monument, anchor, arrival: site.arrival, lookHeight: site.lookHeight });
      stats.models.push({
        id: monument.userData.targetId, name: site.name, uniformScale: scale,
        architecture: { before: architectureBatch.before, after: architectureBatch.after },
        nativeSize: nativeSize.toArray(), height: nativeSize.y * scale,
        width: nativeSize.x * scale, depth: nativeSize.z * scale,
        baseHeight: 0, worldBounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
      });
    }
    cacheStaticLocalMatrices(group, { movable: new Set([group, ...protectedHands]) });
    group.updateMatrixWorld(true);
    stats.total = staticDrawStats(group);
    group.userData.landmarkStats = stats;
    // The owner loads the shared surface images once for the whole world. This
    // notification only invalidates its pending scene after geometry completes.
    onTextureLoad?.('world-landmarks');
  } catch (error) {
    releaseExcept(resources(group)); ownedTextures.forEach(texture => texture.dispose());
    throw error;
  }
  return {
    group, targets, stats, clocks,
    updateClock(snapshot) { return disposed ? false : updateLandmarkClocks(clocks, snapshot); },
    dispose() {
      if (disposed) return; disposed = true;
      const owned = resources(group);
      owned.textures = ownedTextures;
      releaseExcept(owned);
      group.clear();
    },
  };
}
