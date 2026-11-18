// The same winning sample must control both color and picking, including
// holes in foliage, railings and the silhouette of the bronze sculpture.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { geometry, perspective } from '../js/software-renderer.js';
import { decodeSoftwareTexture } from '../js/software-textures.js';

const width=240, height=160, canvas=createCanvas(width,height), ctx=canvas.getContext('2d');
const raster=perspective(ctx), mesh=geometry(), camera={x:0,y:0,z:0,yaw:0,pitch:0,fov:60};
const atlas=createCanvas(32,32), brush=atlas.getContext('2d');
brush.fillStyle='#f33327'; brush.fillRect(0,0,32,32); brush.clearRect(12,0,14,32);
const textures=new Map([['fabric',decodeSoftwareTexture(atlas,{makeCanvas:createCanvas})]]);
const quad=(w,h,z)=>[[-w,h,z],[w,h,z],[w,-h,z],[-w,-h,z]];
mesh.face(quad(1.3,1.2,2),'#0e161d',{id:'front', texture:'fabric',uv:[[0,0],[1,0],[1,1],[0,1]]});
mesh.face(quad(5,3.6,5),'#193fd2',{id:'rear'});
function checkSample(x, id, red) {
  const i=Math.round(width*x), j=height/2, bytes=ctx.getImageData(i,j,1,1).data;
  assert.equal(raster.pick(i,j),id,'Picking agrees with the visible surface at '+x);
  assert(red ? bytes[0]>bytes[2]*2 : bytes[2]>bytes[0]*2,'The actual depth-winning pixel contains the expected front or rear color');
}
for (let order=0; order<2; order++) {
  raster.draw(mesh,camera,width,height,{textures});
  checkSample(.35,'front',true);
  checkSample(.50,'rear',false);
  raster.draw(mesh,{...camera,x:.85},width,height,{textures});
  checkSample(.35,'rear',false);
  checkSample(.50,'front',true);
  mesh.faces.reverse();
}
console.log('Depth, alpha cutout and picking agree before and after translation in both face orders.');

// The source-camera boundary fades into the surrounding panorama. A closer
// solid object must still occlude the blended layer, in either submission order.
const fadeModel=geometry(), solid=createCanvas(16,16), paint=solid.getContext('2d');
paint.fillStyle='#f33327';paint.fillRect(0,0,16,16);
textures.set('wall',decodeSoftwareTexture(solid,{makeCanvas:createCanvas}));
fadeModel.face(quad(4,3,5),'#193fd2',{id:'pavement'});
fadeModel.face(quad(1,1,2),'#141414',{texture:'wall',id:'building',uv:[[0,0],[1,0],[1,1],[0,1]],feather:[.2,0,.2,0]});
fadeModel.box(-.40,0,1,.12,.40,.12,'#2be356',{id:'tree'});
for(let order=0;order<2;order++){
  raster.draw(fadeModel,camera,width,height,{textures});
  function colorAt(point){
    const xy=raster.screen(point);
    return ctx.getImageData(xy[0]*width,xy[1]*height,1,1).data;
  }
  const mixed=colorAt([.8,0,2]), center=colorAt([0,0,2]), near=colorAt([-.4,0,1]);
  assert(mixed[2]>center[2]+25 && center[0]>mixed[0]+25,'At the source border both the front texture and farther panorama contribute');
  assert(near[1]>near[0]*2 && near[1]>near[2]*2,'An opaque foreground tree wins in front of a feathered image');
  fadeModel.faces.reverse();
}
console.log('Feathered source border blends in depth and respects opaque foreground geometry.');
