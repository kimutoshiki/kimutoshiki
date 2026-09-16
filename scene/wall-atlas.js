/** Supplied maps retain every edge and their original 1672:941 aspect ratio. */
export const ATLAS_WALLS = Object.freeze({
  karatsu: { label: 'Karatsu', wall: 'front', file: 'karatsu', position: [1.30, 3.74, -1.443], rotation: 0, height: 4.60 },
  world: { label: 'World', wall: 'right', file: 'world', position: [6.412, 3.74, 4.12], rotation: -Math.PI / 2, height: 4.60 },
  japan: { label: 'Japan', wall: 'back', file: 'japan', position: [1.43, 3.74, 9.315], rotation: Math.PI, height: 4.60 },
  europe: { label: 'Europe', wall: 'left', file: 'europe', position: [-6.412, 3.74, 4.12], rotation: Math.PI / 2, height: 4.60 },
});

export function createWallAtlas(T, { room, palette, onTextureLoad = () => {} }) {
  const group = new T.Group(); group.name = 'Four walls · four atlases'; room.add(group);
  const loader = new T.TextureLoader(), panels = [], queue = [], textures = new Set();
  const geometry = new T.PlaneGeometry(1, 1), backingGeometry = new T.BoxGeometry(1, 1, 1);
  const backingMaterial = new T.MeshStandardMaterial({ color: '#68563c', roughness: .95 });
  let disposed = false, activeLoads = 0, frontSettled = false, resolveReady, queuedCount = 0;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const settle = panel => { if (panel.priority) { frontSettled = true; resolveReady(); } };
  function pump() {
    while (!disposed && activeLoads < 1 && queue.length) {
      const panel = queue.shift(); activeLoads++;
      loader.load(panel.src, texture => {
        activeLoads--;
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
        textures.add(texture); panel.image.material.map = texture;
        panel.image.material.color.set('#ffffff'); panel.image.material.needsUpdate = true;
        panel.loaded = true; settle(panel); onTextureLoad('atlas-' + panel.id); pump();
      }, undefined, () => { activeLoads--; panel.failed = true; settle(panel); if (!disposed) pump(); });
    }
  }
  function enqueue(panel) { if (panel.queued) return; panel.queued = true; queuedCount++; queue.push(panel); }
  for (const [id, spec] of Object.entries(ATLAS_WALLS)) {
    const panel = new T.Group(); panel.name = 'Atlas wallpaper · ' + spec.label;
    panel.position.set(...spec.position); panel.rotation.y = spec.rotation; group.add(panel);
    const height = spec.height, width = height * 1672 / 941;
    // A flush papered panel has a narrow dark reveal, not an oversized picture mat.
    const backing = new T.Mesh(backingGeometry, backingMaterial);
    backing.scale.set(width + .035, height + .035, .014); backing.position.z = -.010;
    backing.receiveShadow = true; backing.raycast = () => {}; panel.add(backing);
    const image = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: '#c7aa78', roughness: .98, metalness: 0 }));
    image.scale.set(width, height, 1); image.receiveShadow = true; image.raycast = () => {}; panel.add(image);
    panel.userData.atlas = { id, wall: spec.wall, width, height, sourceWidth: 1672, sourceHeight: 941 };
    const record = { id, wall: spec.wall, panel, image, src: '/images/atlas/' + spec.file + '.webp', priority: id === 'karatsu', queued: false, loaded: false, center: new T.Vector3(), normal: new T.Vector3(), bounds: new T.Sphere() };
    panels.push(record); if (record.priority) enqueue(record);
  }
  pump();
  const towardCamera = new T.Vector3(), previousWorld = new T.Matrix4();
  let worldReady = false;
  return {
    group, panels, ready,
    get frontProgress() { return frontSettled ? 1 : 0; },
    get allQueued() { return queuedCount === panels.length; },
    update(camera, frustum) {
      if (disposed || queuedCount === panels.length) return;
      if (!worldReady || !previousWorld.equals(group.matrixWorld)) {
        group.updateWorldMatrix(true, true);
        previousWorld.copy(group.matrixWorld); worldReady = true;
        for (const record of panels) {
          record.center.setFromMatrixPosition(record.panel.matrixWorld);
          record.normal.set(0, 0, 1).transformDirection(record.panel.matrixWorld);
          if (!record.image.geometry.boundingSphere) record.image.geometry.computeBoundingSphere();
          record.bounds.copy(record.image.geometry.boundingSphere).applyMatrix4(record.image.matrixWorld);
        }
      }
      for (const panel of panels) {
        if (panel.queued) continue;
        towardCamera.copy(camera.position).sub(panel.center);
        if (panel.normal.dot(towardCamera) > 0 && frustum.intersectsSphere(panel.bounds)) enqueue(panel);
      }
      pump();
    },
    dispose() { disposed = true; queue.length = 0; resolveReady(); textures.forEach(texture => texture.dispose()); },
  };
}
