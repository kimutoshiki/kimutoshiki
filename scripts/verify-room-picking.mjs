import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as T from '../js/vendor/three.module.min.js';
import { createRoomPicking } from '../scene/room-picking.js';
import { createRoom } from '../scene/room-model.js';
import { createDeskLandmarks } from '../scene/desk-landmarks.js';
import { createWallNavigation } from '../scene/wall-navigation.js';
import { createObjectActions } from '../scene/object-actions.js';
import { loadSurfaceMaterials } from '../scene/surface-materials.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';

const context=new Proxy({}, {get(o,key){if(key==='createImageData'||key==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});if(key==='measureText')return text=>({width:text.length*10});return o[key]??(()=>{});},set(o,key,value){o[key]=value;return true;}});
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({width:1280,height:800,getContext:()=>context})};
T.TextureLoader.prototype.load=function(){return new T.Texture();};
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
const solid=hit=>!(hit.object.material?.transparent&&hit.object.material.opacity<.2);
const meshes=root=>{const result=[];root.traverse(o=>{if(o.isMesh)result.push(o);});return result;};
const native=(ray,objects)=>ray.intersectObjects(objects.filter(visible),false).find(solid)||null;
function same(actual,expected,label){
  assert.equal(actual?.object,expected?.object,label+' object');
  if(!actual)return;
  assert.ok(Math.abs(actual.distance-expected.distance)<1e-7,label+' distance');
  assert.equal(actual.instanceId,expected.instanceId,label+' instance');
  assert.equal(actual.faceIndex,expected.faceIndex,label+' triangle');
  assert.ok(actual.point.distanceTo(expected.point)<1e-7,label+' surface point');
}

// Deterministic edge cases for ordering, transparent occluders, dynamic
// instances, hidden ancestors, layers, and explicitly disabled/custom raycasts.
const fixture=new T.Group(), material=new T.MeshBasicMaterial(), geometry=new T.BoxGeometry(1,1,1);
const back=new T.Mesh(geometry,material),front=new T.Mesh(geometry,material);back.position.z=-4;front.position.z=-2;fixture.add(back,front);
const glass=new T.Mesh(geometry,new T.MeshBasicMaterial({transparent:true,opacity:.1}));glass.position.z=-1;fixture.add(glass);
const noop=new T.Mesh(new T.BoxGeometry(8,8,8),material);noop.raycast=()=>{};fixture.add(noop);
const hidden=new T.Group(),hiddenMesh=new T.Mesh(geometry,material);hiddenMesh.position.z=-.7;hidden.add(hiddenMesh);hidden.visible=false;fixture.add(hidden);
const instances=new T.InstancedMesh(geometry,material,2),matrix=new T.Matrix4();
instances.setMatrixAt(0,matrix.makeTranslation(3,0,-2));instances.setMatrixAt(1,matrix.makeTranslation(-3,0,-2));instances.instanceMatrix.needsUpdate=true;fixture.add(instances);
const picker=createRoomPicking(T,{root:fixture});picker.refresh();
const ray=new T.Raycaster(new T.Vector3(0,0,3),new T.Vector3(0,0,-1));
same(picker.firstHit(ray),native(ray,meshes(fixture)),'Transparent and no-op objects');assert.equal(picker.firstHit(ray).object,front);
const firstSyncs=picker.stats.syncs;for(let i=0;i<25;i++)picker.firstHit(ray);assert.equal(picker.stats.syncs,firstSyncs,'Pointer bursts reuse prepared bounds');
front.position.z=-6;picker.invalidate();same(picker.firstHit(ray),native(ray,meshes(fixture)),'Moving a rigid mesh');
instances.setMatrixAt(1,matrix.makeTranslation(0,0,1));instances.instanceMatrix.needsUpdate=true;instances.computeBoundingSphere();picker.invalidate();
same(picker.firstHit(ray),native(ray,meshes(fixture)),'Moving an instance');assert.equal(picker.firstHit(ray).instanceId,1);
instances.layers.set(2);same(picker.firstHit(ray),native(ray,meshes(fixture)),'Raycaster layers');instances.layers.set(0);
fixture.visible=false;assert.equal(picker.firstHit(ray),null,'Hidden inspection source cannot intercept clicks');fixture.visible=true;
ray.near=3;ray.far=8;same(picker.firstHit(ray),native(ray,meshes(fixture)),'Near/far interval');assert.equal(ray.far,8,'Queries restore the caller far plane');ray.near=0;ray.far=Infinity;
hidden.visible=true;same(picker.firstHit(ray),native(ray,meshes(fixture)),'Visibility changes without transform changes');hidden.visible=false;
const tied=front.clone();front.position.set(6,0,-2);tied.position.copy(front.position);fixture.add(tied);picker.refresh();ray.set(new T.Vector3(6,0,3),new T.Vector3(0,0,-1));same(picker.firstHit(ray),native(ray,meshes(fixture)),'Stable equal-distance ordering');
const outside=new T.Mesh(geometry,material);outside.position.x=100;outside.raycast=(r,hits)=>hits.push({distance:1,point:r.ray.at(1,new T.Vector3()),object:outside});fixture.add(outside);picker.refresh();same(picker.firstHit(ray),native(ray,meshes(fixture)),'Custom raycasts are not constrained to mesh bounds');picker.dispose();

