import {branchCards,createLeafSprays} from './grove-foliage.js';
import {createPlaceSettings} from './place-settings.js';
/** Small, authored outdoor details. All dimensions are in walking metres.
 * The arcade and harbour are imagined settings around the original landmarks.
 * No image, GLB, light, or reflection pass is needed for either district. */
function coloredGeometry(T) {
  const positions = [], colors = [], indices = [], palette = new Map();
  function solid(vertices, faces, hex) {
    if (!palette.has(hex)) palette.set(hex, new T.Color(hex).toArray().map(c => Math.round(c * 255)));
    const first = positions.length / 3;
    for (const vertex of vertices) { positions.push(...vertex); colors.push(...palette.get(hex)); }
    // Orient convex faces away from the part's centroid. This also handles the
    // mirrored stone arch wedges and both sides of the boat correctly.
    const center = vertices.reduce((sum, p) => sum.map((v, i) => v + p[i] / vertices.length), [0, 0, 0]);
    for (const face of faces) {
      const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
      const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
      const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
      const reverse = (uy*vz-uz*vy)*(a[0]-center[0]) + (uz*vx-ux*vz)*(a[1]-center[1]) + (ux*vy-uy*vx)*(a[2]-center[2]) < 0;
      for (let i = 1; i < face.length-1; i++) indices.push(first+face[0], first+face[reverse ? i+1 : i], first+face[reverse ? i : i+1]);
    }
  }
  function rings(bottom, top, hex) {
    const n = bottom.length, ends = bottom.map((_, i) => i);
    solid([...bottom, ...top], [ends, ends.map(i => i+n), ...ends.map(i => [i, (i+1)%n, n+(i+1)%n, n+i])], hex);
  }
  function box(x, y, z, w, h, d, color) {
    const face = height => [[x-w/2,height,z-d/2],[x+w/2,height,z-d/2],[x+w/2,height,z+d/2],[x-w/2,height,z+d/2]];
    rings(face(y-h/2), face(y+h/2), color);
  }
  function beam(from, to, r1, r2, color, sides = 6) {
    const start = new T.Vector3(...from), end = new T.Vector3(...to);
    const axis = new T.Vector3().subVectors(end, start).normalize();
    const tangent = new T.Vector3().crossVectors(axis, Math.abs(axis.y) < .85 ? new T.Vector3(0,1,0) : new T.Vector3(1,0,0)).normalize();
    const bitangent = new T.Vector3().crossVectors(axis, tangent);
    const ring = (p, r) => Array.from({length:sides}, (_, i) => {
      const theta = i * 2 * Math.PI / sides;
      return p.clone().addScaledVector(tangent,r*Math.cos(theta)).addScaledVector(bitangent,r*Math.sin(theta)).toArray();
    });
    rings(ring(start,r1),ring(end,r2),color);
  }
  function finish() {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(new Uint8Array(colors), 3, true));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const normals=geometry.getAttribute('normal');
    geometry.setAttribute('normal',new T.BufferAttribute(Int8Array.from(normals.array,v=>Math.round(v*127)),3,true));
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { solid, rings, box, beam, finish };
}

const HARBOUR = { left: 10.5, right: 44.5, near: 41.6, far: 48.6 };
const BOAT = [17.8, 45.25];
const brick = '#9a5143', granite = '#d4c2a6', limestone = '#e9d8b9', slate = '#495957';

