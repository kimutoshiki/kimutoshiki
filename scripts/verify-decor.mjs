import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import {createRoom} from '../scene/room-model.js';
import {createDeskLandmarks} from '../scene/desk-landmarks.js';
import {PHOTO_CATALOG} from '../scene/photo-catalog.js';

const ctx=new Proxy({}, {get(o,k){if(k==='createImageData'||k==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});if(k==='measureText')return text=>({width:text.length*10});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({width:1280,height:800,getContext:()=>ctx})};
const requests=[];
T.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){requests.push({url,onLoad,onError});return new T.Texture();};
let refreshed=0;
const room=createRoom(T,{onTextureLoad(){refreshed++;}}),landmarks=await createDeskLandmarks(T);
room.group.add(landmarks.group);room.group.updateMatrixWorld(true);
const {group,update,dispose}=room.decorations,stats=group.userData.decorStats;
assert.ok(stats.triangles<150000,'Original decor stays within the lighter geometry budget');
assert.ok(stats.drawCalls<220,'Repeated ornaments remain batched');
const bounds=new T.Box3().setFromObject(group);
assert.ok(bounds.min.x>=-6.48&&bounds.max.x<=6.48&&bounds.min.y>=-.04&&bounds.max.y<=6.45&&bounds.min.z>=-1.51&&bounds.max.z<=9.37,'Decor stays inside the physical room envelope');
assert.ok(!room.group.getObjectByName('Hanging pleated paper light'),'The central light must not cover the navigation');
assert.ok(room.group.getObjectByName('Atlas · brass and charcoal inlay'),'The atlas is an original light geometry motif');
room.group.traverse(o=>assert.ok(!/Framed original botanical print|Fine botanical wallcoverings/.test(o.name),'Old filler artwork and patterned wallpaper are removed'));
assert.ok(!requests.some(r=>/botanical-wallpaper|botanical-berries|songbird-print|moon-garden|pear-blossom/.test(r.url)),'Retired art is never requested');

const photos=room.photoWall.frames;
assert.equal(PHOTO_CATALOG.length,30,'Every supplied photograph, including the raw photograph, is catalogued');
assert.equal(photos.length,PHOTO_CATALOG.length);
assert.equal(new Set(photos.map(p=>p.photo.id)).size,PHOTO_CATALOG.length);
const frameBounds=[];
for(const {photo,frame,image} of photos){
  assert.ok(Math.abs(image.scale.x/image.scale.y-photo.width/photo.height)<1e-9,'Source aspect ratio must be preserved: '+photo.id);
  assert.equal(image.userData.targetId,'photo-'+photo.id);
  assert.ok(room.targets.some(target=>target.id===image.userData.targetId&&target.object===frame));
  const b=new T.Box3().setFromObject(frame);frameBounds.push({b,photo});
  assert.ok(b.min.x> -6.48&&b.max.x<6.48&&b.min.y>1.4&&b.max.y<6.0&&b.min.z> -1.50&&b.max.z<9.35,'Frame must remain inside the wall surface: '+photo.id);
  const content=await readFile(new URL('..'+photo.src,import.meta.url));
  assert.equal(content.toString('ascii',0,4),'RIFF');assert.equal(content.toString('ascii',8,12),'WEBP');
}
for(let i=0;i<frameBounds.length;i++)for(let j=i+1;j<frameBounds.length;j++)assert.ok(!frameBounds[i].b.intersectsBox(frameBounds[j].b),'Photo frames overlap: '+frameBounds[i].photo.id+' / '+frameBounds[j].photo.id);
const allMeshes=[];room.group.traverse(o=>{if(o.isMesh)allMeshes.push(o);});
const seatedPosition=new T.Vector3(0,3.55,8.95);
for(const {photo,image} of photos.filter(frame=>frame.priority)){
  const point=image.getWorldPosition(new T.Vector3()),ray=new T.Raycaster(seatedPosition,point.clone().sub(seatedPosition).normalize());
  assert.equal(ray.intersectObjects(allMeshes,false)[0]?.object.userData.targetId,'photo-'+photo.id,'A front photograph is blocked from the desk view: '+photo.id);
}
const clockBounds=new T.Box3().setFromObject(room.clock.group);
assert.ok(clockBounds.getSize(new T.Vector3()).x>1.6&&clockBounds.min.y>3.9,'Clock is a substantial elevated wall object');

