// A small perspective renderer for devices without WebGL2. Geometry stays in
// world units. Faces are clipped in camera space before perspective division.
export function geometry() {
  const faces = [];
  function face(points, color, options = {}) {
    if (points.length < 3) return;
    const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]] = points;
    const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    const n = Math.hypot(nx,ny,nz) || 1;
    const light = .72 + .23*Math.abs(ny/n) + .13*Math.abs((nx*.9 - nz*.4)/n);
    faces.push({ points, color, light, options });
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
  return {faces,box,face,frustum,roof,text};
}

const near=.075;
function clip(vertices) {
  const out=[];let a=vertices[vertices.length-1];
  for(const b of vertices){
    if((a[2]>=near)!==(b[2]>=near)){
      const v=(near-a[2])/(b[2]-a[2]);
      out.push([a[0]+v*(b[0]-a[0]),a[1]+v*(b[1]-a[1]),near]);
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
  const project=([x,y,z])=>[width*.5+focal*x/z,height*.5-focal*y/z,1/z];
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
  // Scan conversion of a triangle uses reciprocal depth, which varies linearly
  // across the projected surface. Very large walls never cover smaller props
  // that are nearer to the eye. The same winning pixel identifies a picked prop.
  function triangle(a,b,c,color,id,bias){
    if(a[1]>b[1])[a,b]=[b,a];if(b[1]>c[1])[b,c]=[c,b];if(a[1]>b[1])[a,b]=[b,a];
    const total=c[1]-a[1];if(total<.00001)return;
    const longX=(c[0]-a[0])/total,longZ=(c[2]-a[2])/total;
    const area=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
    if(Math.abs(area)<.00001)return;
    const dz=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/area;
    for(let half=0;half<2;half++){
      const p=half?b:a,q=half?c:b,dy=q[1]-p[1];if(dy<.00001)continue;
      const y0=Math.max(0,Math.ceil(p[1]-.5)),y1=Math.min(height,Math.ceil(q[1]-.5));
      const shortX=(q[0]-p[0])/dy;
      let xl=a[0]+(y0+.5-a[1])*longX,xs=p[0]+(y0+.5-p[1])*shortX,zl=a[2]+(y0+.5-a[1])*longZ+bias;
      for(let y=y0;y<y1;y++,xl+=longX,xs+=shortX,zl+=longZ){
        const left=Math.max(0,Math.ceil(Math.min(xl,xs)-.5)),right=Math.min(width,Math.ceil(Math.max(xl,xs)-.5));
        let z=zl+(left+.5-xl)*dz,index=y*width+left;
        for(let x=left;x<right;x++,index++,z+=dz){
          if(z>=depth[index]){depth[index]=z;pixels[index]=color;hit[index]=id;}
        }
      }
    }
  }
  function draw(model,cam,w,h,{outdoor=false,night=false,progress={}}={}) {
    logicalW=w;logicalH=h;width=ctx.canvas.width;height=ctx.canvas.height;camera=cam;
    focal=height*.5/Math.tan(cam.fov*Math.PI/360);
    cy=Math.cos(cam.yaw);sy=Math.sin(cam.yaw);cp=Math.cos(cam.pitch);sp=Math.sin(cam.pitch);
    allocate();depth.fill(0);hit.fill(0);ids=[null];background(outdoor,night);
    const sky=night?[58,66,85]:[206,218,204], labels=[];
    const idMap=new Map();
    for(const f of model.faces){
      const o=f.options;if(o.visible&&!o.visible(progress))continue;
      let pts=f.points.map(p=>view(o.transform?o.transform(...p,progress):p));
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
      for(let j=1;j<points.length-1;j++)triangle(points[0],points[j],points[j+1],color,id,bias);
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
  return {draw,pick,screen};
}