// Changes to bind-space inputs must rebuild the one-time skin cache; ordinary
// animation changes only transform the cached bone boxes.
const skinRoot=new T.Group(),skinGeometry=new T.BufferGeometry();
skinGeometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
skinGeometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(12),4));
skinGeometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
const skin=new T.SkinnedMesh(skinGeometry,new T.MeshBasicMaterial({side:T.DoubleSide}));skinRoot.add(skin);
let boneA=new T.Bone(),boneB=new T.Bone();skin.add(boneA,boneB);skinRoot.updateMatrixWorld(true);skin.bind(new T.Skeleton([boneA,boneB]));
skin.boundingSphere=new T.Sphere(new T.Vector3(),100);
const skinPicker=createRoomPicking(T,{root:skinRoot});skinPicker.refresh();
let skinBuilds=skinPicker.stats.skinBuilds;
function checkSkin(label,rebuild){
  skinRoot.updateMatrixWorld(true);const point=new T.Vector3(),part=new T.Vector3();
  for(let i=0;i<3;i++)point.add(skin.getVertexPosition(i,part));point.multiplyScalar(1/3).applyMatrix4(skin.matrixWorld);
  const testRay=new T.Raycaster(point.clone().add(new T.Vector3(0,0,5)),new T.Vector3(0,0,-1));
  skinPicker.invalidate();const result=skinPicker.firstHit(testRay);same(result,native(testRay,[skin]),label);assert.equal(result?.object,skin,label+' remains clickable');
  assert.equal(skinPicker.stats.skinBuilds,skinBuilds+(rebuild?1:0),label+' cache rebuild count');skinBuilds=skinPicker.stats.skinBuilds;
}
boneA.position.x=2;checkSkin('Bone animation reuses source bounds',false);
boneB.position.x=10;skinGeometry.attributes.skinIndex.setX(1,1);skinGeometry.attributes.skinIndex.needsUpdate=true;checkSkin('Skin index version changes',true);
skinGeometry.attributes.skinIndex.setXYZW(1,0,1,0,0);skinGeometry.attributes.skinIndex.needsUpdate=true;
skinGeometry.attributes.skinWeight.setXYZW(1,.5,.5,0,0);skinGeometry.attributes.skinWeight.needsUpdate=true;checkSkin('Skin weight version changes',true);
skinGeometry.attributes.position.setX(1,12);skinGeometry.attributes.position.needsUpdate=true;checkSkin('Position buffer changes',true);
skin.geometry=skinGeometry.clone();skin.geometry.attributes.position.setX(1,22);checkSkin('Geometry replacement',true);
skin.bindMatrix.makeScale(2,2,2);checkSkin('Bind matrix changes',true);
skin.skeleton.boneInverses[1].makeTranslation(4,0,0);checkSkin('Bone inverse changes',true);
skin.remove(boneA,boneB);boneA=new T.Bone();boneB=new T.Bone();skin.add(boneA,boneB);skinRoot.updateMatrixWorld(true);skin.bind(new T.Skeleton([boneA,boneB]),new T.Matrix4());boneB.position.x=18;checkSkin('Skeleton replacement',true);
skinPicker.dispose();

