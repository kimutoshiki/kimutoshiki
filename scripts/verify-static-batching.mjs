import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import { createDeskLandmarks } from '../scene/desk-landmarks.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats, optimizeRoomStaticDraws } from '../scene/static-batching.js';
import { prepareBoxSurfaceUVs, loadSurfaceMaterials } from '../scene/surface-materials.js';
import { createRoom } from '../scene/room-model.js';
import { createObjectActions } from '../scene/object-actions.js';
import { getRoomTime, updateRoomClock } from '../scene/room-time.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';

const context = new Proxy({}, { get: (o,k) => o[k] ?? (k==='createLinearGradient'||k==='createRadialGradient' ? ()=>({addColorStop(){}}) : k==='measureText' ? s=>({width:s.length*10}) : ()=>{}), set: (o,k,v)=>(o[k]=v,true) });
globalThis.document = { createElement:()=>({width:1024,height:128,getContext:()=>context}), fonts:{ready:Promise.resolve()} };
const near = (a,b,tolerance=2e-5) => assert.ok(Math.abs(a-b)<=tolerance, `${a} differs from ${b}`);
let checkedVertices=0, checkedAttributes=0;
function verifyBatch({owner,sources,merged}) {
  const inverse=owner.matrixWorld.clone().invert(), local=new T.Matrix4(), instance=new T.Matrix4(), transform=new T.Matrix4();
  const point=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();let offset=0;
  for(const source of sources){
    assert.equal(merged.material,source.material);assert.equal(merged.castShadow,source.castShadow);assert.equal(merged.receiveShadow,source.receiveShadow);
    assert.deepEqual(merged.userData,source.userData);
    local.multiplyMatrices(inverse,source.matrixWorld);
    for(let i=0,count=source.isInstancedMesh?source.count:1;i<count;i++){
      if(source.isInstancedMesh){source.getMatrixAt(i,instance);transform.multiplyMatrices(local,instance);}else transform.copy(local);
      normalMatrix.getNormalMatrix(transform);
      const geometry=source.geometry,positions=geometry.attributes.position;
      for(let v=0;v<positions.count;v++){
        point.fromBufferAttribute(positions,v).applyMatrix4(transform);
        const target=merged.geometry.attributes.position;
        near(point.x,target.getX(offset+v));near(point.y,target.getY(offset+v));near(point.z,target.getZ(offset+v));
        if(geometry.attributes.normal){
          normal.fromBufferAttribute(geometry.attributes.normal,v).applyNormalMatrix(normalMatrix);
          const n=merged.geometry.attributes.normal;near(normal.x,n.getX(offset+v));near(normal.y,n.getY(offset+v));near(normal.z,n.getZ(offset+v));
        }
        for(const name of Object.keys(geometry.attributes).filter(n=>!['position','normal','tangent'].includes(n))){
          const a=geometry.attributes[name],b=merged.geometry.attributes[name];
          for(let component=0;component<a.itemSize;component++) assert.equal(a.getComponent(v,component),b.getComponent(offset+v,component),`${name} changed`);
          checkedAttributes++;
        }
        checkedVertices++;
      }
      offset+=positions.count;
    }
  }
  assert.equal(merged.geometry.attributes.position.count,offset);
}

