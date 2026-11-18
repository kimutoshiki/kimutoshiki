import { deskMincho, finishCanvasType } from "./desk-type.js";

// One illustrated atlas for the cover and three pages. Each quadrant includes
// a paper margin so neighbouring pages cannot bleed at ordinary viewing sizes.
function drawJournal(canvas) {
  const c = canvas.getContext('2d');
  const path = (points, close = false) => {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (close) c.closePath();
    c.stroke();
  };
  const line = (x, y, xx, yy) => path([[x, y], [xx, yy]]);
  const text = (value, x, y, size, face = 'serif', weight = 500) => {
    c.font = weight + ' ' + size + 'px ' + face; c.fillText(value, x, y);
  };
  const mincho = deskMincho;
  const burgundy = '#814439', ink = '#243e3f', gold = '#e7ca85';
  c.fillStyle = '#244543'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 4) {
    c.fillStyle = i % 8 ? '#2b4c48' : '#284947'; c.fillRect(i, 0, 1, 512);
    c.fillStyle = 'rgba(177,164,117,.065)'; c.fillRect(0, i, 512, 1);
  }
  c.fillStyle = '#1b3635'; c.fillRect(0, 0, 34, 512);
  c.strokeStyle = gold; c.lineWidth = 3; c.strokeRect(54, 20, 435, 472);
  c.lineWidth = 1; c.strokeRect(61, 27, 421, 458); line(32, 0, 32, 512);
  c.textAlign = 'center'; c.fillStyle = gold;
  text('FIELD NOTES', 272, 94, 31, 'Georgia, serif');
  text('旅の手帖', 272, 251, 83, mincho, 650);
  line(172, 277, 372, 277);
  text('早稲田  ·  唐津', 272, 332, 37, mincho);
  text('T. KIMURA', 272, 443, 23, 'Georgia, serif');
  // Gilt compass rose stamped into the cloth.
  const cx = 272, cy = 150;
  c.lineWidth = 1.8;
  c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.stroke();
  path([[cx,cy-34],[cx+6,cy-6],[cx+33,cy],[cx+6,cy+6],[cx,cy+34],[cx-6,cy+6],[cx-33,cy],[cx-6,cy-6]], true);

  function page(index, title, latin, draw) {
    c.save(); c.translate((index % 2) * 512, Math.floor(index / 2) * 512);
    c.fillStyle = '#efe6cc'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#cfbea2'; c.lineWidth = 1.3;
    for (let y = 153; y < 469; y += 31) line(28, y, 484, y);
    c.strokeStyle = '#b47d65'; line(50, 137, 50, 472);
    c.fillStyle = burgundy; c.textAlign = 'left';
    text(latin, 47, 55, 21, 'Georgia, serif');
    c.fillStyle = ink; text(title, 44, 124, 58, mincho, 650);
    c.strokeStyle = ink; c.lineWidth = 3.5; c.lineJoin = 'round'; c.lineCap = 'round';
    draw(); c.restore();
  }
  page(1, '覚え書き', 'FIELD NOTES', () => {
    c.fillStyle = '#596358'; text('早稲田 と 唐津', 70, 206, 36, mincho);
    line(70, 234, 245, 234);
    for (let i = 0; i < 3; i++) {
      c.strokeRect(72, 271 + i * 54, 13, 13);
      line(105, 279 + i * 54, 341 - i * 27, 279 + i * 54);
    }
  });
  page(2, '大隈講堂', 'WASEDA', () => {
    // The stepped clock tower and long gabled hall, drawn as a field sketch.
    path([[95,409],[95,340],[124,340],[124,319],[162,302],[197,323],[197,404]]);
    path([[103,340],[162,311],[200,331],[279,331]]);
    path([[198,401],[198,343],[281,343],[281,401]]);
    for (let x = 117; x < 270; x += 20) {
      path([[x,393],[x,359],[x+4,353],[x+10,359],[x+10,393]]);
    }
    c.strokeRect(285, 239, 68, 165); c.strokeRect(278, 232, 82, 8);
    path([[284,232],[284,208],[296,197],[296,183],[318,158],[341,183],[341,197],[352,208],[352,232]]);
    c.strokeRect(291, 248, 56, 46);
    c.beginPath(); c.arc(319, 270, 18, 0, Math.PI * 2); c.stroke(); path([[319,257],[319,270],[330,275]]);
    for (let x = 297; x < 349; x += 15) path([[x,395],[x,312],[x+6,312],[x+6,395]]);
    line(72,411,418,411);
  });
  page(3, '唐津城', 'KARATSU', () => {
    // Layered tiled roofs above the sloping stonework and a rippled waterfront.
    path([[116,399],[147,353],[331,353],[363,399]], true);
    for (let y = 366; y < 396; y += 13) {
      line(144-(y-366)*.6, y, 341+(y-366)*.65, y);
      for (let x = 161+(y%2)*11; x < 331; x += 32) line(x, y-9, x+2, y);
    }
    for (const [x,y,w,h] of [[238,350,180,45],[238,305,151,37],[238,268,119,32],[238,236,86,29]]) {
      const half = w / 2;
      path([[x-half,y],[x-half,y-h+13],[x+half,y-h+13],[x+half,y]]);
      path([[x-half-16,y-h+13],[x-half+14,y-h+3],[x-half+32,y-h-10],
        [x+half-32,y-h-10],[x+half-14,y-h+3],[x+half+16,y-h+13]], true);
      for (let wx = x-half+15; wx < x+half-4; wx += 18) line(wx, y-h+19, wx, y-6);
    }
    path([[177,210],[208,197],[238,178],[269,197],[299,210]]);
    line(81,405,412,405);
    for (const [x,y,w] of [[78,421,79],[181,429,110],[319,420,74]]) line(x,y,x+w,y);
  });
}

