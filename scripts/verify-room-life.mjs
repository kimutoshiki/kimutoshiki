import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import {clone as cloneSkeleton} from '../js/vendor/SkeletonUtils.js';
import {loadTabbyFixture} from './helpers/load-tabby-fixture.mjs';
import {createRoomCat} from '../scene/cat-life.js';
import {createWindowBlinds} from '../scene/window-blinds.js';
import {createObjectActions} from '../scene/object-actions.js';
import {prepareBoxSurfaceUVs, surface} from '../scene/surface-materials.js';

const ctx=new Proxy({}, {get(o,k){if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>ctx})};
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw new Error('The GLB fixture must use only bundled local files');};
const asset=await loadTabbyFixture(), detail=await loadTabbyFixture('full');
globalThis.fetch=originalFetch;
function assetStats(value){
  const result={meshes:0,skinned:0,bones:0,triangles:0,colored:0,textured:0};
  value.scene.traverse(o=>{
    if(o.isBone)result.bones++;
    if(!o.isMesh)return;
    result.meshes++;if(o.isSkinnedMesh)result.skinned++;
    result.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    if(o.geometry.attributes.color)result.colored++;
    if((Array.isArray(o.material)?o.material:[o.material]).some(m=>m.map))result.textured++;
  });return result;
}
const roomStats=assetStats(asset), fullStats=assetStats(detail);
assert.ok(roomStats.triangles<250000&&roomStats.triangles>150000,'Normal viewing retains a bounded, detailed source-derived LOD');
assert.equal(fullStats.triangles,1509248,'The complete high-detail model remains available');
assert.equal(roomStats.bones,37);assert.equal(fullStats.bones,37);
assert.ok(roomStats.skinned>=10&&roomStats.colored+roomStats.textured>=2,'Actual skinned surfaces and tabby colors survive loading');
const clipNames=['Idle','Jump','Lie_Roll_Rest','Run','Stretch','Walk'];
for(const value of[asset,detail]){
  assert.deepEqual(value.animations.map(c=>c.name).sort(),clipNames);
  for(const clip of value.animations){
    assert.equal(clip.tracks.length,111,'Every supplied bone channel is retained');
    for(const track of clip.tracks){
      assert.equal(track.times[0],0,'Authored clips start at time zero');
      assert.ok([...track.times,...track.values].every(Number.isFinite),'Animation keys are finite');
    }
  }
}
let weightedVertices=0,maxWeightError=0;
const sourceSurfaces=new Map(), sourceBones=[], originalMaterials=new Map();
const materialValues=material=>({color:material.color?.toArray(),roughness:material.roughness,metalness:material.metalness,vertexColors:material.vertexColors,side:material.side,transparent:material.transparent,opacity:material.opacity,map:material.map,normalMap:material.normalMap,roughnessMap:material.roughnessMap});
asset.scene.traverse(o=>{
  if(o.isBone)sourceBones.push(o);
  if(!o.isMesh)return;
  sourceSurfaces.set(o,{geometry:o.geometry,material:o.material});
  for(const material of Array.isArray(o.material)?o.material:[o.material])originalMaterials.set(material,materialValues(material));
  for(const attribute of Object.values(o.geometry.attributes)){
    for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)assert.ok(Number.isFinite(attribute.getComponent(i,c)),'Decoded geometry is finite');
  }
  if(!o.isSkinnedMesh)return;
  const weights=o.geometry.attributes.skinWeight,indices=o.geometry.attributes.skinIndex;
  assert.ok(weights&&indices);weightedVertices+=weights.count;
  for(let i=0;i<weights.count;i++){
    let sum=0;
    for(let c=0;c<4;c++){
      const weight=weights.getComponent(i,c),bone=indices.getComponent(i,c);
      assert.ok(weight>=0&&weight<=1&&Number.isInteger(bone)&&bone>=0&&bone<o.skeleton.bones.length,'Skin weights refer to valid bones');sum+=weight;
    }maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));
  }
});
assert.ok(maxWeightError<1e-5,'Exported skin weights sum to one');
detail.scene.traverse(o=>{if(o.isBone)assert.ok(!sourceBones.includes(o),'Room and full assets have independent bone instances');});

