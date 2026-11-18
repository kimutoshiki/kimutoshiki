import {buildPhotographicDistrict, photoFootprint, PHOTO_PLACES} from './software-districts.js';
import {CASTLE_CENTER, REGION_BOUNDS, districtAt, regionalHeight} from '../scene/world-layout.js';

export const SOFTWARE_PLACES=PHOTO_PLACES;
export const SOFTWARE_SPAWN={...PHOTO_PLACES['landmark-okuma-auditorium'],key:'landmark-okuma-auditorium'};
const [cx,cz]=CASTLE_CENTER;
export const SOFTWARE_BOUNDS={
  minX:REGION_BOUNDS.waseda.minX,maxX:REGION_BOUNDS.karatsu.maxX,
  minZ:REGION_BOUNDS.waseda.minZ,maxZ:REGION_BOUNDS.karatsu.maxZ
};
export const softwareDistrictAt=(x,z)=>districtAt({x,z});
export const softwareGroundHeight=(x,z)=>regionalHeight(x>REGION_BOUNDS.waseda.maxX?'karatsu':'waseda',x,z);
const inRect=(x,z,b)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
const street=(x,z,width,depth)=>({minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2});

// The two cities share no ground. Within Karatsu the south frontage connects
// to the west crossroads, the eastward town street and the castle approach.
const bankStreet=street(1600,1118.8,178,55), westStreet=street(1579.8,1096.5,27,139);
const townStreet=street(1898,1075.5,652,58), castleApproach=street(cx-75,852,65,466);
const downhill=street(cx-24,cz+72,176,157), hill=street(cx,cz+15,175,182);
const townAreas=[bankStreet,westStreet,townStreet,castleApproach,downhill,hill];
export function softwareWalkingAllowed(x,z){
  return inRect(x,z,REGION_BOUNDS.waseda)||townAreas.some(area=>inRect(x,z,area));
}
const buildings=[
  // Campus buildings 3, 1, 2, 7 and 8 around the central stone walk.
  [61,207.5,92,31,13.6,3],[58,177.6,66,24,60,2],[106.8,265.4,35.4,34.6,17,3],
  [52,273.8,36,46,14.1,2],[-7,191.7,39,44,18.7,3],[-9,276.1,44,43,19.4,2],
  // The bank and its neighbours sit at the old town crossroads.
  [1558,1102,25,20,8.8,0],[1634,1094,18,29,10,1],[1660,1097,24,24,8,0],
  [1556,1140,27,16,7.8,0],[1597,1141,22,17,8.4,1],[1624,1143,23,20,7.4,0],
  [1655,1140,27,17,12.1,1]
];
for(let i=0;i<28;i++){
  const x=1651+i*18.5, sign=i%2?1:-1;
  buildings.push([x,1075.5+sign*(19.8+i%3),12+(i%3)*1.7,12+(i%2)*2.2,6+(i%4)*1.45,i%2]);
}
for(let i=0;i<16;i++){
  const z=1040-i*21,sign=i%2?1:-1;
  buildings.push([cx-75+sign*(19+i%4),z,13+(i%3),13,5.7+(i%4)*.9,i%2]);
}
function footprintStrips(key) {
  const poly=photoFootprint(key),zs=poly.map(p=>p[1]),out=[];
  for(let lo=Math.min(...zs);lo<Math.max(...zs);lo+=.65){
    const z=lo+.325,xs=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];
      if((a[1]>z)===(b[1]>z))continue;
      xs.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));
    }
    if(xs.length>=2)out.push({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:lo,maxZ:lo+.65});
  }
  return out;
}
export const SOFTWARE_OBSTACLES=[
  ...Object.keys(PHOTO_PLACES).flatMap(footprintStrips),
  ...buildings.map(([x,z,w,d])=>street(x,z,w,d))
];

function ground(s,x0,z0,x1,z1,texture,tile,shift=0,step=27) {
  const nx=Math.ceil((x1-x0)/step),nz=Math.ceil((z1-z0)/step);
  for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
    const a=x0+(x1-x0)*ix/nx,b=x0+(x1-x0)*(ix+1)/nx;
    const c=z0+(z1-z0)*iz/nz,d=z0+(z1-z0)*(iz+1)/nz;
    const points=[[a,c],[b,c],[b,d],[a,d]].map(([x,z])=>[x,softwareGroundHeight(x,z)+shift,z]);
    s.face(points,'#b5aa96',{texture,uv:points.map(([x,,z])=>[x/tile,z/tile]),layer:'ground',order:shift<0?1:2});
  }
}

function facade(s,x,z,w,d,h,index) {
  const bottom=softwareGroundHeight(x,z), roof=bottom+h;
  const p=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>[x+u*w,bottom,z+v*d]);
  const top=p.map(([a,,b])=>[a,roof,b]);
  const tile=index*.25, cols=w>30?4:Math.max(1,Math.round(w/10));
  for(let i=0;i<4;i++) {
    const j=(i+1)%4,a=p[i],b=p[j],count=i%2?Math.max(1,Math.round(d/13)):cols;
    for(let c=0;c<count;c++) {
      const start=a.map((v,k)=>v+(b[k]-v)*c/count), end=a.map((v,k)=>v+(b[k]-v)*(c+1)/count);
      const low=.005,high=.995;
      s.face([start,end,[end[0],roof,end[2]],[start[0],roof,start[2]]],'#a59888',{
        texture:'street-facades',uv:[[tile+.001,high],[tile+.249,high],[tile+.249,low],[tile+.001,low]],
        textureBrightness:i===0?.96:i===1?.83:i===2?1:.91
      });
    }
  }
  s.face(top,'#746f66');
  if(w<30)s.roof(x,roof+.46,z,w+.48,.94,d+.58,'#645f59');
}

