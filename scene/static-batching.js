/* Lossless draw-call batching for explicitly static meshes. Geometry detail,
 * material objects, attributes and effective transforms are retained. */
import { mergeGeometries } from '../js/vendor/BufferGeometryUtils.js';

export function staticDrawStats(root) {
  const result = { nodes: 0, meshes: 0, lines: 0, drawCalls: 0, triangles: 0, matrixAutoUpdates: 0, geometryBytes: 0 };
  const geometries = new Set();
  root.traverse(object => {
    result.nodes++;
    if (object.matrixAutoUpdate) result.matrixAutoUpdates++;
    if (object.isLine) { result.lines++; result.drawCalls++; }
    if (!object.isMesh) return;
    result.meshes++;
    result.drawCalls += Array.isArray(object.material) ? object.geometry.groups.length : 1;
    result.triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    if (geometries.has(object.geometry)) return;
    geometries.add(object.geometry);
    for (const attribute of Object.values(object.geometry.attributes)) result.geometryBytes += (attribute.array || attribute.data.array).byteLength;
    result.geometryBytes += object.geometry.index?.array.byteLength || 0;
  });
  return result;
}

/** Merge opaque meshes by the exact material and vertex layout.
 *
 * The default only merges siblings, so animated parent groups retain ownership.
 * Direct references to animated meshes belong in protectedObjects; skipRoots
 * excludes a whole animated subtree. Cross-parent merging is opt-in for a known
 * rigid model, with preserveGroups retaining explicit semantic subassemblies.
 * No geometry/material is disposed: source buffers may be shared elsewhere.
 */
export function mergeStaticDraws(T, root, {
  protectedObjects = new Set(), skipRoots = new Set(), preserveGroups = new Set(), byParent = true, onBatch,
} = {}) {
  root.updateWorldMatrix(true, true);
  const before = staticDrawStats(root), batches = new Map();
  const effectiveState = object => {
    let visible = true, groupOrder = 0;
    for (let parent = object; parent; parent = parent.parent) {
      if (!parent.visible || skipRoots.has(parent)) visible = false;
      // A nested Group renderOrder takes precedence in WebGLRenderer.
      if (parent.isGroup && parent.renderOrder && !groupOrder) groupOrder = parent.renderOrder;
      if (parent === root) break;
    }
    return { visible, groupOrder };
  };
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh || mesh.children.length || protectedObjects.has(mesh)) return;
    const material = mesh.material, geometry = mesh.geometry;
    if (Array.isArray(material) || material.transparent || material.transmission > 0 || !material.visible) return;
    if (material.isShaderMaterial || material.onBeforeCompile !== T.Material.prototype.onBeforeCompile) return;
    if (mesh.instanceColor || mesh.morphTexture || Object.keys(geometry.morphAttributes).length || mesh.morphTargetInfluences) return;
    if (mesh.instanceMatrix?.usage === T.DynamicDrawUsage || Object.values(geometry.attributes).some(a => (a.usage ?? a.data?.usage) === T.DynamicDrawUsage)) return;
    if (geometry.drawRange.start || Number.isFinite(geometry.drawRange.count) || !geometry.attributes.position) return;
    if (mesh.customDepthMaterial || mesh.customDistanceMaterial || mesh.onBeforeRender !== T.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== T.Object3D.prototype.onAfterRender) return;
    if (mesh.raycast !== (mesh.isInstancedMesh ? T.InstancedMesh.prototype.raycast : T.Mesh.prototype.raycast)) return;
    if (mesh.onBeforeShadow !== T.Object3D.prototype.onBeforeShadow || mesh.onAfterShadow !== T.Object3D.prototype.onAfterShadow) return;
    const state = effectiveState(mesh);
    if (!state.visible) return;
    let owner = byParent ? mesh.parent : root;
    if (!byParent) for (let parent = mesh.parent; parent && parent !== root; parent = parent.parent) {
      if (preserveGroups.has(parent)) { owner = parent; break; }
    }
    const attributes = Object.keys(geometry.attributes).sort().map(name => {
      const a = geometry.attributes[name];
      return `${name}:${a.itemSize}:${a.normalized}:${a.gpuType}:${(a.array || a.data.array).constructor.name}`;
    }).join('|');
    const key = [owner.uuid, material.uuid, attributes, !!geometry.index, mesh.castShadow, mesh.receiveShadow,
      mesh.layers.mask, mesh.renderOrder, state.groupOrder, mesh.frustumCulled, JSON.stringify(mesh.userData)].join(';');
    if (!batches.has(key)) batches.set(key, { owner, meshes: [] });
    batches.get(key).meshes.push(mesh);
  });
  let mergedBatches = 0, sourceDraws = 0;
  for (const { owner, meshes } of batches.values()) {
    if (meshes.length < 2) continue;
    const inverse = owner.matrixWorld.clone().invert(), parts = [];
    const instance = new T.Matrix4(), local = new T.Matrix4(), transform = new T.Matrix4();
    for (const mesh of meshes) {
      local.multiplyMatrices(inverse, mesh.matrixWorld);
      for (let i = 0, count = mesh.isInstancedMesh ? mesh.count : 1; i < count; i++) {
        if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, instance); transform.multiplyMatrices(local, instance); }
        else transform.copy(local);
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(transform);
        // A negative transform reverses front-face winding in WebGLRenderer.
        // Baking it requires the corresponding index reversal in the buffer.
        if (transform.determinant() < 0) {
          if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, n) => n));
          const index = geometry.index;
          for (let n = 0; n < index.count; n += 3) { const a = index.getX(n); index.setX(n, index.getX(n + 2)); index.setX(n + 2, a); }
        }
        parts.push(geometry);
      }
    }
    // Keep index layouts consistent if one mirrored non-indexed part needed an index.
    if (parts.some(part => part.index) && parts.some(part => !part.index)) {
      for (const part of parts) if (!part.index) part.setIndex(Array.from({ length: part.attributes.position.count }, (_, n) => n));
    }
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('Static draw merge rejected compatible attributes');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.surfaceUVPrepared = meshes.every(mesh => mesh.geometry.userData.surfaceUVPrepared);
    const first = meshes[0], merged = new T.Mesh(geometry, first.material);
    merged.name = `Static batch · ${first.material.name || first.material.color?.getHexString() || first.material.type}`;
    merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow;
    merged.layers.mask = first.layers.mask; merged.renderOrder = first.renderOrder; merged.frustumCulled = first.frustumCulled;
    merged.userData = { ...first.userData };
    owner.add(merged);
    onBatch?.({ owner, sources: meshes, merged });
    for (const mesh of meshes) mesh.removeFromParent();
    sourceDraws += meshes.length; mergedBatches++;
  }
  root.updateWorldMatrix(true, true);
  return { before, after: staticDrawStats(root), mergedBatches, sourceDraws };
}