// Inspection binds cloned bones but preserves supplied materials and geometry.
const inspected=cloneSkeleton(asset.scene), clonedBones=new Set();
inspected.traverse(o=>{if(o.isBone)clonedBones.add(o);});
inspected.traverse(o=>{
  if(!o.isSkinnedMesh)return;
  const original=asset.scene.getObjectByName(o.name);
  assert.notEqual(o.skeleton,original.skeleton);assert.equal(o.material,original.material);
  o.skeleton.bones.forEach((bone,i)=>{assert.ok(clonedBones.has(bone));assert.notEqual(bone,original.skeleton.bones[i]);});
});
const sourcePose=()=>sourceBones.flatMap(b=>[...b.position,...b.quaternion,...b.scale]);
const originalPose=sourcePose(), inspectionMixer=new T.AnimationMixer(inspected), animatedClips=[];
for(const clip of asset.animations){
  inspectionMixer.stopAllAction();inspectionMixer.clipAction(clip).play();inspectionMixer.update(0);
  const before=[...clonedBones].flatMap(b=>[...b.position,...b.quaternion,...b.scale]);
  inspectionMixer.update(clip.duration*.37);
  const after=[...clonedBones].flatMap(b=>[...b.position,...b.quaternion,...b.scale]);
  assert.ok(after.some((v,i)=>Math.abs(v-before[i])>1e-6),clip.name+' really animates the supplied skeleton');
  assert.deepEqual(sourcePose(),originalPose,'Inspection animation cannot move the room cat');animatedClips.push(clip.name);
}
inspectionMixer.stopAllAction();inspectionMixer.uncacheRoot(inspected);inspected.traverse(o=>o.skeleton?.dispose());

