import * as THREE from '../js/vendor/three.module.min.js';
import { createRoom } from './room-model.js?v=20260908-detail';
import { createDeskLandmarks } from './desk-landmarks.js?v=20260908-detail';
import { StudyCanvasRenderer } from './study-software.js';

export async function mountStudy({canvas,pins,onSelect,onReady,onError}) {
  let renderer;
  try {const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});renderer=context?new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'}):new StudyCanvasRenderer(canvas,THREE);} catch(e){onError(e);return {dispose(){}};}
  const software=!!renderer.software;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#a9a077');
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const camera=new THREE.PerspectiveCamera(40,1,.1,80);
  const ambient=new THREE.HemisphereLight('#ffedc4','#584732',2.1);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe5a6',3.7);sun.position.set(-3.6,7.5,5);sun.target.position.set(0,2,-1.5);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-6,near:.5,far:30});
  sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=4;scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#e0e6df',.65);fill.position.set(4,3,4);scene.add(fill);
  let room;let textureRevision=0;
  try{room=createRoom(THREE,{photo1:'/images/hero-waseda.webp',photo2:'/images/hero-karatsu.webp',photo3:'/images/hero-kyukeisha.webp',photoRatios:[4/3,16/9,16/9],onTextureLoad(){textureRevision++;}});const landmarks=await createDeskLandmarks(THREE);room.group.add(landmarks.group);room.targets.push(...landmarks.targets);scene.add(room.group);}catch(e){renderer.dispose();onError(e);return {dispose(){}};}
  const lamp=room.lampLight;const lampDay=lamp.intensity;
  // Soft contact shading grounds the furniture without costly postprocessing.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(26,15,5,.46)');grad.addColorStop(.45,'rgba(26,15,5,.23)');grad.addColorStop(1,'rgba(26,15,5,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const shadowTex=new THREE.CanvasTexture(c);
  for(const [x,z,w,h] of [[0,.2,7,3.4],[1.2,2.3,2.8,2.6],[-4,1,2.7,2.4]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);scene.add(m);}
  // A subtly moving light mask makes the daylight feel filtered through leaves.
  const d=document.createElement('canvas');d.width=d.height=512;const dc=d.getContext('2d');
  let seed=98;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<72;i++){let x=rand()*512,y=rand()*512;dc.save();dc.translate(x,y);dc.rotate(rand()*Math.PI);dc.scale(1,.42);const g=dc.createRadialGradient(0,0,1,0,0,20+rand()*30);g.addColorStop(0,'rgba(20,30,9,.17)');g.addColorStop(.5,'rgba(20,30,9,.12)');g.addColorStop(1,'rgba(20,30,9,0)');dc.fillStyle=g;dc.fillRect(-60,-60,120,120);dc.restore();}
  const dtex=new THREE.CanvasTexture(d);dtex.wrapS=dtex.wrapT=THREE.RepeatWrapping;dtex.repeat.set(1.5,1);
  const dapple=new THREE.Mesh(new THREE.PlaneGeometry(15,8),new THREE.MeshBasicMaterial({map:dtex,transparent:true,depthWrite:false,opacity:.6}));dapple.position.set(0,3.5,-1.375);scene.add(dapple);
  const dustGeometry=new THREE.BufferGeometry();const dustPositions=new Float32Array(96*3);
  for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(rand()-.5)*10;dustPositions[i+1]=rand()*6;dustPositions[i+2]=rand()*4;}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:'#fff1bf',size:.014,transparent:true,opacity:.4,depthWrite:false}));scene.add(dust);
  const homeTarget=new THREE.Vector3(0,2.85,0),look=homeTarget.clone(),desiredLook=homeTarget.clone(),desiredPosition=new THREE.Vector3();
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  const targetMap=new Map(room.targets.map(t=>[t.id,t]));
  const pinMap=new Map([...pins.querySelectorAll('[data-pin]')].map(p=>[p.dataset.pin,p]));
  const rayMeshes=[];room.group.traverse(o=>{if(o.isMesh)rayMeshes.push(o);});
  const moveListeners=[];function listen(el,event,handler,options){el.addEventListener(event,handler,options);moveListeners.push(()=>el.removeEventListener(event,handler,options));}
  let width=innerWidth,height=innerHeight,portrait=false,zoomLevel=1,panX=0,panY=0,active=null,hover=null,night=false,nightMix=0,paused=software||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastDraw=0,renderState='',lastTime=0,animTime=0,raf=0,dead=false,drag=null,lastDown=null,moved=false,visible=!document.hidden,frames=0,slow=0;
  const touchPoints=new Map();let pinchDistance=null,pinchMidpoint=null;
  // Lens zoom preserves the original perspective and keeps the camera outside
  // furniture even when inspecting the miniatures at six times the home size.
  const minZoom=.65,maxZoom=6;
  const navigationCamera=camera.clone(),navigationRay=new THREE.Raycaster();
  const navigationPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const beforeZoom=new THREE.Vector3(),afterZoom=new THREE.Vector3();
  function homeDistance(){return portrait?15.7:9.4;}
  function resize(){width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);portrait=width/height<.85;homeTarget.y=portrait?1.6:2.85;clampPan();camera.aspect=width/height;camera.fov=portrait?46:40;camera.updateProjectionMatrix();renderer.setSize(width,height,false);updateDesired();if(!frames){camera.position.copy(desiredPosition);look.copy(desiredLook);camera.lookAt(look);}}
  function updateDesired(){if(active){const target=targetMap.get(active).anchor;desiredLook.copy(target);desiredLook.x+=portrait?0:1.35;desiredPosition.set(target.x+(portrait?0:1.25),target.y+1.0,portrait?8.1:5.7);}else{const sway=paused?0:Math.max(0,1-(zoomLevel-1)*2);desiredLook.set(homeTarget.x+panX,homeTarget.y+panY,0);desiredPosition.set(.12+panX+pointer.x*.18*sway,3.6+panY+pointer.y*.075*sway,homeDistance());}}
  function clampPan(){panX=THREE.MathUtils.clamp(panX,-5.8,5.8);panY=THREE.MathUtils.clamp(panY,.45-homeTarget.y,5.8-homeTarget.y);}
  function pointAt(x,y,out){
    updateDesired();navigationCamera.copy(camera);navigationCamera.position.copy(desiredPosition);navigationCamera.lookAt(desiredLook);navigationCamera.zoom=zoomLevel;navigationCamera.updateProjectionMatrix();navigationCamera.updateMatrixWorld();
    const b=canvas.getBoundingClientRect();navigationRay.setFromCamera({x:(x-b.left)/width*2-1,y:-(y-b.top)/height*2+1},navigationCamera);
    return navigationRay.ray.intersectPlane(navigationPlane,out);
  }
  function announceView(){canvas.dispatchEvent(new CustomEvent('viewchange',{detail:{zoom:zoomLevel}}));}
  function changeZoom(factor,x,y,previousX=x,previousY=y){
    if(active||!Number.isFinite(factor)||factor<=0)return;
    const anchored=Number.isFinite(x)&&Number.isFinite(y)&&pointAt(previousX,previousY,beforeZoom);
    zoomLevel=THREE.MathUtils.clamp(zoomLevel*factor,minZoom,maxZoom);
    if(anchored&&pointAt(x,y,afterZoom)){panX+=beforeZoom.x-afterZoom.x;panY+=beforeZoom.y-afterZoom.y;clampPan();}
    announceView();
  }
  function panPixels(dx,dy){
    const b=canvas.getBoundingClientRect(),cx=b.left+width/2,cy=b.top+height/2;
    if(pointAt(cx,cy,beforeZoom)&&pointAt(cx+dx,cy+dy,afterZoom)){panX+=beforeZoom.x-afterZoom.x;panY+=beforeZoom.y-afterZoom.y;clampPan();}
  }
  function resetView(){active=null;panX=panY=0;zoomLevel=1;pointer.set(0,0);announceView();}
  function pick(e){const b=canvas.getBoundingClientRect();raycaster.setFromCamera({x:(e.clientX-b.left)/b.width*2-1,y:-(e.clientY-b.top)/b.height*2+1},camera);const hits=raycaster.intersectObjects(rayMeshes,false);for(const hit of hits){if(hit.object.material?.transparent && hit.object.material.opacity<.2)continue;return hit.object.userData.targetId??null;}return null;}
  function markHover(id){if(id===hover)return;hover=id;canvas.style.cursor=id?'pointer':'grab';pinMap.forEach((p,key)=>p.classList.toggle('is-hovered',key===id));}
  listen(canvas,'pointerdown',e=>{
    if(active||e.button!==0)return;canvas.setPointerCapture(e.pointerId);touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size===1){lastDown={x:e.clientX,y:e.clientY};drag={x:e.clientX,y:e.clientY};moved=false;}
    else{const[a,b]=[...touchPoints.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pinchMidpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};moved=true;lastDown=null;drag=null;}
    canvas.style.cursor='grabbing';
  });
  listen(canvas,'pointermove',e=>{
    if(!drag&&!touchPoints.size){const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/width*2-1,-(e.clientY-b.top)/height*2+1);}
    if(touchPoints.has(e.pointerId))touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size>=2){const[a,b]=[...touchPoints.values()],len=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(pinchDistance>0&&pinchMidpoint)changeZoom(len/pinchDistance,mid.x,mid.y,pinchMidpoint.x,pinchMidpoint.y);
      pinchDistance=len;pinchMidpoint=mid;moved=true;return;
    }
    if(drag&&touchPoints.has(e.pointerId)){if(lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)>7)moved=true;panPixels(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};}else if(!active)markHover(pick(e));
  });
  function endPointer(e,cancelled=false){
    if(!touchPoints.has(e.pointerId))return;touchPoints.delete(e.pointerId);pinchDistance=pinchMidpoint=null;
    if(!cancelled&&!moved&&lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)<8){const id=pick(e);if(id)onSelect(id);}
    lastDown=null;const remaining=touchPoints.values().next().value;drag=remaining?{...remaining}:null;if(remaining)moved=true;
    canvas.style.cursor=remaining?'grabbing':hover?'pointer':'grab';
  }
  listen(canvas,'pointerup',e=>endPointer(e));
  listen(canvas,'pointercancel',e=>endPointer(e,true));
  listen(canvas,'lostpointercapture',e=>endPointer(e,true));
  listen(canvas,'pointerleave',()=>{if(!drag){pointer.set(0,0);markHover(null);}});
  listen(canvas,'wheel',e=>{if(active||e.ctrlKey||e.metaKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);changeZoom(Math.exp(-THREE.MathUtils.clamp(delta,-300,300)*.0018),e.clientX,e.clientY);},{passive:false});
  listen(canvas,'keydown',e=>{if(active||e.ctrlKey||e.metaKey||e.altKey)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Home','0'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')panPixels(55,0);if(e.key==='ArrowRight')panPixels(-55,0);if(e.shiftKey&&e.key==='ArrowUp')panPixels(0,55);else if(e.key==='ArrowUp'||e.key==='+'||e.key==='=')changeZoom(1.18);if(e.shiftKey&&e.key==='ArrowDown')panPixels(0,-55);else if(e.key==='ArrowDown'||e.key==='-'||e.key==='_')changeZoom(1/1.18);if(e.key==='Home'||e.key==='0')resetView();}});
  listen(window,'resize',resize);
  listen(document,'visibilitychange',()=>{visible=!document.hidden;if(visible){lastTime=0;raf=requestAnimationFrame(animate);}else cancelAnimationFrame(raf);});
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();onError(new Error('WebGL context lost'));cancelAnimationFrame(raf);});
  function positionPins(){camera.updateMatrixWorld();for(const t of room.targets){const p=pinMap.get(t.id);if(!p)continue;const v=t.anchor.clone().project(camera);let x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;const off=v.z>1||x<15||x>width-15||y<82||y>height-125;p.style.visibility=off?'hidden':'visible';p.style.left=Math.max(55,Math.min(width-70,x))+'px';p.style.top=y+'px';}}
  function animate(ms){if(dead||!visible)return;raf=requestAnimationFrame(animate);if(ms-lastDraw<(software?250:30))return;lastDraw=ms;const delta=lastTime?Math.min((ms-lastTime)/1000,.07):.016;lastTime=ms;if(!paused)animTime+=delta;
    updateDesired();const ease=paused?1:1-Math.exp(-delta*7);camera.position.lerp(desiredPosition,ease);look.lerp(desiredLook,ease);camera.lookAt(look);camera.zoom=THREE.MathUtils.lerp(camera.zoom,active?1:zoomLevel,ease);camera.updateProjectionMatrix();
    nightMix=THREE.MathUtils.lerp(nightMix,night?1:0,paused?1:1-Math.exp(-delta*3));sun.intensity=THREE.MathUtils.lerp(3.7,.18,nightMix);sun.color.set(night?'#93b7f0':'#ffe5a6');ambient.intensity=THREE.MathUtils.lerp(2.1,.52,nightMix);fill.intensity=THREE.MathUtils.lerp(.65,.25,nightMix);lamp.intensity=THREE.MathUtils.lerp(lampDay,22,nightMix);renderer.toneMappingExposure=THREE.MathUtils.lerp(1.2,1.15,nightMix);dapple.material.opacity=.6*(1-nightMix);dtex.offset.x=Math.sin(animTime*.13)*.015;
    if(!software){room.pets?.forEach(p=>{p.object.scale.y=p.baseScale.y*(1+Math.sin(animTime*1.5+p.phase)*.015);});room.animated.forEach((p,i)=>{p.rotation.z=Math.sin(animTime*.65+i*1.3)*.012;p.rotation.x=Math.sin(animTime*.48+i)*.009;});dust.rotation.y=animTime*.009;dust.position.y=Math.sin(animTime*.22)*.05;}
    const state=[camera.position.x,camera.position.y,camera.position.z,camera.zoom,look.x,look.y,look.z,width,height,textureRevision].map(n=>n.toFixed(3)).join(',');if(!software||frames<24||state!==renderState){renderer.render(scene,camera);renderState=state;}positionPins();frames++;
    if(frames===2)onReady();if(delta>.047)slow++;if(frames===180&&slow>75){renderer.setPixelRatio(1);renderer.shadowMap.autoUpdate=false;}
  }
  resize();raf=requestAnimationFrame(animate);
  return {software,focus(id){active=targetMap.has(id)?id:null;markHover(null);},setNight(v){night=software?false:v;renderer.shadowMap.needsUpdate=true;},setPaused(v){paused=software||v;},zoom(n){changeZoom(Math.exp(-n*.25));},reset:resetView,dispose(){dead=true;cancelAnimationFrame(raf);moveListeners.forEach(f=>f());const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();}};
}
