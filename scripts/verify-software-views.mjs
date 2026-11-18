// Render the shipped Blender meshes, including their embedded image pixels, without WebGL.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as T from '../js/vendor/three.module.min.js';
import { loadBlenderAsset } from '../scene/blender-assets.js';
import { createBlenderRoom } from '../scene/blender-room.js';
import { createBlenderCat } from '../scene/blender-cat.js';
import { createRegionalLandscape } from '../scene/place-settings.js';
import { createWorldLandmarks } from '../scene/world-landmarks.js';
import { createMeshRaster } from '../scene/mesh-raster.js';
import { OUTDOOR_VIEWS, HOME, regionalHeight, worldFov } from '../scene/world-layout.js';
import { loadTabbyFixture } from './helpers/load-tabby-fixture.mjs';
import { compareFrames, frameDetail, reviewViews, saveComparison } from './helpers/visual-comparison.mjs';

const width=720, height=480;
const output=process.env.REVIEW_OUTPUT && join(process.env.REVIEW_OUTPUT,'cpu-raster');
const directory=new URL('../assets/models/blender/',import.meta.url);
globalThis.self=globalThis;
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return createCanvas(1,1);}};
globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
const browserFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(url instanceof URL && url.protocol==='file:')return new Response(await readFile(url));
  return browserFetch(url,options);
};

// The shared Node Draco reader decodes the production triangle buffers. Its
// small fixture textures must be replaced by the actual embedded image bytes.
async function loadRegionAsset(key){
  const asset=await loadTabbyFixture(new URL(key+'.glb',directory));
  const maps=new Set();
  asset.scene.traverse(node=>{
    for(const material of [].concat(node.material||[]))
      for(const value of Object.values(material))if(value?.isTexture)maps.add(value);
  });
  const decoded=new Map();
  for(const map of maps){
    const index=map.userData.sourceIndex;
    assert.ok(Number.isInteger(index),'Embedded regional texture identifies its image');
    if(!decoded.has(index)){
      const image=asset.parser.json.images[index];
      const contents=await asset.parser.getDependency('bufferView',image.bufferView);
      decoded.set(index,await loadImage(Buffer.from(contents)));
    }
    map.image=decoded.get(index);map.needsUpdate=true;
    assert.ok(map.image.width>1);
  }
  return {...asset,dispose(){}};
}

function meshes(root){
  const result=[];root.traverse(node=>{if(node.isMesh)result.push(node);});return result;
}
function triangleCount(parts){
  return parts.reduce((total,{geometry})=>total+(geometry.index?.count ?? geometry.attributes.position.count)/3,0);
}
function materialNames(parts){
  return [...new Set(parts.flatMap(part=>[].concat(part.material).map(material=>material.name)))].sort();
}
function modelProportions(model){
  const copy=model.clone();
  copy.rotation.set(0,0,0);
  const size=new T.Box3().setFromObject(copy).getSize(new T.Vector3());
  return size.divideScalar(size.length()).toArray();
}
function activeTextures(scene){
  const images=new Set();
  scene.traverseVisible(node=>{
    for(const mat of [].concat(node.material||[]))if(mat.map)images.add(mat.map.image);
  });
  let byteCount=0;
  for(const image of images){
    assert.ok(image?.width>1&&image.height>1,'Materials have real decoded pixels');
    const scale=Math.min(1,2048/Math.max(image.width,image.height));
    let w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
    while(true){byteCount+=w*h*4;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}
  }
  return {count:images.size,bytes:byteCount};
}

const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,width/height,.035,700);
scene.background=new T.Color('#b4c9d5');
scene.add(new T.HemisphereLight(0xffffff,0x8c7865,1.15));
const sun=new T.DirectionalLight(0xffe4bd,2.6);sun.position.set(-38,55,-12);scene.add(sun,sun.target);
const room=await createBlenderRoom(T);
scene.add(room.group);
await room.loadMiniatures();
room.attachCat(await createBlenderCat(T,{load:loadBlenderAsset}));
const canvas=createCanvas(width,height);canvas.dataset={};
const raster=createMeshRaster(canvas);raster.setSize(width,height);
const checker=createCanvas(257,157),ink=checker.getContext('2d');
ink.fillStyle='#bd7c33';ink.fillRect(0,0,257,157);ink.fillStyle='#2d423c';
for(let x=0;x<257;x+=3)ink.fillRect(x,0,1,157);
const identical=compareFrames(checker,await loadImage(await checker.encode('png')));
assert.equal(identical.meanRgbError,0);assert.equal(identical.luminanceCorrelation,1);