const asset=await loadTabbyFixture(),detail=await loadTabbyFixture('full');
const room=createRoom(T,{catAsset:asset,loadDetailedCat:async()=>detail});
const landmarks=await createDeskLandmarks(T);room.group.add(landmarks.group);room.targets.push(...landmarks.targets);
const wallNavigation=createWallNavigation(T,{room:room.group});room.targets.push(...wallNavigation.targets);loadSurfaceMaterials(T,room.group);
const actions=createObjectActions(T,room.group), accelerated=createRoomPicking(T,{root:room.group});
let objects=meshes(room.group);accelerated.refresh(objects);
const camera=new T.PerspectiveCamera(50,1280/800,.025,80),rays=[];
for(const [eye,target]of[
  [[0,3.48,8.24],[0,2.98,-.35]],[[0,3.5,4],[6.3,3.7,4]],[[0,3.5,4],[-6.3,3.7,4]],[[0,3.5,4],[0,3.7,9.2]],
]){
  camera.position.fromArray(eye);camera.lookAt(new T.Vector3(...target));camera.updateMatrixWorld();
  for(let y=0;y<7;y++)for(let x=0;x<13;x++){const r=new T.Raycaster();r.setFromCamera({x:-.96+x*.16,y:-.9+y*.3},camera);rays.push(r);}
}
const seat=new T.Vector3(0,3.48,8.24);
for(const target of room.targets){const direction=target.anchor.clone().sub(seat);rays.push(new T.Raycaster(seat,direction.clone().normalize(),0,Math.max(0,direction.length()-.025)));}
const samples=[];
function compare(label,selection=rays){
  room.group.updateMatrixWorld(true);accelerated.invalidate();
  const expected=selection.map(r=>native(r,objects));
  selection.forEach((r,i)=>{
    const hit=accelerated.firstHit(r);same(hit,expected[i],label+' ray '+i);
    assert.equal(hit&&(actions.identify(hit.object)??hit.object.userData.targetId??null),expected[i]&&(actions.identify(expected[i].object)??expected[i].object.userData.targetId??null),'Action/target identity remains unchanged');
  });samples.push({label,rays:selection.length});
}
compare('Seated and all wall views plus pin occlusion');
const drawer=[...actions.entries.values()].find(entry=>entry.kind==='drawer');actions.trigger(drawer.id);actions.update(.6);room.blinds.setRaised(true);room.blinds.update(.1,false);
room.cat.update(.05);compare('Opened drawer and raised instanced blinds',rays.filter((_,i)=>i%4===0));

// Preserve exact stretched-paw triangle hits; fixed conservative skin bounds
// are reused while authored bone transforms change underneath them.
const clip=asset.animations.find(c=>c.name==='Stretch');room.cat.mixer.stopAllAction();const action=room.cat.mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();action.time=clip.duration*.4;room.cat.mixer.update(0);room.group.updateMatrixWorld(true);
const body=room.cat.model.getObjectByName('Cat_•_continuous_anatomical_surface'),vertex=new T.Vector3();body.getVertexPosition(42450,vertex).applyMatrix4(body.matrixWorld);
const pawRay=new T.Raycaster(seat,vertex.sub(seat).normalize());compare('Animated stretched paw',[pawRay]);
await room.cat.ensureDetail();objects=meshes(room.group);accelerated.refresh(objects);compare('High-detail cat after mesh-list refresh',rays.slice(0,91).filter((_,i)=>i%3===0));
const cachedSkinBuilds=accelerated.stats.skinBuilds;
room.cat.useRoomDetail();objects=meshes(room.group);accelerated.refresh(objects);assert.equal(accelerated.stats.skinBuilds,cachedSkinBuilds,'Returning to a retained LOD reuses its source skin cache');compare('Return to room LOD',[pawRay]);

// Warm both paths, then compare a fixed pointer burst. Elapsed time is reported,
// while the deterministic acceptance criterion is fewer exact raycast calls.
const visibleObjects=objects.filter(visible),burst=rays.slice(0,91);
for(const r of burst.slice(0,8)){native(r,objects);accelerated.firstHit(r);}
let started=performance.now();for(let repeat=0;repeat<3;repeat++)for(const r of burst)r.intersectObjects(visibleObjects,false).find(solid);const beforeMs=performance.now()-started;
accelerated.resetStats();started=performance.now();for(let repeat=0;repeat<3;repeat++)for(const r of burst)accelerated.firstHit(r);const afterMs=performance.now()-started;
const beforeCalls=visibleObjects.length*burst.length*3,afterCalls=accelerated.stats.preciseCalls;
assert.ok(afterCalls<beforeCalls*.4,'The broad phase eliminates most detailed object raycasts');
assert.equal(accelerated.stats.syncs,0,'A same-frame pointer burst does not rebuild or rescan the bounds');
assert.equal(accelerated.stats.skinBuilds,0,'Pointer movement never rescans the source skin vertices');
room.group.visible=false;assert.equal(accelerated.firstHit(pawRay),null,'Inspection hides all original room picking');
accelerated.dispose();room.cat.dispose();room.blinds.dispose();room.photoWall?.dispose();room.decorations?.dispose();wallNavigation.dispose();
console.log(JSON.stringify({result:'PASS',meshCount:objects.length,samples,before:{preciseCalls:beforeCalls,milliseconds:Number(beforeMs.toFixed(2))},after:{...accelerated.stats,milliseconds:Number(afterMs.toFixed(2))},callReductionPercent:Number((100*(1-afterCalls/beforeCalls)).toFixed(1)),speedup:Number((beforeMs/afterMs).toFixed(2)),checks:['Identical object, instance, triangle, point, action and pin occlusion results','Dynamic transforms, instance version changes and cat LOD refresh','Animated skinned paws use native triangles without per-query vertex scans','Hidden ancestors, ray layers, transparent occluders and custom/no-op raycasts','Bounds reuse during pointer bursts and nearest-hit early termination']},null,2));
