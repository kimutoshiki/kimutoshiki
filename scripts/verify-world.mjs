import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import { createWorldLandscape } from '../scene/world-landscape.js';
import { createRegionalLandscape } from '../scene/place-settings.js';
import { HOME, WORLD_BOUNDS, WAYPOINTS, LANDMARK_SITES, LANDMARK_RESERVATIONS, OUTDOOR_VIEWS, REGION_BOUNDS, regionalHeight } from '../scene/world-layout.js';
import { mountWorld } from '../scene/world.js';
import { getWorldTime } from '../scene/world-time.js';
import { createWorldSky } from '../scene/world-sky.js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';

// This test retains the actual authored geometry, materials, bounds and rays.
// Canvas pixels are inert; it makes no claim about browser/GPU rendering.
const linearGradients = [], proceduralPixels=[];
const context = new Proxy({}, {
  get(object, key) {
    if (key === 'createImageData' || key === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => { const gradient = { stops: [], addColorStop(offset,color) { this.stops.push({offset,color}); } }; if (key === 'createLinearGradient') linearGradients.push(gradient); return gradient; };
    if (key === 'putImageData') return pixels=>proceduralPixels.push(pixels);
    if (key === 'measureText') return value => ({ width: value.length * 10 });
    return object[key] ?? (() => {});
  },
  set(object, key, value) { object[key] = value; return true; },
});
globalThis.document = Object.assign(new EventTarget(), {
  hidden: false,
  fonts: { ready: new Promise(() => {}) },
  createElement: () => ({ width: 512, height: 512, getContext: () => context }),
});
const requests = [];
T.TextureLoader.prototype.load = function (url) { requests.push(url); throw new Error('Unexpected asset request while building first world geometry: ' + url); };
const checks = [], report = {};
function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}
const skyFixture=createWorldSky(T),skyDay=getWorldTime(new Date('2026-11-06T03:00:00Z'));
const skyPair=skyFixture.update(skyDay),skyCounts=new Map([[skyPair.background,0],[skyPair.environment,0]]);
for(const texture of skyCounts.keys())texture.addEventListener('dispose',()=>skyCounts.set(texture,skyCounts.get(texture)+1));
assert.notEqual(skyPair.background,skyPair.environment,'Detailed sky and small indirect-light map are separate textures');
assert.deepEqual([skyPair.background.image.width,skyPair.background.image.height],[512,256]);
assert.deepEqual([skyPair.environment.image.width,skyPair.environment.image.height],[256,128]);
assert.equal(skyFixture.update(getWorldTime(new Date('2026-11-06T03:00:30Z'))),skyPair,'Clock-only seconds reuse both sky texture identities');
const cloudPixels=proceduralPixels.find(pixels=>pixels.width===512&&pixels.height===256);
assert.ok(cloudPixels,'Procedural sky computes actual bounded cloud pixels');
let cloudPixelsVisible=0,maxCloudAlpha=0;for(let i=3;i<cloudPixels.data.length;i+=4){if(cloudPixels.data[i])cloudPixelsVisible++;maxCloudAlpha=Math.max(maxCloudAlpha,cloudPixels.data[i]);}
assert.ok(cloudPixelsVisible>1000&&cloudPixelsVisible<512*128&&maxCloudAlpha>60&&maxCloudAlpha<220,'Cloud bands have soft varied transparency and an open horizon');
const nightPair=skyFixture.update(getWorldTime(new Date('2026-11-06T15:00:00Z')));
assert.notEqual(nightPair.background,skyPair.background);assert.notEqual(nightPair.environment,skyPair.environment);
for(const count of skyCounts.values())assert.equal(count,1,'Changing light releases both previous sky textures exactly once');
const finalSkyCounts=new Map([[nightPair.background,0],[nightPair.environment,0]]);for(const texture of finalSkyCounts.keys())texture.addEventListener('dispose',()=>finalSkyCounts.set(texture,finalSkyCounts.get(texture)+1));
skyFixture.dispose();skyFixture.dispose();for(const count of finalSkyCounts.values())assert.equal(count,1,'Sky owner releases both current textures once');
assert.deepEqual(requests,[],'Detailed procedural sky adds no network requests');
checks.push('Procedural cloud pixels remain bounded; separate 512×256 background and 256×128 environment textures cache by lighting key and release exactly once');

