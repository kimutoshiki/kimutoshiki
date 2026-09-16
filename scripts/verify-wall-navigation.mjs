import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import {createRoom} from '../scene/room-model.js';
import {createWallNavigation,WALL_LINKS} from '../scene/wall-navigation.js';
import {createOrbitNavigation} from '../scene/orbit-navigation.js';
import {loadSurfaceMaterials} from '../scene/surface-materials.js';

// Only image I/O and canvas painting are stubbed. Real room geometry, atlas
// planes, material preparation, navigation, projection and raycasts are used.
const ctx=new Proxy({}, {get(o,k){
  if(k==='createImageData'||k==='getImageData')return(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
  if(k==='measureText')return text=>({width:text.length*10});
  return o[k]??(()=>{});
},set(o,k,v){o[k]=v;return true;}});
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({width:1536,height:1024,getContext:()=>ctx})};
const requests=[];
T.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){requests.push({url,onLoad,onError});return new T.Texture();};
const room=createRoom(T),menu=createWallNavigation(T,{room:room.group});
const surfaces=loadSurfaceMaterials(T,room.group);
room.group.updateMatrixWorld(true);
const meshes=[];room.group.traverse(object=>{if(object.isMesh)meshes.push(object);});
const navigation=createOrbitNavigation(T,room.envelope.bounds);
const seat=navigation.update().position.clone();
const ray=new T.Raycaster();let testedRays=0;
function physicalHits(){
  const hits=[];
  // Decorative maps intentionally opt out of pointer picking. They still
  // occlude pixels, so use each mesh type's physical raycast for this check.
  for(const mesh of meshes)(mesh.isInstancedMesh?T.InstancedMesh:T.Mesh).prototype.raycast.call(mesh,ray,hits);
  return hits.sort((a,b)=>a.distance-b.distance);
}
function solid(hit){
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  return material.visible!==false&&(!material.transparent||material.opacity>=.2);
}
assert.equal(menu.targets.length,5);
for(const target of menu.targets){
  const paper=target.object,geometry=paper.geometry,positions=geometry.attributes.position,uv=geometry.attributes.uv;
  assert.equal(paper.userData.targetId,target.id);
  assert.equal(paper.material.roughness,.93);
  assert(paper.castShadow&&paper.receiveShadow);
  for(let i=0;i<uv.count;i++){
    assert(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1,'UV remains inside the exact supplied image');
  }
  // Every rendered triangle must be in front of the atlas, plaster, and any
  // furniture. A center-only test misses the tape and folded paper corner.
  const index=geometry.index;
  for(let i=0;i<index.count;i+=3){
    const point=new T.Vector3();
    for(let v=0;v<3;v++)point.add(new T.Vector3().fromBufferAttribute(positions,index.getX(i+v)));
    point.multiplyScalar(1/3).applyMatrix4(paper.matrixWorld);
    ray.set(seat,point.clone().sub(seat).normalize());ray.far=seat.distanceTo(point)+.03;
    const hit=physicalHits().find(solid);
    assert.ok(hit?.object===paper,`Wall label ${target.key}, triangle ${i/3} is blocked by ${hit?.object?.name||hit?.object?.parent?.name||'unknown geometry'}`);
    testedRays++;
  }
  // The bitmap's former opaque photographic background has no mesh to hit.
  const empty=paper.localToWorld(new T.Vector3(.64,.26,0));
  ray.set(seat,empty.clone().sub(seat).normalize());ray.far=seat.distanceTo(empty)+.01;
  assert.equal(ray.intersectObject(paper,false).length,0,'Studio background must be excluded by the paper silhouette');
}
const title=menu.group.getObjectByName('A name quietly lettered on the wall');
assert(title);
const titlePoint=title.getWorldPosition(new T.Vector3());
ray.set(seat,titlePoint.clone().sub(seat).normalize());ray.far=seat.distanceTo(titlePoint)-.002;
assert.equal(physicalHits().filter(solid).length,0,'The wall atlas must not cover the title');

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const markup=[...html.matchAll(/<a\b([^>]*\bdata-wall-link="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g)];
assert.equal(markup.length,5,'Exactly five real HTML navigation links remain available');
for(const [all,attributes,key,content] of markup){
  const expected=WALL_LINKS.find(link=>link.id===key);assert(expected);
  assert.equal(attributes.match(/\bhref="([^"]+)"/)?.[1],expected.href,'Link goes to its corresponding standalone page');
  assert(attributes.includes('aria-label=')&&content.includes(expected.label),'Links have a readable keyboard/screen-reader label');
  assert(!attributes.includes('data-room-open')&&!attributes.includes('tabindex="-1"'),'Links navigate normally and are keyboard reachable');
}
const rectangles=[];
for(const [width,height] of [[1280,720],[390,844],[320,568]]){
  navigation.resize(width/height<.85,width/height);const view=navigation.update();
  const camera=new T.PerspectiveCamera(50,width/height,.025,80);camera.position.copy(view.position);camera.zoom=view.zoom;camera.lookAt(view.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const anchors=new Map(WALL_LINKS.map(link=>[link.id,{style:{},classList:{toggle(){}}}]));
  const container={querySelector:selector=>anchors.get(selector.match(/"(.*?)"/)[1])};
  menu.update(camera,container,width,height);
  for(const [id,link] of anchors){
    const x=parseFloat(link.style.left),y=parseFloat(link.style.top),w=parseFloat(link.style.width),h=parseFloat(link.style.height);
    assert.equal(link.style.visibility,'visible');assert.equal(link.tabIndex,0);
    assert(x>=0&&y>=0&&x+w<=width&&y+h<=height,'Entire label stays on screen at '+width+'px');
    assert(w>=60&&h>=20,'Projected mobile links retain useful physical size');
    assert(link.style.clipPath.startsWith('polygon(')&&!link.style.clipPath.includes('NaN'),'Accessible hit area follows the physical paper silhouette');
    rectangles.push({viewport:width+'x'+height,id,width:Math.round(w),height:Math.round(h)});
  }
  menu.update(camera,container,width,height,{hidden:true});
  for(const link of anchors.values()){assert.equal(link.style.visibility,'hidden');assert.equal(link.tabIndex,-1);}
}
const labelRequests=requests.filter(request=>request.url.includes('/images/navigation/'));
assert.equal(labelRequests.length,5);
for(const request of labelRequests){
  const bytes=await readFile(new URL('..'+request.url,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  request.onLoad(new T.Texture());
}
await menu.ready;assert.equal(menu.progress,1);
menu.dispose();surfaces.dispose();room.photoWall.dispose();
console.log(JSON.stringify({result:'PASS',physicalVisibilityRays:testedRays,rectangles,checks:['Every physical label triangle is visible in front of the real room and atlas','Original image UVs and background-excluding paper/tape silhouette','Unobstructed wall title','Five standalone HTML links with keyboard names and projected hit areas','Desktop, mobile and small-mobile bounds; hidden inspection state','Valid supplied WebP assets, readiness and disposal']},null,2));
