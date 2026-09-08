/**
 * Original, procedural interpretation of the 1932 Waseda campus Okuma statue.
 * Front is +Z; all dimensions are display units (the monument is enlarged for legibility).
 * Sources: https://www.waseda.jp/inst/weekly/column/2011/06/02/56864/
 * https://archive.waseda.jp/archive/vm-view.html?arg=%7B%22clipping_id%22%3A%22ace00cd83ed2439c365f1f05e894a96f%22%7D
 * Photographic form references (observed, not included as textures):
 * https://cdn.japan-forward.com/wp-content/uploads/2023/06/wo-270_waseda-okuma-statue-230526_110127_020127939_pxl.jpg
 * https://images.keizai.biz/takadanobaba_keizai/headline/1597975936_photo.jpg
 * The university records a 2.89 m figure and 2.12 m pedestal. The campus planting
 * and rear architecture below are intentionally abbreviated, not a site survey.
 */
export function createOkumaStatue(T) {
  const group = new T.Group();
  group.name = 'Okuma Shigenobu — Waseda campus';
  const mat = (color, roughness = .85, metalness = 0) => new T.MeshStandardMaterial({color, roughness, metalness});
  const M = {
    bronze: mat(0x46594f, .62, .67),
    raised: mat(0x68776a, .57, .64),
    recess: mat(0x2e3e37, .78, .5),
    robe: new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.68,metalness:.58}),
    stone:mat(0xa6a6a0), stoneEdge:mat(0xb7b7af), stoneShade:mat(0x848981),
    paving:mat(0xc2bdb0), paving2:mat(0xb3b0a4), ground:mat(0x999b8b), soil:mat(0x5d6950),
    leaf:mat(0x6c7856), leaf2:mat(0x84916a), leaf3:mat(0x4a6550),
    trunk:mat(0x776957), wall:mat(0xd0cabc), wallShade:mat(0xb4b4a8), glass:mat(0x7f9090,.55,.05),
    rail:mat(0x5e655d,.7,.18), gravel:mat(0x9b9b85),
  };
  const boxGeo = new T.BoxGeometry(1,1,1);
  const ballGeo = new T.SphereGeometry(1,16,10);
  const smallBallGeo = new T.SphereGeometry(1,12,8);
  const leafGeo = new T.IcosahedronGeometry(1,1);
  const cylGeo = new T.CylinderGeometry(1,1,1,10);
  const v = (p) => new T.Vector3(...p);
  const add = (geo, material, p=[0,0,0], s=[1,1,1], parent=group) => {
    const m = new T.Mesh(geo,material); m.position.set(...p);m.scale.set(...s);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const box = (p,s,m,parent=group) => add(boxGeo,m,p,s,parent);
  const ball = (p,s,m=M.bronze,parent=group,detail=false) => add(detail?ballGeo:smallBallGeo,m,p,s,parent);
  const segment = (a,b,r,m=M.bronze,parent=group) => {
    const delta=v(b).sub(v(a));const o=add(cylGeo,m,v(a).add(v(b)).multiplyScalar(.5).toArray(),[r,delta.length(),r],parent);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;
  };
  const curve = (points,r,m=M.bronze,steps=20,sides=5,parent=group) => {
    const path = new T.CatmullRomCurve3(points.map(v));
    return add(new T.TubeGeometry(path,steps,r,sides,false),m,[0,0,0],[1,1,1],parent);
  };
  const indexed = (pos,idx,material,vertexColor=false,parent=group) => {
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
    if(vertexColor){
      const colors=[];const base=new T.Color(0x577268),light=new T.Color(0x789083),dark=new T.Color(0x3c514b);
      for(let i=0;i<pos.length;i+=3){
        const x=pos[i],y=pos[i+1],z=pos[i+2];
        const noise=.45*Math.sin(x*27+y*7+Math.sin(z*13))+.25*Math.sin(x*8-y*11+z*18)+.18*Math.sin(y*43+x*6);
        const c=base.clone().lerp(noise>0?light:dark,Math.min(.7,Math.abs(noise)*.72));colors.push(c.r,c.g,c.b);
      }
      geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    }
    return add(geo,material,[0,0,0],[1,1,1],parent);
  };
  // Thin chamfered island and a quiet gridded stone approach.
  box([0,-.27,0],[32,.55,26],M.ground);
  box([0,.04,0],[31.7,.12,25.7],M.paving);
  for(let x=-13.5;x<=13.5;x+=3){for(let z=-10.5;z<=10.5;z+=3){
    box([x,.111,z],[2.95,.025,2.95],((x+z)%6===0)?M.paving:M.paving2);
  }}
  // Low rectangular planting border enclosing the monument, open to the approach.
  box([0,.19,-1.4],[13.9,.24,10.7],M.stoneShade);
  box([0,.34,-1.4],[13.45,.17,10.25],M.soil);
  function hedge(x,z,w,d){
    box([x,.71,z],[w,.74,d],M.leaf3);
    const count=Math.max(3,Math.round(w*d/2.5));
    for(let k=0;k<count;k++){
      const a=(k*.61803398875)%1,b=(k*.41421356237+.13)%1;
      add(leafGeo,k%3?M.leaf:M.leaf2,[x+(a-.5)*w,.94+.08*Math.sin(k*3),z+(b-.5)*d],[.66,.4,.60]);
    }
  }
  hedge(-4.7,-1.4,3.8,9.8);hedge(4.7,-1.4,3.8,9.8);hedge(0,-5.5,5.8,1.5);hedge(0,3,5.8,1.6);
  // Named boundary: tabletop extraction keeps this exact monument, independently
  // of scenery or primitive ordering. Dimensions preserve the original framing.
  const monument = new T.Group();
  monument.name = 'Okuma statue monument';
  monument.userData.tabletopArchitecture = true;
  group.add(monument);
  const gauss = (x,c,w) => Math.exp(-(((x-c)/w)**2));
  const mix = (a,b,t) => a+(b-a)*t;
  const smooth = t => {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const sculptMaterial = new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.64,metalness:.66});
  // Fine casting and granite grain are bounded procedural maps, no external
  // textures or image downloads. Low bump amplitude avoids a painted toy sheen.
  const micro = new Uint8Array(96*96*4), stoneMicro = new Uint8Array(96*96*4);
  let seed=1932;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<96*96;i++) {
    const n=random(),n2=random(),k=i*4;
    const a=Math.round(122+n*31),b=Math.round(95+n2*84);
    micro.set([a,a,a,255],k);stoneMicro.set([b,b,b,255],k);
  }
  const bronzeMap = new T.DataTexture(micro,96,96,T.RGBAFormat);
  bronzeMap.wrapS=bronzeMap.wrapT=T.RepeatWrapping;bronzeMap.repeat.set(7,7);bronzeMap.needsUpdate=true;
  const stoneMap = new T.DataTexture(stoneMicro,96,96,T.RGBAFormat);
  stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;stoneMap.repeat.set(8,12);stoneMap.needsUpdate=true;
  for(const m of [M.bronze,M.raised,M.recess,M.robe,sculptMaterial]) {m.bumpMap=bronzeMap;m.bumpScale=.008;}
  for(const m of [M.stone,M.stoneShade,M.stoneEdge]) {m.bumpMap=stoneMap;m.bumpScale=.011;}
  const patina = (geo,base=0x50655a) => {
    const p=geo.attributes.position,c=[],uv=[];
    const bronze=new T.Color(base),light=new T.Color(0x819583),dark=new T.Color(0x34483c);
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const n=.33*Math.sin(x*10.3+y*3.7+z*8.8)+.18*Math.sin(x*29.7-y*8.3+z*17.4)+.08*Math.sin(y*47.6+x*43.2);
      const color=bronze.clone().lerp(n>0?light:dark,Math.abs(n)*.62);c.push(color.r,color.g,color.b);
      uv.push(x*.51+z*.37,y*.23+z*.16);
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(c,3));
    if(!geo.attributes.uv)geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    return geo;
  };
  const sculpt = (p,idx,name,parent=monument,material=sculptMaterial) => {
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();patina(g);
    const mesh=add(g,material,[0,0,0],[1,1,1],parent);mesh.name=name;return mesh;
  };
  const mb = (p,s,m=M.bronze,parent=monument) => box(p,s,m,parent);
  const mc = (p,r=.015,m=M.raised,steps=26,sides=6,parent=monument) => curve(p,r,m,steps,sides,parent);
  function ellipseLoft(rings,n,name,closed=true,parent=monument) {
    const p=[],idx=[];
    rings.forEach(([y,rx,rz,cx=0,cz=0,pleat=0],j)=>{
      for(let i=0;i<=n;i++){
        const a=i/n*Math.PI*2;
        // Major folds run uninterrupted from the shoulder to the weighted hem.
        // Their small asymmetric secondary folds follow gravity rather than rings.
        const wrinkle=pleat*(.75*Math.cos(12*a+.07*Math.sin(y*.9))+.23*Math.cos(23*a+.14*y));
        p.push(cx+(rx+wrinkle)*Math.sin(a),y,cz+(rz+wrinkle*.66)*Math.cos(a));
      }
    });
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){
      const a=j*(n+1)+i,b=a+n+1;idx.push(a,a+1,b,a+1,b+1,b);
    }
    if(closed){
      for(const j of [0,rings.length-1]){
        const r=rings[j],center=p.length/3;p.push(r[3]||0,r[0],r[4]||0);
        for(let i=0;i<n;i++)j===0?idx.push(center,j*(n+1)+i+1,j*(n+1)+i):idx.push(center,j*(n+1)+i,j*(n+1)+i+1);
      }
    }
    return sculpt(p,idx,name,parent);
  }
  // Slightly tapered dressed granite pedestal, matching the campus monolith.
  mb([0,.49,0],[5,.20,4.25],M.stoneShade);
  const pedestalG=new T.CylinderGeometry(1,1,1,4,1,false,Math.PI/4);
  const pp=pedestalG.attributes.position;
  for(let i=0;i<pp.count;i++){
    const t=pp.getY(i)+.5,w=mix(4.55,4.0,t),d=mix(3.97,3.58,t);
    pp.setXYZ(i,pp.getX(i)*w/Math.SQRT2,.59+t*6.13,pp.getZ(i)*d/Math.SQRT2);
  }
  pedestalG.computeVertexNormals();add(pedestalG,M.stone,[0,0,0],[1,1,1],monument).name='Tapered granite monolith';
  mb([0,6.74,0],[4.03,.12,3.61],M.stoneEdge);
  mb([0,7.09,0],[3.46,.59,3.12],M.bronze);
  mb([0,7.397,0],[3.5,.07,3.15],M.raised);
  mb([0,3.79,1.891],[.65,3.68,.026],M.stoneShade);
  mb([0,3.8,1.909],[.59,3.59,.025],M.stone);
  // Keep the existing blank inscription field; no invented lettering.
  for(const x of [-1.85,1.85])mb([x,3.6,1.884],[.018,5.4,.012],M.stoneEdge);
  for(const sign of [-1,1]){
    mb([0,6.865,sign*1.562],[3.39,.027,.020],M.raised);
    mb([sign*1.732,6.865,0],[.020,.027,3.05],M.raised);
  }
  // Sculpted shoes: squared heel, instep, toe and welt form one continuous skin.
  // The nearer right foot points forward; the left foot is set slightly behind.
  function shoe(x,z,turn) {
    const p=[],idx=[],N=40,H=16;
    for(let j=0;j<=H;j++){
      const t=j/H,zz=mix(-.44,.88,t),centerY=7.58+.14*gauss(t,.24,.21);
      const width=.30*Math.pow(Math.sin(Math.PI*(.045+t*.91)),.42);
      for(let i=0;i<=N;i++){
        const a=i/N*Math.PI*2,xx=width*Math.sin(a),yy=centerY+.14*Math.cos(a)*(1-.2*t);
        p.push(x+xx*Math.cos(turn)+zz*Math.sin(turn),yy,z-xx*Math.sin(turn)+zz*Math.cos(turn));
      }
    }
    // Along Z, the local ring runs X/Y; this winding faces outwards.
    for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;idx.push(a,b,a+1,a+1,b,b+1);}
    for(const j of [0,H]){const center=p.length/3;let sum=[0,0,0];for(let i=0;i<N;i++)for(let k=0;k<3;k++)sum[k]+=p[(j*(N+1)+i)*3+k]/N;p.push(...sum);for(let i=0;i<N;i++)j===0?idx.push(center,j*(N+1)+i,j*(N+1)+i+1):idx.push(center,j*(N+1)+i+1,j*(N+1)+i);}
    sculpt(p,idx,'Cast bronze shoe');
    const welt=[];
    for(let i=0;i<=40;i++){
      const a=i/40*Math.PI*2,xx=.282*Math.sin(a),zz=.19+.62*Math.cos(a);
      welt.push([x+xx*Math.cos(turn)+zz*Math.sin(turn),7.474,z-xx*Math.sin(turn)+zz*Math.cos(turn)]);
    }
    mc(welt,.017,M.recess,42,5);
    ellipseLoft([[7.72,.24,.245,x,z],[8.2,.27,.28,x,z-.035],[8.72,.29,.31,x,z-.07]],36,'Trouser ankle',true);
  }
  shoe(-.42,.31,-.075);shoe(.48,-.03,.26);
  // The museum's 1932 standing figure has a long, comparatively narrow gown.
  // The shoulder yoke and arms give breadth; the head is not oversized.
  const profile=[
    [8.47,1.25,.70,-.02,-.06,.071],[8.60,1.28,.72,-.02,-.06,.085],
    [9.20,1.27,.72,-.005,-.075,.090],[10.0,1.24,.70,.015,-.085,.091],
    [11.0,1.20,.69,.025,-.07,.088],[12.0,1.13,.67,.025,-.045,.079],
    [13.0,1.10,.65,.018,-.018,.070],[14.0,1.13,.59,.012,.00,.055],
    [14.64,1.10,.49,.01,.00,.041],[14.96,.94,.41,0,.00,.024],
    [15.18,.65,.31,0,.00,.012],[15.30,.32,.26,0,.00,0]
  ];
  const gownR=[];
  for(let k=0;k<profile.length-1;k++){
    const a=profile[k],b=profile[k+1],steps=5;
    for(let j=0;j<steps;j++)gownR.push(a.map((n,i)=>mix(n,b[i],smooth(j/steps))));
  }
  gownR.push(profile.at(-1));
  const gown=ellipseLoft(gownR,112,'Continuous pleated academic gown');
  // A broad, shallow fold on each front panel breaks the mechanical symmetry.
  const gp=gown.geometry.attributes.position;
  for(let i=0;i<gp.count;i++){
    const x=gp.getX(i),y=gp.getY(i),z=gp.getZ(i);
    const front=smooth((z+.05)/.42),weighted=smooth((14.9-y)/1.0);
    const fold=.065*gauss(x,-.49+.06*Math.sin(y*.65),.17)-.039*gauss(x,.41,.10);
    const rearYoke=smooth((y-14.21)/.51)*smooth((-z-.16)/.25);
    gp.setZ(i,z+fold*front*weighted+(z<0?.047*Math.cos(12*Math.atan2(x,z))*(1-rearYoke*.25)*rearYoke:0));
    if(y<8.65)gp.setY(i,y+(.031*Math.sin(x*8)+.022*Math.cos(x*13))*smooth((8.65-y)/.18));
  }
  gown.geometry.computeVertexNormals();
  mc([[-1.05,14.64,-.263],[-.75,14.47,-.450],[-.39,14.33,-.537],[0,14.27,-.573],[.39,14.33,-.537],[.75,14.47,-.450],[1.05,14.64,-.263]],.010,M.bronze,62,6);
  mc([[0,15.27,-.27],[0,14.95,-.435],[0,14.53,-.528],[0,14.29,-.584]],.011,M.recess,26,5);
  // Hem lip is a flattened fold, with consistent thickness when seen from below.
  const hem=[];for(let i=0;i<=80;i++){const a=i/80*Math.PI*2,r=.064*Math.cos(a*12);hem.push([(1.25+r)*Math.sin(a)-.02,8.481,(.70+r*.66)*Math.cos(a)-.06]);}
  mc(hem,.023,M.recess,90,5);
  // Convex ribbon surfaces model the fabric's broad front facings. They lie
  // against the gown and have no tube-like, detached cable appearance.
  function facing(points,width,name,bulge=.023,material=sculptMaterial) {
    const path=new T.CatmullRomCurve3(points.map(v)),p=[],idx=[],L=52,W=8;
    for(let j=0;j<=L;j++){
      const t=j/L,c=path.getPoint(t),tan=path.getTangent(t),side=new T.Vector3(tan.y,-tan.x,0).normalize();
      for(let i=0;i<=W;i++){
        const u=i/W*2-1,w=width*(.86+.14*Math.sin(Math.PI*t));
        p.push(c.x+side.x*u*w/2,c.y+side.y*u*w/2,c.z+bulge*(1-u*u));
      }
    }
    for(let j=0;j<L;j++)for(let i=0;i<W;i++){const a=j*(W+1)+i,b=a+W+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const mesh=sculpt(p,idx,name);mesh.material=material.clone();mesh.material.side=T.DoubleSide;return mesh;
  }
  facing([[-.28,15.31,.20],[-.45,14.92,.43],[-.43,14.01,.62],[-.32,12.6,.704],[-.29,10.55,.765],[-.26,8.52,.77]],.34,'Left gown facing');
  facing([[.27,15.31,.20],[.40,14.91,.43],[.38,13.99,.62],[.33,12.5,.705],[.36,10.5,.758],[.41,8.54,.762]],.32,'Right gown facing');
  mc([[.055,14.66,.44],[.065,13.95,.65],[.085,12.5,.663],[.09,10.2,.705],[.105,8.54,.723]],.013,M.recess,55,5);
  // Spacious triangular hanging sleeves, open at the cuff and joined smoothly
  // to the shoulders. Cross sections follow the arm, never a stack of spheres.
  function sleeve(side) {
    const p=[],idx=[],N=64,H=34,endY=side<0?12.27:12.16;
    const path=new T.CatmullRomCurve3([v([side*.78,14.96,-.075]),v([side*1.05,14.11,-.08]),v([side*1.16,13.06,-.01]),v([side*1.25,endY,.07])]);
    for(let j=0;j<=H;j++){
      const t=j/H,c=path.getPoint(t),rx=.20+.20*smooth(t/.5)+.06*t,rz=.25+.18*t;
      for(let i=0;i<=N;i++){
        const a=i/N*Math.PI*2,f=(.014+.037*t)*Math.cos(9*a+.17*Math.sin(t*4));
        const x=c.x+(rx+f)*Math.sin(a),z=c.z+(rz+f*.65)*Math.cos(a),y=c.y+.105*t*Math.sin(a)*side;
        p.push(x,y,z);
      }
    }
    for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;idx.push(a,b,a+1,a+1,b,b+1);}
    sculpt(p,idx,side<0?'Right hanging sleeve':'Left hanging sleeve');
    const end=path.getPoint(1),cuff=[];
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;const f=.05*Math.cos(9*a+.17*Math.sin(4));cuff.push([end.x+(.46+f)*Math.sin(a),end.y+.105*Math.sin(a)*side,end.z+(.43+f*.65)*Math.cos(a)]);}
    mc(cuff,.027,M.raised,72,6);
    // Inset dark lining is a closed modest ellipse, clear from a low viewpoint.
    const lining=new T.SphereGeometry(1,32,12);add(lining,M.recess,[end.x,end.y+.025,end.z],[.425,.055,.40],monument).name='Sleeve inner lining';
    if(side>0){
      ellipseLoft([[11.81,.14,.13,1.18,.11],[12.02,.17,.16,1.20,.11],[12.25,.13,.14,1.20,.09]],32,'Relaxed left hand');
      for(let k=0;k<3;k++)mc([[1.10+k*.061,12.04,.256],[1.10+k*.061,11.86,.225]],.009,M.recess,9,4);
    }
  }
  sleeve(-1);sleeve(1);
  // Hand and cane are fitted together. The curled fingers are continuous tapered
  // sweeps; knuckle creases stay shallow in the cast bronze surface.
  ellipseLoft([[11.50,.19,.17,-1.27,.30],[11.70,.22,.20,-1.29,.30],[11.96,.17,.17,-1.28,.21],[12.23,.13,.14,-1.27,.13]],40,'Cane-bearing hand');
  for(let i=0;i<4;i++){
    const x=-1.455+i*.082;
    mc([[x,11.83,.395],[x-.012,11.69,.518],[x+.020,11.52,.475]],.052,M.bronze,14,8);
    mc([[x-.010,11.68,.532],[x+.024,11.665,.535]],.007,M.recess,6,4);
  }
  mc([[-1.08,11.85,.30],[-1.04,11.69,.44],[-1.14,11.60,.50]],.065,M.raised,16,8);
  mc([[-1.47,7.44,.47],[-1.39,9.60,.47],[-1.31,11.73,.46]],.052,M.bronze,40,10);
  mc([[-1.47,7.44,.47],[-1.465,7.58,.47]],.065,M.recess,4,10);
  // Standing collar and bow tie remain part of the original academic dress.
  ellipseLoft([[15.03,.27,.23,0,0],[15.37,.275,.25,0,.01],[15.67,.275,.255,0,.025]],40,'Neck');
  facing([[-.27,15.55,.12],[-.28,15.32,.24],[-.13,15.08,.36]],.105,'Left standing collar',.011);
  facing([[.27,15.55,.12],[.27,15.32,.24],[.13,15.08,.36]],.105,'Right standing collar',.011);
  const bowG=new T.SphereGeometry(1,24,12);
  for(const side of [-1,1]){const b=add(bowG,M.bronze,[side*.15,15.09,.358],[.16,.075,.055],monument);b.rotation.z=side*.12;}
  add(bowG,M.raised,[0,15.09,.39],[.061,.063,.048],monument);
  // A single continuous head mesh integrates brow, sockets, nose, cheeks, mouth
  // and chin. It replaces detached cheek/jowl/nose balls that read as a toy.
  const head=new T.Group();head.name='Sculpted portrait of Okuma Shigenobu';head.position.set(0,16.035,.026);head.rotation.y=-.045;head.rotation.x=-.035;monument.add(head);
  const faceP=[],faceI=[],N=100,H=76;
  for(let j=0;j<=H;j++){
    const t=j/H,yy=mix(-.685,.685,t),s=Math.sqrt(Math.max(0,1-(yy/.69)**2));
    // An elderly, wide-jowled face, narrow at the temples and chin.
    const width=.493*s*(1+.065*gauss(yy,-.31,.21)-.035*gauss(yy,.27,.19));
    for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,x=width*Math.sin(a);let z=.397*s*Math.cos(a);
      const front=smooth((Math.cos(a)-.02)/.70);
      let sculptZ=0;
      // Fleshy cheek planes and a broad chin are integrated into the envelope.
      sculptZ+=.045*(gauss(x,-.30,.18)+gauss(x,.30,.18))*gauss(yy,-.17,.21);
      sculptZ+=.058*gauss(x,0,.28)*gauss(yy,-.53,.11);
      // Eye sockets under the brow, subtly recessed relative to the cheekbones.
      for(const side of [-1,1]){
        sculptZ-=.060*gauss(x,side*.211,.132)*gauss(yy,.105,.061);
        sculptZ+=.060*gauss(x,side*.22,.16)*gauss(yy,.207,.057);
        sculptZ+=.022*gauss(x,side*.247,.18)*gauss(yy,.023,.038);
        sculptZ-=.016*gauss(x,side*(.16+.18*smooth((-yy)/.35)),.024)*gauss(yy,-.22,.17);
      }
      // Nose bridge and alae merge into the face; the tip projects in profile.
      sculptZ+=.106*gauss(x,0,.075)*gauss(yy,.082,.19);
      sculptZ+=.166*gauss(x,0,.103)*gauss(yy,-.062,.078);
      sculptZ+=.060*(gauss(x,-.106,.058)+gauss(x,.106,.058))*gauss(yy,-.105,.045);
      // Downturned mouth: slight lip relief and a shallow central philtrum.
      const mouthY=-.305-.105*Math.pow(Math.min(1,Math.abs(x)/.255),1.8);
      sculptZ+=.040*gauss(x,0,.265)*gauss(yy,mouthY+.027,.020);
      sculptZ-=.022*gauss(x,0,.269)*gauss(yy,mouthY,.010);
      sculptZ+=.031*gauss(x,0,.235)*gauss(yy,mouthY-.024,.019);
      sculptZ-=.012*gauss(x,0,.025)*gauss(yy,-.19,.044);
      sculptZ-=.008*gauss(x,0,.32)*gauss(yy,.337+.033*(x/.35)**2,.012);
      sculptZ-=.007*gauss(x,0,.32)*gauss(yy,.418+.030*(x/.35)**2,.012);
      sculptZ+=.022*(gauss(x,-.34,.115)+gauss(x,.34,.115))*gauss(yy,-.26,.19);
      z+=sculptZ*front;
      faceP.push(x,yy,z);
    }
  }
  for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;faceI.push(a,a+1,b,a+1,b+1,b);}
  const face=sculpt(faceP,faceI,'Continuous bronze portrait',head);
  face.userData.reference='Asakura Museum official photo, 1932 standing academic-gown figure';
  // Narrow incised eyes and ears add legibility without bright eye spheres.
  for(const side of [-1,1]){
    mc([[side*.10,.10,.385],[side*.212,.116,.365],[side*.326,.095,.326]],.009,M.recess,18,5,head);
    mc([[side*.10,.111,.392],[side*.21,.137,.378],[side*.327,.103,.328]],.009,M.bronze,18,5,head);
    const earP=[],earI=[],eN=28,eH=12;
    for(let j=0;j<=eH;j++)for(let i=0;i<=eN;i++){
      const t=j/eH,a=i/eN*Math.PI*2,rr=Math.sin(t*Math.PI/2);
      earP.push(side*(.454+.065*rr*Math.cos(a)+.025*Math.sin(t*Math.PI)),.015+.166*rr*Math.sin(a),.034+.06*Math.cos(t*Math.PI/2)+.011*Math.cos(a));
    }
    for(let j=0;j<eH;j++)for(let i=0;i<eN;i++){const a=j*(eN+1)+i,b=a+eN+1;side>0?earI.push(a,b,a+1,a+1,b,b+1):earI.push(a,a+1,b,a+1,b+1,b);}
    const ear=sculpt(earP,earI,'Carved ear',head);ear.material=sculptMaterial.clone();ear.material.side=T.DoubleSide;
    mc([[side*.486,.143,.087],[side*.528,.066,.085],[side*.518,-.098,.075],[side*.479,-.139,.078]],.018,M.bronze,22,6,head);
  }
  // Crown and square mortarboard retain their recognizable shape. All six faces
  // are real outward-facing geometry, including the underside for orbit viewing.
  add(new T.CylinderGeometry(.463,.482,.37,48),M.bronze,[0,16.69,.025],[1,1,1],monument).name='Academic cap crown';
  const cap=new T.Group();cap.name='Square mortarboard and tassel';cap.position.set(0,16.93,0);cap.rotation.y=.20;cap.rotation.z=-.025;monument.add(cap);
  const capGeo=new T.BoxGeometry(2.06,.084,1.49,12,1,10),cp=capGeo.attributes.position;
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),z=cp.getZ(i);cp.setY(i,cp.getY(i)-.024*(x*x+z*z));}
  capGeo.computeVertexNormals();add(capGeo,M.bronze,[0,.055,0],[1,1,1],cap);
  for(const sign of [-1,1]){
    mc([[-1.012,.074,sign*.724],[0,.095,sign*.724],[1.012,.074,sign*.724]],.010,M.raised,28,5,cap);
    mc([[sign*1.012,.071,-.724],[sign*1.012,.076,0],[sign*1.012,.071,.724]],.010,M.raised,24,5,cap);
  }
  add(bowG,M.raised,[0,.113,0],[.065,.033,.065],cap);
  mc([[0,.114,0],[.29,.13,.13],[.81,.096,.29],[.92,.025,.31],[.94,-.55,.33]],.026,M.raised,32,7,cap);
  for(let i=0;i<8;i++)mc([[.875+i*.017,-.21,.314],[.882+i*.018,-.46,.322],[.91+i*.017,-.69,.345]],.0125,i%3?M.bronze:M.raised,16,5,cap);
  mc([[.925,-.18,.32],[.928,-.235,.324]],.071,M.recess,5,10,cap);
  // Mature trees frame the monument; asymmetric crowns keep sightlines clear.
  function tree(x,z,height,spread,index){
    segment([x,.37,z],[x+.15,height*.64,z-.15],.24,M.trunk);
    const tips=[[-.75,.64,.13],[.61,.78,.32],[-.25,.93,-.15],[.62,.58,-.52],[-.50,.49,-.47]];
    for(let k=0;k<tips.length;k++){
      const [dx,dy,dz]=tips[k],end=[x+dx*spread,height*dy,z+dz*spread];
      segment([x,height*(.35+k*.055),z],end,.10,M.trunk);
      add(leafGeo,[M.leaf,M.leaf2,M.leaf3][(k+index)%3],end,[spread*.56,height*.18,spread*.48]);
    }
  }
  tree(-9.7,-5.7,14.0,4.6,0);tree(10.5,-6.9,13.4,4.7,2);tree(-11.2,3.6,10.2,3.6,1);
  // Small understated campus wing, well behind the sculpture and tree frame.
  box([2.6,2.3,-10.1],[18.7,4.25,4.3],M.wall);
  box([2.6,4.57,-10.1],[19.0,.27,4.6],M.stoneEdge);
  box([2.6,2.26,-7.928],[18.15,.15,.14],M.stoneEdge);
  for(let i=0;i<12;i++){
    const x=-5.63+i*1.49;
    box([x,3.25,-7.904],[1.12,1.64,.10],M.glass);
    box([x,3.24,-7.82],[.047,1.63,.05],M.wall);
    box([x,3.26,-7.81],[1.15,.042,.055],M.wall);
  }
  for(let i=0;i<6;i++)box([-5.55+i*3.0,1.16,-7.79],[.27,1.95,.30],M.wallShade);
  box([1.9,1.10,-8.05],[2.4,1.99,.12],M.glass);
  for(const x of [-8.4,8.2]){
    // Campus bench set away from the foreground sightline.
    for(let k=0;k<4;k++)box([x,.90,-1.5+k*.22],[2.7,.10,.17],M.trunk);
    box([x,.52,-1.2],[2.1,.64,.08],M.rail);
    for(const dx of [-.9,.9])box([x+dx,.49,-1.16],[.10,.79,.75],M.rail);
  }
  group.userData = {
    title:'大隈重信像',
    form:'1932 academic gown, mortarboard, bow tie, clean-shaven elderly face, right-hand cane; continuous sculpted surfaces',
    interpretation:true,
    sourceURLs:[
      'https://www.waseda.jp/inst/weekly/column/2011/06/02/56864/',
      'https://archive.waseda.jp/archive/vm-view.html?arg=%7B%22clipping_id%22%3A%22ace00cd83ed2439c365f1f05e894a96f%22%7D',
      'https://www.taitogeibun.net/asakura/exhibitions/collection/okuma/'
    ]
  };
  // Camera values are radians and calibrated for a +Z front, three-quarter view.
  return { group, target:[0,7.1,-.3], halfHeight:16.7, azimuth:.48, elevation:.39 };
}
