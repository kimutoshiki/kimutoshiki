/**
 * Former Karatsu Bank, an original low-poly architectural interpretation.
 * Front is +Z; Y is up. Dimensions are illustrative, not a measured survey.
 * Visual references: Shimizu NOVARE Archives, heritage_566 (exterior photos);
 * karatsu-bank.jp/history.html; Karatsu Tourism Association, spot 194.
 */
export function createKaratsuBank(T) {
  const group = new T.Group();
  group.name = 'Former Karatsu Bank · 1912';
  const mat = (color, roughness = 0.9, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const M = {
    brick: mat('#98492f'), brickDark: mat('#773c2c'), brickLight: mat('#ad583d'),
    stone: mat('#ded6bd'), pale: mat('#e9e0ca'), shadowStone: mat('#b8b09a'),
    slate: mat('#344d4b', 0.85), copper: mat('#527f6d', 0.75, 0.15), copperEdge: mat('#739684', 0.78, 0.1),
    glass: mat('#263d41', 0.38, 0.16), glassLight: mat('#45605b', 0.4, 0.1),
    wood: mat('#704330'), black: mat('#243430', 0.65, 0.12), dark: mat('#1c2826'),
    pavement: mat('#c0b8a4'), paver: mat('#d0c7b4'), road: mat('#6f746e'), curb: mat('#d9d3c4'),
    soil: mat('#645e42'), plant: mat('#5c734c'), plantLight: mat('#829461'), grass: mat('#879269'),
    lamp: new T.MeshStandardMaterial({ color: '#edce88', emissive: '#d6ad60', emissiveIntensity: 0.3, roughness: 0.65 }),
    mortar: new T.LineBasicMaterial({ color: '#6f3a2a', transparent: true, opacity: 0.43 }),
    pavingLine: new T.LineBasicMaterial({ color: '#999887', transparent: true, opacity: 0.4 })
  };
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
      cache.set(key,new T.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:12}));
    }
    return cache.get(key);
  }
  function archBand(r,t,depth=0.15,start=0,end=Math.PI) {
    const key=`b:${r}:${t}:${depth}:${start}:${end}`;
    if (!cache.has(key)) {
      const pts=[],n=Math.max(1,Math.ceil((end-start)*12/Math.PI));
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
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(f.flatMap(i=>v[i]),3));geom.computeVertexNormals();
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
    box(x,y+h/2,.26,.12,h,.14,M.wood,p);
    for(const yy of [.28,.60,.83])box(x,y+h*yy,.27,w,.075,.13,M.wood,p);
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
    mesh(archBand(r-.05,.13,.12),M.wood,x,y+stem,.29,1,1,1,p);
    for(const dx of [-r,r])box(x+dx,y+stem/2,.29,.13,stem,.16,M.wood,p);
    box(x,y+.09,.3,w,.18,.17,M.wood,p);box(x,y+stem,.31,w,.12,.16,M.wood,p);
    for(const dx of [-w/6,w/6]) {
      const top=stem+Math.sqrt(r*r-dx*dx);
      box(x+dx,y+top/2,.32,.10,top,.15,M.wood,p);
    }
    box(x,y+stem*.49,.32,w,.10,.14,M.wood,p);
    for(let i=1;i<6;i++) {const a=Math.PI*i/6;beam([x,y+stem,.32],[x+Math.cos(a)*r,y+stem+Math.sin(a)*r,.32],.035,M.wood,p);}
    for(let i=0;i<11;i++) {
      const gap=.015,a=i*Math.PI/11+gap,b=(i+1)*Math.PI/11-gap;
      mesh(archBand(r+.08,.43,.22,a,b),i%2===0?M.stone:M.brickDark,x,y+stem,.16,1,1,1,p);
    }
    for(const dx of [-r-.28,r+.28]) {
      box(x+dx,y+stem/2,.17,.40,stem,.28,M.stone,p);
      box(x+dx,y+stem+.04,.23,.61,.27,.43,M.stone,p);
    }
    box(x,y-.16,.24,w+1,.27,.42,M.stone,p);
    box(x,y-.40,.11,w+.63,.20,.28,M.shadowStone,p);
    for(const dx of [-r-.18,r+.18])box(x+dx,y-.57,.10,.27,.42,.27,M.stone,p);
    // Tall central stone key over the alternating brick and stone arch.
    poly([[-.19,0],[.19,0],[.25,.65],[-.25,.65]],.25,M.pale,x,y+stem+r+.06,.25,p);
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
    for(const [y,h,rt,rb,m] of [[11.48,.34,1.04,1.0,M.stone],[11.95,.65,.84,.9,M.pale],[12.36,.2,1.07,.85,M.copper], [12.61,.25,.79,1.08,M.copper], [12.84,.2,.71,.8,M.copperEdge], [13.17,.5,.38,.70,M.copper], [13.52,.2,.28,.37,M.copperEdge], [13.70,.2,.27,.27,M.copper]]) {
      const o=cyl(x,y,z,rb,h,m,rt,8);o.rotation.y=Math.PI/8;
    }
    for(let k=0;k<8;k++) {const a=Math.PI/8+k*Math.PI/4;beam([x+Math.cos(a)*.66,12.83,z+Math.sin(a)*.66],[x+Math.cos(a)*.31,13.47,z+Math.sin(a)*.31],.042,M.copperEdge);}
    cyl(x,14.1,z,.055,.75,M.black,.025,8);mesh(G.sphere,M.copperEdge,x,14.49,z,.13,.15,.13);
    cyl(x,14.78,z,.022,.47,M.black,.012,6);
  }
  function crest(x,y,p,large=false) {
    const w=large?4.6:1.72,h=large?2.5:1.05;
    const pts=[[-w/2,0],[-w/2,.35*h],[-.30*w,.44*h],[-.25*w,.64*h],[-.18*w,.67*h],[-.11*w,.88*h],[0,h],[.11*w,.88*h],[.18*w,.67*h],[.25*w,.64*h],[.30*w,.44*h],[w/2,.35*h],[w/2,0]];
    poly(pts,.40,M.pale,x,y,.05,p);
    for(let i=0;i<pts.length-1;i++)beam([x+pts[i][0],y+pts[i][1],.48],[x+pts[i+1][0],y+pts[i+1][1],.48],large?.105:.075,M.copperEdge,p);
    if(large) {
      mesh(archGeo(1.27,.53,.12),M.dark,x,y+.53,.47,1,1,1,p);
      mesh(archBand(.65,.14,.15),M.stone,x,y+1.06,.51,1,1,1,p);
      for(const dx of [-.49,0,.49])box(x+dx,y+1.04,.64,.065,.95,.12,M.wood,p);
      box(x,y+.93,.65,1.2,.07,.13,M.wood,p);
      box(x,y+.49,.59,1.67,.16,.24,M.stone,p);
      for(const dx of [-1.56,1.56]) {cyl(x+dx,y+1.20,.33,.14,.23,M.copper,.07,8,p);beam([x+dx,y+1.3,.34],[x+dx,y+1.79,.34],.024,M.black,p);}
    } else {
      const key='medallion';if(!cache.has(key))cache.set(key,new T.TorusGeometry(.24,.07,5,14));
      mesh(cache.get(key),M.shadowStone,x,y+.40,.52,1,1,1,p);
    }
    beam([x,y+h,.35],[x,y+h+(large?.85:.55),.35],.025,M.black,p);
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

  const W=28,D=15,Z=-1.45,F=6.05,B=-8.95;
  box(0,5.81,Z,W,10.62,D,M.brick);
  // The pale granite basement is pronounced on the original building.
  box(0,1.15,Z,W+.18,1.30,D+.18,M.stone);
  for(const [y,h,pad,m] of [[1.85,.19,.25,M.stone],[5.54,.23,.22,M.stone],[5.91,.15,.16,M.stone],[9.91,.23,.25,M.stone],[11.02,.22,.33,M.shadowStone],[11.21,.16,.6,M.stone],[11.39,.19,.72,M.copper]])box(0,y,Z,W+pad,h,D+pad,m);
  hipRoof(0,Z,28.7,15.7,11.47,2.45);
  // Masonry and windows are grouped by facade so all four sides are finished.
  const front=wallPlane(0,0,F),back=wallPlane(Math.PI,0,B),left=wallPlane(-Math.PI/2,-14,Z),right=wallPlane(Math.PI/2,14,Z);
  const frontWindows=[-6.1,0,6.1];
  for(const p of [front,back]) {
    box(0,10.52,.06,26.8,1.07,.16,M.pale,p);
    for(const x of frontWindows) {
      rectangularWindow(x,2.05,2.56,3.25,p);
      archedWindow(x,6.43,2.83,1.52,p);
      box(x,5.78,.25,3.45,.15,.35,M.stone,p);
    }
    for(const x of [-12.15,-9.14,-3.05,3.05,9.14,12.15]) {
      box(x,6.6,.07,.42,8.70,.19,M.brickDark,p);
      for(const y of [2.27,3.50,4.73,6.67,8.03,9.54,10.80])box(x,y,.15,.65,.24,.25,M.stone,p);
      box(x,10.87,.20,.82,.23,.37,M.stone,p);
    }
    for(const x of [-10.8,10.8]) {
      rectangularWindow(x,7.10,1.0,1.92,p,false);
      box(x,9.33,.12,1.42,.22,.25,M.stone,p);
      box(x,10.15,.075,2.6,1.58,.19,M.pale,p);
    }
    brickLines(27.7,8.1,1.90,p,frontWindows.flatMap(x=>[[x-1.85,x+1.85,1.8,5.6],[x-1.95,x+1.95,6.15,10.0]]));
  }
  for(const p of [left,right]) {
    box(0,10.47,.08,13.9,1.18,.16,M.pale,p);
    rectangularWindow(0,2.05,2.64,3.24,p);archedWindow(0,6.43,3.04,1.48,p);
    for(const x of [-5.12,5.12]) {
      rectangularWindow(x,2.07,1.20,3.23,p);rectangularWindow(x,7.20,1.22,1.95,p);
      box(x,10.01,.08,1.68,1.0,.16,M.pale,p);
    }
    for(const x of [-3.16,3.16]) {
      box(x,6.42,.075,.52,8.75,.15,M.brickDark,p);
      for(const y of [2.27,3.50,4.73,6.67,8.03,9.54,10.8])box(x,y,.16,.75,.24,.24,M.stone,p);
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
  // Current public side access, quieter than the principal colonnaded doors.
  rectangularWindow(0,2.04,1.9,3.22,back);
  crown(-13.61,F-.36);crown(13.61,F-.36);
  // The architectural scroll-gable is on the short end, while low curved
  // decorative crests sit along the long eaves between the corner crowns.
  crest(0,11.32,left,true);crest(0,11.32,right,true);
  for(const x of [-6.1,0,6.1])crest(x,11.35,front);
  for(const x of [-7.8,7.8]) {
    box(x,13.41,Z-.65,.70,1.64,.74,M.brickDark);
    for(const y of [12.92,13.36,13.82])box(x,y,Z-.65,.77,.11,.81,M.stone);
    box(x,14.21,Z-.65,.98,.22,.95,M.stone);box(x,14.36,Z-.65,.88,.12,.9,M.slate);
  }
  // Rainwater pipes and subtle brackets retain the scale of the original.
  for(const p of [front,back])for(const x of [-13.0,13.0]) {
    cyl(x,5.90,.33,.058,9.32,M.copper,.058,8,p);
    for(const y of [2.12,5.95,9.48])box(x,y,.27,.19,.08,.30,M.black,p);
  }
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
  group.userData = { title:'旧唐津銀行', year:1912, approximate:true, sources:[
    'https://www.shimzarchives.jp/heritage/heritage_566/',
    'https://karatsu-bank.jp/history.html',
    'https://www.karatsu-kankou.jp/sp/spots/detail/194/'
  ] };
  return { group, target:[0,5.6,-.9], halfHeight:20.0, azimuth:-.66, elevation:.43 };
}