const scene=new T.Group();let detailLoads=0;
const cat=createRoomCat(T,{group:scene,asset,loadDetail:async()=>{detailLoads++;return detail;}});
for(const [mesh,source]of sourceSurfaces){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material,'Installing the cat preserves its original materials');}
for(const [material,values]of originalMaterials)assert.deepEqual(materialValues(material),values,'Original coat colors, texture references and PBR settings remain unchanged');
const feet=['foot.F.L','foot.F.R','foot.H.L','foot.H.R'].map(name=>sourceBones.find(b=>b.userData.name===name));
assert.ok(feet.every(Boolean),'All four supplied foot bones are present');
const palette=Object.fromEntries(['lightWood','wood','darkWood','brass'].map(key=>[key,surface(new T.MeshStandardMaterial({color:'#99714e'}),'walnut')]));
const blinds=createWindowBlinds(T,{group:scene,palette}), actions=createObjectActions(T,scene);
const states=new Set(),previous=cat.group.position.clone();let distance=0,maxTurn=0,priorYaw=cat.group.rotation.y,lowestPaw=1;
const obstacleDiscs=[{x:1.35,z:1.86,r:.93,label:'chair'},{x:-5.66,z:3.2,r:.65,label:'floor plant'},{x:-2.88,z:.69,r:.15,label:'desk leg'},{x:2.88,z:.69,r:.15,label:'desk leg'},{x:-3.38,z:2.16,r:.10,label:'workbench leg'}];
const seatedCamera=new T.PerspectiveCamera(50,1280/720,.025,80);seatedCamera.position.set(0,3.48,8.24);seatedCamera.lookAt(0,2.98,-.35);seatedCamera.updateMatrixWorld();
assert.equal(cat.contactShadow.parent,scene);assert.notEqual(cat.contactShadow.parent,cat.group,'Floor shading stays outside the inspectable cat');
const body=cat.model.getObjectByName('Cat_•_continuous_anatomical_surface');assert.ok(body?.isSkinnedMesh);
for(let step=0;step<3600;step++){
  cat.update(.05);states.add(cat.state);
  const travelled=cat.group.position.distanceTo(previous);assert.ok(travelled<.02,'The cat never jumps between waypoints');distance+=travelled;previous.copy(cat.group.position);
  const turn=Math.abs(Math.atan2(Math.sin(cat.group.rotation.y-priorYaw),Math.cos(cat.group.rotation.y-priorYaw)));maxTurn=Math.max(maxTurn,turn);priorYaw=cat.group.rotation.y;assert.ok(turn<.13,'Turning stays gradual');
  for(const obstacle of obstacleDiscs)assert.ok(Math.hypot(cat.group.position.x-obstacle.x,cat.group.position.z-obstacle.z)>obstacle.r+.46,'Route clears '+obstacle.label);
  for(const foot of feet){
    const paw=foot.getWorldPosition(new T.Vector3());assert.ok([...paw].every(Number.isFinite),'Authored foot motion remains finite');
    const projected=paw.project(seatedCamera);lowestPaw=Math.min(lowestPaw,projected.y);assert.ok(projected.y> -1&&Math.abs(projected.x)<1,'Four feet stay visible from the seated camera');
  }
  if(step%200===0){
    // Precise bounds apply current skinning rather than the bind pose.
    const bounds=new T.Box3().setFromObject(cat.model,true);
    for(const x of[-2.88,2.88]){
      const legBox=new T.Box3(new T.Vector3(x-.11,.025,.58),new T.Vector3(x+.11,1.5,.80));
      assert.ok(!bounds.intersectsBox(legBox),'The animated model clears the vertical desk legs');
    }
    assert.ok(new T.Box3().setFromObject(body,true).min.y>=-.01,'The animated body remains above the floor');
    assert.ok(Math.abs(cat.contactShadow.position.x-cat.group.position.x)<1e-9&&Math.abs(cat.contactShadow.position.z-cat.group.position.z)<1e-9,'Contact shading follows the cat');
  }
}
assert.ok(distance>20,'The cat actually roams');
for(const state of['walk','idle','stretch','rest','look'])assert.ok(states.has(state),'Missing behavior '+state);
const frozen=()=>{cat.group.updateMatrixWorld(true);const data=[cat.mixer.time];cat.group.traverse(o=>data.push(...o.matrixWorld.elements));data.push(...cat.contactShadow.position);return data;};
const before=frozen();assert.equal(cat.update(1,false),false);assert.deepEqual(frozen(),before,'Reduced motion freezes every bone and the mixer');
cat.setPaused(true);assert.equal(cat.update(.1),false);assert.deepEqual(frozen(),before,'Explicit pause freezes the cat');cat.setPaused(false);
const catAction=[...actions.entries.values()].find(entry=>entry.kind==='cat-life');assert.ok(catAction);actions.trigger(catAction.id);assert.equal(cat.state,'look');
for(let step=0;step<30;step++)cat.update(.05);const looking=cat.group.position.clone();for(let step=0;step<20;step++)cat.update(.05);
assert.ok(cat.group.position.distanceTo(looking)<.015,'A clicked cat settles and looks toward the viewer');
const roomPosition=cat.group.position.clone(),roomYaw=cat.group.rotation.y;
const idleFraction=()=>{const clip=cat.asset.animations.find(c=>c.name==='Idle');return cat.mixer.existingAction(clip).time/clip.duration;};
const phase=idleFraction();
const assertSwap=expected=>{assert.equal(cat.asset,expected);assert.deepEqual(cat.group.position,roomPosition);assert.equal(cat.group.rotation.y,roomYaw);assert.ok(Math.abs(idleFraction()-phase)<1e-6,'Detail swaps retain the authored animation phase');};
const upgrade=cat.ensureDetail();assert.equal(cat.ensureDetail(),upgrade,'Concurrent inspection shares one detail load');
assert.equal(await upgrade,true);assert.equal(detailLoads,1);assertSwap(detail);assert.equal(cat.fullDetail,true);
assert.equal(assetStats(cat.asset).triangles,fullStats.triangles);assert.equal(await cat.ensureDetail(),false);
cat.useRoomDetail();assertSwap(asset);assert.equal(cat.fullDetail,false);assert.ok(assetStats(cat.asset).triangles<250000,'Returning to the room restores low GPU geometry cost');
assert.equal(await cat.ensureDetail(),true);assertSwap(detail);assert.equal(detailLoads,1,'Repeated inspection reuses the detailed GLB');
cat.useRoomDetail();assertSwap(asset);

