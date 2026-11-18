// Exercise the same Three scene and software depth buffer used by the published
// Blender models. Alpha holes expose farther surfaces at the correct angle.
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import * as T from '../js/vendor/three.module.min.js';
import {createMeshRaster} from '../scene/mesh-raster.js';

globalThis.document={createElement:()=>createCanvas(1,1)};
const width=240,height=160,canvas=createCanvas(width,height);canvas.dataset={};
const ctx=canvas.getContext('2d'), raster=createMeshRaster(canvas);
raster.setSize(width,height);
const camera=new T.PerspectiveCamera(60,width/height,.08,40);
const scene=new T.Scene();scene.background=new T.Color('#383838');
const image=createCanvas(32,32),brush=image.getContext('2d');
brush.fillStyle='#ef2e24';brush.fillRect(0,0,32,32);brush.clearRect(12,0,14,32);
const rgba=brush.getImageData(0,0,32,32).data;
const texture=new T.DataTexture(new Uint8Array(rgba),32,32);texture.needsUpdate=true;
const cutout=new T.Mesh(new T.PlaneGeometry(2.6,2.4),new T.MeshBasicMaterial({map:texture,alphaTest:.38}));
cutout.position.z=-2;
const back=new T.Mesh(new T.PlaneGeometry(10,7.2),new T.MeshBasicMaterial({color:'#193fd2'}));back.position.z=-5;
scene.add(cutout,back);
function sample(x){return ctx.getImageData(Math.round(width*x),height/2,1,1).data;}
function check(x,red){
  const rgb=sample(x);
  assert(red?rgb[0]>rgb[2]*2:rgb[2]>rgb[0]*2,'The rendered pixel at '+x+' has the depth-winning surface color');
}
for(let order=0;order<2;order++){
  camera.position.x=0;raster.render(scene,camera);check(.35,true);check(.50,false);
  camera.position.x=.85;raster.render(scene,camera);check(.35,false);check(.50,true);
  scene.children.reverse();
}
const glass=new T.Mesh(new T.PlaneGeometry(2.6,2.4),new T.MeshBasicMaterial({color:'#eb2b20',transparent:true,opacity:.5,depthWrite:false}));glass.position.z=-2;
const foreground=new T.Mesh(new T.BoxGeometry(.14,.4,.10),new T.MeshBasicMaterial({color:'#20df36'}));foreground.position.set(-.4,0,-1);
scene.remove(cutout);scene.add(glass,foreground);camera.position.x=0;
for(let order=0;order<2;order++){
  raster.render(scene,camera);
  const mix=sample(.50);assert(mix[0]>50&&mix[2]>50,'Translucent color blends with the farther object');
  const p=foreground.position.clone().project(camera),near=sample(.5+p.x*.5);
  assert(near[1]>near[0]*2&&near[1]>near[2]*2,'The closer solid mesh occludes the transparent surface');
  scene.children.reverse();
}
raster.dispose();texture.dispose();for(const mesh of [cutout,back,glass,foreground]){mesh.geometry.dispose();mesh.material.dispose();}
console.log('The production mesh raster preserves UV cutouts, transparent blending and depth order at two camera positions.');