// The original standalone garden factory keeps its earlier ground and paving regressions.
// Tests for the current home and its two separate outdoor areas follow below.
const landscape = createWorldLandscape(T);
assert.equal(typeof landscape.then, 'undefined', 'Ground geometry is synchronous');
assert.deepEqual(requests, [], 'Ground construction never requests external assets');
assert.ok(landscape.stats.triangles <= 265000 && landscape.stats.drawCalls <= 32 && landscape.stats.geometryBytes <= 650000, 'Four connected outdoor settings fit their full, pre-culling polygon, draw and buffer budgets');
assert.ok(!landscape.group.children.some(object => object.isLight), 'Garden geometry adds no lighting passes');
const hillMeshes=[];landscape.group.traverse(object=>{if(object.userData.terrainLayer)hillMeshes.push(object);});
assert.equal(hillMeshes.length,3,'Three actual grounded terrain layers provide distant atmospheric depth');
assert.equal(new Set(hillMeshes.map(hill=>hill.material.map)).size,1,'Mountain layers share one small procedural forest texture');
assert.deepEqual([hillMeshes[0].material.map?.image.width,hillMeshes[0].material.map?.image.height],[128,128],'Wooded mountain detail never requires a large downloaded texture');
assert.ok(landscape.stats.mountainTriangles>12000&&landscape.stats.mountainTriangles<13000,'Detailed hills stay within a small bounded geometry budget');
for(const hill of hillMeshes){
  const positions=hill.geometry.getAttribute('position'),colors=hill.geometry.getAttribute('color'),bounds=new T.Box3().setFromObject(hill);
  assert.ok(colors&&hill.material.isMeshBasicMaterial&&hill.material.fog,'Remote terrain uses baked vertex shading and atmospheric fog without per-lamp lighting');
  close(bounds.min.y,-.008,1e-5,'Every hill meets the same actual ground');assert.ok(bounds.max.y>10);
  for(let i=0;i<positions.count;i++)assert.ok([positions.getX(i),positions.getY(i),positions.getZ(i)].every(Number.isFinite),'Every hill vertex stays finite');
}
const leafBatches=landscape.group.children.filter(object=>object.isInstancedMesh&&object.geometry.getAttribute('position').count===9);
assert.equal(leafBatches.length,8,'The original leaves are partitioned into eight spatial culling batches');
assert.equal(leafBatches.reduce((sum,mesh)=>sum+mesh.count,0),21420,'All 21,420 original leaf instances remain');
assert.equal(new Set(leafBatches.map(mesh=>mesh.geometry)).size,1,'Foliage batches share the original small leaf geometry');
for(const mesh of leafBatches)assert.ok(mesh.castShadow&&mesh.receiveShadow&&mesh.frustumCulled,'Spatial leaf batches retain actual shading and frustum culling');
const hillDayColors=hillMeshes.map(hill=>hill.material.color.getHex());landscape.setTime(getWorldTime(new Date('2026-11-06T15:00:00Z')));
assert.ok(hillMeshes.every((hill,i)=>hill.material.color.getHex()!==hillDayColors[i]),'All hill layers respond to actual night lighting');landscape.setTime(skyDay);
assert.equal(landscape.setInteriorView(true),true);assert.ok(leafBatches.every(mesh=>!mesh.visible));assert.equal(landscape.setInteriorView(true),false);
assert.equal(landscape.setInteriorView(false),true);assert.ok(leafBatches.every(mesh=>mesh.visible),'Looking outside restores all original leaves');
const harbour = landscape.group.getObjectByName('Sheltered water');
const skiff = landscape.group.getObjectByName('Moored wooden sailing skiff');
assert.ok(harbour && skiff, 'The waterfront contains actual water and a moored boat');
assert.ok(landscape.group.getObjectByName('Ginkgo trees on the campus walk')?.isInstancedMesh);
assert.ok(landscape.group.getObjectByName('Windswept coastal pines')?.isInstancedMesh);
const atHarbour = skiff.position.clone();
assert.equal(landscape.update(.14, false, atHarbour), false, 'Reduced motion leaves the waterfront still');
assert.equal(landscape.update(.14, true, HOME.spawn), false, 'The distant harbour has no animation cost at the desk');
const initialBoatAngle = skiff.rotation.x, initialWaterOffset = harbour.material.map.offset.clone();
assert.equal(landscape.update(.14, true, atHarbour), true);
assert.notEqual(skiff.rotation.x, initialBoatAngle);
assert.ok(harbour.material.map.offset.distanceTo(initialWaterOffset) > 0);
report.gardenBudget=landscape.stats;
checks.push('Three grounded shaded hills and all 21,420 original leaves remain within the garden budget; eight spatial batches hide behind the room and restore for exterior views');

