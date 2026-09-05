/* Original architectural model; official exterior references are listed in docs/campus-scene.md. */
export function createOkumaAuditorium(T) {
 const root=new T.Group();
 const materials={};
 const mat=(name,color)=>materials[name]??=(new T.MeshStandardMaterial({color,roughness:.9,metalness:0}));
 const stone=mat('stone',0xccb78b),wall=mat('wall',0xb59a66),trim=mat('trim',0xe3ce9d),dark=mat('dark',0x344c46),roofMat=mat('roof',0x696e59),paving=mat('paving',0xd9d5c1),edge=mat('edge',0xc3c9b1),earth=mat('earth',0x7b8b72),grass=mat('grass',0x9bad76),trunk=mat('trunk',0x6f6751),leaf=mat('leaf',0x4d7359),leafLight=mat('leafLight',0x759767),leafDark=mat('leafDark',0x375d4a),white=mat('white',0xf3eee0),wine=mat('wine',0x923b4f),metal=mat('metal',0x48635a),neighbor=mat('neighbor',0xbbc7bf),glass=mat('glass',0x64817a),soil=mat('soil',0x927e5e);
 const geometries={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(1,1,1,8),cone:new T.ConeGeometry(1,1,8),sphere:new T.IcosahedronGeometry(1,1),circle:new T.CylinderGeometry(1,1,1,32)};
 const batches=new Map(), dummy=new T.Object3D();
 function add(g,m,x,y,z,sx=1,sy=1,sz=1,ry=0,rz=0,rx=0){const id=g.uuid+':'+m.uuid;let b=batches.get(id);if(!b){b={g,m,transforms:[]};batches.set(id,b);}dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();b.transforms.push(dummy.matrix.clone());}
 const box=(m,x,y,z,w,h,d,ry=0,rz=0,rx=0)=>add(geometries.box,m,x,y,z,w,h,d,ry,rz,rx);
 const cyl=(m,x,y,z,r,h,ry=0)=>add(geometries.cylinder,m,x,y,z,r,h,r,ry);
 const ball=(m,x,y,z,r,s=1)=>add(geometries.sphere,m,x,y,z,r,r*s,r);
 const seedRandom=(n)=>{let s=n;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;}};const random=seedRandom(1927);
 // Ground, stone plinth and forecourt.
 box(earth,0,-1.15,0,49,1.7,37);box(edge,0,-.2,0,49.4,.28,37.4);box(grass,0,-.03,0,49,.15,37);
 box(paving,-4,.12,8.5,25,.22,19);box(paving,-4,.1,-7,28,.18,18);
 box(paving,16,.15,4,12,.2,4);box(paving,-18,.15,3,4,.2,28);
 // Fine paving joints, batched into a single draw call.
 for(let z=0;z<18;z+=1.4)box(edge,-4,.241,z,25,.012,.025);
 for(let x=-16;x<9;x+=1.4)box(edge,x,.241,8.5,.025,.012,18);
 // Low planted borders.
 for(const [x,z,w,d] of [[16,11,10,9],[17,-3,8,5],[-21,13,5,7]]){box(trim,x,.22,z,w,.3,d);box(soil,x,.39,z,w-.35,.08,d-.35);box(grass,x,.46,z,w-.6,.06,d-.6);}
 // The auditorium's plain brick face and shallow pointed portals are deliberately
 // different from the open, pale stone belfry. Dimensions are interpretive.
 const mortar=mat('mortar',0xcbb996),iron=mat('iron',0x444d48),recess=mat('recess',0x29392f);
 box(wall,2,6.9,-5,18,13.3,17);box(stone,2,.65,-5,18.5,.75,17.5);
 box(trim,2,13.7,-5,18.6,.32,17.6);
 const roofShape=new T.Shape();roofShape.moveTo(-9,0);roofShape.lineTo(9,0);roofShape.lineTo(7.4,1.35);roofShape.lineTo(-7.4,1.35);roofShape.closePath();
 const roofGeo=new T.ExtrudeGeometry(roofShape,{depth:17,bevelEnabled:false});add(roofGeo,roofMat,2,13.8,-13.5);
 for(let z=-13;z<3.5;z+=.62)box(dark,2,15.17,z,14.8,.022,.025);
 box(wall,2,7.25,3.8,18.5,13.9,2.5);
 for(const [y,w,d] of [[14.05,18.85,2.9],[14.39,19,3.0]])box(trim,2,y,3.8,w,.19,d);
 for(let x=-7;x<11.3;x+=.32)box(trim,x,14.22,5.26,.1,.22,.23);
 // A shallow pointed arch, built in layers for a visibly deep stone reveal.
 function arch(x,y,z,w,h,m=recess,depth=.12){const r=w/2,shoulder=h-r*.68;const shape=new T.Shape();shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,shoulder);shape.quadraticCurveTo(r,h-r*.23,0,h);shape.quadraticCurveTo(-r,h-r*.23,-r,shoulder);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:10});add(geo,m,x,y,z);}
 function disk(m,x,y,z,r){add(geometries.circle,m,x,y,z,r,.035,r,0,0,Math.PI/2);}
 function ring(m,x,y,z,r,t=.035){add(new T.TorusGeometry(r,t,4,24),m,x,y,z);}
 for(const x of [-3,2,7]){
  arch(x,.8,5.07,3.65,7.7,trim,.18);arch(x,.88,5.27,3.34,7.37,wall,.06);arch(x,.91,5.35,3.16,7.21,trim,.09);arch(x,.96,5.45,2.89,6.96,recess,.09);
  // Glazed transom, circular iron tracery and wrought-iron double gates.
  box(trunk,x,3.56,5.57,2.75,.14,.1);box(trunk,x,2.29,5.57,.12,2.6,.1);
  ring(iron,x,5.76,5.6,.87,.048);ring(iron,x,5.76,5.6,.67,.027);
  for(let n=0;n<8;n++){const a=n*Math.PI/4;ring(iron,x+Math.sin(a)*.42,5.76+Math.cos(a)*.42,5.61,.18,.019);}
  box(iron,x,5.76,5.64,1.18,.045,.04);box(iron,x,5.76,5.64,.045,1.18,.04);
  for(let dx=-1.2;dx<1.3;dx+=.2){box(trim,x+dx,1.93,5.76,.025,1.78,.03);for(let y=1.23;y<2.8;y+=.36){box(trim,x+dx,y,5.77,.018,.26,.025,0,.61);box(trim,x+dx,y,5.77,.018,.26,.025,0,-.61);}}
  box(trim,x,2.87,5.76,2.65,.04,.04);box(trim,x,2.08,5.76,.05,2.55,.05);
  for(const dx of [-1.84,1.84]){box(iron,x+dx,3.25,5.68,.14,.67,.13);box(iron,x+dx,3.02,5.6,.28,.09,.28);}
  box(trim,x,10.5,5.12,.78,1.44,.15);box(dark,x,10.53,5.24,.5,1.1,.08);box(trim,x,10.62,5.34,.5,.055,.035);box(trim,x,10.23,5.38,.12,.55,.13);
 }
 for(let i=0;i<7;i++)box(paving,2,.12+(7-i)*.105,5.8+i*.33,19+i*.25,.22,.95);
 for(const x of [-5.9,10.0]){box(dark,x,5.7,5.13,.36,2.75,.08);box(trim,x,4.31,5.23,.63,.14,.26);disk(trim,x,1.82,5.17,.33);disk(recess,x,1.82,5.23,.25);box(dark,x,11.8,5.14,.27,.56,.04);}
 // The garden-facing Romanesque gallery, vertical windows and cornices.
 for(let z=-11.9;z<3;z+=2.65){box(trim,11.12,6.9,z,.22,12.9,.3);for(const y of [3.4,8.1,11.4]){box(dark,11.16,y,z+1.2,.08,1.8,.74);box(trim,11.23,y+.98,z+1.2,.14,.15,1.02);box(trim,11.25,y,z+1.2,.06,1.85,.07);}}
 for(let z=-11.5;z<2;z+=2.65){box(recess,11.35,1.7,z+1,.13,2.7,1.65);cyl(trim,12.3,1.6,z,.16,2.6);box(trim,11.9,3.06,z,.95,.2,.46);}
 box(stone,11.75,.35,-4.7,2.1,.3,16);box(trim,11.7,3.28,-4.7,1.8,.2,15.4);
 // Brick courses use shallow geometry instead of a large image texture.
 for(let y=1.3;y<13.8;y+=.27){box(mortar,2,y,5.057,18.2,.018,.025);box(mortar,11.057,y,-5,.025,.018,16.8);}
 for(let row=0;row<43;row++){const y=1.4+row*.28;for(let col=0;col<24;col++){const x=-6.7+col*.76+(row%2)*.38;if(x<11)box(mortar,x,y,5.069,.015,.18,.025);}}
 // Clock tower: narrow openings, an oriel below the clock, and open stone crown.
 const tx=-9.25,tz=2.5;
 box(wall,tx,10.7,tz,5.5,21,5.5);box(stone,tx,.65,tz,6.1,.65,6.1);
 for(let y=1.2;y<20.5;y+=.27){box(mortar,tx,y,tz+2.758,5.44,.018,.026);box(mortar,tx+2.758,y,tz,.026,.018,5.44);}
 for(const y of [5,9.1]){box(dark,tx,y+1,tz+2.8,.31,2,.08);box(trim,tx,y-.04,tz+2.91,.57,.13,.24);box(dark,tx+2.8,y+1,tz,.08,2,.31);}
 arch(tx,12.7,tz+2.79,.75,2.8,trim);arch(tx,12.8,tz+2.94,.49,2.56);box(trim,tx,13.98,tz+3.11,.07,2.18,.05);
 cyl(stone,tx,12.42,tz+2.99,.57,.23);add(geometries.cone,stone,tx,11.92,tz+2.99,.55,-.8,.55);
 arch(tx,1.06,tz+2.79,2.58,3.15,trim);arch(tx,1.11,tz+2.93,2.12,2.86);for(let x=-.85;x<.9;x+=.18)box(iron,tx+x,2.06,tz+3.08,.026,1.75,.03);
 for(let i=0;i<6;i++)box(stone,tx,.27+(6-i)*.12,6.0+i*.32,6.2,.2,.9);
 for(const y of [20.55,20.88,21.15])box(trim,tx,y,tz,5.95,.18,5.95);
 for(let i=-2.7;i<2.8;i+=.28){box(trim,tx+i,20.69,tz+2.98,.09,.2,.19);box(trim,tx+2.98,20.69,tz+i,.19,.2,.09);}
 box(trim,tx,23.95,tz,5.4,5.4,5.4);
 for(const side of [0,1,2,3]){
  const ang=side*Math.PI/2;
  const front=(dx,y,dz,w,h,d,m)=>{const x=tx+dx*Math.cos(ang)+dz*Math.sin(ang),z=tz-dx*Math.sin(ang)+dz*Math.cos(ang);box(m,x,y,z,w,h,d,ang);};
  for(const dx of [-1.12,1.12]){front(dx,24.41,2.75,1.04,3.17,.06,dark);front(dx,25.98,2.77,.64,.31,.08,dark);for(const s of [-1,1])front(dx+s*.57,24.75,2.91,.12,3.55,.18,white);front(dx,24.56,2.99,.07,2.65,.09,trim);}
  for(const dx of [-2.55,0,2.55]){front(dx,25.07,2.94,.28,6.97,.75,trim);front(dx,28.61,2.94,.3,.17,.78,white);}
  front(0,22.51,2.89,5.2,.18,.28,white);front(0,23.16,2.89,5.2,.17,.28,white);
  for(const dx of [-1.7,-.65,.65,1.7]){front(dx,22.84,2.81,.35,.095,.06,dark);front(dx,22.84,2.82,.095,.35,.06,dark);}
  for(let dx=-2;dx<2.1;dx+=.5)front(dx,26.76,2.76,.23,.4,.2,trim);
  // True geometry clock faces stay legible in both WebGL and the light renderer.
  const cg=new T.Group(),cm=new T.Mesh(new T.CircleGeometry(1.1,40),white);cg.add(cm);
  const rim=new T.Mesh(new T.TorusGeometry(1.1,.055,5,40),iron);rim.position.z=.03;cg.add(rim);
  for(let n=0;n<12;n++){const a=n*Math.PI/6;const tick=new T.Mesh(geometries.box,iron);tick.position.set(Math.sin(a)*.92,Math.cos(a)*.92,.07);tick.scale.set(.055,.19,.035);tick.rotation.z=-a;cg.add(tick);}
  for(const [angle,length] of [[-.72,.55],[.66,.78]]){const hand=new T.Mesh(geometries.box,iron);hand.position.set(Math.sin(angle)*length/2,Math.cos(angle)*length/2,.1);hand.scale.set(.065,length,.04);hand.rotation.z=-angle;cg.add(hand);}
  cg.position.set(tx+Math.sin(ang)*2.805,18.18,tz+Math.cos(ang)*2.805);cg.rotation.y=ang;root.add(cg);
 }
 // Context buildings are deliberately quiet, so the auditorium stays legible.
 box(neighbor,18,4.1,-10,9,8,10);box(edge,18,8.2,-10,9.4,.25,10.4);
 for(let x=15;x<22;x+=2)for(let y=2;y<8;y+=2)box(glass,x,y,-4.96,.9,1.1,.05);
 box(neighbor,-21,3.2,-8,5,6,12);box(edge,-21,6.3,-8,5.3,.2,12.3);
 // Mature trees with low-poly clustered canopies and varied proportions.
 function tree(x,z,h=6,conifer=false){cyl(trunk,x,h*.38,z,.17,h*.76);if(conifer){for(let i=0;i<4;i++)add(geometries.cone,i%2?leaf:leafDark,x,h*.53+i*h*.15,z,h*.33-i*h*.047,h*.52,h*.33-i*h*.047,.25);}else{ball(leaf,x,h*.83,z,h*.32,1.25);ball(leafLight,x+.85,h*.79,z+.5,h*.23,1.2);ball(leafDark,x-.8,h*.71,z+.3,h*.24);ball(leafLight,x+.1,h*1.03,z-.2,h*.22);}}
 for(const [x,z,h,c] of [[-17,-13,8,1],[-16,-6,7,1],[-17,1,6,1],[-21,12,7,0],[-20,16,6,0],[15,-1,7,0],[21,0,8,1],[20,6,7,0],[21,13,7,0],[14,14,6,0],[11,12,5,0],[13,-13,7,1],[6,-15,6,1],[-1,-15,6,1],[-14,16,5,0]])tree(x,z,h,c);
 for(let i=0;i<24;i++){const x=11+random()*12,z=8+random()*8;ball(i%2?leafLight:leaf,x,.6,z,.6+random()*.4,.7);}
 // Statue and plinth, recognizable as a bronze figure across the forecourt.
 box(edge,-10,.48,12,2.4,.6,2.4);box(stone,-10,1.26,12,1.7,1,1.7);box(trim,-10,1.8,12,1.9,.2,1.9);
 cyl(metal,-10,2.85,12,.42,1.95);ball(metal,-10,4.15,12,.32,1.12);box(metal,-10,4.43,12,.9,.12,.75);box(metal,-10,4.54,12,.42,.2,.42);box(metal,-10.36,3.15,12,.17,1.35,.22,0,-.12);box(metal,-9.64,3.15,12,.17,1.35,.22,0,.12);
 // Garden benches, lamp posts, cycle stands and discreet wine-colored banners.
 function bench(x,z,rot=0){for(let i=0;i<4;i++)box(trunk,x,1,z+(i-1.5)*.16,2,.13,.12,rot);for(const dx of [-.75,.75]){box(metal,x+dx,.52,z,.09,.95,.55);box(metal,x+dx,1.37,z-.25,.08,.85,.08);}box(trunk,x,1.64,z-.25,2,.17,.12);}
 bench(4,14);bench(16,7);bench(-16,10);
 for(const [x,z] of [[-13,7],[9,8],[8,16],[-15,16]]){cyl(metal,x,1.9,z,.07,3.5);box(metal,x,3.7,z,.5,.1,.5);box(white,x,3.5,z,.32,.4,.32);}
 for(const [x,z] of [[-14,4],[12,3]]){cyl(metal,x,2.7,z,.055,5);box(wine,x+.45,4.2,z,.82,1.6,.035);box(trim,x+.44,4.3,z+.025,.06,.6,.025);}
 // A few tiny visitors establish scale without adding busy movement.
 const people=[];
 for(const [x,z,color] of [[-5,11,wine],[1,9,mat('ochre',0xc39b4d)],[7,9,dark],[-12,7,white],[6,16,wine],[-1,15,mat('blue',0x627e91)]]){
  const person=new T.Group();const body=new T.Mesh(new T.CylinderGeometry(.16,.2,.6,7),color);body.position.y=.85;person.add(body);const head=new T.Mesh(new T.IcosahedronGeometry(.15,1),trim);head.position.y=1.31;person.add(head);for(const dx of [-.075,.075]){const leg=new T.Mesh(new T.BoxGeometry(.095,.43,.11),dark);leg.position.set(dx,.34,0);person.add(leg);}person.position.set(x,.1,z);root.add(person);people.push({object:person,x,z,phase:random()*6.28});
 }
 // All static repeated primitives become instanced draws.
 for(const {g,m,transforms} of batches.values()){const mesh=new T.InstancedMesh(g,m,transforms.length);transforms.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);}

return {group:root,target:[-.2,7.5,1],halfHeight:26,azimuth:.64,elevation:.48,people};
}