let region,terrain,architecture;
const results=[];
for(const key of reviewViews){
  const view=OUTDOOR_VIEWS[key],home=key==='desk';
  let subject;
  room.group.visible=home;
  if(view && region!==view.region){
    terrain?.group.removeFromParent();terrain?.dispose();
    architecture?.group.removeFromParent();architecture?.dispose();
    region=view.region;
    [terrain,architecture]=await Promise.all([
      createRegionalLandscape(T,region,{loadAsset:loadRegionAsset}),createWorldLandmarks(T,{region})
    ]);
    scene.add(terrain.group,architecture.group);
  }
  if(home){
    camera.position.fromArray(HOME.seated.position);
    camera.lookAt(...HOME.seated.target);camera.fov=worldFov(width/height,true);
    subject=room.group.getObjectByName('WritingDesk');
  }else{
    const [x,z]=view.eye;
    camera.position.set(x,HOME.eyeHeight+regionalHeight(region,x,z),z);
    camera.lookAt(...view.target);camera.fov=view.fov;
    terrain.update(camera.position);
    subject=architecture.targets.find(t=>t.id==='landmark-'+key).object;
    const miniature=room.group.getObjectByName('desk-'+key);
    const actual=meshes(subject),small=meshes(miniature);
    assert.ok(actual.length>=4 && small.length>=4,key+' has modelled parts at both scales');
    assert.ok(triangleCount(small)<triangleCount(actual),key+' uses fewer triangles at desk scale');
    assert.deepEqual(materialNames(small),materialNames(actual),key+' retains the authored material palette at both scales');
    const originalProportions=modelProportions(subject);
    modelProportions(miniature).forEach((proportion,axis)=>{
      assert.ok(Math.abs(proportion-originalProportions[axis])<.015,key+' preserves model proportions at desk scale');
    });
    const size=new T.Box3().setFromObject(subject).getSize(new T.Vector3());
    assert.ok(Math.min(size.x,size.y,size.z)>1,key+' occupies all three dimensions');
  }
  camera.updateProjectionMatrix();
  const textures=activeTextures(scene),drawMs=[];
  function render(){
    const start=performance.now();raster.render(scene,camera);drawMs.push(Math.round(performance.now()-start));
    const shot=createCanvas(width,height);shot.getContext('2d').drawImage(canvas,0,0);return shot;
  }
  const arrival=render(),stats={...raster.info.render},detail=frameDetail(arrival);
  subject.visible=false;const without=render();subject.visible=true;
  const subjectChange=compareFrames(arrival,without);
  assert.ok(subjectChange.meanRgbError>1,key+' subject changes actual arrival pixels');
  camera.translateX(home?.24:1.2);
  const side=render(),sideRotation=camera.quaternion.clone();
  camera.rotateOnWorldAxis(new T.Vector3(0,1,0),.39);const turned=render();
  const shift=compareFrames(arrival,side),look=compareFrames(side,turned),offAxis=frameDetail(turned);
  assert.ok(stats.calls>=8 && stats.triangles>1000,key+' submits physical scene meshes');
  assert.ok(detail.colors>2200 && offAxis.colors>1500,key+' retains coloured detail off-axis');
  assert.ok(shift.meanRgbError>1.5 && look.meanRgbError>4,key+' moves under independent translation and rotation');
  assert.ok(textures.count>=2 && textures.bytes<=48*1024*1024,key+' decoded colour maps fit the 48 MiB district budget');
  const surround=[];
  if(!home)for(const [name,angle] of [['right',-Math.PI/2],['rear',Math.PI]]){
    camera.quaternion.copy(sideRotation);camera.rotateOnWorldAxis(new T.Vector3(0,1,0),angle);
    const image=render();
    assert.ok(raster.info.render.calls>=3 && frameDetail(image).meanNeighbourDifference>.5,key+' has visible surroundings in its '+name+' street view');
    surround.push({name,label:name+' street view',image});
  }
  // Record warmed walking frames at the same reduced resolution used in past reviews.
  raster.setSize(450,300);
  const timings=[];
  for(let tick=0;tick<7;tick++){
    camera.quaternion.copy(sideRotation);camera.rotateOnWorldAxis(new T.Vector3(0,1,0),.025*tick);
    const start=performance.now();raster.render(scene,camera);
    if(tick>0)timings.push(performance.now()-start);
  }
  timings.sort((a,b)=>a-b);
  const movingRaster={width:450,height:300,medianMs:Math.round((timings[2]+timings[3])/2),maxMs:Math.round(timings.at(-1))};
  raster.setSize(width,height);
  const report={key,drawCalls:stats.calls,triangles:stats.triangles,textures,subjectChange,detail,offAxis,shift,look,drawMs,movingRaster};
  console.log(JSON.stringify(report));results.push(report);
  await saveComparison(output,key,[{name:'arrival',label:'CPU / Blender scene',image:arrival},
    {name:'side',label:'Lateral translation',image:side},{name:'turn',label:'Translated and turned',image:turned},...surround]);
}
terrain?.dispose();architecture?.dispose();room.dispose();raster.dispose();
if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'metrics.json'),JSON.stringify({results},null,2)+'\n');}
