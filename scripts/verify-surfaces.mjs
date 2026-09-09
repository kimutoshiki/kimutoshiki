import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../js/vendor/three.module.min.js';
import { surface, ensureSurfaceUV, loadSurfaceMaterials, SURFACES } from '../scene/surface-materials.js';
import { StudyCanvasRenderer } from '../scene/study-software.js';

const root = new T.Group(), box = new T.BoxGeometry(1, 1, 1);
const stone = surface(new T.MeshStandardMaterial({ color: '#887766' }), 'stone');
const oldMap = new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);
stone.map = oldMap;
const instances = new T.InstancedMesh(box, stone, 3), transform = new T.Matrix4();
[[2,3,1],[4,3,1],[2,3,1]].forEach((s,i) => {
  transform.compose(new T.Vector3(i*5,0,0),new T.Quaternion(),new T.Vector3(...s));
  instances.setMatrixAt(i,transform);instances.setColorAt(i,new T.Color(i?'#ddffdd':'#ffffff'));
});
root.add(instances);root.updateMatrixWorld(true);
const beforeBounds = new T.Box3().setFromObject(root), matrices = [];
for(let i=0;i<instances.count;i++){instances.getMatrixAt(i,transform);matrices.push(transform.toArray().join(','));}
const callbacks = [], requests = [], released = [];
T.TextureLoader.prototype.load = function(url,onLoad,onProgress,onError){requests.push(url);callbacks.push({url,onLoad,onError});return new T.Texture();};
let redraws=0;
const manager=loadSurfaceMaterials(T,root,{onLoad(){redraws++;}});
assert.equal(stone.map,oldMap,'Authored material must stay visible while loading');
assert.equal(root.children.length,2,'Equal-sized instances must share a UV bucket');
assert.equal(root.children.reduce((n,m)=>n+m.count,0),3);
const afterMatrices=[], colors=new Map();
root.traverse(m=>{if(m.isInstancedMesh)for(let i=0;i<m.count;i++){m.getMatrixAt(i,transform);const key=transform.toArray().join(',');afterMatrices.push(key);const c=new T.Color();m.getColorAt(i,c);colors.set(key,c.getHexString());}});
for(let i=0;i<matrices.length;i++)assert.equal(colors.get(matrices[i]),i?'ddffdd':'ffffff');
assert.deepEqual(afterMatrices.sort(),matrices.sort());
root.updateMatrixWorld(true);assert.deepEqual([new T.Box3().setFromObject(root).min.toArray(),new T.Box3().setFromObject(root).max.toArray()],[beforeBounds.min.toArray(),beforeBounds.max.toArray()]);
const image = new T.DataTexture(new Uint8Array([240,100,50,255,50,180,100,255,20,40,240,255,220,220,210,255]),2,2);
callbacks[0].onLoad(image);
assert.equal(stone.map,image);assert.equal(redraws,1);assert.equal(image.colorSpace,T.SRGBColorSpace);
assert.ok(root.children.every(m=>[...m.geometry.attributes.uv.array].every(Number.isFinite)));
// A failed asset and a result arriving after disposal preserve usable materials.
const failure = surface(new T.MeshStandardMaterial({color:'#784a36'}),'walnut'), failedRoot=new T.Group();failedRoot.add(new T.Mesh(box,failure));
const pending=loadSurfaceMaterials(T,failedRoot);callbacks.at(-1).onError(new Error('offline'));assert.equal(failure.map,null);
const late=new T.Texture();late.addEventListener('dispose',()=>released.push('late'));pending.dispose();callbacks.at(-1).onLoad(late);assert.equal(failure.map,null);assert.deepEqual(released,['late']);
const plain=new T.BufferGeometry();plain.setAttribute('position',new T.Float32BufferAttribute([0,0,0,2,0,0,0,2,0],3));plain.computeVertexNormals();const positions=plain.attributes.position.array.slice();ensureSurfaceUV(T,plain,2);assert.deepEqual(plain.attributes.position.array,positions);assert.deepEqual([...plain.attributes.uv.array],[0,0,1,0,0,1]);
// Exercise actual textured triangle rasterization, including an image update.
let pixels;
const canvas={width:32,height:32,style:{},getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),setTransform(){},putImageData(p){pixels=p.data.slice();}};}};
const renderer=new StudyCanvasRenderer(canvas,T);renderer.setSize(32,32,false);
const scene=new T.Scene();scene.background=new T.Color('#000000');
const tex=new T.DataTexture(new Uint8Array([255,0,0,255]),1,1);tex.needsUpdate=true;
const face=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:tex}));scene.add(face);
const camera=new T.PerspectiveCamera(50,1,.1,10);camera.position.z=3;camera.lookAt(0,0,0);renderer.render(scene,camera);
const center=(16*32+16)*4;assert.ok(pixels[center]>240&&pixels[center+1]<10,'Texture must color real triangles');
tex.image.data.set([0,255,0,255]);tex.needsUpdate=true;renderer.render(scene,camera);assert.ok(pixels[center]<10&&pixels[center+1]>240,'Late texture revisions must redraw');
let bytes=0;
for(const {file} of Object.values(SURFACES)){const data=await readFile(new URL('../images/materials/'+file+'.webp',import.meta.url));assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');bytes+=data.length;}
assert.ok(bytes<800000,'Generated image transfer budget exceeded');
manager.dispose();renderer.dispose();
console.log(JSON.stringify({result:'PASS',checks:['Instance geometry, colors and physical UV buckets','Placeholder, success, failure and disposal loading states','UV addition preserves custom geometry','Real software pixel rasterization and late texture refresh','Nine valid WebP assets under 800 kB'],textureBytes:bytes},null,2));
