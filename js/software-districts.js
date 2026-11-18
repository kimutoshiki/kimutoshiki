// Each plate is a single dated view of a modeled place. A pinhole projector
// turns the traced points into metric geometry. Its texture coordinates retain
// source-camera depth so that even the street remains aligned on an oblique walk.
import {buildSoftwareStatue} from './software-statue.js';
import {LANDMARK_SITES, OUTDOOR_VIEWS} from '../scene/world-layout.js';

const ASPECT = 1.5;
const definitions = {
  'okuma-auditorium': { name:'大隈講堂', at:[.513,.827], fov:52, horizon:'waseda-horizon' },
  'okuma-statue': { name:'大隈重信像', at:[.508,.832], fov:42, horizon:'waseda-horizon' },
  'karatsu-castle': { name:'唐津城・本丸', at:[.535,.862], fov:45, horizon:'castle-horizon', elevation:40 },
  'karatsu-bank': { name:'旧唐津銀行', at:[.523,.849], fov:43, horizon:'bank-horizon' }
};

for(const site of LANDMARK_SITES) {
  definitions[site.key].anchor=site.position;
  definitions[site.key].eye=OUTDOOR_VIEWS[site.key].eye;
}

function cameraFor(key) {
  const d=definitions[key], elevation=d.elevation||0, height=1.62, eyeY=elevation+height, focal=2*Math.tan(d.fov*Math.PI/360);
  const dx=d.anchor[0]-d.eye[0],dz=d.anchor[1]-d.eye[1],distance=Math.hypot(dx,dz);
  const pitch=Math.atan((d.at[1]-.5)*focal)-Math.atan(height/distance);
  const yaw=Math.atan2(dx,dz)-Math.atan((d.at[0]-.5)*focal*ASPECT);
  const sin=Math.sin(yaw), cos=Math.cos(yaw), sp=Math.sin(pitch), cp=Math.cos(pitch);
  const right=[cos,0,-sin], up=[-sin*sp,cp,-cos*sp], forward=[sin*cp,sp,cos*cp];
  const ray=(u,v)=>forward.map((a,k)=>a+(u-.5)*focal*ASPECT*right[k]+(.5-v)*focal*up[k]);
  const [x,z]=d.eye;
  const pose={name:d.name,x,z,eyeY, fov:d.fov,pitch,yaw,
    targetX:x+9*forward[0],targetY:eyeY+9*forward[1],targetZ:z+9*forward[2]};
  function point(u,v,q) {
    const a=ray(u,v);
    return [x+a[0]*q,eyeY+a[1]*q,z+a[2]*q];
  }
  function ground(u,v,h=0) { return (h-height)/ray(u,v)[1]; }
  // Roof and parapet corners in the reference are not ground survey points.
  // Keep returns within the measured building depth when a traced corner
  // approaches the source picture's perspective horizon.
  function base(u,v){return Math.min(distance*1.41,Math.max(distance*.66,ground(u,v)));}
  function project(p) {
    const dx=p[0]-x,dy=p[1]-eyeY,dz=p[2]-z;
    const dot=a=>dx*a[0]+dy*a[1]+dz*a[2],q=dot(forward);
    return [.5+dot(right)/(q*focal*ASPECT),.5-dot(up)/(q*focal),q];
  }
  return {pose,point,ground,base,ray,project};
}

const cameras=Object.fromEntries(Object.keys(definitions).map(k=>[k,cameraFor(k)]));
export const PHOTO_PLACES=Object.fromEntries(Object.entries(cameras).map(([k,c])=>['landmark-'+k,c.pose]));

