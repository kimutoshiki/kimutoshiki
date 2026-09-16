import { PHOTO_CATALOG } from './photo-catalog.js?v=20260916-room';

/** Real, uncropped photographs; one caption atlas and shared frame geometry. */
export function createPhotoWall(T, { room, palette, targets, onTextureLoad = () => {} }) {
  const group = new T.Group(); group.name = 'Photographs · collected journeys'; room.add(group);
  const cube = new T.BoxGeometry(1, 1, 1), plane = new T.PlaneGeometry(1, 1);
  const paper = new T.MeshStandardMaterial({ color: '#f5f1e7', roughness: .96 });
  const ink = new T.MeshStandardMaterial({ color: '#3c4240', roughness: .91 });
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 2048;
  const ctx = labelCanvas.getContext('2d'); ctx.fillStyle = '#f5f1e7'; ctx.fillRect(0, 0, 512, 2048);
  const rowHeight = 64;
  PHOTO_CATALOG.forEach((photo, i) => {
    const y = i * rowHeight;
    ctx.textAlign = 'center'; ctx.fillStyle = '#393d35';
    ctx.font = '500 36px "Noto Serif JP", "Yu Mincho", serif'; ctx.fillText(photo.title, 256, y + 35, 486);
    ctx.fillStyle = '#8d7857'; ctx.font = '17px Georgia, serif'; ctx.fillText(photo.subtitle || '', 256, y + 57, 482);
  });
  const labelMap = new T.CanvasTexture(labelCanvas); labelMap.colorSpace = T.SRGBColorSpace; labelMap.anisotropy = 4;
  const labelMaterial = new T.MeshStandardMaterial({ map: labelMap, roughness: .93 });
  const loader = new T.TextureLoader(), frames = [], queue = [], textures = new Set();
  let disposed = false, activeLoads = 0;
  const frontCount = Math.min(5, PHOTO_CATALOG.length);
  const selected = ['waseda-night', 'paris-blue-hour', 'london-time', 'kyukeisha-karatsu', 'taj-mahal-marble'];
  const photos = [...selected.map(id => PHOTO_CATALOG.find(photo => photo.id === id)).filter(Boolean), ...PHOTO_CATALOG.filter(photo => !selected.includes(photo.id))];
  let frontSettled = 0, resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  if (!frontCount) resolveReady();
  const settle = frame => { if (frame.priority && ++frontSettled === frontCount) resolveReady(); };
  const frontPositions = [[-2.41, 4.52], [-.53, 4.57], [1.60, 4.45], [-1.82, 3.17], [.23, 3.14]];
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
  photos.forEach((photo, index) => {
    const frame = new T.Group(); frame.name = photo.title; group.add(frame);
    const ratio = photo.width / photo.height;
    const maxW = index < frontCount ? 1.52 : 1.42, maxH = index < frontCount ? 1.04 : 1.05;
    const width = Math.min(maxW, maxH * ratio), height = width / ratio;
    const outerW = width + .21, outerH = height + .39;
    box(outerW, outerH, .075, 0, -.072, 0, palette.darkWood, frame);
    box(outerW - .058, outerH - .058, .016, 0, -.072, .047, palette.brass, frame);
    box(outerW - .078, outerH - .078, .022, 0, -.072, .061, paper, frame);
    // The visible aperture is exactly the source aspect ratio; no cover crop.
    const image = new T.Mesh(plane, new T.MeshStandardMaterial({ color: '#e2ddcf', roughness: .78 }));
    image.scale.set(width, height, 1); image.position.set(0, .023, .076); image.receiveShadow = true; frame.add(image);
    const captionGeo = new T.PlaneGeometry(width + .04, .152), uv = captionGeo.attributes.uv;
    const captionIndex = PHOTO_CATALOG.indexOf(photo);
    for (let v = 0; v < uv.count; v++) uv.setY(v, 1 - (captionIndex * rowHeight + (1 - uv.getY(v)) * rowHeight) / 2048);
    const caption = new T.Mesh(captionGeo, labelMaterial); caption.position.set(0, -height / 2 - .086, .080); frame.add(caption);
    // A fine bottom bevel and a dark reveal make the mat read as a physical recess.
    box(width + .006, .008, .003, 0, height / 2 + .025, .079, ink, frame);
    if (index < frontCount) frame.position.set(...frontPositions[index], -1.365);
    else if (index < 23) {
      const wallIndex = index - frontCount, side = wallIndex < 9 ? -1 : 1, slot = wallIndex % 9;
      frame.position.set(side * 6.34, [5.28, 3.75, 2.22][Math.floor(slot / 3)], 2.80 + slot % 3 * 2.45);
      frame.rotation.y = -side * Math.PI / 2;
    } else {
      const slot = index - 23;
      frame.position.set(-1.35 + slot % 4 * 1.82, slot < 4 ? 4.97 : 3.38, 9.24); frame.rotation.y = Math.PI;
    }
    const id = 'photo-' + photo.id;
    frame.userData.targetId = id; frame.traverse(o => { if (o.isMesh) o.userData.targetId = id; });
    frame.userData.photo = { id: photo.id, width, height, originalWidth: photo.width, originalHeight: photo.height };
    targets.push({ id, object: frame, anchor: frame.position.clone() });
    const record = { photo, frame, image, priority: index < frontCount, loaded: false, queued: false }; frames.push(record);
    if (index < frontCount) enqueue(record);
  });
  pump();
  const frustum = new T.Frustum(), projection = new T.Matrix4(), point = new T.Vector3(), normal = new T.Vector3(), toCamera = new T.Vector3();
  const previousCamera = new T.Matrix4(); let previousProjection = '';
  return {
    group, frames, ready,
    get photosLoaded() { return frames.filter(frame => frame.loaded).length; },
    get frontProgress() { return frontCount ? frontSettled / frontCount : 1; },
    update(camera) {
      if (disposed || frames.every(frame => frame.queued)) return;
      const projectionKey = camera.projectionMatrix.elements.join(',');
      if (previousCamera.equals(camera.matrixWorld) && previousProjection === projectionKey) return;
      previousCamera.copy(camera.matrixWorld); previousProjection = projectionKey;
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const frame of frames) {
        if (frame.queued) continue;
        frame.frame.getWorldPosition(point); normal.set(0, 0, 1).transformDirection(frame.frame.matrixWorld);
        toCamera.copy(camera.position).sub(point);
        if (normal.dot(toCamera) > 0 && frustum.intersectsObject(frame.image)) enqueue(frame);
      }
      pump();
    },
    dispose() { disposed = true; queue.length = 0; resolveReady(); textures.forEach(texture => texture.dispose()); labelMap.dispose(); },
  };
}

