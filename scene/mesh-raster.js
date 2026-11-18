// Rasterize the actual imported triangle buffers when the device has no WebGL.
// Texture coordinates belong to the Blender meshes; they never use screen space.
import { Matrix3, Matrix4, Vector3, Frustum, Sphere } from '../js/vendor/three.module.min.js';
import { decodeSoftwareTexture } from '../js/software-textures.js';

const stride = 10, clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const encode = v => Math.round(255*(v<=.0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-.055));
const bytes = new Uint8Array(2049);
for(let i=0;i<bytes.length;i++) bytes[i]=encode(i/2048);
const srgb = n => bytes[clamp(Math.round(n*2048),0,2048)];
const pack = (r,g,b) => 0xff000000 | (b<<16) | (g<<8) | r;

function interpolate(a,b,f) {
  const r=new Float32Array(stride);
  for(let j=0;j<stride;j++)r[j]=a[j]+(b[j]-a[j])*f;
  return r;
}
function clipDepth(points,direction) {
  const output=[];let p=points.at(-1),distance=p[3]+p[2]*direction;
  for(const q of points) {
    const d=q[3]+q[2]*direction;
    if((d<0)!==(distance<0)) output.push(interpolate(p,q,distance/(distance-d)));
    if(d>=0)output.push(q);
    p=q;distance=d;
  }
  return output;
}

function pixelTexture(map, cache) {
  if (!map?.image?.width) return null;
  let t=cache.get(map);
  if(t?.version===map.version) return t;
  const source=map.image;
  let bitmap=source;
  if(source.data) {
    if (!(source.data instanceof Uint8Array||source.data instanceof Uint8ClampedArray) || source.data.length!==source.width*source.height*4) return null;
    bitmap=document.createElement('canvas');bitmap.width=source.width;bitmap.height=source.height;
    const ctx=bitmap.getContext('2d');const img=ctx.createImageData(source.width,source.height);img.data.set(source.data);ctx.putImageData(img,0,0);
  }
  try {
    const pyramid=decodeSoftwareTexture(bitmap,{maxSize:2048});
    map.updateMatrix?.();
    t={levels:pyramid.levels,version:map.version,flip:map.flipY,repeatX:map.wrapS===1000,repeatY:map.wrapT===1000,uv:map.matrix.elements.slice()};
    cache.set(map,t);return t;
  } catch { return null; }
}