function campusArcade(geometry, obstacle) {
  const x = -15.2, first = 8.3, bay = 3.75, count = 4, length = bay*count + .8;
  const middle = first + bay*count/2, piers = [x-1.20,x+1.20];
  const { box, rings } = geometry;
  // Two real rows of piers and arch rings leave each bay open at eye level.
  for (const px of piers) {
    for (let i = 0; i <= count; i++) {
      const z = first+i*bay;
      box(px,1.12,z,.57,2.24,.58,brick);
      box(px,.14,z,.73,.28,.74,granite);
      box(px,.35,z,.65,.12,.66,limestone);
      for (const h of [1.13,1.23,2.1]) box(px,h,z,.62,.065,.62,granite);
      box(px,2.27,z,.71,.17,.73,limestone);
      obstacle('campus-arcade-pier-'+px+'-'+i, px, z, .74,.74,2.4);
    }
    for (let i = 0; i < count; i++) {
      const z = first+(i+.5)*bay, radius = (bay-.58)/2;
      const edges = 13;
      for (let j = 0; j < edges; j++) {
        const corner = (ang, r) => [2.30+Math.sin(ang)*r, z+Math.cos(ang)*r];
        const a = j/edges*Math.PI, b = (j+1)/edges*Math.PI;
        const r2 = radius + (j===6 ? .30 : .23);
        const outline = [corner(a,radius),corner(b,radius),corner(b,r2),corner(a,r2)];
        const half = j===6 ? .37 : .32;
        rings(outline.map(([y,z])=>[px-half,y,z]),outline.map(([y,z])=>[px+half,y,z]),j%3===0 ? granite : limestone);
      }
      if (i%2===0 && px===piers[1]) {
        const flagX = px+.39, flagZ = z+bay/2;
        box(flagX,2.31,flagZ,.075,.085,.76,'#a58b58');
        const shape=[[2.26,flagZ-.29],[2.26,flagZ+.29],[1.55,flagZ+.29],[1.35,flagZ],[1.55,flagZ-.29]];
        rings(shape.map(([y,z])=>[flagX-.035,y,z]),shape.map(([y,z])=>[flagX+.035,y,z]),'#822d42');
        box(flagX+.038,2.09,flagZ,.014,.035,.55,'#e1bb7b');
      }
    }
    box(px,4.11,middle,.75,.24,length,brick);
    box(px,4.26,middle,.81,.095,length+.12,granite);
  }
  const end = z => [[x-1.8,4.26,z],[x,4.93,z],[x+1.8,4.26,z]];
  rings(end(middle-length/2-.16),end(middle+length/2+.16),slate);
  box(x,4.94,middle,.16,.08,length+.52,'#667871');
  for (const px of piers) box(px,4.05,middle,.78,.045,length+.07,'#ead4ac');
}

function harbourQuay(geometry, obstacle) {
  const { left, right, near, far } = HARBOUR, { box, beam }=geometry;
  const stoneColors=['#c4b79c','#d3c6ad','#b6a990','#cdbfa3'];
  function edge(ax,az,bx,bz) {
    const distance = Math.hypot(bx-ax,bz-az), pieces=Math.ceil(distance/1.6), length=distance/pieces;
    for(let i=0;i<pieces;i++) {
      const t=(i+.5)/pieces;
      box(ax+(bx-ax)*t,.115,az+(bz-az)*t,ax===bx?.44:length-.025,.23,az===bz?.44:length-.025,stoneColors[i%4]);
    }
  }
  edge(left,near,right,near); edge(left,far,right,far); edge(left,near,left,far); edge(right,near,right,far);
  obstacle('karatsu-waterfront-basin', (left+right)/2,(near+far)/2,right-left+.44,far-near+.44,.23);
  for(const z of [near-.57,far+.57]) {
    let last;
    for(const x of [left+.6,left+5.4,left+10.2,left+15,left+19.8,left+24.6,left+29.4,right-.6]) {
      box(x,.325,z,.20,.65,.20,'#455851');box(x,.64,z,.24,.065,.24,'#a39470');
      obstacle('harbour-bollard-'+x+'-'+z,x,z,.24,.24,.68);
      if(last!==undefined) {
        const sag=[(last+x)/2,.40,z];
        beam([last,.59,z],sag,.026,.025,'#96856c',5);beam(sag,[x,.59,z],.025,.026,'#96856c',5);
      }
      last=x;
    }
    // The low ropes follow the continuous quay and enclose the water.
    obstacle('harbour-rope-'+z,(left+right)/2,z,right-left-1.2,.12,.65);
  }
}

