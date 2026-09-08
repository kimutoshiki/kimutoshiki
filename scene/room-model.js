import { addRoomDetails } from './room-details.js';

/** Original, procedural room scene. No third-party model or geometry dependencies. */
export function createRoom(THREE, assets = {}) {
  const group = new THREE.Group();
  group.name = 'A quiet room for learning';
  const targets = [];
  const animated = [];
  const pets = [];
  const mat = (color, roughness = .75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const palette = {
    wood: mat('#805537', .65), lightWood: mat('#ac7546', .61), darkWood: mat('#4b3023', .67),
    brass: mat('#a68b4e', .33, .72), darkBrass: mat('#675a3a', .44, .6),
    wall: mat('#9e976a', .97), cream: mat('#e5ddbd', .95), paper: mat('#ece6d2', .92),
    terra: mat('#a9603c', .94), potDark: mat('#594b32', .96), soil: mat('#302e20', 1),
    green: mat('#35512e', .84), leafLight: mat('#657642', .86), leafDark: mat('#233e26', .89),
    burgundy: mat('#6a3133', .79), ink: mat('#34382e', .88), linen: mat('#c6b38e', .95),
  };
  const textureLoader = new THREE.TextureLoader();
  const makeCanvas = (w, h, draw) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
  };
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const woodTexture = assets.wood ? textureLoader.load(assets.wood) : makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#a0754a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 490; i++) {
      const y = rnd() * h;
      ctx.strokeStyle = `rgba(${rnd() > .48 ? '60,30,12' : '231,186,125'},${.025 + rnd() * .16})`;
      ctx.lineWidth = .3 + rnd() * 1.8; ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const yy = y + Math.sin(x / (38 + i % 57) + i) * (1 + i % 5);
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      } ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w, y = rnd() * h;
      ctx.strokeStyle = 'rgba(64,35,18,.09)'; ctx.lineWidth = 1;
      for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(x, y, 18 + j * 12, 2 + j * 2.7, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
  });
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  palette.wood.map = woodTexture;
  palette.lightWood.map = woodTexture;
  // A shallow grain reads at close range while preserving the existing wood color.
  for (const material of [palette.wood, palette.lightWood]) {
    material.bumpMap = woodTexture; material.bumpScale = .007;
  }
  const floorTexture = makeCanvas(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#98724f'; ctx.fillRect(0, 0, w, h);
    const bh = 128;
    for (let row = 0; row < 8; row++) {
      ctx.fillStyle = ['#997650', '#a07b55', '#9c7650', '#92704e'][row % 4];
      ctx.fillRect(0, row * bh, w, bh);
      for (let i = 0; i < 80; i++) {
        ctx.strokeStyle = `rgba(66,43,24,${.025 + rnd() * .09})`;
        const y = row * bh + rnd() * bh; ctx.lineWidth = rnd() + .4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(300, y + 8, 700, y - 5, 1024, y + 2); ctx.stroke();
      }
      ctx.fillStyle = '#665339'; ctx.fillRect(0, row * bh, w, 2);
      const joint = (row % 3) * 310 + 120; ctx.fillRect(joint, row * bh, 2, bh);
    }
  });
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(1.8, 2.6);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .79, color: '#d4c5a7' });
  floorMat.bumpMap = floorTexture; floorMat.bumpScale = .006;
  const geometryCache = new Map();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const softSphere = new THREE.SphereGeometry(1, 16, 10);
  function oval(sx, sy, sz, material, x, y, z, parent = group) {
    const o = mesh(softSphere, material, parent); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o;
  }
  function mesh(geo, material, parent = group, cast = true) {
    const obj = new THREE.Mesh(geo, material); obj.castShadow = cast; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0, parent = group, radius = 0) {
    let geo = cube;
    if (radius > 0) {
      const key = [w, h, d, radius].join(',');
      if (!geometryCache.has(key)) {
        const s = new THREE.Shape(), r = Math.min(radius, w / 3, h / 3, d / 3);
        const X = w / 2 - r, Y = h / 2 - r;
        s.moveTo(-X, -Y); s.lineTo(X, -Y); s.lineTo(X, Y); s.lineTo(-X, Y); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelThickness: r, bevelSize: r, curveSegments: 2 });
        g.translate(0, 0, -d / 2 + r); geometryCache.set(key, g);
      } geo = geometryCache.get(key);
    }
    const o = mesh(geo, material, parent); if (!radius) o.scale.set(w, h, d); o.position.set(x, y, z); return o;
  }
  function cyl(rt, rb, h, material, x, y, z, parent = group, radial = 20) {
    const o = mesh(new THREE.CylinderGeometry(rt, rb, h, radial), material, parent); o.position.set(x, y, z); return o;
  }
  function rod(a, b, radius, material, parent = group, radiusTop = radius) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), diff = vb.clone().sub(va);
    const o = mesh(new THREE.CylinderGeometry(radiusTop, radius, diff.length(), 12), material, parent);
    o.position.copy(va.add(vb).multiplyScalar(.5)); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize()); return o;
  }
  function curve(points, radius, material, parent = group, segments = 24) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false), material, parent);
  }
  function target(id, object, anchor) {
    object.name = id; object.userData.targetId = id;
    object.traverse(o => { if (o.isMesh) o.userData.targetId = id; });
    targets.push({ id, object, anchor: new THREE.Vector3(...anchor) });
  }
  function paperTexture(title, type = 'note') {
    return makeCanvas(768, 512, (ctx, w, h) => {
      ctx.fillStyle = '#e9e4ce'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#484c3d'; ctx.font = '500 34px "Noto Serif JP", "Yu Mincho", serif'; ctx.fillText(title, 58, 76);
      ctx.strokeStyle = 'rgba(77,86,63,.17)'; ctx.lineWidth = 1;
      for (let y = 120; y < h - 40; y += 36) { ctx.beginPath(); ctx.moveTo(52, y); ctx.lineTo(w - 48, y); ctx.stroke(); }
      if (type === 'note') {
        ctx.strokeStyle = '#666b53'; ctx.lineWidth = 2;
        for (let row = 0; row < 5; row++) {
          const y = 140 + row * 58;
          for (let j = 0; j < 10 - row % 3; j++) {
            const x = 60 + j * 42; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y + rnd() * 6 - 3); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = '#977551'; ctx.font = '16px Georgia, serif'; ctx.fillText('small observations, every day', 58, h - 25);
    });
  }

  // Architectural envelope: warm plaster, a deep sill and laid oak floor.
  box(13.2, .14, 12, floorMat, 0, -.1, 3.4);
  box(13.2, 6.6, .2, palette.wall, 0, 3.24, -1.61);
  box(.16, 6.6, 12, mat('#898560', .98), -6.55, 3.24, 3.4);
  box(13.2, .18, .12, palette.darkWood, 0, .12, -1.44, group, .025);
  box(13.2, .075, .1, palette.lightWood, 0, .245, -1.43, group, .015);
  box(13.2, .21, .35, palette.darkWood, 0, 6.13, -1.38, group, .025);

  const windowGroup = new THREE.Group(); group.add(windowGroup); windowGroup.name = 'Afternoon window';
  const glassMat = new THREE.MeshStandardMaterial({ color: '#b4c5b0', roughness: .52, emissive: '#819486', emissiveIntensity: .22 });
  const wx = -4.55, wy = 3.66, ww = 2.28, wh = 4.2;
  box(ww + .24, wh + .24, .16, palette.darkWood, wx, wy, -1.37, windowGroup, .03);
  box(ww, wh, .055, glassMat, wx, wy, -1.265, windowGroup);
  // Soft, abstract outdoor shapes behind the glazing, entirely mesh geometry.
  const outdoor = mat('#82977d', .96); outdoor.transparent = true; outdoor.opacity = .33;
  for (let i = 0; i < 7; i++) {
    const o = mesh(new THREE.SphereGeometry(.45, 12, 10), outdoor, windowGroup, false);
    o.position.set(wx - .93 + rnd() * 1.8, wy - 1.5 + rnd() * 2.5, -1.215); o.scale.set(.55, 1.8, .04);
  }
  for (const x of [wx - ww / 2, wx, wx + ww / 2]) box(.075, wh + .08, .13, palette.lightWood, x, wy, -1.16, windowGroup, .012);
  box(ww + .08, .09, .13, palette.lightWood, wx, wy - .44, -1.16, windowGroup, .013);
  box(ww + .39, .13, .53, palette.lightWood, wx, wy - wh / 2 - .05, -1.10, windowGroup, .025);
  box(ww + .26, .18, .2, palette.wood, wx, wy + wh / 2, -1.035, windowGroup, .025);
  const slatGeo = new THREE.BoxGeometry(ww + .04, .065, .17);
  const slats = new THREE.InstancedMesh(slatGeo, palette.lightWood, 24), temp = new THREE.Object3D();
  slats.castShadow = true; slats.receiveShadow = true;
  for (let i = 0; i < 24; i++) { temp.position.set(wx, wy + wh / 2 - .22 - i * .125, -.98); temp.rotation.x = -.32; temp.updateMatrix(); slats.setMatrixAt(i, temp.matrix); }
  windowGroup.add(slats);
  const cord = mat('#ad9b75', .94);
  for (const x of [wx - .72, wx + .72]) rod([x, 2.54, -.85], [x, 5.71, -.85], .008, cord, windowGroup);
  rod([wx + 1.02, 2.07, -.82], [wx + 1.02, 5.72, -.82], .006, cord, windowGroup);
  cyl(.018, .025, .13, palette.wood, wx + 1.02, 2.03, -.82, windowGroup);

  // Desk: a solid edge, apron, turned/tapered legs, split drawers and inset panels.
  const desk = new THREE.Group(); desk.name = 'Writing desk'; group.add(desk);
  box(6.35, .19, 1.83, palette.wood, 0, 2.035, -.04, desk, .055);
  box(6.13, .052, 1.66, palette.lightWood, 0, 2.139, -.04, desk, .018);
  box(5.97, .12, 1.49, palette.darkWood, 0, 1.895, -.07, desk, .025);
  for (const x of [-2.82, 2.82]) {
    for (const z of [-.69, .64]) {
      rod([x * 1.023, .035, z * 1.07], [x, 1.91, z], .078, palette.wood, desk, .119);
      cyl(.105, .101, .13, palette.darkWood, x, 1.4, z, desk);
      cyl(.071, .076, .10, palette.brass, x * 1.022, .055, z * 1.065, desk);
    }
    box(.095, .34, 1.4, palette.wood, x, 1.70, -.04, desk, .017);
  }
  box(5.72, .31, .095, palette.wood, 0, 1.71, -.73, desk, .018);
  for (const x of [-1.46, 1.46]) {
    box(2.74, .385, .18, palette.wood, x, 1.696, .667, desk, .025);
    box(2.46, .245, .043, palette.lightWood, x, 1.696, .772, desk, .023);
    for (const dx of [-.34, .34]) {
      const mount = cyl(.045, .045, .035, palette.brass, x + dx, 1.7, .811, desk); mount.rotation.x = Math.PI / 2;
      rod([x + dx, 1.7, .825], [x + dx, 1.64, .867], .018, palette.brass, desk);
    }
    rod([x - .34, 1.64, .867], [x + .34, 1.64, .867], .022, palette.brass, desk);
  }

  // Framed photographs; passed-in textures remain replaceable by the host.
  function photoFrame(url, w, h, parent) {
    box(w + .14, h + .14, .10, palette.darkWood, 0, 0, 0, parent, .018);
    box(w + .077, h + .077, .018, palette.brass, 0, 0, .058, parent, .006);
    box(w + .04, h + .04, .024, palette.cream, 0, 0, .073, parent);
    let m = mat('#969c85', .87);
    if (url) {
      const map = textureLoader.load(url, () => assets.onTextureLoad?.()); map.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.MeshStandardMaterial({ map, roughness: .81 });
    }
    const p = mesh(new THREE.PlaneGeometry(w * .83, h * .83), m, parent, false); p.position.z = .09;
    return p;
  }
  const gallery = new THREE.Group(); gallery.name = 'Three places, three photographs'; group.add(gallery);
  const photoRatios = assets.photoRatios || [4 / 3, 16 / 9, 16 / 9];
  const photoWidths = [1.50, 1.66, 1.49];
  const photoPositions = [[-1.94, 3.97, -1.365], [-.05, 4.61, -1.365], [.83, 3.40, -1.365]];
  [assets.photo1, assets.photo2, assets.photo3].forEach((url, i) => {
    const frame = new THREE.Group(); frame.position.set(...photoPositions[i]); frame.rotation.z = [.016, -.024, .018][i]; gallery.add(frame);
    const ratio = Number.isFinite(photoRatios[i]) && photoRatios[i] > 0 ? photoRatios[i] : 4 / 3;
    // The image plane and inner mat share the source aspect ratio. Default plane UVs
    // show every image edge: no texture offset, repeat adjustment or cover crop.
    photoFrame(url, photoWidths[i], photoWidths[i] / ratio, frame);
    const top = photoWidths[i] / ratio / 2 + .09;
    curve([[-.21, top, 0], [0, top + .17, -.014], [.21, top, 0]], .005, palette.darkWood, frame, 12);
    const nail = cyl(.014, .014, .025, palette.brass, 0, top + .17, .01, frame); nail.rotation.x = Math.PI / 2;
  });
  target('gallery', gallery, [-.72, 4.0, -1.21]);

  // The owner's name is a distinct small desk object, separate from the photographs.
  const profile = new THREE.Group(); profile.position.set(-2.12, 2.183, .48); profile.rotation.y = -.09; group.add(profile);
  box(.83, .055, .37, palette.darkWood, 0, .027, 0, profile, .024);
  const nameBacking = box(.79, .27, .035, palette.wood, 0, .184, -.053, profile, .018); nameBacking.rotation.x = -.16;
  const nameMap = makeCanvas(640, 240, (ctx, w, h) => {
    ctx.fillStyle = '#dacaa0'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a28957'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center'; ctx.fillStyle = '#4b4637'; ctx.font = '56px "Noto Serif JP", "Yu Mincho", serif'; ctx.fillText('木村紀喜', w / 2, 118);
    ctx.font = '19px Georgia, serif'; ctx.fillStyle = '#80704f'; ctx.fillText('KIMURA TOSHIKI', w / 2, 178);
  });
  const nameFace = mesh(new THREE.PlaneGeometry(.731, .215), new THREE.MeshStandardMaterial({ map: nameMap, roughness: .84 }), profile, false);
  nameFace.position.set(0, .188, -.030); nameFace.rotation.x = -.16;
  for (const x of [-.34, .34]) oval(.009, .009, .004, palette.brass, x, .187, -.008, profile);
  target('profile', profile, [-2.12, 2.40, .54]);

  // A small linen memo pinned beside the frames.
  const noteMap = paperTexture('小さな発見', 'plain');
  const memo = mesh(new THREE.PlaneGeometry(.42, .51), new THREE.MeshStandardMaterial({ map: noteMap, side: THREE.DoubleSide, roughness: .97 }));
  memo.position.set(1.86, 3.89, -1.465); memo.rotation.z = -.10;
  const pin = mesh(new THREE.SphereGeometry(.028, 10, 8), palette.brass); pin.position.set(1.83, 4.10, -1.43);

  // Books grouped for the research interaction.
  const research = new THREE.Group(); research.position.set(3.19, 3.175, -.96); group.add(research);
  const bookColors = ['#5c3432', '#52634b', '#b29a70', '#353f3a', '#906b43'];
  function book(w, h, d, color, label, parent) {
    const b = new THREE.Group(); parent.add(b); const bm = mat(color, .84);
    box(w, h - .025, d - .065, palette.paper, 0, h / 2, 0, b, .01);
    box(.033, h + .022, d, bm, -w / 2, h / 2, 0, b, .009);
    box(.033, h + .022, d, bm, w / 2, h / 2, 0, b, .009);
    box(w + .027, h + .022, .055, bm, 0, h / 2, d / 2 - .023, b, .01);
    for (const y of [.12, h - .13]) box(w + .028, .012, .006, palette.brass, 0, y, d / 2 + .008, b);
    if (label) {
      const map = makeCanvas(128, 512, (ctx, cw, ch) => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#d6c99f';
        ctx.font = '32px "Noto Serif JP", "Yu Mincho", serif'; ctx.textAlign = 'center';
        [...label].forEach((c, i) => ctx.fillText(c, cw / 2, 60 + i * 49));
      });
      const text = mesh(new THREE.PlaneGeometry(w * .76, h * .70), new THREE.MeshStandardMaterial({ map, roughness: .91 }), b, false);
      text.position.set(0, h * .52, d / 2 + .012);
    }
    return b;
  }
  [.80, .99, .89, 1.06, .87].forEach((h, i) => {
    const b = book(.14 + (i % 2) * .035, h, .51, bookColors[i], ['学び', '教育', '研究', 'ことば', '日々'][i], research);
    b.position.x = (i - 2) * .187; b.rotation.z = i === 0 ? .08 : i === 4 ? -.09 : .012;
  });
  box(.065, .55, .57, palette.darkBrass, -.52, .26, 0, research, .012);
  box(.21, .045, .57, palette.darkBrass, -.44, .023, 0, research, .008);
  target('research', research, [3.19, 3.83, -.57]);
  const stack = new THREE.Group(); stack.position.set(4.42, 3.174, -.96); stack.rotation.y = .10; group.add(stack);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group(); stack.add(s); s.position.set(i * .017, i * .123, 0); s.rotation.y = i % 2 ? -.13 : 0;
    box(.90 - i * .065, .105, .62, palette.paper, 0, .055, 0, s, .009);
    const bm = mat(['#4b5941', '#9b7447', '#683b39'][i], .88);
    box(.94 - i * .065, .02, .65, bm, 0, .01, 0, s, .008);
    box(.94 - i * .065, .025, .65, bm, 0, .113, 0, s, .008);
    box(.94 - i * .065, .12, .035, bm, 0, .06, .317, s, .008);
  }

  // An open clothbound notebook, with actual page planes and a pencil.
  const blog = new THREE.Group(); blog.position.set(-.72, 2.183, .56); blog.scale.set(.92, 1, .59); blog.rotation.y = -.13; group.add(blog);
  box(1.39, .038, .89, palette.burgundy, 0, 0, 0, blog, .015);
  const leftPage = box(.653, .045, .84, palette.paper, -.337, .025, 0, blog, .008); leftPage.rotation.z = .024;
  const rightPage = box(.653, .045, .84, palette.paper, .337, .025, 0, blog, .008); rightPage.rotation.z = -.024;
  for (const side of [-1, 1]) {
    const p = mesh(new THREE.PlaneGeometry(.636, .815), new THREE.MeshStandardMaterial({ map: paperTexture(side < 0 ? '学びの記録' : '日々のこと'), roughness: .97 }), blog, false);
    p.rotation.x = -Math.PI / 2; p.rotation.y = side * .024; p.position.set(side * .337, .058, 0);
  }
  rod([0, .061, -.42], [0, .061, .42], .009, palette.linen, blog);
  const ribbon = box(.018, .006, .36, palette.burgundy, .035, .055, .44, blog); ribbon.rotation.y = -.13;
  rod([.42, .104, -.30], [.73, .104, .33], .018, mat('#bc9750', .76), blog);
  rod([.73, .104, .33], [.756, .104, .382], .011, palette.ink, blog, .001);
  target('blog', blog, [-.72, 2.245, .60]);

  // Cream envelope, crossed paper folds and a wax seal.
  const contact = new THREE.Group(); contact.position.set(.63, 2.19, .56); contact.rotation.y = .18; group.add(contact);
  box(.65, .014, .40, palette.paper, 0, 0, 0, contact, .007);
  const foldMat = mat('#c3b99b', .96);
  rod([-.315, .011, -.19], [0, .011, .055], .003, foldMat, contact);
  rod([.315, .011, -.19], [0, .011, .055], .003, foldMat, contact);
  rod([-.315, .011, .19], [-.10, .011, .027], .002, foldMat, contact);
  rod([.315, .011, .19], [.10, .011, .027], .002, foldMat, contact);
  const wax = cyl(.046, .048, .011, palette.burgundy, 0, .019, .046, contact, 14);
  const stamp = box(.065, .003, .085, palette.leafLight, .236, .013, -.126, contact, .006);
  target('contact', contact, [.63, 2.213, .59]);

  // Two substantial wall shelves make room for objects collected over time.
  function wallShelf(x, y, width) {
    const s = new THREE.Group(); s.name = 'Oak wall shelf'; group.add(s);
    box(width, .095, .61, palette.lightWood, x, y, -1.02, s, .020);
    box(width, .11, .045, palette.darkWood, x, y + .083, -1.297, s, .010);
    for (const side of [-1, 1]) {
      const xx = x + side * width * .33;
      rod([xx, y - .05, -.79], [xx, y - .39, -1.40], .021, palette.darkBrass, s);
      box(.055, .46, .027, palette.darkBrass, xx, y - .18, -1.409, s, .009);
    }
    return s;
  }
  wallShelf(3.84, 3.11, 3.00);
  wallShelf(-.26, 5.43, 4.48);

  // Green-shaded task lamp, ceramic cup and an old pencil pot.
  const lamp = new THREE.Group(); lamp.position.set(2.82, 2.18, -.46); lamp.scale.y = 1.16; group.add(lamp);
  cyl(.245, .27, .072, palette.darkBrass, 0, .035, 0, lamp);
  cyl(.202, .232, .030, palette.brass, 0, .078, 0, lamp);
  rod([0, .086, 0], [0, .82, -.05], .029, palette.brass, lamp);
  curve([[0, .74, -.05], [-.025, 1.05, -.055], [-.20, 1.16, .04], [-.38, 1.10, .13]], .025, palette.brass, lamp);
  const shadePivot = new THREE.Group(); lamp.add(shadePivot); shadePivot.position.set(-.38, 1.055, .13); shadePivot.rotation.z = -.13;
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#344b38', roughness: .42, metalness: .22, side: THREE.DoubleSide });
  const shade = mesh(new THREE.ConeGeometry(.33, .24, 32, 1, true), shadeMat, shadePivot); shade.position.y = -.075;
  const rim = mesh(new THREE.TorusGeometry(.33, .013, 6, 32), palette.brass, shadePivot); rim.rotation.x = Math.PI / 2; rim.position.y = -.195;
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff0bd', emissive: '#ffc67b', emissiveIntensity: 2 });
  const bulb = mesh(new THREE.SphereGeometry(.06, 12, 8), bulbMat, shadePivot, false); bulb.position.y = -.15;
  const lampLight = new THREE.PointLight('#ffd094', 3.5, 3.4, 2); lampLight.position.set(-.38, .79, .13); lamp.add(lampLight);
  curve([[0, .09, -.10], [.23, .01, -.34], [.39, -.06, -.35], [.40, -1.1, -.42], [.50, -2.11, -.40]], .009, palette.darkWood, lamp);
  const cup = new THREE.Group(); cup.position.set(4.37, 3.55, -.87); group.add(cup);
  const ceramic = mat('#cbbfa1', .48);
  cyl(.113, .094, .20, ceramic, 0, .10, 0, cup);
  cyl(.096, .096, .006, mat('#382b20', .29), 0, .204, 0, cup);
  const cupRim = mesh(new THREE.TorusGeometry(.105, .013, 6, 24), ceramic, cup); cupRim.rotation.x = Math.PI / 2; cupRim.position.y = .201;
  const handle = mesh(new THREE.TorusGeometry(.069, .016, 7, 18, Math.PI * 1.65), ceramic, cup); handle.position.set(.116, .112, 0); handle.rotation.z = -.80;
  const pot = new THREE.Group(); pot.position.set(-2.68, 2.18, -.45); group.add(pot);
  cyl(.112, .096, .24, palette.terra, 0, .12, 0, pot);
  cyl(.094, .094, .012, palette.soil, 0, .244, 0, pot);
  for (let i = 0; i < 5; i++) {
    const x = (rnd() - .5) * .13, z = (rnd() - .5) * .13;
    rod([x, .16, z], [x + (rnd() - .5) * .12, .42 + rnd() * .14, z + (rnd() - .5) * .09], .012, [palette.burgundy, palette.darkWood, palette.brass][i % 3], pot);
  }

  // Windsor chair: sculpted seat, splayed legs, stretcher, curved bow, fine spindles.
  const chair = new THREE.Group(); chair.position.set(1.35, 0, 1.86); chair.rotation.y = .98; chair.name = 'Windsor chair'; group.add(chair);
  const seat = box(1.26, .13, 1.10, palette.wood, 0, 1.055, 0, chair, .15);
  box(1.11, .046, .94, palette.darkWood, 0, 1.130, 0, chair, .12);
  // Woven cane is made from thin actual straps, instanced in two directions.
  const weave = new THREE.InstancedMesh(cube, palette.linen, 46); weave.castShadow = false; weave.receiveShadow = true;
  for (let i = 0; i < 23; i++) {
    temp.position.set(-.47 + i * .043, 1.159 + (i % 2) * .001, 0); temp.rotation.set(0, 0, 0); temp.scale.set(.015, .008, .77); temp.updateMatrix(); weave.setMatrixAt(i, temp.matrix);
    temp.position.set(0, 1.162 - (i % 2) * .001, -.39 + i * .035); temp.scale.set(.97, .006, .013); temp.updateMatrix(); weave.setMatrixAt(23 + i, temp.matrix);
  }
  chair.add(weave);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    rod([x * .54, .06, z * .51], [x * .43, 1.02, z * .34], .037, palette.wood, chair, .057);
    const bead = mesh(new THREE.SphereGeometry(.063, 12, 8), palette.wood, chair); bead.position.set(x * .476, .64, z * .41); bead.scale.y = 1.75;
  }
  rod([-.50, .38, -.46], [-.50, .38, .46], .026, palette.wood, chair);
  rod([.50, .38, -.46], [.50, .38, .46], .026, palette.wood, chair);
  rod([-.50, .38, 0], [.50, .38, 0], .029, palette.wood, chair);
  const bowPoints = [[-.54, 1.13, .40], [-.59, 1.83, .45], [-.48, 2.31, .47], [-.23, 2.48, .49], [0, 2.52, .5], [.23, 2.48, .49], [.48, 2.31, .47], [.59, 1.83, .45], [.54, 1.13, .40]];
  curve(bowPoints, .052, palette.wood, chair, 50);
  for (let i = -3; i <= 3; i++) {
    const x = i * .132, topY = 2.46 - .33 * Math.pow(Math.abs(i) / 3, 2);
    rod([x * .93, 1.15, .365], [x * 1.17, topY, .477], .019, palette.wood, chair, .024);
  }
  // A burgundy throw drapes over one side of the chair in two softly folded panels.
  const throwMat = mat('#633b36', 1);
  const throwGeo = new THREE.PlaneGeometry(.36, 1.15, 10, 16);
  const a = throwGeo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i); a.setZ(i, Math.sin(x * 48) * .013 + .04 * Math.sin((y + .5) * 2.0));
  }
  throwGeo.computeVertexNormals(); throwMat.side = THREE.DoubleSide;
  const throwMesh = mesh(throwGeo, throwMat, chair); throwMesh.position.set(.34, 1.81, .524); throwMesh.rotation.z = .10;

  // A curled marmalade cat sleeps on a moss-coloured cushion. All anatomy is
  // original low-poly geometry; the host can apply a tiny breathing scale to pets.
  const cushionMat = mat('#929274', .99), stitchMat = mat('#c9c39b', 1);
  const cushion = oval(.49, .090, .40, cushionMat, -.035, 1.23, -.07, chair);
  const piping = mesh(new THREE.TorusGeometry(1, .018, 5, 36), stitchMat, chair);
  piping.rotation.x = Math.PI / 2; piping.scale.set(.455, .365, .58); piping.position.set(-.035, 1.237, -.07);
  const cat = new THREE.Group(); cat.name = 'Sleeping marmalade cat'; cat.position.set(-.065, 1.303, -.115); cat.rotation.y = -.35; chair.add(cat);
  const fur = mat('#c88b52', .98), lightFur = mat('#e3c596', 1), stripe = mat('#9b5b36', 1), blush = mat('#a57b6c', .99);
  oval(.335, .185, .235, fur, .040, .159, .025, cat);
  oval(.19, .14, .205, lightFur, -.115, .124, .047, cat);
  const head = new THREE.Group(); head.position.set(-.222, .180, .126); head.rotation.z = -.14; head.rotation.y = -.10; cat.add(head);
  oval(.166, .145, .144, fur, 0, .008, 0, head);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(.077, .166, 3), fur, head); ear.position.set(side * .105, .151, -.021); ear.rotation.z = side * -.23; ear.rotation.y = side * .30;
    const inner = mesh(new THREE.ConeGeometry(.043, .103, 3), blush, head); inner.position.set(side * .108, .145, .010); inner.rotation.z = side * -.23; inner.rotation.y = side * .30;
    oval(.060, .048, .043, lightFur, side * .046, -.027, .115, head);
    curve([[side * .030, .036, .133], [side * .062, .025, .138], [side * .096, .041, .122]], .0045, palette.ink, head, 8);
    for (const j of [-1, 1]) curve([[side * .064, -.025, .154], [side * .124, -.018 + j * .015, .160], [side * .169, -.010 + j * .030, .143]], .002, lightFur, head, 6);
  }
  oval(.019, .013, .012, blush, 0, -.011, .155, head);
  curve([[0, -.021, .155], [0, -.039, .155], [.019, -.043, .151]], .0027, stripe, head, 6);
  for (let i = -1; i <= 1; i++) curve([[i * .032, .117, .079], [i * .030, .092, .116], [i * .023, .072, .13]], .008, stripe, head, 8);
  oval(.079, .044, .095, lightFur, -.163, .029, .195, cat);
  oval(.074, .040, .085, lightFur, -.015, .026, .19, cat);
  const tail = curve([[.245, .145, -.078], [.345, .092, .080], [.205, .061, .255], [-.002, .049, .281], [-.091, .061, .235]], .060, fur, cat, 26);
  oval(.064, .057, .063, lightFur, -.087, .060, .238, cat);
  for (let i = 0; i < 3; i++) {
    const x = .065 + i * .069;
    curve([[x, .29, -.082], [x + .015, .331 - i * .010, -.013], [x + .022, .307 - i * .016, .081]], .016, stripe, cat, 10);
  }
  pets.push({ object: cat, baseScale: cat.scale.clone(), phase: .45 });

  // Lush foliage uses a single instanced leaf mesh for each plant.
  const leafGeometry = new THREE.SphereGeometry(1, 8, 6);
  function plant(x, y, z, size = 1, hanging = false, fern = false, variety = 'pothos') {
    const p = new THREE.Group(); p.position.set(x, y, z); p.scale.setScalar(size); group.add(p);
    p.name = variety === 'pearls' ? 'String of pearls' : hanging ? 'Hanging pothos' : fern ? 'Floor fern' : 'Plant';
    const potH = hanging ? .30 : .47, potR = hanging ? .23 : .32;
    cyl(potR, potR * .76, potH, hanging ? palette.terra : palette.potDark, 0, potH / 2, 0, p);
    cyl(potR * 1.06, potR * 1.06, .045, hanging ? palette.terra : palette.potDark, 0, potH - .016, 0, p);
    cyl(potR * .89, potR * .89, .018, palette.soil, 0, potH + .005, 0, p);
    if (hanging) {
      for (let i = 0; i < 3; i++) {
        const aa = i / 3 * Math.PI * 2;
        rod([Math.cos(aa) * potR, .12, Math.sin(aa) * potR], [0, 1.18, 0], .009, cord, p);
      }
      rod([0, 1.18, 0], [0, 1.5, 0], .012, palette.darkWood, p);
    }
    const leaves = [], colors = [];
    const stems = fern ? 15 : hanging ? 11 : 9;
    for (let i = 0; i < stems; i++) {
      const angle = i / stems * Math.PI * 2 + rnd() * .24, len = .65 + rnd() * .62;
      if (fern) {
        const outward = .6 + rnd() * .5, top = .45 + rnd() * .45;
        const points = [[0, potH, 0], [Math.cos(angle) * outward * .42, potH + top, Math.sin(angle) * outward * .42], [Math.cos(angle) * outward, potH + top * .64, Math.sin(angle) * outward]];
        curve(points, .006, palette.leafLight, p, 12);
        for (let j = 1; j < 10; j++) {
          const t = j / 10, rr = outward * t, yy = potH + top * Math.sin(t * 1.94);
          for (const side of [-1, 1]) {
            const reach = Math.sin(t * Math.PI) * .16 + .015;
            leaves.push({ pos: [Math.cos(angle) * rr + Math.cos(angle + Math.PI / 2) * reach * side, yy, Math.sin(angle) * rr + Math.sin(angle + Math.PI / 2) * reach * side], rot: [0, -angle + side * .56, side * .28], scale: [.035 + (1 - t) * .018, .014, reach * 1.28] }); colors.push(i % 3);
          }
        }
      } else {
        const outward = hanging ? .4 + rnd() * .4 : .35 + rnd() * .25;
        const droop = hanging ? len : -.2 - rnd() * .5;
        const points = [[0, potH, 0], [Math.cos(angle) * outward * .64, potH + .18, Math.sin(angle) * outward * .64], [Math.cos(angle) * outward, potH - droop, Math.sin(angle) * outward]];
        curve(points, .006, palette.green, p, 13);
        for (let j = 0; j < 9; j++) {
          const t = (j + 1) / 9, rr = outward * Math.min(1, t * 1.5), yy = potH + Math.sin(t * Math.PI) * .20 - droop * t * t;
          const side = j % 2 ? 1 : -1, s = .08 + rnd() * .06;
          leaves.push({ pos: [Math.cos(angle) * rr + Math.cos(angle + 1.57) * .09 * side, yy, Math.sin(angle) * rr + Math.sin(angle + 1.57) * .09 * side], rot: [rnd() * .7, -angle + side * .7, side * .6], scale: [s * .67, s * .23, s * 1.25] }); colors.push((i + j) % 3);
        }
      }
    }
    if (variety === 'pearls') leaves.forEach(l => { l.scale = [.032, .034, .032]; });
    if (variety === 'heart') leaves.forEach(l => { l.scale[0] *= 1.35; l.scale[2] *= .84; });
    instancedFoliage(p, leaves, colors, variety === 'pearls' ? ['#577b49', '#72915b', '#a0ab76'] : ['#304a29', '#4c6636', '#758145']);
    if (hanging) animated.push(p); return p;
  }
  function instancedFoliage(parent, leaves, colors = [], shades = ['#304a29', '#4c6636', '#758145']) {
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .87 });
    const inst = new THREE.InstancedMesh(leafGeometry, leafMat, leaves.length); inst.castShadow = true; inst.receiveShadow = true;
    const leafColors = shades.map(c => new THREE.Color(c));
    leaves.forEach((l, i) => { temp.position.set(...l.pos); temp.rotation.set(...l.rot); temp.scale.set(...l.scale); temp.updateMatrix(); inst.setMatrixAt(i, temp.matrix); inst.setColorAt(i, leafColors[(colors[i] ?? i) % leafColors.length]); });
    parent.add(inst); return inst;
  }
  plant(-4.00, .02, 1.12, 1.30, false, true);
  plant(-3.02, 4.80, -1.10, .71, true, false, 'heart');
  plant(2.77, 5.05, -1.13, .68, true);
  plant(4.08, 5.07, -1.07, .63, true, false, 'pearls');
  plant(5.14, 4.87, -.95, .75, true, false, 'heart');

  // A compact rosette, an upright snake plant, and tiny flowering stems add
  // distinct silhouettes rather than repeating the same hanging plant.
  function smallPot(x, y, z, color, radius = .14) {
    const p = new THREE.Group(); group.add(p); p.position.set(x, y, z);
    const pm = mat(color, .69);
    cyl(radius, radius * .76, .22, pm, 0, .11, 0, p);
    cyl(radius * 1.04, radius * 1.04, .023, pm, 0, .214, 0, p);
    cyl(radius * .90, radius * .90, .012, palette.soil, 0, .228, 0, p);
    return p;
  }
  const succulent = smallPot(-1.42, 5.483, -.99, '#b78064', .16); succulent.name = 'Blue-green rosette succulent';
  const rosette = [];
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + layer * .35, radius = .12 - layer * .03;
    rosette.push({ pos: [Math.cos(a) * radius, .27 + layer * .05, Math.sin(a) * radius], rot: [-.30 + layer * -.14, -a + Math.PI / 2, 0], scale: [.052 - layer * .008, .025, .143 - layer * .023] });
  }
  instancedFoliage(succulent, rosette, [], ['#6c8b7b', '#8ca28b', '#a5b69b']);
  const snake = smallPot(1.60, 5.483, -1.03, '#d1c49c', .14); snake.name = 'Striped snake plant';
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, h = .135 + (i % 3) * .031;
    blades.push({pos:[Math.cos(a) * .07, .24 + h * .64, Math.sin(a) * .055], rot:[Math.cos(a) * .10, a, Math.sin(a) * .19], scale:[.042, h, .017]});
  }
  instancedFoliage(snake, blades, [], ['#3d6047', '#81925c', '#b4b47b']);
  const flowerpot = smallPot(-5.01, 1.563, -.96, '#b58260', .17); flowerpot.name = 'Window violets';
  const flowerLeaves = [], petals = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.399, x = Math.cos(a) * .16, z = Math.sin(a) * .12, h = .44 + (i % 3) * .06;
    rod([0, .22, 0], [x, h, z], .0045, palette.green, flowerpot);
    flowerLeaves.push({pos:[x * .6, .30, z * .6],rot:[-.3,a,.2],scale:[.062,.017,.104]});
    for (let j = 0; j < 5; j++) {
      const t = j * Math.PI * 2 / 5;
      petals.push({pos:[x + Math.cos(t) * .034,h + Math.sin(t) * .032,z],rot:[0,0,t],scale:[.038,.023,.015]});
    }
    oval(.016, .016, .015, palette.brass, x, h, z + .008, flowerpot);
  }
  instancedFoliage(flowerpot, flowerLeaves); instancedFoliage(flowerpot, petals, [], ['#a18aa1', '#c3a9bb', '#b792a6']);

  // A tiny perched songbird, a ceramic mushroom and a family of glazed pots.
  const bird = new THREE.Group(); bird.name = 'Little shelf sparrow'; bird.position.set(-.60, 5.50, -.94); bird.rotation.y = -.35; group.add(bird);
  const birdBrown = mat('#8d7051', .95), birdCream = mat('#d7c7a1', .96);
  oval(.115, .128, .095, birdBrown, 0, .145, 0, bird);
  oval(.080, .093, .047, birdCream, 0, .138, .061, bird);
  oval(.086, .080, .080, birdBrown, -.006, .269, .013, bird);
  const beak = mesh(new THREE.ConeGeometry(.025, .071, 5), palette.brass, bird); beak.rotation.x = Math.PI / 2; beak.position.set(-.006, .262, .099);
  for (const side of [-1, 1]) { oval(.009, .010, .007, palette.ink, side * .041, .286, .077, bird); rod([side * .035,.012,.011],[side * .035,.061,.013],.008,palette.darkWood,bird); }
  const wing = oval(.034, .093, .067, palette.darkWood, .095, .145, -.006, bird); wing.rotation.x = -.24;
  const tailFeather = oval(.045, .016, .093, palette.darkWood, .01, .085, -.114, bird); tailFeather.rotation.x = -.27;
  const mushroom = new THREE.Group(); mushroom.name = 'Small ceramic mushroom'; mushroom.position.set(.29, 5.486, -.95); group.add(mushroom);
  cyl(.047, .065, .14, palette.cream, 0, .07, 0, mushroom);
  oval(.139, .072, .130, mat('#a65743', .70), 0, .161, 0, mushroom);
  for (let i = 0; i < 5; i++) { const a = i * 2.4; oval(.018, .007, .016, palette.cream, Math.cos(a) * .083, .220 - (i % 2) * .014, Math.sin(a) * .077, mushroom); }
  const jarGreen = mat('#70857b', .48), jarCream = mat('#c6b493', .48);
  for (const [x, h, material] of [[.79,.28,jarGreen],[1.15,.19,jarCream]]) {
    const j = new THREE.Group(); j.position.set(x,5.486,-1.04); group.add(j); j.name = 'Glazed ceramic jar';
    oval(.115,h * .47,.105,material,0,h * .43,0,j);
    cyl(.058,.078,h * .22,material,0,h * .88,0,j);
    cyl(.061,.061,.012,palette.darkWood,0,h * .998,0,j);
  }

  // A low side stool and secondary leafy plant balance the right-hand edge.
  const stool = new THREE.Group(); stool.position.set(4.28, 0, -.30); group.add(stool);
  cyl(.47, .47, .11, palette.wood, 0, .91, 0, stool);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3; rod([Math.cos(a) * .36, .04, Math.sin(a) * .36], [Math.cos(a) * .28, .89, Math.sin(a) * .28], .033, palette.darkWood, stool, .053);
  }
  plant(4.28, .97, -.30, .97, false, false);

  // Natural rug, woven from a repeating material, anchors the furniture.
  const rugMap = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8d795a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 256; i += 3) {
      ctx.fillStyle = i % 2 ? 'rgba(48,38,24,.19)' : 'rgba(238,215,171,.20)'; ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1);
    }
  });
  rugMap.wrapS = rugMap.wrapT = THREE.RepeatWrapping; rugMap.repeat.set(6, 4);
  const rugMat = new THREE.MeshStandardMaterial({ map: rugMap, color: '#d1c09e', roughness: 1 });
  box(6.20, .014, 3.14, rugMat, .20, -.014, 1.85, group, .015);

  const details = addRoomDetails(THREE, {
    group, palette, desk, chair, research, stack, blog, contact, profile, lamp, pot, windowGroup, gallery,
  });

  group.updateMatrixWorld(true);
  return { group, targets, animated, lampLight, pets, details };
}
