import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import { getRoomTime } from '../scene/room-time.js';
import { StudyCanvasRenderer } from '../scene/study-software.js?v=20260916-room';
import { mountStudy } from '../scene/study.js';

const at=(h,m=0)=>new Date(2026,8,9,h,m), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
near(getRoomTime(at(3)).hourAngle,-Math.PI/2);
near(getRoomTime(at(6,30)).hourAngle,-Math.PI*13/12);
near(getRoomTime(at(6,30)).minuteAngle,-Math.PI);
const fullDay=Array.from({length:1440},(_,m)=>getRoomTime(at(0,m)));
for(let m=0;m<1440;m++){
  const a=fullDay[m],b=fullDay[(m+1)%1440];
  for(const n of [a.daylight,a.sunIntensity,a.hemisphereIntensity,a.ambientIntensity,a.exposure,...a.sunPosition,...a.softwareTint])assert.ok(Number.isFinite(n));
  assert.ok(a.hemisphereIntensity>=.43&&a.ambientIntensity>=.23&&a.softwareGain>=.59,'Night retains a deliberate low-light floor');
  assert.ok(Math.abs(a.daylight-b.daylight)<.013,'No abrupt light changes at dawn or midnight');
  assert.ok(a.sunPosition.every((v,i)=>Math.abs(v-b.sunPosition[i])<.052),'No sun/ shadow position jump at midnight');
}
for(const mode of ['auto','day','night']){
  const time=getRoomTime(at(23,47),mode);assert.equal(time.label,'23:47');near(time.minuteAngle,-Math.PI*2*47/60);
}
assert.equal(getRoomTime(at(2),'day').phase,'day');assert.equal(getRoomTime(at(12),'night').phase,'night');
const previousTZ=process.env.TZ;
try{
  process.env.TZ='Asia/Tokyo';assert.equal(getRoomTime(new Date('2026-09-09T18:30:00Z')).label,'03:30');
  process.env.TZ='America/New_York';
  const first=getRoomTime(new Date('2026-11-01T05:30:00Z')),second=getRoomTime(new Date('2026-11-01T06:30:00Z'));
  assert.equal(first.label,second.label);assert.notEqual(first.minuteKey,second.minuteKey,'Repeated hour after DST must refresh');
}finally{if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ;}

// Keep the genuine software=true branch and real world-space geometry cache.
// Pixel painting is tested separately by verify-surfaces.mjs.
const ctx=new Proxy({}, {get(o,k){if(k==='createImageData'||k==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});if(k==='measureText')return text=>({width:text.length*10});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
class Canvas extends EventTarget{clientWidth=320;clientHeight=240;width=320;height=240;style={};getContext(k){return k==='webgl2'?null:ctx;}getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}}
globalThis.document=Object.assign(new EventTarget(),{hidden:false,fonts:{ready:Promise.resolve()},createElement:()=>new Canvas(),createElementNS:()=>Object.assign(new EventTarget(),{style:{},width:1600,height:900})});
globalThis.innerWidth=320;globalThis.innerHeight=240;globalThis.devicePixelRatio=1;globalThis.window=new EventTarget();globalThis.matchMedia=()=>({matches:true});
let nextFrame,ms=0,scene,renderer,draws=0,date=at(6,59),announced;
globalThis.requestAnimationFrame=fn=>(nextFrame=fn,1);globalThis.cancelAnimationFrame=()=>nextFrame=null;
const requests=[];
T.TextureLoader.prototype.load=function(url,onLoad){requests.push({url,onLoad});return new T.Texture();};
StudyCanvasRenderer.prototype.render=function(s){scene=s;renderer=this;draws++;if(!this._draws||this._scene!==s)this.prepare(s);};
const canvas=new Canvas();canvas.addEventListener('roomtimechange',event=>announced=event.detail);
const engine=await mountStudy({canvas,pins:{querySelectorAll:()=>[]},now:()=>date,onSelect(){},onReady(){},onError(e){throw e;}});
assert.equal(engine.software,true);engine.setPaused(true);
function frame(n=1){for(let i=0;i<n;i++){ms+=300;assert.ok(nextFrame);nextFrame(ms);}}
frame(4);
assert.equal(announced.label,'06:59');
const minute=scene.getObjectByName('Wall minute hand'),hour=scene.getObjectByName('Wall hour hand');
assert.ok(minute&&hour);near(minute.rotation.z,getRoomTime(date).minuteAngle);
const cachedHand=()=>renderer._draws.find(draw=>draw.geo.object===minute.children[0]).geo.p.slice();
const initialHand=cachedHand(),count=draws;
frame(2);assert.equal(draws,count,'No needless software rasterization during the same minute');
date=at(7);frame();assert.equal(announced.label,'07:00');assert.equal(draws,count+1);
assert.notDeepEqual(cachedHand(),initialHand,'Minute update must change baked hand positions with animation paused');
near(minute.rotation.z,0);near(hour.rotation.z,-Math.PI*7/6);
assert.equal(renderer.shadowMap.needsUpdate,true);
const autoGain=renderer.lightingGain;
engine.setLightingMode('night');frame();assert.equal(announced.mode,'night');assert.equal(announced.label,'07:00');assert.ok(renderer.lightingGain<autoGain);
engine.setLightingMode('day');frame();assert.equal(renderer.lightingGain,1.08);
engine.setLightingMode('auto');frame();assert.equal(renderer.lightingGain,autoGain);
// A suspended tab resumes directly at wall-clock time rather than animation time.
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(nextFrame,null);
date=at(23,59);document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));frame();assert.equal(announced.label,'23:59');
date=at(24);frame();assert.equal(announced.label,'00:00');near(hour.rotation.z,0);
// The face and torso share the actual material, even before/after image arrival.
const head=scene.getObjectByName('Sculpted ginger head'),torso=scene.getObjectByName('Sculpted tabby torso');
assert.equal(head.material,torso.material);assert.equal(head.material.userData.surface.key,'ginger');
const furRequest=requests.find(r=>r.url.endsWith('/ginger-fur.webp'));assert.ok(furRequest);
const loaded=new T.Texture();furRequest.onLoad(loaded);
assert.equal(head.material.map,loaded);assert.equal(torso.material.map,loaded);
assert.ok([...head.geometry.attributes.uv.array].every(Number.isFinite));
engine.dispose();assert.equal(nextFrame,null);
console.log(JSON.stringify({result:'PASS',checks:['1440 local minutes: continuous light and sun positions, including midnight','Analog angles, manual light modes, timezone and repeated DST hour','Actual paused software scene refreshes clocks, light and geometry only when needed','Suspended tab resumes at current local time','Head and torso share ginger material before and after generated image loading']},null,2));