const plain=await createDeskLandmarks(T,{optimize:false}), before=staticDrawStats(plain.group);
const beforeBox=new T.Box3().setFromObject(plain.group), architecturalNames=['Okuma auditorium architecture','Okuma statue monument','Five-tier keep','Landmark architecture'];
const samples=[];
for(const display of plain.group.children){
  display.updateWorldMatrix(true,true);
  const box=new T.Box3().setFromObject(display),center=box.getCenter(new T.Vector3());
  for(const direction of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]){
    for(const offset of [-.15,0,.15]){
      const target=center.clone().add(new T.Vector3(offset,offset*.35,offset*.2)),origin=target.clone().addScaledVector(new T.Vector3(...direction),3);
      const ray=new T.Raycaster(origin,target.clone().sub(origin).normalize());
      const hit=ray.intersectObject(display,true).find(h=>h.object.isMesh);
      if(hit)samples.push({display,ray,distance:hit.distance,point:hit.point.clone(),uv:hit.uv?.clone(),material:hit.object.material,targetId:hit.object.userData.targetId});
    }
  }
  const mount=display.children.find(o=>o.userData.inspectionSource),architecture=mount.children[0].children[0],clocks=new Set();
  architecture.traverse(o=>{if(/^Clock face [1-4]$/.test(o.name))clocks.add(o);});
  mergeStaticDraws(T,architecture,{byParent:false,preserveGroups:clocks,onBatch:verifyBatch});
  mergeStaticDraws(T,display,{skipRoots:new Set([mount]),onBatch:verifyBatch});
}
cacheStaticLocalMatrices(plain.group);
plain.group.updateMatrixWorld(true);
const after=staticDrawStats(plain.group),afterBox=new T.Box3().setFromObject(plain.group);
// Merging rotated geometry tightens the old union of individual bounding boxes.
// Every actual vertex was checked above; the new bounds cannot expand it.
for(const axis of ['x','y','z']){assert.ok(afterBox.min[axis]>=beforeBox.min[axis]-2e-5);assert.ok(afterBox.max[axis]<=beforeBox.max[axis]+2e-5);}
assert.equal(before.triangles,after.triangles);assert.ok(after.drawCalls<before.drawCalls*.25);
for(const name of architecturalNames)assert.ok(plain.group.getObjectByName(name));
for(let n=1;n<=4;n++)assert.ok(plain.group.getObjectByName(`Clock face ${n}`).children.length);
for(const sample of samples){
  const hit=sample.ray.intersectObject(sample.display,true).find(h=>h.object.isMesh);
  assert.ok(hit);near(hit.distance,sample.distance,1e-5);assert.ok(hit.point.distanceTo(sample.point)<1e-5);
  assert.equal(hit.object.material,sample.material);assert.equal(hit.object.userData.targetId,sample.targetId);
  if(sample.uv){near(hit.uv.x,sample.uv.x);near(hit.uv.y,sample.uv.y);}
}
// The room-wide loader must not repeat physical UV projection after batching.
const uvBuffers=new Map();plain.group.traverse(o=>{if(o.isMesh&&o.geometry.attributes.uv)uvBuffers.set(o.geometry,o.geometry.attributes.uv.array.slice());});
prepareBoxSurfaceUVs(T,plain.group);
assert.deepEqual(staticDrawStats(plain.group),after);
for(const [geometry,uv] of uvBuffers)assert.deepEqual(geometry.attributes.uv.array,uv);

// Dynamic direct references, transparent sorting and animated parent ownership
// must survive the safe default used by other room groups.
const fixture=new T.Group(),movingParent=new T.Group(),skipped=new T.Group();fixture.add(movingParent,skipped);
const material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry(),transparent=new T.MeshStandardMaterial({transparent:true,opacity:.5});
const protectedMesh=new T.Mesh(geometry,material),hiddenRootMesh=new T.Mesh(geometry,material),glass=new T.Mesh(geometry,transparent),customPick=new T.Mesh(geometry,material);
const customRaycast=()=>{};customPick.raycast=customRaycast;
movingParent.add(protectedMesh,glass,customPick);skipped.add(hiddenRootMesh);
for(const x of [1,2,3]){const mesh=new T.Mesh(geometry,material);mesh.position.x=x;movingParent.add(mesh);}
const mirrored=new T.Mesh(geometry,material);mirrored.scale.x=-1;mirrored.position.z=2;movingParent.add(mirrored);
mergeStaticDraws(T,fixture,{protectedObjects:new Set([protectedMesh]),skipRoots:new Set([skipped]),onBatch:verifyBatch});
assert.equal(protectedMesh.parent,movingParent);assert.equal(glass.parent,movingParent);assert.equal(hiddenRootMesh.parent,skipped);
assert.equal(customPick.parent,movingParent);assert.equal(customPick.raycast,customRaycast);
const batch=movingParent.children.find(o=>o.name.startsWith('Static batch'));
assert.ok(batch);movingParent.position.x=7;fixture.updateMatrixWorld(true);near(batch.getWorldPosition(new T.Vector3()).x,7);
const mirroredRay=new T.Raycaster(new T.Vector3(7,0,5),new T.Vector3(0,0,-1));assert.ok(mirroredRay.intersectObject(batch).length,'Mirrored front-face winding changed');

