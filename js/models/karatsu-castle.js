/**
 * Karatsu Castle — an original, compact architectural miniature.
 * Coordinates: Y up, front +Z. All geometry is created locally with the supplied
 * Three.js namespace. No textures, external assets, lights, or scene state.
 *
 * Exterior references (photographs, not reused as textures):
 * https://karatsujo.com/  (top-about1.jpg)
 * https://www.city.karatsu.lg.jp/page/4527.html
 * https://www.city.karatsu.lg.jp/page/1041.html
 * This represents the present 1966 keep, with interpreted proportions and a
 * deliberately compressed landscape; it is not a measured conservation model.
 */
export function createKaratsuCastle(T) {
  const group = new T.Group();
  group.name = 'Karatsu Castle · architectural miniature';
  const architecture = new T.Group();
  architecture.name = 'Five-tier keep';
  const landscape = new T.Group();
  landscape.name = 'Stone terraces and coastal garden';
  group.add(landscape, architecture);

  const material = (color, roughness = 0.87) => new T.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const m = {
    plaster: material('#eee9da'), plasterLight: material('#faf5e7'),
    plasterShade: material('#d7d6c8'), roof: material('#363e40'),
    tile: material('#505b5a'), tileLight: material('#64706c'),
    roofEdge: material('#89918a'), timber: material('#5b5148'),
    dark: material('#242e2e'), window: material('#354543', 0.6),
    balcony: material('#a3503f'), balconyCap: material('#713f35'),
    gravel: material('#c8bea4'), path: material('#ddd0b5'),
    earth: material('#64665b'), soil: material('#828272'),
    lawn: material('#8a9770'), moss: material('#657956'),
    stone: ['#9a9d8c', '#a9aa96', '#828d81', '#b3b29c', '#8c9588', '#737e76'].map(c => material(c)),
    leaves: ['#4e6b49', '#668254', '#79925e', '#394f3a', '#8c9c65'].map(c => material(c)),
    trunk: material('#6a6551'), water: material('#6b9d9d', 0.44),
    shallow: material('#99b9ad', 0.65), foam: material('#cbd8c7'),
  };
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new T.CylinderGeometry(1, 1, 1, 4, 1, true);
  const foliageGeometry = new T.IcosahedronGeometry(1, 1);
  const rockGeometry = new T.IcosahedronGeometry(1, 0);
  const unitY = new T.Vector3(0, 1, 0);
  const ribbonMaterials = new Map();
  let seed = 216608;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const mix = (a, b, t) => a + (b - a) * t;

  function mesh(geometry, mat, parent = architecture) {
    const object = new T.Mesh(geometry, mat);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(w, h, d, x, y, z, mat, parent = architecture) {
    const object = mesh(boxGeometry, mat, parent);
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    return object;
  }
  function beam(a, b, radius, mat, parent = architecture) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b);
    const delta = end.clone().sub(start);
    if (delta.lengthSq() < 0.000001) return null;
    const object = mesh(cylinderGeometry, mat, parent);
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(unitY, delta.clone().normalize());
    object.scale.set(radius, delta.length(), radius);
    return object;
  }
  function geometry(vertices, indices) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(vertices.flat(), 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }
  function ribbon(points, thickness, mat, parent = architecture) {
    const vertices = [], indices = [];
    points.forEach(p => vertices.push([p[0], p[1], p[2]], [p[0], p[1] - thickness, p[2]]));
    for (let i = 0; i < points.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    if (!ribbonMaterials.has(mat)) {
      const twoSided = mat.clone();
      twoSided.side = T.DoubleSide;
      ribbonMaterials.set(mat, twoSided);
    }
    const matCopy = ribbonMaterials.get(mat);
    return mesh(geometry(vertices, indices), matCopy, parent);
  }
  function slab(outline, bottom, top, mat, parent = landscape, lowerScale = 1) {
    const vertices = outline.map(([x, z]) => [x * lowerScale, bottom, z * lowerScale]);
    vertices.push(...outline.map(([x, z]) => [x, top, z]));
    const n = outline.length, indices = [];
    for (let i = 1; i < n - 1; i++) indices.push(n, n + i + 1, n + i);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(i, n + i, j, j, n + i, n + j);
    }
    return mesh(geometry(vertices, indices), mat, parent);
  }

  // A shallow cutaway island with a small seaward edge, kept within 44 × 34.
  const island = [[-21,-10],[-17,-15],[-5,-17],[10,-16],[19,-11],[22,-1],[20,10],[13,16],[-3,17],[-17,13],[-22,4]];
  slab(island, -1.8, -0.2, m.earth);
  slab(island.map(([x,z]) => [x * 0.986,z * 0.986]), -0.22, 0.42, m.soil);
  const land = [[-20,-9],[-16,-14],[-5,-15.5],[8,-14.5],[14,-10],[15,0],[18,8],[12,15],[-3,16],[-16,12],[-21,3]];
  slab(land, 0.40, 0.88, m.lawn);
  slab([[13,-12],[18,-10],[21,-1],[19,9],[17,9],[14,0],[12,-6]], 0.42, 0.48, m.water);
  slab([[12,-9],[14,-10],[16,-1],[18,8],[16,8],[13,0],[11,-5]], 0.44, 0.50, m.shallow);
  for (let i = 0; i < 14; i++) {
    const z = -9 + i * 1.3;
    const x = 14.1 + Math.max(0, z) * 0.30 + random() * 0.4;
    const r = mesh(rockGeometry, m.stone[i % m.stone.length], landscape);
    r.position.set(x, 0.75, z);
    r.scale.set(0.48 + random() * 0.5, 0.33 + random() * 0.5, 0.4 + random() * 0.7);
    r.rotation.set(random(), random(), random());
  }
  for (let i = 0; i < 5; i++) {
    box(1.6 + random() * 0.8, 0.014, 0.065, 17.8 + (i % 2) * 0.45, 0.52, -7 + i * 2.5, m.foam, landscape);
  }

  // Retaining terrace: slightly asymmetric, with a low pale gravel court.
  const terrace = [[-15.5,-10.6],[10.8,-10.6],[12.7,-7.3],[12.7,8.8],[7.8,12.8],[-10.9,12.8],[-15.5,8.3]];
  slab(terrace, 0.68, 1.75, m.stone[2]);
  slab(terrace.map(([x,z]) => [x * 0.996,z * 0.996]), 1.75, 1.87, m.gravel);
  for (let side = 0; side < terrace.length; side++) {
    const a = terrace[side], b = terrace[(side + 1) % terrace.length];
    const dx = b[0]-a[0], dz = b[1]-a[1], length = Math.hypot(dx,dz);
    const count = Math.ceil(length / 1.5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const s = box(length/count - 0.055, 0.81 + random()*0.13, 0.26,
        mix(a[0],b[0],t), 1.2, mix(a[1],b[1],t), m.stone[(i+side)%6], landscape);
      s.rotation.y = -Math.atan2(dz,dx);
    }
  }
  // A short compressed approach and a paving strip into the stone entry.
  for (let i = 0; i < 7; i++) box(4.1, 0.16, 0.56, 6.15, 0.88+i*0.15, 15.55-i*0.52, m.stone[1], landscape);
  box(4.1, 0.04, 4.4, 6.15, 1.905, 10.85, m.path, landscape);
  for (let i=0;i<8;i++) box(1.30,0.045,0.73, 1.2,1.925,7.7+i*0.77,m.path,landscape);
  for (const x of [3.88,8.42]) {
    for(let i=0;i<4;i++) box(0.10,0.8,0.10,x,1.56+i*0.25,15.3-i*0.92,m.timber,landscape);
    beam([x,1.96,15.3],[x,2.71,12.54],0.065,m.timber,landscape);
  }

  // Sloping ishigaki plinth: six staggered courses of individually scaled stone.
  const stoneBottom = 1.87, stoneTop = 6.0;
  const bottomW = 18.5, bottomD = 15.3, topW = 14.8, topD = 12.0;
  function frustum(w0,d0,w1,d1,y0,y1,mat) {
    const v=[[-w0/2,y0,-d0/2],[w0/2,y0,-d0/2],[w0/2,y0,d0/2],[-w0/2,y0,d0/2],
      [-w1/2,y1,-d1/2],[w1/2,y1,-d1/2],[w1/2,y1,d1/2],[-w1/2,y1,d1/2]];
    return mesh(geometry(v,[0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4,4,7,5,5,7,6]),mat);
  }
  frustum(bottomW,bottomD,topW,topD,stoneBottom,stoneTop,m.stone[5]);
  for (let row=0;row<6;row++) {
    const t=(row+0.5)/6, y=mix(stoneBottom,stoneTop,t);
    const w=mix(bottomW,topW,t), d=mix(bottomD,topD,t);
    for(let side=0;side<4;side++) {
      const front=side<2, sign=side%2===0?1:-1;
      const span=front?w:d;
      const count=Math.round(span/1.24);
      for(let i=0;i<count;i++) {
        const p=-span/2+(i+0.5)*span/count;
        // Keep the welcoming doorway legible through the lower two front rows.
        if(side===0 && row<3 && Math.abs(p-1.2)<1.30) continue;
        const block=box(span/count-0.05,0.59+random()*0.10,0.29,
          front?p:sign*w/2,y+(random()-.5)*.055,front?sign*d/2:p,m.stone[Math.floor(random()*6)]);
        if(front) block.rotation.x=-sign*Math.atan((bottomD-topD)/2/(stoneTop-stoneBottom));
        else { block.rotation.y=Math.PI/2; block.rotation.z=sign*Math.atan((bottomW-topW)/2/(stoneTop-stoneBottom)); }
        block.rotation.z+=(random()-.5)*0.04;
      }
    }
  }
  box(2.48,2.15,0.10,1.2,2.95,7.31,m.dark);
  box(2.9,0.37,0.53,1.2,4.07,6.96,m.stone[1]);
  for(const x of [-.21,2.61]) box(.32,2.05,.49,x,2.94,7.04,m.stone[3]);
  box(3.1,0.16,0.62,1.2,1.98,7.59,m.stone[1]);
  box(15.0,0.24,12.2,0,6.03,0,m.plasterShade);

  // Each wall has a white sill, projecting lintel, and inset barred windows.
  function storey(w,d,y0,y1,windowCount) {
    const concealedFoot=y0>8?.75:0;
    box(w,y1-y0+concealedFoot,d,0,(y0+y1-concealedFoot)/2,0,m.plaster);
    box(w+.12,.15,d+.12,0,y0+.12,0,m.plasterLight);
    box(w+.08,.13,d+.08,0,y1-.08,0,m.plasterLight);
    for(const front of [true,false]) {
      const span=front?w:d, count=front?windowCount:Math.max(2,windowCount-1);
      for(const sign of [-1,1]) for(let i=0;i<count;i++) {
        const p=span*((i+.5)/count-.5)*.87;
        const wx=front?p:sign*(w/2+.031), wz=front?sign*(d/2+.031):p;
        const ww = y1-y0>2.4?1.18:0.94, wh=Math.min(1.05,(y1-y0)*.45), wy=(y0+y1)/2+.08;
        const window=box(ww,wh,.065,wx,wy,wz,m.window);
        if(!front)window.rotation.y=Math.PI/2;
        const sill=box(ww+.20,.13,.17,wx,wy-wh/2-.08,wz,m.plasterLight);
        const lintel=box(ww+.14,.105,.14,wx,wy+wh/2+.07,wz,m.plasterLight);
        if(!front){sill.rotation.y=Math.PI/2;lintel.rotation.y=Math.PI/2;}
        for(let bar=0;bar<5;bar++) {
          const offset=(bar/4-.5)*ww*.86;
          const part=box(.057,wh,.09,wx+(front?offset:sign*.045),wy,wz+(front?sign*.045:offset),m.plasterShade);
          if(!front)part.rotation.y=Math.PI/2;
        }
      }
    }
  }
  storey(14.6,11.8,6.15,8.96,5);
  storey(12.65,10.45,9.76,11.79,4);
  storey(10.95,9.03,12.58,15.08,3);
  storey(8.6,7.25,16.08,18.35,3);

  // Concave hipped tile roofs; the edge and corners turn gently upward.
  // One sampled roof skin and repeated thin ribs keep tile detail inexpensive.
  function hipRoof(w,d,y,rise,ridge,detail=true) {
    const roofGroup = new T.Group(); architecture.add(roofGroup);
    const ribVertices=[],ribIndices=[];
    function tileRib(points) {
      const first=ribVertices.length;
      points.forEach((p,i)=>{
        const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
        const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1;
        const px=dz/length*.037,pz=-dx/length*.037;
        ribVertices.push([p[0]-px,p[1],p[2]-pz],[p[0],p[1]+.043,p[2]],[p[0]+px,p[1],p[2]+pz]);
      });
      for(let i=0;i<points.length-1;i++) {
        const a=first+i*3;
        ribIndices.push(a,a+3,a+1,a+1,a+3,a+4,a+1,a+4,a+2,a+2,a+4,a+5);
      }
    }
    function point(side,u,v,lift=0) {
      const corner=0.20*Math.pow(Math.abs(u),6)*Math.pow(v,5);
      const yy=y+rise*Math.pow(1-v,1.46)+0.19*Math.pow(v,8)+corner+lift;
      if(side<2) return [u*mix(ridge,w,v)/2,yy,(side===0?1:-1)*d*v/2];
      return [(side===2?1:-1)*mix(ridge,w,v)/2,yy,u*d*v/2];
    }
    for(let side=0;side<4;side++) {
      const verts=[], idx=[], nu=side<2?16:10,nv=6;
      for(let v=0;v<=nv;v++) for(let u=0;u<=nu;u++) verts.push(point(side,u/nu*2-1,v/nv));
      for(let v=0;v<nv;v++)for(let u=0;u<nu;u++) {
        const a=v*(nu+1)+u,b=a+nu+1;
        if(side===0||side===3) idx.push(a,b,a+1,a+1,b,b+1);
        else idx.push(a,a+1,b,a+1,b+1,b);
      }
      mesh(geometry(verts,idx),m.roof,roofGroup);
      const edge=[];for(let i=0;i<=20;i++)edge.push(point(side,i/10-1,1,.015));
      ribbon(edge,.20,m.roofEdge,roofGroup);
      // The lower contrasting fascia is a separate thin band.
      ribbon(edge.map(([x,yy,z])=>[x,yy-.16,z]),.12,m.plasterShade,roofGroup);
      if(detail) {
        const ribs=Math.round((side<2?w:d)/.68);
        for(let j=0;j<=ribs;j++) {
          const u=j/ribs*2-1;
          const rib=[];for(let k=0;k<=4;k++)rib.push(point(side,u,.07+k*.2325,.018));
          tileRib(rib);
        }
        for(let k=1;k<4;k++) {
          const v=.18+k*.22;
          for(let j=0;j<4;j++) beam(point(side,-1+j*.5,v,.017),point(side,-.5+j*.5,v,.017),.017,m.tileLight,roofGroup);
        }
      }
    }
    if(ribVertices.length)mesh(geometry(ribVertices,ribIndices),m.tile,roofGroup);
    beam([-ridge/2,y+rise+.055,0],[ridge/2,y+rise+.055,0],.13,m.tile,roofGroup);
    for(const sign of [-1,1]) {
      const end=[sign*(ridge/2+.25),y+rise+.45,0];
      beam([sign*(ridge/2-.28),y+rise+.08,0],end,.095,m.tileLight,roofGroup);
      for(const back of [-1,1]) {
        const pts=[];for(let i=0;i<=8;i++) pts.push(point(back===1?0:1,sign,i/8,.07));
        for(let i=0;i<8;i++)beam(pts[i],pts[i+1],.083,m.tile,roofGroup);
      }
    }
    return roofGroup;
  }
  hipRoof(17.95,15.2,8.82,2.0,8.2);
  hipRoof(16.20,13.70,11.71,2.0,7.5);
  hipRoof(14.40,12.25,14.94,2.15,6.65);
  hipRoof(11.87,10.45,18.20,1.75,5.50);

  // Decorative irimoya and karahafu gables, set proud of their roof skins.
  function gable(w,h,depth,y,z,style='triangle',rotation=0) {
    const parent = new T.Group(); parent.rotation.y=rotation; architecture.add(parent);
    const samples=24;
    function height(x) {
      const t=Math.abs(x)/(w/2);
      if(style==='curved') return y+h*(.08+.90*Math.exp(-6.0*t*t))+.22*Math.pow(t,8);
      return y+h*Math.pow(1-t,1.14)+.20*Math.pow(t,8);
    }
    const vertices=[],indices=[];
    for(let i=0;i<=samples;i++) {
      const x=-w/2+w*i/samples;
      vertices.push([x,y-.09,z],[x,height(x)-.13,z]);
    }
    for(let i=0;i<samples;i++) {const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    mesh(geometry(vertices,indices),m.plasterLight,parent);
    const roofVerts=[],roofIdx=[];
    for(let i=0;i<=samples;i++) {
      const x=-w/2+w*i/samples, yy=height(x);
      roofVerts.push([x,yy,z+.24],[x*.83,yy+.19,z-depth]);
    }
    for(let i=0;i<samples;i++){const a=i*2;roofIdx.push(a,a+2,a+1,a+2,a+3,a+1);}
    mesh(geometry(roofVerts,roofIdx),m.roof,parent);
    const edge=[];for(let i=0;i<=samples;i++){const x=-w/2+w*i/samples;edge.push([x,height(x)+.025,z+.26]);}
    ribbon(edge,.19,m.tileLight,parent);
    ribbon(edge.map(([x,yy,zz])=>[x*.97,yy-.22,zz+.013]),.15,m.plasterShade,parent);
    for(let i=0;i<=samples;i+=2){
      const x=-w/2+w*i/samples;beam([x,height(x)+.06,z+.24],[x*.83,height(x)+.25,z-depth],.034,m.tile,parent);
    }
    if(style==='triangle') {
      box(1.12,.58,.05,0,y+.60,z+.03,m.window,parent);
      for(let i=0;i<5;i++)box(.055,.58,.06,(i-2)*.22,y+.60,z+.07,m.plasterShade,parent);
      beam([0,y+h+.02,z+.24],[0,y+h+.17,z-depth],.1,m.tile,parent);
    } else {
      box(.54,.30,.06,0,y+.50,z+.055,m.plasterShade,parent);
    }
  }
  gable(6.30,2.06,2.10,15.65,5.30,'triangle');
  gable(6.30,2.06,2.10,15.65,5.30,'triangle',Math.PI);
  gable(4.02,1.00,1.45,18.72,4.78,'curved');
  gable(4.02,1.00,1.45,18.72,4.78,'curved',Math.PI);
  gable(5.95,2.03,1.50,12.03,6.70,'triangle',Math.PI/2);
  gable(5.95,2.03,1.50,12.03,6.70,'triangle',-Math.PI/2);

  // Open fifth-floor observation balcony: muted vermilion rails, pale posts.
  const deckY=20.02, deckW=8.55, deckD=7.48;
  box(6.75,1.55,5.85,0,19.2,0,m.plaster);
  box(deckW,.24,deckD,0,deckY,0,m.plasterShade);
  box(deckW+.18,.12,deckD+.18,0,deckY-.17,0,m.roofEdge);
  box(6.35,2.22,5.45,0,21.22,0,m.plasterLight);
  for(const front of [true,false])for(const sign of [-1,1]) {
    const span=front?6.35:5.45, p=front?2.76:3.20;
    for(let i=0;i<3;i++) {
      const offset=(i-1)*span*.28;
      const opening=box(1.32,1.38,.075,front?offset:sign*p,21.27,front?sign*p:offset,m.dark);
      if(!front)opening.rotation.y=Math.PI/2;
      const post=box(.1,1.4,.09,front?offset:sign*(p+.03),21.27,front?sign*(p+.03):offset,m.plasterShade);
      if(!front)post.rotation.y=Math.PI/2;
    }
    const railSpan=front?deckW:deckD, fixed=front?deckD/2:deckW/2;
    for(const yy of [deckY+.31,deckY+.66,deckY+.97]){
      const rail=box(railSpan+.12,.10,.115,front?0:sign*fixed,yy,front?sign*fixed:0,yy>deckY+.9?m.balconyCap:m.balcony);
      if(!front)rail.rotation.y=Math.PI/2;
    }
    const posts=Math.round(railSpan/.82);
    for(let i=0;i<=posts;i++) {
      const offset=(i/posts-.5)*railSpan;
      box(.105,1.00,.105,front?offset:sign*fixed,deckY+.5,front?sign*fixed:offset,m.balcony);
    }
    for(const offset of [-.42,0,.42]) {
      const o=offset*railSpan;
      box(.14,2.34,.14,front?o:sign*(fixed-.26),21.21,front?sign*(fixed-.26):o,m.plasterLight);
    }
  }
  hipRoof(9.95,8.65,22.30,2.24,6.0);
  // Two small shachihoko-inspired ridge silhouettes, modeled abstractly.
  for(const sign of [-1,1]) {
    const x=sign*3.03;
    beam([x,24.68,0],[x+sign*.15,25.08,0],.14,m.tileLight);
    beam([x+sign*.15,25.08,0],[x+sign*.32,25.60,0],.115,m.tile);
    beam([x+sign*.32,25.60,0],[x+sign*.54,25.88,0],.09,m.tileLight);
    beam([x+sign*.13,25.08,0],[x-sign*.18,25.27,0],.08,m.tileLight);
  }

  // Small west-side connecting wing, with its own lower white wall and tiles.
  const wing=new T.Group();wing.position.set(-10.17,0,-1.5);architecture.add(wing);
  box(4.8,3.5,6.9,0,3.70,0,m.stone[2],wing);
  box(4.42,2.1,6.2,0,6.36,0,m.plaster,wing);
  box(4.50,.20,6.30,0,5.43,0,m.plasterShade,wing);
  for(let i=0;i<3;i++)box(.90,.62,.06,0,6.42,3.13,m.window,wing).position.x=(i-1)*1.36;
  const wingRoof=hipRoof(6.1,7.7,7.30,1.40,2.35,false);
  wing.add(wingRoof);
  // hipRoof is authored in local coordinates and can be reparented safely.

  // Perimeter plaster wall segments and tiled coping, with clear approach gap.
  function boundaryWall(x,z,length,rotation=0) {
    const p=new T.Group();p.position.set(x,1.90,z);p.rotation.y=rotation;landscape.add(p);
    box(length,.78,.42,0,.41,0,m.plaster,p);
    box(length+.15,.13,.63,0,.87,0,m.roof,p);
    box(length+.20,.07,.74,0,.93,0,m.tile,p);
    for(let i=0;i<=Math.round(length/.6);i++)box(.06,.04,.76,-length/2+i*length/Math.round(length/.6),.986,0,m.roofEdge,p);
    for(const end of [-1,1])box(.56,.95,.60,end*length/2,.47,0,m.plasterLight,p);
  }
  boundaryWall(-9.5,10.75,6.8);
  boundaryWall(-14.50,4.60,6.1,Math.PI/2);
  boundaryWall(10.82,-5.50,6.3,Math.PI/2);

  // Garden pines use branched trunks and flattened, subtly faceted canopies.
  function pine(x,z,height,spread,variant=0) {
    const y=.86;
    beam([x,y,z],[x+.18,y+height*.88,z-.08],.18,m.trunk,landscape);
    const clusters=[[-.53,.62,.13,.76],[.44,.76,-.16,.72],[-.08,.97,0,.73],[.42,.49,.26,.56]];
    clusters.forEach(([cx,cy,cz,s],i)=>{
      const px=x+cx*spread,pz=z+cz*spread,py=y+cy*height;
      beam([x+.12,y+cy*height*.73,z],[px,py-.19,pz],.08,m.trunk,landscape);
      const canopy=mesh(foliageGeometry,m.leaves[(variant+i)%m.leaves.length],landscape);
      canopy.position.set(px,py,pz);canopy.scale.set(spread*s,height*.16,spread*s*.74);
      canopy.rotation.y=i*1.4+variant;
    });
  }
  pine(-16.5,5.3,5.4,2.6,0);
  pine(-15.9,-8.5,6.4,3.3,1);
  pine(10.8,-11.8,5.1,2.6,0);
  pine(14.3,5.8,4.2,2.15,2);
  pine(-10.7,-12.0,4.8,2.8,3);
  pine(-18.5,-3.0,4.1,2.3,1);
  // Lower shrubs frame the miniature without concealing the tower or entry.
  for(const [x,z,s] of [[-16,10,1.5],[-12,13.6,1.25],[-5,14.2,1.4],[10.4,12.2,1.5],[12.8,9.4,1.3],[-18,-10,1.4],[7,-13.1,1.3],[12,-9,1.3]]) {
    for(let i=0;i<3;i++) {
      const shrub=mesh(foliageGeometry,m.leaves[(i+2)%5],landscape);
      shrub.position.set(x+(i-1)*s*.54,1.05+random()*.22,z+(random()-.5)*.6);
      shrub.scale.set(s*.85,s*.62,s*.8);shrub.rotation.y=random()*Math.PI;
    }
  }
  // A restrained wisteria pergola recalls the lower park; no flower season implied.
  const pergolaX=-9.4,pergolaZ=8.4;
  for(const dx of [-2.0,2.0])for(const dz of [-1.05,1.05])box(.12,2.6,.12,pergolaX+dx,3.22,pergolaZ+dz,m.timber,landscape);
  for(const dz of [-1.15,1.15])box(4.65,.15,.13,pergolaX,4.58,pergolaZ+dz,m.timber,landscape);
  for(let i=0;i<9;i++)box(.10,.11,2.7,pergolaX-2.1+i*.525,4.69,pergolaZ,m.timber,landscape);
  for(let i=0;i<5;i++) {
    const vine=mesh(foliageGeometry,m.leaves[1],landscape);
    vine.position.set(pergolaX-1.7+i*.85,4.79,pergolaZ+(i%2-.5)*.57);
    vine.scale.set(.92,.23,.87);
  }
  // Small stone lanterns give the court a useful human-scale cue.
  function lantern(x,z) {
    box(.64,.16,.64,x,1.98,z,m.stone[1],landscape);
    box(.20,.81,.20,x,2.44,z,m.stone[3],landscape);
    box(.58,.10,.58,x,2.91,z,m.stone[1],landscape);
    box(.39,.44,.39,x,3.16,z,m.stone[3],landscape);
    box(.22,.25,.012,x,3.16,z+.202,m.dark,landscape);
    const top=mesh(new T.ConeGeometry(.51,.33,4),m.stone[0],landscape);top.position.set(x,3.55,z);top.rotation.y=Math.PI/4;
    box(.13,.15,.13,x,3.80,z,m.stone[1],landscape);
  }
  lantern(-4.8,9.0);lantern(7.8,7.3);

  group.userData = {
    asset: 'karatsu-castle',
    description: 'Original miniature of the present five-tier Karatsu Castle keep',
    referenceURLs: ['https://karatsujo.com/','https://www.city.karatsu.lg.jp/page/4527.html','https://www.city.karatsu.lg.jp/page/1041.html'],
    measuredSurvey: false,
    frontAxis: '+Z',
  };
  return { group, target:[0,11.0,0], halfHeight:20.0, azimuth:Math.atan2(40,55), elevation:0.40 };
}
