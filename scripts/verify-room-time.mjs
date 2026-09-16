import assert from 'node:assert/strict';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';
import * as T from '../js/vendor/three.module.min.js';
import { getRoomTime } from '../scene/room-time.js';
import { StudyCanvasRenderer } from '../scene/study-software.js?v=20260916-perf1';
import { mountStudy } from '../scene/study.js';

const at=(h,m=0)=>new Date(2026,8,9,h,m), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
near(getRoomTime(at(3)).hourAngle,-Math.PI/2);
near(getRoomTime(at(6,30)).hourAngle,-Math.PI*13/12);
near(getRoomTime(at(6,30)).minuteAngle,-Math.PI);
const fullDay=Array.from({length:1440},(_,m)=>getRoomTime(at(0,m)));
for(let m=0;m<1440;m++){
  const a=fullDay[m],b=fullDay[(m+1)%1440];
  for(const n of [a.daylight,a.sunIntensity,a.hemisphereIntensity,a.ambientIntensity,a.exposure,a.windowBrightness,a.windowGlow,...a.windowTint,...a.windowEmissionTint,...a.sunPosition,...a.softwareTint])assert.ok(Number.isFinite(n));
  assert.ok(a.hemisphereIntensity>=.43&&a.ambientIntensity>=.23&&a.softwareGain>=.59,'Night retains a deliberate low-light floor');
  assert.ok(Math.abs(a.daylight-b.daylight)<.013,'No abrupt light changes at dawn or midnight');
  assert.ok(a.sunPosition.every((v,i)=>Math.abs(v-b.sunPosition[i])<.052),'No sun/ shadow position jump at midnight');
  assert(a.windowBrightness>=.2&&a.windowBrightness<=1&&a.windowGlow>=.025&&a.windowGlow<=.38,'The garden has a bounded, readable night-to-day brightness');
  for(const channels of [a.windowTint,a.windowEmissionTint])assert(channels.every(value=>value>=0&&value<=1),'Window RGB multipliers stay in gamut');
  assert(Math.abs(a.windowBrightness-b.windowBrightness)<.013&&Math.abs(a.windowGlow-b.windowGlow)<.006,'Window light never jumps at dawn, sunset or midnight');
  for(let channel=0;channel<3;channel++){
    assert(Math.abs(a.windowTint[channel]*a.windowBrightness-b.windowTint[channel]*b.windowBrightness)<.013,'Garden illumination changes continuously across all 1440 minutes');
    assert(Math.abs(a.windowEmissionTint[channel]-b.windowEmissionTint[channel])<.018,'Sky emission color changes continuously');
  }
}
const dawn=getRoomTime(at(6,45)),noon=getRoomTime(at(12)),sunset=getRoomTime(at(18,15)),midnight=getRoomTime(at(0));
assert(dawn.windowTint[0]>dawn.windowTint[2]*1.3,'Dawn has a warm, gently amber garden');
assert(sunset.windowTint[0]>sunset.windowTint[2]*1.5,'Sunset has a distinct amber tint');
assert(sunset.windowEmissionTint[0]>sunset.windowEmissionTint[2]*2,'Evening sky emission remains warm as daylight falls');
assert.deepEqual(noon.windowTint,[1,1,1]);assert.deepEqual(noon.windowEmissionTint,[1,1,1]);near(noon.windowBrightness,1);
assert(midnight.windowTint[2]>midnight.windowTint[0]*1.5&&midnight.windowBrightness<.25,'Deep night is blue and dim, not a daylight garden');
assert(noon.windowBrightness>dawn.windowBrightness&&dawn.windowBrightness>midnight.windowBrightness&&sunset.windowBrightness>midnight.windowBrightness);
for(const hour of [0,6,12,18,23])for(const [mode,reference] of [['day',noon],['night',getRoomTime(at(23))]]){
  const manual=getRoomTime(at(hour,37),mode);
  for(const property of ['windowTint','windowEmissionTint','windowBrightness','windowGlow'])assert.deepEqual(manual[property],reference[property],'Manual '+mode+' keeps a consistent outdoor appearance');
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
const catAsset=await loadTabbyFixture(new URL('../models/tabby-cat-room.glb',import.meta.url));
const originalCatMaterials=new Map();catAsset.scene.traverse(object=>{if(object.isMesh)originalCatMaterials.set(object,object.material);});
const engine=await mountStudy({canvas,catAsset,pins:{querySelectorAll:()=>[]},now:()=>date,onSelect(){},onReady(){},onError(e){throw e;}});
assert.equal(engine.software,true);engine.setPaused(true);
function frame(n=1){for(let i=0;i<n;i++){ms+=300;assert.ok(nextFrame);nextFrame(ms);}}
frame(4);
assert.equal(announced.label,'06:59');
const windowMaterial=scene.getObjectByName('Afternoon window').children.find(object=>object.isMesh&&object.material.emissive?.getHex()!==0)?.material;
assert(windowMaterial,'The real window material remains available');
function checkWindowAppearance(){
  const expected=getRoomTime(date,announced.mode);
  windowMaterial.color.toArray().forEach((channel,i)=>near(channel,expected.windowTint[i]*expected.windowBrightness));
  windowMaterial.emissive.toArray().forEach((channel,i)=>near(channel,expected.windowEmissionTint[i]));
  near(windowMaterial.emissiveIntensity,expected.windowGlow);
}
checkWindowAppearance();
const minute=scene.getObjectByName('Wall minute hand'),hour=scene.getObjectByName('Wall hour hand');
assert.ok(minute&&hour);near(minute.rotation.z,getRoomTime(date).minuteAngle);
const cachedHand=()=>renderer._draws.find(draw=>draw.geo.object===minute.children[0]).geo.p.slice();
const initialHand=cachedHand(),count=draws;
frame(2);assert.equal(draws,count,'No needless software rasterization during the same minute');
date=at(7);frame();assert.equal(announced.label,'07:00');assert.equal(draws,count+1);
checkWindowAppearance();
assert.notDeepEqual(cachedHand(),initialHand,'Minute update must change baked hand positions with animation paused');
near(minute.rotation.z,0);near(hour.rotation.z,-Math.PI*7/6);
assert.equal(renderer.shadowMap.needsUpdate,true);
const autoGain=renderer.lightingGain;
engine.setLightingMode('night');frame();assert.equal(announced.mode,'night');assert.equal(announced.label,'07:00');assert.ok(renderer.lightingGain<autoGain);
checkWindowAppearance();
engine.setLightingMode('day');frame();assert.equal(renderer.lightingGain,1.08);
checkWindowAppearance();
engine.setLightingMode('auto');frame();assert.equal(renderer.lightingGain,autoGain);
checkWindowAppearance();
// A suspended tab resumes directly at wall-clock time rather than animation time.
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(nextFrame,null);
date=at(23,59);document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));frame();assert.equal(announced.label,'23:59');
date=at(24);frame();assert.equal(announced.label,'00:00');near(hour.rotation.z,0);
checkWindowAppearance();
// Room texture uploads and time changes must preserve the supplied cat's coat.
for(const [object,material] of originalCatMaterials){assert.equal(object.material,material);assert.equal(material.userData.surface,undefined);}
assert.equal(scene.getObjectByName('Sculpted ginger head'),undefined,'The old procedural cat is fully removed');
engine.dispose();assert.equal(nextFrame,null);
console.log(JSON.stringify({result:'PASS',checks:['1440 local minutes: continuous light, sun positions, window brightness and sky color, including midnight','Warm dawn, neutral noon, amber sunset and blue deep night with consistent manual overrides','Analog angles, manual light modes, timezone and repeated DST hour','Actual paused software scene applies window tint/emission and refreshes clocks, light and geometry only when needed','Suspended tab resumes at current local time','The supplied cat retains its original coat materials across room texture and lighting updates']},null,2));