function district(s,key) {
  const id='landmark-'+key, camera=cameras[key], only={districtOnly:key};
  s.registerTexture?.(key,'../images/outdoors/'+key+'-1280.webp',{district:key,maxSize:1536});
  function face(uvq,col='#b6a789',opts={}) {
    s.face(uvq.map(p=>camera.point(...p)),col,{texture:key,uv:uvq,id,...opts});
  }
  function world(points,uv,col,opts={}) {s.face(points,col,{texture:key,uv,id,...opts});}
  // A perspective wall needs a depth for every ray, including the top corners.
  // Derive a real vertical plane through its two measured feet on the ground.
  function wall(a,b) {
    const p=camera.point(a[0],a[1],camera.base(...a)), q=camera.point(b[0],b[1],camera.base(...b));
    const nx=b[0]===a[0]&&b[1]===a[1]?1:q[2]-p[2],nz=p[0]-q[0];
    return (u,v)=>{
      const r=camera.ray(u,v);
      return ((p[0]-camera.pose.x)*nx+(p[2]-camera.pose.z)*nz)/(nx*r[0]+nz*r[2]);
    };
  }
  function panel(outline,surface,col,opts={}) {
    face(outline.map(([u,v])=>[u,v,surface(u,v)]),col,opts);
  }
  function floorLine(line,col='#b6aa95') {
    const bottom=1, elevated=.023;
    for(let i=0;i+1<line.length;i++) {
      const [u,a]=line[i],[v,b]=line[i+1];
      panel([[u,a],[v,b],[v,bottom],[u,bottom]],(x,y)=>camera.ground(x,y,elevated),col,{...only,id:undefined,feather:[.085,0,.085,.12],nearView:[camera.pose.x,camera.pose.z,15,33]});
    }
  }
  function farFace(outline,depth,col,opts={}) {
    const surface=typeof depth==='number'?()=>depth:depth;
    panel(outline,surface,col,{...only,id:undefined,...opts});
  }
  function groundPoint(u,v){return camera.point(u,v,camera.base(u,v));}
  function offset(face,delta){return face.map(p=>p.map((n,k)=>n+delta[k]));}
  function cap(points,uv,col,delta) {world(offset(points,delta),uv,col);}
  function texturePath(texture, name, repeat=false){s.registerTexture?.(texture,'../images/outdoors/'+name+'.webp',{district:key,maxSize:1536,repeat});}
  return {id,key,camera,only,s,face,world,panel,wall,floorLine,farFace,groundPoint,offset,cap,texturePath};
}

function wing(d,front,right,topLeft,topCorner,topRight,color) {
  const [left,corner]=front,[,back]=right;
  const f=d.wall(left,corner),r=d.wall(corner,back);
  const corners=[left,corner,back];
  const lo=corners.map(([u,v])=>d.groundPoint(u,v));
  const hi=[topLeft,topCorner,topRight].map(([u,v],i)=>d.camera.point(u,v,(i===2?r:f)(u,v)));
  const rear=lo[0].map((v,i)=>v+lo[2][i]-lo[1][i]);
  const maxY=Math.max(...hi.map(p=>p[1])),highRear=[rear[0],maxY,rear[2]];
  // The returned side and back sample the measured façade bay. They are real
  // walls facing away from the source image, visible after walking round it.
  d.world([lo[2],rear,highRear,hi[2]],[corner,left,topLeft,topCorner],color,{textureBrightness:.87});
  d.world([rear,lo[0],hi[0],highRear],[corner,left,topLeft,topCorner],color,{textureBrightness:.92});
  d.world([hi[0],hi[1],hi[2],highRear],[[.45,.22],[.60,.21],[.58,.24],[.43,.25]],'#706b60',{textureBrightness:.69});
  return {f,r,lo,hi,rear,highRear};
}

function horizon(d,radius) {
  const {s,key,camera,only}=d, file=definitions[key].horizon,name=key+'-panorama';
  d.texturePath(name,file);
  const yaw=camera.pose.yaw,sides=28;
  const rings=[[-.50,.999],[-.19,.69],[-.055,.555],[.055,.445],[.19,.31],[.34,.16],[.499,.001]];
  for(let j=0;j+1<rings.length;j++)for(let i=0;i<sides;i++) {
    const points=[],uv=[];
    for(const [ix,ring] of [[i,j],[i+1,j],[i+1,j+1],[i,j+1]]) {
      const u=ix/sides, a=yaw+(u-.5)*Math.PI*2, [e,v]=rings[ring];
      const h=radius*Math.sin(e*Math.PI),r=radius*Math.cos(e*Math.PI);
      points.push([camera.pose.x+Math.sin(a)*r,camera.pose.eyeY+h,camera.pose.z+Math.cos(a)*r]);uv.push([u,v]);
    }
    s.face(points,j===0?'#a5a58e':'#b8c9d0',{...only,texture:name,uv});
  }
}