function journalPrint(T, onTextureLoad) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  drawJournal(canvas);
  const texture = new T.CanvasTexture(canvas);
  finishCanvasType(texture, () => drawJournal(canvas), onTextureLoad);
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return new T.MeshStandardMaterial({map:texture, roughness:.86});
}

const BOOK_WIDTH = .83, BOOK_DEPTH = .66;
function panelUV(columnFraction, rowFraction, panel) {
  const inset = .004;
  const u = inset + columnFraction * (1 - 2 * inset), v = inset + rowFraction * (1 - 2 * inset);
  return [(panel % 2 + u) / 2, (1 - Math.floor(panel / 2) + v) / 2];
}

export function createDeskJournal(T, root, onTextureLoad) {
  root.userData.deskProp = 'notebook';
  root.position.set(-.70, 2.172, .493);
  root.rotation.y = -.045; root.scale.setScalar(1);
  const print = journalPrint(T, onTextureLoad);
  const cloth = new T.MeshStandardMaterial({color:'#274442', roughness:.86});
  const paper = new T.MeshStandardMaterial({color:'#ded0ae', roughness:.93});
  const ribbon = new T.MeshStandardMaterial({color:'#8d483a', roughness:.85});
  const block = new T.BoxGeometry(1, 1, 1);
  function add(parent, geo, mat, name) {
    const mesh = new T.Mesh(geo, mat); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function box(parent, mat, name, x, y, z, w, h, d) {
    const mesh = add(parent, block, mat, name);
    mesh.scale.set(w,h,d); mesh.position.set(x,y,z); return mesh;
  }
  function board(parent, y, name) {
    const w = BOOK_WIDTH, d = BOOK_DEPTH / 2, r = .023;
    const s = new T.Shape();
    s.moveTo(0,-d); s.lineTo(w-r,-d); s.quadraticCurveTo(w,-d,w,-d+r);
    s.lineTo(w,d-r); s.quadraticCurveTo(w,d,w-r,d); s.lineTo(0,d); s.closePath();
    const geo = new T.ExtrudeGeometry(s, {depth:.012, bevelEnabled:true, bevelSegments:1, bevelThickness:.004, bevelSize:.004, curveSegments:4});
    geo.rotateX(-Math.PI/2);
    const mesh = add(parent, geo, cloth, name); mesh.position.y = y; return mesh;
  }
  function printedFace(parent, name, panel, width, depth, y) {
    const geo = new T.PlaneGeometry(width,depth); geo.rotateX(-Math.PI/2);
    const uv=geo.attributes.uv;
    for (let i=0;i<uv.count;i++) uv.setXY(i,...panelUV(uv.getX(i),uv.getY(i),panel));
    const mesh = add(parent,geo,print,name); mesh.position.set(BOOK_WIDTH/2,y,0); return mesh;
  }
  board(root,.004,'Bound journal back');
  box(root,paper,'Ivory page block',BOOK_WIDTH/2,.052,0,BOOK_WIDTH-.03,.075,BOOK_DEPTH-.032);
  // Thin fore-edge signatures catch grazing light without texturing six faces.
  for (let i=0;i<3;i++) {
    box(root,paper,'Page signature',BOOK_WIDTH/2,.029+i*.023,.001,BOOK_WIDTH-.023,.005,BOOK_DEPTH-.025);
  }
  printedFace(root,'Karatsu sketch on the right page',3,BOOK_WIDTH-.04,BOOK_DEPTH-.039,.091);
  const spine=box(root,cloth,'Sewn spine',.003,.051,0,.035,.087,BOOK_DEPTH);
  spine.rotation.z=.045;
  const bookmark=box(root,ribbon,'Woven bookmark',.10,.020,BOOK_DEPTH*.50,.040,.007,.118);
  bookmark.rotation.y=.08;
  const hinge = new T.Group(); hinge.name='Journal cover hinge'; root.add(hinge);
  board(hinge,-.006,'Rounded cloth board');
  const cover = printedFace(hinge,'Journal cloth cover',0,BOOK_WIDTH-.016,BOOK_DEPTH-.017,.0105);
  // A turning sheet uses two printed sides in a single mesh/draw. Reuse its
  // buffers while it bends and let the cover precede it on both open and close.
  const divisions = 12, row = divisions + 1, sideSize = row * 2;
  const geometry = new T.BufferGeometry(), uv = [], indices = [];
  const positions = new T.Float32BufferAttribute(new Float32Array(sideSize * 2 * 3),3);
  positions.setUsage(T.DynamicDrawUsage);
  for (let side=0;side<2;side++) {
    for (let k=0;k<2;k++) for (let i=0;i<row;i++) {
      uv.push(...panelUV(side ? 1-i/divisions : i/divisions,1-k,side ? 2 : 1));
    }
    const start=side*sideSize;
    for (let i=0;i<divisions;i++) {
      const a=start+i,b=a+1,d=a+row,e=d+1;
      indices.push(...(side ? [a,b,d,b,e,d] : [a,d,b,b,d,e]));
    }
  }
  geometry.setAttribute('position',positions); geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); geometry.setIndex(indices);
  const sheet = add(root,geometry,print,'Turning illustrated journal sheet');
  sheet.frustumCulled = false;
  function setOpen(fraction) {
    const smooth = x => x*x*(3-2*x);
    const boardTurn = smooth(Math.min(1,fraction/.88));
    const leafTurn = smooth(Math.max(0,Math.min(1,(fraction-.17)/.83)));
    hinge.rotation.z = boardTurn*(Math.PI-.012);
    hinge.position.y = .108-.093*boardTurn;
    for (let i=0;i<row;i++) {
      const r=i/divisions, distance=.016+(BOOK_WIDTH-.04)*r;
      const angle = leafTurn*Math.PI + .46*Math.sin(Math.PI*leafTurn)*(1-r);
      const x=Math.cos(angle)*distance, y=.095+Math.sin(angle)*distance-.059*leafTurn*smooth(r);
      for (let k=0;k<2;k++) for (let side=0;side<2;side++) {
        positions.setXYZ(side*sideSize+k*row+i, x, y+(side ? -.0006 : .0006)*Math.cos(angle), (k-.5)*(BOOK_DEPTH-.04));
      }
    }
    positions.needsUpdate=true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  }
  setOpen(0);
  return {root, hinge, sheet, cover, setOpen};
}

