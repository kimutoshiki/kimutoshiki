import * as THREE from '../js/vendor/three.module.min.js';
import { getRoomTime, updateRoomClock } from './room-time.js?v=20260916-perf1';
import { loadSurfaceMaterials } from './surface-materials.js?v=20260916-perf1';
import { createRoom } from './room-model.js?v=20260916-perf1';
import { createDeskLandmarks } from './desk-landmarks.js?v=20260916-perf1';
import { createOrbitNavigation } from './orbit-navigation.js?v=20260916-perf1';
import { StudyCanvasRenderer } from './study-software.js?v=20260916-perf1';
import { createObjectActions } from './object-actions.js?v=20260916-perf1';
import { createWallNavigation } from './wall-navigation.js?v=20260916-perf1';
import { loadCatAsset } from './cat-asset.js?v=20260916-perf1';
import { clone as cloneSkeleton } from '../js/vendor/SkeletonUtils.js';
import { createRoomPicking } from './room-picking.js?v=20260916-perf1';
import { optimizeRoomStaticDraws } from './static-batching.js?v=20260916-perf1';

export async function mountStudy({canvas,pins,onSelect,onReady,onError,now=()=>new Date(),catAsset}) {
  let renderer;
  try {const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});renderer=context?new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'}):new StudyCanvasRenderer(canvas,THREE);} catch(e){onError(e);return {dispose(){}};}
  const software=!!renderer.software;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#a9a077');
  // A tiny neutral reflection environment lets brass and glazed ceramics show
  // broad highlights; no external HDR download or postprocessing chain needed.
  const reflectionCanvas=document.createElement('canvas');reflectionCanvas.width=256;reflectionCanvas.height=128;
  const reflectionContext=reflectionCanvas.getContext('2d');
  const reflectionGradient=reflectionContext.createLinearGradient(0,0,0,128);
  reflectionGradient.addColorStop(0,'#b9c8ce');reflectionGradient.addColorStop(.47,'#f0e5ce');reflectionGradient.addColorStop(1,'#47382e');
  reflectionContext.fillStyle=reflectionGradient;reflectionContext.fillRect(0,0,256,128);
  reflectionContext.fillStyle='#fff8e6';reflectionContext.fillRect(38,18,22,60);
  reflectionContext.fillStyle='#cddce2';reflectionContext.fillRect(164,28,38,42);
  const reflectionMap=new THREE.CanvasTexture(reflectionCanvas);reflectionMap.mapping=THREE.EquirectangularReflectionMapping;reflectionMap.colorSpace=THREE.SRGBColorSpace;
  if(!software){scene.environment=reflectionMap;scene.environmentIntensity=.28;}
  // Keep the render crisp on high-density screens. Frame cadence, rather than
  // resolution, is the performance budget for this mostly stationary room.
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const camera=new THREE.PerspectiveCamera(40,1,.025,80);
  const ambient=new THREE.HemisphereLight('#e6eddf','#735438',1.35);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff0d2',3.7);sun.position.set(-11,8,-9);sun.target.position.set(1,2,3);
  sun.castShadow=true;const shadowResolution=Math.min(4096,renderer.capabilities?.maxTextureSize||2048);sun.shadow.mapSize.set(shadowResolution,shadowResolution);Object.assign(sun.shadow.camera,{left:-7.4,right:7.4,top:7,bottom:-6,near:.5,far:36});
  sun.shadow.normalBias=.016;sun.shadow.bias=-.00006;sun.shadow.radius=3;scene.add(sun,sun.target);
  const bounce=new THREE.AmbientLight('#fff2df',1);scene.add(bounce);
  const fill=new THREE.DirectionalLight('#e0e6df',.65);fill.position.set(-3.8,5.9,4.2);scene.add(fill);
  let room;let textureRevision=0,catRevision=0;
  try{
    const catReady=catAsset?Promise.resolve(catAsset):loadCatAsset().catch(error=>{console.warn('Cat asset unavailable; the study remains usable:',error);return undefined;});
    const [suppliedCat,landmarks]=await Promise.all([catReady,createDeskLandmarks(THREE)]);
    room=createRoom(THREE,{catAsset:suppliedCat,loadDetailedCat:!catAsset&&!software?()=>loadCatAsset('full'):undefined,onCatChange(){catRevision++;textureRevision++;},onTextureLoad(){textureRevision++;}});
    if(!suppliedCat){delete room.cat.group.userData.roomAction;room.cat.contactShadow.visible=false;}
    room.group.add(landmarks.group);room.targets.push(...landmarks.targets);scene.add(room.group);
  }catch(e){reflectionMap.dispose();renderer.dispose();onError(e);return {dispose(){}};}
  const wallNavigation=createWallNavigation(THREE,{room:room.group,onTextureLoad(){textureRevision++;renderer.invalidate?.();}});
  room.targets.push(...wallNavigation.targets);
  const wallLinks=document.getElementById?.('room-navigation');
  const surfaces=loadSurfaceMaterials(THREE,room.group,{onLoad(){textureRevision++;renderer.invalidate?.();},anisotropy:renderer.capabilities?.getMaxAnisotropy?.()||1});
  optimizeRoomStaticDraws(THREE,room);
  const objectActions=createObjectActions(THREE,room.group);
  const lamp=room.lampLight;
  // One local desk spotlight gives paper, brass and drawer interiors their own
  // shadow direction without the six shadow passes of a point light.
  const taskLight=new THREE.SpotLight('#ffdaa2',0,5.8,.95,.65,1.4);
  taskLight.position.set(2.4,3.2,.08);taskLight.target.position.set(.8,1.45,1.15);
  taskLight.castShadow=!software;taskLight.shadow.mapSize.set(1024,1024);
  taskLight.shadow.bias=-.0003;taskLight.shadow.normalBias=.018;
  scene.add(taskLight,taskLight.target);
  const roomEffects=new THREE.Group();roomEffects.name='Room atmosphere';scene.add(roomEffects);
  const inspectionRoot=new THREE.Group();inspectionRoot.name='360 degree inspection';inspectionRoot.userData.inspectionRoot=true;inspectionRoot.visible=false;scene.add(inspectionRoot);
  let inspectedClone=null,inspectedId=null;
  // Soft contact shading grounds the furniture without costly postprocessing.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(26,15,5,.46)');grad.addColorStop(.45,'rgba(26,15,5,.23)');grad.addColorStop(1,'rgba(26,15,5,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const shadowTex=new THREE.CanvasTexture(c);
  for(const [x,z,w,h] of [[0,.2,7,3.4],[1.2,2.3,2.8,2.6],[-4,1,2.7,2.4]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);roomEffects.add(m);}
  // Tiny contact shadows remain under the desk objects in diffuse daylight.
  // Their world footprints come from the real bases, not oversized click areas.
  for(const target of room.targets.filter(t=>t.id.startsWith('landmark-'))){
    const bounds=new THREE.Box3().setFromObject(target.object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(size.x*1.06,size.z*1.06),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.55}));
    contact.rotation.x=-Math.PI/2;contact.position.set(center.x,2.171,center.z);contact.raycast=()=>{};roomEffects.add(contact);
  }
  // Light enters through the real window aperture and moving blind slats. The
  // map wall has no painted-on leaf shadow that could disagree with the sun.
  let seed=98;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  const dustGeometry=new THREE.BufferGeometry();const dustPositions=new Float32Array(96*3);
  for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(rand()-.5)*10;dustPositions[i+1]=rand()*6;dustPositions[i+2]=rand()*4;}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:'#fff1bf',size:.012,transparent:true,opacity:.4,depthWrite:false}));roomEffects.add(dust);
  const look=new THREE.Vector3(),desiredLook=new THREE.Vector3(),desiredPosition=new THREE.Vector3();
  const catViewPoint=new THREE.Vector3();
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  const targetMap=new Map(room.targets.map(t=>[t.id,t]));
  const inspectMap=new Map(room.targets.map(t=>[t.id,t.object.children.find(o=>o.userData.inspectionSource)||t.object]));
  if(room.cat?.model)inspectMap.set('cat',room.cat.group);
  const pinMap=new Map([...pins.querySelectorAll('[data-pin]')].map(p=>[p.dataset.pin,p]));
  const picking=createRoomPicking(THREE,{root:room.group});
  const rayMeshes=[];let seenCatRevision=catRevision;
  function refreshPickMeshes(){rayMeshes.length=0;room.group.traverse(o=>{if(o.isMesh)rayMeshes.push(o);});picking.refresh(rayMeshes);}
  refreshPickMeshes();
  const moveListeners=[];function listen(el,event,handler,options){el.addEventListener(event,handler,options);moveListeners.push(()=>el.removeEventListener(event,handler,options));}
  let width=innerWidth,height=innerHeight,portrait=false,active=null,hover=null,lightingMode='auto',timeKey='',timeRevision=0,paused=software||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastDraw=0,lastShadow=0,renderState='',pinState='',lastTime=0,animTime=0,raf=0,dead=false,drag=null,lastDown=null,moved=false,visible=!document.hidden,frames=0,focusedAction=null,approach=1;
  let readinessStarted=0,readySent=false,hoverPoint=null,hoverDirty=false;
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
  function announceView(){const view=navigation.update();canvas.dispatchEvent(new CustomEvent('viewchange',{detail:{zoom:view.scale,subject:view.subject,action:focusedAction?.id,label:focusedAction?.label}}));}
  function changeZoom(factor,x,y,previousX=x,previousY=y){
    if(active||!Number.isFinite(factor)||factor<=0)return;
    const anchored=Number.isFinite(x)&&Number.isFinite(y)&&pointAt(previousX,previousY,beforeZoom);
    navigation.zoom(factor);
    if(anchored&&pointAt(x,y,afterZoom))navigation.pan(beforeZoom.clone().sub(afterZoom));
    announceView();
  }
  function panPixels(dx,dy){const b=canvas.getBoundingClientRect(),cx=b.left+width/2,cy=b.top+height/2;if(pointAt(cx,cy,beforeZoom)&&pointAt(cx+dx,cy+dy,afterZoom))navigation.pan(beforeZoom.clone().sub(afterZoom));}
  function snapView(){const view=updateDesired();camera.position.copy(view.position);look.copy(view.target);camera.zoom=view.zoom;camera.lookAt(look);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  function clearInspection(){const skeletons=new Set();inspectionRoot.traverse(o=>{if(o.skeleton)skeletons.add(o.skeleton);});skeletons.forEach(skeleton=>skeleton.dispose());inspectionRoot.clear();}
  function refreshInspection(source){
    clearInspection();source.updateWorldMatrix(true,true);inspectedClone=cloneSkeleton(source);
    source.matrixWorld.decompose(inspectedClone.position,inspectedClone.quaternion,inspectedClone.scale);
    inspectionRoot.add(inspectedClone);inspectionRoot.updateMatrixWorld(true);
    const center=new THREE.Box3().setFromObject(inspectedClone).getCenter(new THREE.Vector3());
    inspectedClone.position.add(new THREE.Vector3(0,3,3.4).sub(center));inspectionRoot.updateMatrixWorld(true);
  }
  function setInspection(id){
    if(id!=='room'&&!navigation.getFreeMovement())return;
    focusedAction=null;approach=1;objectActions.clear();
    const source=inspectMap.get(id);clearInspection();inspectedClone=null;inspectedId=id;
    const inspecting=id!=='room'&&!!source;
    room.group.visible=roomEffects.visible=!inspecting;inspectionRoot.visible=inspecting;
    scene.background.set(inspecting?'#514a40':roomBackground);
    if(inspecting){
      // A copy of the same meshes gives every side space, without moving any
      // original miniature, furniture or animated plant in the room.
      refreshInspection(source);
      navigation.inspect(id,inspectedClone);
      if(id==='cat')room.cat.ensureDetail();
    }else navigation.reset();
    renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;picking.invalidate();hoverDirty=false;markHover(null);snapView();announceView();
  }
  function resetView(){active=null;setInspection('room');}
  function activateObject(id){
    const entry=objectActions.entries.get(id);if(!entry)return false;
    if(inspectionRoot.visible)setInspection('room');active=null;objectActions.restore();objectActions.trigger(id);
    // Keep the room visible. Repeated taps replay only the object's action.
    if(navigation.getFreeMovement()&&!['drawer','blinds','cat-life'].includes(entry.kind)&&focusedAction?.id!==id){focusedAction=entry;navigation.focus(entry.object);approach=paused||software?1:0;snapView();}
    renderer.invalidate?.();textureRevision++;renderer.shadowMap.needsUpdate=true;picking.invalidate();markHover(null);announceView();return true;
  }
  function pick(e){if(inspectionRoot.visible)return null;const b=canvas.getBoundingClientRect();raycaster.setFromCamera({x:(e.clientX-b.left)/b.width*2-1,y:-(e.clientY-b.top)/b.height*2+1},camera);const hit=picking.firstHit(raycaster);return hit?(objectActions.identify(hit.object)??hit.object.userData.targetId??null):null;}
  function markHover(id){if(id===hover)return;hover=id;canvas.style.cursor=id?'pointer':'grab';pinMap.forEach((p,key)=>p.classList.toggle('is-hovered',key===id));}
  listen(canvas,'pointerdown',e=>{
    if(active||![0,1,2].includes(e.button))return;e.preventDefault();canvas.setPointerCapture(e.pointerId);touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size===1){lastDown={x:e.clientX,y:e.clientY};drag={x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey};moved=false;}
    else{const[a,b]=[...touchPoints.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pinchMidpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};moved=true;lastDown=null;drag=null;}
    hoverDirty=false;canvas.style.cursor='grabbing';
  });
  listen(canvas,'pointermove',e=>{
    if(!drag&&!touchPoints.size){const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/width*2-1,-(e.clientY-b.top)/height*2+1);}
    if(touchPoints.has(e.pointerId))touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size>=2){const[a,b]=[...touchPoints.values()],len=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(pinchDistance>0&&pinchMidpoint)changeZoom(len/pinchDistance,mid.x,mid.y,pinchMidpoint.x,pinchMidpoint.y);
      pinchDistance=len;pinchMidpoint=mid;moved=true;return;
    }
    if(drag&&touchPoints.has(e.pointerId)){if(lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)>7)moved=true;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.pan||e.shiftKey)panPixels(dx,dy);else navigation.rotate(dx/width*Math.PI*1.7,dy/height*Math.PI*1.3);drag={x:e.clientX,y:e.clientY,pan:drag.pan};}else if(!active){hoverPoint={clientX:e.clientX,clientY:e.clientY};hoverDirty=true;}
  });
  function endPointer(e,cancelled=false){
    if(!touchPoints.has(e.pointerId))return;touchPoints.delete(e.pointerId);pinchDistance=pinchMidpoint=null;
    if(e.button===0&&!cancelled&&!moved&&lastDown&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)<8){const id=pick(e);if(id&&!activateObject(id))onSelect(id);}
    lastDown=null;const remaining=touchPoints.values().next().value;drag=remaining?{...remaining}:null;if(remaining)moved=true;
    canvas.style.cursor=remaining?'grabbing':hover?'pointer':'grab';
  }
  listen(canvas,'contextmenu',e=>e.preventDefault());
  listen(canvas,'pointerup',e=>endPointer(e));
  listen(canvas,'pointercancel',e=>endPointer(e,true));
  listen(canvas,'lostpointercapture',e=>endPointer(e,true));
  listen(canvas,'pointerleave',()=>{hoverPoint=null;hoverDirty=false;if(!drag){pointer.set(0,0);markHover(null);}});
  listen(canvas,'wheel',e=>{if(active||e.ctrlKey||e.metaKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);changeZoom(Math.exp(-THREE.MathUtils.clamp(delta,-300,300)*.0018),e.clientX,e.clientY);},{passive:false});
  listen(canvas,'keydown',e=>{if(active||e.ctrlKey||e.metaKey||e.altKey)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Home','0','Escape','Enter',' '].includes(e.key)){e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(dx||dy){if(e.shiftKey)panPixels(-dx*45,-dy*45);else navigation.rotate(-dx*.16,-dy*.13);}if(e.key==='+'||e.key==='=')changeZoom(1.18);if(e.key==='-'||e.key==='_')changeZoom(1/1.18);if(e.key==='Home'||e.key==='0'||e.key==='Escape')resetView();if((e.key==='Enter'||e.key===' ')&&focusedAction)activateObject(focusedAction.id);}});
  listen(window,'resize',resize);
  listen(document,'visibilitychange',()=>{visible=!document.hidden;if(visible){lastTime=0;syncTime();raf=requestAnimationFrame(animate);}else cancelAnimationFrame(raf);});
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();onError(new Error('WebGL context lost'));cancelAnimationFrame(raf);});
  const pinRay=new THREE.Raycaster(),pinDirection=new THREE.Vector3();
  function positionPins(){camera.updateMatrixWorld();pinMap.forEach(pin=>{pin.style.visibility='hidden';});for(const t of room.targets){const p=pinMap.get(t.id);if(!p)continue;const v=t.anchor.clone().project(camera);let x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;let off=inspectionRoot.visible||v.z< -1||v.z>1||x<15||x>width-15||y<82||y>height-125;
    if(!off){pinDirection.copy(t.anchor).sub(camera.position);pinRay.set(camera.position,pinDirection.clone().normalize());pinRay.far=Math.max(0,pinDirection.length()-.025);const blocker=picking.firstHit(pinRay);off=!!blocker&&blocker.object.userData.targetId!==t.id;}
    p.style.visibility=off?'hidden':'visible';p.style.left=Math.max(55,Math.min(width-70,x))+'px';p.style.top=y+'px';}}
  let roomBackground = '#8c7054';
  const dayColor=new THREE.Color('#fff6e5'),eveningColor=new THREE.Color('#ffc783'),nightColor=new THREE.Color('#a9c5ed');
  function syncTime() {
    const time=getRoomTime(now(),lightingMode),key=time.minuteKey+':'+lightingMode;
    if(key===timeKey)return;
    timeKey=key;timeRevision++;
    updateRoomClock(room.clock,time);
    sun.intensity=time.sunIntensity;sun.position.fromArray(time.sunPosition);sun.target.position.fromArray(time.sunTarget);
    sun.color.copy(dayColor).lerp(eveningColor,time.warmth*.8).lerp(nightColor,1-time.daylight);
    ambient.intensity=time.hemisphereIntensity*.72;bounce.intensity=time.ambientIntensity*.42;
    scene.environmentIntensity=.15+time.daylight*.23;
    fill.intensity=time.fillIntensity*.78;lamp.intensity=time.lampIntensity*.65;
    taskLight.intensity=2.5+(1-time.daylight)*10;
    renderer.toneMappingExposure=time.exposure;
    renderer.setLighting?.(time.softwareGain,time.softwareTint);
    room.windowMaterial.emissiveIntensity=time.windowGlow;room.decorations?.setDaylight(time.daylight);
    room.windowMaterial.color.setRGB(...time.windowTint.map(channel=>channel*time.windowBrightness));
    room.windowMaterial.emissive.setRGB(...time.windowEmissionTint);
    dust.material.opacity=.10+.15*time.daylight;
    roomBackground=new THREE.Color('#29241f').lerp(new THREE.Color('#8c7054'),time.daylight).getHex();
    if(!inspectionRoot.visible)scene.background.set(roomBackground);
    // Clock transforms and moving sun shadows must refresh even with motion paused.
    renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;picking.invalidate();
    canvas.dispatchEvent(new CustomEvent('roomtimechange',{detail:{label:time.label,dateTime:time.dateTime,phase:time.phase,mode:lightingMode}}));
  }
  function animate(ms){if(dead||!visible)return;raf=requestAnimationFrame(animate);if(ms-lastDraw<(software?250:30))return;lastDraw=ms;const delta=lastTime?Math.min((ms-lastTime)/1000,.07):.016;lastTime=ms;
    const liveMotion=!software&&!paused&&!inspectionRoot.visible;
    if(liveMotion)animTime+=delta;
    // Orbit coordinates are already continuous with pointer motion. Applying a
    // Cartesian lerp here would cut through models when changing direction.
    const view=updateDesired();camera.position.copy(desiredPosition);look.copy(desiredLook);camera.lookAt(look);approach=Math.min(1,approach+delta/ .65);const zoom=view.zoom*(.82+.18*(1-Math.pow(1-approach,3)));if(camera.zoom!==zoom){camera.zoom=zoom;camera.updateProjectionMatrix();}camera.updateMatrixWorld();
    objectActions.restore();syncTime();
    if(liveMotion){room.decorations?.update(animTime);room.pets?.forEach(p=>{p.object.scale.y=p.baseScale.y*(1+Math.sin(animTime*1.5+p.phase)*.015);});room.animated.forEach((p,i)=>{p.rotation.z=Math.sin(animTime*.65+i*1.3)*.012;p.rotation.x=Math.sin(animTime*.48+i)*.009;});dust.rotation.y=animTime*.009;dust.position.y=Math.sin(animTime*.22)*.05;}
    const actionMoved=objectActions.update(delta,liveMotion);
    const catMoved=room.cat?.update(delta,liveMotion);
    if(catRevision!==seenCatRevision){seenCatRevision=catRevision;refreshPickMeshes();if(inspectionRoot.visible&&inspectedId==='cat')refreshInspection(room.cat.group);renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;}
    // Fetch the original full-density groom only when it occupies enough pixels
    // to see. Keep the already-rendered room model until decoding has finished.
    if(!software&&!inspectionRoot.visible){
      camera.updateMatrixWorld();catViewPoint.copy(room.cat.group.position);catViewPoint.y+=.45;catViewPoint.project(camera);
      const inView=Math.abs(catViewPoint.x)<1.15&&Math.abs(catViewPoint.y)<1.15&&catViewPoint.z> -1&&catViewPoint.z<1;
      const pixels=.9*height*camera.zoom/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.distanceTo(room.cat.group.position));
      if(inView&&pixels>180)room.cat.ensureDetail();else if(!inView||pixels<145)room.cat.useRoomDetail();
    }
    const blindsMoved=room.blinds?.update(delta,liveMotion);
    if(liveMotion||actionMoved||catMoved||blindsMoved)picking.invalidate();
    if(actionMoved||catMoved||blindsMoved){renderer.invalidate?.();if(!liveMotion){textureRevision++;renderer.shadowMap.needsUpdate=true;}}
    room.photoWall?.update(camera);
    if(liveMotion&&ms-lastShadow>100){renderer.shadowMap.needsUpdate=true;lastShadow=ms;}
    wallNavigation.update(camera,wallLinks,width,height,{hidden:inspectionRoot.visible});
    const state=String(paused)+','+view.subject+','+[camera.position.x,camera.position.y,camera.position.z,camera.zoom,look.x,look.y,look.z,width,height,textureRevision,timeRevision].map(n=>n.toFixed(3)).join(',');if(liveMotion||frames<3||state!==renderState){renderer.render(scene,camera);renderState=state;}if(state!==pinState||(liveMotion&&frames%10===0)){positionPins();pinState=state;}
    // Input devices can emit many moves per frame. Only the most recent hover
    // needs an exact hit; pointer-up still selects immediately at its own point.
    if(hoverPoint&&!drag&&!active&&(hoverDirty||liveMotion&&frames%10===0)){markHover(pick(hoverPoint));hoverDirty=false;}
    frames++;
    if(!readySent){
      if(!readinessStarted)readinessStarted=ms;
      const progress=Math.min(room.photoWall?.frontProgress??1,wallNavigation.progress);
      canvas.dispatchEvent(new CustomEvent('roomloadprogress',{detail:{progress:Math.min(1,.2+.8*progress)}}));
      if(frames>=2&&(progress>=1||ms-readinessStarted>10000)){readySent=true;onReady();}
    }
  }
  resize();syncTime();raf=requestAnimationFrame(animate);
  return {software,setFreeMovement(value){navigation.setFreeMovement(value);active=null;setInspection('room');canvas.dispatchEvent(new CustomEvent('movementchange',{detail:{freeMovement:navigation.getFreeMovement()}}));},getFreeMovement(){return navigation.getFreeMovement();},getActions(){return [...objectActions.entries.values()].map(({id,label,kind})=>({id,label,kind}));},activate:activateObject,focus(id){active=targetMap.has(id)?id:null;markHover(null);},inspect(id){active=null;setInspection(id);},preset(name){focusedAction=null;approach=1;objectActions.clear();picking.invalidate();renderer.shadowMap.needsUpdate=true;navigation.preset(name);snapView();announceView();},setLightingMode(mode){if(!['auto','day','night'].includes(mode))return;objectActions.restore();lightingMode=mode;syncTime();},setPaused(v){paused=software||v;if(paused){objectActions.clear();approach=1;picking.invalidate();textureRevision++;renderer.shadowMap.needsUpdate=true;}},zoom(n){changeZoom(Math.exp(-n*.25));},reset:resetView,dispose(){dead=true;picking.dispose();clearInspection();room.dispose?.();wallNavigation.dispose();room.cat?.dispose();room.blinds?.dispose();reflectionMap.dispose();objectActions.clear();room.decorations?.dispose();room.photoWall?.dispose();surfaces.dispose();cancelAnimationFrame(raf);moveListeners.forEach(f=>f());const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();}};
}
