/**
 * Former Karatsu Bank, a reference-led architectural miniature.
 * Front is +Z; Y is up. Dimensions are illustrative, not a measured survey.
 * Visual references: Shimizu NOVARE Archives, heritage_566 (exterior photos);
 * karatsu-bank.jp/history.html; Karatsu City exterior photograph 3166.
 * All surfaces are original geometry and procedural material data; photographs
 * are research references only. Dimensions are not a measured conservation survey.
 */
export function createKaratsuBank(T) {
  const group = new T.Group();
  group.name = 'Former Karatsu Bank · 1912';
  const mat = (color, roughness = 0.9, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const M = {
    brick: mat('#9c553b'), brickDark: mat('#724332'), brickLight: mat('#af6646'),
    stone: mat('#c7c2b1'), pale: mat('#e2dfcf'), shadowStone: mat('#a3a593'),
    slate: mat('#3b584e', 0.87), copper: mat('#376450', 0.62, 0.28), copperEdge: mat('#799983', 0.7, 0.16),
    glass: mat('#263d41', 0.38, 0.16), glassLight: mat('#45605b', 0.4, 0.1),
    wood: mat('#704330'), black: mat('#243430', 0.65, 0.12), dark: mat('#1c2826'),
    pavement: mat('#c0b8a4'), paver: mat('#d0c7b4'), road: mat('#6f746e'), curb: mat('#d9d3c4'),
    soil: mat('#645e42'), plant: mat('#5c734c'), plantLight: mat('#829461'), grass: mat('#879269'),
    lamp: new T.MeshStandardMaterial({ color: '#edce88', emissive: '#d6ad60', emissiveIntensity: 0.3, roughness: 0.65 }),
    mortar: new T.LineBasicMaterial({ color: '#6f3a2a', transparent: true, opacity: 0.43 }),
    pavingLine: new T.LineBasicMaterial({ color: '#999887', transparent: true, opacity: 0.4 })
  };
  // Small repeatable material maps give close views masonry grain and aged
  // roof surfaces without downloading image assets or generating extra meshes.
  function grain(seed, scale=1) {
    const size=128, data=new Uint8Array(size*size*4);
    let state=seed>>>0;
    const next=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const v=Math.round(218+(next()-.5)*44*scale+Math.sin(x*.071)*Math.sin(y*.12)*8);
      const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,v));data[i+3]=255;
    }
    const t=new T.DataTexture(data,size,size);t.wrapS=t.wrapT=T.RepeatWrapping;
    t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
    return t;
  }
  const stoneGrain=grain(1912,.65),metalGrain=grain(1908,.7),brickGrain=grain(1885,1);
  for(const key of ['stone','pale','shadowStone']) {M[key].map=stoneGrain;M[key].bumpMap=stoneGrain;M[key].bumpScale=.024;}
  for(const key of ['brick','brickDark','brickLight']) {M[key].map=brickGrain;M[key].bumpMap=brickGrain;M[key].bumpScale=.025;}
  for(const key of ['slate','copper','copperEdge']) {M[key].map=metalGrain;M[key].roughnessMap=metalGrain;M[key].bumpMap=metalGrain;M[key].bumpScale=.018;}
  const G = { box: new T.BoxGeometry(1, 1, 1), sphere: new T.IcosahedronGeometry(1, 1) };
  const cache = new Map();
  const mesh = (geo, material, x, y, z, sx = 1, sy = 1, sz = 1, parent = group) => {
    const o = new T.Mesh(geo, material); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (x,y,z,w,h,d,m=M.stone,p=group) => mesh(G.box,m,x,y,z,w,h,d,p);
  function cylinder(rt, rb, h, segments=12) {
    const key=`c:${rt}:${rb}:${h}:${segments}`;
    if (!cache.has(key)) cache.set(key,new T.CylinderGeometry(rt,rb,h,segments));
    return cache.get(key);
  }
  const cyl = (x,y,z,r,h,m=M.stone,rt=r,n=12,p=group) => mesh(cylinder(rt,r,h,n),m,x,y,z,1,1,1,p);
  function beam(a,b,r,m=M.stone,p=group) {
    const v=new T.Vector3(...b).sub(new T.Vector3(...a));
    const o=mesh(cylinder(r,r,1,6),m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,1,v.length(),1,p);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()); return o;
  }
  function poly(points,depth,material,x=0,y=0,z=0,parent=group) {
    const s=new T.Shape(); s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p); s.closePath();
    const geo=new T.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:10});
    return mesh(geo,material,x,y,z,1,1,1,parent);
  }
  function archGeo(w,stem,depth=0.08) {
    const key=`a:${w}:${stem}:${depth}`;
    if (!cache.has(key)) {
      const r=w/2,s=new T.Shape(); s.moveTo(-r,0); s.lineTo(r,0); s.lineTo(r,stem);
      s.absarc(0,stem,r,0,Math.PI,false); s.lineTo(-r,0);
      cache.set(key,new T.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:20}));
    }
    return cache.get(key);
  }
  function archBand(r,t,depth=0.15,start=0,end=Math.PI) {
    const key=`b:${r}:${t}:${depth}:${start}:${end}`;
    if (!cache.has(key)) {
      const pts=[],n=Math.max(1,Math.ceil((end-start)*24/Math.PI));
      for(let i=0;i<=n;i++){const a=start+(end-start)*i/n;pts.push([Math.cos(a)*(r+t),Math.sin(a)*(r+t)]);}
      for(let i=n;i>=0;i--){const a=start+(end-start)*i/n;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
      const s=new T.Shape();s.moveTo(...pts[0]);pts.slice(1).forEach(p=>s.lineTo(...p));s.closePath();
      cache.set(key,new T.ExtrudeGeometry(s,{depth,bevelEnabled:false}));
    }
    return cache.get(key);
  }
  function wallPlane(rotation,x,z) {
    const p=new T.Group();p.position.set(x,0,z);p.rotation.y=rotation;group.add(p);return p;
  }
  function hipRoof(x,z,w,d,y,h,material=M.slate) {
    const ridge=Math.max(0,w/2-d*0.36);
    const v=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[-ridge,h,0],[ridge,h,0]];
    const f=[0,5,1,0,4,5,1,5,2,2,4,3,2,5,4,3,4,0];
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(f.flatMap(i=>v[i]),3));geom.setAttribute('uv',new T.Float32BufferAttribute(f.flatMap(i=>[v[i][0]/2,v[i][2]/2]),2));geom.computeVertexNormals();
    mesh(geom,material,x,y,z);
    beam([x-ridge,y+h+0.02,z],[x+ridge,y+h+0.02,z],0.10,M.copperEdge);
    for(const [a,b] of [[0,4],[1,5],[2,5],[3,4]]) beam([x+v[a][0],y,z+v[a][2]],[x+v[b][0],y+h,z+v[b][2]],0.045,M.copper);
    // Slate courses on the two broad roof pitches, kept as fine geometry lines.
    const lines=[];
    for(let j=1;j<9;j++) {const t=j/9,yy=y+h*t+0.025,xx=w/2-(w/2-ridge)*t,zz=d/2*(1-t);
      lines.push(-xx+x,yy,z+zz,xx+x,yy,z+zz,-xx+x,yy,z-zz,xx+x,yy,z-zz);}
    const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(lines,3));
    group.add(new T.LineSegments(lg,new T.LineBasicMaterial({color:'#63766c',transparent:true,opacity:0.55})));
  }
  function brickLines(w,h,base,p,exclude=[]) {
    const a=[];const skip=(x,y)=>exclude.some(r=>x>r[0]&&x<r[1]&&y>r[2]&&y<r[3]);
    for(let row=0;row<Math.floor(h/.23);row++) {
      const y=base+row*.23;
      for(let x=-w/2;x<w/2;x+=.68) {
        const mid=x+.34;if(!skip(mid,y))a.push(x,y,.041,Math.min(x+.68,w/2),y,.041);
        const xx=x+(row%2?.34:0);if(!skip(xx,y+.11))a.push(xx,y,.041,xx,y+.23,.041);
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(a,3));p.add(new T.LineSegments(geo,M.mortar));
  }
  function rectangularWindow(x,y,w,h,p,ornate=true) {
    box(x,y+h/2,.105,w+.2,h+.2,.13,M.dark,p);box(x,y+h/2,.19,w,h,.1,M.glass,p);
    for(const dx of [-w/2,w/2])box(x+dx,y+h/2,.25,.105,h+.1,.13,M.wood,p);
    box(x,y+.09,.26,w,.15,.14,M.wood,p);box(x,y+h-.03,.26,w,.15,.14,M.wood,p);
    for(const dx of (w<1.6?[0]:[-w/6,w/6]))box(x+dx,y+h/2,.26,.065,h,.14,M.wood,p);
    for(const yy of [.22,.43,.64,.84])box(x,y+h*yy,.27,w,.075,.13,M.wood,p);
    box(x,y-.12,.26,w+.52,.22,.45,M.stone,p);
    if(ornate) {
      box(x,y+h+.20,.20,w+.5,.28,.28,M.stone,p);
      for(const dx of [-w/2-.19,w/2+.19])for(let k=0;k<5;k++)box(x+dx,y+.28+k*(h-.3)/4,.17,.25,k%2?.25:.39,.24,M.stone,p);
    }
  }
  function archedWindow(x,y,w,stem,p) {
    const r=w/2;
    mesh(archGeo(w+.18,stem,.12),M.dark,x,y-.05,.08,1,1,1,p);
    mesh(archGeo(w,stem,.10),M.glass,x,y,.20,1,1,1,p);
    mesh(archBand(r-.04,.13,.12),M.wood,x,y+stem,.29,1,1,1,p);
    for(const dx of [-r,r])box(x+dx,y+stem/2,.29,.13,stem,.16,M.wood,p);
    box(x,y+.07,.3,w,.14,.17,M.wood,p);box(x,y+stem,.31,w,.12,.16,M.wood,p);
    for(const dx of [-w/6,w/6])box(x+dx,y+stem/2,.32,.085,stem,.15,M.wood,p);
    for(const dx of [-w/3,0,w/3])box(x+dx,y+stem/2,.32,.032,stem,.14,M.wood,p);
    for(const ratio of [.33,.67])box(x,y+stem*ratio,.32,w,.053,.14,M.wood,p);
    for(let i=1;i<8;i++) {const a=Math.PI*i/8;beam([x,y+stem,.32],[x+Math.cos(a)*r,y+stem+Math.sin(a)*r,.32],.023,M.wood,p);}
    for(const ratio of [.44,.72])mesh(archBand(r*ratio,.035,.045),M.wood,x,y+stem,.33,1,1,1,p);
    // The outer arcade is larger than the glazed fanlight: brick tympanum,
    // alternating granite voussoirs, and layered curved stone cornices.
    mesh(archBand(r+.06,.61,.18),M.brickLight,x,y+stem,.11,1,1,1,p);
    for(let i=0;i<11;i++) {
      const gap=.018,a=i*Math.PI/11+gap,b=(i+1)*Math.PI/11-gap;
      if(i%2===0)mesh(archBand(r+.10,.59,.22,a,b),M.stone,x,y+stem,.17,1,1,1,p);
    }
    mesh(archBand(r+.68,.13,.20),M.shadowStone,x,y+stem,.22,1,1,1,p);
    mesh(archBand(r+.81,.075,.15),M.pale,x,y+stem,.19,1,1,1,p);
    mesh(archBand(r+.09,.075,.23),M.stone,x,y+stem,.18,1,1,1,p);
    for(const dx of [-r-.45,r+.45]) {
      box(x+dx,y+stem+.01,.23,.73,.26,.42,M.stone,p);
      poly([[-.25,0],[.25,0],[0,.29]],.28,M.shadowStone,x+dx,y+stem-.29,.20,p);
    }
    box(x,y-.15,.25,w+.68,.23,.45,M.stone,p);
    box(x,y-.36,.12,w+.34,.16,.30,M.shadowStone,p);
    for(const dx of [-r+.06,0,r-.06]) {
      box(x+dx,y-.43,.15,.28,.24,.30,M.shadowStone,p);
      if(!cache.has('sillBoss'))cache.set('sillBoss',new T.ConeGeometry(.21,.17,4));
      const boss=mesh(cache.get('sillBoss'),M.stone,x+dx,y-.40,.40,1,1,1,p);
      boss.rotation.x=Math.PI/2;boss.rotation.z=Math.PI/4;
    }
    poly([[-.16,0],[.16,0],[.27,.83],[-.27,.83]],.31,M.stone,x,y+stem+r+.01,.28,p);
  }
  function portico(x,p) {
    box(x,2.80,.075,2.5,4.1,.15,M.dark,p);
    box(x,2.7,.18,1.8,3.8,.18,M.wood,p);
    for(const dx of [-.46,.46]) {
      box(x+dx,3.38,.29,.65,1.9,.04,M.glass,p);box(x+dx,1.98,.3,.64,.69,.06,M.brickDark,p);
      box(x+dx,3.35,.34,.06,1.9,.05,M.wood,p);
    }
    for(const yy of [2.55,3.25,4.35])box(x,yy,.35,1.86,.10,.09,M.wood,p);
    for(const dx of [-1.48,1.48]) {
      box(x+dx,1.03,1.0,.85,.36,.90,M.stone,p);
      cyl(x+dx,1.34,1.0,.36,.2,M.stone,.41,16,p);
      cyl(x+dx,2.92,1.0,.29,3.02,M.pale,.25,16,p);
      for(let k=0;k<12;k++) {const a=k*Math.PI/6;beam([x+dx+Math.cos(a)*.275,1.55,1+Math.sin(a)*.275],[x+dx+Math.cos(a)*.24,4.37,1+Math.sin(a)*.24],.013,M.shadowStone,p);}
      cyl(x+dx,4.48,1.0,.34,.17,M.stone,.35,16,p);
      box(x+dx,4.65,1.0,.82,.22,.8,M.stone,p);
      // Restrained Ionic volutes, shared torus geometry.
      const key='volute'; if(!cache.has(key))cache.set(key,new T.TorusGeometry(.15,.045,5,12));
      for(const q of [-.23,.23])mesh(cache.get(key),M.shadowStone,x+dx+q,4.58,1.43,1,1,1,p);
    }
    for(const [yy,hh,ww,dd] of [[4.88,.24,3.95,1.72],[5.10,.17,4.16,1.92],[5.30,.24,4.37,2.1]]) box(x,yy,.69,ww,hh,dd,M.stone,p);
    poly([[-2.08,0],[2.08,0],[0,1.30]],1.15,M.stone,x,5.40,-.1,p);
    poly([[-1.6,.15],[1.6,.15],[0,1.12]],.11,M.slate,x,5.40,1.065,p);
    beam([x-2.2,5.43,1.17],[x,6.79,1.17],.13,M.copper,p);beam([x,6.79,1.17],[x+2.2,5.43,1.17],.13,M.copper,p);
    box(x,5.43,1.13,4.6,.12,.32,M.copper,p);
    for(let s=0;s<3;s++)box(x,.49+s*.13,1.12-s*.25,3.7-s*.25,.17,2.20-s*.45,M.stone,p);
  }
  function crown(x,z) {
    // Octagonal white drum and curved green copper cupola. The upper lantern
    // is genuinely open between four posts, as in the official exterior photo.
    for(const [y,h,rt,rb,m] of [[11.49,.24,1.06,1.02,M.copper],
      [11.90,.61,.89,.93,M.pale],[12.27,.16,1.10,.96,M.copper],
      [12.41,.15,1.05,1.10,M.copperEdge]]) {
      const o=cyl(x,y,z,rb,h,m,rt,8);o.rotation.y=Math.PI/8;
    }
    const profile=[[1.01,0],[.99,.09],[.88,.20],[.80,.37],[.77,.51],[.69,.66],[.57,.78],[.45,.84],[.38,.91]];
    const roof=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),16);
    roof.computeVertexNormals();mesh(roof,M.copper,x,12.46,z);
    for(let i=0;i<8;i++) {
      const a=Math.PI/8+i*Math.PI/4;
      for(let j=0;j<profile.length-1;j++) {
        const [r0,y0]=profile[j],[r1,y1]=profile[j+1];
        beam([x+Math.cos(a)*(r0+.014),12.46+y0,z+Math.sin(a)*(r0+.014)],
          [x+Math.cos(a)*(r1+.014),12.46+y1,z+Math.sin(a)*(r1+.014)],.026,M.copperEdge);
      }
    }
    cyl(x,13.39,z,.46,.13,M.copperEdge,.40,8);
    for(const dx of [-.35,.35])for(const dz of [-.35,.35])box(x+dx,13.77,z+dz,.10,.72,.10,M.copperEdge);
    box(x,14.16,z,.92,.16,.92,M.copper);
    const cap=cyl(x,14.35,z,.66,.25,M.copper,.12,4);cap.rotation.y=Math.PI/4;
    cyl(x,14.64,z,.036,.45,M.black,.024,8);
    mesh(G.sphere,M.copperEdge,x,14.91,z,.09,.12,.09);
    cyl(x,15.13,z,.018,.34,M.black,.009,6);
  }
  function crest(x,y,p,large=false) {
    if(!large) {
      const s=new T.Shape();s.moveTo(-.91,0);s.lineTo(.91,0);s.lineTo(.91,.26);
      s.lineTo(.68,.30);s.absarc(0,.49,.68,0,Math.PI,false);s.lineTo(-.91,.26);s.closePath();
      const o=mesh(new T.ExtrudeGeometry(s,{depth:.27,bevelEnabled:false,curveSegments:14}),M.pale,x,y,.07,1,1,1,p);
      o.name='Rounded parapet crest';
      mesh(archBand(.68,.078,.075),M.copperEdge,x,y+.49,.35,1,1,1,p);
      const key='medallion';if(!cache.has(key))cache.set(key,new T.TorusGeometry(.30,.055,5,18));
      mesh(cache.get(key),M.shadowStone,x,y+.62,.36,1,1,1,p);
      box(x,y+.06,.29,1.92,.13,.35,M.copper,p);
      beam([x,y+1.16,.27],[x,y+1.88,.27],.022,M.black,p);
      mesh(G.sphere,M.copperEdge,x,y+1.28,.27,.07,.09,.07, p);
      return;
    }
    // Curved Dutch gable on the narrow street elevation, with its recessed
    // attic opening and scrolling stone shoulders instead of a flat triangle.
    const s=new T.Shape();s.moveTo(-2.50,0);s.lineTo(2.50,0);s.lineTo(2.50,.35);
    s.bezierCurveTo(2.40,.59,1.77,.40,1.68,.97);
    s.bezierCurveTo(1.48,1.77,.89,1.58,.77,2.01);
    s.bezierCurveTo(.55,2.71,.12,2.85,0,2.90);
    s.bezierCurveTo(-.12,2.85,-.55,2.71,-.77,2.01);
    s.bezierCurveTo(-.89,1.58,-1.48,1.77,-1.68,.97);
    s.bezierCurveTo(-1.77,.40,-2.40,.59,-2.50,.35);s.closePath();
    mesh(new T.ExtrudeGeometry(s,{depth:.38,bevelEnabled:false,curveSegments:10}),M.pale,x,y,.06,1,1,1,p);
    const outline=s.getPoints(50);
    for(let i=0;i<outline.length-1;i++)beam([x+outline[i].x,y+outline[i].y,.49],[x+outline[i+1].x,y+outline[i+1].y,.49],.085,M.copperEdge,p);
    mesh(archGeo(1.42,.67,.12),M.dark,x,y+.59,.47,1,1,1,p);
    mesh(archBand(.71,.19,.15),M.stone,x,y+1.26,.55,1,1,1,p);
    for(const dx of [-.48,0,.48])box(x+dx,y+1.12,.66,.065,1.0,.12,M.wood,p);
    box(x,y+.98,.66,1.4,.07,.13,M.wood,p);
    box(x,y+.58,.61,1.83,.16,.27,M.stone,p);
    const scrollGeo=new T.TorusGeometry(.23,.07,6,18);
    for(const dx of [-1.65,1.65])mesh(scrollGeo,M.shadowStone,x+dx,y+.94,.47,1,1,1,p);
    for(const dx of [-2.08,2.08]) {
      cyl(x+dx,y+.61,.33,.13,.22,M.copper,.08,8,p);
      beam([x+dx,y+.73,.33],[x+dx,y+1.35,.33],.021,M.black,p);
    }
    beam([x,y+2.9,.35],[x,y+3.75,.35],.025,M.black,p);
  }

  // A small street-corner plinth. No geographical text or fabricated signage.
  box(0,-.15,0,42,.4,32,M.shadowStone);
  box(0,.08,0,41.7,.18,31.7,M.road);
  box(.7,.27,-.8,34.4,.24,24.8,M.curb);
  box(.7,.415,-.8,34.0,.10,24.4,M.pavement);
  const paving=[];
  for(let x=-16;x<18;x+=1.3)paving.push(x,.473,-12.9,x,.473,11.3);
  for(let z=-12.5;z<11.5;z+=1.25)paving.push(-16.3,.473,z,17.7,.473,z);
  const pg=new T.BufferGeometry();pg.setAttribute('position',new T.Float32BufferAttribute(paving,3));group.add(new T.LineSegments(pg,M.pavingLine));
  // Light roadway markers avoid an unnecessary modern streetscape.
  for(let x=-17;x<20;x+=4)box(x,.185,14.25,1.9,.016,.12,M.curb);
  for(let z=-13;z<14;z+=4)box(-19.15,.185,z,.12,.016,1.9,M.curb);

  const architectureStart=group.children.length;
  const W=28,D=15,Z=-1.45,F=6.05,B=-8.95;
  box(0,5.81,Z,W,10.62,D,M.brick).name='Karatsu Bank masonry core';
  // The pale granite basement is pronounced on the original building.
  box(0,1.15,Z,W+.18,1.30,D+.18,M.stone);
  for(const [y,h,pad,m] of [[1.85,.19,.25,M.stone],[11.02,.22,.33,M.shadowStone],[11.21,.16,.6,M.stone],[11.39,.19,.72,M.copper]])box(0,y,Z,W+pad,h,D+pad,m);
  box(0,11.43,Z,28.43,.09,15.43,M.shadowStone).name='Closed eave soffit';
  hipRoof(0,Z,28.45,15.45,11.47,1.70);
  // Masonry and windows are grouped by facade so all four sides are finished.
  const front=wallPlane(0,0,F),back=wallPlane(Math.PI,0,B),left=wallPlane(-Math.PI/2,-14,Z),right=wallPlane(Math.PI/2,14,Z);
  const frontWindows=[-6.1,0,6.1];
  for(const p of [front]) {
    box(0,10.52,.06,26.8,1.07,.16,M.pale,p);
    // Broad light render panels, visible in the current city/owner photographs,
    // distinguish this facade from a generic all-brick Victorian bank.
    for(const x of [-9.11,-3.05,3.05,9.11]) {
      box(x,6.20,.045,1.55,8.70,.085,M.pale,p);
      box(x,10.15,.087,1.55,1.78,.085,M.pale,p);
    }
    for(const x of [-10.8,10.8])box(x,10.07,.05,2.7,1.9,.08,M.pale,p);
    for(const x of frontWindows) {
      for(const dx of [-.78,.78]) {
        rectangularWindow(x+dx,2.05,1.08,3.25,p,false);
        box(x+dx,5.44,.14,1.22,.25,.30,M.shadowStone,p);
        box(x+dx,5.62,.21,1.33,.12,.40,M.stone,p);
        box(x+dx,5.73,.15,1.27,.09,.27,M.pale,p);
      }
      archedWindow(x,7.03,2.83,1.12,p);
      box(x,10.57,.17,.38,1.04,.29,M.stone,p);
    }
    for(const x of [-12.15,-9.14,-3.05,3.05,9.14,12.15]) {
      box(x,6.6,.06,.30,8.70,.16,M.pale,p);
      for(let row=0;row<14;row++) {
        const dx=row%2?.56:-.56;
        box(x+dx,2.20+row*.61,.15,.47,.26,.24,M.stone,p);
      }
      box(x,10.87,.20,.82,.23,.37,M.stone,p);
    }
    for(const x of [-10.8,10.8]) {
      rectangularWindow(x,7.10,1.0,1.92,p,false);
      box(x,9.33,.12,1.42,.22,.25,M.stone,p);
      box(x,10.15,.075,2.6,1.58,.19,M.pale,p);
      // Small projecting balcony over each door, with stone brackets.
      box(x,6.91,.41,2.53,.18,.98,M.stone,p);
      for(const dx of [-.87,.87]) {
        box(x+dx,6.73,.23,.36,.40,.54,M.shadowStone,p);
        for(const k of [0,1,2])box(x+dx,7.16,.29+k*.22,.10,.37,.10,M.stone,p);
      }
      for(const dx of [-.80,-.40,0,.40,.80])box(x+dx,7.15,.86,.10,.36,.11,M.stone,p);
      box(x,7.39,.86,2.62,.13,.24,M.stone,p);
      for(const dx of [-1.20,1.20])box(x+dx,7.40,.42,.16,.12,.90,M.stone,p);
    }
    brickLines(27.7,8.1,1.90,p,frontWindows.flatMap(x=>[[x-1.85,x+1.85,1.8,5.6],[x-1.95,x+1.95,6.15,10.0]]));
  }
  for(const p of [left]) {
    box(0,10.47,.08,13.9,1.18,.16,M.pale,p);
    for(const x of [-3.25,3.25])box(x,6.20,.041,1.68,8.70,.082,M.pale,p);
    for(const dx of [-.78,.78]) {
      rectangularWindow(dx,2.05,1.09,3.24,p,false);
      box(dx,5.44,.14,1.22,.25,.30,M.shadowStone,p);
      box(dx,5.62,.21,1.33,.12,.40,M.stone,p);
      box(dx,5.73,.15,1.27,.09,.27,M.pale,p);
    }
    archedWindow(0,6.98,3.04,1.1,p);
    for(const x of [-5.12,5.12]) {
      rectangularWindow(x,2.07,1.20,3.23,p);rectangularWindow(x,7.20,1.22,1.95,p);
      box(x,10.01,.08,1.68,1.0,.16,M.pale,p);
    }
    for(const x of [-3.16,3.16]) {
      box(x,6.42,.075,.34,8.75,.15,M.pale,p);
      for(let row=0;row<14;row++)box(x+(row%2?.60:-.60),2.20+row*.61,.16,.50,.26,.24,M.stone,p);
      box(x,10.88,.17,.93,.22,.31,M.stone,p);
    }
    brickLines(14.7,8.1,1.90,p,[[-2.1,2.1,1.8,5.6],[-2.3,2.3,6.0,10.0],[-6.0,-4.2,1.8,9.5],[4.2,6.0,1.8,9.5]]);
  }
  for(const p of [front,left,right,back]) {
    const width=p===front||p===back?W:D;
    for(let x=-width/2+.6;x<width/2;x+=.60)box(x,10.98,.26,.22,.26,.40,M.stone,p);
    for(let x=-width/2+.8;x<width/2;x+=1.05)box(x,1.21,.13,.018,1.15,.025,M.shadowStone,p);
    box(0,1.22,.14,width,.018,.029,M.shadowStone,p);
  }
  // Broad rusticated corner pilasters carry the characteristic miniature crowns.
  for(const x of [-13.63,13.63])for(const z of [F-.36,B+.36]) {
    box(x,6.04,z,1.05,9.96,1.05,M.brickLight);
    for(let k=0;k<8;k++)box(x,2.25+k*1.22,z,1.14,.26,1.14,M.stone);
    box(x,10.95,z,1.26,.28,1.26,M.stone);
  }
  portico(-10.82,front);portico(10.82,front);
  // Rear elevations use paired rectangular sashes, based on the owner’s
  // rear-garden photographs, rather than duplicating the street arcade.
  for(const p of [back,right]) {
    const width=p===back?28:15;
    box(0,6.45,.032,width-.5,8.86,.06,M.pale,p);
    const pairs=p===back?[-9.8,-3.35,3.35,9.8]:[-4.25,3.3];
    for(const center of pairs) {
      const brickWidth=p===back?4.8:4.5;
      box(center,6.30,.076,brickWidth,8.36,.08,M.brick,p);
      for(const dx of [-.94,.94]) {
        rectangularWindow(center+dx,2.08,1.16,3.22,p,false);
        rectangularWindow(center+dx,6.73,1.16,2.52,p,false);
        box(center+dx,5.57,.16,1.52,.22,.28,M.stone,p);
        box(center+dx,9.60,.16,1.53,.23,.26,M.stone,p);
      }
      for(const y of [2.27,3.5,4.73,6.67,8.03,9.54])for(const dx of [-brickWidth/2,brickWidth/2])
        box(center+dx,y,.14,.54,.22,.19,M.stone,p);
    }
    box(0,10.77,.12,width,.47,.20,M.pale,p);
    const exclusions=pairs.flatMap(c=>[-.94,.94].map(dx=>[c+dx-.7,c+dx+.7,1.8,9.7]));
    brickLines(width-.1,8.7,1.9,p,exclusions);
  }
  crown(-13.61,F-.36);crown(13.61,F-.36);
  // The architectural scroll-gable is on the short end, while low curved
  // decorative crests sit along the long eaves between the corner crowns.
  crest(0,11.32,left,true);
  for(const x of [-10.82,10.82])crest(x,11.35,front);
  for(const x of [-7.8,7.8]) {
    box(x,13.41,Z-.65,.70,1.64,.74,M.brickDark);
    for(const y of [12.92,13.36,13.82])box(x,y,Z-.65,.77,.11,.81,M.stone);
    box(x,14.21,Z-.65,.98,.22,.95,M.stone);box(x,14.36,Z-.65,.88,.12,.9,M.slate);
  }
  // The square rear corner tower is taller than the round street cupolas.
  // Its steep, dormered mansard and roof cresting are visible in the city’s
  // street photograph and the rear-side photographic survey.
  const tx=-10.9,tz=-6.34,tw=6.2,td=5.22,ty=13.67;
  box(tx,12.53,tz,tw,2.52,td,M.brick).name='Raised square rear corner tower';
  for(const [y,h,pad,m] of [[11.55,.19,.18,M.stone],[12.86,1.14,.13,M.pale],
    [13.46,.20,.3,M.shadowStone],[13.64,.16,.56,M.copper]])box(tx,y,tz,tw+pad,h,td+pad,m);
  const towerFaces=[wallPlane(0,tx,tz+td/2),wallPlane(Math.PI,tx,tz-td/2),
    wallPlane(-Math.PI/2,tx-tw/2,tz),wallPlane(Math.PI/2,tx+tw/2,tz)];
  for(const p of towerFaces) {
    for(const x of [-1.5,-.52,.52,1.5]) {
      box(x,12.81,.13,.55,.51,.12,M.dark,p);
      box(x,12.81,.20,.035,.51,.06,M.wood,p);
      box(x,12.51,.17,.71,.08,.20,M.stone,p);
    }
    for(const x of [-2.68,2.68])box(x,12.06,.11,.55,.27,.19,M.stone,p);
    box(0,13.60,.15,5.95,.12,.27,M.copperEdge,p);
  }
  // Four closed mansard pitches and a shallow flat crown.
  const bottom=[[-3.35,0,-2.86],[3.35,0,-2.86],[3.35,0,2.86],[-3.35,0,2.86]],
    top=[[-2.0,2.29,-1.49],[2.0,2.29,-1.49],[2.0,2.29,1.49],[-2.0,2.29,1.49]],pos=[];
  for(let k=0;k<4;k++) {const next=(k+1)%4;pos.push(...bottom[k],...top[next],...bottom[next],...bottom[k],...top[k],...top[next]);}
  pos.push(...top[0],...top[2],...top[1],...top[0],...top[3],...top[2]);
  const tg=new T.BufferGeometry();tg.setAttribute('position',new T.Float32BufferAttribute(pos,3));tg.setAttribute('uv',new T.Float32BufferAttribute(pos.flatMap((value,index)=>index%3===1?[]:[value/2]),2));tg.computeVertexNormals();
  mesh(tg,M.slate,tx,ty,tz).name='Rear tower mansard';
  for(let k=0;k<4;k++) {
    const a=bottom[k],b=top[k],next=(k+1)%4;
    beam([tx+a[0],ty+a[1],tz+a[2]],[tx+b[0],ty+b[1],tz+b[2]],.073,M.copperEdge);
    beam([tx+b[0],ty+b[1],tz+b[2]],[tx+top[next][0],ty+top[next][1],tz+top[next][2]],.073,M.copperEdge);
    const length=Math.hypot(top[next][0]-b[0],top[next][2]-b[2]),n=Math.ceil(length/.44);
    for(let j=0;j<=n;j++) {
      const t=j/n,xx=tx+b[0]+(top[next][0]-b[0])*t,zz=tz+b[2]+(top[next][2]-b[2])*t;
      beam([xx,ty+2.29,zz],[xx,ty+2.67,zz],.017,M.black);
      mesh(G.sphere,M.copperEdge,xx,ty+2.70,zz,.037,.052,.037);
    }
    beam([tx+b[0],ty+2.49,tz+b[2]],[tx+top[next][0],ty+2.49,tz+top[next][2]],.021,M.black);
  }
  for(const p of towerFaces)for(const x of [-1.18,1.18]) {
    box(x,14.50,-.46,.99,1.00,.52,M.copper,p);
    box(x,14.49,-.15,.68,.70,.10,M.dark,p);
    box(x,14.49,-.077,.051,.70,.08,M.copperEdge,p);
    box(x,14.06,-.12,1.27,.11,.62,M.copperEdge,p);
    poly([[-.68,0],[.68,0],[0,.50]],.81,M.copper,x,15.02,-.71,p);
    beam([x-.70,15.02,.12],[x,15.53,.12],.042,M.copperEdge,p);
    beam([x,15.53,.12],[x+.70,15.02,.12],.042,M.copperEdge,p);
  }
  for(const dx of [-2,2])for(const dz of [-1.49,1.49]) {
    beam([tx+dx,15.97,tz+dz],[tx+dx,17.17,tz+dz],.025,M.black);
    mesh(G.sphere,M.copperEdge,tx+dx,16.79,tz+dz,.07,.09,.07);
  }
  // Lower rear service wing and the later glazed connecting bay. Keeping
  // these attached volumes prevents the back view from becoming a fictitious
  // second ornamental street front (survey photo: 66cb6c02.jpg).
  const annexX=-10.90,annexZ=-12.96,annexW=6.20,annexD=3.02;
  box(annexX,5.09,annexZ,annexW,9.18,annexD,M.brickLight).name='Rear service wing';
  box(annexX,1.05,annexZ,annexW+.15,1.1,annexD+.15,M.stone);
  box(annexX,5.70,annexZ,annexW+.1,.22,annexD+.1,M.stone);
  box(annexX,9.77,annexZ,annexW+.28,.24,annexD+.28,M.slate);
  hipRoof(annexX,annexZ,annexW+.4,annexD+.4,9.9,.50);
  const annexFaces=[wallPlane(-Math.PI/2,-14,annexZ),wallPlane(Math.PI/2,-7.8,annexZ),wallPlane(Math.PI,annexX,-14.47)];
  for(const p of annexFaces) {
    const width=p===annexFaces[2]?annexW:annexD;
    for(const dx of [-width*.27,width*.27]) {
      rectangularWindow(dx,2.20,.77,2.42,p,false);
      rectangularWindow(dx,6.62,.77,1.88,p,false);
      box(dx,8.67,.16,1.03,.19,.26,M.stone,p);
      box(dx,4.82,.16,1.03,.19,.26,M.stone,p);
    }
    for(const x of [-width/2+.12,width/2-.12])for(const y of [2.22,3.85,5.55,7.1,8.7])box(x,y,.10,.40,.27,.18,M.stone,p);
    brickLines(width-.06,8.1,1.5,p,[-width*.27,width*.27].map(x=>[x-.6,x+.6,2,8.9]));
  }
  box(annexX,3.19,-15.11,annexW,5.38,1.28,M.brickLight);
  box(annexX,.97,-15.11,annexW+.14,.94,1.42,M.stone);
  box(annexX,5.93,-15.11,annexW+.27,.17,1.55,M.slate);
  const rearService=wallPlane(Math.PI,annexX,-15.75);
  for(const x of [-1.74,1.74])rectangularWindow(x,2.15,.88,2.1,rearService,false);
  const connectorZ=-10.2,connectorGlass=mat('#62847d',.31,.13);
  box(annexX,8.01,connectorZ,annexW-.12,3.59,2.50,connectorGlass).name='Glazed rear connecting bay';
  box(annexX,9.91,connectorZ,annexW+.15,.16,2.66,M.copper);
  box(annexX,3.0,connectorZ,annexW-.10,5,2.48,M.shadowStone);
  for(const side of [-1,1]) {
    const p=wallPlane(side*Math.PI/2,annexX+side*annexW/2,connectorZ);
    for(const x of [-1.23,-.62,0,.62,1.23])box(x,8.01,.08,.065,3.67,.15,M.black,p);
    for(const y of [6.23,7.37,8.55,9.8])box(0,y,.09,2.54,.071,.15,M.black,p);
    box(0,3.25,.14,1.51,3.50,.17,M.dark,p);
    for(const dx of [-.4,.4])box(dx,3.35,.24,.7,3.1,.07,M.glass,p);
    box(0,3.35,.28,.065,3.12,.08,M.black,p);
  }
  // Rainwater pipes and subtle brackets retain the scale of the original.
  for(const p of [front,back])for(const x of [-13.0,13.0]) {
    cyl(x,5.90,.33,.058,9.32,M.copper,.058,8,p);
    for(const y of [2.12,5.95,9.48])box(x,y,.27,.19,.08,.30,M.black,p);
  }
  // Close-view craftsmanship is added to the original surfaces. Keep this
  // architectural section before the perimeter fence used by desk extraction.
  // Continuous eave gutters, small straps and the existing downpipe connections.
  for(const p of [front,back]) {
    beam([-13.79,11.43,.43],[13.79,11.43,.43],.075,M.copper,p);
    for(let x=-13.5;x<13.6;x+=1.06) {
      box(x,11.42,.44,.062,.19,.17,M.copperEdge,p);
      box(x,11.32,.32,.075,.16,.25,M.shadowStone,p);
    }
    for(const x of [-13,13]) {
      beam([x,10.55,.33],[x,11.40,.43],.06,M.copper,p);
      box(x,10.75,.32,.30,.31,.30,M.copper,p);
      box(x,10.91,.32,.37,.08,.35,M.copperEdge,p);
    }
    for(const x of frontWindows) {
      // Stepped sill edges, carved underside brackets and pane reflections.
      box(x,1.79,.31,3.24,.068,.37,M.pale,p);
      for(const dx of [-1.12,1.12]) {
        box(x+dx,1.64,.18,.19,.22,.24,M.shadowStone,p);
        box(x+dx,6.02,.23,.20,.19,.30,M.shadowStone,p);
      }
      for(const dx of [-.94,.94]) {
        box(x+dx,3.74,.247,.031,2.86,.018,M.glassLight,p);
        box(x+dx*.8,7.21,.273,.035,1.19,.018,M.glassLight,p);
      }
      for(const dx of [-.19,.19])box(x+dx,3.30,.357,.032,.16,.043,M.black,p);
    }

  }
  for(const p of [left,right]) {
    beam([-7.15,11.43,.43],[7.15,11.43,.43],.075,M.copper,p);
    for(let x=-6.8;x<7.1;x+=1.05)box(x,11.42,.44,.065,.19,.17,M.copperEdge,p);
  }
  // Fine coping joints on the existing granite foundation, including the back.
  for(const p of [front,back,left,right]) {
    const width=p===front||p===back?W:D;
    box(0,.87,.14,width,.017,.025,M.shadowStone,p);
    for(let x=-width/2+.42;x<width/2;x+=1.05)box(x,.86,.14,.018,.44,.027,M.shadowStone,p);
  }
  const architecture=new T.Group();architecture.name='Landmark architecture';
  architecture.userData={landmarkId:'karatsu-bank',architecture:true};
  for(const part of group.children.slice(architectureStart)) {
    part.userData.architecture=true;architecture.add(part);
  }
  group.add(architecture);
  // Black wrought-iron boundary rails stop at the two entrance paths.
  function fence(x1,z1,x2,z2) {
    const len=Math.hypot(x2-x1,z2-z1),n=Math.ceil(len/.57);
    for(const y of [.83,1.78])beam([x1,y,z1],[x2,y,z2],.038,M.black);
    for(let i=0;i<=n;i++){const t=i/n,x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;
      cyl(x,1.28,z,.028,1.06,M.black,.028,6);cyl(x,1.86,z,.07,.18,M.black,0,6);}
    for(let i=0;i<=Math.ceil(len/3);i++){const t=i/Math.ceil(len/3),x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;
      cyl(x,1.19,z,.075,1.36,M.black,.075,8);mesh(G.sphere,M.black,x,1.93,z,.12,.12,.12);}
  }
  fence(-14.85,8.46,-13.0,8.46);fence(-8.6,8.46,8.6,8.46);fence(13,8.46,14.95,8.46);
  fence(-14.85,8.46,-14.85,-10.12);fence(14.95,8.46,14.95,-10.12);
  function lamp(x,z) {
    cyl(x,.60,z,.28,.27,M.black,.24,10);cyl(x,2.70,z,.078,4.10,M.black,.054,10);
    cyl(x,4.64,z,.22,.12,M.black,.12,8);box(x,4.96,z,.42,.61,.42,M.lamp);
    for(const dx of [-.23,.23])for(const dz of [-.23,.23])beam([x+dx,4.63,z+dz],[x+dx*.77,5.29,z+dz*.77],.028,M.black);
    cyl(x,5.33,z,.40,.19,M.black,.06,4);mesh(G.sphere,M.black,x,5.51,z,.085,.1,.085);
  }
  lamp(-16.05,7.72);lamp(16.30,7.72);lamp(-16.05,-9.66);
  // Rear corner planting remains low, preserving the architecture in all views.
  for(const x of [-10,-4,4,10]) {
    box(x,.62,-11.25,3.50,.36,1.37,M.stone);box(x,.83,-11.25,3.22,.08,1.11,M.soil);
    for(let i=0;i<5;i++)mesh(G.sphere,i%2?M.plantLight:M.plant,x-1.2+i*.60,1.1+(i%2)*.12,-11.25,.49,.52,.45);
  }
  group.userData = { title:'旧唐津銀行', year:1912, approximate:true, referenceViews:['street front','short street elevation','rear garden','rear service wing'], sources:[
    'https://www.shimzarchives.jp/heritage/heritage_566/',
    'https://karatsu-bank.jp/history.html',
    'https://www.city.karatsu.lg.jp/page/3845.html',
    'https://karatsu-bank.jp/gallery.html',
    'https://kmy4.livedoor.blog/archives/1845594.html',
    'https://www.karatsu-kankou.jp/sp/spots/detail/194/'
  ] };
  return { group, architecture, target:[0,5.6,-.9], halfHeight:20.0, azimuth:-.66, elevation:.43 };
}