// Instrument actual Three.js matrix operations after a warm-up.
function matrixWork(root){
  root.updateMatrixWorld(true);let compose=0,multiply=0;
  const originalCompose=T.Matrix4.prototype.compose,originalMultiply=T.Matrix4.prototype.multiplyMatrices;
  T.Matrix4.prototype.compose=function(...args){compose++;return originalCompose.apply(this,args);};
  T.Matrix4.prototype.multiplyMatrices=function(...args){multiply++;return originalMultiply.apply(this,args);};
  const start=performance.now();for(let n=0;n<1000;n++)root.updateMatrixWorld();const ms=performance.now()-start;
  T.Matrix4.prototype.compose=originalCompose;T.Matrix4.prototype.multiplyMatrices=originalMultiply;
  return{frames:1000,ms,compose,multiply};
}
const reference=await createDeskLandmarks(T,{optimize:false}),built=await createDeskLandmarks(T);
assert.deepEqual(staticDrawStats(built.group),after,'Factory differs from independently checked batching path');
const matricesBefore=matrixWork(reference.group),matricesAfter=matrixWork(built.group);
assert.ok(matricesAfter.compose<matricesBefore.compose*.02);assert.ok(matricesAfter.multiply<matricesBefore.multiply*.30);

// The conservative room pass must retain direct references and action ownership.
T.TextureLoader.prototype.load=function(){return new T.Texture();};
const room=createRoom(T,{catAsset:await loadTabbyFixture()}),textures=loadSurfaceMaterials(T,room.group);
const identities=new Map(),actionsBefore=[];
room.group.traverse(object=>{
  if(object.userData.roomAction)actionsBefore.push(object);
  if(object.name||object.userData.roomAction||object.userData.actionPart)identities.set(object,{parent:object.parent,raycast:object.raycast});
});
const roomResult=optimizeRoomStaticDraws(T,room,{onBatch:verifyBatch});
assert.equal(roomResult.before.triangles,roomResult.after.triangles);assert.ok(roomResult.after.drawCalls<roomResult.before.drawCalls);
for(const [object,identity] of identities){assert.equal(object.parent,identity.parent,'Managed/named object was detached');assert.equal(object.raycast,identity.raycast);}
const actions=createObjectActions(T,room.group);
assert.deepEqual([...actions.entries.values()].map(e=>e.object),actionsBefore);
for(const entry of actions.entries.values()){
  let count=0;entry.object.traverse(o=>{if(o.isMesh){count++;assert.ok(actions.identify(o));}});assert.ok(count,'Action lost geometry');
}
const minute=room.clock.minute,hour=room.clock.hour;
updateRoomClock(room.clock,getRoomTime(new Date(2026,8,16,10,17)));const minuteAngle=minute.rotation.z;
updateRoomClock(room.clock,getRoomTime(new Date(2026,8,16,11,23)));assert.notEqual(minute.rotation.z,minuteAngle);
assert.equal(room.group.getObjectByName('Wall hour hand'),hour);assert.equal(room.group.getObjectByName('Wall minute hand'),minute);
const slats=room.blinds.slats,slatMatrix=slats.instanceMatrix.array.slice();room.blinds.setRaised(true);room.blinds.update(1,false);
assert.equal(slats.parent,room.blinds.group);assert.notDeepEqual(slats.instanceMatrix.array,slatMatrix);
for(const entry of actions.entries.values())if(entry.kind==='drawer'){
  const closed=entry.object.position.z,children=entry.object.children.slice();actions.trigger(entry.id);actions.update(.1,false);
  assert.equal(entry.object.position.z,closed+entry.travel);assert.deepEqual(entry.object.children,children);
}
for(const [object] of identities)if(object.isMesh&&object.name==='Subtle desk patina'){
  const hits=[];object.raycast(new T.Raycaster(),hits);assert.equal(hits.length,0);
}
room.dispose();room.cat.dispose();room.blinds.dispose();room.decorations.dispose();room.photoWall.dispose();textures.dispose();
const report={result:'PASS',before,after,matrixWork:{before:matricesBefore,after:matricesAfter},room:roomResult,checkedVertices,checkedAttributes,verifiedRays:samples.length,quality:'All triangles retained; transformed positions/normals checked for every merged vertex; UV/color attributes identical; material identity, shadow flags, semantic groups and hit UV/target preserved.',measurement:'drawCalls counts submitted geometry objects per main view before culling; actual WebGL passes also include shadows. CPU timings are local Node measurements, not browser FPS.'};
const output=process.argv.indexOf('--report');if(output>=0)await writeFile(process.argv[output+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
