// Export the surveyed ground levels, building footprints and solids for Blender.
// This build tool never runs in the browser.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import * as T from '../../js/vendor/three.module.min.js';
import {createRegionalLandscape} from './region-guide.mjs';
import {CASTLE_CENTER,REGION_BOUNDS} from '../../scene/world-layout.js';
globalThis.document={createElement:()=>createCanvas(192,192)};
const dir=process.argv[2];
await mkdir(dir,{recursive:true});
for(const key of Object.keys(REGION_BOUNDS)){
  const region=createRegionalLandscape(T,key),chunks=[],parts=[],trees=[];let bytes=0;
  const origin=key==='waseda'?[72,230]:[2000,800];
  const emit=(values,Kind=Float32Array)=>{
    const view=new Kind(values),buffer=Buffer.from(view.buffer);chunks.push(buffer);
    const info=[bytes,values.length];bytes+=buffer.length;return info;
  };
  const matrix=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),e=new T.Euler(),nmat=new T.Matrix3();
  region.group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(mesh.isInstancedMesh){
      if(!mesh.name.includes('branching trunks'))return;
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);matrix.decompose(p,q,s);e.setFromQuaternion(q);
        trees.push([p.x-origin[0],p.z-origin[1],p.y,s.y,Math.atan2(matrix.elements[8],matrix.elements[10]),key==='karatsu'?'pine':'broadleaf']);
      }
      return;
    }
    const attr=mesh.geometry.attributes,pos=attr.position,norm=attr.normal,col=attr.color,uv=attr.uv;
    const verts=[],ns=[],cs=[],tex=[];nmat.getNormalMatrix(mesh.matrixWorld);
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);verts.push(p.x-origin[0],-(p.z-origin[1]),p.y);
      p.fromBufferAttribute(norm,i).applyMatrix3(nmat).normalize();ns.push(p.x,-p.z,p.y);
      if(col)cs.push(col.getX(i),col.getY(i),col.getZ(i));
      if(uv)tex.push(uv.getX(i),uv.getY(i));
    }
    const material=mesh.material;
    parts.push({name:mesh.name,kind:material.name,p:emit(verts),n:emit(ns),c:emit(cs),uv:emit(tex),
      idx:emit(mesh.geometry.index?.array||Array.from({length:pos.count},(_,i)=>i),Uint32Array)});
  });
  const boxes=region.collisions.map(({id,box})=>[id,...box.min.toArray(),...box.max.toArray()]);
  await writeFile(path.join(dir,key+'.bin'),Buffer.concat(chunks));
  await writeFile(path.join(dir,key+'.json'),JSON.stringify({origin,key,parts,trees,boxes,castle:CASTLE_CENTER}));
  region.dispose();
}
