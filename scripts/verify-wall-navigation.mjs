import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import {createRoom} from '../scene/room-model.js';
import {createWallNavigation,WALL_LINKS,WALL_TITLE} from '../scene/wall-navigation.js';
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
const title=menu.group.getObjectByName('Supplied bronze wall title');
assert(title);
assert.equal(title.visible,false,'No opaque placeholder appears while the alpha title loads');
assert(title.material.transparent&&!title.material.depthWrite&&!title.castShadow,'The image must not turn its transparent border into a wall rectangle');
const titleBounds=new T.Box3().setFromObject(title);
assert(titleBounds.max.y<5.95,'The artwork fits below the ceiling trim');
assert(titleBounds.min.y>Math.max(...menu.targets.map(t=>new T.Box3().setFromObject(t.object).max.y))+.025,'The title has clear space above the upper paper labels');
const titleSize=titleBounds.getSize(new T.Vector3());
assert(Math.abs(titleSize.x/titleSize.y-WALL_TITLE.crop.width/WALL_TITLE.crop.height)<.00001,'The supplied artwork keeps its aspect ratio');
assert(titleSize.y>.4&&titleSize.x>2.79,'The visible artwork is substantially larger than the old small wall text');
for(const x of [titleBounds.min.x+.015,0,titleBounds.max.x-.015])for(const y of [titleBounds.min.y+.015,titleBounds.max.y-.015]){
  const point=new T.Vector3(x,y,WALL_TITLE.z);
  ray.set(seat,point.clone().sub(seat).normalize());ray.far=seat.distanceTo(point)-.002;
  assert.equal(physicalHits().filter(solid).length,0,'The wall atlas or cornice must not cover the supplied title');
}

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
assert.equal(labelRequests.length,6);
let readyResolved=false;menu.ready.then(()=>{readyResolved=true;});
for(const request of labelRequests.filter(request=>request.url!==WALL_TITLE.src)){
  const bytes=await readFile(new URL('..'+request.url,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  request.onLoad(new T.Texture());
}
await Promise.resolve();assert.equal(readyResolved,false,'Readiness waits for the supplied title, not just the five labels');assert.equal(menu.progress,5/6);
const titleBytes=await readFile(new URL('..'+WALL_TITLE.src,import.meta.url));
let lossless;
for(let offset=12;offset+8<titleBytes.length;){const length=titleBytes.readUInt32LE(offset+4);if(titleBytes.toString('ascii',offset,offset+4)==='VP8L')lossless=titleBytes.subarray(offset+8,offset+8+length);offset+=8+length+(length%2);}
assert(lossless,'The title uses lossless WebP, not a lossy rewrite');assert.equal(lossless[0],0x2f);
const dimensions=lossless.readUInt32LE(1);
assert.equal((dimensions&0x3fff)+1,2172);assert.equal(((dimensions>>>14)&0x3fff)+1,724);assert.equal((dimensions>>>28)&1,1,'Original alpha channel is preserved');
const titleTexture=new T.Texture();let titleDisposed=false;titleTexture.addEventListener('dispose',()=>{titleDisposed=true;});
labelRequests.find(request=>request.url===WALL_TITLE.src).onLoad(titleTexture);
await menu.ready;assert.equal(menu.progress,1);
assert(title.visible&&title.material.map===titleTexture);assert.equal(titleTexture.colorSpace,T.SRGBColorSpace);
menu.dispose();assert(titleDisposed,'The full-resolution title is released with the room');
const failureStart=requests.length,failedMenu=createWallNavigation(T),failedTitle=failedMenu.group.getObjectByName('Supplied bronze wall title');
for(const request of requests.slice(failureStart)){if(request.url===WALL_TITLE.src)request.onError(new Error('offline'));else request.onLoad(new T.Texture());}
await failedMenu.ready;assert.equal(failedMenu.progress,1);assert.equal(failedTitle.visible,false);assert.equal(failedTitle.userData.wallTitle.state,'failed');failedMenu.dispose();
const lateStart=requests.length,lateMenu=createWallNavigation(T);lateMenu.dispose();const lateTexture=new T.Texture();let releasedLate=false;lateTexture.addEventListener('dispose',()=>{releasedLate=true;});requests.slice(lateStart).find(request=>request.url===WALL_TITLE.src).onLoad(lateTexture);assert(releasedLate,'A title arriving after disposal is released immediately');
surfaces.dispose();room.photoWall.dispose();
console.log(JSON.stringify({result:'PASS',physicalVisibilityRays:testedRays,rectangles,title:{sourcePixels:[2172,724],lossless:true,alpha:true,width:Number(titleSize.x.toFixed(3)),height:Number(titleSize.y.toFixed(3))},checks:['Every physical label triangle is visible in front of the real room and atlas','Original image UVs and background-excluding paper/tape silhouette','Unobstructed full-resolution alpha title with preserved aspect and spacing','Five standalone HTML links with keyboard names and projected hit areas','Desktop, mobile and small-mobile bounds; hidden inspection state','Title-aware readiness, failed-load fallback and safe late-load disposal']},null,2));
