/**
 * Original foliage and sleeping-cat geometry. Authored fallback maps remain
 * visible while shared generated albedos load in the background.
 */
import { surface } from './surface-materials.js?v=20260916-cat3';
function canvasMap(THREE, w, h, paint, color = true) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function seeded(seed) { return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }; }

function joinGeometry(THREE, geometries) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (const geo of geometries) {
    const offset = positions.length / 3;
    positions.push(...geo.attributes.position.array);
    normals.push(...geo.attributes.normal.array);
    uvs.push(...geo.attributes.uv.array);
    if (geo.index) for (const id of geo.index.array) indices.push(id + offset);
    else for (let id = 0; id < geo.attributes.position.count; id++) indices.push(id + offset);
    geo.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

function leafSurface(THREE, kind) {
  // Leaf blades have a pointed outline, a raised midrib and cupped margins.
  // Width is X; growth follows +Z. They are real surfaces, not flat alpha cards.
  const fern = kind === 'fern', thick = kind === 'succulent';
  const rows = fern ? 7 : kind === 'snake' ? 18 : 12, cols = fern ? 2 : 4;
  const position = [], uv = [], index = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    let width = Math.pow(Math.sin(Math.PI * t), kind === 'heart' ? .48 : .75);
    if (kind === 'heart') width *= 1.05 + .15 * Math.sin(t * Math.PI * 2);
    if (fern) width *= .84 + .13 * Math.sin(t * 9 * Math.PI);
    if (kind === 'snake') width = Math.pow(Math.sin(Math.PI * t), .35) * (1 - t * .36);
    for (let col = 0; col <= cols; col++) {
      const across = col / cols * 2 - 1;
      const x = across * width;
      const y = .095 * Math.sin(t * Math.PI) - .10 * across * across * Math.sin(t * Math.PI) + .12 * t * t;
      const z = t * 2 - 1 + (kind === 'heart' ? .10 * Math.abs(across) * Math.pow(1 - t, 4) : 0);
      position.push(x, y + .014 * Math.sin(t * Math.PI * 3 + across) * Math.abs(across), z);
      uv.push(col / cols, t);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const a = row * (cols + 1) + col, b = a + cols + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (thick) {
    const count = position.length / 3, originalIndices = index.slice();
    for (let i = 0; i < count; i++) {
      const t = uv[i * 2 + 1], across = uv[i * 2] * 2 - 1;
      position.push(position[i * 3], position[i * 3 + 1] - .24 * Math.pow(Math.sin(Math.PI * t), .8) * (1 - across * across), position[i * 3 + 2]);
      uv.push(uv[i * 2], t);
    }
    for (let i = 0; i < originalIndices.length; i += 3) index.push(originalIndices[i] + count, originalIndices[i + 2] + count, originalIndices[i + 1] + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(index);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function createNaturalFoliage(THREE, { group, palette, cord, animated }) {
  const random = seeded(93041), temp = new THREE.Object3D();
  const leafMap = canvasMap(THREE, 256, 512, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#b5c194'); gradient.addColorStop(.45, '#e6e9c8');
    gradient.addColorStop(.52, '#eeeccd'); gradient.addColorStop(1, '#aebb8e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2700; i++) {
      ctx.fillStyle = `rgba(65,83,37,${.012 + random() * .06})`;
      ctx.fillRect(random() * w, random() * h, .4 + random() * 1.3, .5 + random() * 2);
    }
    ctx.lineCap = 'round';
    for (let y = 28; y < h - 12; y += 43) for (const side of [-1, 1]) {
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(220,228,162,.46)';
      ctx.beginPath(); ctx.moveTo(w / 2, y + 68);
      ctx.bezierCurveTo(w / 2 + side * 20, y + 38, w / 2 + side * 64, y + 22, w / 2 + side * 115, y - 10); ctx.stroke();
      for (let j = 1; j < 4; j++) {
        ctx.lineWidth = .65; ctx.strokeStyle = 'rgba(201,212,149,.25)';
        const x = w / 2 + side * j * 25;
        ctx.beginPath(); ctx.moveTo(x, y + 61 - j * 18); ctx.lineTo(x + side * 26, y + 5 - j * 8); ctx.stroke();
      }
    }
    ctx.lineWidth = 3.0; ctx.strokeStyle = 'rgba(231,233,176,.72)';
    ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.bezierCurveTo(w / 2 - 3, h * .7, w / 2 + 3, h * .3, w / 2, 0); ctx.stroke();
  });
  const leafBump = canvasMap(THREE, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = random() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)';
      ctx.fillRect(random() * w, random() * h, 1, 1);
    }
    ctx.strokeStyle = '#b1b1b1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, 0); ctx.stroke();
    ctx.strokeStyle = '#929292'; ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 43) for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(w / 2, y + 68); ctx.quadraticCurveTo(w / 2 + side * 40, y + 25, w / 2 + side * 120, y - 10); ctx.stroke();
    }
  }, false);
  const snakeMap = canvasMap(THREE, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d1d0a2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#bccda2'; ctx.fillRect(19, 0, w - 38, h);
    for (let y = 0; y < h; y += 15) {
      ctx.strokeStyle = `rgba(54,86,55,${.18 + random() * .21})`; ctx.lineWidth = 5 + random() * 5;
      ctx.beginPath(); ctx.moveTo(19, y); ctx.bezierCurveTo(70, y - 11, 190, y + 17, w - 19, y + 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(227,217,139,.8)'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: leafMap, roughness: .68, bumpMap: leafBump, bumpScale: .0015,
    side: THREE.DoubleSide, emissive: '#243114', emissiveIntensity: .035,
  });
  surface(leafMaterial, 'leaf', { tint: '#d8e4b6', roughness:.43 });
  leafMaterial.name = 'Living leaf, veins and waxy cuticle';
  const succulentMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, bumpMap: leafBump, bumpScale: .0007, side: THREE.DoubleSide });
  const pearlMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .57, bumpMap: leafBump, bumpScale: .00045 });
  const snakeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: snakeMap, roughness: .73, bumpMap: leafBump, bumpScale: .001, side: THREE.DoubleSide });
  const petalMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .91, bumpMap: leafBump, bumpScale: .0005, side: THREE.DoubleSide });
  surface(petalMaterial,'petal',{tint:'#fff4e8',roughness:.83,bumpScale:.0005});
  const geometries = Object.fromEntries(['pothos', 'heart', 'fern', 'succulent', 'snake', 'petal'].map(kind => [kind, leafSurface(THREE, kind)]));
  geometries.pearls = new THREE.SphereGeometry(1, 8, 6);
  const materialFor = kind => kind === 'pearls' ? pearlMaterial : kind === 'succulent' ? succulentMaterial : kind === 'snake' ? snakeMaterial : kind === 'petal' ? petalMaterial : leafMaterial;
  const mat = (color, roughness = .9) => new THREE.MeshStandardMaterial({ color, roughness });
  const terra = mat('#a56648', .93), ceramic = mat('#67583e', .8), soil = mat('#29281c', 1);
  const potGrain = canvasMap(THREE, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = 85 + random() * 90; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(random() * w, random() * h, 1, 1); }
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    for (let y = 0; y < h; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + 1); ctx.stroke(); }
  }, false);
  terra.bumpMap = ceramic.bumpMap = potGrain; terra.bumpScale = .003; ceramic.bumpScale = .0015;
  function mesh(geometry, material, parent, cast = true) {
    const m = new THREE.Mesh(geometry, material); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  }
  function cylinder(rt, rb, h, material, x, y, z, parent) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, 28), material, parent); m.position.set(x, y, z); return m;
  }
  function tube(points, radius, segments = 14) {
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => Array.isArray(p) ? new THREE.Vector3(...p) : p)), segments, radius, 5, false);
  }
  function instancedFoliage(parent, leaves, colors = [], shades = ['#41623b', '#527448', '#758354'], kind = 'pothos') {
    const inst = new THREE.InstancedMesh(geometries[kind] || geometries.pothos, materialFor(kind), leaves.length);
    inst.name = `${kind}: curved living blades`; inst.castShadow = true; inst.receiveShadow = true;
    const leafColors = shades.map(c => new THREE.Color(c).lerp(new THREE.Color('#d8e3b9'), .42));
    leaves.forEach((leaf, i) => {
      temp.position.set(...leaf.pos);
      if (leaf.quaternion) temp.quaternion.copy(leaf.quaternion); else temp.rotation.set(...leaf.rot);
      const [x, y, z] = leaf.scale;
      if (kind === 'pearls') temp.scale.set(x, y, z);
      else if (kind === 'snake') { temp.rotateX(-Math.PI / 2); temp.scale.set(x, Math.max(x, z), y); }
      else if (kind === 'petal') { temp.rotateX(Math.PI / 2); temp.scale.set(x, Math.max(x, y) * .6, y); }
      else temp.scale.set(x, Math.max(x, z), z);
      temp.updateMatrix(); inst.setMatrixAt(i, temp.matrix);
      const c = leafColors[(colors[i] ?? i) % leafColors.length].clone(); c.multiplyScalar(.92 + random() * .13); inst.setColorAt(i, c);
    });
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere(); parent.add(inst); return inst;
  }
  function leafAt(base, direction, width, length, twist = 0) {
    const forward = direction.clone().normalize(), right = new THREE.Vector3(0, 1, 0).cross(forward).normalize();
    if (right.lengthSq() < .01) right.set(1, 0, 0);
    const up = forward.clone().cross(right).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), twist));
    const center = base.clone().addScaledVector(forward, length);
    return { pos: center.toArray(), quaternion: q, scale: [width, length, length] };
  }
  function plant(x, y, z, size = 1, hanging = false, fern = false, variety = 'pothos') {
    const p = new THREE.Group(); p.position.set(x, y, z); p.scale.setScalar(size); group.add(p);
    p.name = variety === 'pearls' ? 'String of pearls' : hanging ? 'Hanging pothos' : fern ? 'Floor fern' : 'Plant';
    p.userData.roomAction={kind:'plant',label:fern?'シダ':variety==='pearls'?'グリーンネックレス':'観葉植物'};
    const potH = hanging ? .30 : .47, potR = hanging ? .23 : .32, pottery = hanging ? terra : ceramic;
    cylinder(potR, potR * .76, potH, pottery, 0, potH / 2, 0, p);
    cylinder(potR * 1.045, potR * 1.045, .035, pottery, 0, potH - .006, 0, p);
    cylinder(potR * .88, potR * .88, .014, soil, 0, potH + .009, 0, p);
    const drain = mesh(new THREE.TorusGeometry(potR * .82, .012, 5, 28), pottery, p);
    drain.rotation.x = Math.PI / 2; drain.position.y = .025;
    if (hanging) {
      const strings = [];
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        strings.push(tube([[Math.cos(a) * potR, .12, Math.sin(a) * potR], [Math.cos(a) * potR * .67, .53, Math.sin(a) * potR * .67], [0, 1.18, 0]], .006, 8));
      }
      strings.push(tube([[0, 1.18, 0], [0, 1.5, 0]], .008, 1));
      mesh(joinGeometry(THREE, strings), cord, p);
    }
    const leaves = [], colors = [], stems = [], count = fern ? 15 : hanging ? 11 : 9;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + random() * .29, c = Math.cos(angle), s = Math.sin(angle);
      const outward = fern ? .62 + random() * .48 : hanging ? .39 + random() * .36 : .34 + random() * .25;
      const top = .44 + random() * .44, droop = hanging ? .66 + random() * .62 : -.25 - random() * .43;
      const path = new THREE.CatmullRomCurve3(fern ? [
        new THREE.Vector3(0, potH, 0), new THREE.Vector3(c * outward * .37, potH + top * .82, s * outward * .37),
        new THREE.Vector3(c * outward * .76, potH + top, s * outward * .76), new THREE.Vector3(c * outward, potH + top * .65, s * outward),
      ] : [new THREE.Vector3(0, potH, 0), new THREE.Vector3(c * outward * .52, potH + .16, s * outward * .52), new THREE.Vector3(c * outward, potH - droop, s * outward)]);
      stems.push(new THREE.TubeGeometry(path, fern ? 16 : 14, fern ? .0045 : .004, 5, false));
      for (let j = fern ? 1 : 0; j < (fern ? 11 : 10); j++) {
        const t = fern ? j / 11 : .11 + j * .091, base = path.getPoint(t), tangent = path.getTangent(t);
        for (const side of fern ? [-1, 1] : [j % 2 ? 1 : -1]) {
          if (variety === 'pearls') {
            const pebble = .021 + random() * .006;
            const pp = base.clone().add(new THREE.Vector3(-s * side * .018, -.010, c * side * .018));
            leaves.push({ pos: pp.toArray(), rot: [0, angle, 0], scale: [pebble, pebble * 1.09, pebble] }); colors.push((i + j) % 3); continue;
          }
          const reach = fern ? (.020 + Math.sin(t * Math.PI) * .115) : .065 + random() * .041;
          const direction = new THREE.Vector3(-s * side, fern ? -.05 : hanging ? -.26 - t * .67 : .15 + random() * .14, c * side);
          direction.addScaledVector(tangent, fern ? .47 : .17).normalize();
          const petioleEnd = base.clone().addScaledVector(direction, fern ? .009 : .025);
          if (!fern) stems.push(tube([base, petioleEnd], .002, 1));
          leaves.push(leafAt(petioleEnd, direction, fern ? reach * .29 : reach * (variety === 'heart' ? .80 : .59), reach, side * (fern ? .16 : .25)));
          colors.push((i + j) % 3);
        }
      }
      if (fern) leaves.push(leafAt(path.getPoint(1), path.getTangent(1), .014, .064));
    }
    const foliage=new THREE.Group();foliage.position.y=potH;foliage.userData.actionPart='foliage';p.add(foliage);
    const stemMesh=mesh(joinGeometry(THREE, stems), palette.green, foliage);stemMesh.position.y=-potH;
    const blades=instancedFoliage(foliage, leaves, colors, variety === 'pearls' ? ['#527447', '#718b58', '#879663'] : fern ? ['#355332', '#526e3f', '#6b7e49'] : ['#42623b', '#5d7847', '#768451'], variety === 'pearls' ? 'pearls' : fern ? 'fern' : variety);blades.position.y=-potH;
    animated.push(foliage);return p;
  }
  return { plant, instancedFoliage };
}