const silhouettes={"okuma-auditorium":[[0.15,0.825],[0.153,0.788],[0.197,0.752],[0.22,0.213],[0.228,0.212],[0.234,0.031],[0.239,0.031],[0.259,0.087],[0.279,0.103],[0.286,0.057],[0.292,0.096],[0.307,0.08],[0.318,0.04],[0.334,0.017],[0.34,0.026],[0.337,0.131],[0.352,0.099],[0.357,0.14],[0.375,0.123],[0.375,0.273],[0.38,0.284],[0.374,0.3],[0.373,0.436],[0.815,0.382],[0.872,0.604],[0.886,0.819],[0.888,0.834]],"karatsu-bank":[[0.051,0.792],[0.068,0.535],[0.09,0.506],[0.088,0.336],[0.108,0.255],[0.124,0.231],[0.129,0.187],[0.146,0.161],[0.154,0.1],[0.164,0.155],[0.179,0.123],[0.188,0.079],[0.2,0.067],[0.203,0.007],[0.209,0.007],[0.213,0.067],[0.227,0.08],[0.233,0.121],[0.248,0.206],[0.31,0.184],[0.315,0.145],[0.321,0.184],[0.338,0.169],[0.415,0.176],[0.417,0.154],[0.427,0.155],[0.433,0.18],[0.478,0.197],[0.48,0.132],[0.491,0.132],[0.493,0.197],[0.609,0.221],[0.611,0.157],[0.621,0.158],[0.623,0.226],[0.755,0.266],[0.765,0.224],[0.773,0.264],[0.789,0.275],[0.797,0.265],[0.81,0.238],[0.817,0.205],[0.825,0.199],[0.829,0.161],[0.833,0.123],[0.837,0.159],[0.843,0.195],[0.853,0.209],[0.856,0.234],[0.87,0.26],[0.88,0.267],[0.88,0.31],[0.895,0.444],[0.903,0.838],[0.201,0.871],[0.102,0.853]],"karatsu-castle":[[0.0,0.467],[0.111,0.497],[0.301,0.573],[0.336,0.571],[0.336,0.498],[0.301,0.494],[0.303,0.47],[0.371,0.457],[0.403,0.426],[0.397,0.409],[0.366,0.403],[0.365,0.378],[0.433,0.349],[0.447,0.333],[0.447,0.284],[0.413,0.285],[0.413,0.259],[0.469,0.243],[0.475,0.18],[0.459,0.169],[0.459,0.139],[0.497,0.139],[0.514,0.096],[0.519,0.052],[0.526,0.052],[0.541,0.093],[0.579,0.086],[0.591,0.055],[0.598,0.054],[0.602,0.09],[0.675,0.166],[0.695,0.172],[0.692,0.201],[0.669,0.204],[0.672,0.242],[0.709,0.275],[0.718,0.305],[0.736,0.318],[0.735,0.337],[0.714,0.337],[0.74,0.41],[0.779,0.43],[0.777,0.452],[0.75,0.451],[0.807,0.52],[0.82,0.515],[0.814,0.549],[0.804,0.555],[0.808,0.666],[0.806,0.729],[0.826,0.837],[0.807,0.856],[0.516,0.864],[0.396,0.869],[0.202,0.895],[0,0.918]],"okuma-statue":[[0.418,0.826],[0.427,0.57],[0.434,0.55],[0.442,0.55],[0.443,0.504],[0.47,0.501],[0.467,0.465],[0.448,0.457],[0.451,0.317],[0.442,0.303],[0.433,0.297],[0.438,0.257],[0.452,0.18],[0.466,0.153],[0.485,0.144],[0.49,0.117],[0.49,0.095],[0.48,0.078],[0.492,0.074],[0.508,0.072],[0.521,0.075],[0.54,0.089],[0.541,0.098],[0.524,0.096],[0.517,0.125],[0.52,0.147],[0.533,0.168],[0.541,0.226],[0.554,0.309],[0.551,0.322],[0.548,0.321],[0.551,0.456],[0.529,0.469],[0.527,0.497],[0.56,0.504],[0.561,0.551],[0.571,0.557],[0.582,0.824]]};
const pavements={"okuma-auditorium":[[0,0.827],[0.152,0.823],[0.324,0.828],[0.82,0.843],[0.886,0.837],[1,0.848]],"karatsu-bank":[[0,0.859],[0.06,0.841],[0.103,0.861],[0.2,0.867],[0.848,0.849],[0.905,0.837],[1,0.851]],"karatsu-castle":[[0,0.917],[0.4,0.866],[0.808,0.857],[1,0.874]],"okuma-statue":[[0,0.839],[0.139,0.784],[0.154,0.905],[0.192,0.93],[0.5,0.958],[0.815,0.934],[0.857,0.91],[0.858,0.788],[1,0.827]]};
const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

