import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import {createRoom} from '../scene/room-model.js';
import {createDeskLandmarks} from '../scene/desk-landmarks.js';
import {createOrbitNavigation} from '../scene/orbit-navigation.js';

const ctx=new Proxy({}, {get(o,k){if(k==='createImageData'||k==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});if(k==='measureText')return text=>({width:text.length*10});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({width:1280,height:800,getContext:()=>ctx})};
const requests=[];T.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){requests.push({url,onLoad,onError});return new T.Texture();};
let refreshed=0;
const room=createRoom(T,{onTextureLoad(){refreshed++;}}),landmarks=await createDeskLandmarks(T);room.group.add(landmarks.group);room.group.updateMatrixWorld(true);
const {group,update,dispose}=room.decorations,stats=group.userData.decorStats;
assert.ok(stats.instances>1400,'Collected objects must survive batching');
assert.ok(stats.triangles<180000,'Small ornaments should not use full-size sphere tessellation');
assert.ok(stats.drawCalls<200,'Repeated small objects must share draw batches');
assert.equal(new Set(stats.collections.map(c=>c.category)).size,6,'Decor reaches the floor, ceiling and every wall');
const bounds=new T.Box3().setFromObject(group);
assert.ok(bounds.min.x>=-6.48&&bounds.max.x<=6.48&&bounds.min.y>=-.04&&bounds.max.y<=6.45&&bounds.min.z>=-1.51&&bounds.max.z<=9.37,'Decor stays inside the physical room envelope');
const slim=stats.collections.find(c=>c.name==='Tall narrow collection cabinet');assert.ok(slim.min[1]<-.02,'Collection cabinet feet must reach the floor');
const cabinets=stats.collections.filter(c=>c.name.includes('cubby'));
const galleries=stats.collections.filter(c=>c.name.includes('collected art gallery'));
for(let i=0;i<2;i++)assert.ok(cabinets[i].max[2]<galleries[i].min[2],'Gallery shelf must not pass through the cubby cabinet');
// New decorations may sit behind content, never across the initial content rays.
const view=createOrbitNavigation(T,room.envelope.bounds).update(),objects=[];group.traverse(o=>{if(o.isMesh)objects.push(o);});
const cat=room.group.getObjectByName('Sleeping marmalade cat');
const anchors=[...room.targets,...landmarks.targets,{id:'cat',anchor:new T.Box3().setFromObject(cat).getCenter(new T.Vector3())}];
for(const target of anchors){const delta=target.anchor.clone().sub(view.position),ray=new T.Raycaster(view.position,delta.clone().normalize(),0,delta.length()-.03);assert.equal(ray.intersectObjects(objects,false).length,0,'Decoration obstructs '+target.id);}
const pendulum=group.getObjectByName('Hanging brass ornaments');assert.ok(pendulum.children.some(o=>o.isMesh),'Animated geometry must remain inside its moving parent');
update(0);const start=pendulum.quaternion.clone();update(2);assert.ok(start.angleTo(pendulum.quaternion)>.001,'Brass mobile must visibly move');const held=pendulum.quaternion.clone();update(2);assert.ok(held.angleTo(pendulum.quaternion)<1e-7,'A paused animation time must keep decorations still');
const rug=room.group.getObjectByName('Burgundy botanical desk rug'),uv=rug.geometry.attributes.uv,normal=rug.geometry.attributes.normal;
for(let i=0;i<uv.count;i++)if(Math.abs(normal.getY(i))>.5){assert.ok(uv.getX(i)>=-.001&&uv.getX(i)<=1.001&&uv.getY(i)>=-.001&&uv.getY(i)<=1.001,'Rug artwork must appear once instead of repeating across the box');}
const decorRequests=requests.filter(r=>r.url.includes('/images/decor/'));assert.equal(decorRequests.length,9);
for(const request of decorRequests){const texture=new T.Texture();request.onLoad(texture);}
assert.equal(refreshed,9,'Loaded generated images refresh the scene');
dispose();const late=new T.Texture();let released=0;late.addEventListener('dispose',()=>released++);decorRequests[0].onLoad(late);assert.equal(refreshed,9);assert.equal(released,1,'Late images must be released after leaving the page');
let bytes=0;const files=await readdir(new URL('../images/decor/',import.meta.url));
assert.equal(files.length,9);
for(const file of files){const content=await readFile(new URL('../images/decor/'+file,import.meta.url));assert.equal(content.toString('ascii',0,4),'RIFF');assert.equal(content.toString('ascii',8,12),'WEBP');bytes+=content.length;}
assert.ok(bytes<1100000,'Decor image transfer stays below 1.1 MB');
console.log(JSON.stringify({result:'PASS',checks:['Dense 3D collections remain efficiently batched and inside the room','New furniture and art preserve all initial content sightlines','Independent mobile animation and paused pose','One complete rug image, nine image refreshes and late disposal','Nine valid generated WebP materials below 1.1 MB'],instances:stats.instances,triangles:stats.triangles,drawCalls:stats.drawCalls,animatedGroups:stats.animatedGroups,imageBytes:bytes},null,2));