export function addSleepingCat(THREE, { chair, pets }) {
  const random = seeded(81532), sphere = new THREE.SphereGeometry(1, 32, 22), poreSphere = new THREE.SphereGeometry(1, 8, 6);
  function mesh(geometry, material, parent, cast = true) { const m = new THREE.Mesh(geometry, material); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  function oval(scale, pos, material, parent) { const m = mesh(Math.max(...scale) < .007 ? poreSphere : sphere, material, parent); m.scale.set(...scale); m.position.set(...pos); return m; }
  function curve(points, radius, material, parent, segments = 12) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false), material, parent, false);
  }
  const furGrain = canvasMap(THREE, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6000; i++) {
      const x = random() * w, y = random() * h, light = random() > .5;
      ctx.strokeStyle = light ? 'rgba(234,234,234,.19)' : 'rgba(31,31,31,.15)'; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3, y + .5, x + 6 + random() * 5, y + (random() - .5) * 2.6); ctx.stroke();
    }
  }, false);
  function coatMap(kind) {
    return canvasMap(THREE, 1024, 512, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#d2bd99'); gradient.addColorStop(.18, '#bd9467');
      gradient.addColorStop(.49, '#a77d51'); gradient.addColorStop(.76, '#bb9264'); gradient.addColorStop(1, '#d2bd99');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      // Uneven, broken mackerel markings: each edge consists of overlapping hair
      // strokes. There are no uniform dark bands, painted outlines or closed rings.
      const centers = kind === 'tail' ? [.027,.125,.236,.389,.495,.629,.802,.941] : [.055,.163,.287,.375,.548,.686,.781,.934];
      const marks = centers.map((u,i) => ({ x:u*w, width:(kind === 'tail' ? 24 : 14)+random()*23, phase:random()*7,
        start:kind === 'tail' ? -30 : 42+random()*83, end:kind === 'tail' ? h+30 : h-38-random()*97, i }));
      function centerAt(mark, y) { return mark.x + Math.sin(y / 88 + mark.phase) * (kind === 'tail' ? 7 : 30) + Math.sin(y / 37 + mark.phase * 2) * 9; }
      for (const mark of marks) {
        // A low-contrast soft wash sits under thousands of directional fur tips.
        ctx.save(); ctx.filter = 'blur(8px)'; ctx.strokeStyle = 'rgba(95,62,36,.23)';
        ctx.lineWidth = mark.width * 1.3; ctx.lineCap = 'round'; ctx.beginPath();
        for (let y = mark.start; y <= mark.end; y += 5) { const x=centerAt(mark,y); y===mark.start?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke(); ctx.restore();
        for (let j = 0; j < (kind === 'tail' ? 600 : 500); j++) {
          const y = mark.start + random() * (mark.end-mark.start);
          const taper = Math.pow(Math.max(.01, Math.sin(Math.PI*(y-mark.start)/(mark.end-mark.start))), .42);
          const offset=(random()+random()+random()-1.5) * mark.width * taper;
          const x=centerAt(mark,y)+offset;
          const broken = .55 + .45 * Math.sin(y/24+mark.phase);
          ctx.strokeStyle=`rgba(95,63,38,${.11+random()*.22*broken})`; ctx.lineWidth=.55+random()*.65;
          ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+4,y+.5,x+7+random()*8,y+(random()-.5)*4);ctx.stroke();
        }
      }
      // Dense agouti-colored shafts break up the markings and make their borders
      // feather into the lighter coat even in the software renderer.
      for (let i = 0; i < 6000; i++) {
        const x=random()*w,y=random()*h,light=random()>.48;
        ctx.strokeStyle=light?`rgba(231,208,166,${.17+random()*.21})`:`rgba(80,55,33,${.08+random()*.12})`;
        ctx.lineWidth=.5+random()*.45;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+3,y+.3,x+5+random()*7,y+(random()-.5)*3.2);ctx.stroke();
      }
    });
  }
  const bodyMap = coatMap('body');
  const furMaterial = (color, map = null) => new THREE.MeshStandardMaterial({ color, map, roughness: .96, bumpMap: furGrain, bumpScale: .00065 });
  const fur = furMaterial('#ffffff', bodyMap);
  fur.name = 'Shared ginger coat: head, body and tail';
  const creamFur = furMaterial('#c7b18b'), earFur = furMaterial('#ad875f');
  surface(fur, 'ginger');
  surface(creamFur, 'ivory');
  const skin = new THREE.MeshStandardMaterial({ color: '#947664', roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#49382a', roughness: .98 });
  const clothMap = canvasMap(THREE, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a4a18a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 256; i += 2) {
      ctx.fillStyle = i % 4 ? 'rgba(57,53,36,.2)' : 'rgba(224,220,185,.25)'; ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1);
    }
  });
  clothMap.wrapS = clothMap.wrapT = THREE.RepeatWrapping; clothMap.repeat.set(3, 3);
  const cloth = new THREE.MeshStandardMaterial({ color: '#a4a084', map: clothMap, roughness: 1, bumpMap: clothMap, bumpScale: .0012 });
  surface(cloth, 'linen', { tint: '#e8d9cb', repeat: [2, 2] });
  const cushion = oval([.49, .082, .40], [-.035, 1.23, -.07], cloth, chair); cushion.name = 'Linen cat cushion';
  const piping = mesh(new THREE.TorusGeometry(1, .014, 6, 64), new THREE.MeshStandardMaterial({ color: '#b9b498', roughness: 1 }), chair);
  piping.rotation.x = Math.PI / 2; piping.scale.set(.455, .365, .58); piping.position.set(-.035, 1.237, -.07);
  const cat = new THREE.Group(); cat.name = 'Sleeping marmalade cat';cat.userData.roomAction={kind:'cat',label:'猫'};cat.position.set(-.065, 1.303, -.115); cat.rotation.y = -.35; chair.add(cat);
  const bodyGeometry = new THREE.SphereGeometry(1, 48, 32), bp = bodyGeometry.attributes.position, buv = bodyGeometry.attributes.uv;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const ySculpt = y < -.55 ? -.55 + (y + .55) * .32 : y;
    const shoulderRise = Math.exp(-Math.pow((x + .43) / .28, 2)), haunchRise = Math.exp(-Math.pow((x - .43) / .36, 2));
    const backProfile = .87 + .12 * shoulderRise + .24 * haunchRise - .04 * Math.exp(-Math.pow(x / .18, 2));
    bp.setXYZ(i, x * .318 + .038 - .023 * (1 - x) * z, ySculpt * .177 * backProfile + .124 + .006 * (x + 1), z * (.211 + .020 * haunchRise - .010 * shoulderRise) + .023);
    buv.setXY(i, (x + 1) * .5, .5 + Math.atan2(z, y) / (Math.PI * 2));
  }
  bodyGeometry.computeVertexNormals(); const torso = mesh(bodyGeometry, fur, cat); torso.name = 'Sculpted tabby torso';
  // One shoulder emerges from the same coat beneath the tucked neck and head.
  const shoulder = oval([.123, .094, .125], [-.142, .102, .082], fur, cat); shoulder.rotation.z = -.31;
  const foldedHaunch = oval([.153, .068, .123], [.162, .070, .120], fur, cat); foldedHaunch.rotation.y = -.23;
  const foreleg = oval([.041, .090, .043], [-.150, .074, .174], fur, cat); foreleg.rotation.set(-.24, 0, -.57);
  const head = new THREE.Group();head.userData.actionPart='cat-head';head.position.set(-.228, .111, .174); head.scale.setScalar(.82); head.rotation.set(.30, .32, -.36); cat.add(head); head.name = 'Tucked sleeping head';
  const headGeometry = new THREE.SphereGeometry(1, 48, 32), hp = headGeometry.attributes.position, huv = headGeometry.attributes.uv;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const front = Math.pow(Math.max(0, z), 5);
    const cheek = 1 + .07 * Math.exp(-Math.pow((y + .34) * 3, 2));
    const muzzle = Math.exp(-Math.pow((y + .36) / .26, 2)) * Math.exp(-Math.pow(x / .62, 4));
    const bridge = Math.exp(-Math.pow((y + .02) / .34, 2)) * Math.exp(-Math.pow(x / .22, 2));
    const brow = Math.exp(-Math.pow((y - .17) / .17, 2)) * (Math.exp(-Math.pow((x - .34) / .21, 2)) + Math.exp(-Math.pow((x + .34) / .21, 2)));
    // Match the visible hair scale to the larger torso using the same material.
    huv.setXY(i, .5 + (huv.getX(i) - .5) * .46, .5 + (huv.getY(i) - .5) * .46);
    // Cheeks, brow and muzzle share the same continuous skin surface.
    hp.setXYZ(i, x * .145 * cheek, y * .127, z * .139 + front * (.037 * muzzle + .009 * bridge + .006 * brow));
  }
  headGeometry.computeVertexNormals(); const face = mesh(headGeometry, fur, head); face.name = 'Sculpted ginger head';
  // A thin cupped pinna with a bent rounded tip, instead of an extruded triangle.
  const ep=[],eu=[],ec=[],ei=[],earRows=14,earCols=8;
  const earOutside=new THREE.Color('#ffffff'),earInside=new THREE.Color('#ddbeb1'),earEdge=new THREE.Color('#fff4e3');
  for(let back=0;back<2;back++)for(let row=0;row<=earRows;row++)for(let col=0;col<=earCols;col++){
    const t=row/earRows,u=col/earCols*2-1,width=.056*Math.pow(Math.max(.0001,1-t),.68);
    const x=u*width-.028*t,y=.099*t-.019;
    const z=-.011-.038*t*t+.010*(1-u*u)*Math.sin(Math.PI*t)-(back?.006:0);
    ep.push(x,y,z);eu.push(.5+u*.11,.35+t*.30);
    const center=Math.pow(Math.max(0,1-u*u),2)*Math.sin(Math.PI*t);
    const color=earOutside.clone().lerp(earInside,back?0:center*.85).lerp(earEdge,(1-center)*.22);
    ec.push(color.r,color.g,color.b);
  }
  const earSideCount=(earRows+1)*(earCols+1);
  for(let side=0;side<2;side++)for(let row=0;row<earRows;row++)for(let col=0;col<earCols;col++){
    const a=side*earSideCount+row*(earCols+1)+col,b=a+earCols+1;
    if(side)ei.push(a,b,a+1,b,b+1,a+1);else ei.push(a,a+1,b,b,a+1,b+1);
  }
  // Join the thin rim; the material remains opaque from every inspection angle.
  for(let row=0;row<earRows;row++)for(const col of[0,earCols]){
    const a=row*(earCols+1)+col,b=a+earCols+1;ei.push(a,b,a+earSideCount,b,b+earSideCount,a+earSideCount);
  }
  const earGeometry=new THREE.BufferGeometry();earGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ep,3));
  earGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(eu,2));earGeometry.setAttribute('color',new THREE.Float32BufferAttribute(ec,3));earGeometry.setIndex(ei);earGeometry.computeVertexNormals();
  const pinnaMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',map:bodyMap,vertexColors:true,roughness:.96,bumpMap:furGrain,bumpScale:.00065,side:THREE.DoubleSide});
  surface(pinnaMaterial, 'ginger');
  const strandPositions = [], whiskerPositions = [];
  function lineCurve(points, dest, segments = 10) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    let previous = path.getPoint(0);
    for (let i = 1; i <= segments; i++) { const next = path.getPoint(i / segments); dest.push(...previous.toArray(), ...next.toArray()); previous = next; }
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * .092, side > 0 ? .145 : .103, side > 0 ? .066 : -.008); ear.rotation.set(-.18, side * -.28, side * -.23); head.add(ear);
    const outer = mesh(earGeometry, pinnaMaterial, ear); if (side > 0) outer.scale.x = -1;
    for (let i = 0; i < 11; i++) {
      const x = (random() - .5) * .060, yy = .006 + random() * .026;
      const a = new THREE.Vector3(x, yy, -.002), b = new THREE.Vector3(x * .65, yy + .021 + random() * .015, .003);
      ear.updateMatrix(); a.applyMatrix4(ear.matrix); b.applyMatrix4(ear.matrix); strandPositions.push(...a.toArray(), ...b.toArray());
    }
    curve([[side * .035, .014, .139], [side * .057, .006, .133], [side * .079, .015, .120]], .0014, dark, head, 12);
    for (let j = 0; j < 4; j++) {
      const start = [side * .047, -.042 - j * .006, .158];
      lineCurve([start, [side * (.098 + j * .003), -.047 + (j - 1.5) * .010, .172], [side * (.154 + j * .014), -.055 + (j - 1.5) * .018, .156]], whiskerPositions, 12);
    }
    for (let j = 0; j < 3; j++) oval([.0012, .0011, .0006], [side * (.041 + j * .006), -.047 - (j % 2) * .008, .160], dark, head);
  }
  const noseShape = new THREE.Shape(); noseShape.moveTo(-.014, .006); noseShape.quadraticCurveTo(0, .010, .014, .006); noseShape.lineTo(.003, -.009); noseShape.quadraticCurveTo(0, -.012, -.003, -.009); noseShape.closePath();
  const nose = mesh(new THREE.ExtrudeGeometry(noseShape, { depth: .006, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 2, curveSegments: 6 }), skin, head); nose.position.set(0, -.037, .169);
  curve([[0, -.048, .170], [0, -.059, .162], [-.010, -.062, .156]], .00085, dark, head, 10);
  curve([[0, -.059, .162], [.010, -.062, .156]], .00085, dark, head, 5);
  const paws = [[-.217, .013, .197], [-.085, .013, .196]];
  for (const [i, point] of paws.entries()) {
    const paw = oval([.052 - i * .003, .029, .067], point, creamFur, cat); paw.rotation.y = -.38;
    for (const dx of [-.018, .018]) curve([[point[0] + dx, point[1] + .027, point[2] + .038], [point[0] + dx - .001, point[1] + .020, point[2] + .064]], .0009, earFur, cat, 5);
  }
  // The tail carries the same coat through its curled, tapered tip.
  const tailPath = new THREE.CatmullRomCurve3([[.237, .136, -.102], [.325, .065, .063], [.215, .039, .242], [.024, .034, .263], [-.129, .033, .227]].map(p => new THREE.Vector3(...p)));
  const tailGeometry = new THREE.TubeGeometry(tailPath, 54, 1, 12, false), tp = tailGeometry.attributes.position, tuv = tailGeometry.attributes.uv;
  for (let ring = 0; ring <= 54; ring++) {
    const t = ring / 54, center = tailPath.getPointAt(t), radius = .037 * (1 - .43 * Math.pow(t, 3));
    for (let j = 0; j <= 12; j++) {
      const i = ring * 13 + j, v = new THREE.Vector3().fromBufferAttribute(tp, i).sub(center).multiplyScalar(radius).add(center);
      tp.setXYZ(i, v.x, v.y, v.z); tuv.setXY(i, t, j / 12);
    }
  }
  tailGeometry.computeVertexNormals(); mesh(tailGeometry, fur, cat);
  oval([.021, .020, .021], [-.129, .033, .227], creamFur, cat);
  function lines(positions, color, parent, name) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .60, depthWrite: false })); object.name = name; parent.add(object); return object;
  }
  lines(strandPositions, '#d8c5a2', head, 'Fine inner-ear guard hairs');
  lines(whiskerPositions, '#e8dbc0', head, 'Fine curved whiskers');
  const guardHairs = [];
  for (let i = 0; i < 120; i++) {
    const phi = random() * Math.PI * 2, y = .10 + random() * .85, rr = Math.sqrt(1 - y * y);
    const x = Math.cos(phi) * rr, z = Math.sin(phi) * rr;
    const shoulderRise = Math.exp(-Math.pow((x + .43) / .28, 2)), haunchRise = Math.exp(-Math.pow((x - .43) / .36, 2));
    const backProfile = .87 + .12 * shoulderRise + .24 * haunchRise - .04 * Math.exp(-Math.pow(x / .18, 2));
    const a = new THREE.Vector3(x * .318 + .038 - .023 * (1 - x) * z, y * .177 * backProfile + .124 + .006 * (x + 1), z * (.211 + .020 * haunchRise - .010 * shoulderRise) + .023);
    const b = a.clone().add(new THREE.Vector3(.004 + random() * .003, y * .002, z * .003)); guardHairs.push(...a.toArray(), ...b.toArray());
  }
  lines(guardHairs, '#cdb18b', cat, 'Sparse short coat guard hairs');
  pets.push({ object: cat, baseScale: cat.scale.clone(), phase: .45 });
  return cat;
}
