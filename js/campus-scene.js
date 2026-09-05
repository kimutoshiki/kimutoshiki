/* Page-specific landmark dioramas. Original geometry based on exterior references.
   Instanced geometry, a single cached shadow, bounded DPR, and a 30fps ceiling.
   The model is an interpretation, not a surveyed campus map. */
import * as T from './vendor/three.module.min.js';
import { CampusCanvasRenderer } from './campus-software.js?v=20260905-landmarks';
import { batchStaticMeshes } from './models/model-utils.js';
const canvas=document.querySelector('#campus-canvas');
const hero=document.querySelector('.campus-hero');
const region=document.querySelector('.scene-region');
const status=document.querySelector('.scene-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try{const context=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'});renderer=context?new T.WebGLRenderer({canvas,context,antialias:true,alpha:true}):new CampusCanvasRenderer(canvas);}catch(error){fallback();}
function fallback(){status.textContent='下のページ案内をご利用ください。';document.querySelectorAll('[data-scene-action]').forEach(b=>b.disabled=true);canvas.hidden=true;}
if(renderer)boot().catch(fallback);
async function boot(){
 const mobile=matchMedia('(max-width:760px)').matches;
 hero.dataset.landmark=document.body.dataset.page;
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
 const page=document.body.dataset.page;
 const modelSpec={index:['okuma-auditorium','createOkumaAuditorium'],profile:['karatsu-castle','createKaratsuCastle'],research:['okuma-statue','createOkumaStatue'],blog:['karatsu-bank','createKaratsuBank'],contact:['landmark-gallery','createLandmarkGallery']}[page]||['okuma-auditorium','createOkumaAuditorium'];
 const module=await import(`./models/${modelSpec[0]}.js`);
 const model=await module[modelSpec[1]](T);
 const root=model.group,people=model.people||[];
 batchStaticMeshes(T,root,people.map(p=>p.object));scene.add(root);
 const target=new T.Vector3(...model.target);
 const initialAngle=model.azimuth;
 let azimuth=initialAngle,elevation=model.elevation,zoom=1,paused=reduced.matches||renderer.software,visible=true,drag=null,last=0,raf=0,settle=0,time=0,flight=null;
 try{paused=paused||localStorage.getItem('campus-motion')==='paused';}catch{}
 const motionButton=document.querySelector('[data-scene-action=motion]');
 function syncMotion(){motionButton.textContent=paused?'動きを再開':'動きを停止';motionButton.setAttribute('aria-pressed',String(paused));}
 syncMotion();
 const destinations={profile:{p:new T.Vector3(-19,5.4,11),target:new T.Vector3(-10,2.5,12)},research:{p:new T.Vector3(-9,31.5,3),target:new T.Vector3(-8,12,3)},blog:{p:new T.Vector3(24,7.7,4),target:new T.Vector3(14,2,4)},contact:{p:new T.Vector3(8,-1.5,22),target:new T.Vector3(4,1,13)}};
 const pins=[...document.querySelectorAll('.scene-pin')].map(a=>({a,...destinations[a.dataset.destination]}));const projected=new T.Vector3();let width=1,height=1,visibleLeft=0,visibleRight=1;
 function resize(){const rect=region.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);visibleLeft=Math.max(0,-rect.left);visibleRight=Math.min(width,innerWidth-rect.left);renderer.setSize(width,height,false);const aspect=width/height;const half=Math.max(model.halfHeight,(model.halfWidth||model.halfHeight*1.24)/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();settle=performance.now()+350;request();}
 const initialTarget=target.clone();
 function render(now){raf=0;if(!visible||document.hidden)return;const dt=Math.min((now-last)/1000,.08);if(now-last<(renderer.software?110:32)){request();return;}last=now;time+=dt;
  if(flight){const p=Math.min(1,(now-flight.start)/620),e=1-Math.pow(1-p,3);target.lerpVectors(flight.from,flight.to,e);zoom=flight.zoom+e*.55;if(p>=1){location.assign(flight.href);flight=null;}}
  const sway=!paused&&!drag&&!flight?Math.sin(time*.12)*.023:0;
  camera.position.set(target.x+65*Math.sin(azimuth+sway)*Math.cos(elevation),target.y+65*Math.sin(elevation),target.z+65*Math.cos(azimuth+sway)*Math.cos(elevation));camera.lookAt(target);camera.zoom=zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  if(!renderer.software&&!paused&&!flight)people.forEach(p=>{p.object.position.x=p.x+Math.sin(time*.22+p.phase)*.4;p.object.rotation.y=Math.cos(time*.22+p.phase)>.0?Math.PI/2:-Math.PI/2;});
  renderer.render(scene,camera);
  const occupied=[];
  if(!inner)pins.forEach(({a,p})=>{projected.copy(p).project(camera);const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;const w=a.offsetWidth,h=a.offsetHeight;let px=Math.max(visibleLeft+w/2+8,Math.min(visibleRight-w/2-8,x)),py=Math.max(15,Math.min(height-60,y-h-23));for(const other of occupied)if(Math.abs(px-other.x)<(w+other.w)/2+9&&Math.abs(py-other.y)<h+12)py=other.y+h+14;occupied.push({x:px,y:py,w});a.style.transform=`translate3d(${Math.round(px-w/2)}px,${Math.round(py)}px,0)`;a.style.visibility=projected.z>1?'hidden':'';});
  hero.classList.add('scene-ready');
  if(!paused||drag||flight||now<settle)request();
 }
 function request(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(render);}
 new ResizeObserver(resize).observe(region);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=performance.now()-40;request();}else{cancelAnimationFrame(raf);raf=0;}},{threshold:.02}).observe(hero);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{last=performance.now()-40;request();}});
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,angle:azimuth,id:e.pointerId};canvas.setPointerCapture(e.pointerId);request();});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;azimuth=Math.max(initialAngle-1.1,Math.min(initialAngle+1.1,drag.angle+(drag.x-e.clientX)*.005));request();});
 const endDrag=()=>{drag=null;settle=performance.now()+100;request();};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')azimuth-=.12;if(e.key==='ArrowRight')azimuth+=.12;if(e.key==='ArrowUp')zoom=Math.min(1.7,zoom+.1);if(e.key==='ArrowDown')zoom=Math.max(.7,zoom-.1);if(e.key==='Home'){azimuth=initialAngle;zoom=1;target.copy(initialTarget);}settle=performance.now()+100;request();}});
 document.querySelectorAll('[data-scene-action]').forEach(b=>b.addEventListener('click',()=>{switch(b.dataset.sceneAction){case 'zoom-in':zoom=Math.min(1.7,zoom+.15);break;case 'zoom-out':zoom=Math.max(.7,zoom-.15);break;case 'reset':azimuth=initialAngle;zoom=1;target.copy(initialTarget);break;case 'motion':paused=!paused;syncMotion();try{localStorage.setItem('campus-motion',paused?'paused':'active');}catch{}break;}settle=performance.now()+100;request();}));
 reduced.addEventListener('change',e=>{paused=e.matches;syncMotion();request();});
 pins.forEach(({a,target:to})=>a.addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0||reduced.matches)return;e.preventDefault();if(flight)return;flight={start:performance.now(),from:target.clone(),to,zoom,href:a.href};status.textContent=a.textContent.replace(/0[2-5]/,'').replace('↗','').trim()+'へ移動します。';request();}));
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;hero.classList.remove('scene-ready');fallback();});
 renderer.shadowMap.needsUpdate=true;resize();request();
}
