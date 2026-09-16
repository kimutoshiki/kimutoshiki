import { PHOTO_CATALOG } from './photo-catalog.js?v=20260916-atlas2';
import { createWallAtlas } from './wall-atlas.js?v=20260916-atlas2';

/** Geography determines the wall; all thirty original photographs remain present. */
export const PHOTO_WALL_COLLECTIONS = Object.freeze({
  karatsu: ['hirano-memories', 'kyukeisha-karatsu', 'waseda-night', 'saga-aspiration'],
  world: ['seoul-lights', 'taipei-time', 'singapore-waterfront', 'taj-mahal-marble'],
  japan: ['yonezawa-stillness', 'okawa-remembrance', 'jingu-cheers', 'suzuka-spring'],
  europe: ['edinburgh-beginnings', 'liverpool-four', 'manchester-seventeen', 'manchester-matchday', 'milton-keynes-racing', 'watford-magic', 'london-time', 'greenwich-zero', 'wembley-night', 'richmond-stories', 'bracknell-first-page', 'oxford-courtyard', 'gloucester-cloisters', 'paris-blue-hour', 'paris-chopin', 'versailles-reflections', 'nice-afternoon', 'monaco-curves'],
});

/** Uncropped photographs, slim physical frames, and one shared caption atlas. */
export function createPhotoWall(T, { room, palette, targets, onTextureLoad = () => {} }) {
  const group = new T.Group(); group.name = 'Photographs · collected journeys'; room.add(group);
  const atlas = createWallAtlas(T, { room, palette, onTextureLoad });
  const cube = new T.BoxGeometry(1, 1, 1), plane = new T.PlaneGeometry(1, 1);
  const paper = new T.MeshStandardMaterial({ color: '#efe7d5', roughness: .95 });
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 768; labelCanvas.height = 2048;
  const ctx = labelCanvas.getContext('2d'); ctx.fillStyle = '#efe7d5'; ctx.fillRect(0, 0, 768, 2048);
  const rowHeight = 64;
  PHOTO_CATALOG.forEach((photo, i) => {
    const y = i * rowHeight;
    ctx.textAlign = 'center'; ctx.fillStyle = '#383b30';
    ctx.font = '500 32px "Noto Serif JP", "Yu Mincho", serif'; ctx.fillText(photo.title, 384, y + 32, 738);
    ctx.fillStyle = '#816744'; ctx.font = '16px Georgia, serif'; ctx.fillText(photo.subtitle || '', 384, y + 54, 738);
  });
  const labelMap = new T.CanvasTexture(labelCanvas); labelMap.colorSpace = T.SRGBColorSpace; labelMap.anisotropy = 8;
  const labelMaterial = new T.MeshStandardMaterial({ map: labelMap, roughness: .96 });
  const loader = new T.TextureLoader(), frames = [], queue = [], textures = new Set();
  let disposed = false, activeLoads = 0;
  const catalog = new Map(PHOTO_CATALOG.map(photo => [photo.id, photo]));
  const assignments = Object.entries(PHOTO_WALL_COLLECTIONS).flatMap(([wall, ids]) => ids.map((id, slot) => ({ photo: catalog.get(id), wall, slot })));
  const assignedIds = assignments.map(({ photo }) => photo?.id);
  if (assignments.length !== PHOTO_CATALOG.length || new Set(assignedIds).size !== PHOTO_CATALOG.length || assignedIds.includes(undefined)) throw new Error('Each photograph must belong to exactly one atlas wall');
  const frontCount = PHOTO_WALL_COLLECTIONS.karatsu.length;
  let frontSettled = 0, resolvePhotos;
  const photosReady = new Promise(resolve => { resolvePhotos = resolve; });
  const ready = Promise.all([photosReady, atlas.ready]);
  if (!frontCount) resolvePhotos();
  const settle = frame => { if (frame.priority && ++frontSettled === frontCount) resolvePhotos(); };
  function box(w, h, d, x, y, z, material, parent) {
    const mesh = new T.Mesh(cube, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function pump() {
    while (!disposed && activeLoads < 2 && queue.length) {
      const frame = queue.shift(); activeLoads++;
      loader.load(frame.photo.src, texture => {
        activeLoads--;
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
        textures.add(texture); frame.image.material.map = texture;
        frame.image.material.color.set('#ffffff'); frame.image.material.needsUpdate = true;
        frame.loaded = true; settle(frame); onTextureLoad(frame.photo.id); pump();
      }, undefined, () => { activeLoads--; frame.failed = true; settle(frame); if (!disposed) pump(); });
    }
  }
  function enqueue(frame) { if (frame.queued) return; frame.queued = true; queue.push(frame); }
  assignments.forEach(({ photo, wall, slot }) => {
    const frame = new T.Group(); frame.name = photo.title; group.add(frame);
    const ratio = photo.width / photo.height, maxW = wall === 'europe' ? .98 : 1.04, maxH = wall === 'europe' ? .73 : .76;
    const width = Math.min(maxW, maxH * ratio), height = width / ratio;
    // The visible photograph and frame aperture share the exact source ratio.
    box(width + .070, height + .070, .054, 0, 0, 0, palette.darkWood, frame);
    box(width + .030, height + .030, .010, 0, 0, .032, palette.brass, frame);
    const image = new T.Mesh(plane, new T.MeshStandardMaterial({ color: '#c7bba2', roughness: .82 }));
    image.scale.set(width, height, 1); image.position.z = .040; image.receiveShadow = true; frame.add(image);
    const labelWidth = Math.max(.78, width + .035), labelHeight = .108;
    const labelY = -height / 2 - .109;
    const plaque = box(labelWidth + .018, labelHeight + .012, .009, 0, labelY, .022, paper, frame); plaque.castShadow = false;
    const captionGeo = new T.PlaneGeometry(labelWidth, labelHeight), uv = captionGeo.attributes.uv;
    const captionIndex = PHOTO_CATALOG.indexOf(photo);
    for (let v = 0; v < uv.count; v++) uv.setY(v, 1 - (captionIndex * rowHeight + (1 - uv.getY(v)) * rowHeight) / 2048);
    const caption = new T.Mesh(captionGeo, labelMaterial); caption.position.set(0, labelY, .028); frame.add(caption);
    if (wall === 'karatsu') frame.position.set([-2.13, -.86, .45, 1.68][slot], 3.69, -1.367);
    else if (wall === 'world') { frame.position.set(6.325, 3.04, 1.10 + slot * 1.97); frame.rotation.y = -Math.PI / 2; }
    else if (wall === 'japan') { frame.position.set(-1.60 + slot * 1.84, 4.73, 9.235); frame.rotation.y = Math.PI; }
    else { frame.position.set(-6.325, [5.15, 4.03, 2.91][Math.floor(slot / 6)], 7.47 - slot % 6 * 1.34); frame.rotation.y = Math.PI / 2; }
    const id = 'photo-' + photo.id;
    frame.userData.targetId = id; frame.traverse(o => { if (o.isMesh) o.userData.targetId = id; });
    frame.userData.photo = { id: photo.id, wall, width, height, originalWidth: photo.width, originalHeight: photo.height };
    targets.push({ id, object: frame, anchor: frame.position.clone() });
    const record = { photo, wall, frame, image, priority: wall === 'karatsu', loaded: false, queued: false }; frames.push(record);
    if (record.priority) enqueue(record);
  });
  pump();
  const frustum = new T.Frustum(), projection = new T.Matrix4(), point = new T.Vector3(), normal = new T.Vector3(), toCamera = new T.Vector3();
  const previousCamera = new T.Matrix4(); let previousProjection = '';
  return {
    group, frames, atlas, ready,
    get photosLoaded() { return frames.filter(frame => frame.loaded).length; },
    get frontProgress() { return (frontSettled + atlas.frontProgress) / (frontCount + 1); },
    update(camera) {
      if (disposed) return;
      const projectionKey = camera.projectionMatrix.elements.join(',');
      if (previousCamera.equals(camera.matrixWorld) && previousProjection === projectionKey) return;
      previousCamera.copy(camera.matrixWorld); previousProjection = projectionKey;
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      atlas.update(camera, frustum);
      for (const frame of frames) {
        if (frame.queued) continue;
        frame.frame.getWorldPosition(point); normal.set(0, 0, 1).transformDirection(frame.frame.matrixWorld);
        toCamera.copy(camera.position).sub(point);
        if (normal.dot(toCamera) > 0 && frustum.intersectsObject(frame.image)) enqueue(frame);
      }
      pump();
    },
    dispose() { disposed = true; queue.length = 0; resolvePhotos(); atlas.dispose(); textures.forEach(texture => texture.dispose()); labelMap.dispose(); },
  };
}
