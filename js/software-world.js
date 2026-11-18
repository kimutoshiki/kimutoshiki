import {geometry,perspective} from './software-renderer.js?v=photo3';
import {createTextureCache} from './software-textures.js';
import {buildSoftwareDesk,SOFTWARE_DESK_ANCHORS,SOFTWARE_SEAT} from './software-desk.js?v=photo3';

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const spread=v=>({...v});
const districts={'landmark-okuma-auditorium':'大隈講堂前','landmark-okuma-statue':'大隈重信像前','landmark-karatsu-castle':'唐津城・本丸','landmark-karatsu-bank':'旧唐津銀行通り'};
const keys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','r','f','+','=','-','home','escape']);
const propWords={notebook:['ノートを閉じました。','ノートを開きました。'],lamp:['ランプを消しました。','ランプをつけました。'],drawer:['引き出しを閉じました。','引き出しを開きました。']};
export function mountSoftwareWorld({canvas,onReady,onError,onSelect,reducedMotion=false,readTextureData}) {
  // A browser cannot give a canvas a 2D context after a WebGL context has
  // been created on it. Keep the original keyboard and pointer target in place.
  let surface=canvas,ctx;
  try {ctx=canvas.getContext('2d',{alpha:false});} catch {}
  if(!ctx){
    surface=document.createElement('canvas');ctx=surface.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas 2D is unavailable');
    surface.className='world-canvas';surface.setAttribute('aria-hidden','true');
    surface.style.pointerEvents='none';canvas.before(surface);
    canvas.style.opacity='0';
  }
  surface.dataset.renderer='software';
  const controller=new AbortController(),listen=(el,type,listener,options={})=>el.addEventListener(type,listener,{signal:controller.signal,...options});
  const desk=buildSoftwareDesk(geometry()),renderer=perspective(ctx);
  let camera=spread(SOFTWARE_SEAT),props={notebook:false,lamp:true,drawer:false},progress={notebook:0,lamp:1,drawer:0};
  let garden,places,obstacles=[],gardenTask,gardenModule,exteriorFailures=0,arrival=0,district='屋外',posture='seated',outdoor=false,focusId='room',action,status='',sequence=0;
  let disposed=false,active=true,rendering=true,paused=!!reducedMotion,lightingMode='auto',ready=false,loadError=false,firstDraw=true;
  let fast=false,settleTimer=0,motionPixels=310000,renderMS=0;
  let eyeOffset=1.67,districtKey='',paintedDistrict=null,imageGate=0,firstViewFallback=false;
  let frame=0,lastFrame=0,w=0,h=0,scaledW=0,scaledH=0,sizing=true,drawn=0,projection='',held=new Set(),vector={forward:0,right:0},drag,hover=null;
  const images=createTextureCache(()=>{if(active&&!disposed){wake();announce();}},readTextureData);
  function chooseTextures(model,key=''){
    images.select(model,key.replace(/^landmark-/,''));
  }
  function syncTextureActivity(){images.setActive(active&&rendering&&!document.hidden);}
  const emit=(name,detail)=>canvas.dispatchEvent(new CustomEvent(name,{detail}));
  const subject=(key,type)=>emit('studysubject',{key,type});
  function state(){
    return {webgl:false,renderer:'software',textureReady:images.ready,renderedDistrict:paintedDistrict,texturedFaces:renderer.texturedFaces,seated:posture==='seated',standing:posture==='walking',posture,mode:outdoor?'outside':'inside',
      district:outdoor?district:'書斎',travel:false,focus:focusId,catReady:false,miniaturesReady:true,landmarksReady:!!garden,outdoorsReady:!!garden,
      outdoorsLoading:!!gardenTask,outdoorsError:loadError,paused,lightingMode,renderingActive:active&&rendering,
      deskProps:{...props},deskAction:action,deskStatus:status,deskActionSequence:sequence,
      position:{x:camera.x,y:camera.y,z:camera.z},look:{yaw:camera.yaw,pitch:camera.pitch}};
  }
  const announce=()=>emit('worldstate',state());
  function wake(){
    if(!disposed&&active&&rendering&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);
  }
  function stopFrames(){if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;}
  function stopMovement(){held.clear();vector={forward:0,right:0};drag=undefined;}
  function movingFrame(){
    clearTimeout(settleTimer);settleTimer=0;
    if(!fast){fast=true;sizing=true;}
  }
  function settle(){
    if(!fast||settleTimer||drag)return;
    settleTimer=setTimeout(()=>{settleTimer=0;fast=false;sizing=true;wake();},135);
  }
  function resize(){
    sizing=true;wake();
  }
  function fit(){
    const rect=canvas.getBoundingClientRect();
    w=Math.max(1,Math.round(rect.width||canvas.clientWidth||640));h=Math.max(1,Math.round(rect.height||canvas.clientHeight||440));
    const ratio=Math.min(window.devicePixelRatio||1,1.25,Math.sqrt((fast?motionPixels:1100000)/(w*h)));
    scaledW=Math.max(1,Math.round(w*ratio));scaledH=Math.max(1,Math.round(h*ratio));
    if(surface.width!==scaledW||surface.height!==scaledH){surface.width=scaledW;surface.height=scaledH;}
    ctx.setTransform(scaledW/w,0,0,scaledH/h,0,0);sizing=false;
  }
  function draw(){
    if(firstDraw&&!images.ready&&!firstViewFallback)return;
    if(sizing)fit();
    const hour=(new Date().getUTCHours()+9)%24;
    const night=lightingMode==='night'||(lightingMode==='auto'&&(hour<6||hour>=19));
    // Widen the vertical lens on a portrait device so all five objects still fit.
    const cam={...camera};
    if(!outdoor){
      cam.fov=2*Math.atan(Math.tan(cam.fov*Math.PI/360)*Math.max(1,1.5*h/w))*180/Math.PI;
      const turn=cam.yaw-SOFTWARE_SEAT.yaw;
      cam.x-=Math.sin(turn)*.38;cam.z+=(1-Math.cos(turn))*.38;
      cam.y-=Math.sin(cam.pitch-SOFTWARE_SEAT.pitch)*.16;
    }else if(w/h<1.08){
      // A portrait crop at the desktop lens would cut off the clock tower at
      // the left of the Waseda entrance. Preserve the principal architecture
      // while keeping a natural eye position and the full-height walking view.
      cam.fov=2*Math.atan(Math.tan(cam.fov*Math.PI/360)*Math.min(2.35,1.08*h/w))*180/Math.PI;
    }
    renderer.draw(outdoor&&garden?garden:desk,cam,w,h,{outdoor,night,progress,district:districtKey.replace(/^landmark-/,''),textures:images.images,fast});
    const complete=images.ready?(outdoor?districtKey:'room'):null;
    if(complete!==paintedDistrict){paintedDistrict=complete;if(!firstDraw)announce();}
    const points={};
    if(posture==='seated')for(const [key,p] of Object.entries(SOFTWARE_DESK_ANCHORS)){
      const xy=renderer.screen(p);if(xy)points[key]=xy.map(v=>Math.round(v*10000)/10000);
    }
    const record=JSON.stringify(points);
    if(record!==projection){projection=record;emit('studyprojection',{points});}
    drawn++;
    if(firstDraw&&(images.ready||firstViewFallback)){
      clearTimeout(imageGate);firstDraw=false;ready=true;onReady?.();announce();
    }
  }
  function nearestDistrict(){
    let nearest='',best=Infinity;
    for(const [key,p] of Object.entries(places||{})){
      const distance=Math.hypot(camera.x-p.x,camera.z-p.z);
      if(distance<best){best=distance;nearest=key;}
    }
    const next=gardenModule?.softwareDistrictAt?.(camera.x,camera.z)||(best<12?districts[nearest]:'屋外');
    const previous=places[districtKey];
    if(nearest&&nearest!==districtKey&&(!previous||best+4<Math.hypot(camera.x-previous.x,camera.z-previous.z))){
      districtKey=nearest;chooseTextures(garden,districtKey);
    }
    if(next!==district){district=next;announce();}
  }
  function move(dt){
    if(!outdoor)return false;
    const f=vector.forward+Number(held.has('w')||held.has('arrowup'))-Number(held.has('s')||held.has('arrowdown'));
    const r=vector.right+Number(held.has('d')||held.has('arrowright'))-Number(held.has('a')||held.has('arrowleft'));
    const turn=Number(held.has('e'))-Number(held.has('q'));
    if(turn)camera.yaw+=turn*dt*1.4;
    const tilt=Number(held.has('r'))-Number(held.has('f'));
    if(tilt)camera.pitch=clamp(camera.pitch+tilt*dt,-1.06,1.06);
    if(!f&&!r)return !!turn||!!tilt;
    const n=dt*4.4/Math.max(1,Math.hypot(f,r)),sin=Math.sin(camera.yaw),cos=Math.cos(camera.yaw);
    const bounds=gardenModule?.SOFTWARE_BOUNDS||{minX:-36,maxX:36,minZ:-10,maxZ:60};
    const nx=clamp(camera.x+(f*sin+r*cos)*n,bounds.minX+.3,bounds.maxX-.3);
    const nz=clamp(camera.z+(f*cos-r*sin)*n,bounds.minZ+.3,bounds.maxZ-.3);
    const walkable=gardenModule?.softwareWalkingAllowed;
    const blocked=(x,z)=>(walkable&&!walkable(x,z))||
      obstacles.some(b=>x>b.minX-.20&&x<b.maxX+.20&&z>b.minZ-.20&&z<b.maxZ+.20);
    if(!blocked(nx,camera.z))camera.x=nx;if(!blocked(camera.x,nz))camera.z=nz;
    if(gardenModule?.softwareGroundHeight)camera.y=eyeOffset+gardenModule.softwareGroundHeight(camera.x,camera.z);
    if(focusId!=='world'){focusId='world';announce();}nearestDistrict();return true;
  }
  function tick(now){
    frame=0;if(disposed||!active||!rendering||document.hidden)return;
    // Cap sustained animation at 30 fps. No callback is retained while idle.
    if(lastFrame&&now-lastFrame<29){wake();return;}
    const dt=Math.min(.08,lastFrame?(now-lastFrame)/1000:1/30);lastFrame=now;
    let changing=false;
    for(const id of Object.keys(props)){
      const target=Number(props[id]),distance=target-progress[id];
      if(!distance)continue;
      const step=paused?1:dt/(id==='notebook'?.72:.40);
      progress[id]+=Math.sign(distance)*Math.min(Math.abs(distance),step);
      changing=changing||progress[id]!==target;
    }
    const moving=move(dt);
    if(moving||changing)movingFrame();
    const start=performance.now();
    try{draw();}catch(error){stopFrames();onError?.(error);return;}
    renderMS=performance.now()-start;
    if(fast&&renderMS>38&&motionPixels>135000){
      motionPixels=Math.max(135000,Math.round(motionPixels*.84));sizing=true;
    }else if(fast&&renderMS<13&&motionPixels<360000){
      motionPixels=Math.min(360000,Math.round(motionPixels*1.05));sizing=true;
    }
    if(changing||moving)wake();else{lastFrame=0;settle();}
  }
  function setStudyActive(value){
    active=!!value;syncTextureActivity();if(surface!==canvas)surface.style.display=active?'':'none';
    if(active){resize();}else{
      // A cancelled stand should resume from a usable desk. A location chosen
      // from the gallery is retried by world-ui when the page becomes visible.
      if(gardenTask&&!outdoor){posture='seated';camera=spread(SOFTWARE_SEAT);}
      arrival++;stopMovement();stopFrames();clearTimeout(settleTimer);settleTimer=0;fast=false;sizing=true;
    }
  }
  function setRenderingActive(value){rendering=!!value;syncTextureActivity();if(rendering)resize();else{stopMovement();stopFrames();}}
  async function prewarmExterior(){
    if(garden)return true;
    if(!active||disposed)return false;
    if(!gardenTask){
      loadError=false;
      const url=new URL('./software-garden.js?v=photo3',import.meta.url);
      if(exteriorFailures)url.searchParams.set('retry',String(exteriorFailures));
      gardenTask=(gardenModule?Promise.resolve(gardenModule):import(url.href)).then(mod=>{
        if(disposed)return false;
        gardenModule=mod;
        if(!active||document.hidden)return false;
        const prepared=geometry();mod.buildSoftwareGarden(prepared);
        places=mod.SOFTWARE_PLACES;obstacles=mod.SOFTWARE_OBSTACLES;garden=prepared;return true;
      }).catch(()=>{loadError=true;exteriorFailures++;return false;}).finally(()=>{gardenTask=null;if(!disposed){announce();wake();}});
      announce();
    }
    return gardenTask;
  }
  async function enter(key){
    const request=++arrival;
    stopMovement();posture='walking';announce();
    if(!await prewarmExterior()||disposed||!active||request!==arrival)return false;
    const named=places[key],place=named||gardenModule.SOFTWARE_SPAWN;
    const earth=place&&gardenModule.softwareGroundHeight?gardenModule.softwareGroundHeight(place.x,place.z):0;
    const eyeY=place?.eyeY??1.67+earth;eyeOffset=eyeY-earth;
    camera=place?{x:place.x,y:eyeY,z:place.z,fov:place.fov??66,
      yaw:place.yaw??Math.atan2(place.targetX-place.x,place.targetZ-place.z),
      pitch:place.pitch??Math.atan2(place.targetY-eyeY,Math.hypot(place.targetX-place.x,place.targetZ-place.z))}:
      {x:0,y:eyeY,z:0,yaw:0,pitch:.07,fov:66};
    districtKey=named?key:(place?.key||'landmark-okuma-auditorium');
    if(!districtKey.startsWith('landmark-'))districtKey='landmark-'+districtKey;
    chooseTextures(garden,districtKey);
    outdoor=true;posture='walking';focusId=named?key:'world';district=districts[districtKey]||'屋外';
    resize();announce();onSelect?.(focusId);return true;
  }
  const explorePlace=key=>enter(key?.startsWith('landmark-')?key:'landmark-'+key);
  function sitDown(){
    arrival++;stopMovement();posture='seated';outdoor=false;districtKey='';chooseTextures(desk);camera=spread(SOFTWARE_SEAT);focusId='room';resize();announce();return true;
  }
  function returnHome(){
    arrival++;stopMovement();posture='walking';outdoor=false;districtKey='';chooseTextures(desk);camera=spread(SOFTWARE_SEAT);focusId='room';resize();announce();return true;
  }
  function interactDesk(id){
    if(!active||posture!=='seated'||!Object.hasOwn(props,id))return false;
    props[id]=!props[id];action=id;sequence++;status=propWords[id][Number(props[id])];wake();announce();return true;
  }
  function look(dx,dy){
    movingFrame();camera.yaw+=dx;camera.pitch=clamp(camera.pitch+dy,outdoor?-1.06:SOFTWARE_SEAT.pitch-.17,outdoor?1.06:SOFTWARE_SEAT.pitch+.19);
    if(!outdoor)camera.yaw=clamp(camera.yaw,SOFTWARE_SEAT.yaw-.29,SOFTWARE_SEAT.yaw+.29);
    wake();
  }
  function zoom(delta){movingFrame();camera.fov=clamp(camera.fov+delta,outdoor?43:30,outdoor?86:61);wake();}
  function setMovement(v){vector={forward:Number(v.forward)||0,right:Number(v.right)||0};wake();}
  function picked(e){
    const r=canvas.getBoundingClientRect();return renderer.pick((e.clientX-r.left)*w/r.width,(e.clientY-r.top)*h/r.height);
  }
  function inspect(id){
    if(!id)return;
    if(outdoor){if(districts[id]){focusId=id;announce();onSelect?.(id);}return;}
    if(posture!=='seated')return;
    if(Object.hasOwn(props,id))interactDesk(id);
    const key=id==='notebook'?'blog':id;if(SOFTWARE_DESK_ANCHORS[key])subject(key,'select');
  }
  listen(canvas,'pointerdown',e=>{
    if(!active||e.button>0||drag)return;
    canvas.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY,moved:false};
    canvas.setPointerCapture?.(e.pointerId);
  });
  listen(canvas,'pointermove',e=>{
    if(!active||!ready)return;
    if(drag&&e.pointerId===drag.id){
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)>4)drag.moved=true;
      if(drag.moved)look(-dx*.005,dy*.005);
      drag.x=e.clientX;drag.y=e.clientY;
    }else if(!drag&&e.pointerType!=='touch'){
      const id=picked(e),key=id==='notebook'?'blog':id;
      canvas.style.cursor=id?'pointer':'grab';
      if(key!==hover){hover=key;subject(key,'hover');}
    }
  });
  listen(canvas,'pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const tap=!drag.moved;drag=null;if(tap)inspect(picked(e));else settle();});
  listen(canvas,'pointercancel',()=>{drag=null;settle();});listen(canvas,'lostpointercapture',()=>{drag=null;settle();});
  listen(canvas,'pointerleave',()=>{hover=null;subject(null,'hover');});
  listen(canvas,'wheel',e=>{if(!active)return;e.preventDefault();zoom(Math.sign(e.deltaY)*2.5);},{passive:false});
  listen(canvas,'keydown',e=>{
    const k=e.key.toLowerCase();if(!active||e.ctrlKey||e.altKey||e.metaKey||!keys.has(k))return;e.preventDefault();
    if(k==='+'||k==='='||k==='-')zoom(k==='-'?2.5:-2.5);
    else if(k==='home'){if(posture==='seated'){camera=spread(SOFTWARE_SEAT);wake();}else returnHome();}
    else if(k==='escape')stopMovement();
    else if(outdoor){held.add(k);wake();}
    else if(k==='arrowup'||k==='arrowdown')look(0,k==='arrowup'?.043:-.043);
    else if(k==='arrowleft'||k==='arrowright')look(k==='arrowright'?.050:-.050,0);
  });
  listen(window,'keyup',e=>held.delete(e.key.toLowerCase()));
  listen(canvas,'blur',stopMovement);listen(window,'blur',stopMovement);listen(window,'resize',resize);
  listen(document,'visibilitychange',()=>{syncTextureActivity();stopMovement();if(document.hidden)stopFrames();else resize();});
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);observer?.observe(canvas);
  chooseTextures(desk);
  // The illustration remains visible while the first desk textures decode. A
  // stalled connection can still enter the modeled room and use every control.
  if(!images.ready)imageGate=setTimeout(()=>{firstViewFallback=true;wake();},2400);
  wake();
  function dispose(){
    disposed=true;arrival++;clearTimeout(settleTimer);clearTimeout(imageGate);images.dispose();controller.abort();observer?.disconnect();stopFrames();stopMovement();
    if(surface!==canvas){surface.remove();canvas.style.removeProperty('opacity');}else delete canvas.dataset.renderer;
    canvas.style.removeProperty('cursor');
  }
  return {getState:state,getPerformance:()=>({frames:drawn,renderer:'software',frameMS:renderMS,bufferWidth:scaledW,bufferHeight:scaledH,fast,texturesReady:images.ready,texturesLoaded:images.loaded,texturesPending:images.pending,texturedFaces:renderer.texturedFaces,faces:outdoor?garden?.faces.length:desk.faces.length}),
    interactDesk,setStudyActive,setRenderingActive,prewarmExterior,explorePlace,
    standUp(){if(posture!=='seated')return false;enter();return true;},leave:()=>enter(),focus:explorePlace,goToLandmark:explorePlace,returnHome,sitDown,
    setMovement,stopMovement,look,zoom,reset:returnHome,setPaused(v){paused=!!v;wake();announce();},
    setLightingMode(v){lightingMode=v;wake();announce();},dispose};
}
