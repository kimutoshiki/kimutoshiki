// Decode the production atlases and rasterize physical depth without a browser
// or GPU. Optional review output includes the actual unlabelled RGB frames.
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { OUTDOOR_VIEWS, regionalHeight, HOME } from '../scene/world-layout.js';
import { geometry, perspective } from '../js/software-renderer.js';
import { decodeSoftwareTexture } from '../js/software-textures.js';
import { buildSoftwareDesk, SOFTWARE_SEAT } from '../js/software-desk.js';
import { buildSoftwareGarden, SOFTWARE_PLACES } from '../js/software-garden.js';
import { reviewViews, sourceAsset, compareFrames, compareSubject, frameDetail, saveComparison } from './helpers/visual-comparison.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.REVIEW_OUTPUT && join(process.env.REVIEW_OUTPUT,'cpu-raster');
const width=720,height=480, desk=geometry(), garden=geometry();
buildSoftwareDesk(desk);buildSoftwareGarden(garden);
// An in-memory render and an identical lossless file use the same sampling
// filter. Renderer/source registration must never measure a decoder difference.
const checker=createCanvas(257,157), ink=checker.getContext('2d');
ink.fillStyle='#bd7c33';ink.fillRect(0,0,checker.width,checker.height);ink.fillStyle='#2d423c';
for(let x=0;x<checker.width;x+=3)ink.fillRect(x,0,1,checker.height);
const identical=compareFrames(checker,await loadImage(await checker.encode('png')));
assert.equal(identical.meanRgbError,0);
assert.equal(identical.luminanceCorrelation,1);

const failures=[], results=[];
for (const key of reviewViews) {
  const home=key==='desk', model=home?desk:garden;
  const place=home?SOFTWARE_SEAT:SOFTWARE_PLACES['landmark-'+key];
  const cam={x:place.x,y:place.y??place.eyeY,z:place.z,yaw:place.yaw,pitch:place.pitch,fov:place.fov};
  if(!home){
    const view=OUTDOOR_VIEWS[key];
    assert.deepEqual([cam.x,cam.z],view.eye,'Both renderers share the same registered site and street-side viewpoint');
    assert.ok(Math.abs(cam.y-HOME.eyeHeight-regionalHeight(view.region,...view.eye))<.02,'Both cameras stand at human height above local terrain');
  }
  const reference=await loadImage(join(root,sourceAsset(key)));
  const textures=new Map();let imageBytes=0;
  for (const [name,resource] of model.textureSources) {
    if(resource.district&&resource.district!==key)continue;
    const source=await loadImage(fileURLToPath(new URL('../js/'+resource.path,import.meta.url)));
    const texture=decodeSoftwareTexture(source,{...resource,makeCanvas:createCanvas});
    textures.set(name,texture);imageBytes+=texture.bytes;
  }
  const canvas=createCanvas(width,height), renderer=perspective(canvas.getContext('2d'));
  const options={outdoor:!home,night:false,progress:{lamp:1,drawer:0,notebook:0},district:home?'':key,textures};
  const times=[];
  function render(camera){
    const start=performance.now();renderer.draw(model,camera,width,height,options);times.push(performance.now()-start);
    const result=createCanvas(width,height);result.getContext('2d').drawImage(canvas,0,0);return result;
  }
  const original=render(cam), faces=renderer.texturedFaces;
  const side={...cam,x:cam.x+Math.cos(cam.yaw)*(home?.24:1.2),z:cam.z-Math.sin(cam.yaw)*(home?.24:1.2)};
  const translated=render(side), turned=render({...side,yaw:side.yaw+.39,pitch:cam.pitch+.035});
  const surround=home?[]:[
    {name:'right',label:'Perpendicular to arrival',image:render({...side,yaw:cam.yaw+Math.PI/2})},
    {name:'rear',label:'Facing away from the landmark',image:render({...side,yaw:cam.yaw+Math.PI})},
  ];
  const walkingCanvas=createCanvas(450,300), walkingRaster=perspective(walkingCanvas.getContext('2d'));
  const timings=[];
  for(let tick=0;tick<7;tick++){
    const begin=performance.now();
    walkingRaster.draw(model,{...side,yaw:cam.yaw+.025*tick},450,300,{...options,fast:true});
    if(tick>0)timings.push(performance.now()-begin);
  }
  timings.sort((a,b)=>a-b);
  const movingRaster={width:450,height:300,medianMs:+((timings[2]+timings[3])/2).toFixed(1),maxMs:+timings.at(-1).toFixed(1)};
  const registration=compareFrames(reference,original),shift=compareFrames(original,translated), look=compareFrames(translated,turned);
  const detail=frameDetail(original),offAxis=frameDetail(turned);
  const subject=compareSubject(key,reference,original);
  const entry={key,registration,subject,detail,offAxis,movingRaster,surround:surround.map(view=>frameDetail(view.image)),shift,look,sourceTextures:textures.size,decodedMiB:+(imageBytes/1048576).toFixed(2),texturedFaces:faces,drawMs:times.map(n=>Math.round(n))};
  results.push(entry);
  console.log(JSON.stringify(entry));
  await saveComparison(output,key,[{name:'source',label:'2D source',image:reference},{name:'arrival',label:'CPU render',image:original},
    {name:'side',label:'Lateral translation',image:translated},{name:'turn',label:'After translation and rotation',image:turned},...surround]);
  const checks=[
    [faces>=8&&textures.size>=2,'multiple textured surfaces and source images'],
    [detail.colors>2200&&offAxis.colors>1500,'varied full-color arrival and off-axis material'],
    [subject.meanRgbError<27&&subject.luminanceCorrelation>.74,'the subject itself retains registered detail against the plate'],
    [shift.meanRgbError>1.5&&look.meanRgbError>4,'images respond to independent camera translation and rotation'],
    [registration.meanRgbError<27&&registration.luminanceCorrelation>.80,'photograph registration: RGB error <27/255, luminance correlation >0.80'],
    [imageBytes<=48*1024*1024,'active district texture decoding fits 48 MiB'],
  ];
  for(const [ok,description] of checks)if(!ok)failures.push(key+': '+description);
}
if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'metrics.json'),JSON.stringify({results,failures},null,2)+'\n');}
assert.deepEqual(failures,[]);