export function createMeshRaster(canvas) {
  let surface=canvas,ctx;
  try{ctx=surface.getContext('2d',{alpha:false});}catch{}
  if(!ctx) {
    surface=document.createElement('canvas');ctx=surface.getContext('2d',{alpha:false});
    if(!ctx)throw Error('Canvas 2D is unavailable');
    surface.className='world-canvas';surface.setAttribute('aria-hidden','true');surface.style.pointerEvents='none';
    canvas.before(surface);canvas.style.opacity='0';
  }
  surface.dataset.renderer='software';
  let w=1,h=1,nextW=1,nextH=1,ratio=1,image,pixels,depth,textureCache=new WeakMap();
  const viewProj=new Matrix4(),mvp=new Matrix4(),world=new Matrix4(),instance=new Matrix4(),normalMatrix=new Matrix3();
  const frustum=new Frustum(),sphere=new Sphere(),normal=new Vector3(),point=new Vector3(),tint=new Vector3();
  const sunVec=new Vector3(),info={render:{calls:0,triangles:0}};
  let projected=new Float32Array(0),flags=new Uint8Array(0),shaded=new Uint8Array(0);
  let skyTop,skyBottom,backdrop;
  let fogNear=0,fogScale=0,fogDepth=0,fogRed=0,fogGreen=0,fogBlue=0;
  function background(scene) {
    const tone=scene.backgroundIntensity??1;
    if(scene.background?.isColor) {
      const c=scene.background; pixels.fill(pack(srgb(c.r),srgb(c.g),srgb(c.b)));return;
    }
    const bg=scene.background?.image;
    if(bg?.getContext && skyTop?.version!==scene.background.version) {
      const context=bg.getContext('2d');
      skyTop={version:scene.background.version,color:context.getImageData(bg.width>>1,Math.floor(bg.height*.28),1,1).data};
      skyBottom=context.getImageData(bg.width>>1,bg.height>>1,1,1).data;
    }
    const top=skyTop?.color||[103,155,191],bot=skyBottom||[206,217,212];
    const exposure=Math.sqrt(tone);
    const channel=(i,k)=>clamp(Math.round((top[i]+(bot[i]-top[i])*k)*exposure),0,255);
    for(let y=0;y<h;y++) {
      const k=clamp(y/h*1.6,0,1);
      pixels.fill(pack(channel(0,k),channel(1,k),channel(2,k)),y*w,(y+1)*w);
    }
  }
  function triangle(data,ia,ib,ic,mat,tex,prepare) {
    const aw=1/data[ia+3],bw=1/data[ib+3],cw=1/data[ic+3];
    const ax=(data[ia]*aw+1)*.5*w,ay=(1-data[ia+1]*aw)*.5*h;
    const bx=(data[ib]*bw+1)*.5*w,by=(1-data[ib+1]*bw)*.5*h;
    const cx=(data[ic]*cw+1)*.5*w,cy=(1-data[ic+1]*cw)*.5*h;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<.022 || (mat.side===0 && area>0) || (mat.side===1 && area<0))return;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    if(x1<x0||y1<y0)return;
    if(prepare){prepare(ia);prepare(ib);prepare(ic);}
    const da=(by-cy)/area,db=(cy-ay)/area,ea=(cx-bx)/area,eb=(ax-cx)/area;
    const dc=-da-db, wide=x1-x0>12, tolerance=.00001;
    const iaStep=Math.abs(da)>1e-12?1/da:0,ibStep=Math.abs(db)>1e-12?1/db:0,icStep=Math.abs(dc)>1e-12?1/dc:0;
    const ua=data[ia+4],ub=data[ib+4],uc=data[ic+4],va=data[ia+5],vb=data[ib+5],vc=data[ic+5];
    const alpha=mat.opacity??1, alphaCutoff=Math.max(.015,mat.alphaTest||0);
    const blend=mat.transparent, writeDepth=mat.depthWrite!==false;
    const canFog=mat.fog!==false && fogDepth>Math.min(aw,bw,cw);
    let level;
    if(tex) {
      const first=tex.levels[0],du=Math.abs((ua-uc)*da+(ub-uc)*db)*first.width,dv=Math.abs((va-vc)*ea+(vb-vc)*eb)*first.height;
      level=tex.levels[clamp(Math.floor(Math.log2(Math.max(1,du,dv))),0,tex.levels.length-1)];
    }
    let rowA=((by-cy)*(x0+.5-cx)+(cx-bx)*(y0+.5-cy))/area;
    let rowB=((cy-ay)*(x0+.5-cx)+(ax-cx)*(y0+.5-cy))/area;
    for(let y=y0;y<=y1;y++,rowA+=ea,rowB+=eb) {
      let first=0,last=x1-x0;
      if(wide){
        // Each barycentric weight is linear across a row. Visit only the
        // columns where all three weights may be inside the same triangle.
        // Round outwards, then retain the original per-pixel edge test.
        const edgeA=(-tolerance-rowA)*iaStep,edgeB=(-tolerance-rowB)*ibStep;
        const edgeC=(rowA+rowB-1-tolerance)*icStep;
        if(iaStep>0)first=Math.max(first,Math.floor(edgeA));else if(iaStep<0)last=Math.min(last,Math.ceil(edgeA));
        if(ibStep>0)first=Math.max(first,Math.floor(edgeB));else if(ibStep<0)last=Math.min(last,Math.ceil(edgeB));
        if(icStep>0)first=Math.max(first,Math.floor(edgeC));else if(icStep<0)last=Math.min(last,Math.ceil(edgeC));
      }
      let a=rowA+first*da,b=rowB+first*db;
      const end=y*w+x0+last;
      for(let idx=y*w+x0+first;idx<=end;idx++,a+=da,b+=db) {
        const c=1-a-b;
        if(a< -tolerance||b< -tolerance||c< -tolerance)continue;
        const q=a*aw+b*bw+c*cw;
        if(q<=depth[idx])continue;
        let r=255,g=255,blue=255,opacity=alpha;
        if(tex) {
          let u=(ua*a*aw+ub*b*bw+uc*c*cw)/q,v=(va*a*aw+vb*b*bw+vc*c*cw)/q;
          const uv=tex.uv,sv=uv[1]*u+uv[4]*v+uv[7];u=uv[0]*u+uv[3]*v+uv[6];v=tex.flip?1-sv:sv;
          u=tex.repeatX?u-Math.floor(u):clamp(u,0,1);v=tex.repeatY?v-Math.floor(v):clamp(v,0,1);
          const sx=u*(level.width-1),sy=v*(level.height-1),ix=sx|0,iy=sy|0,fx=sx-ix,fy=sy-iy;
          const off=iy*level.width+ix,e=ix+1<level.width?1:0,s=iy+1<level.height?level.width:0;
          const p=level.pixels,M=p[off],N=p[off+e],O=p[off+s],P=p[off+s+e];
          const k=(1-fx)*(1-fy),l=fx*(1-fy),m=(1-fx)*fy,n=fx*fy;
          r=(M&255)*k+(N&255)*l+(O&255)*m+(P&255)*n;
          g=(M>>8&255)*k+(N>>8&255)*l+(O>>8&255)*m+(P>>8&255)*n;
          blue=(M>>16&255)*k+(N>>16&255)*l+(O>>16&255)*m+(P>>16&255)*n;
          opacity*=((M>>>24)*k+(N>>>24)*l+(O>>>24)*m+(P>>>24)*n)/255;
        }
        if(opacity<alphaCutoff)continue;
        r=clamp(r*(a*data[ia+6]+b*data[ib+6]+c*data[ic+6]),0,255);
        g=clamp(g*(a*data[ia+7]+b*data[ib+7]+c*data[ic+7]),0,255);
        blue=clamp(blue*(a*data[ia+8]+b*data[ib+8]+c*data[ic+8]),0,255);
        if(canFog && q<fogDepth){
          const distance=clamp((1/q-fogNear)*fogScale,0,1);
          const amount=distance*distance*(3-2*distance);
          r+=(fogRed-r)*amount;g+=(fogGreen-g)*amount;blue+=(fogBlue-blue)*amount;
        }
        if(blend && opacity<.995) {
          const prev=pixels[idx];r=r*opacity+(prev&255)*(1-opacity);g=g*opacity+(prev>>8&255)*(1-opacity);blue=blue*opacity+(prev>>16&255)*(1-opacity);
        }
        pixels[idx]=pack(r,g,blue);
        if(writeDepth)depth[idx]=q;
      }
    }
  }
  let ambientLight=1,sunPower=.7;
  function draw(node,model,geometry,mat,start,end) {
    if(!mat?.visible||mat.opacity<=.005)return;
    if(!geometry.boundingSphere)geometry.computeBoundingSphere();
    sphere.copy(geometry.boundingSphere).applyMatrix4(model);
    if(node.frustumCulled && !node.isSkinnedMesh && !frustum.intersectsSphere(sphere))return;
    const pos=geometry.attributes.position,uv=geometry.attributes.uv,colors=mat.vertexColors&&geometry.attributes.color;
    if(!pos)return;
    const count=pos.count,norm=geometry.attributes.normal,idx=geometry.index;
    if(projected.length<count*stride){projected=new Float32Array(count*stride);flags=new Uint8Array(count);shaded=new Uint8Array(count);}
    shaded.fill(0,0,count);
    mvp.multiplyMatrices(viewProj,model);normalMatrix.getNormalMatrix(model);
    const e=mvp.elements,tex=pixelTexture(mat.map,textureCache);
    const color=mat.color||{r:1,g:1,b:1},em=mat.emissive,ei=mat.emissiveIntensity??1;
    const posed=node.isSkinnedMesh || node.morphTargetInfluences?.some(k=>Math.abs(k)>.0001);
    const basic=mat.isMeshBasicMaterial;
    for(let i=0,j=0;i<count;i++,j+=stride) {
      if(posed)node.getVertexPosition(i,point);else point.fromBufferAttribute(pos,i);
      const {x,y,z}=point;
      const px=e[0]*x+e[4]*y+e[8]*z+e[12],py=e[1]*x+e[5]*y+e[9]*z+e[13],pz=e[2]*x+e[6]*y+e[10]*z+e[14],pw=e[3]*x+e[7]*y+e[11]*z+e[15];
      projected[j]=px;projected[j+1]=py;projected[j+2]=pz;projected[j+3]=pw;
      flags[i]=(px< -pw?1:0)|(px>pw?2:0)|(py< -pw?4:0)|(py>pw?8:0)|(pz< -pw?16:0)|(pz>pw?32:0);
    }
    function prepare(j) {
      const i=j/stride;
      if(shaded[i])return;
      shaded[i]=1;
      projected[j+4]=uv?.getX(i)||0;projected[j+5]=uv?.getY(i)||0;
      let light=1;
      if(!basic){
        if(norm)normal.fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix);else normal.set(0,1,0);
        const lambert=Math.max(0,normal.dot(sunVec));
        light=clamp(ambientLight*(.65+.32*(normal.y+1)*.5)+sunPower*lambert,.16,1.75);
      }
      if(colors)tint.fromBufferAttribute(colors,i);else tint.set(1,1,1);
      projected[j+6]=srgb(color.r*tint.x*light+(em?.r||0)*ei)/255;
      projected[j+7]=srgb(color.g*tint.y*light+(em?.g||0)*ei)/255;
      projected[j+8]=srgb(color.b*tint.z*light+(em?.b||0)*ei)/255;
    }
    const data=projected;
    for(let i=start;i+2<end;i+=3) {
      const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
      if(flags[a]&flags[b]&flags[c])continue;
      const ia=a*stride,ib=b*stride,ic=c*stride;
      const clipFlags=(flags[a]|flags[b]|flags[c])&48;
      if(clipFlags) {
        prepare(ia);prepare(ib);prepare(ic);
        let pts=[data.subarray(ia,ia+stride),data.subarray(ib,ib+stride),data.subarray(ic,ic+stride)];
        if(clipFlags&16)pts=clipDepth(pts,1);
        if(pts.length>=3 && clipFlags&32)pts=clipDepth(pts,-1);
        if(pts.length<3)continue;
        const packed=new Float32Array(pts.length*stride);pts.forEach((p,j)=>packed.set(p,j*stride));
        for(let j=1;j<pts.length-1;j++)triangle(packed,0,j*stride,(j+1)*stride,mat,tex);
      }else triangle(data,ia,ib,ic,mat,tex,prepare);
    }
    info.render.calls++;info.render.triangles+=(end-start)/3;
  }
  function collectMeshes(scope,camera,submit,skip) {
    function visit(mesh) {
      if(!mesh.visible || mesh===skip)return;
      if(mesh.isMesh && mesh.layers.test(camera.layers)) {
        const g=mesh.geometry;
        if(g?.attributes.position){
          const m=mesh.material,total=g.index?.count||g.attributes.position.count;
          const from=Math.max(0,g.drawRange.start),to=Math.min(total,from+g.drawRange.count);
          if(mesh.isSkinnedMesh)mesh.skeleton.update();
          const copies=mesh.isInstancedMesh?mesh.count:1;
          for(let i=0;i<copies;i++) {
            if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
            if(Array.isArray(m)){for(const group of g.groups)submit(mesh,world,g,m[group.materialIndex],Math.max(from,group.start),Math.min(to,group.start+group.count));}
            else submit(mesh,world,g,m,from,to);
          }
        }
      }
      for(const child of mesh.children)visit(child);
    }
    visit(scope);
  }
  function updateLights(scene) {
    ambientLight=.63;sunPower=.65;sunVec.set(-.48,.76,.43).normalize();
    let best=0;
    scene.traverseVisible(n=>{
      if(n.isHemisphereLight)ambientLight=clamp(.50+.18*n.intensity,.45,.90);
      if(n.isDirectionalLight && n.intensity>best) {
        best=n.intensity;sunPower=clamp(.22+best*.24,.25,.95);
        sunVec.setFromMatrixPosition(n.matrixWorld).sub(point.setFromMatrixPosition(n.target.matrixWorld)).normalize();
      }
    });
  }
  function updateFog(fog) {
    fogDepth=0;
    if(!fog?.isFog || fog.near<=0 || fog.far<=fog.near)return;
    fogNear=fog.near;fogScale=1/(fog.far-fogNear);fogDepth=1/fogNear;
    fogRed=srgb(fog.color.r);fogGreen=srgb(fog.color.g);fogBlue=srgb(fog.color.b);
  }
  return {
    info,shadowMap:{},capabilities:{maxTextureSize:2048,getMaxAnisotropy:()=>1},isMeshRaster:true,
    getPixelRatio:()=>ratio,setPixelRatio(value){ratio=value;},
    setSize(width,height) {
      const scale=Math.min(ratio,Math.sqrt(1500000/Math.max(1,width*height)));
      nextW=Math.max(1,Math.round(width*scale));nextH=Math.max(1,Math.round(height*scale));
    },
    render(scene,camera,{staticFrameKey,dynamicRoot}={}) {
      // Resizing a canvas clears its pixels immediately. Allocate only in
      // the render which replaces those pixels with the next complete frame.
      if (!image || w!==nextW || h!==nextH) {
        w=nextW;h=nextH;surface.width=w;surface.height=h;
        image=ctx.createImageData(w,h);pixels=new Uint32Array(image.data.buffer);depth=new Float32Array(w*h);
        backdrop=undefined;
      }
      // The caller's key describes the camera and the static scene revision.
      // The cat is the only moving subtree in this mode. Keep opaque colour
      // and depth, then redraw the cat and depth-sort all glass in the same pass.
      const canCache=dynamicRoot && staticFrameKey!==undefined;
      const reuse=canCache && backdrop?.key===staticFrameKey && backdrop.scene===scene && backdrop.camera===camera && backdrop.root===dynamicRoot;
      const transparent=reuse?backdrop.transparent.slice():[];
      info.render.calls=info.render.triangles=0;
      function submit(mesh,model,g,m,start,end) {
        if(!m?.visible || m.opacity<=.005 || end<=start)return;
        if(m.transparent){sphere.copy(g.boundingSphere || (g.computeBoundingSphere(),g.boundingSphere)).applyMatrix4(model);
          transparent.push({mesh,model:model.clone(),g,m,start,end,d:sphere.center.distanceToSquared(camera.position)});}
        else draw(mesh,model,g,m,start,end);
      }
      if(reuse){
        pixels.set(backdrop.color);depth.set(backdrop.depth);
        // updateMatrixWorld also refreshes each skinned mesh's bind inverse.
        dynamicRoot.updateMatrixWorld(true);
      }else{
        scene.updateMatrixWorld();camera.updateWorldMatrix(true,false);
        viewProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProj);
        depth.fill(0);background(scene);updateLights(scene);updateFog(scene.fog);
        collectMeshes(scene,camera,submit,canCache?dynamicRoot:null);
        if(canCache){
          backdrop??={color:new Uint32Array(pixels.length),depth:new Float32Array(depth.length)};
          Object.assign(backdrop,{key:staticFrameKey,scene,camera,root:dynamicRoot,transparent:transparent.slice()});
          backdrop.color.set(pixels);backdrop.depth.set(depth);
        }else backdrop=undefined;
      }
      if(canCache){
        // A hidden ancestor suppresses the entire animated subtree, as it does
        // for a full traversal. The caller normally hides the cat off-screen.
        let ancestor=dynamicRoot.parent;
        while(ancestor?.visible)ancestor=ancestor.parent;
        if(!ancestor)collectMeshes(dynamicRoot,camera,submit);
      }
      transparent.sort((a,b)=>b.d-a.d);
      for(const t of transparent)draw(t.mesh,t.model,t.g,t.m,t.start,t.end);
      ctx.putImageData(image,0,0);
    },
    dispose(){backdrop=undefined;textureCache=new WeakMap();if(surface!==canvas){surface.remove();canvas.style.opacity='';}delete surface.dataset.renderer;}
  };
}
