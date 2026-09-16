/** Additive, static craftsmanship details. Shared geometry is batched by material. */
export function addRoomDetails(THREE, { group, palette, desk, chair, research, stack, blog, contact, profile, lamp, pot, windowGroup, gallery, drawers = [] }) {
  const layer = new THREE.Group();
  layer.name = 'Handcrafted room details';
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 24),
    sphere: new THREE.SphereGeometry(1, 10, 6),
  };
  const batches = new Map(), transform = new THREE.Object3D();
  const axis = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
  group.updateMatrixWorld(true);
  function detail(shape, material, scale, position, parent = group, rotation = [0, 0, 0]) {
    transform.position.set(...position); transform.rotation.set(...rotation); transform.scale.set(...scale); transform.updateMatrix();
    const owner=parent.userData.roomAction?parent:null;
    const matrix = owner?transform.matrix.clone():new THREE.Matrix4().multiplyMatrices(parent.matrixWorld, transform.matrix);
    const key = `${shape}:${material.uuid}:${owner?.uuid||''}`;
    if (!batches.has(key)) batches.set(key, { shape, material, matrices: [], owner });
    batches.get(key).matrices.push(matrix);
  }
  const box = (scale, position, material = palette.brass, parent = group, rotation) => detail('box', material, scale, position, parent, rotation);
  const disc = (r, h, position, material = palette.brass, parent = group, rotation) => detail('cylinder', material, [r, h, r], position, parent, rotation);
  const bead = (scale, position, material = palette.brass, parent = group) => detail('sphere', material, scale, position, parent);
  function rod(from, to, radius, material = palette.brass, parent = group) {
    a.set(...from); b.set(...to).sub(a);
    transform.position.copy(a).addScaledVector(b, .5); transform.scale.set(radius, b.length(), radius);
    transform.quaternion.setFromUnitVectors(axis, b.normalize()); transform.updateMatrix();
    const key = `cylinder:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { shape: 'cylinder', material, matrices: [] });
    batches.get(key).matrices.push(new THREE.Matrix4().multiplyMatrices(parent.matrixWorld, transform.matrix));
  }
  function frame(x, y, w, h, z, material, thickness = .025, parent = group) {
    for (const side of [-1, 1]) {
      box([w, thickness, .018], [x, y + side * h / 2, z], material, parent);
      box([thickness, h, .018], [x + side * w / 2, y, z], material, parent);
    }
  }

  // Low paneling stays below the existing photographs, window and shelving.
  box([12.90, 1.12, .035], [0, .77, -1.481], palette.paint);
  for (let i = 0; i < 10; i++) {
    const x = -5.77 + i * 1.282;
    frame(x, .77, 1.11, .82, -1.448, palette.wood, .045);
    frame(x, .77, 1.00, .71, -1.429, palette.lightWood, .012);
    box([.91, .62, .009], [x, .77, -1.453], palette.paint);
  }
  for (const [y, height, depth, material] of [
    [.305, .044, .12, palette.wood], [1.335, .070, .16, palette.wood],
    [1.385, .025, .12, palette.lightWood], [5.975, .057, .23, palette.wood],
    [6.030, .027, .25, palette.brass], [6.265, .078, .29, palette.wood],
    [6.322, .033, .33, palette.lightWood],
  ]) box([13.04, height, depth], [0, y, -1.375], material);
  for (let i = 0; i < 59; i++) box([.10, .078, .055], [-6.38 + i * .22, 6.216, -1.179], palette.lightWood);
  // Slim fluted pilasters divide the envelope without entering the photo area.
  for (const x of [-6.12, 6.04]) {
    box([.19, 4.53, .07], [x, 3.68, -1.446], palette.wood);
    for (const dx of [-.058, 0, .058]) box([.018, 4.26, .014], [x + dx, 3.67, -1.401], palette.lightWood);
    for (const y of [1.455, 5.897]) {
      box([.28, .070, .12], [x, y, -1.421], palette.darkWood);
      box([.31, .024, .145], [x, y + .047, -1.414], palette.lightWood);
    }
  }

  // Marquetry follows the room perimeter, keeping the original wood floor visible.
  for (const x of [-6.24, 6.24]) {
    box([.055, .007, 10.15], [x, -.025, 3.85], palette.darkWood);
    box([.011, .008, 10.15], [x - Math.sign(x) * .068, -.024, 3.85], palette.lightWood);
  }
  for (const z of [-1.17, 8.90]) box([12.53, .007, .055], [0, -.025, z], palette.darkWood);
  // A bound rug edge and short fringe are one instanced batch per existing material.
  for (const x of [-2.865, 3.265]) box([.022, .005, 3.04], [x, -.013, 1.85], palette.burgundy);
  for (const z of [.322, 3.378]) {
    box([6.14, .005, .024], [.20, -.013, z], palette.burgundy);
    for (let i = 0; i < 91; i++) box([.017, .004, .071 + i % 3 * .007], [-2.80 + i * .067, -.020, z + (z < 1 ? -.065 : .065)], palette.linen);
  }

  // Flush desk inlay, beaded edging, drawer keyholes and turned leg collars.
  for (const z of [-.800, .720]) box([5.96, .003, .008], [0, 2.167, z], palette.brass, desk);
  for (const x of [-2.98, 2.98]) box([.008, .003, 1.525], [x, 2.167, -.04], palette.brass, desk);
  for (const z of [-.863, .781]) box([6.14, .015, .012], [0, 2.090, z], palette.lightWood, desk);
  for (const drawer of drawers) {
    frame(0, 0, 2.34, .187, .799, palette.darkWood, .011, drawer);
    bead([.024, .032, .007], [0, .009, .802], palette.brass, drawer);
    bead([.006, .008, .008], [0, .017, .810], palette.ink, drawer);
    box([.005, .015, .005], [0, .005, .816], palette.ink, drawer);
    for (const dx of [-1.21, 1.21]) for (const dy of [-.11, .11]) {
      bead([.009, .009, .003], [dx, dy, .799], palette.brass, drawer);
      box([.009, .002, .002], [dx, dy, .803], palette.darkBrass, drawer);
    }
  }
  for (const x of [-2.82, 2.82]) for (const z of [-.69, .64]) {
    for (const [y, r] of [[1.34, .099], [1.46, .107], [.21, .081]]) disc(r, .023, [x * (y < .3 ? 1.02 : 1.004), y, z * (y < .3 ? 1.05 : 1.012)], palette.lightWood, desk);
    box([.19, .032, .21], [x, 1.83, z], palette.darkWood, desk);
  }
  // Riveted ferrules and cane seat joinery complement the existing chair and cat.
  for (const side of [-1, 1]) {
    for (const z of [-.51, .51]) disc(.043, .034, [side * .54, .066, z], palette.brass, chair);
    for (const z of [-.38, .38]) bead([.016, .005, .016], [side * .49, 1.164, z], palette.darkBrass, chair);
  }
  for (let i = -3; i <= 3; i++) {
    const x = i * .132;
    disc(.026, .041, [x * .93, 1.184, .368], palette.darkWood, chair);
  }

  // Pages and headbands use fine geometry only on the small existing books.
  research.children.filter(child => child.isGroup).forEach((book, index) => {
    const spine = book.children.find(child => child.isMesh && child.material === palette.paper);
    if (!spine) return;
    const h = spine.position.y * 2, w = .14 + index % 2 * .035;
    for (const y of [.085, .17, h - .18, h - .075]) box([w + .029, .011, .010], [0, y, .263], palette.darkBrass, book);
    for (const x of [-w * .33, w * .33]) box([.006, h * .65, .003], [x, h * .52, .270], palette.brass, book);
    for (let j = 0; j < 8; j++) box([w * .77, .0015, .035], [0, h - .013 - j * .003, -.20], palette.linen, book);
  });
  stack.children.filter(child => child.isGroup).forEach((book, index) => {
    for (let j = 1; j < 6; j++) box([.004, .002, .54], [(.90 - index * .065) / 2 + .001, .015 + j * .014, -.01], palette.linen, book);
    for (const x of [-.31, .31]) box([.012, .084, .004], [x, .062, .338], palette.brass, book);
  });
  for (const side of [-1, 1]) {
    for (let j = 0; j < 4; j++) box([.625, .0014, .006], [side * .337, .011 + j * .008, .421], palette.linen, blog);
    box([.633, .002, .004], [side * .337, -.006, .432], palette.brass, blog);
  }
  // Embossed wax seal and corner fixings stay attached visually to their originals.
  disc(.028, .003, [0, .026, .046], palette.darkBrass, contact);
  for (const dx of [-.013, .013]) box([.004, .003, .026], [dx, .029, .046], palette.burgundy, contact);
  for (const x of [-.365, .365]) for (const z of [-.125, .125]) bead([.009, .0025, .009], [x, .057, z], palette.brass, profile);

  // A compact pen tray and an inkwell use the free front corners of the desk;
  // the entire rear strip holding the four landmark models remains clear.
  const tray = new THREE.Group(); tray.position.set(1.70, 2.183, .55); tray.rotation.y = -.10; group.add(tray); tray.updateMatrixWorld(true);
  box([.69, .022, .32], [0, .011, 0], palette.darkWood, tray);
  box([.63, .007, .265], [0, .027, 0], palette.burgundy, tray);
  for (const z of [-.156, .156]) box([.69, .026, .017], [0, .036, z], palette.brass, tray);
  for (const x of [-.336, .336]) box([.016, .026, .31], [x, .036, 0], palette.brass, tray);
  rod([-.24, .048, -.066], [.18, .048, .072], .015, palette.ink, tray);
  rod([-.25, .048, -.069], [-.18, .048, -.046], .017, palette.brass, tray);
  rod([.18, .048, .072], [.24, .048, .092], .008, palette.brass, tray);
  rod([-.225, .063, -.058], [-.125, .063, -.025], .003, palette.brass, tray);
  box([.16, .014, .073], [.205, .041, -.075], palette.paper, tray, [0, -.16, 0]);
  const ink = new THREE.Group(); ink.position.set(-2.85, 2.181, .38); group.add(ink); ink.updateMatrixWorld(true);
  box([.18, .02, .18], [0, .010, 0], palette.brass, ink);
  box([.137, .091, .137], [0, .062, 0], palette.ink, ink);
  disc(.050, .023, [0, .116, 0], palette.brass, ink);
  disc(.056, .015, [0, .135, 0], palette.darkBrass, ink);
  bead([.013, .018, .013], [0, .151, 0], palette.brass, ink);
  box([.084, .042, .002], [0, .063, .070], palette.paper, ink);
  for (let i = 0; i < 3; i++) box([.054 - i * .01, .003, .003], [0, .073 - i * .012, .073], palette.darkBrass, ink);

  // Existing lamp and pencil pot gain fittings without extra lights or animation.
  for (const y of [.13, .66, .78]) disc(.041, .025, [0, y, -y * .061], palette.darkBrass, lamp);
  bead([.044, .044, .038], [-.016, .820, -.051], palette.brass, lamp);
  disc(.025, .014, [.036, .820, -.051], palette.darkBrass, lamp, [0, 0, Math.PI / 2]);
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    rod([Math.cos(angle) * .103, .025, Math.sin(angle) * .103], [Math.cos(angle) * .114, .211, Math.sin(angle) * .114], .003, palette.lightWood, pot);
  }

  // Window catches, shelf edging and fine inner frame rebates are small close-up rewards.
  for (const x of [-5.67, -4.55, -3.43]) {
    box([.030, .091, .023], [x, 3.225, -1.080], palette.darkBrass, windowGroup);
    rod([x, 3.235, -1.056], [x + .044, 3.235, -1.056], .009, palette.brass, windowGroup);
  }
  for (const [x, y, width] of [[3.84, 3.11, 3.00]]) {
    box([width - .08, .017, .014], [x, y + .011, -.704], palette.brass);
    for (const side of [-1, 1]) bead([.015, .015, .005], [x + side * width * .33, y - .33, -1.387], palette.brass);
  }
  // A substantial wall clock: walnut case, brushed brass bezel and a cream dial.
  const clock = new THREE.Group(); clock.name = 'Brass wall clock';
  clock.userData.roomAction = {kind:'detail',label:'掛け時計'};
  clock.position.set(4.72, 5.38, -1.325); clock.scale.setScalar(.68); group.add(clock); clock.updateMatrixWorld(true);
  const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(.835, .835, .15, 64), palette.darkWood);
  caseMesh.rotation.x = Math.PI / 2; caseMesh.castShadow = caseMesh.receiveShadow = true; clock.add(caseMesh);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(.778, .045, 8, 64), palette.brass);
  bezel.position.z = .097; bezel.castShadow = bezel.receiveShadow = true; clock.add(bezel);
  disc(.746, .022, [0, 0, .091], palette.paper, clock, [Math.PI / 2, 0, 0]);
  const dialCanvas = document.createElement('canvas'); dialCanvas.width = dialCanvas.height = 1024;
  const dial = dialCanvas.getContext('2d'); dial.fillStyle = '#f0eadb'; dial.fillRect(0, 0, 1024, 1024);
  dial.textAlign = 'center'; dial.textBaseline = 'middle'; dial.fillStyle = '#41473e'; dial.font = '70px Georgia, serif';
  for (let hour = 1; hour <= 12; hour++) {
    const angle = hour * Math.PI / 6; dial.fillText(String(hour), 512 + Math.sin(angle) * 337, 516 - Math.cos(angle) * 337);
  }
  dial.fillStyle = '#9a8259'; dial.font = '19px Georgia, serif'; dial.fillText('KIMURA · TOKYO', 512, 646);
  const dialMap = new THREE.CanvasTexture(dialCanvas); dialMap.colorSpace = THREE.SRGBColorSpace; dialMap.anisotropy = 4;
  const dialFace = new THREE.Mesh(new THREE.CircleGeometry(.729, 64), new THREE.MeshStandardMaterial({ map: dialMap, roughness: .92 }));
  dialFace.position.z = .107; clock.add(dialFace);
  for (let i = 0; i < 60; i++) {
    const angle = i * Math.PI / 30, major = i % 5 === 0;
    box([major ? .019 : .006, major ? .068 : .025, .007], [Math.sin(angle) * .661, Math.cos(angle) * .661, .116], palette.darkBrass, clock, [0, 0, -angle]);
  }
  // Hands stay outside the static batches so civil time can rotate them.
  function hand(name, length, width, z) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(0, 0, z);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(width, length, .012), palette.ink);
    pointer.position.y = length / 2; pointer.raycast = () => {};
    pivot.add(pointer); clock.add(pivot); return pivot;
  }
  layer.clock = { group: clock, hour: hand('Wall hour hand', .357, .035, .141), minute: hand('Wall minute hand', .528, .021, .160) };
  bead([.048, .048, .021], [0, 0, .175], palette.brass, clock);

  // Static matrices are baked once. Decorative pieces do not intercept existing
  // interaction targets, and fine trim does not add shadow-map work each frame.
  let instances = 0;
  for (const { shape, material, matrices, owner } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometries[shape], material, matrices.length);
    mesh.name = `Craft detail ${shape}`; mesh.castShadow = false; mesh.receiveShadow = true;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;if(!owner)mesh.raycast = () => {};
    mesh.computeBoundingSphere();(owner||layer).add(mesh);instances += matrices.length;
  }
  layer.userData.detailStats = { instances, drawBatches: batches.size, geometries: Object.keys(geometries).length, newMaterials: 0 };
  group.add(layer);
  return layer;
}
