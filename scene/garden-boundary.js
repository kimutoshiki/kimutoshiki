import { surface } from './surface-materials.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats } from './static-batching.js';

export const GARDEN_BOUNDARY_BOUNDS = Object.freeze({minX:-48,maxX:48,minZ:-8,maxZ:90});
export const GARDEN_LAMP_POSITIONS = Object.freeze([[2.4,7.2],[-4.4,18],[4.4,31],[-4.4,45],[4.4,61],[-4.4,78]].map(p=>Object.freeze(p)));

/** A grounded garden enclosure inspired by the Former Karatsu Bank's brick
 * and pale masonry, with shallow decorative arch reliefs, never false exits.
 * World coordinates are metres. Surface images are owned by the caller's
 * loadSurfaceMaterials pass; this module makes no external requests.
 */
export function createGardenBoundary(T,{bounds=GARDEN_BOUNDARY_BOUNDS}={}) {
  const group=new T.Group();group.name='Red brick garden walls and warm promenade lamps';
  const walls=new T.Group();walls.name='Tatsuno-inspired brick and granite enclosure';group.add(walls);
  const lamps=[],collisions=[],materials=new Set(),geometries=new Set(),textures=new Set();
  let disposed=false,nightFactor=0;
  const material=(name,options)=>{const m=new T.MeshStandardMaterial(options);m.name=name;materials.add(m);return m;};
  const brick=surface(material('Garden red brick',{color:'#a65e46',roughness:.88}),'brick',{tint:'#e5b5a0',roughness:.88,bumpScale:.004});
  const darkBrick=surface(material('Garden recessed red brick',{color:'#754632',roughness:.9}),'brick',{tint:'#b68b78',roughness:.9,bumpScale:.004});
  const granite=surface(material('Garden pale granite dressings',{color:'#d7d4c6',roughness:.83}),'stone',{tint:'#eeeee4',roughness:.83,bumpScale:.002});
  const shadedStone=surface(material('Garden granite base shadow',{color:'#aaa99c',roughness:.9}),'stone',{tint:'#c5c6bb',roughness:.9,bumpScale:.003});
  const bronze=material('Dark bronze lamp fittings',{color:'#4e4936',roughness:.44,metalness:.68});
  const iron=material('Painted charcoal garden iron',{color:'#293a35',roughness:.57,metalness:.52});
  const glass=material('Warm opal lantern glass',{color:'#d7d1b4',emissive:'#ffd29a',emissiveIntensity:0,roughness:.42});
  const bulb=material('Visible lantern flame-shaped bulb',{color:'#fff1d1',emissive:'#ffe0af',emissiveIntensity:0,roughness:.3});
  const cube=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,12),sphere=new T.SphereGeometry(1,10,6);
  geometries.add(cube);geometries.add(cylinder);geometries.add(sphere);
  const brickBoxes=new Map(),stoneBoxes=new Map();
  // The existing 512px brick image contains ~2.1 bricks across and nine courses.
  // A .46 × .72m UV tile yields approximately .22 × .07m individual bricks.
  function masonryBox(w,h,d,isBrick) {
    const cache=isBrick?brickBoxes:stoneBoxes,key=[w,h,d].join(',');if(cache.has(key))return cache.get(key);
    const geometry=new T.BoxGeometry(w,h,d),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    const spanX=isBrick?.46:1.6,spanY=isBrick?.72:1.6;
    for(let i=0;i<uv.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));
      uv.setXY(i,(nx>.5?p.getZ(i):p.getX(i))/spanX,(ny>.5?p.getZ(i):p.getY(i))/spanY);
    }
    uv.needsUpdate=true;geometry.userData.surfaceUVPrepared=true;cache.set(key,geometry);geometries.add(geometry);return geometry;
  }
  function mesh(geometry,mat,position,parent=walls,name='') {
    const m=new T.Mesh(geometry,mat);m.name=name;m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  }
  function box(name,size,position,mat=brick,parent=walls) {
    const masonry=[brick,darkBrick,granite,shadedStone].includes(mat);
    const m=mesh(masonry?masonryBox(...size,mat===brick||mat===darkBrick):cube,mat,position,parent,name);
    if(!masonry)m.scale.set(...size);return m;
  }
  function cyl(name,radius,height,position,mat=iron,parent=group){const m=mesh(cylinder,mat,position,parent,name);m.scale.set(radius,height,radius);return m;}
  function ball(name,size,position,mat,parent){const m=mesh(sphere,mat,position,parent,name);m.scale.set(...size);return m;}
  const collision=(id,min,max)=>collisions.push({id,box:new T.Box3(new T.Vector3(...min),new T.Vector3(...max))});
  const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
  if(width<20||depth<20)throw new RangeError('Garden enclosure needs at least 20 metres on each side');
  const centerX=(bounds.minX+bounds.maxX)/2,centerZ=(bounds.minZ+bounds.maxZ)/2,thickness=.5;
  const wallSpecs=[
    {id:'south',length:width,x:centerX,z:bounds.minZ+.25,rotation:0},
    {id:'north',length:width,x:centerX,z:bounds.maxZ-.25,rotation:Math.PI},
    {id:'west',length:depth-1,x:bounds.minX+.25,z:centerZ,rotation:Math.PI/2},
    {id:'east',length:depth-1,x:bounds.maxX-.25,z:centerZ,rotation:-Math.PI/2},
  ];
  // A short segmental arch is a surface moulding high on solid brick, with no
  // vertical doorway sides, black opening or implied route through the wall.
  const archShape=new T.Shape(),r=1.36,t=.075,start=Math.PI*.28,end=Math.PI*.72;
  archShape.absarc(0,0,r+t,start,end,false);archShape.lineTo(Math.cos(end)*r,Math.sin(end)*r);
  archShape.absarc(0,0,r,end,start,true);archShape.closePath();
  const archGeo=new T.ExtrudeGeometry(archShape,{depth:.055,steps:1,bevelEnabled:false,curveSegments:16});
  archGeo.userData.surfaceUVPrepared=true;geometries.add(archGeo);
  let pierCount=0,reliefCount=0;
  for(const spec of wallSpecs) {
    const wall=new T.Group();wall.name='Garden '+spec.id+' boundary';wall.position.set(spec.x,0,spec.z);wall.rotation.y=spec.rotation;walls.add(wall);
    box('Solid brick boundary wall',[spec.length,2.72,thickness],[0,1.36,0],brick,wall);
    box('Grounded granite foundation course',[spec.length,.30,.56],[0,.15,0],shadedStone,wall);
    box('Foundation bevel course',[spec.length,.065,.59],[0,.3325,0],granite,wall);
    for(const y of [.92,1.84])box('Pale horizontal granite band',[spec.length,.085,.55],[0,y,0],granite,wall);
    box('Granite cornice shadow',[spec.length,.055,.55],[0,2.6525,0],shadedStone,wall);
    box('Granite cornice',[spec.length,.08,.61],[0,2.72,0],granite,wall);
    box('Weathering granite coping',[spec.length,.09,.66],[0,2.805,0],granite,wall);
    box('Fine coping upper lip',[spec.length,.025,.60],[0,2.8625,0],shadedStone,wall);
    wall.updateWorldMatrix(true,false);
    const body=new T.Box3().setFromCenterAndSize(new T.Vector3(0,1.36,0),new T.Vector3(spec.length,2.72,.56)).applyMatrix4(wall.matrixWorld);
    collisions.push({id:'garden-boundary-'+spec.id,box:body});
    const bays=Math.ceil(spec.length/6),step=(spec.length-.8)/bays;
    for(let i=0;i<=bays;i++) {
      const x=-spec.length/2+.4+i*step;
      box('Alternating brick pilaster',[.66,2.86,.70],[x,1.43,0],i%2?brick:darkBrick,wall);
      box('Pilaster granite ground plinth',[.80,.32,.80],[x,.16,0],shadedStone,wall);
      for(const y of [.39,.92,1.84,2.60])box('Pilaster pale granite collar',[.73,.11,.76],[x,y,0],granite,wall);
      box('Pilaster granite capital',[.81,.105,.82],[x,2.8575,0],granite,wall);
      box('Pilaster weathered cap',[.88,.075,.87],[x,2.9475,0],shadedStone,wall);
      box('Pilaster fine cap',[.78,.045,.77],[x,3.0075,0],granite,wall);
      const pierBox=new T.Box3(new T.Vector3(x-.40,0,-.40),new T.Vector3(x+.40,2.86,.40)).applyMatrix4(wall.matrixWorld);
      collisions.push({id:'garden-boundary-'+spec.id+'-pier-'+i,box:pierBox});pierCount++;
      if(i<bays&&i%2===0){
        const mx=x+step/2;
        mesh(archGeo,granite,[mx,1.12,.273],wall,'Shallow segmental granite arch relief');
        box('Arch relief keystone',[.14,.19,.085],[mx,2.56,.315],granite,wall);
        box('Arch relief left springing',[.20,.08,.075],[mx-.89,2.18,.30],granite,wall);
        box('Arch relief right springing',[.20,.08,.075],[mx+.89,2.18,.30],granite,wall);
        reliefCount++;
      }
    }
  }
  // One modest radial texture supports soft ground pools without extra shadow
  // passes. It is a warm overlay on actual paving, not an emissive white disc.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,221,164,.65)');gradient.addColorStop(.32,'rgba(255,213,145,.32)');gradient.addColorStop(1,'rgba(255,213,145,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const poolTexture=new T.CanvasTexture(canvas);poolTexture.colorSpace=T.SRGBColorSpace;textures.add(poolTexture);
  const poolMaterial=new T.MeshBasicMaterial({map:poolTexture,transparent:true,opacity:0,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1});materials.add(poolMaterial);
  const poolGeometry=new T.PlaneGeometry(9.6,9.6);poolGeometry.rotateX(-Math.PI/2);geometries.add(poolGeometry);
  const roofGeometry=new T.ConeGeometry(.34,.25,4);roofGeometry.rotateY(Math.PI/4);geometries.add(roofGeometry);
  for(const [index,[x,z]] of GARDEN_LAMP_POSITIONS.entries()) {
    const lamp=new T.Group();lamp.name='Warm garden lantern '+(index+1);lamp.position.set(x,0,z);group.add(lamp);
    box('Grounded granite lantern footing',[.44,.12,.44],[0,.06,0],granite,lamp);
    cyl('Cast iron lantern plinth',.17,.22,[0,.23,0],iron,lamp);
    cyl('Tapered lower lantern collar',.105,.32,[0,.49,0],bronze,lamp);
    cyl('Slender iron lantern post',.045,2.08,[0,1.56,0],iron,lamp);
    for(const y of [.67,2.43,2.53])cyl('Turned bronze lantern collar',.064,.045,[0,y,0],bronze,lamp);
    box('Lantern base tray',[.40,.045,.40],[0,2.59,0],bronze,lamp);
    // Four opal panes with real framing. Light remains warm and legible in day.
    for(const side of [-1,1]) {
      box('Opal lantern glass',[.30,.40,.008],[0,2.82,side*.154],glass,lamp);
      box('Opal lantern glass',[.008,.40,.30],[side*.154,2.82,0],glass,lamp);
      for(const other of [-1,1])box('Lantern iron corner upright',[.023,.45,.023],[side*.166,2.82,other*.166],iron,lamp);
    }
    const emitter=ball('Warm visible lantern bulb',[.046,.105,.046],[0,2.80,0],bulb,lamp);emitter.castShadow=false;
    box('Lantern roof eave',[.43,.035,.43],[0,3.055,0],bronze,lamp);
    mesh(roofGeometry,iron,[0,3.195,0],lamp,'Four-sided bronze lantern roof');
    ball('Lantern roof finial',[.035,.055,.035],[0,3.36,0],bronze,lamp);
    const light=new T.PointLight('#ffd8a4',0,16,2);light.name='Bounded warm path light '+(index+1);light.position.set(0,2.84,0);light.castShadow=false;lamp.add(light);
    const pool=mesh(poolGeometry,poolMaterial,[x,.0015,z],group,'Soft warm ground light pool');pool.castShadow=pool.receiveShadow=false;pool.visible=false;pool.raycast=()=>{};
    const record={id:'garden-lamp-'+index,group:lamp,light,pool,position:[x,0,z],height:3.415,maxIntensity:34,range:16};lamps.push(record);
    collision(record.id,[x-.22,0,z-.22],[x+.22,3.415,z+.22]);
  }
  const protectedObjects=new Set(lamps.flatMap(lamp=>[lamp.pool]));
  const report=mergeStaticDraws(T,group,{byParent:false,protectedObjects,preserveGroups:new Set(lamps.map(lamp=>lamp.group))});
  cacheStaticLocalMatrices(group,{movable:new Set([group])});
  const metadata={units:'metres',bounds:{...bounds},groundY:0,wallThickness:thickness,wallHeight:2.875,pilasterHeight:3.03,pierCount,reliefCount,
    brickTileMetres:[.46,.72],approximateBrickMetres:[.22,.07],style:'Red brick with pale granite bands and shallow segmental arch reliefs',falsePortals:0,
    pointLightCount:lamps.length,shadowCastingPointLights:0,lampPositions:lamps.map(l=>l.position),maxLightDistance:16,
    performance:{...staticDrawStats(group),mergedBatches:report.mergedBatches},externalRequests:0};
  group.userData.gardenBoundary=metadata;
  function setNightFactor(value) {
    if(disposed)return;
    nightFactor=Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
    const lightFactor=nightFactor*nightFactor*(3-2*nightFactor);
    glass.emissiveIntensity=.025+lightFactor*1.25;bulb.emissiveIntensity=.04+lightFactor*2.4;
    poolMaterial.opacity=lightFactor*.14;
    // Zero-intensity lights still add work to Three.js material shaders.
    // Remove the six daylight-off lamps from the active light list entirely.
    for(const lamp of lamps){lamp.light.intensity=lamp.maxIntensity*lightFactor;lamp.light.visible=lightFactor>0;lamp.pool.visible=lightFactor>.005;}
  }
  setNightFactor(0);
  return {group,collisions,lamps,metadata,setNightFactor,
    updateLighting({night=0}={}){setNightFactor(night);},
    get nightFactor(){return nightFactor;},
    dispose(){if(disposed)return;disposed=true;group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());},
  };
}
