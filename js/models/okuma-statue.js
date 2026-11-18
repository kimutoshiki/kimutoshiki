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
import { surface } from '../../scene/surface-materials.js';
import { createOkumaPlinth } from './okuma-plinth.js';
export function createOkumaStatue(T) {
  const group = new T.Group();
  group.name = 'Okuma Shigenobu — Waseda campus';
  const mat = (color, roughness = .85, metalness = 0) => new T.MeshStandardMaterial({color, roughness, metalness});
  const M = {
    bronze: mat(0x47585a, .50, .61),
    raised: mat(0x667572, .43, .66),
    recess: mat(0x2e3b3c, .74, .48),
    stone:mat(0xa6a6a0), stoneEdge:mat(0xb7b7af), stoneShade:mat(0x848981),
    paving:mat(0xc2bdb0), paving2:mat(0xb3b0a4), ground:mat(0x999b8b), soil:mat(0x5d6950),
    leaf:mat(0x6c7856), leaf2:mat(0x84916a), leaf3:mat(0x4a6550),
    trunk:mat(0x776957), wall:mat(0xd0cabc), wallShade:mat(0xb4b4a8), glass:mat(0x7f9090,.55,.05),
    rail:mat(0x5e655d,.7,.18), gravel:mat(0x9b9b85),
  };
  for(const key of ['stone','stoneEdge','stoneShade'])surface(M[key],'stone',{tint:key==='stoneShade'?'#bbc0bb':'#e0e3df'});
  const boxGeo = new T.BoxGeometry(1,1,1);
  const leafGeo = new T.IcosahedronGeometry(1,1);
  const cylGeo = new T.CylinderGeometry(1,1,1,10);
  const v = (p) => new T.Vector3(...p);
  const add = (geo, material, p=[0,0,0], s=[1,1,1], parent=group) => {
    const m = new T.Mesh(geo,material); m.position.set(...p);m.scale.set(...s);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const box = (p,s,m,parent=group) => add(boxGeo,m,p,s,parent);
  const segment = (a,b,r,m=M.bronze,parent=group) => {
    const delta=v(b).sub(v(a));const o=add(cylGeo,m,v(a).add(v(b)).multiplyScalar(.5).toArray(),[r,delta.length(),r],parent);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;
  };
  const curve = (points,r,m=M.bronze,steps=20,sides=5,parent=group) => {
    const path = new T.CatmullRomCurve3(points.map(v));
    return add(new T.TubeGeometry(path,steps,r,sides,false),m,[0,0,0],[1,1,1],parent);
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
  const sculptMaterial = new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.48,metalness:.57});
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
  for(const texture of [bronzeMap,stoneMap]){
    texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;
  }
  for(const m of [M.bronze,M.raised,M.recess,sculptMaterial]) {m.bumpMap=bronzeMap;m.bumpScale=.008;}
  for(const m of [M.stone,M.stoneShade,M.stoneEdge]) {m.bumpMap=stoneMap;m.bumpScale=.011;}
  const patina = (geo,base=0x485b60) => {
    const p=geo.attributes.position,c=[],uv=[];
    const bronze=new T.Color(base),light=new T.Color(0x87948d),dark=new T.Color(0x303d40);
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const n=.33*Math.sin(x*10.3+y*3.7+z*8.8)+.18*Math.sin(x*29.7-y*8.3+z*17.4)+.08*Math.sin(y*47.6+x*43.2);
      const color=bronze.clone().lerp(n>0?light:dark,Math.abs(n)*.31);c.push(color.r,color.g,color.b);
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
  createOkumaPlinth(T,monument,M);
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
  shoe(-.34,.34,-.09);shoe(.46,-.05,.96);
  // The figure carries its weight on the forward right foot. The head drifts
  // toward his left shoulder, while the opposite sleeve hangs well clear of
  // the body. The front panels are cut from the same draped surface.
  const torso = [
    [8.62,1.45,.735,-.05,-.045],[9.20,1.43,.72,-.032,-.064],
    [10.65,1.32,.68,-.017,-.082],[12.12,1.21,.64,.016,-.052],
    [13.38,1.13,.61,.046,-.028],[14.38,1.09,.54,.079,-.016],
    [14.89,.94,.44,.105,.006],[15.18,.65,.335,.143,.018],[15.39,.30,.246,.18,.033],
  ];
  // Ridges at the shoulder diverge gradually toward the irregular hem. Broad
  // quiet stretches alternate with tightly pinched shadow folds.
  const pleats = [
    [-2.94,-3.05,.095,.11],[-2.59,-2.73,.14,.12],[-2.29,-2.12,.13,.10],
    [-1.97,-1.78,.08,.16],[-1.70,-1.58,.14,.09],[-1.37,-1.23,.095,.10],
    [-1.09,-1.01,.16,.10],[-.79,-.66,.125,.085],[-.46,-.41,.065,.11],
    [.22,.39,.055,.09],[.49,.57,.085,.095],[.74,.85,.13,.085],
    [1.03,1.17,.16,.12],[1.38,1.48,.12,.11],[1.75,1.90,.11,.09],
    [2.04,2.24,.12,.14],[2.35,2.47,.13,.10],[2.69,2.77,.09,.12],
  ];
  const angleDistance = (a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  function clothPoint(a,t) {
    const y=mix(torso[0][0],torso.at(-1)[0],t);
    let k=0;while(k<torso.length-2 && torso[k+1][0]<y)k++;
    const lo=torso[k],hi=torso[k+1],u=(y-lo[0])/(hi[0]-lo[0]);
    const rx=mix(lo[1],hi[1],u),rz=mix(lo[2],hi[2],u);
    const x=mix(lo[3],hi[3],u),z=mix(lo[4],hi[4],u);
    let corrugation=0;
    for(const [hem,shoulder,height,width] of pleats){
      const center=mix(hem,shoulder,t)+.055*Math.sin(t*4.9+hem)*(1-t);
      const d=angleDistance(a,center);
      corrugation+=height*(Math.exp(-((d/width)**2))-.45*Math.exp(-(((d+width*1.12)/(width*.72))**2)));
    }
    corrugation*=.58+.42*Math.sin(Math.PI*(.76*t+.20));
    const opening=.12+.14*t+.035*Math.sin(t*3);
    corrugation+=.035*gauss(a,opening-.09,.085)-.087*gauss(a,opening,.042)+.055*gauss(a,opening+.10,.073);
    const hemLift=(.105*Math.sin(2*a-.3)+.043*Math.cos(5*a)+.048*gauss(a,-1.45,.34))*(1-smooth(t/.105));
    return [x+(rx+corrugation)*Math.sin(a),y+hemLift,z+(rz+corrugation)*Math.cos(a)];
  }
  const clothP=[],clothI=[],around=136,down=48;
  for(let j=0;j<=down;j++)for(let i=0;i<=around;i++)clothP.push(...clothPoint(i/around*Math.PI*2-Math.PI,j/down));
  for(let j=0;j<down;j++)for(let i=0;i<around;i++){const a=j*(around+1)+i,b=a+around+1;clothI.push(a,a+1,b,a+1,b+1,b);}
  const gown=sculpt(clothP,clothI,'Continuous pleated academic gown');
  gown.userData.sculpturePart='weighted-gown';
  const hem=[];for(let i=0;i<=88;i++)hem.push(clothPoint(Math.PI*2*i/88-Math.PI,0));
  const underside=[],underTriangles=[];
  for(const [scale,lift] of [[1,0],[.90,.065],[.38,.13],[.007,.15]]){
    for(const [x,y,z] of hem)underside.push(x*scale,y+lift,z*scale);
  }
  for(let j=0;j<3;j++)for(let i=0;i<88;i++){
    const a=j*89+i,b=a+89;underTriangles.push(a,b,a+1,a+1,b,b+1);
  }
  sculpt(underside,underTriangles,'Shadowed inner return of the hem',monument,M.recess);
  mc(hem,.018,M.bronze,90,6).name='Turned irregular hem';
  const opening=[];
  for(let j=0;j<=45;j++){
    const t=.016+.903*j/45,a=.12+.14*t+.035*Math.sin(t*3);
    const [x,y,z]=clothPoint(a-.028,t);opening.push([x,y,z+.012]);
  }
  mc(opening,.012,M.recess,48,5).name='Fold at the overlapping front of the gown';
  function facing(points,width,name,bulge=.023,material=sculptMaterial){
    const path=new T.CatmullRomCurve3(points.map(v)),p=[],idx=[],L=24,W=5;
    for(let j=0;j<=L;j++){
      const t=j/L,c=path.getPoint(t),tan=path.getTangent(t),side=new T.Vector3(tan.y,-tan.x,0).normalize();
      for(let i=0;i<=W;i++){
        const u=i/W*2-1,w=width*(.86+.14*Math.sin(Math.PI*t));
        p.push(c.x+side.x*u*w/2,c.y+side.y*u*w/2,c.z+bulge*(1-u*u));
      }
    }
    for(let j=0;j<L;j++)for(let i=0;i<W;i++){const a=j*(W+1)+i,b=a+W+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const m=sculpt(p,idx,name);m.material=material.clone();m.material.side=T.DoubleSide;return m;
  }
  for(const side of [-1,1]){
    const p=[],idx=[],L=44,W=9;
    for(let j=0;j<=L;j++)for(let i=0;i<=W;i++){
      const t=.985*j/L,across=i/W,collar=smooth((t-.7)/.285);
      const a=side*(.22+.10*side+.40*across+.30*collar);
      const pt=clothPoint(a,t),relief=.012+.038*Math.sin(Math.PI*across)+.014*gauss(across,.04,.10);
      pt[0]+=Math.sin(a)*relief;pt[2]+=Math.cos(a)*relief;p.push(...pt);
    }
    for(let j=0;j<L;j++)for(let i=0;i<W;i++){
      const a=j*(W+1)+i,b=a+W+1;
      if(side<0)idx.push(a,b,a+1,a+1,b,b+1);else idx.push(a,a+1,b,a+1,b+1,b);
    }
    sculpt(p,idx,side<0?'Right silk gown facing':'Left silk gown facing');
  }
  // The sleeve on the cane side projects out and back, then folds sharply
  // inward into the wrist. The resting arm stays much closer to the torso.
  function sleeve(side) {
    const cane=side<0,N=64,H=32;
    const centers=cane?[
      [-.56,15.12,-.11],[-.99,14.76,-.14],[-1.24,13.78,-.19],[-1.49,12.99,-.20],[-1.39,12.40,.014],
    ]:[
      [.68,15.06,-.085],[1.00,14.63,-.075],[1.12,13.86,-.04],[1.24,12.99,-.035],[1.23,12.15,.025],
    ];
    const path=new T.CatmullRomCurve3(centers.map(v)),p=[],idx=[];
    function edge(t,a){
      const c=path.getPoint(t),outer=.5+.5*side*Math.sin(a),front=Math.cos(a);
      const rx=(cane?.13:.12)+(cane?.32:.24)*smooth(t/.56)+(cane?.09:.032)*gauss(t,.76,.18);
      const rz=.18+(cane?.34:.225)*smooth(t/.70);
      const ridge=.052*Math.cos(6*a+1.20*t+.27*Math.sin(2*a))+.028*Math.cos(10*a-2.2*t);
      const bias=angleDistance(a,side*(.75+1.27*smooth((t-.45)/.55)));
      const fold=ridge*(.17+.83*smooth(t/.3)) + (cane?.14:.065)*gauss(bias,0,.20)*gauss(t,.83,.22);
      return [c.x+(rx+fold)*Math.sin(a)+(cane?-.115:0)*outer*t*t,
        c.y+(t**2)*((cane?.44:.21)*outer-.13*front-(cane?.50:.12)*outer*Math.max(0,-front)),
        c.z+(rz+fold)*front-(cane?.17:.035)*outer*t*t];
    }
    for(let j=0;j<=H;j++)for(let i=0;i<=N;i++)p.push(...edge(j/H,Math.PI*2*i/N));
    for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const m=sculpt(p,idx,cane?'Right hanging sleeve':'Left hanging sleeve');
    const edgePts=[];for(let i=0;i<=56;i++)edgePts.push(edge(1,2*Math.PI*i/56));
    mc(edgePts,.026,M.raised,58,6).name='Rolled sleeve edge';
    const center=centers.at(-1), lining=[],li=[];
    for(const [depth,scale] of [[0,1],[.16,.91],[.40,.56]]){
      for(const pt of edgePts)lining.push(mix(center[0],pt[0],scale),pt[1]+depth,mix(center[2],pt[2],scale));
    }
    for(let j=0;j<2;j++)for(let i=0;i<56;i++){const a=j*57+i,b=a+57;li.push(a,b,a+1,a+1,b,b+1);}
    sculpt(lining,li,'Deep sleeve lining',monument,M.recess);
    m.userData.sculpturePart=cane?'open-cane-sleeve':'resting-sleeve';
  }
  sleeve(-1);sleeve(1);
  // Taper each articulated finger from the knuckle, round the fingertip, and
  // leave visible notches between the four fingers and the opposing thumb.
  function finger(points,radius,name) {
    const path=new T.CatmullRomCurve3(points.map(v)),L=13,S=8;
    const geo=new T.TubeGeometry(path,L,radius,S,false),p=geo.attributes.position;
    for(let j=0;j<=L;j++){
      const t=j/L,c=path.getPointAt(t);
      const taper=(1-.27*t)*(.18+.82*Math.sqrt(Math.max(0,1-(Math.max(0,(t-.80)/.20))**2)));
      for(let i=0;i<=S;i++){const at=j*(S+1)+i;p.setXYZ(at,mix(c.x,p.getX(at),taper),mix(c.y,p.getY(at),taper),mix(c.z,p.getZ(at),taper));}
    }
    geo.computeVertexNormals();const m=add(patina(geo),sculptMaterial,[0,0,0],[1,1,1],monument);m.name=name;
  }
  ellipseLoft([[11.87,.145,.13,-1.17,.32],[11.99,.195,.173,-1.18,.305],[12.19,.18,.155,-1.21,.24],[12.43,.127,.132,-1.26,.12]],32,'Cane-bearing right palm');
  for(let i=0;i<4;i++){
    const x=-1.345+.088*i,dy=[.08,.035,0,.035][i];
    finger([[x,12.04,.41],[x-.015,11.91,.505],[x+.005,11.76+dy,.512],[x+.035,11.72+dy,.408]],.046,'Right fingers around the walking stick');
  }
  finger([[-1.05,12.14,.26],[-.985,12.02,.38],[-1.035,11.91,.47],[-1.115,11.89,.49]],.063,'Right thumb');
  mc([[-1.42,7.445,.53],[-1.33,9.68,.49],[-1.23,11.77,.436]],.041,M.bronze,32,10).name='Slender right-hand walking stick';
  mc([[-1.42,7.445,.53],[-1.414,7.58,.528]],.046,M.recess,5,9);
  mc([[-1.28,11.76,.431],[-1.23,11.86,.435],[-1.14,11.88,.421]],.060,M.raised,14,8);
  ellipseLoft([[11.91,.13,.115,1.245,.145],[12.05,.16,.14,1.25,.14],[12.28,.135,.13,1.24,.10]],28,'Relaxed left palm');
  for(let i=0;i<4;i++){
    const x=1.135+.07*i,z=.178+.025*Math.sin(i),drop=[.17,.22,.205,.145][i];
    finger([[x,12.03,z],[x+.025,11.93,z+.043],[x+.032,12.01-drop,z+.025],[x+.025,11.994-drop,z]],.037,'Relaxed left fingers');
  }
  finger([[1.135,12.14,.14],[1.081,12.03,.20],[1.077,11.975,.227]],.045,'Left thumb');
  const shirt=[],shirtI=[],shirtRows=18,shirtCols=8;
  for(let j=0;j<=shirtRows;j++){
    const u=j/shirtRows,t=.865+.134*u,width=.015+.54*u;
    for(let i=0;i<=shirtCols;i++){
      const a=.08+(2*i/shirtCols-1)*width,point=clothPoint(a,t);
      point[2]+=.034;shirt.push(...point);
    }
  }
  for(let j=0;j<shirtRows;j++)for(let i=0;i<shirtCols;i++){
    const a=j*(shirtCols+1)+i,b=a+shirtCols+1;shirtI.push(a,a+1,b,a+1,b+1,b);
  }
  const waistcoat=sculptMaterial.clone();waistcoat.color.set('#bec7c5');
  sculpt(shirt,shirtI,'V-shaped upper opening and waistcoat',monument,waistcoat);
  ellipseLoft([[15.05,.26,.23,.13,.01],[15.33,.272,.25,.17,.023],[15.65,.268,.248,.20,.045]],40,'Neck');
  facing([[-.11,15.55,.14],[-.12,15.33,.262],[.03,15.12,.37]],.104,'Right standing collar',.013);
  facing([[.43,15.54,.115],[.425,15.33,.241],[.285,15.12,.36]],.104,'Left standing collar',.013);
  const bowG=new T.SphereGeometry(1,20,12);
  for(const side of [-1,1]){
    const wing=add(bowG,M.bronze,[.16+side*.137,15.15,.358],[.145,.068,.055],monument);
    wing.rotation.z=side*.13;
  }
  add(bowG,M.raised,[.16,15.145,.397],[.053,.056,.047],monument);
  const head=new T.Group();head.name='Sculpted portrait of Okuma Shigenobu';
  head.position.set(.19,16.055,.04);head.rotation.set(-.025,.115,-.065);monument.add(head);
  // Horizontal sections captured from the portrait: broad temples, pronounced
  // zygomatic arch, full lower cheeks, and a compact projecting chin. Cubic
  // interpolation keeps the planes continuous in profile as well as head-on.
  const skull=[
    [-.665,.016,.025,.07],[-.611,.185,.165,.06],[-.52,.274,.264,.041],
    [-.39,.368,.319,.018],[-.22,.435,.361,.008],[-.07,.448,.381,.003],
    [.08,.463,.393,.005],[.24,.451,.397,.014],[.39,.439,.389,.028],
    [.54,.414,.365,.032],[.67,.347,.309,.023],[.755,.18,.177,.016],[.777,.028,.039,0],
  ];
  function skullSection(y){
    let k=0;while(k<skull.length-2&&y>skull[k+1][0])k++;
    const a=skull[k],b=skull[k+1],prev=skull[Math.max(0,k-1)],next=skull[Math.min(skull.length-1,k+2)];
    const step=b[0]-a[0],t=Math.max(0,Math.min(1,(y-a[0])/step)),t2=t*t,t3=t2*t;
    return [1,2,3].map(i=>(2*t3-3*t2+1)*a[i]+(-2*t3+3*t2)*b[i]
      +(t3-2*t2+t)*step*(b[i]-prev[i])/(b[0]-prev[0])
      +(t3-t2)*step*(next[i]-a[i])/(next[0]-a[0]));
  }
  function faceRelief(x,y){
    const ax=Math.abs(x),asym=x<0?-.008:.006;
    const lip=-.273-.123*Math.pow(Math.min(1,ax/.245),1.65)+asym*.25;
    const furrow=.14+.172*smooth((.018-y)/.38);
    let z=.077*gauss(ax,.306,.106)*gauss(y,-.055+asym,.118);
    z-=.051*gauss(ax,.327,.080)*gauss(y,-.207,.119);
    z+=.041*gauss(ax,.286,.115)*gauss(y,-.337,.129);
    z-=.040*gauss(ax,furrow,.022)*gauss(y,-.189,.154);
    z+=.029*gauss(ax,furrow+.039,.044)*gauss(y,-.162,.158);
    const browY=.215-.075*Math.pow((ax-.19)/.20,2)+asym;
    z+=.094*gauss(ax,.207,.15)*gauss(y,browY,.047);
    z-=.077*gauss(ax,.206,.112)*gauss(y,.099+asym,.05);
    z+=.035*gauss(ax,.219,.106)*gauss(y,.013+asym,.042);
    z-=.018*gauss(ax,.215,.114)*gauss(y,-.026+asym,.014);
    z+=.129*gauss(x,.007,.075)*gauss(y,.106,.198);
    z+=.195*gauss(x,.006,.084)*gauss(y,-.048,.073);
    z+=.09*gauss(ax,.096,.047)*gauss(y,-.084,.04);
    z-=.046*gauss(ax,.075,.025)*gauss(y,-.107,.017);
    z-=.020*gauss(ax,.012,.027)*gauss(y,-.173,.055);
    z+=.043*gauss(x,0,.235)*gauss(y,lip+.025,.022);
    z-=.030*gauss(x,0,.236)*gauss(y,lip,.009);
    z+=.052*gauss(x,.01,.203)*gauss(y,lip-.026,.026);
    z-=.027*gauss(x,0,.192)*gauss(y,-.405,.021);
    z+=.093*gauss(x,.012,.204)*gauss(y,-.500,.089);
    for(const crease of [.318,.392,.461]){
      z-=.010*gauss(x,.005,.29)*gauss(y,crease+.046*(x/.35)**2,.009);
    }
    z-=.017*gauss(ax,.055,.013)*gauss(y,.254,.048);
    return z;
  }
  function frontDepth(x,y){
    const [w,d,offset]=skullSection(y),cos=Math.sqrt(Math.max(0,1-(x/w)**2));
    return offset+d*cos**.70+faceRelief(x,y)*smooth((cos-.01)/.73);
  }
  const faceP=[],faceI=[],N=110,H=84;
  for(let j=0;j<=H;j++){
    const y=mix(skull[0][0],skull.at(-1)[0],j/H),[w,d,offset]=skullSection(y);
    for(let i=0;i<=N;i++){
      const a=2*Math.PI*i/N,x=w*Math.sin(a),c=Math.cos(a);
      const z=c>0?offset+d*c**.70+faceRelief(x,y)*smooth((c-.01)/.73):offset+d*c;
      faceP.push(x,y,z);
    }
  }
  for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;faceI.push(a,a+1,b,a+1,b+1,b);}
  sculpt(faceP,faceI,'Continuous bronze portrait',head);
  const bronzeLid=mat(0x66716d,.54,.55),eyeMaterial=mat(0x536064,.35,.54);
  for(const side of [-1,1]){
    const eyeP=[],eyeI=[],upper=[],lower=[],lid=[],incision=[],cols=22,rows=5;
    for(let i=0;i<=cols;i++){
      const t=i/cols,x=side*(.080+.251*t),arc=Math.sin(t*Math.PI),base=.092-.018*t+(side<0?-.008:.006);
      const top=base+.034*arc,bottom=base-.019*arc;
      for(let j=0;j<=rows;j++){
        const v=j/rows,y=mix(bottom,top,v),z=frontDepth(x,y)+.012+.036*arc*(.68+.32*Math.sin(v*Math.PI));
        eyeP.push(x,y,z);
      }
      upper.push([x,top,frontDepth(x,top)+.020+.032*arc]);
      lower.push([x,bottom,frontDepth(x,bottom)+.014+.019*arc]);
      const fold=top+.030*arc;lid.push([x,fold,frontDepth(x,fold)+.009]);
      const cut=bottom-.037*arc;incision.push([x,cut,frontDepth(x,cut)+.002]);
    }
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
      const a=i*(rows+1)+j,b=a+rows+1;
      if(side>0)eyeI.push(a,b,a+1,a+1,b,b+1);else eyeI.push(a,a+1,b,a+1,b+1,b);
    }
    sculpt(eyeP,eyeI,'Cast eye beneath the upper lid',head,eyeMaterial);
    mc(upper,.011,bronzeLid,25,6,head);mc(lower,.0075,M.bronze,24,5,head);
    mc(lid,.005,M.recess,24,5,head);mc(incision,.0045,M.recess,22,5,head);
    const x=side*.204,y=.092+(side<0?-.008:.006);
    add(bowG,M.recess,[x,y,frontDepth(x,y)+.042],[.027,.026,.008],head).name='Incised iris';
    const nostrilX=side*.083,nostrilY=-.105;
    add(bowG,M.recess,[nostrilX,nostrilY,frontDepth(nostrilX,nostrilY)+.006],[.027,.012,.006],head).name='Nostril recess';
    // The helix rolls around a recessed concha, rather than around the face.
    const earP=[],earI=[],R=10,A=36;
    for(let j=0;j<=R;j++)for(let i=0;i<=A;i++){
      const r=j/R,a=i/A*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
      earP.push(side*(.441+.044*r+.037*gauss(r,.80,.14)-.017*ca),.018+.166*r*sa,-.003+.101*r*ca+.036*r*sa);
    }
    for(let j=0;j<R;j++)for(let i=0;i<A;i++){const a=j*(A+1)+i,b=a+A+1;if(side>0)earI.push(a,a+1,b,a+1,b+1,b);else earI.push(a,b,a+1,a+1,b,b+1);}
    const ear=sculpt(earP,earI,'Modelled ear and helix',head);ear.material=sculptMaterial.clone();ear.material.side=T.DoubleSide;
    mc([[side*.499,.100,.029],[side*.498,.045,.012],[side*.501,.007,-.022],[side*.484,-.066,.005]],.015,M.raised,14,6,head);
  }
  const mouth=[];
  for(let i=0;i<=30;i++){
    const x=mix(-.208,.216,i/30),y=-.273-.123*Math.min(1,Math.abs(x)/.245)**1.65;
    mouth.push([x,y,frontDepth(x,y)+.004]);
  }
  mc(mouth,.0055,M.recess,31,5,head).name='Downturned mouth line';
  // The square board sits low and slightly oblique on the tapered skull.
  // The tassel is a single weighted textile form with fluting and a tied neck.
  const crown=ellipseLoft([[.53,.443,.393,0,.028],[.575,.449,.389,0,.018],[.70,.412,.351,.006,.014],[.805,.357,.310,.014,.018]],48,'Close-fitting academic cap crown',true,head);
  crown.material=M.bronze;
  const cap=new T.Group();cap.name='Square mortarboard and tassel';cap.position.set(.013,.815,.006);cap.rotation.set(-.025,.34,-.040);head.add(cap);
  const capGeo=new T.BoxGeometry(1.78,.056,1.31,14,1,12),cp=capGeo.attributes.position;
  for(let i=0;i<cp.count;i++){
    const x=cp.getX(i),z=cp.getZ(i);cp.setY(i,cp.getY(i)+.047-.054*x*x-.045*z*z-.020*x*z);
  }
  capGeo.computeVertexNormals();
  // The brim defines the monument's highest point. Bake its inclination once
  // so the unbatched and merged monument report the same exact metric height.
  cap.updateWorldMatrix(true,false);
  capGeo.applyMatrix4(monument.matrixWorld.clone().invert().multiply(cap.matrixWorld));
  add(capGeo,M.bronze,[0,0,0],[1,1,1],monument).name='Thin bowing square board';
  add(bowG,M.raised,[0,.079,0],[.049,.021,.049],cap);
  mc([[0,.081,0],[.33,.089,.093],[.69,.071,.20],[.872,.026,.251],[.889,-.112,.256]],.021,M.raised,28,7,cap);
  const tassel=ellipseLoft([[-.574,.034,.029,.886,.28],[-.549,.070,.051,.891,.280],[-.47,.075,.054,.889,.275],
    [-.27,.065,.049,.886,.268],[-.156,.057,.045,.88,.259],[-.101,.043,.036,.881,.257]],32,'Weighted fluted tassel',true,cap);
  const tp=tassel.geometry.attributes.position;
  for(let i=0;i<tp.count;i++){
    const x=tp.getX(i)-.886,z=tp.getZ(i)-.27,a=Math.atan2(x,z),t=1+.054*Math.cos(12*a);
    tp.setXYZ(i,.886+x*t,tp.getY(i),.27+z*t);
  }
  tassel.geometry.computeVertexNormals();tassel.material=M.raised;
  add(bowG,M.bronze,[.88,-.106,.258],[.050,.066,.042],cap).name='Tassel knot';
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
