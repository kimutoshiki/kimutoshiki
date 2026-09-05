/* Okuma campus diorama. Original geometry based on Waseda's architectural references.
   Instanced geometry, a single cached shadow, bounded DPR, and a 30fps ceiling.
   The model is an interpretation, not a surveyed campus map. */
import * as T from './vendor/three.module.min.js';
import { CampusCanvasRenderer } from './campus-software.js';
const canvas=document.querySelector('#campus-canvas');
const hero=document.querySelector('.campus-hero');
const region=document.querySelector('.scene-region');
const status=document.querySelector('.scene-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try{const context=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'});renderer=context?new T.WebGLRenderer({canvas,context,antialias:true,alpha:true}):new CampusCanvasRenderer(canvas);}catch(error){fallback();}
function fallback(){status.textContent='写真とページ案内で表示しています。';document.querySelectorAll('[data-scene-action]').forEach(b=>b.disabled=true);canvas.hidden=true;}
if(renderer)boot();
function boot(){
 const mobile=matchMedia('(max-width:760px)').matches;
 const inner=document.body.dataset.page!=='index';
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.6));
 renderer.setClearColor(0xdcecf0,0);
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
 const scene=new T.Scene();
 const camera=new T.OrthographicCamera(-30,30,23,-23,.1,240);
 const hemi=new T.HemisphereLight(0xe2f4ff,0x6a7852,2.8);scene.add(hemi);
 const sun=new T.DirectionalLight(0xffefd0,3.4);sun.position.set(-22,45,26);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-39,right:39,top:39,bottom:-39,near:1,far:100});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
 const root=new T.Group();scene.add(root);
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
 // Auditorium nave, front volume and roof.
 box(wall,2,5.6,-5,18,10.7,17);box(stone,2,.65,-5,18.5,.75,17.5);
 box(trim,2,10.65,-5,18.6,.42,17.6);box(stone,2,11.15,-5,18,.5,17);
 const roofShape=new T.Shape();roofShape.moveTo(-9,0);roofShape.lineTo(9,0);roofShape.lineTo(7.4,1.9);roofShape.lineTo(-7.4,1.9);roofShape.closePath();
 const roofGeo=new T.ExtrudeGeometry(roofShape,{depth:17,bevelEnabled:false});add(roofGeo,roofMat,2,11.4,-13.5);
 box(trim,2,11.45,-5,18.7,.15,17.7);
 box(stone,2,4.7,3.8,18.5,8.8,2.5);box(trim,2,9.15,3.8,19,.35,3);
 // Three main arches cut visually into recessed dark doors with stone archivolts.
 function arch(x,y,z,w,h,m=dark,depth=.16){const r=w/2;const shape=new T.Shape();shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,h-r);shape.absarc(0,h-r,r,0,Math.PI,false);shape.lineTo(-r,0);const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:12});add(geo,m,x,y,z);return geo;}
 for(const x of [-3,2,7]){
  arch(x,.8,5.09,3.2,5.3);const r=1.88,cy=4.5;
  for(let a=0;a<Math.PI;a+=Math.PI/13){const mid=a+Math.PI/26;box(trim,x+r*Math.cos(mid),cy+r*Math.sin(mid),5.26,.46,.47,.4,0,mid-Math.PI/2);}
  for(const sign of [-1,1]){box(trim,x+sign*1.87,2.55,5.2,.42,3.9,.4);box(trim,x+sign*1.87,.8,5.2,.68,.34,.65);}
  box(trunk,x,2.15,5.31,2.73,2.6,.08);box(trim,x,2.25,5.4,.085,2.8,.06);box(trim,x,3.6,5.4,2.76,.08,.06);
  for(const dx of [-.88,-.44,.44,.88])box(metal,x+dx,3.85,5.4,.04,3.1,.03);
  box(trim,x,7.4,5.13,3.55,.38,.18);box(wall,x,7.85,5.13,2.8,.4,.15);
 }
 for(let i=0;i<5;i++)box(paving,2,.12+(5-i)*.12,5.7+i*.4,19+i*.5,.25,1.2);
 for(const x of [-7.1,-.5,4.5,11.1]){box(trim,x,4.8,5.2,.35,8.4,.4);box(stone,x,8.9,5.2,.6,.35,.6);}
 // Auditorium side windows, buttresses, cornices and facade tile courses.
 for(let z=-12;z<3;z+=3){box(trim,11.13,5.3,z,.3,9.6,.35);for(const y of [3,6.9]){box(dark,11.17,y,z+1.3,.07,2,1.05);box(trim,11.2,y+1.04,z+1.3,.14,.15,1.35);box(trim,11.22,y,z+1.3,.08,2,.06);}}
 for(let y=1.3;y<10.4;y+=.47){box(stone,2,y,5.055,18.2,.025,.035);box(stone,11.055,y,-5,.025,.025,16.8);}
 for(let x=-5;x<11;x+=2.2){box(dark,x,9.9,3.93,1.3,.45,.07);}
 // Clock tower at the front-left, in proportion to the auditorium.
 const tx=-9.25,tz=2.5;
 box(stone,tx,10.7,tz,5.5,21,5.5);box(trim,tx,.7,tz,6.1,.7,6.1);
 for(let y=1.4;y<20;y+=.43){box(wall,tx,y,tz+2.758,5.44,.032,.026);box(wall,tx+2.758,y,tz,.026,.032,5.44);}
 for(const x of [tx-2.55,tx+2.55])for(const z of [tz-2.55,tz+2.55])box(wall,x,10.8,z,.32,19.8,.32);
 for(const y of [4.4,8.4,12.4]){arch(tx,y,tz+2.78,.62,1.95);box(trim,tx,y-.06,tz+2.92,1.05,.2,.44);box(dark,tx+2.78,y+.9,tz,.03,1.8,.64);box(trim,tx+2.95,y-.06,tz,.44,.2,1.05);}
 arch(tx,1.06,tz+2.79,2.05,2.5);box(trim,tx,3.72,tz+2.95,2.6,.2,.3);
 // Upper clock storey with four individually oriented clock faces.
 for(const y of [20.55,20.95,21.35])box(trim,tx,y,tz,6+(y-20.55)*.7,.21,6+(y-20.55)*.7);
 box(wall,tx,24.1,tz,5.35,5.4,5.35);box(trim,tx,22.3,tz,5.65,.55,5.65);
 for(const side of [0,1,2,3]){
  const ang=side*Math.PI/2;const front=(dx,y,dz,w,h,d,m)=>{const x=tx+dx*Math.cos(ang)+dz*Math.sin(ang),z=tz-dx*Math.sin(ang)+dz*Math.cos(ang);box(m,x,y,z,w,h,d,ang);};
  for(const dx of [-1.65,0,1.65]){front(dx,24.6,2.7,.62,3,.07,dark);front(dx,24.6,2.83,.1,3.25,.15,trim);front(dx,26.26,2.78,.9,.2,.2,trim);}
  for(const dx of [-2.54,-.86,.86,2.54])front(dx,25,2.78,.3,5.3,.35,trim);
  front(0,26.5,2.7,5.25,.25,.3,trim);
  for(const dx of [-1.7,0,1.7]){front(dx,22.4,2.86,.55,.1,.1,dark);front(dx,22.4,2.87,.1,.55,.1,dark);}
 }
 for(const x of [-2.6,2.6])for(const z of [-2.6,2.6]){box(trim,tx+x,25.3,tz+z,.5,6.9,.5);box(stone,tx+x,28.8,tz+z,.56,.22,.56);}
 // A simple clock texture is a diagram, used on actual 3D circular geometry.
 const clockCanvas=document.createElement('canvas');clockCanvas.width=256;clockCanvas.height=256;const ctx=clockCanvas.getContext('2d');ctx.fillStyle='#f9eed4';ctx.beginPath();ctx.arc(128,128,122,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7a6849';ctx.lineWidth=7;ctx.stroke();
 ctx.save();ctx.translate(128,128);for(let i=0;i<12;i++){ctx.save();ctx.rotate(i*Math.PI/6);ctx.fillStyle='#5a5444';ctx.fillRect(-2,-108,4,14);ctx.restore();}ctx.strokeStyle='#414b3f';ctx.lineCap='round';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-38,-42);ctx.moveTo(0,0);ctx.lineTo(57,-69);ctx.stroke();ctx.fillStyle='#414b3f';ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.restore();
 const texture=new T.CanvasTexture(clockCanvas);texture.colorSpace=T.SRGBColorSpace;const clockMat=new T.MeshStandardMaterial({map:texture,roughness:.9});
 for(let i=0;i<4;i++){const a=i*Math.PI/2;const clock=new T.Mesh(new T.CircleGeometry(1.15,40),clockMat);clock.position.set(tx+Math.sin(a)*2.79,18.3,tz+Math.cos(a)*2.79);clock.rotation.y=a;root.add(clock);}
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
 const target=new T.Vector3(inner?0:-.2,inner?9:7.5,1);
 let azimuth=.64,elevation=.64,zoom=1,paused=reduced.matches||renderer.software,visible=true,drag=null,last=0,raf=0,settle=0,time=0,flight=null;
 try{paused=paused||localStorage.getItem('campus-motion')==='paused';}catch{}
 const motionButton=document.querySelector('[data-scene-action=motion]');
 function syncMotion(){motionButton.textContent=paused?'動きを再開':'動きを停止';motionButton.setAttribute('aria-pressed',String(paused));}
 syncMotion();
 const destinations={profile:{p:new T.Vector3(-10,5.4,12),target:new T.Vector3(-10,2.5,12)},research:{p:new T.Vector3(-9,31.5,3),target:new T.Vector3(-8,12,3)},blog:{p:new T.Vector3(16,7.7,5),target:new T.Vector3(14,2,4)},contact:{p:new T.Vector3(4,3.6,15),target:new T.Vector3(4,1,13)}};
 const pins=[...document.querySelectorAll('.scene-pin')].map(a=>({a,...destinations[a.dataset.destination]}));const projected=new T.Vector3();let width=1,height=1;
 function resize(){const rect=region.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);renderer.setSize(width,height,false);const aspect=width/height;const half=Math.max(inner?23:26,34/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();settle=performance.now()+350;request();}
 const initialTarget=target.clone();
 function render(now){raf=0;if(!visible||document.hidden)return;const dt=Math.min((now-last)/1000,.08);if(now-last<(renderer.software?110:32)){request();return;}last=now;time+=dt;
  if(flight){const p=Math.min(1,(now-flight.start)/620),e=1-Math.pow(1-p,3);target.lerpVectors(flight.from,flight.to,e);zoom=flight.zoom+e*.55;if(p>=1){location.assign(flight.href);flight=null;}}
  const sway=!paused&&!drag&&!flight?Math.sin(time*.12)*.023:0;
  camera.position.set(target.x+65*Math.sin(azimuth+sway)*Math.cos(elevation),target.y+65*Math.sin(elevation),target.z+65*Math.cos(azimuth+sway)*Math.cos(elevation));camera.lookAt(target);camera.zoom=zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  if(!paused&&!flight)people.forEach(p=>{p.object.position.x=p.x+Math.sin(time*.22+p.phase)*.4;p.object.rotation.y=Math.cos(time*.22+p.phase)>.0?Math.PI/2:-Math.PI/2;});
  renderer.render(scene,camera);
  const occupied=[];
  if(!inner)pins.forEach(({a,p})=>{projected.copy(p).project(camera);const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;const w=a.offsetWidth,h=a.offsetHeight;let px=Math.max(w/2+8,Math.min(width-w/2-8,x)),py=Math.max(15,Math.min(height-60,y-h-23));for(const other of occupied)if(Math.abs(px-other.x)<(w+other.w)/2+9&&Math.abs(py-other.y)<h+12)py=other.y+h+14;occupied.push({x:px,y:py,w});a.style.transform=`translate3d(${Math.round(px-w/2)}px,${Math.round(py)}px,0)`;a.style.visibility=projected.z>1?'hidden':'';});
  hero.classList.add('scene-ready');
  if(!paused||drag||flight||now<settle)request();
 }
 function request(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(render);}
 new ResizeObserver(resize).observe(region);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=performance.now()-40;request();}else{cancelAnimationFrame(raf);raf=0;}},{threshold:.02}).observe(hero);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{last=performance.now()-40;request();}});
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,angle:azimuth,id:e.pointerId};canvas.setPointerCapture(e.pointerId);request();});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;azimuth=Math.max(-.85,Math.min(1.5,drag.angle+(drag.x-e.clientX)*.005));request();});
 const endDrag=()=>{drag=null;settle=performance.now()+100;request();};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')azimuth-=.12;if(e.key==='ArrowRight')azimuth+=.12;if(e.key==='ArrowUp')zoom=Math.min(1.7,zoom+.1);if(e.key==='ArrowDown')zoom=Math.max(.7,zoom-.1);if(e.key==='Home'){azimuth=.64;zoom=1;target.copy(initialTarget);}settle=performance.now()+100;request();}});
 document.querySelectorAll('[data-scene-action]').forEach(b=>b.addEventListener('click',()=>{switch(b.dataset.sceneAction){case 'zoom-in':zoom=Math.min(1.7,zoom+.15);break;case 'zoom-out':zoom=Math.max(.7,zoom-.15);break;case 'reset':azimuth=.64;zoom=1;target.copy(initialTarget);break;case 'motion':paused=!paused;syncMotion();try{localStorage.setItem('campus-motion',paused?'paused':'active');}catch{}break;}settle=performance.now()+100;request();}));
 reduced.addEventListener('change',e=>{paused=e.matches;syncMotion();request();});
 pins.forEach(({a,target:to})=>a.addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0||reduced.matches)return;e.preventDefault();if(flight)return;flight={start:performance.now(),from:target.clone(),to,zoom,href:a.href};status.textContent=a.textContent.replace(/0[2-5]/,'').replace('↗','').trim()+'へ移動します。';request();}));
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;hero.classList.remove('scene-ready');fallback();});
 renderer.shadowMap.needsUpdate=true;resize();request();
}
