// A small perspective renderer for devices without WebGL2. Geometry stays in
// world units. Faces are clipped in camera space before perspective division.
export function geometry() {
  const faces = [],textureSources=new Map();
  function registerTexture(key,path,options={}){
    const district=options.district||(['okuma-statue','okuma-auditorium','karatsu-castle','karatsu-bank'].includes(key)?key:null);
    textureSources.set(key,{path,district,maxSize:options.maxSize||1536,repeat:!!options.repeat});
    return key;
  }
  function face(points, color, options = {}) {
    if (points.length < 3) return;
    const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]] = points;
    const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    const n = Math.hypot(nx,ny,nz) || 1;
    const light = .72 + .23*Math.abs(ny/n) + .13*Math.abs((nx*.9 - nz*.4)/n);
    let uv=options.uv;
    if(options.texture&&!uv){
      const size=options.tile||1,major=Math.max(Math.abs(nx),Math.abs(ny),Math.abs(nz));
      uv=points.map(([x,y,z])=>major===Math.abs(ny)?[x/size,z/size]:
        major===Math.abs(nx)?[z/size,-y/size]:[x/size,-y/size]);
    }
    // Homogeneous source coordinates let an oblique plane retain the exact
    // source-camera perspective, including under camera translation.
    const uvq=uv?.map(([u,v,q=1])=>[u*q,v*q,q]);
    let bounds;
    if(!options.transform){
      const center=[0,0,0];
      for(const p of points)for(let k=0;k<3;k++)center[k]+=p[k]/points.length;
      let radius=0;
      for(const p of points)radius=Math.max(radius,Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]));
      bounds=[...center,radius];
    }
    faces.push({points,color,light,options,uvq,bounds});
  }
  function box(x,y,z,w,h,d,color,o) {
    const X=w/2,Y=h/2,Z=d/2;
    const a=[x-X,y-Y,z-Z], b=[x+X,y-Y,z-Z], c=[x+X,y+Y,z-Z], e=[x-X,y+Y,z-Z];
    const f=[x-X,y-Y,z+Z],g=[x+X,y-Y,z+Z],k=[x+X,y+Y,z+Z],m=[x-X,y+Y,z+Z];
    for (const p of [[a,e,c,b],[f,g,k,m],[a,f,m,e],[b,c,k,g],[e,m,k,c],[a,b,g,f]]) face(p,color,o);
  }
  function frustum(x,y,z,b,t,h,n,color,o) {
    const lo=[],hi=[];
    for(let i=0;i<n;i++){const a=2*Math.PI*i/n, c=Math.cos(a), s=Math.sin(a);lo.push([x+b*c,y-h/2,z+b*s]); hi.push([x+t*c,y+h/2,z+t*s]);}
    for(let i=0;i<n;i++){let j=(i+1)%n;face([lo[i],hi[i],hi[j],lo[j]],color,o);}
    if(t>0)face(hi,color,o);if(b>0)face(lo,color,o);
  }
  function roof(x,y,z,w,h,d,color,o) {
    const A=[x-w/2,y-h/2,z-d/2],B=[x+w/2,y-h/2,z-d/2],C=[x+w/2,y-h/2,z+d/2],D=[x-w/2,y-h/2,z+d/2];
    const a=[x-w/2,y+h/2,z],b=[x+w/2,y+h/2,z];
    for(const p of [[A,a,b,B],[D,C,b,a],[A,D,a],[B,b,C]])face(p,color,o);
  }
  const text=(x,y,z,label,color,size,options={}) => faces.push({points:[[x,y,z]],label,size,color,light:1,options});
  return {faces,box,face,frustum,roof,text,textureSources,registerTexture};
}

const near=.075;
function clip(vertices) {
  const out=[];let a=vertices[vertices.length-1];
  for(const b of vertices){
    if((a[2]>=near)!==(b[2]>=near)){
      const v=(near-a[2])/(b[2]-a[2]);
      const point=a.map((value,i)=>value+v*(b[i]-value));point[2]=near;out.push(point);
    }
    if(b[2]>=near)out.push(b);
    a=b;
  }
  return out;
}
// The color buffer is shared by Uint8ClampedArray and packed RGB views.
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const pack = littleEndian
  ? (r,g,b) => (255<<24)|(b<<16)|(g<<8)|r
  : (r,g,b) => (r<<24)|(g<<16)|(b<<8)|255;