/** An original, deliberately simplified atlas, built as shallow metal inlay. */
export function addWorldMap(T, room, palette) {
  const continents = [
    [[-168,70],[-146,71],[-130,58],[-123,50],[-125,39],[-117,31],[-105,24],[-99,19],[-88,21],[-82,9],[-78,8],[-82,23],[-80,31],[-70,45],[-59,51],[-60,60],[-79,68],[-97,73],[-114,70],[-128,73],[-152,70]],
    [[-73,60],[-53,59],[-34,68],[-27,80],[-47,84],[-65,77]],
    [[-80,10],[-67,9],[-60,4],[-50,-1],[-35,-6],[-41,-22],[-54,-35],[-66,-55],[-73,-50],[-75,-29],[-80,-5]],
    [[-11,36],[-7,44],[-9,53],[0,59],[7,58],[15,70],[28,71],[34,61],[46,57],[53,50],[41,42],[27,41],[23,35],[15,41],[12,45],[5,43]],
    [[-17,33],[-3,36],[12,33],[24,32],[35,30],[44,12],[51,11],[42,-4],[40,-17],[30,-32],[19,-35],[12,-19],[9,-1],[-5,5],[-15,14]],
    [[29,41],[36,53],[35,63],[56,68],[86,76],[115,73],[147,71],[172,64],[177,53],[157,50],[143,43],[132,34],[122,24],[119,11],[109,2],[103,10],[100,20],[90,22],[82,9],[75,9],[68,25],[59,25],[49,13],[42,14],[35,31]],
    [[112,-11],[126,-12],[135,-11],[144,-16],[153,-27],[145,-39],[131,-32],[117,-35],[112,-23]],
    [[-8,58],[-2,59],[1,51],[-5,50]], [[-24,65],[-16,67],[-13,64],[-22,63]],
    [[129,31],[136,35],[142,42],[145,44],[142,35],[136,32]], [[46,-13],[51,-16],[49,-25],[44,-24]],
    [[166,-35],[178,-39],[173,-47],[166,-46],[169,-41]], [[95,5],[105,-5],[117,-8],[130,-5],[139,-8],[143,-4],[133,0],[124,1],[116,-4],[109,0]],
  ];
  const group = new T.Group(); group.name = 'Atlas · brass and charcoal inlay'; room.add(group);
  const fill = new T.MeshStandardMaterial({ color: '#70796f', roughness: .91, transparent: true, opacity: .15, depthWrite: false });
  const lineMaterial = new T.LineBasicMaterial({ color: '#a58c59', transparent: true, opacity: .43 });
  const scale = 7.65 / 360;
  for (const coords of continents) {
    const points = coords.map(([x, y]) => new T.Vector2(x * scale, y * scale));
    const shape = new T.Shape(points), mesh = new T.Mesh(new T.ShapeGeometry(shape), fill);
    mesh.receiveShadow = true; mesh.position.z = -.008; mesh.raycast = () => {}; group.add(mesh);
    const outline = new T.LineLoop(new T.BufferGeometry().setFromPoints(points.map(point => new T.Vector3(point.x, point.y, 0))), lineMaterial);
    outline.raycast = () => {}; group.add(outline);
  }
  group.position.set(.78, 3.80, -1.482);
  return group;
}