export function createDeskActions(T, {journal, lampLight, drawer, desk}) {
  const lamp = lampLight.parent, shade = lamp.getObjectByName('Desk lamp shade pivot');
  const bulb = shade.getObjectByName('Desk lamp bulb');
  const shadeRest = shade.rotation.z, closedDrawerZ = drawer.position.z;
  lamp.userData.deskProp='lamp'; drawer.userData.deskProp='drawer';
  const state = {notebook:false,lamp:true,drawer:false};
  const progress = {notebook:0,lamp:1,drawer:0};
  const durations = {notebook:.95,lamp:.36,drawer:.61};
  const active = new Set();
  // The pick proxy of the drawer covers only its front hardware and the part
  // that actually slides into view. The wooden desk shields hidden contents.
  const bounds = (lo, hi) => new T.Box3(new T.Vector3(...lo), new T.Vector3(...hi));
  const deskSlab = bounds([-3.175,1.94,-.955],[3.175,2.167,.875]);
  const targets = [
    {id:'notebook',owner:journal.root, box:bounds([-.025,.010,-.35],[.865,.115,.35])},
    {id:'lamp',owner:shade, box:bounds([-.34,-.208,-.34],[.34,.061,.34])},
    {id:'lamp',owner:lamp, box:bounds([-.29,0,-.29],[.29,.108,.29])},
    {id:'drawer',owner:drawer, box:bounds([-1.37,-.20,.58],[1.37,.20,.882])},
  ];
  // Static bounds in each moving owner's own coordinates also cover mid-turn
  // poses. Most hover rays can skip triangle intersection entirely.
  const geometryBounds = [
    [journal.root, bounds([-.87,-.004,-.39],[.87,.97,.39])],
    [lamp, bounds([-.76,0,-.46],[.35,1.2,.51])],
    [drawer, bounds([-1.39,-.20,-.72],[1.39,.20,.91])],
  ];
  const inverse = new T.Matrix4(), point = new T.Vector3();
  let localRay;
  function boxDistance(ray,owner,box) {
    owner.updateWorldMatrix(true,false);
    localRay ||= ray.clone();
    localRay.copy(ray).applyMatrix4(inverse.copy(owner.matrixWorld).invert());
    if (!localRay.intersectBox(box, point)) return Infinity;
    return ray.origin.distanceTo(point.applyMatrix4(owner.matrixWorld));
  }
  function pick(raycaster) {
    const ray = raycaster.ray;
    let distance = boxDistance(ray,desk,deskSlab), id = null;
    for (const target of targets) {
      const hitDistance = boxDistance(ray,target.owner,target.box);
      if (hitDistance < distance) {id=target.id; distance=hitDistance;}
    }
    // Real geometry handles an upturned leaf, the lamp arm and the open tray.
    for (const [root, box] of geometryBounds) {
      if (boxDistance(ray,root,box) >= distance) continue;
      root.updateWorldMatrix(false,true);
      const hit = raycaster.intersectObject(root,true)[0];
      if (hit && hit.distance < distance) { id=root.userData.deskProp; distance=hit.distance; }
    }
    return id;
  }
  function pose(id, p) {
    if (id === 'notebook') { journal.setOpen(p); return; }
    const eased = p*p*(3-2*p);
    if (id === 'drawer') {
      drawer.position.z=closedDrawerZ+drawer.userData.roomAction.travel*eased;
    } else {
      shade.rotation.z=shadeRest+.32*(1-eased);
      bulb.material.emissiveIntensity=.02+1.98*eased;
      // The time-of-day owner keeps setting intensity. A dimmer on colour
      // layers the switch over that value without allocating another light.
      lampLight.color.set('#ffd094').multiplyScalar(eased);
      lampLight.visible=p>0;
    }
  }
  function update(delta,animate=true) {
    if (!active.size) return false;
    for (const id of active) {
      const end=Number(state[id]);
      const step=Math.max(0,delta)/durations[id];
      progress[id]=animate ? T.MathUtils.clamp(progress[id]+Math.sign(end-progress[id])*step,0,1) : end;
      pose(id,progress[id]);
      if (progress[id]===end) active.delete(id);
    }
    return true;
  }
  const messages = {
    notebook:['ノートを閉じました。','ノートを開きました。大隈講堂と唐津城のスケッチが見えます。'],
    lamp:['デスクライトを消しました。','デスクライトをつけました。'],
    drawer:['文具の引き出しを閉じました。','文具の引き出しを開きました。'],
  };
  function trigger(id,animate=true) {
    if (!Object.hasOwn(state,id)) return null;
    state[id]=!state[id]; active.add(id);
    if (!animate) { progress[id]=Number(state[id]); pose(id,progress[id]); active.delete(id); }
    return messages[id][Number(state[id])];
  }
  function anchor(id,out=new T.Vector3()) {
    if (id==='notebook') return journal.root.localToWorld(out.set(BOOK_WIDTH/2,.116,0));
    if (id==='drawer') return drawer.localToWorld(out.set(0,-.056,.869));
    if (id==='lamp') return shade.localToWorld(out.set(0,-.12,.18));
    return null;
  }
  return {pick,trigger,update,anchor, getState:()=>({...state}), isAnimating:()=>active.size>0,
    preserveGroups:[journal.root,journal.hinge,lamp,shade,drawer],
    protectedObjects:[journal.sheet,journal.cover,bulb,drawer.getObjectByName('Stationery drawer pull')]};
}
