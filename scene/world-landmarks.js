/* The original Waseda / Karatsu architecture at landscape scale. No miniature
 * furniture, canvas labels or surrounding scenery is retained. No font or asset
 * request blocks construction; the world owns shared surface-map loading. */
import { createOkumaAuditorium } from '../js/models/okuma-auditorium.js?v=20261106-craft1';
import { createOkumaStatue } from '../js/models/okuma-statue.js?v=20261106-craft1';
import { createKaratsuCastle } from '../js/models/karatsu-castle.js?v=20261106-craft1';
import { createKaratsuBank } from '../js/models/karatsu-bank.js?v=20261106-craft1';
import { surface, prepareBoxSurfaceUVs, ensureSurfaceUV, SURFACES } from './surface-materials.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats } from './static-batching.js';

const SITES = [
  { key: 'okuma-auditorium', title: '大隈講堂', name: 'Okuma auditorium architecture',
    factory: createOkumaAuditorium, position: [-12, -7], rotation: .16,
    height: 15, width: 11, depth: 9, baseHeight: .34 },
  { key: 'karatsu-castle', title: '唐津城', name: 'Five-tier keep',
    factory: createKaratsuCastle, position: [13, -9], rotation: -.18,
    height: 16, width: 11, depth: 9, baseHeight: .42 },
  { key: 'karatsu-bank', title: '旧唐津銀行', name: 'Landmark architecture',
    factory: createKaratsuBank, position: [9, 8], rotation: -.28,
    height: 7, width: 10, depth: 7, baseHeight: .28 },
  { key: 'okuma-statue', title: '大隈重信像', name: 'Okuma statue monument',
    factory: createOkumaStatue, position: [-4, 5], rotation: .06,
    height: 8, width: 4.5, depth: 4.5, baseHeight: .26 },
];

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

function beveledSlab(T, width, height, depth) {
  const bevel = Math.min(.085, height / 3);
  const shape = new T.Shape(), x = width / 2 - bevel, z = depth / 2 - bevel;
  shape.moveTo(-x, -z); shape.lineTo(x, -z); shape.lineTo(x, z);
  shape.lineTo(-x, z); shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, bevel, 0);
  return geometry;
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
  const group = new T.Group(); group.name = 'Waseda and Karatsu · landscape architecture';
  const targets = [], stats = { models: [], geometryPolicy: 'Complete original architecture; uniform landscape scale; context removed.' };
  const basalt = surface(new T.MeshStandardMaterial({ color: '#343b3e', roughness: .79 }),
    'slate', { tint: '#4c5356', roughness: .79, bumpScale: .006 });
  const bronze = new T.MeshStandardMaterial({ color: '#b89a62', metalness: .78, roughness: .33 });
  const edgeGeometry = new T.BoxGeometry(1, 1, 1);
  const ownedTextures = new Set();
  let disposed = false;
  try {
    for (const site of SITES) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const model = site.factory(T), generated = resources(model.group);
      const architecture = model.architecture || model.group.getObjectByName(site.name);
      if (!architecture || architecture.name !== site.name) throw new Error('Missing complete world architecture: ' + site.key);
      architecture.removeFromParent();
      const retained = resources(architecture);
      releaseExcept(generated, retained);
      retained.textures.forEach(texture => ownedTextures.add(texture));

      const monument = new T.Group(); monument.name = site.title + ' · landscape monument';
      monument.position.set(site.position[0], .049, site.position[1]);
      monument.rotation.y = site.rotation;
      monument.userData = { targetId: 'landmark-' + site.key, landmarkId: site.key, title: site.title };
      group.add(monument);

      architecture.updateWorldMatrix(true, true);
      const nativeBounds = new T.Box3().setFromObject(architecture);
      const nativeSize = nativeBounds.getSize(new T.Vector3()), nativeCenter = nativeBounds.getCenter(new T.Vector3());
      const scale = Math.min(site.height / nativeSize.y, site.width / nativeSize.x, site.depth / nativeSize.z);
      const body = new T.Group(); body.name = site.title + ' · original architecture at uniform scale';
      body.scale.setScalar(scale);
      body.position.set(-nativeCenter.x * scale, site.baseHeight - nativeBounds.min.y * scale - .002, -nativeCenter.z * scale);
      body.add(architecture); monument.add(body);

      const width = nativeSize.x * scale + .88, depth = nativeSize.z * scale + .88;
      const base = new T.Mesh(beveledSlab(T, width, site.baseHeight, depth), basalt);
      base.name = site.title + ' · basalt foundation'; monument.add(base);
      for (const [x, z, w, d] of [
        [0, -depth / 2 + .16, width - .32, .045],
        [0, depth / 2 - .16, width - .32, .045],
        [-width / 2 + .16, 0, .045, depth - .32],
        [width / 2 - .16, 0, .045, depth - .32],
      ]) {
        const inlay = new T.Mesh(edgeGeometry, bronze);
        inlay.position.set(x, site.baseHeight + .003, z); inlay.scale.set(w, .012, d);
        monument.add(inlay);
      }

      monument.traverse(object => {
        if (object.isMesh || object.isLine) {
          object.userData.targetId = monument.userData.targetId;
          object.userData.landmarkId = site.key;
        }
        if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      // Project physical UVs before merging differently sized source parts.
      prepareSurfaces(T, monument);
      const clocks = new Set();
      architecture.traverse(object => { if (/^Clock face [1-4]$/.test(object.name)) clocks.add(object); });
      const architectureBatch = mergeStaticDraws(T, architecture, { byParent: false, preserveGroups: clocks });
      mergeStaticDraws(T, monument, { skipRoots: new Set([body]) });
      monument.updateWorldMatrix(true, true);
      const finalBounds = new T.Box3().setFromObject(monument);
      const anchor = finalBounds.getCenter(new T.Vector3()); anchor.y = finalBounds.max.y + .65;
      targets.push({ id: monument.userData.targetId, title: site.title, object: monument, anchor });
      stats.models.push({
        id: monument.userData.targetId, name: site.name, uniformScale: scale,
        architecture: { before: architectureBatch.before, after: architectureBatch.after },
        nativeSize: nativeSize.toArray(), height: nativeSize.y * scale,
        width: nativeSize.x * scale, depth: nativeSize.z * scale,
        baseHeight: site.baseHeight, worldBounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
      });
    }
    cacheStaticLocalMatrices(group);
    group.updateMatrixWorld(true);
    stats.total = staticDrawStats(group);
    group.userData.landmarkStats = stats;
    // The owner loads the shared surface images once for the whole world. This
    // notification only invalidates its pending scene after geometry completes.
    onTextureLoad?.('world-landmarks');
  } catch (error) {
    releaseExcept(resources(group)); ownedTextures.forEach(texture => texture.dispose());
    edgeGeometry.dispose(); basalt.dispose(); bronze.dispose();
    throw error;
  }
  return {
    group, targets, stats,
    dispose() {
      if (disposed) return; disposed = true;
      const owned = resources(group);
      owned.textures = ownedTextures;
      releaseExcept(owned);
      group.clear();
    },
  };
}