// A response arriving after the visitor returns to the room is cached, not shown.
const departedRoom=await loadTabbyFixture(),departedAsset=await loadTabbyFixture();let finishDeparted,departedLoads=0;
const departedCat=createRoomCat(T,{group:new T.Group(),asset:departedRoom,loadDetail:()=>{departedLoads++;return new Promise(resolve=>{finishDeparted=resolve;});}});
const departedResult=departedCat.ensureDetail();departedCat.useRoomDetail();finishDeparted(departedAsset);
assert.equal(await departedResult,false);assert.equal(departedCat.fullDetail,false);assert.equal(departedCat.asset,departedRoom);assert.equal(departedCat.model,departedRoom.scene);
assert.equal(await departedCat.ensureDetail(),true);assert.equal(departedLoads,1);assert.equal(departedCat.asset,departedAsset);departedCat.dispose();

// A response arriving after disposal must not resurrect the cat or leak resources.
const lateRoom=await loadTabbyFixture(),lateAsset=await loadTabbyFixture();let finishLoad,disposedGeometry=0;
const geometries=new Set();lateAsset.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});
for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposedGeometry++);
const lateCat=createRoomCat(T,{group:new T.Group(),asset:lateRoom,loadDetail:()=>new Promise(resolve=>{finishLoad=resolve;})});
const lateResult=lateCat.ensureDetail();lateCat.dispose();finishLoad(lateAsset);
assert.equal(await lateResult,false);assert.equal(disposedGeometry,geometries.size);assert.equal(lateCat.asset,lateRoom);assert.notEqual(lateCat.model,lateAsset.scene);

// A failed initial load leaves no model from which to request inspection detail.
let emptyLoads=0;
const emptyCat=createRoomCat(T,{group:new T.Group(),loadDetail:async()=>{emptyLoads++;throw new Error('Unexpected detail request without an initial cat');}});
assert.equal(await emptyCat.ensureDetail(),false);assert.equal(emptyLoads,0);assert.equal(emptyCat.model,undefined);emptyCat.dispose();

// Texture preparation must retain the actual animated instance object.
prepareBoxSurfaceUVs(T,scene);assert.equal(blinds.slats.parent,blinds.group);
const blindAction=[...actions.entries.values()].find(entry=>entry.kind==='blinds');assert.ok(blindAction);
const closed=blinds.slats.instanceMatrix.array.slice(), lowRail=blinds.bottomRail.position.y;
actions.trigger(blindAction.id);assert.equal(blinds.group.userData.blindsRaised,true);
for(let step=0;step<100;step++)blinds.update(.05);
assert.equal(blinds.openness,1);assert.ok(blinds.bottomRail.position.y-lowRail>2.7,'The bottom rail rises with the slats');
assert.notDeepEqual(blinds.slats.instanceMatrix.array,closed,'Wooden slats really move');
const matrix=new T.Matrix4(), pos=new T.Vector3();let previousY=Infinity;
for(let i=0;i<blinds.slats.count;i++){blinds.slats.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);assert.ok(pos.y<previousY,'The raised stack retains correct slat ordering');previousY=pos.y;}
const open=blinds.slats.instanceMatrix.array.slice();assert.equal(blinds.update(.1),false);assert.deepEqual(blinds.slats.instanceMatrix.array,open,'Resting blinds do no update work');
actions.clear();assert.equal(blinds.openness,1,'Changing or pausing the view preserves raised blinds');
actions.trigger(blindAction.id);blinds.update(.016,false);assert.equal(blinds.openness,0);assert.deepEqual(blinds.slats.instanceMatrix.array,closed,'Reduced-motion toggle returns exactly to the lowered state');
cat.dispose();blinds.dispose();assert.equal(cat.update(.05),false);assert.equal(blinds.update(.05),false);
console.log(JSON.stringify({result:'PASS',roomStats,fullStats,weightedVertices,maxWeightError,animatedClips,catDistance:Number(distance.toFixed(2)),maxTurn:Number(maxTurn.toFixed(3)),lowestProjectedPaw:Number(lowestPaw.toFixed(3)),habits:[...states],checks:['Local WASM decodes real GLBs, bones, normalized skin weights and tabby colors','All six authored clips animate independently bound inspection bones','180 seconds of smooth collision-clear roaming, visible feet and floor contact','Original materials, reduced-motion freeze, explicit pause and viewer response','Room/full/room/full swaps retain pose and phase with one load; late loads dispose safely','Physical blind stacking and rail movement, persistent state and no idle updates']},null,2));
