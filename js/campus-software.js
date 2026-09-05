/* Canvas projection fallback for browsers without WebGL. Uses the same 3D mesh
   and camera, with flat lighting, back-face culling, and depth-sorted triangles.
   It renders on demand by default. No remote rendering service is required. */
import * as T from './vendor/three.module.min.js';
export class CampusCanvasRenderer {
 constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:true});if(!this.context)throw Error('Canvas is unavailable');this.shadowMap={};this.software=true;this.ratio=1;this.width=1;this.height=1;this.triangles=null;this.clocks=[];this.light=new T.Vector3(-.4,.8,.5).normalize();}
 setPixelRatio(ratio){this.ratio=Math.min(ratio,1.25);}
 setClearColor(){}
 setSize(w,h){this.width=w;this.height=h;this.canvas.width=Math.round(w*this.ratio);this.canvas.height=Math.round(h*this.ratio);}
 prepare(scene){const triangles=[];
 const instance=new T.Matrix4(),world=new T.Matrix4(),v0=new T.Vector3(),v1=new T.Vector3(),v2=new T.Vector3(),edge1=new T.Vector3(),edge2=new T.Vector3(),normal=new T.Vector3();scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const g=mesh.geometry,attr=g.getAttribute('position'),index=g.index,material=mesh.material;if(!attr||Array.isArray(material))return;
 const count=mesh.isInstancedMesh?mesh.count:1;
 for(let n=0;n<count;n++){if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
 if(material.map?.image){this.clocks.push({image:material.map.image,matrix:world.clone()});continue;}
 const indices=index?index.count:attr.count;const base=material.color.clone().convertLinearToSRGB();
 for(let i=0;i<indices;i+=3){v0.fromBufferAttribute(attr,index?index.getX(i):i).applyMatrix4(world);v1.fromBufferAttribute(attr,index?index.getX(i+1):i+1).applyMatrix4(world);v2.fromBufferAttribute(attr,index?index.getX(i+2):i+2).applyMatrix4(world);edge1.subVectors(v1,v0);edge2.subVectors(v2,v0);normal.crossVectors(edge1,edge2).normalize();const brightness=.72+Math.max(0,normal.dot(this.light))*.29;const color=`rgb(${Math.round(base.r*255*brightness)},${Math.round(base.g*255*brightness)},${Math.round(base.b*255*brightness)})`;triangles.push({a:v0.clone(),b:v1.clone(),c:v2.clone(),normal:normal.clone(),color,rgba:(255<<24)|(Math.round(base.b*255*brightness)<<16)|(Math.round(base.g*255*brightness)<<8)|Math.round(base.r*255*brightness)});}
 }
 });this.triangles=triangles;
 }
 render(scene,camera){if(!this.triangles)this.prepare(scene);const ctx=this.context,w=this.canvas.width,h=this.canvas.height;ctx.setTransform(1,0,0,1,0,0);const pixels=ctx.createImageData(w,h),packed=new Uint32Array(pixels.data.buffer),depth=new Float32Array(w*h);depth.fill(Infinity);const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),direction=new T.Vector3();camera.getWorldDirection(direction);const v=new T.Vector3();const project=p=>{v.copy(p).applyMatrix4(vp);return [(v.x*.5+.5)*w,(-v.y*.5+.5)*h,v.z];};
 for(const t of this.triangles){if(t.normal.dot(direction)>=-.0001)continue;const a=project(t.a),b=project(t.b),c=project(t.c);const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));if(minX>maxX||minY>maxY)continue;
 const area=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(area)<.001)continue;
 const uX=(b[1]-c[1])/area,uY=(c[0]-b[0])/area,vX=(c[1]-a[1])/area,vY=(a[0]-c[0])/area;
 for(let y=minY;y<=maxY;y++){let u=((b[1]-c[1])*(minX+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/area,vv=((c[1]-a[1])*(minX+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/area;let pos=y*w+minX;for(let x=minX;x<=maxX;x++,pos++,u+=uX,vv+=vX){if(u>=-.0001&&vv>=-.0001&&u+vv<=1.0001){const z=u*a[2]+vv*b[2]+(1-u-vv)*c[2];if(z<depth[pos]){depth[pos]=z;packed[pos]=t.rgba;}}}}
 }
 ctx.putImageData(pixels,0,0);
 for(const clock of this.clocks){const normal=new T.Vector3(0,0,1).transformDirection(clock.matrix);if(normal.dot(direction)>=0)continue;const center=new T.Vector3().setFromMatrixPosition(clock.matrix);const a=project(new T.Vector3(-1.15,1.15,0).applyMatrix4(clock.matrix)),b=project(new T.Vector3(1.15,1.15,0).applyMatrix4(clock.matrix)),c=project(new T.Vector3(-1.15,-1.15,0).applyMatrix4(clock.matrix));ctx.save();ctx.transform((b[0]-a[0])/256,(b[1]-a[1])/256,(c[0]-a[0])/256,(c[1]-a[1])/256,a[0],a[1]);ctx.drawImage(clock.image,0,0);ctx.restore();}
 }
}