// Chromium visual QA caught the horizon-sized two-triangle grass plane
// covering the raised home floor in downward views. Guard the actual world
// triangle size used by the confirmed fix; ray support alone misses that bug.
const horizonGround=landscape.group.getObjectByName('Unbroken ground to the horizon');
assert.ok(horizonGround?.isMesh,'The continuous horizon ground remains actual geometry');
horizonGround.updateWorldMatrix(true,false);
const groundPositions=horizonGround.geometry.getAttribute('position'),groundIndices=horizonGround.geometry.index;
const groundVertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let maximumGroundEdge=0;
const groundIndexCount=groundIndices?.count??groundPositions.count;
for(let i=0;i<groundIndexCount;i+=3) {
  for(let vertex=0;vertex<3;vertex++)groundVertices[vertex].fromBufferAttribute(groundPositions,groundIndices?groundIndices.getX(i+vertex):i+vertex).applyMatrix4(horizonGround.matrixWorld);
  for(let vertex=0;vertex<3;vertex++)maximumGroundEdge=Math.max(maximumGroundEdge,groundVertices[vertex].distanceTo(groundVertices[(vertex+1)%3]));
}
assert.ok(maximumGroundEdge<=80,'Horizon ground uses short triangles to preserve floor/rug depth in downward views: '+maximumGroundEdge+'m');
const horizonBounds=new T.Box3().setFromObject(horizonGround),horizonSize=horizonBounds.getSize(new T.Vector3());
assert.ok([...horizonBounds.min.toArray(),...horizonBounds.max.toArray()].every(Number.isFinite),'Horizon ground bounds remain finite');
close(horizonSize.x,1800,1e-6,'Ground subdivision retains the full horizon width');close(horizonSize.z,1800,1e-6,'Ground subdivision retains the full horizon depth');
close(horizonBounds.min.y,-.008,1e-7,'Subdivided ground stays below the house floor');close(horizonBounds.max.y,-.008,1e-7,'Subdivided ground remains flat');
report.horizonGround={triangles:groundIndexCount/3,maximumEdgeMetres:maximumGroundEdge};
checks.push('Actual horizon ground triangles stay below 80 m edges, guarding the browser-confirmed floor/rug depth fix');
const raycaster = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
function groundAt(root, x, z, height = 1) {
  root.updateWorldMatrix(true, true);
  raycaster.set(new T.Vector3(x, height, z), down);
  return raycaster.intersectObject(root, true).find(hit => hit.object.isMesh && hit.object.visible && !hit.object.material?.transparent);
}
function assertGround(root, x, z, label, height = 1) {
  const hit = groundAt(root, x, z, height);
  assert.ok(hit, 'Continuous physical ground under ' + label);
  close(hit.point.y, HOME.floorY, .015, 'Ground stays level under ' + label);
  assert.ok(hit.object.receiveShadow, 'Walking support receives WebGL shadows: ' + label);
}
// Sample the entire navigable garden, not a small presentation slab. A floating
// island, stair down to water or unsupported outskirts cannot pass this check.
for (let x = WORLD_BOUNDS.minX + .5; x < WORLD_BOUNDS.maxX; x += 7) {
  for (let z = WORLD_BOUNDS.minZ + .5; z < WORLD_BOUNDS.maxZ; z += 7) assertGround(landscape.group, x, z, 'garden ' + [x, z], .03);
}
for (let i = 1; i < WAYPOINTS.length; i++) {
  const a = WAYPOINTS[i - 1], b = WAYPOINTS[i];
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    assertGround(landscape.group, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 'route ' + i, .03);
  }
}
// Intersect the rendered Float32 triangles, not only the polygon-union metadata.
// Previously these exact junctions had two coplanar stone rectangles. A nearest
// support ray alone cannot detect that visible z-fighting regression.
const paving = landscape.group.getObjectByName('Continuous limestone paving union');
assert.ok(paving?.isMesh && paving.userData.pavingUnion, 'Stone paths and rotated aprons form one explicit paving union');
const pavingPlan = paving.userData.pavingUnion, stoneMeshes = [];
landscape.group.traverse(object => {
  if (object.isMesh && (Array.isArray(object.material) ? object.material.includes(landscape.materials.stone) : object.material === landscape.materials.stone)) stoneMeshes.push(object);
});
assert.equal(pavingPlan.footprints.length, 6, 'The home gardens retain six joined paths; landmark forecourts live in their own cities');
const triangle = new T.Triangle(), barycentric = new T.Vector3(), localHit = new T.Vector3();
function stoneCoverage(x, z) {
  raycaster.set(new T.Vector3(x, .05, z), down);
  const hits = raycaster.intersectObjects(stoneMeshes, false).filter(hit => Math.abs(hit.point.y + .001) < 1e-6);
  let interiors = 0;
  for (const hit of hits) {
    const positions = hit.object.geometry.getAttribute('position');
    triangle.a.fromBufferAttribute(positions, hit.face.a);
    triangle.b.fromBufferAttribute(positions, hit.face.b);
    triangle.c.fromBufferAttribute(positions, hit.face.c);
    hit.object.worldToLocal(localHit.copy(hit.point)); triangle.getBarycoord(localHit, barycentric);
    // Shared edges legitimately return both adjacent triangles. Ignore their
    // edge hits, while retaining every triangle covering an actual open area.
    if (Math.min(barycentric.x, barycentric.y, barycentric.z) > 1e-7) interiors++;
  }
  assert.ok(interiors <= 1, 'No double coplanar stone coverage at ' + [x,z] + ': ' + interiors);
  return { interiors, edgesOnly: hits.length > 0 && interiors === 0 };
}
for (const [x,z] of [[-1.371,7.123],[-1.113,14.731],[1.137,21.813],[-1.357,38.217],[1.413,55.271]]) {
  const coverage = stoneCoverage(x,z);
  assert.equal(coverage.interiors, 1, 'Former overlapping path junction has exactly one real supporting triangle: ' + [x,z]);
}
// Independent odd/even containment compares the original footprints with real
// rendered triangles throughout the garden, including rotated apron crossings.
function insidePolygon(x,z,polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if ((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
let pavingSamples = 0, stoneSamples = 0;
for (let x=-49.813;x<46;x+=1.37) for(let z=3.429;z<86;z+=1.19) {
  const expected=pavingPlan.footprints.some(({polygon})=>insidePolygon(x,z,polygon)), coverage=stoneCoverage(x,z);
  if(coverage.edgesOnly)continue;
  assert.equal(coverage.interiors, Number(expected), 'Rendered union preserves original stone footprint without holes/overlap at ' + [x,z]);
  pavingSamples++; if(expected)stoneSamples++;
}
assert.ok(stoneSamples>480, 'Dense coverage check exercises the paths and all rotated aprons');
for(const mesh of stoneMeshes) {
  const positions=mesh.geometry.getAttribute('position'), uvs=mesh.geometry.getAttribute('uv'), point=new T.Vector3();
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    close(uvs.getX(i),point.x/3.2,2e-5,'Stone joint UVs share one continuous world X coordinate');
    close(uvs.getY(i),point.z/3.2,2e-5,'Stone joint UVs share one continuous world Z coordinate');
    close(point.y,-.001,1e-6,'All stone union triangles share one flush elevation');
  }
}
report.paving = { checkedSamples: pavingSamples, stoneSamples, formerJunctions: 5 };
checks.push('Real stone triangles cover every original path/apron footprint once, including five formerly overlapping junctions; shared world UVs keep joints continuous');
checks.push('Synchronous continuous ground supports the entire metre-scale walkable garden and home-to-garden routes within 15 mm of floor level');
landscape.dispose();

// Exercise the same native scene and input scheduler the browser uses. Only the
// final GPU draw and Chromium's Draco worker are replaced for this Node test.
globalThis.self=globalThis;
globalThis.window=new EventTarget();globalThis.matchMedia=()=>({matches:false});
document.createElement=()=>createCanvas(1,1);
globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
const originalFetch=globalThis.fetch, assetReads=[], errors=[];
globalThis.fetch=async(url,options)=>{
  if(url instanceof URL && url.protocol==='file:'){
    assetReads.push(url.pathname.split('/').pop());
    return new Response(await readFile(url));
  }
  if(url==='blog.html')return new Response('',{status:503}); // Physics are independent of optional article delivery.
  return originalFetch(url,options);
};
const clockWakes=new Map(), frames=new Map();
let simTime=0, handle=0;
globalThis.requestAnimationFrame=cb=>{frames.set(++handle,cb);return handle;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
function step(count=1,dt=34){
  for(let i=0;i<count;i++){
    simTime+=dt;
    for(const [id,event] of clockWakes)if(event.at<=simTime){clockWakes.delete(id);event.cb();}
    const work=[...frames.values()];frames.clear();work.forEach(cb=>cb(simTime));
  }
}
async function until(predicate,message){
  const deadline=performance.now()+15000;
  while(!predicate()){
    assert.ok(performance.now()<deadline,message);
    step();await new Promise(r=>setTimeout(r,5));
  }
}
class Canvas extends EventTarget {
  clientWidth=900;clientHeight=600;style={};
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  setPointerCapture(){}
  focus(){}
}
const canvas=new Canvas(), subjects=[], states=[], projections=[], progress=[];
for(const [type,records] of [['worldstate',states],['studysubject',subjects],['studyprojection',projections]])
  canvas.addEventListener(type,event=>records.push(event.detail));
let scene,camera,paints=0,disposals=0;
const renderer={shadowMap:{},info:{render:{}},capabilities:{maxTextureSize:2048},
  getPixelRatio(){return this.ratio;},setPixelRatio(value){this.ratio=value;},setSize(){},
  render(world,view){scene=world;camera=view;scene.updateMatrixWorld(true);camera.updateMatrixWorld();paints++;},
  dispose(){disposals++;}};
const regionLoads=[], assetDir=new URL('../assets/models/blender/',import.meta.url);
let rejectRegion=false,releaseSlow,slowStarted=false,holdRegion=false;
async function regionalFactory(t,region,options){
  regionLoads.push(region);
  if(rejectRegion){rejectRegion=false;throw Error('Test terrain load failed');}
  if(holdRegion){holdRegion=false;slowStarted=true;await new Promise(resolve=>{releaseSlow=resolve;});}
  return createRegionalLandscape(t,region,{...options,loadAsset:async key=>{
    const asset=await loadTabbyFixture(new URL(key+'.glb',assetDir));
    return {scene:asset.scene,dispose(){asset.scene.traverse(node=>node.geometry?.dispose());}};
  }});
}
let currentDate=new Date('2026-11-06T03:15:30Z');
const engine=await mountWorld({canvas,rendererFactory:()=>renderer,loadRegion:regionalFactory,
  now:()=>currentDate,reducedMotion:false,onError:err=>errors.push(err),
  onProgress:e=>progress.push(e.phase),
  scheduleClockWake(cb,delay){clockWakes.set(++handle,{cb,at:simTime+delay});return handle;},
  cancelClockWake:id=>clockWakes.delete(id)});
const state=()=>engine.getState(), room=scene.getObjectByName('StudyRoom');
assert.equal(state().geometrySource,'blender');assert.equal(state().seated,true);
assert.deepEqual(assetReads,['study-room.glb'],'The first usable room defers architecture and the cat');
assert.equal(paints,1);assert.deepEqual(regionLoads,[]);
assert.ok(room&&room.getObjectByName('WritingDesk')&&room.getObjectByName('NameplateInscription'));
const eye=()=>new T.Vector3(state().position.x,state().position.y,state().position.z);
assert.deepEqual(eye().toArray(),HOME.seated.position);
engine.setStudyActive(false);step(3);
assert.deepEqual(assetReads,['study-room.glb']);engine.setStudyActive(true);
await until(()=>state().miniaturesReady&&state().catReady,'Decoded desktop and articulated cat');
step(2);
assert.equal(new Set(assetReads).size,6);assert.deepEqual(regionLoads,[]);
assert.ok(room.getObjectByName('Tabby|articulated')||room.getObjectByName('Tabby | articulated'));
const countHands=group=>{
  let count=0;
  group.traverse(node=>{
    const key=node.userData.worldClockHand;
    if(key){count++;assert.equal(node.rotation.z,state().time.clockAngles[key]);}
  });
  return count;
};
assert.equal(countHands(room.getObjectByName('desk-okuma-auditorium')),8);
assert.equal(state().time.label,'12:15');assert.deepEqual(Object.keys(projections.at(-1).points).sort(),['blog','contact','photos','profile','research']);
function pointer(type,x,y){
  const ev=new Event(type,{cancelable:true});
  Object.assign(ev,{button:0,pointerId:1,pointerType:'touch',clientX:x*900,clientY:y*600});canvas.dispatchEvent(ev);
}
function click(x,y){pointer('pointerdown',x,y);pointer('pointerup',x,y);}
function press(key){
  const ev=new Event('keydown',{cancelable:true});Object.assign(ev,{key});canvas.dispatchEvent(ev);return ev;
}
const closed=room.getObjectByName('NotebookCover').rotation.z;
click(.4699,.5054);assert.equal(state().deskProps.notebook,true);
assert.equal(subjects.filter(x=>x.type==='select').length,0,'The real binding first opens on the desk');
step(5);
const opening=room.getObjectByName('NotebookCover').rotation.z;
assert.ok(opening>closed&&opening<3);
step(36);assert.equal(subjects.at(-1).key,'blog');close(room.getObjectByName('NotebookCover').rotation.z,3.095,.001,'Real journal hinge');
engine.interactDesk('notebook',{reveal:false});step(35);
click(.6248,.5333);assert.equal(state().deskProps.letter,true);assert.notEqual(subjects.at(-1).key,'contact');
step(25);assert.equal(subjects.at(-1).key,'contact');close(room.getObjectByName('LetterFlap').rotation.x,-2.73,.001,'Envelope hinge');
click(.2881,.6251);step(25);assert.equal(state().deskProps.drawer,true);close(room.getObjectByName('Drawer').position.z,.834,.001,'Real tray moves 38 cm');
click(.83,.4875);step(15);assert.equal(state().deskProps.lamp,false);
engine.interactDesk('drawer');step(22);
engine.setPaused(true);click(.1973,.5093);assert.equal(subjects.at(-1).key,'profile');
click(.3046,.8205);assert.equal(state().deskAction,'cat');assert.ok(state().deskStatus);
assert.equal(engine.interactDesk('unknown'),false);
const before=projections.at(-1).points.blog;
pointer('pointerdown',.4699,.5054);pointer('pointermove',.56,.54);pointer('pointerup',.56,.54);step(3);
assert.equal(state().deskProps.notebook,false);assert.deepEqual(eye().toArray(),HOME.seated.position);
assert.ok(Math.hypot(before[0]-projections.at(-1).points.blog[0],before[1]-projections.at(-1).points.blog[1])>.05,'Dragging over the cover looks around without activating it');
assert.ok(camera.position.distanceTo(eye())>.01,'The seated camera also translates on its small physical orbit');
const fov=camera.fov;press('+');step(2);assert.ok(camera.fov<fov);press('Home');step(2);
assert.equal(camera.fov,fov);assert.equal(press('ArrowLeft').defaultPrevented,true);press('Home');step(2);
const stoppedAt=paints;engine.setRenderingActive(false);step(80);assert.equal(paints,stoppedAt);
engine.setRenderingActive(true);step(2);assert.ok(paints>stoppedAt);
currentDate=new Date('2026-11-06T15:05:00Z');step(40);assert.equal(state().time.label,'00:05');
assert.equal(countHands(room.getObjectByName('desk-okuma-auditorium')),8);
engine.setLightingMode('day');assert.equal(state().lightingMode,'day');
checks.push('Real first-paint GLB load order, suspension/resume, animated notebook/letter/drawer/lamp, cat picks and valid profile destination');
checks.push('Camera parallax, drag suppression, physical clock hands, proportional zoom, keyboard and clock updates');
assert.equal(engine.standUp(),true);assert.equal(state().posture,'standing-up');
await until(()=>state().geometryReady&&state().region==='waseda','Stand leads to the actual campus');
assert.equal(state().placeKey,'okuma-auditorium');assert.equal(state().mode,'outside');
assert.equal(state().seated,false);assert.equal(room.parent.visible,false);
assert.equal(countHands(scene.getObjectByName('Blender landmark architecture')),8);
assert.equal(engine.interactDesk('drawer'),false);
for(const key of ['okuma-statue','karatsu-castle','karatsu-bank']){
  const before=paints;assert.equal(await engine.explorePlace(key),true);
  assert.equal(state().geometryReady,false,'Choice alone is not an actual rendered frame');step(2);
  assert.equal(state().geometryReady,true);assert.ok(paints>before);assert.equal(state().placeKey,key);
  assert.equal(state().region,OUTDOOR_VIEWS[key].region);assert.equal(state().district,OUTDOOR_VIEWS[key].district);
  const [x,z]=OUTDOOR_VIEWS[key].eye;
  assert.ok(Math.hypot(eye().x-x,eye().z-z)<.01);
  close(eye().y,regionalHeight(state().region,x,z)+HOME.eyeHeight,.001,'Elevation uses the site terrain');
  engine.setMovement({right:1});const from=eye();step(12);engine.stopMovement();assert.ok(eye().distanceTo(from)>.35,'Free camera translation on arrival at '+key);
}
assert.deepEqual(regionLoads,['waseda','karatsu'],'Visits within a region reuse its decoded streets');
assert.ok(await engine.sitDown());step(125);assert.equal(state().seated,true);assert.equal(state().region,null);assert.equal(room.parent.visible,true);
assert.ok(paints>0 && progress.includes('garden')&&progress.includes('architecture'));
rejectRegion=true;assert.equal(await engine.explorePlace('karatsu-castle'),false);assert.match(state().outdoorsError,/failed/);assert.equal(state().seated,true);
assert.equal(await engine.prewarmExterior(),true);step(2);assert.equal(state().placeKey,'karatsu-castle');
holdRegion=true;const stale=engine.explorePlace('okuma-auditorium');await until(()=>slowStarted,'Pending regional request');
engine.setStudyActive(false);releaseSlow();assert.equal(await stale,false);assert.equal(state().region,'karatsu');
engine.setStudyActive(true);step(2);
assert.ok(await engine.explorePlace('okuma-auditorium'));step(2);
const lost=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(lost);
assert.equal(lost.defaultPrevented,true);assert.equal(disposals,1);assert.equal(errors.length,1);
const finalPaints=paints;step(80);engine.dispose();assert.equal(disposals,1);assert.equal(paints,finalPaints);assert.equal(frames.size,0);
const bad=await mountWorld({canvas:new Canvas(),rendererFactory(){throw Error('Unavailable WebGL');},onError:error=>errors.push(error)});
assert.equal(bad.getState().webgl,false);bad.dispose();
checks.push('All four actual site arrivals, walking and terrain datums, independent regions, return to seat, retry, stale load cancellation and context disposal');
console.log(JSON.stringify({result:'PASS',evidence:'Production GLB meshes, measured raycasts, emitted world states and true transforms; GPU draw is stubbed here and raster pixels are tested separately.',checks,geometryLoads:assetReads,...report},null,2));
