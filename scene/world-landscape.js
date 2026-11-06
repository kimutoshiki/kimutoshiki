/** A Karatsu-inspired coastal headland, authored entirely as shared geometry.
 * World units are metres. Main walking surface: y=.05, x ±24, z -20..18.
 * No image/model requests, timers, additional lights or postprocessing passes.
 */
export function createWorldLandscape(T, { onTextureLoad = () => {} } = {}) {
  const group = new T.Group(); group.name = 'Karatsu bay · basalt headland';
  const geometries = new Set(), textures = new Set(), materialSet = new Set();
  let disposed = false, seed = 914733;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => t * t * (3 - 2 * t);
  function noiseGrid(n) { const values = Float32Array.from({ length:n*n }, random); return { n, values }; }
  const noiseLayers = [noiseGrid(8), noiseGrid(32), noiseGrid(128)];
  function noise(layer, x, y) {
    const { n, values } = layer, px=x*n, py=y*n, ix=Math.floor(px), iy=Math.floor(py), u=smooth(px-ix), v=smooth(py-iy);
    const at=(a,b)=>values[((b%n+n)%n)*n+(a%n+n)%n];
    return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;
  }
  function texture(kind, size = 512) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(size,size), data=pixels.data;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const u=x/size,v=y/size, n=noise(noiseLayers[0],u,v)*.54+noise(noiseLayers[1],u,v)*.31+noise(noiseLayers[2],u,v)*.15;
      const i=(y*size+x)*4;
      if(kind==='stone') {
        const tx=x%(size/2),ty=y%(size/2),joint=Math.min(tx,ty,size/2-tx,size/2-ty), edge=joint<2?.54:joint<4?.90:1;
        const tile=(x<size/2?0:1)+(y<size/2?0:2), shade=[1,.97,1.035,.99][tile],g=(114+n*31)*edge*shade;
        data[i]=g*.94;data[i+1]=g;data[i+2]=g*1.025;
      } else if(kind==='rock') {
        const strata=Math.sin(v*Math.PI*14+noise(noiseLayers[0],u,v)*3)*4.5, g=88+n*36+strata;
        data[i]=g*.94;data[i+1]=g;data[i+2]=g*1.018;
      } else {
        const g=145+n*76;data[i]=data[i+1]=data[i+2]=g;
      }
      data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    const map=new T.CanvasTexture(canvas);map.name='Procedural coastal '+kind;
    map.colorSpace=kind==='relief'?T.NoColorSpace:T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;textures.add(map);return map;
  }
  const stoneMap=texture('stone'),rockMap=texture('rock'),reliefMap=texture('relief',256);
  const makeMaterial=(name,options)=>{const m=new T.MeshStandardMaterial(options);m.name=name;materialSet.add(m);return m;};
  const stone=makeMaterial('Honed blue basalt paving',{color:'#bdc6c6',map:stoneMap,bumpMap:reliefMap,bumpScale:.026,roughness:.72,metalness:.035});
  const edgeStone=makeMaterial('Cut basalt risers',{color:'#8e9c9f',map:rockMap,bumpMap:reliefMap,bumpScale:.046,roughness:.86});
  const paleStone=makeMaterial('Silver basalt promenade',{color:'#c7c9bf',map:stoneMap,bumpMap:reliefMap,bumpScale:.018,roughness:.67,metalness:.025});
  const cliffMat=makeMaterial('Weathered coastal volcanic rock',{color:'#a5afa9',map:rockMap,bumpMap:reliefMap,bumpScale:.12,roughness:.98,vertexColors:true});
  const bronze=makeMaterial('Restrained champagne bronze inlay',{color:'#a58d5d',metalness:.83,roughness:.31});
  const pineBark=makeMaterial('Weathered pine bark',{color:'#5f5d4b',map:rockMap,roughness:.95,bumpMap:reliefMap,bumpScale:.06});
  const pineGreen=makeMaterial('Nijinomatsubara pine needles',{color:'#3c5147',roughness:.97,vertexColors:true});
  const mountains=[
    makeMaterial('Coast · nearest ridge',{color:'#476164',roughness:1,vertexColors:true}),
    makeMaterial('Coast · middle ridge',{color:'#667f83',roughness:1,vertexColors:true}),
    makeMaterial('Coast · distant ridge',{color:'#91a7aa',roughness:1,vertexColors:true}),
  ];
  const builders=new Map();
  function builder(material, cast=true, receive=true) {
    const key=material.uuid+':'+cast+':'+receive;
    if(!builders.has(key))builders.set(key,{material,cast,receive,positions:[],uvs:[],colors:[]});
    return builders.get(key);
  }
  function tri(b,a,c,d,uvA=[0,0],uvC=[1,0],uvD=[0,1],color=[1,1,1]) {
    b.positions.push(...a,...c,...d);b.uvs.push(...uvA,...uvC,...uvD);b.colors.push(...color,...color,...color);
  }
  function quad(b,a,c,d,e,uvA=[0,0],uvC=[1,0],uvD=[1,1],uvE=[0,1],color=[1,1,1]) {
    tri(b,a,c,d,uvA,uvC,uvD,color);tri(b,a,d,e,uvA,uvD,uvE,color);
  }
  function box(material,x,y,z,w,h,d,cast=true,receive=true) {
    const b=builder(material,cast,receive),X=w/2,Y=h/2,Z=d/2, p=(a,c,e)=>[x+a,y+c,z+e];
    quad(b,p(-X,Y,Z),p(X,Y,Z),p(X,Y,-Z),p(-X,Y,-Z),[0,0],[w/8,0],[w/8,d/8],[0,d/8]);
    quad(b,p(-X,-Y,-Z),p(X,-Y,-Z),p(X,-Y,Z),p(-X,-Y,Z),[0,0],[w/8,0],[w/8,d/8],[0,d/8]);
    quad(b,p(-X,-Y,Z),p(X,-Y,Z),p(X,Y,Z),p(-X,Y,Z),[0,0],[w/8,0],[w/8,h/8],[0,h/8]);
    quad(b,p(X,-Y,-Z),p(-X,-Y,-Z),p(-X,Y,-Z),p(X,Y,-Z),[0,0],[w/8,0],[w/8,h/8],[0,h/8]);
    quad(b,p(X,-Y,Z),p(X,-Y,-Z),p(X,Y,-Z),p(X,Y,Z),[0,0],[d/8,0],[d/8,h/8],[0,h/8]);
    quad(b,p(-X,-Y,-Z),p(-X,-Y,Z),p(-X,Y,Z),p(-X,Y,-Z),[0,0],[d/8,0],[d/8,h/8],[0,h/8]);
  }
  function polygon(points,top,bottom,topMaterial=stone,sideMaterial=edgeStone) {
    const topBuilder=builder(topMaterial), sideBuilder=builder(sideMaterial);
    const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
    for(let i=0;i<points.length;i++) {
      const a=points[i],c=points[(i+1)%points.length];
      tri(topBuilder,[center[0],top,center[1]],[c[0],top,c[1]],[a[0],top,a[1]],[center[0]/8,center[1]/8],[c[0]/8,c[1]/8],[a[0]/8,a[1]/8]);
      const length=Math.hypot(a[0]-c[0],a[1]-c[1]);
      quad(sideBuilder,[c[0],bottom,c[1]],[a[0],bottom,a[1]],[a[0],top,a[1]],[c[0],top,c[1]],[0,bottom/4],[length/4,bottom/4],[length/4,top/4],[0,top/4]);
    }
  }
  const outline=[[-24,-20],[24,-20],[24,14],[20,18],[-20,18],[-24,14]];
  polygon(outline,.05,-1.18);
  // Continuous cut-stone nosing and a narrow shadow reveal articulate the slab.
  const lowerOutline=outline.map(([x,z])=>[x*1.007,z*1.007]);
  polygon(lowerOutline,-.83,-1.31,edgeStone,edgeStone);
  // A real broad arrival stair descends to a connected sea-facing lower terrace.
  const terrace=[[-15,24.4],[15,24.4],[16.5,27.2],[14,31],[-14,31],[-16.5,27.2]];
  polygon(terrace,-2.18,-3.1,paleStone,edgeStone);
  for(let step=0;step<12;step++) {
    const top=.05-step*.185, z=17.95+step*.58;
    box(paleStone,0,top-.105,z,27.8,.21,.66);
    box(bronze,0,top+.003,z+.24,27.2,.008,.035,false);
  }
  // Two flush promenades connect the four original monuments without platforms
  // inside their reserved footprints. The entire basalt plaza remains walkable.
  box(paleStone,0,.049,-1,3.1,.006,34,false);
  box(paleStone,0,.049,1.1,45,.006,2.5,false);
  for(const x of [-1.59,1.59])box(bronze,x,.057,-1,.035,.008,34,false);
  for(const z of [-.19,2.39])box(bronze,0,.057,z,45,.008,.035,false);
  // Only a fine perimeter inlay: no rails or ornaments interrupt the skyline.
  for(const z of [-19.2,16.8])box(bronze,0,.057,z,39,.008,.04,false);
  for(const x of [-23.2,23.2])box(bronze,x,.057,-3,.04,.008,31,false);

  function cliff(points,top=-1.25,bottom=-12.5,subdivisions=8) {
    const perimeter=[];
    for(let e=0;e<points.length;e++)for(let j=0;j<subdivisions;j++) {
      const a=points[e],c=points[(e+1)%points.length],t=j/subdivisions;
      perimeter.push([a[0]*(1-t)+c[0]*t,a[1]*(1-t)+c[1]*t]);
    }
    const levels=[top,top-1.8,top-4.1,top-6.9,bottom], rings=[];
    const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
    for(let l=0;l<levels.length;l++)rings.push(perimeter.map(([x,z],i)=>{
      const angle=Math.atan2(z-cz,x-cx),jitter=l===0?.12:.4+random()*.95,spread=[.05,.42,.1,.68,1.4][l];
      return [x+Math.cos(angle)*(spread+jitter),levels[l]+(l===0?0:(random()-.5)*.65),z+Math.sin(angle)*(spread+jitter)];
    }));
    const b=builder(cliffMat);
    for(let l=0;l<rings.length-1;l++)for(let i=0;i<perimeter.length;i++) {
      const j=(i+1)%perimeter.length, shade=.71+random()*.29-l*.025;
      quad(b,rings[l+1][j],rings[l+1][i],rings[l][i],rings[l][j],[i/6,l+1],[j/6,l+1],[j/6,l],[i/6,l],[shade*.98,shade,shade*1.015]);
    }
  }
  cliff(lowerOutline);
  cliff(terrace,-3.05,-12.7,6);
  // The coastal pine spur is land contiguous with the headland, not a floating prop.
  const pineSpur=[[-39,-14],[-24,-15],[-21,-8],[-24,10],[-34,14],[-40,6]];
  polygon(pineSpur,-1.34,-2.05,edgeStone,edgeStone);cliff(pineSpur,-2.0,-12.6,5);

  const cylinder=new T.CylinderGeometry(1,1,1,7,1), matrix=new T.Object3D();geometries.add(cylinder);
  const columnRecords=[];
  for(let i=0;i<43;i++) {
    const t=i/42, x=-25+t*50, z=18.4+Math.sin(t*Math.PI)*.8;
    if(Math.abs(x)<15.5)continue;
    columnRecords.push([x,-6.3+(random()-.5),z,1.05+random()*.62,7.2+random()*2.1]);
  }
  for(let i=0;i<18;i++)columnRecords.push([24.7+random()*.5,-6.4+(random()-.5),-17+i*1.85,1.0+random()*.65,7.1+random()*2.6]);
  const columns=new T.InstancedMesh(cylinder,cliffMat,columnRecords.length);columns.name='Jointed basalt cliff columns';
  const columnColor=new T.Color();
  columnRecords.forEach(([x,y,z,r,h],i)=>{matrix.position.set(x,y,z);matrix.rotation.set((random()-.5)*.04,random()*.7,(random()-.5)*.04);matrix.scale.set(r,h,r*.8);matrix.updateMatrix();columns.setMatrixAt(i,matrix.matrix);columnColor.setRGB(.69+random()*.1,.74+random()*.1,.77+random()*.1);columns.setColorAt(i,columnColor);});
  columns.castShadow=columns.receiveShadow=true;columns.computeBoundingSphere();group.add(columns);

  // Distant Karatsu-like ridges provide three scales of atmospheric depth.
  // Their silhouettes are geometry, with no skybox/HDR/image request.
  function ridge(index,zStart,width,depth,height) {
    // Shared vertices keep the whole slope smooth; random per-face values would
    // expose every terrain triangle even with smooth shader normals.
    const nx=100,nz=16,positions=[],colors=[],uvs=[],indices=[];
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) {
      const x=-width/2+i*width/nx,z=zStart-j*depth/nz,u=i/nx,v=j/nz;
      const peaks=Math.exp(-Math.pow((u-.18)/.15,2))*.77+Math.exp(-Math.pow((u-.61)/.19,2))*.61+Math.exp(-Math.pow((u-.88)/.12,2))*.47;
      const detail=.88+.11*Math.sin(u*37+index)+.065*Math.sin(u*79-index*2);
      const h=Math.pow(Math.sin(Math.PI*clamp(v*1.35,0,1)),.82)*height*peaks*detail;
      positions.push(x,-10.35+h,z);uvs.push(u,v);
      const tone=.89+.06*clamp(h/height,0,1)+.025*Math.sin(u*7+index)*Math.sin(v*Math.PI);
      colors.push(tone*.985,tone,tone*1.015);
    }
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++) {
      const a=j*(nx+1)+i,c=a+1,d=a+nx+2,e=a+nx+1;
      indices.push(a,c,d,a,d,e);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();geometry.computeBoundingSphere();geometries.add(geometry);
    const mesh=new T.Mesh(geometry,mountains[index]);mesh.name=mountains[index].name;mesh.receiveShadow=true;group.add(mesh);
  }
  ridge(2,-150,680,160,65.6);ridge(1,-103,470,105,43.2);ridge(0,-63,330,72,24.8);

  // A small Nijinomatsubara-inspired pine stand stays outside the monument reserve.
  const trunkRecords=[], canopyRecords=[];
  for(let i=0;i<9;i++) {
    const x=-36+(i%3)*3.0+(random()-.5),z=-10+Math.floor(i/3)*8.1+(random()-.5)*2,h=4.5+random()*2.5;
    const lean=.45+random()*.55;
    trunkRecords.push({a:[x,-1.3,z],b:[x+lean,h-1.5,z+.25],r:.18+random()*.07});
    for(let branch=0;branch<3;branch++) {
      const angle=branch*2.399+i*.51, reach=1.35+random()*.85, y=h-1.8+branch*.46;
      const end=[x+lean+Math.cos(angle)*reach,y,z+.25+Math.sin(angle)*reach];
      trunkRecords.push({a:[x+lean*.8,y-.64,z+.2],b:end,r:.07});
      // Uneven overlapping needle masses keep the broad black-pine silhouette
      // while replacing the former single flattened disc with visible depth.
      for(let cluster=0;cluster<5;cluster++) {
        const direction=angle+cluster*1.47+(random()-.5)*.38;
        const reach=cluster===0?0:.64+random()*.47;
        const center=[end[0]+Math.cos(direction)*reach,end[1]+(random()-.5)*.38,end[2]+Math.sin(direction)*reach];
        canopyRecords.push({p:center,s:[.62+random()*.37,.34+random()*.27,.53+random()*.31],r:random()*Math.PI});
      }
    }
  }
  const trunks=new T.InstancedMesh(cylinder,pineBark,trunkRecords.length);trunks.name='Coastal black pine branches';
  const up=new T.Vector3(0,1,0),a=new T.Vector3(),c=new T.Vector3();
  trunkRecords.forEach((r,i)=>{a.fromArray(r.a);c.fromArray(r.b).sub(a);matrix.position.copy(a).addScaledVector(c,.5);matrix.quaternion.setFromUnitVectors(up,c.clone().normalize());matrix.scale.set(r.r,c.length(),r.r);matrix.updateMatrix();trunks.setMatrixAt(i,matrix.matrix);});
  trunks.castShadow=trunks.receiveShadow=true;trunks.computeBoundingSphere();group.add(trunks);
  const crownGeometry=new T.IcosahedronGeometry(1,1);geometries.add(crownGeometry);
  const crownPositions=crownGeometry.getAttribute('position'),crownNormals=crownGeometry.getAttribute('normal'),crownColors=[];
  for(let i=0;i<crownPositions.count;i++) {
    const x=crownPositions.getX(i),y=crownPositions.getY(i),z=crownPositions.getZ(i);
    // Coherent variation keeps duplicate triangle vertices together. Radial
    // normals remain smooth instead of converting this shared crown to facets.
    const r=1+.055*Math.sin(x*7+y*4)+.045*Math.cos(z*9-x*3);
    crownPositions.setXYZ(i,x*r,y*r,z*r);
    const length=Math.hypot(x,y,z);crownNormals.setXYZ(i,x/length,y/length,z/length);
    const shade=.87+.07*y+.035*Math.sin(x*5+z*7);crownColors.push(shade*.98,shade,shade*.96);
  }
  crownGeometry.setAttribute('color',new T.Float32BufferAttribute(crownColors,3));
  const crowns=new T.InstancedMesh(crownGeometry,pineGreen,canopyRecords.length);crowns.name='Nijinomatsubara coastal pine canopies';
  canopyRecords.forEach((r,i)=>{matrix.position.fromArray(r.p);matrix.rotation.set(.02,r.r,.05);matrix.scale.fromArray(r.s);matrix.updateMatrix();crowns.setMatrixAt(i,matrix.matrix);});
  crowns.castShadow=crowns.receiveShadow=true;crowns.computeBoundingSphere();group.add(crowns);

  // One low-frequency GPU wave surface: no CPU vertex loop, particles or
  // reflection render target. The existing scene environment provides highlights.
  const seaTime={value:0}, seaRelief=reliefMap.clone();seaRelief.repeat.set(96,64);textures.add(seaRelief);
  const seaMaterial=new T.MeshPhysicalMaterial({color:'#315d69',roughness:.27,metalness:.24,clearcoat:.4,clearcoatRoughness:.24,bumpMap:seaRelief,bumpScale:.075});materialSet.add(seaMaterial);
  seaMaterial.name='Karatsu bay · broad reflected water';
  seaMaterial.onBeforeCompile=shader=>{
    shader.uniforms.worldSeaTime=seaTime;
    shader.vertexShader='uniform float worldSeaTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat waveA=position.x*.038+position.y*.023+worldSeaTime*.31;\nfloat waveB=position.x*.071-position.y*.052-worldSeaTime*.23;\ntransformed.z+=sin(waveA)*.16+sin(waveB)*.075;`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nfloat phaseA=position.x*.038+position.y*.023+worldSeaTime*.31;\nfloat phaseB=position.x*.071-position.y*.052-worldSeaTime*.23;\nobjectNormal=normalize(vec3(-cos(phaseA)*.00608-cos(phaseB)*.005325,-cos(phaseA)*.00368+cos(phaseB)*.0039,1.0));`);
  };
  seaMaterial.customProgramCacheKey=()=> 'karatsu-ocean-v1';
  const seaGeometry=new T.PlaneGeometry(2400,2400,48,48);geometries.add(seaGeometry);
  const sea=new T.Mesh(seaGeometry,seaMaterial);sea.name='Karatsu bay ocean';sea.rotation.x=-Math.PI/2;sea.position.set(0,-10,0);sea.receiveShadow=true;sea.userData.worldSea=true;group.add(sea);

  for(const b of builders.values()) {
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));
    if(b.material.vertexColors)geometry.setAttribute('color',new T.Float32BufferAttribute(b.colors,3));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();geometries.add(geometry);
    const mesh=new T.Mesh(geometry,b.material);mesh.name=b.material.name;mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;group.add(mesh);
  }
  group.updateMatrixWorld(true);
  let triangles=0,draws=0;
  group.traverse(o=>{if(o.isMesh){draws++;triangles+=((o.geometry.index?.count||o.geometry.getAttribute('position').count)/3)*(o.isInstancedMesh?o.count:1);}});
  const stats={triangles,draws,textures:textures.size,maxTextureSide:512,externalRequests:0,pines:9,footprints:{auditorium:{center:[-12,-7],size:[10,9]},castle:{center:[13,-9],size:[10,9]},bank:{center:[9,8],size:[10,7]},statue:{center:[-4,5],size:[4,4]}}};
  group.userData.landscapeStats=stats;
  onTextureLoad('world-procedural-surfaces');
  return {group,materials:{stone,edgeStone,paleStone,cliff:cliffMat,bronze,sea:seaMaterial},sea,stats,
    cameraPlan:{position:[40,28,54],target:[0,3,0],platformY:.05,platformBounds:{min:[-24,.05,-20],max:[24,.05,18]},oceanY:-10,cliffBottom:-12.7},
    update(time,enabled=true){if(!disposed&&enabled)seaTime.value=Number.isFinite(time)?time:0;},
    dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materialSet.forEach(m=>m.dispose());},
  };
}
