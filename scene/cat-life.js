import { surface } from './surface-materials.js?v=20260916-atlas2';

/** A small articulated cat with a four-beat walk, foot IK and unhurried habits. */
export function createRoomCat(T, { group: parent, floorY = .005, route } = {}) {
  const group = new T.Group(); group.name = 'Wandering marmalade cat'; parent?.add(group);
  const sphere = new T.SphereGeometry(1, 24, 16), smallSphere = new T.SphereGeometry(1, 12, 8);
  const skin = new T.MeshStandardMaterial({ color: '#bd9482', roughness: .8 });
  const dark = new T.MeshStandardMaterial({ color: '#3d3024', roughness: .92 });
  const eyeMaterial = new T.MeshStandardMaterial({ color: '#afb475', roughness: .21, metalness: .02 });
  const pupilMaterial = new T.MeshStandardMaterial({ color: '#181d13', roughness: .2 });
  const cream = surface(new T.MeshStandardMaterial({ color: '#eee1c5', roughness: .95 }), 'ivory', { tint: '#fff1d5' });
  const coatCanvas = document.createElement('canvas'); coatCanvas.width = coatCanvas.height = 512;
  const ctx = coatCanvas.getContext('2d'); ctx.fillStyle = '#c4945b'; ctx.fillRect(0, 0, 512, 512);
  let seed = 81372; const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  for (let stripe = 0; stripe < 9; stripe++) {
    ctx.strokeStyle = 'rgba(107,67,38,.33)'; ctx.lineWidth = 14 + stripe % 3 * 5; ctx.lineCap = 'round'; ctx.beginPath();
    for (let y = 0; y <= 512; y += 12) { const x = stripe * 61 + Math.sin(y / 73 + stripe * 1.7) * 18; y ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  }
  for (let i = 0; i < 4000; i++) {
    const x = random() * 512, y = random() * 512;
    ctx.strokeStyle = random() > .5 ? 'rgba(241,216,171,.26)' : 'rgba(104,69,40,.13)'; ctx.lineWidth = .65;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 + random() * 6, y + (random() - .5) * 2); ctx.stroke();
  }
  const coatMap = new T.CanvasTexture(coatCanvas); coatMap.colorSpace = T.SRGBColorSpace; coatMap.anisotropy = 4;
  const fur = surface(new T.MeshStandardMaterial({ color: '#ffffff', map: coatMap, roughness: .96 }), 'ginger', { tint: '#f4dfb7', bumpScale: .001 });
  fur.name = 'Shared ginger coat: head, body and tail';
  function mesh(geometry, material, owner = group, cast = true) { const m = new T.Mesh(geometry, material); m.castShadow = cast; m.receiveShadow = true; owner.add(m); return m; }
  function oval(scale, position, material = fur, owner = group) { const m = mesh(Math.max(...scale) < .065 ? smallSphere : sphere, material, owner); m.scale.set(...scale); m.position.set(...position); return m; }
  function node(name, position, owner = group) { const n = new T.Group(); n.name = name; n.position.set(...position); owner.add(n); return n; }
  const body = node('Flexible cat spine', [0, 0, 0]);
  const bodyGeo = new T.SphereGeometry(1, 32, 22), position = bodyGeo.attributes.position, uv = bodyGeo.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const haunch = Math.exp(-Math.pow((z + .55) / .38, 2)), shoulder = Math.exp(-Math.pow((z - .48) / .4, 2));
    position.setXYZ(i, x * (.185 + haunch * .027 + shoulder * .008), .59 + y * (.185 + haunch * .027) + .012 * shoulder, z * .415);
    uv.setXY(i, (z + 1) / 2, .5 + Math.atan2(x, y) / (Math.PI * 2));
  }
  bodyGeo.computeVertexNormals(); const torso = mesh(bodyGeo, fur, body); torso.name = 'Sculpted tabby torso';
  const breast = oval([.142, .225, .142], [0, .594, .274], fur, body); breast.rotation.x = -.18;
  oval([.116, .137, .055], [0, .569, .39], cream, body);
  const neck = oval([.135, .197, .132], [0, .699, .333], fur, body); neck.rotation.x = -.36;

  const head = node('Alert articulated head', [0, .828, .405]); head.userData.actionPart = 'cat-head';
  const faceGeo = new T.SphereGeometry(1, 32, 22), hp = faceGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), front = Math.max(0, z) ** 5;
    const muzzle = Math.exp(-Math.pow((y + .33) / .30, 2)) * Math.exp(-Math.pow(x / .68, 4));
    hp.setXYZ(i, x * .159 * (1 + .10 * Math.exp(-Math.pow((y + .28) * 3, 2))), y * .143, z * .145 + front * muzzle * .026);
  }
  faceGeo.computeVertexNormals(); const face = mesh(faceGeo, fur, head); face.name = 'Sculpted ginger head';
  for (const side of [-1, 1]) oval([.064, .041, .047], [side * .048, -.056, .137], cream, head);
  oval([.062, .028, .037], [0, -.096, .129], cream, head);

  // Thin curved ears have a tapered rim and a shallow concavity instead of cones.
  const earPositions = [], earUV = [], earIndex = [], rows = 9, cols = 6;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const t = row / rows, u = col / cols * 2 - 1;
    earPositions.push(u * .074 * Math.pow(1 - t, .72), t * .171, -.025 * t - .012 * u * u + Math.sin(t * Math.PI) * .025 * (1 - u * u));
    earUV.push(.43 + col / cols * .14, .35 + t * .25);
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) { const a = row * (cols + 1) + col, b = a + cols + 1; earIndex.push(a, b, a + 1, b, b + 1, a + 1); }
  const earGeo = new T.BufferGeometry(); earGeo.setAttribute('position', new T.Float32BufferAttribute(earPositions, 3)); earGeo.setAttribute('uv', new T.Float32BufferAttribute(earUV, 2)); earGeo.setIndex(earIndex); earGeo.computeVertexNormals();
  const earFur = fur.clone(); earFur.side = T.DoubleSide;
  const innerEarMaterial = new T.MeshStandardMaterial({ color: '#b79481', roughness: .98, side: T.DoubleSide });
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = node('Listening ear', [side * .102, .083, -.014], head); ear.rotation.set(-.12, side * -.27, side * -.25);
    mesh(earGeo, earFur, ear); const inner = mesh(earGeo, innerEarMaterial, ear, false); inner.scale.set(.67, .74, .8); inner.position.set(0, .018, .006); ears.push(ear);
  }
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = node('Blinking green eye', [side * .086, .027, .128], head); eye.rotation.y = side * .27;
    oval([.042, .029, .021], [0, 0, 0], dark, eye);
    oval([.036, .023, .022], [0, 0, .008], eyeMaterial, eye);
    oval([.006, .022, .009], [0, 0, .027], pupilMaterial, eye);
    oval([.005, .005, .003], [-.010, .007, .033], new T.MeshStandardMaterial({ color: '#fff6d9', roughness: .15 }), eye); eyes.push(eye);
  }
  const noseShape = new T.Shape(); noseShape.moveTo(-.021, .01); noseShape.quadraticCurveTo(0, .015, .021, .01); noseShape.lineTo(0, -.012); noseShape.closePath();
  const nose = mesh(new T.ExtrudeGeometry(noseShape, { depth: .006, bevelEnabled: true, bevelSize: .003, bevelThickness: .002, bevelSegments: 2, curveSegments: 4 }), skin, head);
  nose.position.set(0, -.045, .181);
  const whiskerPoints = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const curve = new T.QuadraticBezierCurve3(new T.Vector3(side * .049, -.059 - i * .006, .168), new T.Vector3(side * .139, -.047 + (i - 1.5) * .022, .182), new T.Vector3(side * (.227 - i * .007), -.051 + (i - 1.5) * .035, .152));
    for (let p = 0; p < 8; p++) whiskerPoints.push(...curve.getPoint(p / 8).toArray(), ...curve.getPoint((p + 1) / 8).toArray());
  }
  const whiskerGeo = new T.BufferGeometry(); whiskerGeo.setAttribute('position', new T.Float32BufferAttribute(whiskerPoints, 3));
  const whiskers = new T.LineSegments(whiskerGeo, new T.LineBasicMaterial({ color: '#eee0c5', transparent: true, opacity: .67 })); whiskers.name = 'Fine curved whiskers'; head.add(whiskers);
  const mouthGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, -.058, .178), new T.Vector3(0, -.078, .169), new T.Vector3(-.017, -.087, .156), new T.Vector3(0, -.078, .169), new T.Vector3(.017, -.087, .156)]);
  head.add(new T.Line(mouthGeo, new T.LineBasicMaterial({ color: '#755343' })));

  const legs = [];
  for (const front of [true, false]) for (const side of [-1, 1]) {
    const hip = node((front ? 'Foreleg' : 'Hindleg') + (side < 0 ? ' left' : ' right'), [side * (front ? .126 : .142), .575, front ? .255 : -.282]);
    hip.userData.actionPart = (front ? 'front-' : 'hind-') + (side < 0 ? 'left' : 'right');
    const upperLength = front ? .285 : .30, lowerLength = front ? .265 : .28;
    oval([front ? .068 : .102, upperLength * .61, front ? .069 : .097], [0, -upperLength * .42, 0], fur, hip);
    const knee = node('Knee joint', [0, -upperLength, 0], hip);
    oval([.047, lowerLength * .59, .052], [0, -lowerLength * .47, 0], fur, knee);
    const paw = node('Planted paw', [0, -lowerLength, 0], knee);
    oval([.060, .040, .088], [0, .021, .021], cream, paw);
    const phaseOffset = front ? side < 0 ? .25 : .75 : side < 0 ? 0 : .5;
    legs.push({ hip, knee, paw, front, side, upperLength, lowerLength, phaseOffset });
  }
  const tail = node('Living tail', [0, .625, -.372], body), tailJoints = [];
  tail.userData.actionPart = 'cat-tail'; let previous = tail;
  for (let i = 0; i < 8; i++) {
    const joint = node('Tail vertebra ' + i, [0, 0, i ? -.093 : 0], previous);
    const radius = .044 * (1 - i * .074), segment = mesh(new T.CapsuleGeometry(radius, .084, 3, 10), i === 7 ? cream : fur, joint);
    segment.rotation.x = Math.PI / 2; segment.position.z = -.047; tailJoints.push(joint); previous = joint;
  }

  // The cat uses the open bay under the desk and its near edge. This keeps its
  // feet within the seated lens while clearing both chair and tapered desk legs.
  const path = new T.CatmullRomCurve3((route || [[-1.95, .79], [-1.50, .54], [-.57, .62], [-.27, 1.12], [-1.18, 1.36], [-2.09, 1.27]]).map(([x, z]) => new T.Vector3(x, floorY, z)), true, 'centripetal');
  path.arcLengthDivisions = 300; const pathLength = path.getLength();
  const habits = [['walk', 10.4], ['sniff', 2.9], ['walk', 8.7], ['pause', 2.3], ['walk', 11.2], ['sit', 6.8]];
  let pathDistance = 0, gait = 0, habitIndex = 0, habitTime = 0, age = 0, reaction = 3.6, speed = 0, sitting = 0, sniffing = 0, paused = false, disposed = false;
  // Ambient contact under the paws is separate from the inspectable animal.
  // These five tiny transparent planes complement the actual cast sun shadow.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d'), gradient = shadowContext.createRadialGradient(64, 64, 3, 64, 64, 61);
  gradient.addColorStop(0, 'rgba(34,28,19,.36)'); gradient.addColorStop(.38, 'rgba(34,28,19,.23)'); gradient.addColorStop(1, 'rgba(34,28,19,0)');
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
  const shadowMap = new T.CanvasTexture(shadowCanvas); shadowMap.colorSpace = T.SRGBColorSpace;
  const shadowMaterial = new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false});
  const shadowGeometry = new T.PlaneGeometry(1, 1), contactShadow = new T.Group(); contactShadow.name = 'Cat floor contact'; parent?.add(contactShadow);
  function contactPatch(width, length) {const patch=new T.Mesh(shadowGeometry,shadowMaterial);patch.rotation.x=-Math.PI/2;patch.scale.set(width,length,1);patch.raycast=()=>{};contactShadow.add(patch);return patch;}
  const bodyShadow=contactPatch(.63,1.05), pawShadows=legs.map(()=>contactPatch(.19,.24)), pawMatrix=new T.Matrix4();
  function updateContact() {
    contactShadow.position.set(group.position.x,floorY-.010,group.position.z); contactShadow.rotation.y=group.rotation.y;
    bodyShadow.scale.set(.63+sitting*.10,1.05-sitting*.13,1);
    legs.forEach((leg,i)=>{leg.hip.updateMatrix();leg.knee.updateMatrix();leg.paw.updateMatrix();pawMatrix.multiplyMatrices(leg.hip.matrix,leg.knee.matrix).multiply(leg.paw.matrix);const e=pawMatrix.elements;const lift=Math.max(0,e[13]-.032);pawShadows[i].position.set(e[12],.001,e[14]+.021);pawShadows[i].scale.set(.19+lift,.24+lift,1);});
  }
  const tangent = new T.Vector3(), pathPoint = new T.Vector3();
  const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  function legPose(leg, footZ, lift, sit) {
    const { hip, knee, paw, front, upperLength: a, lowerLength: b } = leg;
    hip.position.y = .575 - (front ? .015 : .195) * sit;
    const targetY = .032 + lift, dz = footZ - (front ? .035 * sit : .10 * sit), dy = targetY - hip.position.y;
    const distance = Math.min(a + b - .002, Math.max(.08, Math.hypot(dy, dz)));
    const direction = Math.atan2(dz, -dy), bend = front ? -1 : 1;
    const inner = Math.acos(T.MathUtils.clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1));
    const upperAngle = direction + bend * inner, kneeY = -Math.cos(upperAngle) * a, kneeZ = Math.sin(upperAngle) * a;
    const lowerAngle = Math.atan2(dz - kneeZ, dy - kneeY < 0 ? -(dy - kneeY) : .001);
    hip.rotation.x = -upperAngle; knee.rotation.x = -lowerAngle + upperAngle; paw.rotation.x = lowerAngle;
  }
  function pose(delta, moving) {
    const ease = 1 - Math.exp(-delta * 5);
    sitting += ((habits[habitIndex][0] === 'sit' && !reaction ? 1 : 0) - sitting) * ease;
    sniffing += ((habits[habitIndex][0] === 'sniff' && !reaction ? 1 : 0) - sniffing) * ease;
    body.position.y = -.115 * sitting + Math.sin(gait * Math.PI * 4) * .012 * moving;
    body.rotation.x = -.19 * sitting + Math.sin(gait * Math.PI * 2) * .012 * moving;
    body.rotation.z = Math.sin(gait * Math.PI * 2) * .020 * moving;
    head.position.set(0, .828 - sniffing * .245 - sitting * .025, .405 + sniffing * .083);
    head.rotation.x = sniffing * .52 + (reaction ? -.11 : Math.sin(age * .7) * .025);
    head.rotation.y = reaction ? Math.sin(age * .8) * .12 : Math.sin(age * .53) * .065;
    head.rotation.z = reaction ? .075 : Math.sin(age * .39) * .012;
    const blinkCycle = age % 5.8, blink = blinkCycle < .17 ? Math.sin(blinkCycle / .17 * Math.PI) : 0;
    for (const eye of eyes) eye.scale.y = 1 - blink * .93;
    ears[0].rotation.y = .27 + Math.sin(age * .37) * .05; ears[1].rotation.y = -.27 + Math.sin(age * .43 + 1) * .07;
    tail.rotation.x = .57 - sitting * .44; tail.rotation.z = Math.sin(age * .62) * .09 + sitting * .8;
    tailJoints.forEach((joint, i) => { joint.rotation.x = .135 + Math.sin(age * 1.25 - i * .49) * .031 - sitting * .065; joint.rotation.y = Math.sin(age * .7 - i * .35) * .065 + sitting * .14; });
    for (const leg of legs) {
      const phase = (gait + leg.phaseOffset) % 1;
      let footZ, lift;
      if (phase < .64) { footZ = .134 - phase / .64 * .268; lift = 0; }
      else { const swing = (phase - .64) / .36; footZ = -.134 + (1 - Math.cos(swing * Math.PI)) * .134; lift = Math.sin(swing * Math.PI) * .074; }
      legPose(leg, footZ * moving, lift * moving, sitting);
    }
    group.userData.catState = reaction > 0 ? 'look' : habits[habitIndex][0];
  }
  path.getPointAt(0, pathPoint); group.position.copy(pathPoint); group.rotation.y = Math.atan2(-group.position.x, 8.24-group.position.z) + .14; pose(1, 0); updateContact();
  function react() { reaction = 3.4; group.userData.catState = 'look'; }
  group.userData.roomAction = { kind: 'cat-life', label: '歩く茶トラ', onActivate: react };
  return {
    group, legs, head, body, tail, path, contactShadow, react,
    get state() { return group.userData.catState; },
    setPaused(value) { paused = !!value; },
    update(delta, enabled = true) {
      if (disposed || paused || !enabled || delta <= 0) return false;
      const dt = Math.min(delta, .075); age += dt;
      if (reaction > 0) reaction = Math.max(0, reaction - dt);
      else { habitTime += dt; if (habitTime >= habits[habitIndex][1]) { habitTime = 0; habitIndex = (habitIndex + 1) % habits.length; } }
      const walking = habits[habitIndex][0] === 'walk' && !reaction && sitting < .3;
      path.getTangentAt(pathDistance / pathLength, tangent);
      const alignment=Math.max(0,Math.cos(angleDelta(group.rotation.y,Math.atan2(tangent.x,tangent.z))));
      speed += ((walking ? .235*alignment : 0) - speed) * (1 - Math.exp(-dt * 4));
      if (speed > .001) { pathDistance = (pathDistance + speed * dt) % pathLength; gait += speed * dt / .42; }
      path.getPointAt(pathDistance / pathLength, pathPoint); group.position.copy(pathPoint);
      path.getTangentAt(pathDistance / pathLength, tangent);
      const desiredYaw = reaction ? Math.atan2(-group.position.x, 8.24 - group.position.z) : Math.atan2(tangent.x, tangent.z);
      const turn=angleDelta(group.rotation.y,desiredYaw)*(1-Math.exp(-dt*(reaction?1.7:4)));
      group.rotation.y += T.MathUtils.clamp(turn,-1.75*dt,1.75*dt);
      pose(dt, Math.min(1, speed / .21)); updateContact(); return true;
    },
    dispose() { disposed = true; coatMap.dispose(); shadowMap.dispose(); shadowMaterial.dispose(); shadowGeometry.dispose(); contactShadow.removeFromParent(); },
  };
}
