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
    bronze: mat(0x516c64, .79, .35),
    raised: mat(0x667e70, .85, .3),
    recess: mat(0x293e39, .97, .2),
    robe: new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.88,metalness:.28}),
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
  // Granite monolith: gently tapered upper body, plain inscription field.
  box([0,.49,0],[5,.20,4.25],M.stoneShade);
  // A square frustum gives the very slight taper of the original dressed stone.
  const pp=[],pi=[];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(const [y,w,d] of [[.59,4.55,3.97],[6.72,4.0,3.58]])for(const [x,z] of corners)pp.push(x*w/2,y,z*d/2);
  pi.push(0,2,1,0,3,2,4,5,6,4,6,7);
  for(let k=0;k<4;k++){let n=(k+1)%4;pi.push(k,n,4+n,k,4+n,4+k);}
  for(let i=0;i<pi.length;i+=3)[pi[i+1],pi[i+2]]=[pi[i+2],pi[i+1]];
  indexed(pp,pi,M.stone);
  box([0,6.74,0],[4.03,.12,3.61],M.stoneEdge);
  box([0,7.09,0],[3.46,.59,3.12],M.bronze);
  box([0,7.397,0],[3.5,.07,3.15],M.raised);
  // Subtle stone finishing marks around a blank vertical inscription panel.
  box([0,3.79,1.891],[.65,3.68,.026],M.stoneShade);
  box([0,3.8,1.909],[.59,3.59,.025],M.stone);
  for(const x of [-1.85,1.85])box([x,3.6,1.884],[.022,5.4,.012],M.stoneEdge);
  // Figure shoes and short trouser section are visible below the ankle-length robe.
  ball([-.45,7.64,.35],[.39,.21,.68]);ball([.48,7.62,.22],[.38,.19,.72]);
  ball([-.43,8.03,.07],[.31,.59,.34]);ball([.48,8.00,-.02],[.31,.56,.34]);
  curve([[-.77,7.54,.78],[-.46,7.56,.96],[-.12,7.54,.78]],.022,M.recess,10);
  curve([[.15,7.53,.75],[.49,7.54,.89],[.83,7.52,.72]],.022,M.recess,10);
  // Ring-sculpted gown, with irregular pleats and a weighted, scalloped lower hem.
  const profile=[
    [8.22,1.48,.73],[8.39,1.51,.77],[9.0,1.45,.72],[10,1.40,.70],
    [11,1.34,.68],[12,1.25,.68],[13,1.20,.68],[13.95,1.22,.62],
    [14.38,1.18,.51],[14.68,.78,.40],[14.87,.37,.29]
  ];
  const profileAt=(y)=>{
    for(let k=0;k<profile.length-1;k++)if(y<=profile[k+1][0]){
      const a=profile[k],b=profile[k+1],t=(y-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
    }return profile.at(-1).slice(1);
  };
  const gownP=[],gownI=[],N=72,H=35;
  for(let j=0;j<=H;j++){
    const y=8.22+(14.87-8.22)*j/H,[rx,rz]=profileAt(y);
    for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2;
      const crease=.07*Math.sin(a*15+.15*Math.sin(y*1.1))+.026*Math.sin(a*27-y*.10);
      const foldScale=.28+.72*Math.sin(Math.min(1,(14.87-y)/1.9)*Math.PI/2);
      const x=(rx+crease*foldScale)*Math.sin(a);
      let z=(rz+crease*foldScale)*Math.cos(a)-.09;
      z+=.045*Math.sin(y*.9+a*3)*Math.sin(a)**2;
      const hemRipple=.08*Math.sin(a*5+.3)+.035*Math.sin(a*11);
      gownP.push(x,y+hemRipple*Math.pow(1-j/H,15),z);
    }
  }
  for(let j=0;j<H;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;gownI.push(a,a+1,b,a+1,b+1,b);}
  indexed(gownP,gownI,M.robe,true);
  // Dark inner hem creates a visible thickness rather than a paper edge.
  const hemPoints=[];for(let k=0;k<=50;k++){const a=k/50*Math.PI*2;hemPoints.push([1.48*Math.sin(a),8.23+.08*Math.sin(a*5+.3),.73*Math.cos(a)-.09]);}
  curve(hemPoints,.040,M.recess,64,5);
  // Tailored lapels: curved ribbons sit proud of the much softer underlying pleats.
  function ribbon(points,width,material){
    const path=new T.CatmullRomCurve3(points.map(v)),positions=[],indices=[],steps=28;
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=path.getPoint(t),tangent=path.getTangent(t);
      const sideways=new T.Vector3(tangent.y,-tangent.x,0).normalize();
      for(const side of [-1,1])positions.push(p.x+sideways.x*width*side/2,p.y+sideways.y*width*side/2,p.z+Math.sin(t*Math.PI)*.016);
    }
    for(let i=0;i<steps;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    const o=indexed(positions,indices,material);o.material.side=T.DoubleSide;return o;
  }
  ribbon([[-.44,14.81,.18],[-.75,14.49,.43],[-.39,13.75,.64],[-.10,12.86,.66]],.32,M.raised);
  ribbon([[.43,14.81,.18],[.68,14.44,.45],[.36,13.64,.65],[.10,12.73,.67]],.30,M.raised);
  curve([[-.04,12.90,.645],[-.04,11.62,.674],[0,10.23,.716],[.02,8.34,.742]],.024,M.recess,36);
  ribbon([[.09,12.9,.688],[.10,11.6,.725],[.16,10.1,.76],[.19,8.35,.79]],.17,M.raised);
  // Baggy, elbow-length open sleeves. The wearer's right sleeve is slightly raised by the cane.
  function sleeve(side){
    const path=new T.CatmullRomCurve3([
      v([side*.93,14.42,-.06]),v([side*1.29,13.85,-.05]),v([side*1.46,12.81,.01]),v([side*1.69,side<0?11.72:11.43,.14])
    ]);
    const sp=[],si=[],radial=32,rings=17;
    for(let j=0;j<=rings;j++){
      const t=j/rings,c=path.getPoint(t),r=.29+.22*Math.sin(t*Math.PI*.8)+.12*t;
      for(let i=0;i<=radial;i++){
        const a=i/radial*Math.PI*2,f=.045*Math.sin(a*9+t*.6)+.020*Math.sin(a*17);
        sp.push(c.x+(r+f)*Math.cos(a),c.y+.18*t*Math.sin(a),c.z+(r*.90+f)*Math.sin(a));
      }
    }
    for(let j=0;j<rings;j++)for(let i=0;i<radial;i++){const a=j*(radial+1)+i,b=a+radial+1;si.push(a,a+1,b,a+1,b+1,b);}
    indexed(sp,si,M.robe,true);
    const end=path.getPoint(1);
    ball([end.x,end.y+.035,end.z],[.46,.12,.42],M.recess);
    const rim=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;rim.push([end.x+.535*Math.cos(a),end.y+.18*Math.sin(a),end.z+.48*Math.sin(a)]);}
    curve(rim,.035,M.raised,36,5);
    // Long bent folds connect shoulder pleats to the sleeve openings.
    for(let k=-1;k<=1;k++)curve([[side*(1.01+k*.12),14.36,.21],[side*(1.28+k*.11),13.51,.33],[side*(1.5+k*.10),12.55,.4],[side*(1.65+k*.12),end.y+.12,.46]],.025,M.raised,18,5);
  }
  sleeve(-1);sleeve(1);
  // Cane-bearing right hand, with a thumb and four carved fingers curled to the shaft.
  ball([-1.55,11.39,.36],[.22,.34,.24]);
  ball([-1.55,11.15,.42],[.24,.28,.21],M.raised);
  for(let i=0;i<4;i++){
    curve([[-1.71+i*.09,11.35,.53],[-1.73+i*.09,11.11,.66],[-1.68+i*.09,10.97,.51]],.059,M.bronze,9,5);
  }
  curve([[-1.31,11.28,.42],[-1.29,11.16,.61],[-1.48,11.11,.64]],.072,M.raised,10,6);
  segment([-1.62,7.44,.56],[-1.49,11.18,.53],.061,M.bronze);
  ball([-1.51,11.20,.54],[.11,.09,.11],M.raised);
  for(let i=0;i<10;i++){
    const y=7.65+i*.33,x=-1.62+(y-7.44)/3.74*.13;
    add(cylGeo,M.raised,[x,y,.555],[.079,.064,.079]);
  }
  // Standing collar, bow tie and a dignified clean-shaven elderly face.
  ball([0,14.93,-.01],[.34,.45,.33]);
  ribbon([[-.32,15.08,.19],[-.27,14.86,.35],[0,14.64,.45]],.12,M.raised);
  ribbon([[.31,15.08,.19],[.27,14.85,.35],[.04,14.64,.45]],.12,M.raised);
  ball([-.18,14.71,.445],[.23,.12,.09],M.recess);ball([.18,14.71,.445],[.23,.12,.09],M.recess);ball([0,14.72,.49],[.11,.10,.085]);
  const head=new T.Group();head.position.set(0,15.87,.035);head.rotation.y=-.035;group.add(head);
  const headG=new T.SphereGeometry(1,36,24),hp=headG.attributes.position;
  for(let i=0;i<hp.count;i++){
    let x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);
    const jaw=.82+.18*Math.exp(-Math.pow((y+.28)*2.1,2));
    x*=.61*jaw;y*=.81;z*=.49;
    if(z>0)z*=.88+.12*Math.exp(-y*y*4);
    hp.setXYZ(i,x,y,z);
  }
  headG.computeVertexNormals();add(headG,M.bronze,[0,0,0],[1,1,1],head);
  // High cheekbones, lowered jowls and strong chin keep the face human at small scale.
  ball([-.35,-.12,.365],[.225,.27,.13],M.bronze,head);ball([.35,-.12,.365],[.225,.27,.13],M.bronze,head);
  ball([-.29,-.43,.29],[.245,.26,.16],M.bronze,head);ball([.29,-.43,.29],[.245,.26,.16],M.bronze,head);
  ball([0,-.62,.27],[.30,.19,.20],M.raised,head);
  for(const side of [-1,1]){
    const ear=ball([side*.575,-.035,.015],[.13,.245,.12],M.bronze,head);ear.rotation.z=side*.10;
    ball([side*.605,-.035,.106],[.054,.15,.044],M.recess,head);
    curve([[side*.56,.12,.113],[side*.638,.07,.135],[side*.63,-.12,.132],[side*.565,-.19,.12]],.027,M.raised,12,5,head);
    // Sockets are narrow and shaded, never a pair of bright eyeballs.
    ball([side*.255,.195,.417],[.18,.064,.044],M.recess,head);
    curve([[side*.085,.197,.451],[side*.23,.246,.479],[side*.395,.185,.431]],.034,M.raised,12,5,head);
    curve([[side*.11,.18,.456],[side*.26,.157,.465],[side*.40,.175,.42]],.020,M.bronze,12,5,head);
    curve([[side*.105,.34,.421],[side*.27,.397,.424],[side*.44,.30,.35]],.068,M.bronze,12,6,head);
    curve([[side*.16,.03,.489],[side*.30,-.15,.46],[side*.40,-.32,.408]],.018,M.recess,14,5,head);
    curve([[side*.16,.035,.504],[side*.32,-.15,.475],[side*.43,-.33,.388]],.028,M.raised,14,5,head);
    curve([[side*.39,.12,.412],[side*.47,.08,.355],[side*.48,.01,.328]],.013,M.recess,9,4,head);
  }
  // Broad, clearly protruding nose with nostril wings and a shallow philtrum.
  ball([0,.12,.462],[.12,.25,.155],M.bronze,head,true);
  ball([0,-.045,.567],[.155,.12,.144],M.raised,head,true);
  ball([-.125,-.079,.535],[.086,.071,.102],M.bronze,head);ball([.125,-.079,.535],[.086,.071,.102],M.bronze,head);
  ball([-.119,-.104,.592],[.044,.025,.036],M.recess,head);ball([.119,-.104,.592],[.044,.025,.036],M.recess,head);
  curve([[0,-.13,.51],[0,-.205,.526]],.014,M.recess,6,4,head);
  // His characteristic downturned mouth is modelled as lips and a narrow carved seam.
  curve([[-.34,-.42,.391],[-.23,-.34,.475],[0,-.235,.521],[.23,-.34,.475],[.34,-.42,.391]],.041,M.raised,20,6,head);
  curve([[-.31,-.43,.405],[-.20,-.363,.488],[0,-.292,.532],[.20,-.363,.488],[.31,-.43,.405]],.020,M.recess,20,5,head);
  curve([[-.24,-.436,.439],[0,-.346,.527],[.24,-.436,.439]],.039,M.bronze,16,6,head);
  curve([[-.24,-.57,.394],[0,-.526,.461],[.24,-.57,.394]],.016,M.recess,15,4,head);
  for(let k=0;k<2;k++)curve([[-.36,.47+k*.095,.353],[0,.50+k*.08,.40],[.36,.47+k*.095,.353]],.013,M.recess,20,4,head);
  // Mortarboard and soft cylindrical crown, with a long tassel on the wearer's left.
  add(new T.CylinderGeometry(.57,.555,.49,32),M.bronze,[0,16.62,.005]);
  curve([[-.55,16.45,.01],[-.38,16.42,.40],[0,16.43,.55],[.38,16.42,.4],[.55,16.45,.01]],.025,M.raised,26,5);
  const cap=new T.Group();cap.position.set(0,16.93,0);cap.rotation.y=.23;cap.rotation.z=-.025;group.add(cap);
  const capP=[-1.0,-.035,-.72,1.0,-.035,-.72,1.0,-.035,.72,-1.0,-.035,.72,-1.0,.065,-.72,1.0,.065,-.72,1.0,.065,.72,-1.0,.065,.72];
  indexed(capP,[0,1,2,0,2,3,4,6,5,4,7,6,0,5,1,0,4,5,1,6,2,1,5,6,2,7,3,2,6,7,3,4,0,3,7,4],M.bronze,false,cap);
  ball([0,.084,0],[.085,.05,.085],M.raised,cap);
  curve([[0,.09,0],[.35,.11,.19],[.85,.08,.32],[.88,-.10,.34],[.9,-.71,.36]],.044,M.raised,20,6,cap);
  for(let i=0;i<5;i++)curve([[.84+i*.028,-.17,.33],[.85+i*.03,-.43,.345],[.89+i*.028,-.72,.36]],.023,i%2?M.bronze:M.raised,10,5,cap);
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
    form:'1932 academic gown, mortarboard, bow tie, clean-shaven face, right-hand cane',
    interpretation:true,
    sourceURLs:[
      'https://www.waseda.jp/inst/weekly/column/2011/06/02/56864/',
      'https://archive.waseda.jp/archive/vm-view.html?arg=%7B%22clipping_id%22%3A%22ace00cd83ed2439c365f1f05e894a96f%22%7D',
      'https://japan-forward.com/waseda-university-enjoy-its-garden-and-museums-for-free/'
    ]
  };
  // Camera values are radians and calibrated for a +Z front, three-quarter view.
  return { group, target:[0,7.1,-.3], halfHeight:16.7, azimuth:.48, elevation:.39 };
}