// Only two image requests run at once, and five front images gate readiness.
const journeyRequests=()=>requests.filter(request=>request.url.includes('/images/journeys/'));
assert.equal(journeyRequests().length,2);assert.equal(photos.filter(frame=>frame.queued).length,5);
let completed=0;
function completeRequests(){while(completed<requests.length){requests[completed++].onLoad?.(new T.Texture());}}
completeRequests();await room.photoWall.ready;
assert.equal(room.photoWall.frontProgress,1);assert.equal(room.photoWall.photosLoaded,5);assert.equal(journeyRequests().length,5);
for(const frame of photos.filter(frame=>frame.loaded)){
  assert.equal(frame.image.material.map.colorSpace,T.SRGBColorSpace);
  assert.deepEqual(frame.image.material.map.repeat.toArray(),[1,1],'Textures are never stretched or cropped through UV transforms');
}
const camera=new T.PerspectiveCamera(40,1.2,.025,80);camera.position.set(0,3.55,5.5);camera.lookAt(-6.3,3.55,5.5);camera.updateMatrixWorld();
room.photoWall.update(camera);const additional=journeyRequests().length;
assert.equal(additional,7,'Turning toward a new wall starts two additional loads');
room.photoWall.update(camera);assert.equal(journeyRequests().length,additional,'An unchanged view does not duplicate loads');
completeRequests();assert.ok(room.photoWall.photosLoaded>5&&room.photoWall.photosLoaded<30,'Only the revealed wall is decoded');

const pendulum=group.getObjectByName('Hanging brass ornaments');
assert.ok(pendulum.children.some(o=>o.isMesh),'Animated geometry stays inside its moving parent');
update(0);const start=pendulum.quaternion.clone();update(2);assert.ok(start.angleTo(pendulum.quaternion)>.001);
const held=pendulum.quaternion.clone();update(2);assert.ok(held.angleTo(pendulum.quaternion)<1e-7,'Paused motion time keeps ornaments still');
const rug=room.group.getObjectByName('Burgundy botanical desk rug'),uv=rug.geometry.attributes.uv,normal=rug.geometry.attributes.normal;
for(let i=0;i<uv.count;i++)if(Math.abs(normal.getY(i))>.5)assert.ok(uv.getX(i)>=-.001&&uv.getX(i)<=1.001&&uv.getY(i)>=-.001&&uv.getY(i)<=1.001,'Rug image is not tiled over itself');
const decorRequests=requests.filter(r=>r.url.includes('/images/decor/'));assert.equal(decorRequests.length,4,'Only textile surfaces remain external decor images');
let bytes=0;for(const request of decorRequests){const content=await readFile(new URL(request.url));assert.equal(content.toString('ascii',0,4),'RIFF');bytes+=content.length;}
assert.ok(bytes<700000,'Remaining decor transfer stays modest');
const beforeDispose=refreshed;dispose();room.photoWall.dispose();
const late=new T.Texture();let released=0;late.addEventListener('dispose',()=>released++);decorRequests[0].onLoad(late);
assert.equal(refreshed,beforeDispose);assert.equal(released,1,'Late texture responses are released after leaving the page');
console.log(JSON.stringify({result:'PASS',photos:photos.length,initialPhotoRequests:5,triangles:stats.triangles,drawCalls:stats.drawCalls,decorImageBytes:bytes,checks:['Thirty real uncropped photographs and individually selectable titled frames','No frame intersections, all inside room; five featured photos have clear seated sightlines','Front photographs first, two concurrent loads, other walls only as revealed','Large wall clock, original atlas inlay, no filler frames or central pendant','Batched ornaments, paused motion, limited textile downloads and late-response disposal']},null,2));