// Ear clipping keeps the sky between clock-tower pinnacles, the castellated
// roofline and the gaps above the pediment outside the solid geometry.
function triangulate(points) {
  const remaining=points.slice(), tri=[];
  const sum=remaining.reduce((v,a,i)=>{const b=remaining[(i+1)%remaining.length];return v+a[0]*b[1]-a[1]*b[0];},0);
  if(sum<0)remaining.reverse();
  while(remaining.length>3) {
    let found=false;
    for(let i=0;i<remaining.length;i++){
      const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
      if(turn(a,b,c)<=1e-10)continue;
      if(remaining.some(p=>p!==a&&p!==b&&p!==c&&turn(a,b,p)>1e-8&&turn(b,c,p)>1e-8&&turn(c,a,p)>1e-8))continue;
      tri.push([a,b,c]);remaining.splice(i,1);found=true;break;
    }
    if(!found)break;
  }
  if(remaining.length===3)tri.push(remaining);
  return tri;
}

function cut(poly,axis,edge,sign){
  const result=[];if(!poly.length)return result;
  let a=poly.at(-1);for(const b of poly){
    const af=(a[axis]-edge)*sign, bf=(b[axis]-edge)*sign;
    if((af>=0)!==(bf>=0)){
      const t=af/(af-bf);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
    if(bf>=0)result.push(b);a=b;
  }
  return result;
}
function traced(d,outline,depth,col,xCuts=[],yCuts=[]) {
  for(const tri of triangulate(outline)) {
    let pieces=[tri];
    for(const [dir,cuts] of [[0,xCuts],[1,yCuts]]){
      for(const at of cuts) {
        pieces=pieces.flatMap(part=>{
          if(part.every(p=>p[dir]>=at)||part.every(p=>p[dir]<=at))return [part];
          return [cut(part,dir,at,1),cut(part,dir,at,-1)].filter(p=>p.length>=3);
        });
      }
    }
    for(const poly of pieces)d.panel(poly,depth,col);
  }
}
function lerp(a,b,t){return a+(b-a)*t;}
function closeTo(a,b,r){return Math.max(0,1-Math.abs(a-b)/r);}
function mix(values,x){
  if(x<=values[0][0])return values[0][1];
  for(let i=1;i<values.length;i++)if(x<=values[i][0]){
    const a=values[i-1],b=values[i];return lerp(a[1],b[1],(x-a[0])/(b[0]-a[0]));
  }
  return values.at(-1)[1];
}

function architecture(d) {
  const hall=d.key==='okuma-auditorium',bank=d.key==='karatsu-bank';
  let depth, xCuts, yCuts, col;
  if(hall) {
    const left=[.324,.825],corner=[.838,.840],back=[.888,.826];
    const {f,r}=wing(d,[left,corner],[corner,back],[.355,.442],[.814,.383],[.870,.597],'#94795b');
    // The clock tower stands forward of the hall. Three recessed entrance bays
    // and the overhanging belfry retain their own depths from a moving camera.
    const tower=d.wall([.203,.812],[.324,.825]);
    const towerRight=d.wall([.324,.825],[.365,.812]);
    depth=(u,v)=>{
      const main=u>.816? r(u,v):f(u,v);
      if(v<.447&&u<.379)return u<.336?tower(u,v):towerRight(u,v);
      if(u<.338)return tower(u,v);
      let recess=0;
      if(v>.554&&v<.794)for(const x of [.481,.562,.647])recess+=closeTo(u,x,.030)*.85;
      if(v>.796)recess-=Math.min(1,(v-.795)*25)*1.0;
      return main+recess;
    };
    col='#a39178';xCuts=[.326,.37,.48,.56,.645,.815];yCuts=[.212,.441,.57,.792];
  }else if(bank) {
    const corner=[.197,.867],right=[.903,.837],left=[.054,.795];
    const {f,r}=wing(d,[right,corner],[corner,left],[.876,.297],[.184,.199],[.069,.394],'#b08974');
    depth=(u,v)=>{
      const edge=lerp(.181,.198,Math.max(0,Math.min(1,v)));
      const surface=u<edge?r(u,v):f(u,v);
      const colonnade=(closeTo(u,.28,.09)+closeTo(u,.840,.072))*Math.min(1,Math.max(0,(v-.46)*12));
      return surface-(v<.28?(.29-v)*5:0)-colonnade*.69;
    };
    col='#b59077';xCuts=[.18,.28,.42,.555,.69,.839];yCuts=[.21,.29,.49,.833];
  }else {
    const left=[.343,.867],corner=[.730,.856],right=[.822,.833];
    const {f,r}=wing(d,[left,corner],[corner,right],[.348,.507],[.735,.452],[.812,.546],'#bcb6a3');
    const wingWall=d.wall([0,.918],[.4,.867]);
    const roofY=u=>.473+.236*u;
    depth=(u,v)=>{
      if(u<.455&&v>roofY(u))return wingWall(u,v)+Math.max(0,.698-v)*12;
      const cornerU=lerp(.597,.738,Math.max(0,Math.min(1,(v-.21)/.64)));
      let base=(u>cornerU?r(u,v):f(u,v));
      if(v<.668)base+=2.0;
      if(v<.503)base+=2.2;
      if(v<.345)base+=2.0;
      if(v<.233)base+=1.4;
      return base;
    };
    col='#b7b6a2';xCuts=[.30,.40,.49,.600,.735];yCuts=[.185,.275,.356,.458,.54,.665,.712,.851];
  }
  traced(d,silhouettes[d.key],depth,col,xCuts,yCuts);
}

const bronzeOutline=[[0.07429, 0.48684, 0.52392], [0.08309, 0.48684, 0.53563], [0.09287, 0.4953, 0.54149], [0.10167, 0.49335, 0.53368], [0.11047, 0.4914, 0.52587], [0.12025, 0.4914, 0.52522], [0.12905, 0.4927, 0.52132], [0.13883, 0.494, 0.51677], [0.14763, 0.47904, 0.51937], [0.15643, 0.46408, 0.52652], [0.16621, 0.45952, 0.53238], [0.17501, 0.45692, 0.53563], [0.18381, 0.45432, 0.53888], [0.19358, 0.45172, 0.54083], [0.20238, 0.45042, 0.54214], [0.21216, 0.44912, 0.54344], [0.22096, 0.44782, 0.54539], [0.22976, 0.44586, 0.54669], [0.23954, 0.44391, 0.54734], [0.24834, 0.44196, 0.54864], [0.25714, 0.44066, 0.54929], [0.26692, 0.43871, 0.55059], [0.27572, 0.43741, 0.55124], [0.2855, 0.43611, 0.55254], [0.2943, 0.44001, 0.55384], [0.3031, 0.44912, 0.5545], [0.31288, 0.45757, 0.55515], [0.32168, 0.45627, 0.54994], [0.33048, 0.45497, 0.54799], [0.34026, 0.45367, 0.54864], [0.34906, 0.45237, 0.54864], [0.35884, 0.45107, 0.54929], [0.36764, 0.45107, 0.54929], [0.37644, 0.45042, 0.54929], [0.38622, 0.44977, 0.54994], [0.39502, 0.44977, 0.54994], [0.40382, 0.44912, 0.55059], [0.4136, 0.44912, 0.55059], [0.4224, 0.44847, 0.55059], [0.43217, 0.44847, 0.55124], [0.44097, 0.44782, 0.55124], [0.44977, 0.44782, 0.55189], [0.45955, 0.44847, 0.55189], [0.46835, 0.45822, 0.55059], [0.47715, 0.45822, 0.52392], [0.48693, 0.45757, 0.52262], [0.49573, 0.45692, 0.53953], [0.50551, 0.45692, 0.50896]];
function statue(d,includeSculpture) {
  const {s,id,camera}=d,[x,z]=definitions[d.key].anchor;
  const width=1.88, depth=1.52,yaw=camera.pose.yaw, sn=Math.sin(yaw),cs=Math.cos(yaw);
  const cx=camera.pose.x,cz=camera.pose.z;
  function at(a,y,b){return [x+a*cs+b*sn,y,z-a*sn+b*cs];}
  function ring(w,h,y){return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>at(a*w*.5,y,b*h*.5));}
  const stoneBottom=ring(width,depth,0), stoneTop=ring(width*.87,depth*.88,1.78), bronzeTop=ring(1.35,1.21,2.12);
  const dark=ring(1.38,1.24,1.78);
  for(const [lo,hi,source,col] of [[stoneBottom,stoneTop,[[.422,.827],[.580,.827],[.568,.554],[.434,.554]],'#a4a49a'],[dark,bronzeTop,[[.443,.550],[.560,.550],[.559,.502],[.444,.502]],'#59665e']]){
    for(let i=0;i<4;i++)d.world([lo[i],lo[(i+1)%4],hi[(i+1)%4],hi[i]],source,col,{textureBrightness:i===0?1:.90});
    s.face(hi,col,{id});
  }
  // The obverse picks up the cast folds and facial detail recorded in the
  // photograph. The fall of the sleeves, the convex gown and the face each
  // project at their own depth in front of the corresponding bronze volume.
  function relief(name,rect,cols,rows,depth,options){
    const [u0,v0,u1,v1]=rect;d.texturePath(name,name);
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const pts=[],uv=[];
      for(const [ix,iy] of [[i,j],[i+1,j],[i+1,j+1],[i,j+1]]){
        const u=lerp(u0,u1,ix/cols),v=lerp(v0,v1,iy/rows),q=depth(u,v);
        pts.push(camera.point(u,v,q));uv.push([ix/cols,iy/rows,q]);
      }
      d.world(pts,uv,'#58615d',{texture:name,...options});
    }
  }
  if(includeSculpture){
    // Register the genuine sculpted bronze to the photographed outline. Each
    // vertex keeps its original depth; there is just one solid figure from
    // any angle. The photographed front and the patinated reverse share seams.
    const triangles=[];
    buildSoftwareStatue({face(points,color){triangles.push({points,color,uv:points.map(camera.project)});}},x,2.12,z,2.89,id,yaw);
    const vs=triangles.flatMap(t=>t.uv.map(p=>p[1]));
    const ymin=Math.min(...vs),ymax=Math.max(...vs),minV=bronzeOutline[0][0],maxV=bronzeOutline.at(-1)[0];
    const src=Array.from({length:81},(_,i)=>{
      const y=lerp(ymin+.00001,ymax-.00001,i/80),edges=[];
      for(const {uv} of triangles)for(let k=0;k<3;k++) {
        const a=uv[k],b=uv[(k+1)%3];
        if((a[1]>y)===(b[1]>y))continue;
        edges.push(lerp(a[0],b[0],(y-a[1])/(b[1]-a[1])));
      }
      return [y,Math.min(...edges),Math.max(...edges)];
    });
    const srcL=src.map(([y,l])=>[y,l]),srcR=src.map(([y,,r])=>[y,r]);
    const toL=bronzeOutline.map(([y,l])=>[y,l]),toR=bronzeOutline.map(([y,,r])=>[y,r]);
    d.texturePath('okuma-statue-bronze','okuma-statue-bronze');
    for(const tri of triangles) {
      const pts=[],tex=[];
      for(const [u,v,q] of tri.uv) {
        const v2=lerp(minV,maxV,(v-ymin)/(ymax-ymin)),left=mix(srcL,v),right=mix(srcR,v);
        const t=Math.max(0,Math.min(1,(u-left)/Math.max(.00003,right-left)));
        const u2=lerp(mix(toL,v2),mix(toR,v2),t);
        pts.push(camera.point(u2,v2,q));
        tex.push([(u2-.427)/.134,(v2-.065)/.441,q]);
      }
      const front=tri.points.some(p=>(p[0]-x)*(cx-x)+(p[2]-z)*(cz-z)>-.35);
      if(front)d.world(pts,tex,tri.color,{id,texture:'okuma-statue-bronze'});else s.face(pts,tri.color,{id});
    }
  }
  // A complete clipped hedge grows around the base. The rear and side faces
  // stay planted when the viewer steps out of the photographed approach.
  const bed=[];
  for(let i=0;i<20;i++){
    const a=2*Math.PI*i/20,cs=Math.cos(a),sn=Math.sin(a);
    bed.push([x+2.26*Math.sign(cs)*Math.abs(cs)**.50,z+2.36*Math.sign(sn)*Math.abs(sn)**.50]);
  }
  for(let i=0;i<bed.length;i++){
    const a=bed[i],b=bed[(i+1)%bed.length],edge=[[a[0],.12,a[1]],[b[0],.12,b[1]],[b[0],.33,b[1]],[a[0],.33,a[1]]];
    d.world(edge,[[.18,.903],[.27,.903],[.27,.837],[.18,.837]],'#455c3e',{id:undefined});
    const crown=[edge[3],edge[2],[x+(b[0]-x)*.65,.345,z+(b[1]-z)*.65],[x+(a[0]-x)*.65,.345,z+(a[1]-z)*.65]];
    d.world(crown,[[.223,.844],[.295,.844],[.295,.875],[.223,.875]],'#536b43',{id:undefined});
  }
  const hedgeCenter=Math.hypot(x-cx,z-cz);
  relief('okuma-statue-hedge',[.142,.745,.870,.966],12,5,(u,v)=>{
    const face=hedgeCenter-2.65+.98*(Math.abs((u-.50)/.36)**3);
    return face+Math.max(0,.824-v)*12;
  },{id:undefined});

}

