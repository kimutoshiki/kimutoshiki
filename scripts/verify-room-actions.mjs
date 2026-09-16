import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import {createRoom} from '../scene/room-model.js';
import {createObjectActions} from '../scene/object-actions.js';
import {createOrbitNavigation} from '../scene/orbit-navigation.js';
import {loadSurfaceMaterials} from '../scene/surface-materials.js';
import {getRoomTime} from '../scene/room-time.js';

const ctx=new Proxy({}, {get(o,k){if(k==='createImageData'||k==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});if(k==='measureText')return text=>({width:text.length*10});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({width:1280,height:800,getContext:()=>ctx})};
const requests=[];T.TextureLoader.prototype.load=function(url,onLoad){requests.push({url,onLoad});return new T.Texture();};
const room=createRoom(T);loadSurfaceMaterials(T,room.group);const actions=createObjectActions(T,room.group),nav=createOrbitNavigation(T,room.envelope.bounds);
room.group.updateMatrixWorld(true);
const sceneMeshes=[];room.group.traverse(o=>{if(o.isMesh)sceneMeshes.push(o);});
assert.ok(actions.entries.size>0,'Real objects retain their owned interactions');
nav.setFreeMovement(true);
for(const kind of ['detail','bird','plant','lamp','mobile','cat','drawer'])assert.ok([...actions.entries.values()].some(e=>e.kind===kind),'Missing action '+kind);
let tested=0,focusChecks=0;
for(const entry of actions.entries.values()){
  const meshes=[];entry.object.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.ok(meshes.length,'Action is left with no geometry after batching: '+entry.label);
  for(const mesh of meshes)assert.ok(actions.identify(mesh),'No picking ancestor for '+entry.label);
  const before=JSON.stringify(meshes.map(m=>m.matrixWorld.elements));
  if(entry.kind!=='detail'&&entry.kind!=='drawer'){
    const rotations=Object.values(entry.parts).map(o=>o.quaternion.clone()),glow=[...entry.materials].map(m=>m.emissiveIntensity);
    actions.trigger(entry.id);actions.update(.35);entry.object.updateWorldMatrix(true,true);
    assert.ok(JSON.stringify(meshes.map(m=>m.matrixWorld.elements))!==before||[...entry.materials].some((m,i)=>m.emissiveIntensity!==glow[i]),'Action makes no visible change: '+entry.label);
    actions.restore();entry.object.updateWorldMatrix(true,true);assert.equal(JSON.stringify(meshes.map(m=>m.matrixWorld.elements)),before,'Action leaves cumulative transform drift: '+entry.label);
    actions.clear();tested++;
  }
  if(entry.kind==='drawer')continue; // A drawer opens in place, without a camera inspection.
  for(const aspect of [1.6,.462]){
    nav.reset();nav.resize(aspect<.85,aspect);const view=nav.focus(entry.object);
    for(const axis of ['x','y','z'])assert.ok(view.position[axis]>=room.envelope.bounds.min[axis]-1e-8&&view.position[axis]<=room.envelope.bounds.max[axis]+1e-8,'Close-up crosses room shell: '+entry.label);
    const box=new T.Box3().setFromObject(entry.object);assert.ok(!box.containsPoint(view.position),'Close-up camera enters object: '+entry.label);
    const camera=new T.PerspectiveCamera(50,aspect,.025,80);camera.position.copy(view.position);camera.lookAt(view.target);camera.zoom=view.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const center=box.getCenter(new T.Vector3()).project(camera);assert.ok(Math.abs(center.x)<.3&&Math.abs(center.y)<.65&&center.z<1,'Close-up misses object: '+entry.label);focusChecks++;
    if(aspect>1){
const visiblePart=meshes.some(mesh=>{
        const center=new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()),points=[center],p=mesh.geometry.attributes.position;
        if(!mesh.isInstancedMesh)for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/8)))points.push(mesh.localToWorld(new T.Vector3().fromBufferAttribute(p,i)).lerp(center,.15));
        return points.some(point=>{const ray=new T.Raycaster(view.position,point.clone().sub(view.position).normalize()),hit=ray.intersectObjects(sceneMeshes,false).find(h=>!(h.object.material.transparent&&h.object.material.opacity<.2));return hit&&actions.identify(hit.object)===entry.id;});
      });
      if(!visiblePart){const point=box.getCenter(new T.Vector3()),ray=new T.Raycaster(view.position,point.sub(view.position).normalize());console.log('Blocked detail',entry.id,entry.label,view.position.toArray(),view.target.toArray(),ray.intersectObjects(sceneMeshes,false).slice(0,3).map(h=>({name:h.object.name,parent:h.object.parent?.name,distance:h.distance})));}
      assert.ok(visiblePart,'Close-up is hidden by another object: '+entry.id+' '+entry.label);
      for(const sign of [-1,1]){nav.rotate(sign*100,sign*100);const bounded=nav.update();for(const axis of ['x','y','z'])assert.ok(bounded.position[axis]>=room.envelope.bounds.min[axis]-1e-8&&bounded.position[axis]<=room.envelope.bounds.max[axis]+1e-8);assert.ok(!box.containsPoint(bounded.position),'Close-up rotation enters object: '+entry.id);}
    }
  }
}
nav.reset();for(const sign of [-1,1]){nav.rotate(0,sign*100);const v=nav.update();assert.ok(v.pitch>=.025&&v.pitch<=.34);const y=v.target.y;nav.pan(new T.Vector3(0,sign*100,0));assert.equal(nav.update().target.y,y,'Vertical pan is not locked');}
nav.reset();const before=nav.update().pitch;nav.preset('top');nav.preset('low');assert.equal(nav.update().pitch,before,'Removed vertical presets still work');