/** Cache local TRS for rigid descendants; world matrices still follow parents.
 * Keep movable inspection roots automatic so normal clone/reposition works. */
export function cacheStaticLocalMatrices(root, { movable = new Set([root]) } = {}) {
  root.traverse(object => {
    if (movable.has(object) || object.userData.inspectionSource) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}

/** Conservative room pass, after loadSurfaceMaterials and before actions.
 * Managed collections keep their original object identities. Only siblings in
 * static furniture/shell groups are combined; no room transform is frozen. */
export function optimizeRoomStaticDraws(T, room, { onBatch } = {}) {
  const root = room.group, skipRoots = new Set(), protectedObjects = new Set();
  for (const object of [room.cat?.group, room.blinds?.group, room.photoWall?.group,
    room.decorations?.group, room.details, room.clock?.group, room.wallNavigation?.group]) {
    if (object?.isObject3D) skipRoots.add(object);
  }
  for (const object of room.animated || []) if (object?.isObject3D) skipRoots.add(object);
  for (const pet of room.pets || []) if (pet.object?.isObject3D) skipRoots.add(pet.object);
  for (const object of [room.clock?.hour, room.clock?.minute, room.blinds?.slats,
    room.blinds?.bottomRail, room.blinds?.handle]) if (object?.isObject3D) protectedObjects.add(object);
  root.traverse(object => {
    if (object.userData.roomAction || object.userData.actionPart || object.userData.roomActionId || object.userData.inspectionSource) skipRoots.add(object);
    if (object.name === 'Original Waseda and Karatsu desk miniatures' ||
      object.name === 'Paper navigation · on the study wall' ||
      object.name === 'Subtle desk patina') skipRoots.add(object);
    // Named mesh references are used by room tests, framing and asset owners.
    // Preserve their identities even when their geometry currently looks static.
    if (object.isMesh && object.name) protectedObjects.add(object);
    if (object.isMesh && (object.userData.rug || object.userData.photoId || object.userData.wallLink)) protectedObjects.add(object);
  });
  const report = mergeStaticDraws(T, root, { protectedObjects, skipRoots, onBatch });
  report.protectedObjects = protectedObjects.size;
  report.skippedRoots = skipRoots.size;
  root.userData.staticDrawOptimization = report;
  return report;
}