function sailingBoat(geometry) {
  const {rings,beam,box}=geometry;
  const rim=[[-1.72,0],[-1.24,-.50],[-.28,-.68],[.86,-.52],[1.65,-.18],[1.93,0],[1.22,.42],[.15,.64],[-1.15,.52]];
  const hull=(polygon,y,s)=>polygon.map(([x,z])=>[x*s,y,z*s]);
  rings(hull(rim,-.07,.63),hull(rim,.34,1),'#203e50');
  rings(hull(rim,.34,1),hull(rim,.40,.99),'#b97849');
  rings(hull(rim,.405,.91),hull(rim,.415,.91),'#ac8961');
  for (const x of [-.81,.46]) box(x,.47,0,.18,.085,1,'#dfbc85');
  beam([-.30,.41,0],[-.33,3.57,.045],.053,.031,'#80604b');
  beam([-.30,.72,0],[1.45,.83,-.10],.042,.032,'#735741');
  // A slight belly along the middle seam makes the canvas legible edge-on.
  function sail(corners, middle, shades) {
    corners.forEach((a,i)=>{
      const triangle=[a,corners[(i+1)%corners.length],middle];
      rings(triangle,triangle.map(([x,y,z])=>[x,y,z+.018]),shades[i%shades.length]);
    });
  }
  sail([[-.24,.84,0],[1.38,.92,-.08],[-.25,3.41,.04]], [.10,1.55,-.22], ['#f3e3bb','#ead7aa','#faefd1']);
  sail([[-.45,2.98,.04],[-1.51,.74,.08],[-.48,.92,.03]],[-.78,1.59,.20],['#bd6250','#c9775d','#dd8c6b']);
  beam([-.33,3.54,.045],[-1.65,.38,0],.011,.011,'#b69f80',4);
}

function treeGeometry(T, pine) {
  const geometry=coloredGeometry(T), canopy=branchCards(T), {beam}=geometry;
  let seed = pine ? 205 : 937;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  const trunk=pine?'#685346':'#726557';
  const joints=pine?[[0,0,0],[-.28,1.05,.12],[.03,2.1,.19],[.52,2.95,.12],[.73,3.83,-.1],[1.03,4.52,-.04]]:[[0,0,0],[.05,1.6,0],[-.1,2.7,.1],[.05,3.8,.12],[-.04,5.1,.14],[.10,6.0,.05]];
  for(let i=1;i<joints.length;i++)beam(joints[i-1],joints[i],.23-(i-1)*.035,.23-i*.035,trunk,8);
  const branches=pine?8:13;
  for(let i=0;i<branches;i++){
    const frac=i/(branches-1), ang=i*2.40 + random()*.48;
    const radius=(pine?2.15:2.02)*(1-frac*.76)*(.86+random()*.26);
    const root=joints[1+Math.min(3,Math.floor(frac*4))];
    const cx=root[0]+Math.cos(ang)*radius,cz=root[2]+Math.sin(ang)*radius;
    const cy=(pine?1.75:2.18)+frac*(pine?2.77:3.91);
    const bend=[(root[0]+cx)/2,cy-(pine?.62:.76),(root[2]+cz)/2];
    beam(root,bend,.105,.073,trunk);beam(bend,[cx,cy,cz],.073,.034,trunk);
    const sprays=pine?20:24;
    for(let j=0;j<sprays;j++) {
      const azimuth=j*2.399+ang+random()*.53;
      const u=random(),reach=(pine?1.36:1.16)*Math.sqrt(u)*(1-frac*.28);
      const lx=cx+Math.cos(azimuth)*reach,lz=cz+Math.sin(azimuth)*reach;
      const ly=cy+(pine?.35:.85)*(1-u)+(random()-.5)*(pine?.28:.64);
      const size=(pine?.94:1.02)*(.78+random()*.58);
      const tilt=pine?.26+random()*.70:.58+random()*.82;
      if(j%5===0)beam([cx,cy-.14,cz],[lx,ly,lz],.031,.011,trunk,4);
      canopy.add(lx,ly,lz,size*(pine?.94:.92),size,azimuth,tilt);
    }
  }
  return {wood:geometry.finish(),leaves:canopy.finish()};
}

