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
import { surface } from '../../scene/surface-materials.js';
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
    plaster: material('#eeeae0'), plasterLight: material('#fffaf0'),
    plasterShade: material('#d1d1c8'), roof: material('#344044', .77),
    tile: material('#56646a', .53), tileLight: material('#738084', .62),
    roofEdge: material('#737e7e'), timber: material('#5b5148'),
    dark: material('#242e2e'), window: material('#354543', .25),
    balcony: material('#a44c35'), balconyCap: material('#783d32'),
    lattice: material('#827f72'), ridgeFish: material('#928f81',.50), joint: material('#62695e'),
    gravel: material('#c8bea4'), path: material('#ddd0b5'),
    earth: material('#64665b'), soil: material('#828272'),
    lawn: material('#8a9770'), moss: material('#657956'),
    stone: ['#8d9186', '#a2a297', '#818a80', '#aaa99a', '#8d9587', '#778278'].map(c => material(c)),
    leaves: ['#4e6b49', '#668254', '#79925e', '#394f3a', '#8c9c65'].map(c => material(c)),
    trunk: material('#6a6551'), water: material('#6b9d9d', 0.44),
    shallow: material('#99b9ad', 0.65), foam: material('#cbd8c7'),
  };
  for(const key of ['plaster','plasterLight','plasterShade'])surface(m[key],'plaster',{tint:key==='plasterShade'?'#dadeda':'#ffffff'});
  m.ridgeFish.metalness=.32;
  // Close-range grain belongs to each physical stone. A photograph with its
  // own mortar joints would create a conflicting second masonry pattern.
  const grainSize=64,grainData=new Uint8Array(grainSize*grainSize*4);
  let graniteSeed=1966;
  for(let i=0;i<grainData.length;i+=4) {
    graniteSeed=(Math.imul(1664525,graniteSeed)+1013904223)>>>0;
    const value=216+(graniteSeed>>>26);
    grainData[i]=Math.min(255,value);grainData[i+1]=Math.min(255,value);
    grainData[i+2]=Math.min(255,value-2);grainData[i+3]=255;
  }
  const graniteGrain=new T.DataTexture(grainData,grainSize,grainSize);
  graniteGrain.wrapS=graniteGrain.wrapT=T.RepeatWrapping;
  graniteGrain.magFilter=T.LinearFilter;graniteGrain.minFilter=T.LinearMipmapLinearFilter;
  graniteGrain.generateMipmaps=true;graniteGrain.needsUpdate=true;
  for(const stone of m.stone){stone.map=graniteGrain;stone.bumpMap=graniteGrain;stone.bumpScale=.015;}
  surface(m.roof,'slate',{roughness:.66,bumpScale:.006});surface(m.timber,'walnut',{tint:'#b3aea6',roughness:.64,bumpScale:.005});
  m.window.metalness=.08;
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new T.CylinderGeometry(1, 1, 1, 4, 1, false);
  const foliageGeometry = new T.IcosahedronGeometry(1, 1);
  const rockGeometry = new T.IcosahedronGeometry(1, 0);
  // Shared, flat end tiles add readable eave detail with only ten faces each.
  const tileEndGeometry = new T.CircleGeometry(1, 10);
  const unitY = new T.Vector3(0, 1, 0);
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
  // Closed fascia: the eave remains solid when viewed from below or behind.
  function ribbon(points, thickness, mat, parent = architecture) {
    const vertices = [], indices = [], breadth = .055;
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
      const nx = dz / len * breadth, nz = -dx / len * breadth;
      vertices.push([p[0]+nx,p[1],p[2]+nz], [p[0]-nx,p[1],p[2]-nz],
        [p[0]-nx,p[1]-thickness,p[2]-nz], [p[0]+nx,p[1]-thickness,p[2]+nz]);
    });
    for (let i=0;i<points.length-1;i++) for(let j=0;j<4;j++) {
      const a=i*4+j,b=i*4+(j+1)%4,c=a+4,d=b+4;
      indices.push(a,b,c,b,d,c);
    }
    const n=(points.length-1)*4;
    indices.push(0,2,1,0,3,2,n,n+1,n+2,n,n+2,n+3);
    return mesh(geometry(vertices,indices),mat,parent);
  }
  function slab(outline, bottom, top, mat, parent = landscape, lowerScale = 1) {
    const vertices = outline.map(([x, z]) => [x * lowerScale, bottom, z * lowerScale]);
    vertices.push(...outline.map(([x, z]) => [x, top, z]));
    const n = outline.length, indices = [];
    for (let i = 1; i < n - 1; i++) indices.push(n, n + i + 1, n + i, 0, i, i + 1);
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

  // The upper keep rests on separate, tightly fitted granite stones. Use one
  // shared pattern of irregular joints per face, with a slight inward batter.
  const stoneBottom = 1.87, stoneTop = 6.0, height = stoneTop - stoneBottom;
  const bottomW = 18.5, bottomD = 15.3, topW = 14.8, topD = 12.0;
  const granitePositions=[],graniteIndices=[],graniteColors=[],graniteUVs=[];
  const entrance = { left: -.08, right: 2.48, lintel: 2.31, back: 5.70 };
  for(let side=0;side<4;side++) {
    const front=side<2, sign=side%2===0?1:-1;
    const width=front?bottomW:bottomD, crown=front?topW:topD;
    const depth=front?bottomD:bottomW, crownDepth=front?topD:topW;
    function point(x,y,relief=0) {
      const t=y/height, narrow=1-Math.pow(1-t,1.18);
      const u=x*mix(1,crown/width,narrow);
      const normal=sign*(mix(depth,crownDepth,narrow)/2+relief);
      return front?[u,stoneBottom+y,normal]:[normal,stoneBottom+y,u];
    }
    // Polygons have counterclockwise winding in their own surface plane.
    function panel(points,mat,relief=0,round=0) {
      if(points.length<3)return;
      const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-a[1]*b[0];},0);
      if(Math.abs(area)<.001)return;
      const cx=points.reduce((sum,a)=>sum+a[0],0)/points.length;
      const cy=points.reduce((sum,a)=>sum+a[1],0)/points.length;
      const inner=points.map(([x,y])=>[mix(cx,x,round?.962:1),mix(cy,y,round?.956:1)]);
      const vertices=[point(cx,cy,relief+round),...inner.map(([x,y],i)=>point(x,y,relief+(round?(i%3)*.009:0)))];
      const indices=[];
      for(let j=0;j<inner.length;j++) {
        const a=j+1,b=(j+1)%inner.length+1;
        indices.push(0,a,b);
      }
      if((front&&sign<0)||(!front&&sign>0))indices.reverse();
      if(!round){mesh(geometry(vertices,indices),mat);return;}
      // All stones have the same material response. Store individual colours
      // in a single indexed surface, retaining each polygon's own normals.
      const base=granitePositions.length/3;
      for(const vertex of vertices) {
        granitePositions.push(...vertex);
        graniteColors.push(mat.color.r,mat.color.g,mat.color.b);
        graniteUVs.push(vertex[front?0:2]/.9,vertex[1]/.9);
      }
      for(const i of indices)graniteIndices.push(base+i);
    }
    // Clip a convex polygon against a half-plane. Cells share their actual
    // boundaries, so joints run between irregular stones instead of crossing them.
    function clip(points,nx,ny,limit) {
      const result=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        const da=a[0]*nx+a[1]*ny-limit,db=b[0]*nx+b[1]*ny-limit;
        if(da<=0)result.push(a);
        if((da<0&&db>0)||(da>0&&db<0)) {
          const t=da/(da-db);result.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);
        }
      }
      return result;
    }
    const rectangle=[[-width/2,0],[width/2,0],[width/2,height],[-width/2,height]];
    // Leave a deep opening in the backing as well as the outer stonework.
    function outsidePassage(points) {
      if(side!==0)return [points];
      return [clip(points,0,-1,-entrance.lintel),
        clip(clip(points,0,1,entrance.lintel),1,0,entrance.left),
        clip(clip(points,0,1,entrance.lintel),-1,0,-entrance.right)];
    }
    for(const part of outsidePassage(rectangle))panel(part,m.joint,-.02);
    const sites=[],sx=1.08,sy=.69;
    for(let j=0;j<6;j++) {
      const columns=Math.ceil(width/sx);
      for(let i=-1;i<=columns;i++) {
        const x=(i+.35+(j%2)*.5+(random()-.5)*.72)*width/columns-width/2;
        const y=(j+.5+(random()-.5)*.63)*height/6;
        sites.push([x,y]);
      }
    }
    for(const [x,y] of sites) {
      let cell=rectangle;
      for(const [nx,ny] of sites) {
        const dx=nx-x,dy=ny-y;
        if((!dx&&!dy)||Math.abs(dx)>sx*3.6||Math.abs(dy)>sy*3.7)continue;
        // Anisotropic spacing preserves the wide, interlocking granite faces.
        const ax=dx/(sx*sx),ay=dy/(sy*sy);
        cell=clip(cell,ax,ay,ax*(x+nx)/2+ay*(y+ny)/2);
        if(cell.length<3)break;
      }
      if(cell.length<3)continue;
      const fieldStone=m.stone[Math.floor(random()*m.stone.length)],relief=.025+random()*.05;
      for(const part of outsidePassage(cell))panel(part,fieldStone,relief,.035+random()*.07);
    }
  }
  const masonry=new T.BufferGeometry();
  masonry.setAttribute('position',new T.Float32BufferAttribute(granitePositions,3));
  masonry.setAttribute('color',new T.Float32BufferAttribute(graniteColors,3));
  masonry.setAttribute('uv',new T.Float32BufferAttribute(graniteUVs,2));
  masonry.setIndex(graniteIndices);masonry.computeVertexNormals();
  const granite=material('#ffffff');granite.vertexColors=true;
  granite.map=graniteGrain;granite.bumpMap=graniteGrain;granite.bumpScale=.015;
  mesh(masonry,granite).name='Interlocking dressed granite fieldstones';

  // The visitor entrance passes through the battered stone base into the
  // museum basement. The recessed glazed doors can be seen beyond the jambs.
  const portal=new T.Group();portal.name='Basement entrance passage';architecture.add(portal);
  const openingWidth=entrance.right-entrance.left,centre=(entrance.right+entrance.left)/2;
  box(openingWidth+.22,.12,2.06,centre,stoneBottom+.035,6.66,m.stone[1],portal);
  box(openingWidth+.08,.16,1.39,centre-.07,stoneBottom+entrance.lintel,6.32,m.joint,portal);
  for(const [x,s] of [[entrance.left,-1],[entrance.right,1]]) {
    for(let row=0;row<4;row++) {
      const h=entrance.lintel/4, yy=(row+.5)*h;
      const narrow=1-Math.pow(1-yy/height,1.18);
      const centreX=x*mix(1,topW/bottomW,narrow);
      const outerZ=mix(bottomD,topD,narrow)/2+.06;
      box(.24,h-.018,outerZ-entrance.back+.05,centreX+s*.10,stoneBottom+yy,(outerZ+entrance.back)/2,m.stone[(row+2)%6],portal);
    }
  }
  box(2.81,.34,.55,centre-.09,stoneBottom+entrance.lintel+.11,6.72,m.stone[1],portal);
  box(openingWidth,.22,.52,centre,stoneBottom+.01,7.58,m.stone[4],portal);
  box(openingWidth,2.15,.12,centre,stoneBottom+1.08,entrance.back,m.dark,portal);
  for(const s of [-1,1]) {
    box(.97,1.61,.055,centre+s*.52,stoneBottom+.94,entrance.back+.080,m.window,portal);
    box(.059,1.87,.07,centre+s*.045,stoneBottom+.94,entrance.back+.12,m.timber,portal);
  }
  box(openingWidth,.08,.10,centre,stoneBottom+1.82,entrance.back+.12,m.timber,portal);
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
        const ww = y1-y0>2.4?1.36:1.08, wh=Math.min(1.23,(y1-y0)*.50), wy=(y0+y1)/2+.08;
        const window=box(ww,wh,.065,wx,wy,wz,m.window);
        if(!front)window.rotation.y=Math.PI/2;
        const sill=box(ww+.20,.13,.17,wx,wy-wh/2-.08,wz,m.plasterLight);
        const lintel=box(ww+.14,.105,.14,wx,wy+wh/2+.07,wz,m.plasterLight);
        if(!front){sill.rotation.y=Math.PI/2;lintel.rotation.y=Math.PI/2;}
        for(let bar=0;bar<7;bar++) {
          const offset=(bar/6-.5)*ww*.88;
          const part=box(.052,wh,.092,wx+(front?offset:sign*.047),wy,wz+(front?sign*.047:offset),m.lattice);
          if(!front)part.rotation.y=Math.PI/2;
        }
        // Narrow recessed frame edges make the existing openings feel carved
        // into the plaster, especially when the keep is viewed at close range.
        for(const edge of [-1,1]) {
          const jamb=box(.075,wh+.17,.105,
            wx+(front?edge*(ww/2+.08):sign*.016),wy,
            wz+(front?sign*.016:edge*(ww/2+.08)),m.plasterShade);
          if(!front)jamb.rotation.y=Math.PI/2;
        }
      }
      // Timber ends sit below the existing overhanging eaves, not on the walls.
      for(const sign of [-1,1])for(let i=0;i<=Math.floor(span/.76);i++) {
        const offset=-span/2+.30+i*(span-.60)/Math.floor(span/.76);
        const fixed=front?d/2:w/2;
        const corbel=box(.14,.15,.54,front?offset:sign*(fixed+.18),y1-.24,
          front?sign*(fixed+.18):offset,m.plasterShade);
        const foot=box(.12,.14,.28,front?offset:sign*(fixed+.095),y1-.37,
          front?sign*(fixed+.095):offset,m.plasterShade);
        if(!front){corbel.rotation.y=Math.PI/2;foot.rotation.y=Math.PI/2;}
      }
    }
  }
  storey(14.6,11.8,6.15,8.96,5);
  storey(14.20,11.12,9.56,11.79,4);
  storey(11.40,9.03,12.58,15.08,3);
  storey(8.6,7.00,16.08,18.35,3);

  // Roofs are closed shells, with shallow concavity and a restrained turned
  // edge. Photographs show two broad lower roofs and a much smaller belvedere.
  // A tile strip has a rounded crest, not a triangular ridge painted on a plane.
  function hipRoof(w,d,y,rise,ridge,detail=true) {
    const roofGroup=new T.Group(); roofGroup.name='Closed tiled roof'; architecture.add(roofGroup);
    const ribV=[],ribI=[];
    function tileRib(points,r=.055) {
      const start=ribV.length, ring=4;
      points.forEach((p,i)=> {
        const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
        const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1;
        for(let k=0;k<ring;k++) {
          const theta=Math.PI*k/(ring-1);
          ribV.push([p[0]+dz/len*Math.cos(theta)*r,p[1]+Math.sin(theta)*r,p[2]-dx/len*Math.cos(theta)*r]);
        }
      });
      for(let i=0;i<points.length-1;i++)for(let k=0;k<ring-1;k++) {
        const a=start+i*ring+k,b=a+ring;
        ribI.push(a,a+1,b,a+1,b+1,b);
      }
    }
    function point(side,u,v,lift=0) {
      const turn=.15*Math.pow(v,8)+.17*Math.pow(Math.abs(u),8)*Math.pow(v,5);
      const yy=y+rise*Math.pow(1-v,1.28)+turn+lift;
      if(side<2)return[u*mix(ridge,w,v)/2,yy,(side===0?1:-1)*d*v/2];
      return[(side===2?1:-1)*mix(ridge,w,v)/2,yy,u*d*v/2];
    }
    for(let side=0;side<4;side++) {
      const verts=[],idx=[],nu=side<2?14:8,nv=6,row=nu+1;
      for(let layer=0;layer<2;layer++)for(let v=0;v<=nv;v++)for(let u=0;u<=nu;u++)
        verts.push(point(side,u/nu*2-1,v/nv,layer?-.25:0));
      const n=row*(nv+1);
      function face(a,b,c,upper=true) {
        const A=verts[a],B=verts[b],C=verts[c];
        const nx=(B[1]-A[1])*(C[2]-A[2])-(B[2]-A[2])*(C[1]-A[1]);
        const ny=(B[2]-A[2])*(C[0]-A[0])-(B[0]-A[0])*(C[2]-A[2]);
        const nz=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
        if(nx*nx+ny*ny+nz*nz<1e-12)return;
        if((ny>0)!==upper)idx.push(a,c,b);else idx.push(a,b,c);
      }
      for(let v=0;v<nv;v++)for(let u=0;u<nu;u++) {
        const a=v*row+u,b=a+row;
        face(a,b,a+1);face(a+1,b,b+1);
        face(a+n,b+n,a+1+n,false);face(a+1+n,b+n,b+1+n,false);
      }
      const perimeter=[];
      for(let u=0;u<=nu;u++)perimeter.push(u);
      for(let v=1;v<=nv;v++)perimeter.push(v*row+nu);
      for(let u=nu-1;u>=0;u--)perimeter.push(nv*row+u);
      for(let v=nv-1;v>0;v--)perimeter.push(v*row);
      for(let j=0;j<perimeter.length;j++) {
        const a=perimeter[j],b=perimeter[(j+1)%perimeter.length];
        if(side===0||side===3)idx.push(a,a+n,b,b,a+n,b+n);
        else idx.push(a,b,a+n,b,b+n,a+n);
      }
      mesh(geometry(verts,idx),m.roof,roofGroup);
      const edge=[];for(let i=0;i<=16;i++)edge.push(point(side,i/8-1,1,.013));
      ribbon(edge,.16,m.tileLight,roofGroup);
      ribbon(edge.map(([x,yy,z])=>[x,yy-.16,z]),.12,m.plasterShade,roofGroup);
      if(detail) {
        const ribs=Math.round((side<2?w:d)/.415);
        for(let j=0;j<=ribs;j++) {
          const u=j/ribs*2-1, rib=[];
          const fixed=u*(side<2?w:d)/2;
          // True parallel tile courses clip against the diagonal hip ridge;
          // stretching every course from a short ridge produces a false fan.
          const minimum=side<2?Math.max(0,(2*Math.abs(fixed)-ridge)/(w-ridge)):2*Math.abs(fixed)/d;
          if(minimum<.99) {
            const first=Math.max(.012,minimum+.003);
            for(let k=0;k<=4;k++) {
              const v=first+(1-first)*k/4;
              const uu=side<2?2*fixed/mix(ridge,w,v):2*fixed/(d*v);
              rib.push(point(side,uu,v,.017));
            }
            tileRib(rib,.049);
          }
          if(j>0&&j<ribs) {
            const end=point(side,u,1,-.056);
            const cap=mesh(tileEndGeometry,j%4?m.tile:m.tileLight,roofGroup);
            cap.position.set(...end);cap.scale.setScalar(.062);
            if(side===0){cap.position.z+=.056;}
            if(side===1){cap.position.z-=.056;cap.rotation.y=Math.PI;}
            if(side===2){cap.position.x+=.056;cap.rotation.y=Math.PI/2;}
            if(side===3){cap.position.x-=.056;cap.rotation.y=-Math.PI/2;}
          }
        }
        // White double rafters are prominent in the official low-angle image.
        const rafters=Math.round((side<2?w:d)/.47);
        for(let j=1;j<rafters;j++) {
          const u=j/rafters*2-1;
          const a=point(side,u,.79,-.33),b=point(side,u,.99,-.33);
          beam(a,b,.052,m.plasterShade,roofGroup);
        }
      }
    }
    if(ribV.length)mesh(geometry(ribV,ribI),m.tile,roofGroup);
    box(ridge,.20,.28,0,y+rise+.07,0,m.roofEdge,roofGroup);
    beam([-ridge/2,y+rise+.19,0],[ridge/2,y+rise+.19,0],.095,m.tile,roofGroup);
    for(let x=-ridge/2+.18;x<ridge/2;x+=.34)box(.04,.07,.26,x,y+rise+.17,0,m.tileLight,roofGroup);
    for(const sign of [-1,1])for(const front of [true,false]) {
      const pts=[];for(let i=0;i<=9;i++)pts.push(point(front?0:1,sign,i/9,.075));
      for(let i=0;i<9;i++)beam(pts[i],pts[i+1],.078,m.tile,roofGroup);
    }
    return roofGroup;
  }
  hipRoof(18.60,15.20,8.82,1.94,9.2);
  hipRoof(18.15,14.15,11.71,2.25,8.7);
  hipRoof(15.00,12.25,14.94,2.12,6.65);
  hipRoof(12.10,10.18,18.20,1.61,5.30);

  // Decorative irimoya and karahafu gables, set proud of their roof skins.
  function gable(w,h,depth,y,z,style='triangle',rotation=0) {
    const parent=new T.Group();parent.name=style==='curved'?'Karahafu curved gable':'Irimoya triangular gable';
    parent.rotation.y=rotation;architecture.add(parent);
    const samples=18;
    function height(x) {
      const t=Math.abs(x)/(w/2);
      if(style==='curved')return y+h*(.05+.95*Math.exp(-5.7*t*t))+.12*Math.pow(t,8);
      return y+h*Math.pow(1-t,1.08)+.16*Math.pow(t,8);
    }
    const faceV=[],faceI=[];
    for(const back of [false,true])for(let i=0;i<=samples;i++) {
      const x=-w/2+w*i/samples,zz=back?z-depth:z;
      faceV.push([x,y-.14,zz],[x,height(x)-.14,zz]);
    }
    const n=(samples+1)*2;
    for(let i=0;i<samples;i++) {
      const a=i*2;
      faceI.push(a,a+2,a+1,a+1,a+2,a+3, a+n,a+1+n,a+2+n,a+1+n,a+3+n,a+2+n);
      faceI.push(a+1,a+3,a+1+n,a+3,a+3+n,a+1+n, a,a+n,a+2,a+2,a+n,a+2+n);
    }
    faceI.push(0,1,n,1,n+1,n,n-2,2*n-2,n-1,n-1,2*n-2,2*n-1);
    mesh(geometry(faceV,faceI),m.plasterLight,parent);
    const roofV=[],roofI=[];
    for(let layer=0;layer<2;layer++)for(let i=0;i<=samples;i++) {
      const x=-w/2+w*i/samples,yy=height(x)-layer*.20;
      roofV.push([x,yy,z+.24],[x*.92,yy+.14,z-depth]);
    }
    for(let i=0;i<samples;i++) {
      const a=i*2;
      roofI.push(a,a+2,a+1,a+2,a+3,a+1, a+n,a+1+n,a+2+n,a+2+n,a+1+n,a+3+n);
      roofI.push(a,a+n,a+2,a+2,a+n,a+2+n,a+1,a+3,a+1+n,a+3,a+3+n,a+1+n);
    }
    roofI.push(0,1,n,1,n+1,n,n-2,2*n-2,n-1,n-1,2*n-2,2*n-1);
    mesh(geometry(roofV,roofI),m.roof,parent);
    const edge=[];
    for(let i=0;i<=samples;i++){const x=-w/2+w*i/samples;edge.push([x,height(x)+.035,z+.27]);}
    ribbon(edge,.17,m.tileLight,parent);
    ribbon(edge.map(([x,yy,zz])=>[x*.976,yy-.23,zz+.02]),.16,m.plasterShade,parent);
    for(let i=0;i<=samples;i++) {
      const x=-w/2+w*i/samples;
      beam([x,height(x)+.045,z+.26],[x*.92,height(x)+.19,z-depth],.039,m.tile,parent);
    }
    if(style==='triangle') {
      box(w*.22,.56,.06,0,y+.60,z+.035,m.window,parent);
      for(let i=0;i<7;i++)box(.045,.57,.085,(i-3)*w*.027,y+.60,z+.08,m.dark,parent);
      beam([0,y+h+.08,z+.24],[0,y+h+.22,z-depth],.093,m.tile,parent);
      // Short vertical supporting post and white corner returns in the pediment.
      box(.11,Math.max(.1,h-.85),.08,0,y+.86+(h-.85)/2,z+.10,m.plasterShade,parent);
    }
    return parent;
  }
  // Front and rear: a central third-roof chidori and the smaller fourth-roof
  // karahafu. The major second-roof irimoya are on the transverse elevations.
  gable(6.20,2.13,2.10,15.32,5.60,'triangle');
  gable(6.20,2.13,2.10,15.32,5.60,'triangle',Math.PI);
  gable(4.24,1.02,1.55,18.62,4.89,'curved');
  gable(4.24,1.02,1.55,18.62,4.89,'curved',Math.PI);
  gable(11.0,3.70,2.28,12.03,8.23,'triangle',Math.PI/2);
  gable(11.0,3.70,2.28,12.03,8.23,'triangle',-Math.PI/2);

  // Open fifth-floor observation balcony: muted vermilion rails, pale posts.
  const deckY=20.02, deckW=7.67, deckD=6.48;
  box(6.35,1.55,5.15,0,19.2,0,m.plaster);
  box(deckW,.24,deckD,0,deckY,0,m.plasterShade);
  box(deckW+.18,.12,deckD+.18,0,deckY-.17,0,m.roofEdge);
  box(5.70,2.22,4.65,0,21.22,0,m.plasterLight);
  for(const front of [true,false])for(const sign of [-1,1]) {
    const span=front?5.70:4.65, p=front?2.356:2.882;
    for(let i=0;i<3;i++) {
      const offset=(i-1)*span*.28;
      const opening=box(1.18,1.38,.075,front?offset:sign*p,21.27,front?sign*p:offset,m.dark);
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
    // Small post shoes and squared handrail caps finish the original balcony.
    for(let i=0;i<=posts;i++) {
      const offset=(i/posts-.5)*railSpan;
      box(.17,.105,.17,front?offset:sign*fixed,deckY+.075,front?sign*fixed:offset,m.balconyCap);
      box(.155,.055,.155,front?offset:sign*fixed,deckY+1.00,front?sign*fixed:offset,m.balconyCap);
    }
  }
  hipRoof(9.10,7.92,22.30,2.24,5.65);
  // The top is an irimoya: exposed triangular gables on both ridge ends.
  gable(4.02,1.47,1.40,23.08,3.24,'triangle',Math.PI/2);
  gable(4.02,1.47,1.40,23.08,3.24,'triangle',-Math.PI/2);
  // Paired, inward-facing shachihoko on the main ridge. Each has a stout
  // fish body, a short horned head and an upswept, forked tail.
  const fishShape=new T.Shape();
  fishShape.moveTo(-.40,.10);fishShape.quadraticCurveTo(-.49,.16,-.44,.29);
  fishShape.lineTo(-.33,.29);fishShape.lineTo(-.33,.43);fishShape.lineTo(-.22,.37);
  fishShape.lineTo(-.17,.52);fishShape.lineTo(-.06,.38);
  fishShape.bezierCurveTo(.16,.47,.23,.63,.28,.85);
  fishShape.lineTo(.28,1.10);fishShape.lineTo(.43,.94);fishShape.lineTo(.64,1.18);
  fishShape.quadraticCurveTo(.60,.88,.49,.72);
  fishShape.bezierCurveTo(.40,.40,.30,.12,.12,.04);fishShape.lineTo(-.19,.03);fishShape.closePath();
  const casting=new T.ExtrudeGeometry(fishShape,{depth:.17,bevelEnabled:true,bevelSegments:1,bevelSize:.035,bevelThickness:.035,curveSegments:7});
  for(const sign of [-1,1]) {
    const finial=new T.Group();finial.name='Shachihoko ridge casting';architecture.add(finial);
    finial.position.set(sign*2.88,24.68,0);finial.scale.x=sign;
    const fish=mesh(casting,m.ridgeFish,finial);fish.position.z=-.085;
    box(.66,.15,.31,.04,.02,0,m.tile,finial);
    for(const face of [-1,1]) {
      const z=face*.139;
      beam([-.21,.34,z],[-.29,.30,z],.031,m.tileLight,finial);
      for(let i=0;i<3;i++)beam([.04+i*.072,.15+i*.10,z],[.16+i*.065,.26+i*.10,z],.022,m.tileLight,finial);
    }
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

  // Unique surface meshes (granite polygons, roof shells and tile strips) are
  // consolidated by material. Repeated box/cylinder primitives remain shared so
  // the existing renderer can instance them; named extraction group survives.
  function consolidateSurfaces(root) {
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(), sets=new Map(), shared=new Set([boxGeometry,cylinderGeometry,tileEndGeometry,foliageGeometry,rockGeometry]);
    root.traverse(o=> {
      if(!o.isMesh||shared.has(o.geometry))return;
      if(!sets.has(o.material))sets.set(o.material,[]);
      sets.get(o.material).push(o);
    });
    for(const [mat,objects] of sets) {
      if(objects.length<2)continue;
      const positions=[],normals=[];
      for(const o of objects) {
        const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
        g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
        positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();
        o.removeFromParent();
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      g.computeBoundingBox();g.computeBoundingSphere();
      mesh(g,mat,root).name='Consolidated architectural surfaces';
    }
  }
  consolidateSurfaces(architecture);

  group.userData = {
    asset: 'karatsu-castle',
    description: 'Original miniature of the present five-tier Karatsu Castle keep',
    referenceURLs: ['https://karatsujo.com/','https://karatsujo.com/images/top-about1.jpg','https://karatsujo.com/images/top-instagram4.jpg','https://karatsujo.com/images/top-instagram5.jpg','https://www.city.karatsu.lg.jp/page/3841.html','https://www.city.karatsu.lg.jp/uploaded/image/20675.png','https://www.asobo-saga.jp/spots/detail/83cd698f-0214-46e2-8fbd-3dc0e772f7c5','https://online.bunka.go.jp/heritages/detail/442823','https://kojodan.jp/castle/146/photo/397738.html'],
    revision: '20261118-stone-passage',
    sourceBasis: 'Observed official elevation, eave-understructure and granite detail photographs; interpreted dimensions, not a survey',
    measuredSurvey: false,
    frontAxis: '+Z',
  };
  return { group, target:[0,11.0,0], halfHeight:20.0, azimuth:Math.atan2(40,55), elevation:0.40 };
}