const depthProfiles={
  'okuma-auditorium':[[0,12],[.15,29],[.25,42],[.60,47],[.85,34],[1,12]],
  'okuma-statue':[[0,7],[.20,9],[.35,13],[.48,26],[.61,22],[.78,13],[1,8]],
  'karatsu-castle':[[0,18],[.21,29],[.47,44],[.70,46],[.87,32],[1,17]],
  'karatsu-bank':[[0,17],[.12,32],[.72,37],[.90,32],[1,15]]
};
function surrounds(d) {
  const {key,camera}=d,atlas=key+'-surroundings';
  d.texturePath(atlas,atlas);
  const col='#71826a', opt={...d.only,id:undefined,texture:atlas,nearView:[camera.pose.x,camera.pose.z,13,30]};
  // Trace source sky separately from opaque leaves and paved ground. The
  // foreground projects over a finite, curved range so branches and rear
  // campus façades parallax on a sideways step. Holes reveal the 360° horizon.
  const cols=12,rows=7;
  for(const sky of [true,false])for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const uvq=[],points=[];
    for(const [ki,kj] of [[i,j],[i+1,j],[i+1,j+1],[i,j+1]]){
      const u=ki/cols,v=kj/rows,base=mix(depthProfiles[key],u);
      let q;
      if(sky)q=73/Math.hypot(...camera.ray(u,v));
      else q=base*(1+.065*Math.cos((v+.15)*Math.PI));
      points.push(camera.point(u,v,q));uvq.push([u,(v+Number(sky))*.5,q]);
    }
    d.world(points,uvq,sky?'#b6cbd5':col,{...opt,blend:true,feather:sky?[.26,.23,.26,.09]:[.095,.10,.095,.036],featherUV:[0,sky?.5:0,1,sky?1:.5]});
  }
  d.floorLine(pavements[key]);
}

