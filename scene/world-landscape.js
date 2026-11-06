import { HOME, LANDMARK_SITES, REVIEW_VIEWS, WORLD_BOUNDS } from './world-layout.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats } from './static-batching.js';

/** A continuous, ground-level garden: one metre is one metre indoors and out. */
export function createWorldLandscape(T, { onTextureLoad = () => {} } = {}) {
  const group = new T.Group(); group.name = 'Continuous garden around the warm study';
  const textures = new Set(), geometries = new Set(), materials = new Set(), collisions = [];
  const obstacle = (id, x, z, w, d, h) => collisions.push({id, box: new T.Box3(new T.Vector3(x-w/2,0,z-d/2), new T.Vector3(x+w/2,h,z+d/2))});
  let disposed = false, seed = 51821;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function grain(kind, size = 256) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = kind === 'lawn' ? '#869168' : kind === 'stone' ? '#c3b7a1' : '#75634e';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size / 2; i++) {
      ctx.fillStyle = i % 3 === 0 ? `rgba(245,233,200,${.03 + random() * .1})` : `rgba(42,49,28,${.025 + random() * .12})`;
      const x = random() * size, y = random() * size;
      ctx.fillRect(x, y, kind === 'lawn' ? .7 : 1 + random() * 2, kind === 'lawn' ? 2 + random() * 4 : 1);
    }
    if (kind === 'stone') {
      ctx.strokeStyle = '#a89b84'; ctx.lineWidth = 1.5;
      for (let row = 0; row < 4; row++) {
        const y = row * size / 4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        for (let col = -1; col < 3; col++) { const x = col * size / 2 + (row % 2) * size / 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + size / 4); ctx.stroke(); }
      }
    }
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
    map.wrapS = map.wrapT = T.RepeatWrapping; map.anisotropy = 4; textures.add(map); return map;
  }
  const stoneMap = grain('stone'), grassMap = grain('lawn'), woodMap = grain('wood');
  function mat(name, options) { const m = new T.MeshStandardMaterial(options); m.name = name; materials.add(m); return m; }
  const stone = mat('Warm limestone with laid joints', { color: '#eee8d6', map: stoneMap, bumpMap: stoneMap, bumpScale: .012, roughness: .89 });
  const edging = mat('Pale dressed sandstone edges', { color: '#b8aa8f', roughness: .91 });
  const grass = mat('Muted sage garden lawn', { color: '#c8cfab', map: grassMap, bumpMap: grassMap, bumpScale: .027, roughness: 1 });
  const timber = mat('Oiled walnut garden seating', { color: '#8a6745', map: woodMap, roughness: .68 });
  const iron = mat('Sage cast iron', { color: '#39473b', metalness: .48, roughness: .65 });
  const bark = mat('Weathered tree bark', { color: '#655542', map: woodMap, bumpMap: woodMap, bumpScale: .04, roughness: .96 });
  const leaf = mat('Soft green deciduous canopy', { color: '#657954', map: grassMap, bumpMap: grassMap, bumpScale: .12, roughness: 1 });
  const gravel = mat('Quiet gravel beds', { color: '#adab94', map: stoneMap, roughness: 1 });
  const cube = new T.BoxGeometry(1, 1, 1); geometries.add(cube);
  function box(name, material, x, y, z, w, h, d, cast = true) {
    const mesh = new T.Mesh(cube, material); mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  function plane(name, material, x, z, w, d, y = -.001, span = 4) {
    const geo = new T.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + (uv.getX(i) - .5) * w) / span, (z + (.5 - uv.getY(i)) * d) / span);
    geometries.add(geo); const mesh = new T.Mesh(geo, material); mesh.name = name; mesh.position.set(x, y, z); mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  // This terrain reaches the atmospheric horizon. There is no exposed slab,
  // island edge, ocean, cliff or void below the walking floor.
  plane('Unbroken ground to the horizon', grass, 0, 40, 1800, 1800, -.008, 3.2);
  // Build the union of every stone footprint, rather than stacking coplanar
  // rectangles. Each new convex rectangle is cut by all preceding rectangles;
  // only its uncovered convex pieces survive. All pieces share one world UV
  // field, one elevation and one mesh, including the rotated building aprons.
  const pavingFootprints = [], pavingPieces = [];
  const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const area = polygon => polygon.reduce((sum,p,i) => { const q=polygon[(i+1)%polygon.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0)/2;
  function cleanPolygon(polygon) {
    const result=[];
    for(const p of polygon) if(!result.length || Math.hypot(p[0]-result.at(-1)[0],p[1]-result.at(-1)[1])>1e-8) result.push(p);
    if(result.length>1 && Math.hypot(result[0][0]-result.at(-1)[0],result[0][1]-result.at(-1)[1])<1e-8) result.pop();
    for(let i=result.length-1;i>=0 && result.length>2;i--) {
      const before=result[(i+result.length-1)%result.length],p=result[i],after=result[(i+1)%result.length];
      if(Math.abs(cross(before,p,after))<1e-9) result.splice(i,1);
    }
    return result.length>=3 && Math.abs(area(result))>1e-8 ? result : [];
  }
  function clipHalfPlane(polygon,a,b,inside) {
    const output=[],sign=inside?1:-1;
    for(let i=0;i<polygon.length;i++) {
      const p=polygon[i],q=polygon[(i+1)%polygon.length],pd=sign*cross(a,b,p),qd=sign*cross(a,b,q);
      const pin=pd>=0,qin=qd>=0;
      if(pin) output.push(p);
      if(pin!==qin) { const t=pd/(pd-qd); output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]); }
    }
    return cleanPolygon(output);
  }
  function subtractConvex(polygon,cutter) {
    const outside=[];let remaining=polygon;
    for(let edge=0;edge<cutter.length && remaining.length;edge++) {
      const a=cutter[edge],b=cutter[(edge+1)%cutter.length],piece=clipHalfPlane(remaining,a,b,false);
      if(piece.length) outside.push(piece);
      remaining=clipHalfPlane(remaining,a,b,true);
    }
    return outside;
  }
  function pave(name,x,z,w,d,rotation=0) {
    const c=Math.cos(rotation),s=Math.sin(rotation);
    const polygon=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>[x+dx*c+dz*s,z-dx*s+dz*c]);
    let pieces=[polygon];
    for(const footprint of pavingFootprints) pieces=pieces.flatMap(piece=>subtractConvex(piece,footprint.polygon));
    pavingPieces.push(...pieces);pavingFootprints.push({name,polygon});
  }
  pave('Home entrance apron',HOME.door.x,5.25,3.35,3.8);
  pave('Garden walk from the open doorway',HOME.door.x,11.2,2.6,8.2);
  pave('Central garden promenade',0,49,7.2,70);
  pave('Statue and bank forecourt',4.5,23,33,11);
  pave('Auditorium approach',-14,39,29,9);
  pave('Castle approach',12.5,56,27,10);
  for(const site of LANDMARK_SITES) {
    const size=site.key==='okuma-auditorium'?[37,31]:site.key==='karatsu-castle'?[27,25]:site.key==='karatsu-bank'?[22,18]:[6,6];
    pave(site.title+' flush stone apron',site.position[0],site.position[1],...size,site.rotation);
  }
  const pavingPositions=[],pavingNormals=[],pavingUVs=[];
  for(const polygon of pavingPieces) for(let i=1;i<polygon.length-1;i++) {
    // Counterclockwise XZ polygons need reversed fan winding for +Y normals.
    for(const p of [polygon[0],polygon[i+1],polygon[i]]) {
      pavingPositions.push(p[0],-.001,p[1]);pavingNormals.push(0,1,0);pavingUVs.push(p[0]/3.2,p[1]/3.2);
    }
  }
  const pavingGeometry=new T.BufferGeometry();
  pavingGeometry.setAttribute('position',new T.Float32BufferAttribute(pavingPositions,3));
  pavingGeometry.setAttribute('normal',new T.Float32BufferAttribute(pavingNormals,3));
  pavingGeometry.setAttribute('uv',new T.Float32BufferAttribute(pavingUVs,2));
  pavingGeometry.computeBoundingSphere();geometries.add(pavingGeometry);
  const paving=new T.Mesh(pavingGeometry,stone);paving.name='Continuous limestone paving union';paving.receiveShadow=true;group.add(paving);
  paving.userData.pavingUnion={elevation:-.001,span:3.2,footprints:pavingFootprints,pieces:pavingPieces,area:pavingPieces.reduce((sum,p)=>sum+Math.abs(area(p)),0)};
  // Low planting defines the walk without fencing it into an exhibition island.
  for (const side of [-1, 1]) {
    box('Continuous stone garden edging', edging, side * 4, -.04, 49, .12, .08, 62, false);
    plane('Gravel border', gravel, side * 4.5, 49, .8, 62, -.004, 1.3);
  }
  for (const z of [12, 31, 61, 77]) for (const side of [-1, 1]) {
    const x = side * 5.8;
    obstacle('garden-bench-'+side+'-'+z, x, z+.19, 1.6, .43, .95);
    for (let slat = 0; slat < 5; slat++) box('Garden bench seat slat', timber, x, .46, z + slat * .075, 1.6, .045, .06);
    for (let slat = 0; slat < 3; slat++) box('Garden bench back slat', timber, x, .67 + slat * .105, z + .37, 1.6, .075, .035);
    for (const offset of [-.6, .6]) {
      box('Garden bench leg', iron, x + offset, .23, z + .05, .045, .46, .045);
      box('Garden bench rear support', iron, x + offset, .44, z + .34, .045, .88, .045);
    }
  }
  // A few mature trees establish ordinary human scale and a shaded garden edge.
  const trees = [
    [-6,-3,6.6], [5,-3,6.2], [-9,9,7.6], [10,7,8.2], [-17,17,9.1], [32,11,8.5],
    [-38,19,10.8], [42,35,9.6], [-47,49,11.4], [48,60,10.2], [-27,78,11], [25,91,9.4],
    [-12,100,9], [50,95,10], [-52,91,12], [-45,-12,11], [36,-18,10],
  ];
  const cylinder = new T.CylinderGeometry(1, 1, 1, 9); geometries.add(cylinder);
  const branchRecords = [], crownRecords = [];
  for (const [x, z, height] of trees) {
    obstacle('garden-tree-'+x+'-'+z, x, z, height*.065, height*.065, height*.55);
    branchRecords.push({ a: [x, 0, z], b: [x + .18, height * .73, z + .1], r: height * .025 });
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.399 + random(), reach = height * (.13 + random() * .11), cy = height * (.68 + random() * .22);
      const cx = x + Math.cos(angle) * reach, cz = z + Math.sin(angle) * reach;
      if (i < 5) branchRecords.push({ a: [x + .08, height * .47, z], b: [cx, cy, cz], r: height * .009 });
      crownRecords.push({ p: [cx, cy, cz], s: [height * (.15 + random() * .055), height * (.13 + random() * .05), height * (.14 + random() * .06)] });
    }
  }
  const dummy = new T.Object3D(), up = new T.Vector3(0, 1, 0), a = new T.Vector3(), b = new T.Vector3();
  const trunks = new T.InstancedMesh(cylinder, bark, branchRecords.length); trunks.name = 'Mature garden trunks and visible branching';
  branchRecords.forEach((r, i) => { a.fromArray(r.a); b.fromArray(r.b).sub(a); dummy.position.copy(a).addScaledVector(b, .5); dummy.quaternion.setFromUnitVectors(up, b.clone().normalize()); dummy.scale.set(r.r, b.length(), r.r); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
  trunks.castShadow = trunks.receiveShadow = true; trunks.computeBoundingSphere(); group.add(trunks);
  // Pointed, cupped leaf blades form open, irregular crowns. The silhouettes
  // and filtered shadows come from leaves, not opaque low-poly canopy balls.
  const leafGeometry = new T.BufferGeometry();
  leafGeometry.setAttribute('position', new T.Float32BufferAttribute([
    0,.15,0, 0,0,-1, .72,.025,-.45, 1,0,.14, .55,.035,.72, 0,.08,1, -.55,.035,.72, -1,0,.14, -.72,.025,-.45,
  ],3));
  leafGeometry.setAttribute('uv', new T.Float32BufferAttribute([.5,.5,.5,0,.86,.275,1,.57,.775,.86,.5,1,.225,.86,0,.57,.14,.275],2));
  leafGeometry.setIndex([0,1,2,0,2,3,0,3,4,0,4,5,0,5,6,0,6,7,0,7,8,0,8,1]);
  leafGeometry.computeVertexNormals(); geometries.add(leafGeometry); leaf.side=T.DoubleSide; leaf.bumpScale=.004;
  const leavesPerCluster=140, crowns=new T.InstancedMesh(leafGeometry,leaf,crownRecords.length*leavesPerCluster);
  crowns.name='Individual cupped leaves in naturally open tree crowns';
  const color = new T.Color(); let leafIndex=0;
  for (const r of crownRecords) for(let j=0;j<leavesPerCluster;j++) {
    const angle=random()*Math.PI*2, vertical=random()*2-1, reach=Math.cbrt(random()), horizontal=Math.sqrt(1-vertical*vertical);
    dummy.position.set(r.p[0]+Math.cos(angle)*horizontal*reach*r.s[0],r.p[1]+vertical*reach*r.s[1],r.p[2]+Math.sin(angle)*horizontal*reach*r.s[2]);
    dummy.rotation.set((random()-.5)*1.8,random()*Math.PI*2,(random()-.5)*1.4);
    const size=.10+random()*.055;dummy.scale.set(size*.64,size,size);dummy.updateMatrix();crowns.setMatrixAt(leafIndex,dummy.matrix);
    const v=.77+random()*.42;color.setRGB(v,v,v*.9);crowns.setColorAt(leafIndex++,color);
  }
  crowns.castShadow=crowns.receiveShadow=true;crowns.computeBoundingSphere();group.add(crowns);
  // The soft background ridge is attached to the same terrain, well behind the garden.
  const ridgeMat = mat('Distant sage wooded ridge', { color: '#82927d', roughness: 1 });
  const ridgeGeo = new T.PlaneGeometry(1200, 200, 80, 8); ridgeGeo.rotateX(-Math.PI / 2);
  const rp = ridgeGeo.getAttribute('position');
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), envelope = Math.sin((z + 100) / 200 * Math.PI); rp.setY(i, Math.max(0, envelope) * (17 + Math.sin(x * .018) * 8 + Math.cos(x * .031) * 5)); }
  ridgeGeo.computeVertexNormals(); geometries.add(ridgeGeo); const ridge = new T.Mesh(ridgeGeo, ridgeMat); ridge.name = 'Grounded distant wooded hillside'; ridge.position.z = 220; group.add(ridge);
  mergeStaticDraws(T, group, { byParent: false, skipRoots: new Set([trunks, crowns]) }); cacheStaticLocalMatrices(group);
  group.updateMatrixWorld(true);
  const stats = { ...staticDrawStats(group), externalRequests: 0, textures: textures.size, maxTextureSide: 256, trees: trees.length, groundY: 0, continuousGround: true };
  group.userData.landscapeStats = stats;
  onTextureLoad('garden-procedural-surfaces');
  return { group, stats, collisions, materials: { stone, edging, grass, timber, iron }, cameraPlan: { ...REVIEW_VIEWS.interior, groundY: 0, bounds: WORLD_BOUNDS }, update() {},
    dispose() { if (disposed) return; disposed = true; group.traverse(o => { if (o.geometry) geometries.add(o.geometry); }); geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); },
  };
}