function makeWater(T) {
  const size=128, bytes=new Uint8Array(size*size*4);
  // Exactly periodic edge coordinates let the painted glints slide on one
  // shared texture without blending transparent geometry or capturing the sky.
  for(let j=0;j<size;j++) for(let i=0;i<size;i++) {
    const u=i/size*Math.PI*2,v=j/size*Math.PI*2;
    const crest=Math.sin(v*7+Math.sin(u*2+.46*Math.sin(v))*1.2+.45*Math.sin(u*5+v*2));
    const glint=Math.pow(Math.max(0,crest),12)*(.52+.48*Math.sin(u*3-v));
    const depth=.5+.5*Math.sin(v*2+Math.sin(u));
    const off=(j*size+i)*4;
    bytes.set([39+depth*11+glint*117,113+depth*11+glint*80,143+depth*15+glint*59,255],off);
  }
  const texture=new T.DataTexture(bytes,size,size);texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(6,1.3);
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createWalkDistricts(T, {obstacle, materials, geometries, textures}) {
  const root=new T.Group();root.name='Campus arcade and Karatsu waterfront';
  const material=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.87});
  material.name='Campus masonry, foliage and painted wood';materials.add(material);
  function add(mesh){geometries.add(mesh.geometry);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;}
  const architecture=coloredGeometry(T);
  campusArcade(architecture,obstacle);harbourQuay(architecture,obstacle);
  add(new T.Mesh(architecture.finish(),material)).name='Open campus arcade and mooring quay';
  const settings=createPlaceSettings(T,{root,obstacle,materials,geometries,textures,makeGeometry:coloredGeometry});
  const transform=new T.Object3D();
  let trees=0;
  function grove(name,pine,sites) {
    trees+=sites.length;
    const geo=treeGeometry(T,pine),foliage=createLeafSprays(T,pine);
    materials.add(foliage.material);textures.add(foliage.texture);
    const instances=add(new T.InstancedMesh(geo.wood,material,sites.length));instances.name=name;
    const leaves=add(new T.InstancedMesh(geo.leaves,foliage.material,sites.length));leaves.name=name+' · foliage';
    sites.forEach(([x,z,scale,angle,elevation=0],i)=>{
      transform.position.set(x,elevation,z);transform.rotation.y=angle;transform.scale.setScalar(scale);transform.updateMatrix();
      instances.setMatrixAt(i,transform.matrix);leaves.setMatrixAt(i,transform.matrix);obstacle(name+'-'+i,x,z,.46*scale,.46*scale,2);
    });
    instances.computeBoundingSphere();leaves.computeBoundingSphere();
  }
  grove('Ginkgo trees on the campus walk',false,[[-7.4,13,1.11,.1],[-8.6,18.4,1.23,2.1],[-9.7,26.1,1.17,.7],[-7.0,31.3,1.24,4.1],[-13,74,1.28,1.1],[-19,79,1.2,2.8],[-12.2,11.0,1.28,2.7],[-2.55,21.8,1.26,.6],[-5.7,27.0,1.19,3.2],[-14.8,26.15,1.34,1.5]]);
  grove('Windswept coastal pines',true,[[7.7,10.5,.99,2.2],[8.0,16.0,1.07,1.3],[8.8,38.9,1.28,.5],[11.8,49.8,1.08,2.2],[31.4,50,1.25,1.1],[38.5,49.8,1.19,3.65],[43,54,1.18,1.4],[17.0,86.2,1.3,3.1],
    ...[.18,.50,.92,1.48,1.88,2.39,2.90,3.37,3.90,4.42,4.91,5.45,5.92].map((angle,i)=>{
      const [x,z,elevation]=settings.hillPine(angle,.84+(i%3)*.035);
      return [x,z,.71+(i%4)*.075,angle+.55,elevation];
    })]);
  const {left,right,near,far}=HARBOUR;
  const waterMap=makeWater(T);textures.add(waterMap);
  const waterMaterial=new T.MeshStandardMaterial({map:waterMap,roughness:.43,metalness:.10});
  waterMaterial.name='Ripples on the Karatsu waterfront';materials.add(waterMaterial);
  const waterGeometry=new T.PlaneGeometry(right-left,far-near);waterGeometry.rotateX(-Math.PI/2);
  const water=add(new T.Mesh(waterGeometry,waterMaterial));water.name='Sheltered water';water.castShadow=false;water.position.set((left+right)/2,.006,(near+far)/2);
  const skiff=coloredGeometry(T);sailingBoat(skiff);
  const boat=add(new T.Mesh(skiff.finish(),material));boat.name='Moored wooden sailing skiff';
  boat.castShadow=false;boat.position.set(BOAT[0],.018,BOAT[1]);boat.rotation.y=-.56;
  let clock=0,pending=0;
  function wantsMotion(position) {
    return !!position && root.visible && (position.x-BOAT[0])**2+(position.z-BOAT[1])**2<=34*34;
  }
  function update(delta,enabled,position) {
    if (!enabled || !wantsMotion(position)) return false;
    pending+=Math.min(.15,Math.max(0,delta||0));
    if(pending<1/12) return false;
    clock+=pending;pending=0;
    waterMap.offset.set((clock*.013)%1,(clock*.022)%1);
    boat.rotation.z=Math.sin(clock*.87)*.018;boat.rotation.x=Math.sin(clock*.56+.68)*.026;
    boat.position.y=.022+Math.sin(clock*.87)*.021;
    return true;
  }
  return {root,boat,trees,update,wantsMotion};
}
