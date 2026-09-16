import { surface } from './surface-materials.js?v=20260916-atlas2';

/** Joinery and surface wear inspired by the supplied working-room references. */
export function addWorkshopDetails(T, { group, palette }) {
  const root = new T.Group(); root.name = 'Oak and iron window workbench'; group.add(root);
  const iron = new T.MeshStandardMaterial({ color:'#303731', roughness:.62, metalness:.64 });
  const oak = surface(new T.MeshStandardMaterial({color:'#b49670',roughness:.71}),'walnut',{tint:'#d8c7a7',roughness:.66,bumpScale:.007});
  const leather = new T.MeshStandardMaterial({color:'#424b3b',roughness:.89});
  const ceramic = new T.MeshPhysicalMaterial({color:'#b7b2a0',roughness:.33,clearcoat:.42,clearcoatRoughness:.28});
  const boxGeo=new T.BoxGeometry(1,1,1), sphere=new T.SphereGeometry(1,18,12);
  const cylinder=new T.CylinderGeometry(1,1,1,24), yAxis=new T.Vector3(0,1,0);
  const batches = new Map(); const dummy=new T.Object3D();
  function box(w,h,d,x,y,z,material=oak,rotation=0) {
    const key=material.uuid;if(!batches.has(key))batches.set(key,{material,matrices:[]});
    dummy.position.set(x,y,z);dummy.rotation.set(0,rotation,0);dummy.scale.set(w,h,d);dummy.updateMatrix();batches.get(key).matrices.push(dummy.matrix.clone());
  }
  function mesh(geometry,material,parent=root) {const m=new T.Mesh(geometry,material);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  function cyl(r,h,x,y,z,material=iron,parent=root) {const m=mesh(cylinder,material,parent);m.scale.set(r,h,r);m.position.set(x,y,z);return m;}
  function rod(a,b,r,material=iron) {const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av),m=mesh(cylinder,material);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(yAxis,d.normalize());m.scale.set(r,new T.Vector3(...a).distanceTo(new T.Vector3(...b)),r);return m;}
  // Five wide boards, shallow recessed seams and contrasting steel trestles.
  for(let i=0;i<5;i++)box(.476,.14,3.38,-5.316+i*.48,2.02,.70,oak);
  box(2.42,.035,3.40,-4.36,1.936,.70,palette.darkWood);
  for(const z of [-.72,2.16]) {
    for(const x of [-5.34,-3.38])box(.065,1.91,.065,x,.97,z,iron);
    box(2.05,.065,.065,-4.36,1.89,z,iron);
    rod([-5.31,.24,z],[-3.4,1.86,z],.022);rod([-3.4,.24,z],[-5.31,1.86,z],.022);
    for(const x of [-5.34,-3.38])cyl(.067,.035,x,.029,z,palette.darkBrass);
  }
  box(.065,.10,2.91,-5.34,.30,.72,iron);box(.065,.10,2.91,-3.38,.30,.72,iron);
  // A compact two-bay book cabinet with a dark open interior.
  box(1.87,.065,1.04,-4.43,.22,.10,palette.darkWood);
  box(1.87,.065,1.04,-4.43,1.32,.10,oak);
  for(const x of [-5.34,-4.42,-3.51])box(.054,1.11,1.04,x,.765,.10,oak);
  box(1.87,1.11,.045,-4.43,.765,-.40,leather);
  box(1.84,.042,1.0,-4.43,.77,.10,oak);
  const bookMaterials=['#693d33','#6e7456','#b2986c','#34474b','#8a6946'].map(color=>new T.MeshStandardMaterial({color,roughness:.87}));
  for(let i=0;i<12;i++) {
    const x=-5.22+(i%6)*.137+(i>=6?.98:0),h=.30+(i%4)*.048,y=i<6?.285:.803;
    box(.098,h,.70,x,y+h/2,.12,bookMaterials[i%5]);
    box(.088,.014,.008,x,y+.058,.475,palette.brass);
    box(.069,.04,.006,x,y+h*.68,.476,palette.paper);
  }
  // Leather desk mat, off-white sketch leaves and a brass measuring ruler.
  box(1.51,.011,.99,-4.45,2.097,1.27,leather,.04);
  for(let i=0;i<4;i++)box(.80,.004,.72,-4.65+i*.004,2.105+i*.005,1.23,palette.paper,-.12);
  box(.061,.012,.80,-3.96,2.116,1.25,palette.brass,.09);
  for(let i=0;i<16;i++)box(.021,.002,.003,-3.943+i*.004,2.123,.89+i*.044,palette.darkWood,.09);
  // Real ceramic wall thickness and dark tea surface, with a rounded handle.
  const mug=new T.Group();mug.name='Glazed stoneware mug';mug.position.set(-3.79,2.105,.22);root.add(mug);
  const mugShape=[new T.Vector2(.10,0),new T.Vector2(.15,.025),new T.Vector2(.165,.27),new T.Vector2(.149,.284),new T.Vector2(.143,.252),new T.Vector2(.131,.038)];
  mesh(new T.LatheGeometry(mugShape,32),ceramic,mug);
  cyl(.139,.004,0,.242,0,new T.MeshStandardMaterial({color:'#3b2818',roughness:.14}),mug);
  const handle=mesh(new T.TorusGeometry(.087,.025,10,24,Math.PI*1.65),ceramic,mug);handle.position.set(.164,.151,0);handle.rotation.z=-.82;
  // A small magnifying glass and brass compass retain distinct specular highlights.
  const compass=cyl(.135,.031,-4.84,2.132,-.19,palette.brass);
  cyl(.113,.006,-4.84,2.151,-.19,palette.paper);
  rod([-4.90,2.158,-.23],[-4.78,2.158,-.15],.008,palette.burgundy);
  const lens=mesh(new T.TorusGeometry(.111,.012,8,32),palette.brass);lens.rotation.x=Math.PI/2;lens.position.set(-4.14,2.12,1.93);
  rod([-4.04,2.12,1.95],[-3.77,2.12,2.02],.028,palette.darkWood);
  // Bolts have visible slots and slight brass edge wear, all static batches.
  for(const x of [-5.34,-3.38])for(const z of [-.72,2.16]) {
    const bolt=cyl(.026,.012,x,1.84,z-.041,palette.darkBrass);bolt.rotation.x=Math.PI/2;
    box(.023,.005,.003,x,1.84,z-.049,iron);
  }
  for(const {material,matrices} of batches.values()) {
    const batch=new T.InstancedMesh(boxGeo,material,matrices.length);batch.name='Window workbench joinery';batch.castShadow=batch.receiveShadow=true;
    matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.computeBoundingSphere();root.add(batch);
  }
  // Small, physically placed patina decals: ring stains, rub marks and scratches.
  // Deterministic canvas drawing is a material, never a modification of a photo.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
  let seed=271;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  ctx.strokeStyle='rgba(43,30,16,.18)';ctx.lineWidth=2.8;
  for(let ring=0;ring<2;ring++){ctx.beginPath();ctx.ellipse(105+ring*2,180+ring,40,38,.07,.12,5.8);ctx.stroke();}
  for(let i=0;i<110;i++) {ctx.strokeStyle=`rgba(${i%3?'242,219,177':'35,27,20'},${.06+random()*.13})`;ctx.lineWidth=.4+random();const x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+random()*28,y+random()*2);ctx.stroke();}
  const wearMap=new T.CanvasTexture(canvas);wearMap.colorSpace=T.SRGBColorSpace;
  const wearMat=new T.MeshStandardMaterial({map:wearMap,transparent:true,depthWrite:false,roughness:.96,polygonOffset:true,polygonOffsetFactor:-1});
  for(const [x,y,z,w,h,parent] of [[-.05,2.170,.0,5.91,1.51,group],[-4.36,2.094,.70,2.37,3.32,root]]) {
    const wear=mesh(new T.PlaneGeometry(w,h),wearMat,parent);wear.name='Subtle desk patina';wear.castShadow=false;wear.raycast=()=>{};wear.rotation.x=-Math.PI/2;wear.position.set(x,y,z);
  }
  // Reused fine roughness grain on metal and ceramics breaks uniform highlights.
  const roughCanvas=document.createElement('canvas');roughCanvas.width=roughCanvas.height=128;const rctx=roughCanvas.getContext('2d');rctx.fillStyle='#d4d4d4';rctx.fillRect(0,0,128,128);
  for(let i=0;i<2400;i++){const v=165+Math.floor(random()*80);rctx.fillStyle=`rgb(${v},${v},${v})`;rctx.fillRect(random()*128,random()*128,1,1);}
  const roughnessMap=new T.CanvasTexture(roughCanvas);roughnessMap.wrapS=roughnessMap.wrapT=T.RepeatWrapping;iron.roughnessMap=roughnessMap;ceramic.roughnessMap=roughnessMap;
  return root;
}
