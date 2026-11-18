import { deskMincho, finishCanvasType } from './desk-type.js';
import { BOOK_WIDTH, BOOK_DEPTH, drawNotebookAtlas, coverPose, leafPosition } from '../js/notebook-geometry.js';

function journalPrint(T, onTextureLoad) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  drawNotebookAtlas(canvas, deskMincho);
  const texture = new T.CanvasTexture(canvas);
  finishCanvasType(texture, () => drawNotebookAtlas(canvas, deskMincho), onTextureLoad);
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return new T.MeshStandardMaterial({map:texture, roughness:.86});
}

function panelUV(columnFraction, rowFraction, panel) {
  const inset = .004;
  const u = inset + columnFraction * (1 - 2 * inset), v = inset + rowFraction * (1 - 2 * inset);
  return [(panel % 2 + u) / 2, (1 - Math.floor(panel / 2) + v) / 2];
}

export function createDeskJournal(T, root, onTextureLoad) {
  root.userData.deskProp = 'notebook';
  root.position.set(-.86, 2.172, .50);
  root.rotation.y = -.065; root.scale.set(1.20,1.06,1.04);
  const print = journalPrint(T, onTextureLoad);
  const cloth = new T.MeshStandardMaterial({color:'#334734', roughness:.86});
  const paper = new T.MeshStandardMaterial({color:'#ded0ae', roughness:.93});
  const ribbon = new T.MeshStandardMaterial({color:'#903f38', roughness:.79});
  const edge = new T.MeshStandardMaterial({color:'#ae9979', roughness:.97});
  const headband = new T.MeshStandardMaterial({color:'#a99561', roughness:.84});
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
    const geo = new T.ExtrudeGeometry(s, {depth:.014, bevelEnabled:true, bevelSegments:2, bevelThickness:.0035, bevelSize:.0035, curveSegments:4});
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
    box(root,edge,'Folded signature in the fore-edge',BOOK_WIDTH/2,.030+i*.022,.001,BOOK_WIDTH-.024,.0019,BOOK_DEPTH-.026);
  }
  printedFace(root,'Karatsu sketch on the right page',3,BOOK_WIDTH-.04,BOOK_DEPTH-.039,.091);
  const spineShape=new T.CylinderGeometry(1,1,BOOK_DEPTH+.008,14);
  spineShape.rotateX(Math.PI/2);
  const spine=add(root,spineShape,cloth,'Round clothbound spine');
  spine.position.set(.002,.056,0); spine.scale.set(.025,.056,1);
  for (const z of [-1,1]) {
    const cap=add(root,new T.CylinderGeometry(.008,.008,.075,8),headband,'Woven headband');
    cap.position.set(.004,.057,z*(BOOK_DEPTH/2+.003));
    for(let i=0;i<5;i++) box(root,cloth,'Headband stitch',.005,.028+.014*i,z*(BOOK_DEPTH/2+.007),.012,.005,.004);
  }
  const bookmark=box(root,ribbon,'Woven bookmark',.10,.020,BOOK_DEPTH*.50,.040,.007,.118);
  bookmark.rotation.y=.08;
  const hinge = new T.Group(); hinge.name='Journal cover hinge'; root.add(hinge);
  board(hinge,-.006,'Rounded cloth board');
  const cover = printedFace(hinge,'Journal cloth cover',0,BOOK_WIDTH-.016,BOOK_DEPTH-.017,.013);
  box(hinge,paper,'Pasted flyleaf',BOOK_WIDTH/2,-.011,0,BOOK_WIDTH-.040,.002,BOOK_DEPTH-.040);
  // The front and reverse share a sewn edge; across the depth, independently
  // sampled rows curl the loose corner without twisting the opposite corner.
  const divisions=20, rows=5, stride=divisions+1, sideSize=stride*rows;
  function leaf(backing) {
    const geometry=new T.BufferGeometry(), uv=[], indices=[];
    const positions=new T.Float32BufferAttribute(new Float32Array(sideSize*6),3);
    positions.setUsage(T.DynamicDrawUsage);
    for(let side=0;side<2;side++) {
      for(let k=0;k<rows;k++) for(let i=0;i<=divisions;i++) {
        uv.push(...panelUV(side ? 1-i/divisions : i/divisions,1-k/(rows-1),side ? 2 : 1));
      }
      for(let k=0;k<rows-1;k++) for(let i=0;i<divisions;i++) {
        const a=side*sideSize+k*stride+i,b=a+1,d=a+stride,e=d+1;
        indices.push(...(side ? [a,b,d,b,e,d] : [a,d,b,b,d,e]));
      }
    }
    geometry.setAttribute('position',positions);
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    const mesh=add(root,geometry,backing ? paper : print,backing ? 'Loose flyleaf below the sewn spread' : 'Turning illustrated journal sheet');
    mesh.frustumCulled=false;
    const point=[0,0,0];
    function pose(progress) {
      for(let k=0;k<rows;k++) for(let i=0;i<=divisions;i++) {
        leafPosition(progress,i/divisions,k/(rows-1),backing,point);
        for(let side=0;side<2;side++) positions.setXYZ(side*sideSize+k*stride+i,...point);
      }
      positions.needsUpdate=true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
    return {mesh,pose};
  }
  const printed=leaf(false), flyleaf=leaf(true), sheet=printed.mesh;
  function setOpen(fraction) {
    const pose=coverPose(fraction);
    hinge.rotation.z=pose.angle;
    hinge.position.y=pose.height;
    printed.pose(fraction);
    // At rest the two thin leaves touch, exposing only the printed spread.
    flyleaf.mesh.visible=fraction>.435 && fraction<.974;
    if(flyleaf.mesh.visible) flyleaf.pose(fraction);
  }
  setOpen(0);
  return {root, hinge, sheet, flyleaf:flyleaf.mesh, cover, setOpen};
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
    protectedObjects:[journal.sheet,journal.flyleaf,journal.cover,bulb,drawer.getObjectByName('Stationery drawer pull')]};
}
