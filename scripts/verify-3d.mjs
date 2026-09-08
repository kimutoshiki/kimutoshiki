import assert from 'node:assert/strict';
// Run from any working directory with: node scripts/verify-3d.mjs
// Uses the real scene, geometry, raycasts, controls and CPU geometry cache.
// Only DOM/canvas painting and final pixel rasterization are replaced.
const repo = new URL('../', import.meta.url);
const fromRepo = path => import(new URL(path, repo));
const T = await fromRepo('js/vendor/three.module.min.js');
const { StudyCanvasRenderer } = await fromRepo('scene/study-software.js?v=20260909-orbit');
const ctx=new Proxy({}, {get(o,k){if(k==='createImageData'||k==='getImageData')return (w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});if(k==='measureText')return text=>({width:text.length*10});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
class Canvas extends EventTarget{clientWidth=1280;clientHeight=800;width=1280;height=800;style={};getContext(k){return k==='webgl2'?null:ctx;}getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}setPointerCapture(){}}
globalThis.document=Object.assign(new EventTarget(),{hidden:false,fonts:{ready:Promise.resolve()},createElement:()=>new Canvas(),createElementNS:()=>Object.assign(new EventTarget(),{style:{},width:1600,height:900})});
globalThis.innerWidth=1280;globalThis.innerHeight=800;globalThis.devicePixelRatio=1;globalThis.window=new EventTarget();globalThis.matchMedia=()=>({matches:false});
T.TextureLoader.prototype.load=function(){return new T.Texture();};
// Exercise the actual unpaused animation/lerp branch without providing a fake WebGL API.
Object.defineProperty(StudyCanvasRenderer.prototype,'software',{get(){return false;},set(){}});
let nextFrame,scene,camera,cachedDraws,invalidations=0,ms=0,selected=[],ready=0;const originalInvalidate=StudyCanvasRenderer.prototype.invalidate;StudyCanvasRenderer.prototype.invalidate=function(){invalidations++;return originalInvalidate.call(this);};
globalThis.requestAnimationFrame=fn=>(nextFrame=fn,1);globalThis.cancelAnimationFrame=()=>nextFrame=null;
StudyCanvasRenderer.prototype.render=function(s,c){scene=s;camera=c.clone();camera.updateMatrixWorld();scene.updateMatrixWorld(true);if(!this._draws||this._scene!==s)this.prepare(s);cachedDraws=this._draws;};
const {mountStudy}=await fromRepo('scene/study.js');
const pinIds=['profile','research','blog','gallery','contact'];const pinEls=pinIds.map(id=>({dataset:{pin:id},style:{},classList:{toggle(){}}}));
const canvas=new Canvas();let reported={};canvas.addEventListener('viewchange',e=>reported=e.detail);
const engine=await mountStudy({canvas,pins:{querySelectorAll:()=>pinEls},onSelect:id=>selected.push(id),onReady(){ready++;},onError(e){throw e;}});
function frame(n=1){for(let i=0;i<n;i++){ms+=33;assert.ok(nextFrame);nextFrame(ms);}}
function send(type,values={}){const e=new Event(type,{cancelable:true});Object.assign(e,{button:0,pointerId:1,clientX:640,clientY:400,deltaMode:0,deltaY:0,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...values});canvas.dispatchEvent(e);return e;}
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;
const finiteCamera=()=>{for(const n of [...camera.position.toArray(),...camera.quaternion.toArray(),camera.zoom])assert.ok(Number.isFinite(n),'Non-finite camera');};
function visible(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
function allVisibleMeshes(){const a=[];scene.traverse(o=>{if((o.isMesh||o.isPoints)&&visible(o))a.push(o);});return a;}
function isWithin(o,parent){for(let p=o;p;p=p.parent)if(p===parent)return true;return false;}
function geometryStats(root){let primitives=0,triangles=0;const geos=new Set(),mats=new Set();root.traverse(o=>{if(o.isMesh){const n=o.isInstancedMesh?o.count:1;primitives+=n;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*n;geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});return{primitives,triangles,geos,mats};}
const report={checks:[],bugs:[],subjectViews:[],roomPins:[],clicks:[],geometry:[],totalCheckedFrames:0};
const check=(condition,message,data)=>{if(!condition)report.bugs.push({message,...data});};
frame(2);assert.equal(ready,1);const room=scene.getObjectByName('A quiet room for learning');assert.ok(room,'Original room group not found');const bounds={min:new T.Vector3(-6.22,.22,-1.19),max:new T.Vector3(6.22,6.25,9.12)};
const ids=['landmark-okuma-auditorium','landmark-okuma-statue','landmark-karatsu-castle','landmark-karatsu-bank','cat'];const originals=new Map();
for(const id of ids){if(id==='cat'){let found;room.traverse(o=>{if(o.isGroup&&/cat/i.test(o.name)&&!found)found=o;});originals.set(id,found);}else{let found;room.traverse(o=>{if(o.isGroup&&o.userData.targetId===id&&!found)found=o;});originals.set(id,found?.children.find(child=>child.userData.inspectionSource)||found);}}
// These named complete architecture groups are the extraction contract: a
// change must not accidentally discard a tower by guessing from its bounds.
const architectures = new Map([
  ['landmark-okuma-auditorium', 'Okuma auditorium architecture'],
  ['landmark-okuma-statue', 'Okuma statue monument'],
  ['landmark-karatsu-castle', 'Five-tier keep'],
  ['landmark-karatsu-bank', 'Landmark architecture'],
]);
for (const [id, name] of architectures) {
  const architecture = originals.get(id)?.getObjectByName(name);
  assert.ok(architecture && geometryStats(architecture).triangles > 0, `Missing complete architecture: ${id}`);
}
assert.equal(room.getObjectByName('Original Waseda and Karatsu desk miniatures').children.length, 4);
for (const name of ['Right wall', 'Front wall', 'Ceiling']) assert.ok(room.getObjectByName(name), `Missing room surface: ${name}`);

// The actual desk copy must keep all four opaque clock faces and the clock
// chamber. Horizontal rays above the auditorium roof cannot be blocked by it.
const auditorium = originals.get('landmark-okuma-auditorium').getObjectByName('Okuma auditorium architecture');
for (let side = 1; side <= 4; side++) assert.ok(auditorium.getObjectByName(`Clock face ${side}`));
const towerMeshes = []; auditorium.traverse(o => { if (o.isMesh) towerMeshes.push(o); });
const nativeClockCenter = new T.Vector3(-9.25, 18.18, 2.5);
const clockCenter = auditorium.localToWorld(nativeClockCenter.clone());
for (const direction of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
  const origin = auditorium.localToWorld(nativeClockCenter.clone().addScaledVector(new T.Vector3(...direction), 6));
  const ray = new T.Raycaster(origin, clockCenter.clone().sub(origin).normalize(), 0, origin.distanceTo(clockCenter));
  const solidHit = ray.intersectObjects(towerMeshes, false).find(h => {
    const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
    return m && m.visible !== false && (!m.transparent || m.opacity >= .999);
  });
  assert.ok(solidHit, `Transparent/missing clock chamber in direction ${direction}`);
}

engine.setPaused(true);frame();
for(const id of ids){const source=originals.get(id);assert.ok(source,`Missing ${id}`);const stats=geometryStats(source);engine.inspect(id);frame();finiteCamera();assert.equal(reported.subject,id);check(!visible(room),'Room remains visible during standalone inspection',{id});check(pinEls.every(p=>p.style.visibility==='hidden'),'Pins remain visible during inspection',{id});const selectsBefore=selected.length;send('pointerdown');send('pointerup');check(selected.length===selectsBefore,'Inspection click activates a hidden room target',{id});
const visibleMeshes=allVisibleMeshes();let root=scene.children.find(o=>o.isGroup&&o!==room&&visible(o)&&visibleMeshes.some(m=>isWithin(m,o)));if(!root){report.bugs.push({message:'No standalone inspection group',id,visibleMeshes:visibleMeshes.length});continue;}
check(cachedDraws?.every(draw=>isWithin(draw.geo.object,root)),'Software geometry cache retains hidden room or previous clone',{id});const cloneStats=geometryStats(root);check(cloneStats.primitives===stats.primitives&&cloneStats.triangles===stats.triangles,'Clone changes source geometry counts',{id,source:[stats.primitives,stats.triangles],clone:[cloneStats.primitives,cloneStats.triangles]});report.geometry.push({id,primitives:cloneStats.primitives,triangles:cloneStats.triangles});
const strays=visibleMeshes.filter(o=>!isWithin(o,root));check(!strays.length,'Room effects survive in standalone scene',{id,strays:strays.map(o=>o.name||o.type)});
const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3());const targetMeshList=visibleMeshes.filter(o=>o.isMesh&&isWithin(o,root));const ray=new T.Raycaster();let frontDistance;
for(const preset of ['front','left','right','back','top','low']){engine.preset(preset);frame();finiteCamera();report.totalCheckedFrames++;check(!box.containsPoint(camera.position),'Preset places camera within subject AABB',{id,preset,position:camera.position.toArray()});
ray.set(camera.position,center.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(center);const hits=ray.intersectObjects(targetMeshList,false);const direction=camera.position.clone().sub(center);if(preset==='front'){frontDistance=direction.length();check(direction.z>0,'Front viewpoint on wrong side',{id});}if(preset==='back')check(direction.z<0,'Back viewpoint on wrong side',{id});if(preset==='left')check(direction.x<0,'Left viewpoint on wrong side',{id});if(preset==='right')check(direction.x>0,'Right viewpoint on wrong side',{id});if(preset==='top')check(direction.y>0,'Top viewpoint not above subject',{id});if(preset==='low')check(direction.y<0,'Low viewpoint not below subject',{id});check(near(direction.length(),frontDistance,1e-5),'Room bounds still clip standalone orbit distance',{id,preset,distance:direction.length(),frontDistance});report.subjectViews.push({id,preset,position:camera.position.toArray(),distance:direction.length(),centerRayHits:hits.length});}
// Presets cover every side; several real key events verify free rotation as well.
engine.preset('front');for(let i=0;i<8;i++){send('keydown',{key:'ArrowRight'});frame();finiteCamera();report.totalCheckedFrames++;check(!box.containsPoint(camera.position),'Orbit enters subject',{id,orbitStep:i});}
engine.zoom(-100);frame();check(near(reported.zoom,6),'Inspection loses 6× zoom',{id,reported});const lensPos=camera.position.clone();engine.zoom(100);frame();check(near(reported.zoom,.65),'Inspection minimum zoom wrong',{id,reported});check(lensPos.distanceTo(camera.position)<1e-5,'Lens zoom moves inspection camera',{id});
engine.preset('front');frame();engine.setPaused(false);engine.preset('back');for(let i=0;i<12;i++){frame();finiteCamera();report.totalCheckedFrames++;check(!box.containsPoint(camera.position),'Animated preset crosses subject',{id,frame:i,position:camera.position.toArray()});}engine.setPaused(true);frame();
// Parent room must return completely, and every clone must be cleared/replaced.
engine.inspect('room');frame();check(visible(room),'Room does not return after inspection',{id});check(cachedDraws?.every(draw=>visible(draw.geo.object)&&!isWithin(draw.geo.object,root)),'Software geometry cache retains inspection clone on return',{id});check(reported.subject==='room','Subject selection does not return to room',{id,reported});const duplicates=allVisibleMeshes().filter(o=>o.parent===scene&&/inspection/i.test(o.name));check(!duplicates.length,'Inspection objects retained on room return',{id});}
// Room presets remain bounded and on-screen pin occlusion uses actual styles and scene raycasts.
const knownAnchors={profile:new T.Vector3(-2.12,2.40,.54),research:new T.Vector3(3.19,3.83,-.57),blog:new T.Vector3(-.72,2.245,.60),gallery:new T.Vector3(-.72,4.0,-1.21),contact:new T.Vector3(.63,2.213,.59)};
for(const preset of ['front','left','right','back','top','low']){engine.preset(preset);frame();for(const a of ['x','y','z'])check(camera.position[a]>=bounds.min[a]-1e-8&&camera.position[a]<=bounds.max[a]+1e-8,'Room camera exits wall',{preset,axis:a,position:camera.position.toArray()});const meshes=allVisibleMeshes().filter(o=>o.isMesh);for(const pin of pinEls){if(pin.style.visibility!=='visible')continue;const target=knownAnchors[pin.dataset.pin],projected=target.clone().project(camera);check(projected.z>=-1&&projected.z<=1,'Pin appears behind camera/near plane',{preset,pin:pin.dataset.pin,z:projected.z});const ray=new T.Raycaster(camera.position,target.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(target)-.002);const blocker=ray.intersectObjects(meshes,false).find(h=>!(h.object.material?.transparent&&h.object.material.opacity<.2));if(blocker&&blocker.object.userData.targetId!==pin.dataset.pin)report.bugs.push({message:'Visible room pin through unrelated geometry',preset,pin:pin.dataset.pin,blocking:blocker.object.name||blocker.object.parent?.name});report.roomPins.push({preset,pin:pin.dataset.pin,visible:true});}}
engine.reset();frame();const baseline=camera.position.clone();engine.zoom(-100);frame();check(near(reported.zoom,6),'Room 6× zoom not retained',{});check(baseline.distanceTo(camera.position)<1e-5,'Room zoom changes camera position',{});engine.reset();frame();
// Actual normal click verifies no-selection tests below are meaningful.
const p=knownAnchors.profile.clone().project(camera),xy={clientX:(p.x+1)*640,clientY:(1-p.y)*400};send('pointerdown',xy);send('pointerup',xy);check(selected.at(-1)==='profile','Normal profile click fails',{});selected=[];
send('pointerdown');send('pointermove',{clientX:800});send('pointermove',{clientX:640});send('pointerup');send('pointerdown');send('pointercancel');send('pointerup');send('pointerdown');send('lostpointercapture');send('pointerup');check(selected.length===0,'Drag or cancellation falsely selects room object',{selected});
engine.reset();frame();send('pointerdown',{pointerId:1,clientX:550,clientY:400});send('pointerdown',{pointerId:2,clientX:750,clientY:400});send('pointermove',{pointerId:2,clientX:850,clientY:450});frame();send('pointerup',{pointerId:2,clientX:850,clientY:450});const afterPinch=camera.position.clone();send('pointermove',{pointerId:1,clientX:550,clientY:400});frame();check(afterPinch.distanceTo(camera.position)<1e-6,'Finger continuation jumps after pinch',{});send('pointerup',{pointerId:1,clientX:550,clientY:400});check(selected.length===0,'Pinch falsely selects object',{selected});
check(!send('wheel',{ctrlKey:true,deltaY:-100}).defaultPrevented,'Ctrl+wheel browser zoom blocked',{});
engine.inspect(ids[0]);frame();engine.zoom(-100);frame();canvas.clientWidth=390;canvas.clientHeight=844;window.dispatchEvent(new Event('resize'));frame();check(near(reported.zoom,6),'Resize loses inspection relative zoom',{});const portraitMaximum=camera.zoom;engine.inspect(ids[0]);frame();check(near(portraitMaximum/camera.zoom,6),'Portrait inspection does not preserve sixfold relative zoom',{maximum:portraitMaximum,base:camera.zoom});engine.reset();frame();check(reported.subject==='room','Reset fails to exit inspection',{});finiteCamera();
report.checks=['Complete named architecture, four opaque clock sides, room closure surfaces','Actual software prepare/cache invalidation verified across every inspection switch and room return','Five subjects × six directional presets with single visible clone, original geometry counts, hidden pins and complete room return','Normal animation branch confirms no preset camera enters subject, plus yaw sweeps and .65×–6× zoom','Actual room pin styles checked against real geometry rays and camera frustum','Real pointer normal-click, drag, cancellation, pinch continuation and browser zoom behavior','Portrait resize preserves inspection zoom and reset exits inspection'];
const {createOrbitNavigation}=await fromRepo('scene/orbit-navigation.js');const nav=createOrbitNavigation(T,bounds);
for (const corner of [[-100,-100,-100],[100,100,100],[-100,100,100],[100,-100,-100]]) {
  nav.reset();nav.pan(new T.Vector3(...corner));
  for (const [yaw,pitch] of [[0,100],[Math.PI,-100],[Math.PI/2,0],[-Math.PI/2,0]]) {
    nav.rotate(yaw,pitch);const view=nav.update();
    for (const axis of ['x','y','z']) check(view.position[axis]>=bounds.min[axis]-1e-8 && view.position[axis]<=bounds.max[axis]+1e-8,'Extreme room pan/orbit crosses a wall',{corner,axis});
  }
}
for(const id of ids){nav.inspect(id,originals.get(id));nav.pan(new T.Vector3(-100,0,-100));nav.rotate(-Math.PI/4,-.18);const view=nav.update(),box=new T.Box3().setFromObject(originals.get(id));check(!box.containsPoint(view.position),'Diagonal inspection pan drives camera into subject',{id,position:view.position.toArray(),target:view.target.toArray()});}engine.dispose();process.exitCode=report.bugs.length?1:0;console.log(JSON.stringify({result:report.bugs.length?'ISSUES':'PASS',checks:report.checks,totalCheckedFrames:report.totalCheckedFrames,invalidations,bugs:report.bugs,geometry:report.geometry},null,2));
