// Decode the production atlases and rasterize physical depth without a browser
// or GPU. Optional review output includes the actual unlabelled RGB frames.
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { geometry, perspective } from '../js/software-renderer.js';
import { decodeSoftwareTexture } from '../js/software-textures.js';
import { buildSoftwareDesk, SOFTWARE_SEAT } from '../js/software-desk.js';
import { buildSoftwareGarden, SOFTWARE_PLACES } from '../js/software-garden.js';
import { reviewViews, sourceAsset, compareFrames, frameDetail, saveComparison } from './helpers/visual-comparison.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.REVIEW_OUTPUT && join(process.env.REVIEW_OUTPUT,'cpu-raster');
const width=720,height=480, desk=geometry(), garden=geometry();
buildSoftwareDesk(desk);buildSoftwareGarden(garden);
const failures=[], results=[];
for (const key of reviewViews) {
  const home=key==='desk', model=home?desk:garden;
  const place=home?SOFTWARE_SEAT:SOFTWARE_PLACES['landmark-'+key];
  const cam={x:place.x,y:place.y??place.eyeY,z:place.z,yaw:place.yaw,pitch:place.pitch,fov:place.fov};
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
  const registration=compareFrames(reference,original),shift=compareFrames(original,translated), look=compareFrames(translated,turned);
  const detail=frameDetail(original),offAxis=frameDetail(turned);
  const entry={key,registration,detail,offAxis,shift,look,sourceTextures:textures.size,decodedMiB:+(imageBytes/1048576).toFixed(2),texturedFaces:faces,drawMs:times.map(n=>Math.round(n))};
  results.push(entry);
  console.log(JSON.stringify(entry));
  await saveComparison(output,key,[{name:'source',label:'2D source',image:reference},{name:'arrival',label:'CPU render',image:original},
    {name:'side',label:'Lateral translation',image:translated},{name:'turn',label:'After translation and rotation',image:turned}]);
  const checks=[
    [faces>=8&&textures.size>=2,'multiple textured surfaces and source images'],
    [detail.colors>2200&&offAxis.colors>1500,'varied full-color arrival and off-axis material'],
    [shift.meanRgbError>1.5&&look.meanRgbError>4,'images respond to independent camera translation and rotation'],
    [registration.meanRgbError<55&&registration.luminanceCorrelation>.55,'photograph registration: RGB error <55/255, luminance correlation >0.55'],
    [imageBytes<=48*1024*1024,'active district texture decoding fits 48 MiB'],
  ];
  for(const [ok,description] of checks)if(!ok)failures.push(key+': '+description);
}
if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'metrics.json'),JSON.stringify({results,failures},null,2)+'\n');}
assert.deepEqual(failures,[]);
