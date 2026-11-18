/** Translate the site's own architectural measurements and vertex colours into
 * compact Blender authoring inputs. Run via landmarks.py. All coordinates
 * remain in the source design system until the Blender finishing pass. */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from '../../js/vendor/three.module.min.js';
import {createKaratsuBank} from '../../js/models/karatsu-bank.js';
import {createKaratsuCastle} from '../../js/models/karatsu-castle.js';
import {createOkumaStatue} from '../../js/models/okuma-statue.js';
import {createOkumaAuditorium} from '../../js/models/okuma-auditorium.js';
import {LANDMARK_SITES} from '../../scene/world-layout.js';
import {captureLandmarkClocks, updateLandmarkClocks} from '../../scene/landmark-clocks.js';
import {prepareBoxSurfaceUVs, ensureSurfaceUV, SURFACES} from '../../scene/surface-materials.js';

const factories={'karatsu-bank':createKaratsuBank,'karatsu-castle':createKaratsuCastle,'okuma-statue':createOkumaStatue,'okuma-auditorium':createOkumaAuditorium};
const [output,...keys]=process.argv.slice(2);
await fs.mkdir(output,{recursive:true});
for(const key of keys.length?keys:Object.keys(factories)) {
  const site=LANDMARK_SITES.find(s=>s.key===key);
  const factory=factories[key](T), root=factory.architecture||factory.group.getObjectByName(site.name);
  root.removeFromParent();
  const clocks=captureLandmarkClocks(root);
  updateLandmarkClocks(clocks,{clockAngles:{hour:0,minute:0}});
  prepareBoxSurfaceUVs(T,root);root.updateMatrixWorld(true);
  const groups=new Map(), arrays=[], mats=new Map(),seenMaterials=[];
  const point=new T.Vector3(),normal=new T.Vector3(),tangent=new T.Vector2();
  const matrix=new T.Matrix4(),instance=new T.Matrix4(),normalMatrix=new T.Matrix3();
  const clockMap=new Map(), clockFaces={};
  clocks.forEach(({face,hour,minute},i)=>{
    const inverse=face.matrixWorld.clone().invert();
    clockFaces[i+1]={pivot:face.localToWorld(new T.Vector3(0,0,hour.position.z)).toArray(),yaw:face.rotation.y};
    for(const [kind,mesh] of Object.entries({hour,minute}))clockMap.set(mesh,{kind,face:i+1,inverse,front:mesh.position.z});
  });
  function materialId(m) {
    if(mats.has(m))return mats.get(m);
    const id=mats.size, tag=m.userData.surface,spec=SURFACES[tag?.key];
    const rgb=m.color.toArray();
    seenMaterials.push({rgb,hex:m.color.getHexString(),roughness:m.roughness??.8,metalness:m.metalness??0,vertexColors:m.vertexColors||false,
      surface:tag?.key,texture:spec?.file,tint:tag?.tint||spec?.tint,repeat:tag?.repeat||[1,1],doubleSided:m.side===T.DoubleSide});
    mats.set(m,id);return id;
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,attrib=g.attributes,pos=attrib.position,nor=attrib.normal,col=attrib.color;
    if(!pos||!nor)return;
    const submaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const tag=submaterials[0].userData.surface;
    if(tag?.key)ensureSurfaceUV(T,g,SURFACES[tag.key].span);
    const span=g.index?.count??pos.count;
    const ranges=Array.isArray(mesh.material)?g.groups:[{start:0,count:span,materialIndex:0}];
    for(let n=0;n<(mesh.isInstancedMesh?mesh.count:1);n++) {
      matrix.copy(mesh.matrixWorld);
      if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);matrix.multiply(instance);}
      const hand=clockMap.get(mesh);
      if(hand)matrix.premultiply(hand.inverse);
      normalMatrix.getNormalMatrix(matrix);
      for(const range of ranges){
        const m=submaterials[range.materialIndex],id=materialId(m);
        const name=hand?'Clock_'+hand.face+'_'+hand.kind:'Material_'+id;
        if(!groups.has(name))groups.set(name,{name,material:id,hand:hand?{face:hand.face,kind:hand.kind}:null,p:[],n:[],uv:[],c:[],idx:[]});
        const batch=groups.get(name),uv=g.attributes.uv,flip=matrix.determinant()<0,remap=new Map();
        function vertex(i) {
          if(remap.has(i))return remap.get(i);
          const target=batch.p.length/3;
          point.fromBufferAttribute(pos,i).applyMatrix4(matrix);if(hand)point.z-=hand.front;
          normal.fromBufferAttribute(nor,i).applyMatrix3(normalMatrix).normalize();
          batch.p.push(point.x,-point.z,point.y);batch.n.push(normal.x,-normal.z,normal.y);
          if(uv)tangent.fromBufferAttribute(uv,i);else tangent.set(0,0);
          batch.uv.push(tangent.x*(tag?.repeat?.[0]||1),tangent.y*(tag?.repeat?.[1]||1));
          if(m.vertexColors&&col)batch.c.push(col.getX(i),col.getY(i),col.getZ(i));
          remap.set(i,target);return target;
        }
        for(let k=range.start;k<range.start+range.count;k+=3) {
          const a=vertex(g.index?g.index.getX(k):k),b=vertex(g.index?g.index.getX(k+1):k+1),c=vertex(g.index?g.index.getX(k+2):k+2);
          if(a!==b&&a!==c&&b!==c)batch.idx.push(a,flip?c:b,flip?b:c);
        }
      }
    }
  });
  let bytes=0;
  const layout=[...groups.values()].map(({name,material,hand,...attrs})=>{
    const block={name,material,hand};
    for(const [k,data] of Object.entries(attrs)) {
      if(!data.length)continue;
      const typed=k==='idx'?new Uint32Array(data):new Float32Array(data);
      block[k]=[bytes,typed.length];arrays.push(Buffer.from(typed.buffer));bytes+=typed.byteLength;
    }
    return block;
  });
  await fs.writeFile(path.join(output,key+'.bin'),Buffer.concat(arrays));
  await fs.writeFile(path.join(output,key+'.json'),JSON.stringify({key,height:site.height,title:site.title,clockFaces,groups:layout,materials:seenMaterials}));
}