export function buildPhotographicDistrict(s,landmark,{includeHorizon=true,includeSculpture=true,horizonRadius=650}={}) {
  const key=landmark.replace(/^landmark-/,'' );if(!definitions[key])return false;
  const d=district(s,key);
  if(key==='okuma-statue')statue(d,includeSculpture);else architecture(d);
  surrounds(d);
  if(includeHorizon)horizon(d,horizonRadius);
  return true;
}

// Scan the measured footprints into narrow horizontal collision strips. This
// follows real oblique façades instead of closing the surrounding courtyard.
export function photoFootprint(landmark) {
  const key=landmark.replace(/^landmark-/,''), c=cameras[key];
  if(key==='okuma-statue')return [[-1,-.9],[1,-.9],[1,.9],[-1,.9]].map(([x,z])=>[x,z+230]);
  const uv=key==='okuma-auditorium'?[[.203,.812],[.838,.840],[.888,.826]]:
    key==='karatsu-bank'?[[.903,.837],[.197,.867],[.054,.795]]:
    [[.343,.867],[.730,.856],[.822,.833]];
  const [a,b,e]=uv.map(([u,v])=>{const [x,,z]=c.point(u,v,c.base(u,v));return [x,z];});
  return [a,b,e,[a[0]+e[0]-b[0],a[1]+e[1]-b[1]]];
}