const asByte = n => Math.max(0,Math.min(255,Math.round(n)));
const rgbCache=new Map();
function channels(color) {
  let rgb=rgbCache.get(color);
  if(!rgb){const n=typeof color==='number'?color:parseInt(color.replace('#',''),16);rgb=[n>>16&255,n>>8&255,n&255];rgbCache.set(color,rgb);}
  return rgb;
}
function colorAt(hex,light,night,fog,sky) {
  const c=channels(hex),r=c[0]*light*(night?.66:1),g=c[1]*light*(night?.71:1),b=c[2]*light*(night?.86:1);
  return pack(asByte(r+(sky[0]-r)*fog),asByte(g+(sky[1]-g)*fog),asByte(b+(sky[2]-b)*fog));
}
export function perspective(ctx) {
  let width=0,height=0,logicalW,logicalH,focal,camera,cy,sy,cp,sp;
  let image,pixels,depth,hit,ids;
  function view([x,y,z]) {
    x-=camera.x;y-=camera.y;z-=camera.z;
    const forward=x*sy+z*cy;
    return [x*cy-z*sy,y*cp-forward*sp,y*sp+forward*cp];
  }
  function project(p) {
    const inv=1/p[2],v=[width*.5+focal*p[0]*inv,height*.5-focal*p[1]*inv,inv];
    if(p.length>3)v.push(p[3]*inv,p[4]*inv,p[5]*inv);
    return v;
  }
  function screen(point) {
    const v=view(point);if(v[2]<near)return null;
    const [x,y]=project(v);return x>=0&&y>=0&&x<=width&&y<=height?[x/width,y/height]:null;
  }
  function allocate(){
    if(image&&image.width===width&&image.height===height)return;
    image=ctx.createImageData(width,height);pixels=new Uint32Array(image.data.buffer);
    depth=new Float32Array(width*height);hit=new Uint16Array(width*height);
  }
  function background(outdoor,night){
    const top=channels(outdoor?(night?'#1e2b43':'#84b4d0'):(night?'#423f49':'#c8b797'));
    const horizonSky=channels(outdoor?(night?'#384457':'#e9e4ce'):(night?'#503e32':'#855d41'));
    const horizonGround=channels(night?'#384446':'#829a76'), land=channels(night?'#333c39':'#a5ac83');
    const horizon=outdoor?height*.5+focal*Math.tan(camera.pitch):height;
    for(let y=0;y<height;y++){
      let a=top,b=horizonSky,t=y/Math.max(1,horizon);
      if(y>horizon){a=horizonGround;b=land;t=(y-horizon)/Math.max(1,height-horizon);}
      t=Math.max(0,Math.min(1,t));
      pixels.fill(pack(asByte(a[0]+(b[0]-a[0])*t),asByte(a[1]+(b[1]-a[1])*t),asByte(a[2]+(b[2]-a[2])*t)),y*width,(y+1)*width);
    }
  }
  // Color channels R/B and G can be interpolated in pairs without losing alpha
  // precision at silhouette edges. Transparent texels never write depth.
  function blend(a,b,t) {
    const rb=(((a&0xff00ff)*(256-t)+(b&0xff00ff)*t)>>>8)&0xff00ff;
    const g=(((a&0x00ff00)*(256-t)+(b&0x00ff00)*t)>>>8)&0x00ff00;
    return rb|g|0xff000000;
  }
  function edgeWidths(feather){
    if(!feather)return null;
    const widths=Array.isArray(feather)?feather:[feather,feather,feather,feather];
    return widths.map(v=>v>0?1/v:0);
  }
  function textureSpan(mat,level,interpolate,left,right,row,z,dz,uq,du,vq,dv,q,dq,id) {
    const {width:tw,height:th,pixels:texels}=level,repeat=mat.image.repeat;
    const maxX=tw-1,maxY=th-1;
    for(let x=left,index=row+left;x<right;x++,index++,z+=dz,uq+=du,vq+=dv,q+=dq){
      if(z<depth[index]||q<=0)continue;
      let u=uq/q,v=vq/q;
      if(repeat){u-=Math.floor(u);v-=Math.floor(v);}
      const fx=Math.max(0,Math.min(maxX,u*tw-.5)),fy=Math.max(0,Math.min(maxY,v*th-.5)),ix=fx|0,iy=fy|0;
      let color=texels[iy*tw+ix];
      const alpha=littleEndian?color>>>24:color&255;
      let opacity=255;
      if(mat.soft){
        const edge=mat.edge;
        if(edge){
          const rect=mat.edgeRect,eu=rect?(u-rect[0])*rect[2]:u,ev=rect?(v-rect[1])*rect[3]:v;
          opacity=255*Math.max(0,Math.min(1,edge[0]?eu*edge[0]:1,edge[1]?ev*edge[1]:1,
            edge[2]?(1-eu)*edge[2]:1,edge[3]?(1-ev)*edge[3]:1));
        }
        opacity=opacity*alpha/255;
        if(opacity<1||(mat.translucent?opacity>=254:opacity<254))continue;
      }else if(alpha<96)continue;
      if(interpolate&&alpha===255&&ix<maxX&&iy<maxY&&littleEndian){
        const tx=((fx-ix)*256)|0,ty=((fy-iy)*256)|0,pos=iy*tw+ix;
        const b=texels[pos+1],c=texels[pos+tw],d=texels[pos+tw+1];
        if((b&c&d)>>>24===255)color=blend(blend(color,b,tx),blend(c,d,tx),ty);
      }
      if(!mat.identity){
        const r=littleEndian?color&255:color>>>24,g=littleEndian?(color>>>8)&255:(color>>>16)&255,b=littleEndian?(color>>>16)&255:(color>>>8)&255;
        color=pack(asByte(r*mat.r),asByte(g*mat.g),asByte(b*mat.b));
      }else color=littleEndian?color|0xff000000:color|255;
      if(mat.translucent){
        if(littleEndian)pixels[index]=blend(pixels[index],color,opacity|0);
        else{
          const prev=pixels[index],u=opacity/255;
          const mix=shift=>asByte(((prev>>>shift)&255)*(1-u)+((color>>>shift)&255)*u);
          pixels[index]=pack(mix(24),mix(16),mix(8));
        }
        if(opacity>=128)hit[index]=id;
      }else{depth[index]=z;pixels[index]=color;hit[index]=id;}
    }
  }
  function triangle(a,b,c,color,id,bias,mat){
    if(a[1]>b[1])[a,b]=[b,a];if(b[1]>c[1])[b,c]=[c,b];if(a[1]>b[1])[a,b]=[b,a];
    const total=c[1]-a[1];if(total<.00001)return;
    const longX=(c[0]-a[0])/total,longZ=(c[2]-a[2])/total;
    const area=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
    if(Math.abs(area)<.00001)return;
    const gx=i=>((b[i]-a[i])*(c[1]-a[1])-(c[i]-a[i])*(b[1]-a[1]))/area;
    const gy=i=>((c[i]-a[i])*(b[0]-a[0])-(b[i]-a[i])*(c[0]-a[0]))/area;
    const dz=gx(2);
    let du,dv,dq,longU,longV,longQ,level,interpolate;
    if(mat){
      du=gx(3);dv=gx(4);dq=gx(5);longU=(c[3]-a[3])/total;longV=(c[4]-a[4])/total;longQ=(c[5]-a[5])/total;
      const q=(a[5]+b[5]+c[5])/3,u=(a[3]+b[3]+c[3])/(3*q),v=(a[4]+b[4]+c[4])/(3*q);
      const base=mat.image.levels[0], dx=Math.hypot((du-u*dq)*base.width,(dv-v*dq)*base.height);
      const dy=Math.hypot((gy(3)-u*gy(5))*base.width,(gy(4)-v*gy(5))*base.height);
      const footprint=Math.max(dx,dy)/Math.abs(q);
      const mip=Math.min(mat.image.levels.length-1,Math.max(0,Math.floor(Math.log2(Math.max(1,footprint)))));
      level=mat.image.levels[mip];interpolate=mat.filter;
    }
    for(let half=0;half<2;half++){
      const p=half?b:a,t=half?c:b,dy=t[1]-p[1];if(dy<.00001)continue;
      const y0=Math.max(0,Math.ceil(p[1]-.5)),y1=Math.min(height,Math.ceil(t[1]-.5));
      const shortX=(t[0]-p[0])/dy;
      let xl=a[0]+(y0+.5-a[1])*longX,xs=p[0]+(y0+.5-p[1])*shortX,zl=a[2]+(y0+.5-a[1])*longZ+bias;
      for(let y=y0;y<y1;y++,xl+=longX,xs+=shortX,zl+=longZ){
        const left=Math.max(0,Math.ceil(Math.min(xl,xs)-.5)),right=Math.min(width,Math.ceil(Math.max(xl,xs)-.5));
        const dx=left+.5-xl;let z=zl+dx*dz,index=y*width+left;
        if(mat){
          const dy=y+.5-a[1];
          textureSpan(mat,level,interpolate,left,right,y*width,z,dz,a[3]+dy*longU+dx*du,du,a[4]+dy*longV+dx*dv,dv,a[5]+dy*longQ+dx*dq,dq,id);
        }else for(let x=left;x<right;x++,index++,z+=dz){
          if(z>=depth[index]){depth[index]=z;pixels[index]=color;hit[index]=id;}
        }
      }
    }
  }
  let texturedFaces=0;
  function draw(model,cam,w,h,{outdoor=false,night=false,progress={},district='',textures,fast=false}={}) {
    logicalW=w;logicalH=h;width=ctx.canvas.width;height=ctx.canvas.height;camera=cam;
    focal=height*.5/Math.tan(cam.fov*Math.PI/360);
    cy=Math.cos(cam.yaw);sy=Math.sin(cam.yaw);cp=Math.cos(cam.pitch);sp=Math.sin(cam.pitch);
    allocate();depth.fill(0);hit.fill(0);ids=[null];background(outdoor,night);
    const sky=night?[58,66,85]:[206,218,204], labels=[];
    const idMap=new Map(),surfaces=[];texturedFaces=0;
    const tanY=height/(2*focal),tanX=width/(2*focal),planeX=Math.hypot(1,tanX),planeY=Math.hypot(1,tanY);
    for(const f of model.faces){
      const o=f.options;if((o.visible&&!o.visible(progress))||(o.districtOnly&&o.districtOnly.replace(/^landmark-/,'')!==district))continue;
      if(f.bounds){
        const r=f.bounds[3],[x,y,z]=view(f.bounds);
        if(z+r<near||Math.abs(x)>z*tanX+r*planeX||Math.abs(y)>z*tanY+r*planeY||r*focal<z*.13)continue;
      }
      const tex=o.texture&&textures?.get(o.texture);
      let pts=f.points.map((p,i)=>{
        const xyz=view(o.transform?o.transform(...p,progress):p);
        return tex&&f.uvq?xyz.concat(f.uvq[i]):xyz;
      });
      if(pts.every(p=>p[2]<near))continue;
      const dep=pts.reduce((a,p)=>a+p[2],0)/pts.length;
      if(!f.label&&pts.some(v=>v[2]<near)){pts=clip(pts);if(pts.length<3)continue;}
      const points=pts.map(project);
      if(points.every(p=>p[0]<0)||points.every(p=>p[0]>=width)||points.every(p=>p[1]<0)||points.every(p=>p[1]>=height))continue;
      const fog=outdoor?Math.min(.60,Math.max(0,(dep-17)*.011)):0;
      const hex=o.tint?o.tint(progress):f.color;
      if(f.label){labels.push({points,hex,f,size:f.size*focal/dep});continue;}
      const color=colorAt(hex,f.light,night&&!o.glow,fog,sky);
      let id=0;if(o.id){if(!idMap.has(o.id)){idMap.set(o.id,ids.length);ids.push(o.id);}id=idMap.get(o.id);}
      const bias=o.layer==='ground'?(o.order||0)*.00000005:0;
      let mat=null;
      if(tex&&f.uvq){
        const bright=typeof o.textureBrightness==='function'?o.textureBrightness(progress):(o.textureBrightness??1);
        const dark=night&&!o.glow;
        const rect=o.featherUV;
        const edgeRect=rect?[rect[0],rect[1],1/(rect[2]-rect[0]),1/(rect[3]-rect[1])]:null;
        mat={image:tex,edgeRect,soft:!!(o.feather||o.blend),edge:edgeWidths(o.feather),filter:!fast,identity:!dark&&bright===1,r:bright*(dark?.85:1),g:bright*(dark?.86:1),b:bright*(dark?.93:1)};
        texturedFaces++;
      }
      surfaces.push({points,color,id,bias,mat,dep});
    }
    // Depth still resolves every overlap. Near-first order skips texture reads
    // for hidden architecture, trees, furnishings and the distant backdrop.
    surfaces.sort((a,b)=>a.dep-b.dep);
    for(const {points,color,id,bias,mat} of surfaces){
      for(let j=1;j<points.length-1;j++)triangle(points[0],points[j],points[j+1],color,id,bias,mat);
    }
    // Only soft image edges participate in the second pass. Keeping their
    // reciprocal depth against opaque surfaces preserves intervening geometry.
    for(let i=surfaces.length-1;i>=0;i--){
      const {points,color,id,bias,mat}=surfaces[i];
      if(!mat?.soft)continue;
      mat.translucent=true;
      for(let j=1;j<points.length-1;j++)triangle(points[0],points[j],points[j+1],color,id,bias,mat);
    }
    ctx.putImageData(image,0,0);
    for(const {points,hex,f,size} of labels){
      const [x,y,inv]=points[0];if(size<6||inv+.001<depth[(y|0)*width+(x|0)])continue;
      ctx.fillStyle=hex;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='600 '+(size*h/height).toFixed(1)+'px "Yu Mincho","Hiragino Mincho ProN",serif';ctx.fillText(f.label,x*w/width,y*h/height);
    }
  }
  function pick(x,y) {
    const ix=Math.floor(x*width/logicalW),iy=Math.floor(y*height/logicalH);
    return ix>=0&&iy>=0&&ix<width&&iy<height?ids[hit[iy*width+ix]]:null;
  }
  return {draw,pick,screen,get texturedFaces(){return texturedFaces;}};
}