// Drawer toggles move their actual tray and all contents, then remain open.
const drawerEntries=[...actions.entries.values()].filter(entry=>entry.kind==='drawer');
assert.equal(drawerEntries.length,2);
for(const entry of drawerEntries){
  const closed=entry.object.position.z,children=entry.object.children.map(o=>o.position.clone());
  actions.trigger(entry.id);for(let i=0;i<100;i++){actions.restore();actions.update(.05);}
  assert.ok(Math.abs(entry.object.position.z-closed-entry.travel)<.001,'Drawer must slide out fully');
  assert.equal(entry.object.userData.drawerOpen,true);actions.restore();actions.clear();
  assert.ok(Math.abs(entry.object.position.z-closed-entry.travel)<.001,'Open drawer persists after pause and view changes');
  assert.ok(entry.object.children.length>15,'A drawer includes an interior and real contents');
  entry.object.children.forEach((o,i)=>assert.ok(o.position.equals(children[i]),'Contents remain attached to the tray'));
  actions.trigger(entry.id);for(let i=0;i<100;i++)actions.update(.05);
  assert.ok(Math.abs(entry.object.position.z-closed)<.001,'Second click closes the same drawer');
  actions.trigger(entry.id);actions.update(.01,false);assert.equal(entry.object.position.z,closed+entry.travel,'Reduced motion still opens drawers');
  actions.trigger(entry.id);actions.clear();assert.equal(entry.object.position.z,closed);
}

// Convex outlines include fringe, and are measured after the parent transforms.
const polygons=[];const main=room.group.getObjectByName('Burgundy botanical desk rug'),b=new T.Box3().setFromObject(main);
polygons.push([[b.min.x-.02,b.min.z-.1],[b.max.x+.02,b.min.z-.1],[b.max.x+.02,b.max.z+.1],[b.min.x-.02,b.max.z+.1]]);
room.group.traverse(o=>{if(o.userData.rug){const {radius,aspect}=o.userData.rug;polygons.push(Array.from({length:64},(_,i)=>{const a=i*Math.PI/32,v=o.localToWorld(new T.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius*aspect));return[v.x,v.z];}));}});
function separated(a,b){for(const poly of [a,b])for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],axis=[q[1]-p[1],p[0]-q[0]],dot=v=>v[0]*axis[0]+v[1]*axis[1],aa=a.map(dot),bb=b.map(dot);if(Math.max(...aa)<Math.min(...bb)-.0001||Math.max(...bb)<Math.min(...aa)-.0001)return true;}return false;}
assert.equal(polygons.length,5);for(let i=0;i<polygons.length;i++)for(let j=i+1;j<polygons.length;j++)assert.ok(separated(polygons[i],polygons[j]),'Rugs intersect, including fringe: '+i+'/'+j);

for(const {onLoad} of requests)onLoad?.(new T.Texture());
let feathers=0,petals=0;room.group.traverse(o=>{if(!o.isMesh)return;const m=o.material,key=m.userData.surface?.key;if(key==='feather'||key==='petal'){assert.ok(m.map&&m.bumpMap,'Missing generated albedo or relief');assert.equal(m.bumpMap.colorSpace,T.NoColorSpace);if(key==='feather')feathers+=o.count||1;else petals+=o.count||1;}});
assert.ok(feathers>30&&petals>10);
const day=getRoomTime(new Date(2026,8,9,12)),night=getRoomTime(new Date(2026,8,9,23));assert.ok(day.ambientIntensity/night.ambientIntensity>2.8&&day.hemisphereIntensity/night.hemisphereIntensity>3.4&&day.softwareGain/night.softwareGain>1.8);
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(!html.includes('zoom-level')&&!html.includes('data-view="top"')&&!html.includes('data-view="low"'));
console.log(JSON.stringify({result:'PASS',objects:actions.entries.size,animatedActions:tested,closeUpViews:focusChecks,rugPairs:10,checks:['Every clickable object retains geometry after batching','Two drawers open and close with contents; open state persists through pause','Object-specific effects change only owned parts and restore exactly','Desktop/portrait close-ups remain inside the room and outside the object','Vertical pan and large pitch changes are restricted','All five rugs including fringes are pairwise disjoint','Generated feather and petal color/relief maps load; large day/night contrast','No displayed zoom level or upper/lower preset']},null,2));
