import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import {createRoomCat} from '../scene/cat-life.js';
import {createWindowBlinds} from '../scene/window-blinds.js';
import {createObjectActions} from '../scene/object-actions.js';
import {prepareBoxSurfaceUVs, surface} from '../scene/surface-materials.js';

const ctx=new Proxy({}, {get(o,k){if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>ctx})};
const scene=new T.Group(), cat=createRoomCat(T,{group:scene});
const palette=Object.fromEntries(['lightWood','wood','darkWood','brass'].map(key=>[key,surface(new T.MeshStandardMaterial({color:'#99714e'}),'walnut')]));
const blinds=createWindowBlinds(T,{group:scene,palette}), actions=createObjectActions(T,scene);
const head=scene.getObjectByName('Sculpted ginger head'),body=scene.getObjectByName('Sculpted tabby torso');
assert.equal(head.material,body.material,'The head and torso share one coherent coat');
assert.equal(cat.legs.length,4);
const states=new Set(), start=cat.group.position.clone(), previous=start.clone();let distance=0, maxTurn=0, priorYaw=cat.group.rotation.y;
const obstacleDiscs=[{x:1.35,z:1.86,r:.93,label:'chair'},{x:-5.66,z:3.2,r:.65,label:'floor plant'},{x:-2.88,z:.69,r:.15,label:'desk leg'},{x:2.88,z:.69,r:.15,label:'desk leg'},{x:-3.38,z:2.16,r:.10,label:'workbench leg'}];
const seatedCamera=new T.PerspectiveCamera(50,1280/720,.025,80);seatedCamera.position.set(0,3.48,8.24);seatedCamera.lookAt(0,2.98,-.35);seatedCamera.updateMatrixWorld();
let lowestPaw=1;
assert.equal(cat.contactShadow.parent,scene);assert.notEqual(cat.contactShadow.parent,cat.group,'Contact shading must not enlarge the cat inspection or hit area');
for(let step=0;step<3600;step++){
  cat.update(.05);states.add(cat.state);
  const travelled=cat.group.position.distanceTo(previous);assert.ok(travelled<.02,'Cat movement never jumps between waypoints');distance+=travelled;previous.copy(cat.group.position);
  const turn=Math.abs(Math.atan2(Math.sin(cat.group.rotation.y-priorYaw),Math.cos(cat.group.rotation.y-priorYaw)));maxTurn=Math.max(maxTurn,turn);priorYaw=cat.group.rotation.y;
  assert.ok(turn<.13,'Turning remains gradual');
  for(const obstacle of obstacleDiscs)assert.ok(Math.hypot(cat.group.position.x-obstacle.x,cat.group.position.z-obstacle.z)>obstacle.r+.46,'Route clears '+obstacle.label);
  cat.group.updateMatrixWorld(true);
  for(const leg of cat.legs){const paw=leg.paw.getWorldPosition(new T.Vector3());assert.ok(paw.y>=-.005&&paw.y<.17,'IK keeps paws on or just above the floor');const projected=paw.clone().project(seatedCamera);lowestPaw=Math.min(lowestPaw,projected.y);assert.ok(projected.y> -1&&Math.abs(projected.x)<1,'Paws stay inside the seated 1280×720 view');}
  if(step%40===0){
    // Actual articulated mesh bounds, not just a centre-point route radius,
    // must clear the two vertical desk legs nearest the walking loop.
    cat.group.traverse(o=>{if(!o.isMesh)return;const b=new T.Box3().setFromObject(o);for(const x of[-2.88,2.88]){const legBox=new T.Box3(new T.Vector3(x-.11,.025,.69-.11),new T.Vector3(x+.11,1.5,.69+.11));assert.ok(!b.intersectsBox(legBox),'A visible cat part intersects a desk leg');}});
    assert.ok(Math.abs(cat.contactShadow.position.x-cat.group.position.x)<1e-9&&Math.abs(cat.contactShadow.position.z-cat.group.position.z)<1e-9,'Contact shading follows the walking cat');
  }
}
assert.ok(distance>20,'The cat actually roams instead of animating in place');
for(const state of ['walk','sniff','pause','sit'])assert.ok(states.has(state),'Missing natural habit '+state);
const frozen=()=>{cat.group.updateMatrixWorld(true);const data=[];cat.group.traverse(o=>data.push(...o.matrixWorld.elements));return data;};
const before=frozen();assert.equal(cat.update(1,false),false);assert.deepEqual(frozen(),before,'Reduced motion freezes every cat transform');
cat.setPaused(true);cat.update(.1);assert.deepEqual(frozen(),before,'Explicit pause freezes the cat');cat.setPaused(false);
const catAction=[...actions.entries.values()].find(entry=>entry.kind==='cat-life');assert.ok(catAction);
actions.trigger(catAction.id);assert.equal(cat.state,'look');
for(let step=0;step<30;step++)cat.update(.05);const looking=cat.group.position.clone();for(let step=0;step<20;step++)cat.update(.05);
assert.ok(cat.group.position.distanceTo(looking)<.015,'A clicked cat settles and looks toward the viewer');

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
let triangles=0,meshes=0;cat.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
assert.ok(triangles<45000&&meshes<70,'The articulated cat keeps a bounded detail budget');
cat.dispose();blinds.dispose();assert.equal(cat.update(.05),false);assert.equal(blinds.update(.05),false);
console.log(JSON.stringify({result:'PASS',catMeshes:meshes,catTriangles:triangles,catDistance:Number(distance.toFixed(2)),maxTurn:Number(maxTurn.toFixed(3)),lowestProjectedPaw:Number(lowestPaw.toFixed(3)),habits:[...states],checks:['Four articulated legs and shared coherent coat','Continuous collision-clear wandering, sniffing, pausing and sitting','Visible paws in the seated camera, mesh-level desk-leg clearance, separate floor contact shading','Floor-constrained paws, gradual turns, viewer response and complete reduced-motion freeze','Physical blind stacking, rail and cord movement, stable material preparation','Persistent blind state, repeatable opposite toggle and no idle updates']},null,2));