function tree(s,x,z,h,evergreen) {
  const y=softwareGroundHeight(x,z),a=(x*1.74+z*.28)%6.28;
  const key='street-leaves',half=evergreen?.5:0;
  function cluster(ax,ay,az,rise,width,angle){
    const dx=Math.cos(angle)*width/2,dz=Math.sin(angle)*width/2;
    const pts=[[ax-dx,ay-rise/2,az-dz],[ax+dx,ay-rise/2,az+dz],[ax+dx,ay+rise/2,az+dz],[ax-dx,ay+rise/2,az-dz]];
    s.face(pts,evergreen?'#66725a':'#8f844f',{texture:key,uv:[[half+.001,.999],[half+.499,.999],[half+.499,.001],[half+.001,.001]]});
  }
  s.frustum(x,y+.24*h,z,h*.040,h*.021,h*.48,6,'#796857');
  // Crossed foliage clusters surround the trunk. All viewpoints see more than
  // one depth, including when the visitor passes beneath the crown.
  for(let i=0;i<3;i++){
    const t=a+i*Math.PI*2/3,dx=Math.cos(t)*h*.16,dz=Math.sin(t)*h*.16,cy=y+h*(evergreen?.56:.66)+i*.032*h;
    for(let n=0;n<2;n++)cluster(x+dx,cy,z+dz,h*(evergreen?.38:.59),h*(evergreen?.69:.64),t+n*1.62);
  }
}

function benches(s) {
  for(const x of [-14,20,46,74])for(const [z,sign] of [[220.3,1],[239.2,-1]]){
    for(const dx of [-.63,.63])s.box(x+dx,.21,z,.10,.42,.41,'#60645b');
    s.box(x,.45,z,1.75,.10,.42,'#967654');s.box(x,.76,z-sign*.19,1.73,.25,.075,'#a0815c');
  }
}
function townGround(s){
  ground(s,1510,1025,2252,1166,'town-road',9,-.043,65);
  ground(s,2151,635,2225,1089,'town-road',10,-.035,37);
  ground(s,2161,497,2356,739,'castle-gravel',7,-.18,14);
  ground(s,2215,535,2308,638,'castle-gravel',5,-.058,12);
  for(const [x,z,w,d] of [[1600,1127.5,171,3.8],[1574.2,1097,2.5,130],[1945,1068.6,726,3.9],[1945,1082.6,726,3.4],[cx-82,852,3.3,429],[cx-68,852,3.3,429]]){
    ground(s,x-w/2,z-d/2,x+w/2,z+d/2,'campus-walk',6,.002,53);
  }
  // Crosswalk near the bank, plus dashed lane markings along the eastward street.
  for(let i=0;i<7;i++)s.face([[1576.5,.009,1113.8+i*1.49],[1580.2,.009,1113.8+i*1.49],[1580.2,.009,1114.28+i*1.49],[1576.5,.009,1114.28+i*1.49]],'#d9d5c6');
  for(let x=1644;x<2170;x+=19)s.face([[x,.004,1075.5],[x+4.7,.004,1075.5],[x+4.7,.004,1075.61],[x,.004,1075.61]],'#d9d4c5');
}

export function buildSoftwareGarden(s) {
  for(const [k,file,repeat] of [
    ['campus-walk','campus-stone',true],['castle-gravel','bailey-gravel',true],['town-road','town-paving',true],
    ['street-leaves','district-trees',false],['street-facades','district-fronts',false]
  ])s.registerTexture(k,'../images/outdoors/'+file+'.webp',{repeat,maxSize:1024});
  const campus=REGION_BOUNDS.waseda;
  ground(s,campus.minX-12,campus.minZ-9,campus.maxX+13,campus.maxZ+9,'campus-walk',7,-.06,29);
  ground(s,-48,223.7,148,236.3,'campus-walk',5,-.021,22);
  ground(s,-5.5,170.7,5.5,287.4,'campus-walk',5,-.016,22);
  townGround(s);
  for(const b of buildings)facade(s,...b);
  benches(s);
  for(let i=0;i<8;i++){
    const x=-30+i*18;
    for(const [off,z] of [[0,217.8],[3.6,242.1]])if(Math.abs(x+off)>14)tree(s,x+off,z,7.3+i%3,false);
  }
  for(let i=0;i<13;i++)tree(s,1641+i*41,1083.4+(i%2)*.75,4.4+i%4*.43,false);
  for(let i=0;i<10;i++)tree(s,cx-82.4,1031-i*36,4.6+i%3*.65,i>5);
  for(const [a,b,h] of [[-55,-34,8.3],[-43,3,10],[38,-12,8],[43,9,9.7],[-40,47,7.5],[42,35,8.7],[-23,-44,9.4]])
    tree(s,cx+a,cz+b,h,true);
  for(const key of Object.keys(PHOTO_PLACES))buildPhotographicDistrict(s,key);
}
