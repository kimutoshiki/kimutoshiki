import * as THREE from '../js/vendor/three.module.min.js';
import { getRoomTime, updateRoomClock } from './room-time.js?v=20260909-clock';
import { loadSurfaceMaterials } from './surface-materials.js';
import { createRoom } from './room-model.js?v=20260909-decor';
import { createDeskLandmarks } from './desk-landmarks.js?v=20260909-materials';
import { createOrbitNavigation } from './orbit-navigation.js';
import { StudyCanvasRenderer } from './study-software.js?v=20260909-clock';

export async function mountStudy({canvas,pins,onSelect,onReady,onError,now=()=>new Date()}) {
  let renderer;
  try {const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});renderer=context?new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'}):new StudyCanvasRenderer(canvas,THREE);} catch(e){onError(e);return {dispose(){}};}
  const software=!!renderer.software;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#a9a077');
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const camera=new THREE.PerspectiveCamera(40,1,.025,80);
  const ambient=new THREE.HemisphereLight('#e6eddf','#735438',1.35);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff0d2',3.7);sun.position.set(-11,8,-9);sun.target.position.set(1,2,3);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-6,near:.5,far:30});
  sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=4;scene.add(sun,sun.target);
  const bounce=new THREE.AmbientLight('#fff2df',1);scene.add(bounce);
  const fill=new THREE.DirectionalLight('#e0e6df',.65);fill.position.set(4,3,4);scene.add(fill);
  let room;let textureRevision=0;
  try{room=createRoom(THREE,{photo1:'/images/hero-waseda.webp',photo2:'/images/hero-karatsu.webp',photo3:'/images/hero-kyukeisha.webp',photoRatios:[4/3,16/9,16/9],onTextureLoad(){textureRevision++;}});const landmarks=await createDeskLandmarks(THREE);room.group.add(landmarks.group);room.targets.push(...landmarks.targets);scene.add(room.group);}catch(e){renderer.dispose();onError(e);return {dispose(){}};}
  const surfaces=loadSurfaceMaterials(THREE,room.group,{onLoad(){textureRevision++;renderer.invalidate?.();},anisotropy:renderer.capabilities?.getMaxAnisotropy?.()||1});
  const lamp=room.lampLight;
  const roomEffects=new THREE.Group();roomEffects.name='Room atmosphere';scene.add(roomEffects);
  const inspectionRoot=new THREE.Group();inspectionRoot.name='360 degree inspection';inspectionRoot.userData.inspectionRoot=true;inspectionRoot.visible=false;scene.add(inspectionRoot);
  let inspectedClone=null;
  // Soft contact shading grounds the furniture without costly postprocessing.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(26,15,5,.46)');grad.addColorStop(.45,'rgba(26,15,5,.23)');grad.addColorStop(1,'rgba(26,15,5,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const shadowTex=new THREE.CanvasTexture(c);
  for(const [x,z,w,h] of [[0,.2,7,3.4],[1.2,2.3,2.8,2.6],[-4,1,2.7,2.4]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);roomEffects.add(m);}
  // A subtly moving light mask makes the daylight feel filtered through leaves.
  const d=document.createElement('canvas');d.width=d.height=512;const dc=d.getContext('2d');
  let seed=98;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<72;i++){let x=rand()*512,y=rand()*512;dc.save();dc.translate(x,y);dc.rotate(rand()*Math.PI);dc.scale(1,.42);const g=dc.createRadialGradient(0,0,1,0,0,20+rand()*30);g.addColorStop(0,'rgba(20,30,9,.17)');g.addColorStop(.5,'rgba(20,30,9,.12)');g.addColorStop(1,'rgba(20,30,9,0)');dc.fillStyle=g;dc.fillRect(-60,-60,120,120);dc.restore();}
  const dtex=new THREE.CanvasTexture(d);dtex.wrapS=dtex.wrapT=THREE.RepeatWrapping;dtex.repeat.set(1.5,1);
  const dapple=new THREE.Mesh(new THREE.PlaneGeometry(15,8),new THREE.MeshBasicMaterial({map:dtex,transparent:true,depthWrite:false,opacity:.6}));dapple.position.set(0,3.5,-1.375);roomEffects.add(dapple);
  const dustGeometry=new THREE.BufferGeometry();const dustPositions=new Float32Array(96*3);
  for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(rand()-.5)*10;dustPositions[i+1]=rand()*6;dustPositions[i+2]=rand()*4;}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:'#fff1bf',size:.012,transparent:true,opacity:.4,depthWrite:false}));roomEffects.add(dust);
  const look=new THREE.Vector3(),desiredLook=new THREE.Vector3(),desiredPosition=new THREE.Vector3();
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  const targetMap=new Map(room.targets.map(t=>[t.id,t]));
  const inspectMap=new Map(room.targets.map(t=>[t.id,t.object.children.find(o=>o.userData.inspectionSource)||t.object]));
  if(room.pets?.[0])inspectMap.set('cat',room.pets[0].object);
  const pinMap=new Map([...pins.querySelectorAll('[data-pin]')].map(p=>[p.dataset.pin,p]));
  const rayMeshes=[];room.group.traverse(o=>{if(o.isMesh)rayMeshes.push(o);});
  const moveListeners=[];function listen(el,event,handler,options){el.addEventListener(event,handler,options);moveListeners.push(()=>el.removeEventListener(event,handler,options));}
  let width=innerWidth,height=innerHeight,portrait=false,active=null,hover=null,lightingMode='auto',timeKey='',timeRevision=0,paused=software||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastDraw=0,renderState='',pinState='',lastTime=0,animTime=0,raf=0,dead=false,drag=null,lastDown=null,moved=false,visible=!document.hidden,frames=0,slow=0;
  const navigation=createOrbitNavigation(THREE,room.envelope.bounds);
  const touchPoints=new Map();let pinchDistance=null,pinchMidpoint=null;
  const navigationCamera=camera.clone(),navigationRay=new THREE.Raycaster();
  const navigationPlane=new THREE.Plane(),normal=new THREE.Vector3();
  const beforeZoom=new THREE.Vector3(),afterZoom=new THREE.Vector3();
  function resize(){width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);portrait=width/height<.85;camera.aspect=width/height;camera.fov=50;camera.updateProjectionMatrix();navigation.resize(portrait,width/height);renderer.setSize(width,height,false);updateDesired();if(!frames){camera.position.copy(desiredPosition);look.copy(desiredLook);camera.lookAt(look);}}
  function updateDesired(){const view=navigation.update();desiredLook.copy(view.target);desiredPosition.copy(view.position);return view;}
  function pointAt(x,y,out){
    const view=updateDesired();navigationCamera.copy(camera);navigationCamera.position.copy(desiredPosition);navigationCamera.lookAt(desiredLook);navigationCamera.zoom=view.zoom;navigationCamera.updateProjectionMatrix();navigationCamera.updateMatrixWorld();
    normal.copy(desiredPosition).sub(desiredLook).normalize();navigationPlane.setFromNormalAndCoplanarPoint(normal,desiredLook);
    const b=canvas.getBoundingClientRect();navigationRay.setFromCamera({x:(x-b.left)/width*2-1,y:-(y-b.top)/height*2+1},navigationCamera);
    return navigationRay.ray.intersectPlane(navigationPlane,out);
  }
  function announceView(){const view=navigation.update();canvas.dispatchEvent(new CustomEvent('viewchange',{detail:{zoom:view.scale,subject:view.subject}}));}
  function changeZoom(factor,x,y,previousX=x,previousY=y){
    if(active||!Number.isFinite(factor)||factor<=0)return;
    const anchored=Number.isFinite(x)&&Number.isFinite(y)&&pointAt(previousX,previousY,beforeZoom);
    navigation.zoom(factor);
    if(anchored&&pointAt(x,y,afterZoom))navigation.pan(beforeZoom.clone().sub(afterZoom));
    announceView();
  }
  function panPixels(dx,dy){const b=canvas.getBoundingClientRect(),cx=b.left+width/2,cy=b.top+height/2;if(pointAt(cx,cy,beforeZoom)&&pointAt(cx+dx,cy+dy,afterZoom))navigation.pan(beforeZoom.clone().sub(afterZoom));}
  function snapView(){const view=updateDesired();camera.position.copy(view.position);look.copy(view.target);camera.zoom=view.zoom;camera.lookAt(look);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  function setInspection(id){
    const source=inspectMap.get(id);inspectionRoot.clear();inspectedClone=null;
    const inspecting=id!=='room'&&!!source;
    room.group.visible=roomEffects.visible=!inspecting;inspectionRoot.visible=inspecting;
    scene.background.set(inspecting?'#514a40':roomBackground);
    if(inspecting){
      // A copy of the same meshes gives every side space, without moving any
      // original miniature, furniture or animated plant in the room.
      source.updateWorldMatrix(true,true);inspectedClone=source.clone(true);
      source.matrixWorld.decompose(inspectedClone.position,inspectedClone.quaternion,inspectedClone.scale);
      inspectionRoot.add(inspectedClone);inspectionRoot.updateMatrixWorld(true);
      const center=new THREE.Box3().setFromObject(inspectedClone).getCenter(new THREE.Vector3());
      inspectedClone.position.add(new THREE.Vector3(0,3,3.4).sub(center));inspectionRoot.updateMatrixWorld(true);
      navigation.inspect(id,inspectedClone);
    }else navigation.reset();
    renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;markHover(null);snapView();announceView();
  }
  function resetView(){active=null;setInspection('room');}
  function pick(e){if(inspectionRoot.visible)return null;const b=canvas.getBoundingClientRect();raycaster.setFromCamera({x:(e.clientX-b.left)/b.width*2-1,y:-(e.clientY-b.top)/b.height*2+1},camera);const hits=raycaster.intersectObjects(rayMeshes,false);for(const hit of hits){if(hit.object.material?.transparent && hit.object.material.opacity<.2)continue;return hit.object.userData.targetId??null;}return null;}
  function markHover(id){if(id===hover)return;hover=id;canvas.style.cursor=id?'pointer':'grab';pinMap.forEach((p,key)=>p.classList.toggle('is-hovered',key===id));}
  listen(canvas,'pointerdown',e=>{
    if(active||![0,1,2].includes(e.button))return;e.preventDefault();canvas.setPointerCapture(e.pointerId);touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size===1){lastDown={x:e.clientX,y:e.clientY};drag={x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey};moved=false;}
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
    if(drag&&touchPoints.has(e.pointerId)){if(lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)>7)moved=true;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.pan||e.shiftKey)panPixels(dx,dy);else navigation.rotate(dx/width*Math.PI*1.7,dy/height*Math.PI*1.3);drag={x:e.clientX,y:e.clientY,pan:drag.pan};}else if(!active)markHover(pick(e));
  });
  function endPointer(e,cancelled=false){
    if(!touchPoints.has(e.pointerId))return;touchPoints.delete(e.pointerId);pinchDistance=pinchMidpoint=null;
    if(e.button===0&&!cancelled&&!moved&&lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)<8){const id=pick(e);if(id)onSelect(id);}
    lastDown=null;const remaining=touchPoints.values().next().value;drag=remaining?{...remaining}:null;if(remaining)moved=true;
    canvas.style.cursor=remaining?'grabbing':hover?'pointer':'grab';
  }
  listen(canvas,'contextmenu',e=>e.preventDefault());
  listen(canvas,'pointerup',e=>endPointer(e));
  listen(canvas,'pointercancel',e=>endPointer(e,true));
  listen(canvas,'lostpointercapture',e=>endPointer(e,true));
  listen(canvas,'pointerleave',()=>{if(!drag){pointer.set(0,0);markHover(null);}});
  listen(canvas,'wheel',e=>{if(active||e.ctrlKey||e.metaKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);changeZoom(Math.exp(-THREE.MathUtils.clamp(delta,-300,300)*.0018),e.clientX,e.clientY);},{passive:false});
  listen(canvas,'keydown',e=>{if(active||e.ctrlKey||e.metaKey||e.altKey)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Home','0'].includes(e.key)){e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(dx||dy){if(e.shiftKey)panPixels(-dx*45,-dy*45);else navigation.rotate(-dx*.16,-dy*.13);}if(e.key==='+'||e.key==='=')changeZoom(1.18);if(e.key==='-'||e.key==='_')changeZoom(1/1.18);if(e.key==='Home'||e.key==='0')resetView();}});
  listen(window,'resize',resize);
  listen(document,'visibilitychange',()=>{visible=!document.hidden;if(visible){lastTime=0;syncTime();raf=requestAnimationFrame(animate);}else cancelAnimationFrame(raf);});
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();onError(new Error('WebGL context lost'));cancelAnimationFrame(raf);});
  const pinRay=new THREE.Raycaster(),pinDirection=new THREE.Vector3();
  function positionPins(){camera.updateMatrixWorld();for(const t of room.targets){const p=pinMap.get(t.id);if(!p)continue;const v=t.anchor.clone().project(camera);let x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;let off=inspectionRoot.visible||v.z< -1||v.z>1||x<15||x>width-15||y<82||y>height-125;
    if(!off){pinDirection.copy(t.anchor).sub(camera.position);pinRay.set(camera.position,pinDirection.clone().normalize());pinRay.far=Math.max(0,pinDirection.length()-.025);const blocker=pinRay.intersectObjects(rayMeshes,false).find(hit=>!(hit.object.material?.transparent&&hit.object.material.opacity<.2));off=!!blocker&&blocker.object.userData.targetId!==t.id;}
    p.style.visibility=off?'hidden':'visible';p.style.left=Math.max(55,Math.min(width-70,x))+'px';p.style.top=y+'px';}}
  let roomBackground = '#bcb392';
  const dayColor=new THREE.Color('#fff6e5'),eveningColor=new THREE.Color('#ffc783'),nightColor=new THREE.Color('#a9c5ed');
  function syncTime() {
    const time=getRoomTime(now(),lightingMode),key=time.minuteKey+':'+lightingMode;
    if(key===timeKey)return;
    timeKey=key;timeRevision++;
    updateRoomClock(room.clock,time);
    sun.intensity=time.sunIntensity;sun.position.fromArray(time.sunPosition);sun.target.position.fromArray(time.sunTarget);
    sun.color.copy(dayColor).lerp(eveningColor,time.warmth*.8).lerp(nightColor,1-time.daylight);
    ambient.intensity=time.hemisphereIntensity;bounce.intensity=time.ambientIntensity;
    fill.intensity=time.fillIntensity;lamp.intensity=time.lampIntensity;
    renderer.toneMappingExposure=time.exposure;
    renderer.setLighting?.(time.softwareGain,time.softwareTint);
    room.windowMaterial.emissiveIntensity=time.windowGlow;room.decorations?.setDaylight(time.daylight);
    dapple.material.opacity=.26*time.daylight;dust.material.opacity=.15+.18*time.daylight;
    roomBackground=new THREE.Color('#77736a').lerp(new THREE.Color('#bcb392'),time.daylight).getHex();
    if(!inspectionRoot.visible)scene.background.set(roomBackground);
    // Clock transforms and moving sun shadows must refresh even with motion paused.
    renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;
    canvas.dispatchEvent(new CustomEvent('roomtimechange',{detail:{label:time.label,dateTime:time.dateTime,phase:time.phase,mode:lightingMode}}));
  }
  function animate(ms){if(dead||!visible)return;raf=requestAnimationFrame(animate);if(ms-lastDraw<(software?250:30))return;lastDraw=ms;const delta=lastTime?Math.min((ms-lastTime)/1000,.07):.016;lastTime=ms;if(!paused)animTime+=delta;
    // Orbit coordinates are already continuous with pointer motion. Applying a
    // Cartesian lerp here would cut through models when changing direction.
    const view=updateDesired();camera.position.copy(desiredPosition);look.copy(desiredLook);camera.lookAt(look);camera.zoom=view.zoom;camera.updateProjectionMatrix();
    syncTime();dtex.offset.x=Math.sin(animTime*.13)*.015;
    if(!software){room.decorations?.update(animTime);room.pets?.forEach(p=>{p.object.scale.y=p.baseScale.y*(1+Math.sin(animTime*1.5+p.phase)*.015);});room.animated.forEach((p,i)=>{p.rotation.z=Math.sin(animTime*.65+i*1.3)*.012;p.rotation.x=Math.sin(animTime*.48+i)*.009;});dust.rotation.y=animTime*.009;dust.position.y=Math.sin(animTime*.22)*.05;}
    const state=view.subject+','+[camera.position.x,camera.position.y,camera.position.z,camera.zoom,look.x,look.y,look.z,width,height,textureRevision,timeRevision].map(n=>n.toFixed(3)).join(',');if(!software||frames<3||state!==renderState){renderer.render(scene,camera);renderState=state;}if(state!==pinState||(!paused&&frames%10===0)){positionPins();pinState=state;}frames++;
    if(frames===2)onReady();if(delta>.047)slow++;if(frames===180&&slow>75){renderer.setPixelRatio(1);renderer.shadowMap.autoUpdate=false;}
  }
  resize();syncTime();raf=requestAnimationFrame(animate);
  return {software,focus(id){active=targetMap.has(id)?id:null;markHover(null);},inspect(id){active=null;setInspection(id);},preset(name){navigation.preset(name);snapView();announceView();},setLightingMode(mode){if(!['auto','day','night'].includes(mode))return;lightingMode=mode;syncTime();},setPaused(v){paused=software||v;},zoom(n){changeZoom(Math.exp(-n*.25));},reset:resetView,dispose(){dead=true;room.decorations?.dispose();surfaces.dispose();cancelAnimationFrame(raf);moveListeners.forEach(f=>f());const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();}};
}
