// Small orthographic renderer for the close-up. The desk mesh and this view use
// the same page atlas, measurements and bending equations. No WebGL is needed.
import { BOOK_WIDTH as W, BOOK_DEPTH as D, coverPose, leafPosition } from './notebook-geometry.js';

export function paintNotebook(ctx, atlas, width, height, progress, deskCrop=null) {
  const hinge=coverPose(progress), spread=hinge.angle/Math.PI;
  const yaw=-.145, elevation=1.03;
  const cy=Math.cos(yaw), sy=Math.sin(yaw), ce=Math.cos(elevation), se=Math.sin(elevation);
  // Frame the physical volume even when the free corner is at its apex.
  // Sampling the same curves avoids a camera jump when the sheet reverses.
  const framePoints=[];
  for(const z of [-D/2,D/2]){
    framePoints.push([0,0,z],[W,0,z],[0,hinge.height,z],[W*Math.cos(hinge.angle),hinge.height+W*Math.sin(hinge.angle),z]);
    for(let i=0;i<=8;i++)for(const backing of [false,true])framePoints.push(leafPosition(progress,i/8,z<0?0:1,backing,[0,0,0]));
  }
  framePoints.push([.13,.012,.44]);
  const vertical=framePoints.map(([x,y,z])=>se*(sy*x+cy*z)-ce*y);
  const top=Math.min(...vertical),bottom=Math.max(...vertical);
  const scale=Math.min(width/(1.47+.36*spread),height/(bottom-top+.20));
  const verticalCenter=(top+bottom)/2;
  const center=(1-spread)*W*.5+.005;
  function project([x,y,z]) {
    if(deskCrop) {
      // Calibrated against the four photographed corners in the 1536px image.
      const depth=z/D+.5, dy=y-.123, perspective=1-.143*depth-.035*dy;
      return [(732+(562+x/W*217-732)/perspective-deskCrop.x)*width/deskCrop.w,
        (500+(44.0*depth-229*dy)/perspective-deskCrop.y)*height/deskCrop.h,
        .79*z+.46*y];
    }
    x-=center;
    const depth=sy*x+cy*z;
    return [width/2+scale*(cy*x-sy*z),height*.5+scale*(se*depth-ce*y-verticalCenter+se*sy*center),ce*depth+se*y];
  }
  function polygon(points,fill) {
    ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
  }
  function textureTriangle(points, coords, panel, shade) {
    const [a,b,c]=points, [[u,v],[u1,v1],[u2,v2]]=coords;
    const du=u1-u,dv=v1-v,eu=u2-u,ev=v2-v, det=du*ev-eu*dv;
    const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cdy=c[1]-a[1];
    if(Math.abs(bx*cdy-by*cx)<.026 || !det) return;
    const m=(bx*ev-cx*dv)/det,n=(by*ev-cdy*dv)/det;
    const o=(cx*du-bx*eu)/det,p=(cdy*du-by*eu)/det;
    ctx.save(); ctx.beginPath();
    // Expand each clip by a fraction of a pixel to hide antialias seams between
    // abutting triangles. The image mapping itself stays unchanged.
    const winding=Math.sign(bx*cdy-by*cx);
    const normals=points.map(([x,y],i)=>{
      const next=points[(i+1)%3],dx=next[0]-x,dy=next[1]-y,l=Math.hypot(dx,dy)||1;
      return [winding*dy/l,-winding*dx/l];
    });
    points.forEach(([x,y],i)=>{
      const first=normals[(i+2)%3],next=normals[i];
      const factor=Math.min(2.4,.40/Math.max(.05,1+first[0]*next[0]+first[1]*next[1]));
      const px=x+(first[0]+next[0])*factor,py=y+(first[1]+next[1])*factor;
      if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
    });
    ctx.closePath();ctx.clip();
    ctx.transform(m,n,o,p,a[0]-m*u-o*v,a[1]-n*u-p*v);
    const x0=Math.max(0,Math.min(u,u1,u2)-.01),x1=Math.min(1,Math.max(u,u1,u2)+.01);
    const y0=Math.max(0,Math.min(v,v1,v2)-.01),y1=Math.min(1,Math.max(v,v1,v2)+.01);
    const tw=x1-x0,th=y1-y0;
    ctx.drawImage(atlas,(panel%2+x0)*512,(Math.floor(panel/2)+y0)*512,tw*512,th*512,x0,y0,tw,th);
    if(shade>.012){ctx.fillStyle='rgba(55,41,23,'+shade+')';ctx.fillRect(x0,y0,tw,th);}
    ctx.restore();
  }
  const transform=(x,y,z,angle,lift)=>[Math.cos(angle)*x-Math.sin(angle)*y,lift+Math.sin(angle)*x+Math.cos(angle)*y,z];
  function surface(sample, panel, across, rows, doubleSided=true) {
    const grid=[];
    for(let k=0;k<=rows;k++) for(let i=0;i<=across;i++) grid.push(project(sample(i/across,k/rows)));
    const facets=[];
    for(let k=0;k<rows;k++) for(let i=0;i<across;i++){
      const a=k*(across+1)+i, b=a+1, d=a+across+1, e=d+1;
      const uv=[[i/across,k/rows],[(i+1)/across,k/rows],[i/across,(k+1)/rows],[(i+1)/across,(k+1)/rows]];
      for(const [idx,tex] of [[[a,b,e],[uv[0],uv[1],uv[3]]],[[a,e,d],[uv[0],uv[3],uv[2]]]]){
        const tri=idx.map(j=>grid[j]);
        const [A,B,C]=tri;
        const facing=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
        if(!doubleSided && facing<0) continue;
        const reverse=facing<0;
        const color=reverse ? panel[1] : panel[0];
        const coords=reverse ? tex.map(([u,v])=>[1-u,v]) : tex;
        const normal=Math.min(1,Math.abs(facing)/(scale*scale*W*D/(rows*across)));
        const shade=.035+.22*(1-normal);
        if(color===null) continue;
        facets.push({tri,coords,color,shade,depth:(A[2]+B[2]+C[2])/3});
      }
    }
    facets.sort((a,b)=>a.depth-b.depth);
    for(const {tri,coords,color,shade} of facets) {
      if(typeof color==='number') textureTriangle(tri,coords,color,shade);
      else {polygon(tri,color);ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.stroke();}
    }
  }
  // Rounded boards have separate cut edges, an inset bevel and a cloth top.
  function contour(x0,x1,z0,z1,r) {
    const points=[];
    for(const [xc,zc,start] of [[x1-r,z1-r,0],[x0+r,z1-r,Math.PI/2],[x0+r,z0+r,Math.PI],[x1-r,z0+r,Math.PI*1.5]]){
      for(let i=0;i<=4;i++) points.push([xc+r*Math.cos(start+i*Math.PI/8),zc+r*Math.sin(start+i*Math.PI/8)]);
    }
    return points;
  }
  const boardLine=contour(-.009,W+.009,-D/2-.006,D/2+.006,.028);
  function plate(line,lo,hi,angle,lift,top,edge,bottom) {
    const ring=y=>line.map(([x,z])=>project(transform(x,y,z,angle,lift)));
    const lower=ring(lo),upper=ring(hi);
    const faces=[{points:lower,fill:bottom},{points:upper,fill:top}];
    for(let i=0;i<line.length;i++){
      const j=(i+1)%line.length;
      faces.push({points:[lower[i],lower[j],upper[j],upper[i]],fill:edge});
    }
    for(const face of faces) face.depth=face.points.reduce((d,p)=>d+p[2],0)/face.points.length;
    // Convex solid: draw the rear, near-facing cap, then the visible vertical
    // walls of the near edge. Sorting wall centres alone can cut off a cap.
    const cap=upper[0][2]>lower[0][2]?upper:lower;
    const edges=faces.slice(2).sort((a,b)=>a.depth-b.depth);
    for(const f of edges) polygon(f.points,f.fill);
    polygon(cap,cap===upper?top:bottom);
  }
  function board(front) {
    const angle=front?hinge.angle:0,lift=front?hinge.height:.015;
    plate(boardLine,-.012,.011,angle,lift,'#405442','#2b3c31','#354735');
    if(front && hinge.angle>.98){
      const liner=contour(.011,W-.017,-D/2+.014,D/2-.014,.013);
      const world=(x,z)=>project(transform(x,-.0128,z,angle,lift));
      if(Math.cos(angle)*se+Math.sin(angle)*sy*ce<0){
        polygon(liner.map(([x,z])=>world(x,z)),'#d7c9a9');
        ctx.strokeStyle='#bfb191';ctx.lineWidth=.65;
        for(let i=0;i<30;i++){
          const x=.013+i*.027;
          const a=world(x,-D/2+.021),b=world(x,D/2-.021);
          ctx.beginPath();ctx.moveTo(...a.slice(0,2));ctx.lineTo(...b.slice(0,2));ctx.stroke();
        }
      }
    }
    if(front) surface((u,v)=>transform(.008+u*(W-.014),.0115,(v-.5)*(D-.016),angle,lift),[0,null],1,1,false);
  }
  function bookmark() {
    const ribbon=[[.095,.019,.24],[.130,.019,.24],[.144,.013,.431],[.122,.014,.410],[.107,.013,.432]];
    polygon(ribbon.map(project),'#853e33');
  }
  const paperLine=contour(.014,W-.011,-D/2+.017,D/2-.017,.012);
  function base() {
    board(false); bookmark();
    plate(paperLine,.027,.088,0,0,'#e5d7b6','#cfbd9e','#ae997b');
    // Distinct sewn gatherings show along the cut fore-edge and fore corner.
    for(let k=0;k<7;k++){
      const h=.031+k*.008;
      const trace=[[.021,h,D/2-.017],[W-.022,h+.001,D/2-.017],[W-.012,h+.002,D/2-.026],[W-.011,h+.002,-D/2+.03]].map(project);
      ctx.strokeStyle=k%2?'#e5d8bd':'#b6a486';ctx.lineWidth=.65;
      ctx.beginPath();trace.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    }
    surface((u,v)=>[.016+u*(W-.038),.091+.006*Math.cos(u*Math.PI/2),(v-.5)*(D-.038)],[3,null],2,1,false);
  }
  function leaf(backing) {
    surface((u,v)=>leafPosition(progress,u,v,backing,[0,0,0]),backing?['#e9ddc3','#daccaf']:[1,2],backing?9:14,3);
  }
  ctx.clearRect(0,0,width,height);
  // The desk plane receives a contact shadow under the binding and fore-edge.
  if(!deskCrop){
    const shadow=project([(1-spread)*W*.5,-.018,.022]);
    ctx.save();
    ctx.translate(shadow[0],shadow[1]);ctx.rotate(-.09);
    ctx.scale(scale*W*(.68+.50*spread),scale*D*.56);
    const falloff=ctx.createRadialGradient(0,0,.17,0,0,1);
    falloff.addColorStop(0,'rgba(8,11,8,.63)');falloff.addColorStop(.67,'rgba(8,11,8,.34)');falloff.addColorStop(1,'rgba(8,11,8,0)');
    ctx.fillStyle=falloff;ctx.fillRect(-1,-1,2,2);ctx.restore();
    base();
  } else {
    // The photograph already supplies the desk, the cast shadow and the bound
    // page block. Only replace the top planes when the physical cover rises.
    surface((u,v)=>[.006+u*(W-.002),.095,(v-.5)*(D-.005)],[3,null],3,2,false);
  }
  if (progress>.38) board(true);
  if(progress>.43 && progress<.974) leaf(true);
  leaf(false);
  if (progress<=.38) board(true);
  // Saddle stitches disappear into the gutter, with a linen headband at its foot.
  const band=project([.002,.052,D/2+.002]);
  ctx.strokeStyle='#bc9d66';ctx.lineWidth=Math.max(1,scale*.006);
  ctx.beginPath();ctx.moveTo(band[0],band[1]);ctx.lineTo(band[0]+scale*.012,band[1]+scale*.015);ctx.stroke();
}
