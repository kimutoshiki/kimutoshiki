import {silhouettes,drawerOutline,topOutline,apronOutline} from './software-desk-layout.js';
import {BOOK_WIDTH,BOOK_DEPTH,coverPose,leafPosition} from './notebook-geometry.js';

export const SOFTWARE_SEAT={x:0,y:1.50,z:-2.95,yaw:0,pitch:-.288,fov:44};
const cp=Math.cos(SOFTWARE_SEAT.pitch),sp=Math.sin(SOFTWARE_SEAT.pitch),focal=300/Math.tan(22*Math.PI/180);
const topY=.84;
function fromRay([u,v],distance) {
  const y=(300-v)/focal;
  return [(u-450)/focal*distance,SOFTWARE_SEAT.y+(y*cp+sp)*distance,SOFTWARE_SEAT.z+(cp-y*sp)*distance];
}
function onZ(p,z) {return fromRay(p,(z-SOFTWARE_SEAT.z)/(cp-(300-p[1])/focal*sp));}
function onY(p,h) {return fromRay(p,(h-SOFTWARE_SEAT.y)/((300-p[1])/focal*cp+sp));}
function sourceDepth(p) {return (p[1]-SOFTWARE_SEAT.y)*sp+(p[2]-SOFTWARE_SEAT.z)*cp;}
const wallZ=onY([450,465],0)[2], deskZ=onY([450,349],topY)[2];
const props={
  research:[289,.105],profile:[287,.066],photos:[292,.14],bank:[294,.102],contact:[327,.02],
  cup:[305,.062],vase:[293,.065],maple:[293,.012],penpot:[282,.044],ink:[316,.034],cards:[321,.055],tray:[326,.025],
  lampBase:[298,.078],lampArm:[295,.023],lampShade:[299,.082]
};
function propDepth(key) {const [foot]=props[key];return onY([450,foot],topY+.004)[2];}
export const SOFTWARE_DESK_ANCHORS={
  profile:onZ([375,203],propDepth('profile')-.03),research:onZ([206,222],propDepth('research')-.02),
  blog:onY([387,313],topY+.031),photos:onZ([519,239],propDepth('photos')-.04),contact:onY([536,317],topY+.02)
};
const rect=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function triangulate(poly) {
  const order=poly.map((_,i)=>i),faces=[];
  let area=0;for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];area+=a[0]*b[1]-a[1]*b[0];}
  if(area<0)order.reverse();
  while(order.length>3){
    let removed=false;
    for(let j=0;j<order.length;j++){
      const a=order[(j+order.length-1)%order.length],b=order[j],c=order[(j+1)%order.length];
      const turn=cross(poly[a],poly[b],poly[c]);
      if(Math.abs(turn)<.001){order.splice(j,1);removed=true;break;}
      if(turn<0)continue;
      if(order.some(i=>i!==a&&i!==b&&i!==c&&cross(poly[a],poly[b],poly[i])>=0&&cross(poly[b],poly[c],poly[i])>=0&&cross(poly[c],poly[a],poly[i])>=0))continue;
      faces.push([poly[a],poly[b],poly[c]]);order.splice(j,1);removed=true;break;
    }
    if(!removed)break;
  }
  if(order.length===3)faces.push(order.map(i=>poly[i]));
  return faces;
}

export function buildSoftwareDesk(s) {
  const image=typeof document!=='undefined'?document.getElementById?.('study-image'):null;
  s.registerTexture('desk-photo',image?.currentSrc||'../images/study/study-1200.webp?v=portrait2');
  s.registerTexture('desk-room','../images/study/desk-room.webp');
  s.registerTexture('desk-joinery','../images/study/desk-joinery.webp');
  s.registerTexture('desk-window','../images/world/autumn-window.webp');
  const original='desk-photo',repaired='desk-room';
  function photo(points,coords,texture,options={}) {
    const uv=coords.map(([u,v],i)=>[u/900,v/600,sourceDepth(points[i])]);
    s.face(points,options.color||'#806745',{...options,texture,uv});
  }
  function mapped(poly,point,texture,options) {
    for(const tri of triangulate(poly))photo(tri.map(point),tri,texture,options);
  }
  function tile(points,slot,options={}) {
    const x=slot%4,y=Math.floor(slot/4),margin=.014;
    const uv=[[margin,margin],[1-margin,margin],[1-margin,1-margin],[margin,1-margin]].map(([u,v])=>[(x+u)/4,(y+v)/2]);
    s.face(points,options.color||'#785a3f',{...options,texture:'desk-joinery',uv});
  }
  function shellPlane(poly,point,opts={}) {mapped(poly,point,repaired,opts);}
  function edges(poly,point,thickness,options={}) {
    const cx=poly.reduce((v,p)=>v+p[0],0)/poly.length,cy=poly.reduce((v,p)=>v+p[1],0)/poly.length;
    const interior=([x,y])=>{const length=Math.hypot(x-cx,y-cy)||1;return [x+(cx-x)*2/length,y+(cy-y)*2/length];};
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],A=point(a),B=point(b);
      photo([A,B,fromRay(b,sourceDepth(B)+thickness),fromRay(a,sourceDepth(A)+thickness)],[a,b,interior(b),interior(a)],original,{textureBrightness:.83,...options});
    }
  }
  function cutout(poly,z,thickness,options={}) {
    // Round the photographed front by pushing its centre toward the camera;
    // the side strips close the shell when seen from an oblique angle.
    const left=Math.min(...poly.map(p=>p[0])),right=Math.max(...poly.map(p=>p[0]));
    const point=p=>onZ(p,z-thickness*.42*Math.max(0,1-((p[0]-left)/(right-left)*2-1)**2));
    const surface=tri=>{
      const e=tri.map((v,i)=>Math.hypot(v[0]-tri[(i+1)%3][0],v[1]-tri[(i+1)%3][1]));
      const m=e.indexOf(Math.max(...e));
      if(e[m]>65){
        const a=tri[m],b=tri[(m+1)%3],c=tri[(m+2)%3],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        surface([a,mid,c]);surface([mid,b,c]);
      }else photo(tri.map(point),tri,original,options);
    };
    triangulate(poly).forEach(surface);
    edges(poly,point,thickness,options);
  }

  // Extend actual room surfaces beyond the reference shot, so turning at the
  // desk reveals adjoining wall panels, window bays, wainscot and floorboards.
  function patch(box,uv,point,o={}) {photo(box.map(point),uv,repaired,o);}
  const wall=p=>onZ(p,wallZ);
  function mirror(v,size){const u=((v%(2*size))+2*size)%(2*size);return u>size?2*size-u:u;}
  for(let x=-900;x<1800;x+=150)for(let y=-600;y<276;y+=100){
    if(x>=0 && x<900 && y>=0)continue;
    const box=rect(x,y,x+150,Math.min(276,y+100));
    patch(box,box.map(([u,v])=>[mirror(u,900),mirror(v,155)]),wall);
  }
  shellPlane(rect(0,0,900,278),p=>onZ(p,wallZ-.002));
  const wainscot=p=>onZ(p,wallZ-.006);
  for(let x=-900;x<1800;x+=90){
    const panel=rect(x,277,x+90,466);
    patch(panel,[[303,424],[388,424],[388,465],[303,465]],wainscot);
  }
  // Raised rails frame the panelling where the right wall continues. The
  // lamp shelf casts an illustrated shadow on the original plaster above.
  const raised=p=>onZ(p,wallZ-.027);
  for(let x=900;x<1650;x+=115){
    for(const [poly,uv] of [[rect(x,274,x+115,282),rect(840,274,899,282)],
      [rect(x,452,x+115,463),rect(305,450,401,461)],
      [rect(x+3,285,x+7,450),rect(402,424,407,454)],
      [rect(x+11,291,x+107,295),rect(307,424,399,428)],
      [rect(x+11,437,x+107,440),rect(307,451,399,454)]])
      photo(poly.map(raised),uv,original);
  }
  shellPlane(rect(0,417,900,466),p=>onZ(p,wallZ-.009));
  shellPlane([[794,273],[900,273],[900,340]],p=>onZ(p,wallZ-.009));
  // Continue boards/rug in metres; reflecting the complete photograph
  // would duplicate the cat, chair legs and cupboards at the crop edge.
  tile([[-11,-.01,6],[11,-.01,6],[11,-.01,-10],[-11,-.01,-10]],3);
  for(let i=-14;i<15;i++)for(let j=0;j<9;j++){
    const x=i*.25,z=-5+j*.85+(i%2)*.28;
    tile([[x,.003,z],[x+.249,.003,z],[x+.249,.003,z+.847],[x,.003,z+.847]],3);
  }
  // Continue the slanting daylight on the boards to each side of the rug.
  // A clean span between the cat and chair supplies the grain, including
  // dark boards at the wall and the longer highlight nearer the visitor.
  for(const origin of [-840,900])for(let col=0;col<4;col++)for(let row=0;row<4;row++){
    const w=210,h=83,x=origin+col*w,y=465+row*h,lo=267+(col%2)*30,hi=lo+163;
    const points=rect(x,y,x+w,y+h).map(p=>onY(p,.009));
    const uv= row%2 ? [[hi,528],[lo,528],[lo,478],[hi,478]] : rect(lo,473,hi,528);
    photo(points,uv,original,{textureBrightness:.91+.02*(col%2)});
  }
  const rugBack=onY([450,531],.016)[2],rugLeft=onY([98,531],.016)[0],rugRight=onY([825,531],.016)[0];
  const strip=.22;
  for(let x=rugLeft;x<rugRight;x+=strip)for(let z=rugBack;z>rugBack-1.52;z-=strip*.64){
    const points=[[x,.016,z],[Math.min(x+strip,rugRight),.016,z],[Math.min(x+strip,rugRight),.016,z-strip*.64],[x,.016,z-strip*.64]];
    photo(points,rect(276,555,409,595),original);
  }
  shellPlane(rect(0,465,900,600),p=>onY(p,.021));
  const windowDepth=p=>wallZ-.10+Math.min(0,(p[0]-154)/155)*.18;
  const windowPoint=p=>onZ(p,windowDepth(p));
  // Beyond the cropped bay a real second window opens onto the wooded hills.
  // Its glass looks through a deep reveal and the mullions sit in front.
  const farWindow=p=>onZ(p,windowDepth(p)+.21);
  const outside=rect(-620,-185,1,249);
  s.face(outside.map(farWindow),'#9ca58c',{texture:'desk-window',uv:[[0,0],[1,0],[1,1],[0,1]],glow:true});
  function mullion(poly){tile(poly.map(windowPoint),0);}
  for(const x of [-520,-420,-310,-205,-103,-9])mullion(rect(x,-185,x+(x===-9?10:6),259));
  for(const [y,height] of [[-82,6],[26,6],[117,6],[203,6],[242,17]])mullion(rect(-620,y,1,y+height));
  for(let x=-620;x<0;x+=105){
    tile(rect(x,255,Math.min(0,x+105),295).map(windowPoint),0);
    const below=rect(x,296,Math.min(0,x+105),456);
    patch(below,rect(305,420,395,464),windowPoint);
    mullion(rect(x,293,x+5,457));
  }
  // Top rail of the original window remains available when looking up.
  tile(rect(0,-110,155,0).map(windowPoint),0);
  shellPlane([[0,0],[154,0],[154,284],[0,299]],p=>onZ(p,windowDepth(p)-.003));
  const panePoint=p=>onZ(p,windowDepth(p)-.031);
  for(const frame of [rect(14,0,26,259),rect(76,0,84,247),rect(113,0,124,247),rect(126,0,153,276),
    [[0,33],[129,74],[126,80],[0,41]],[[0,123],[128,148],[126,154],[0,130]],
    [[0,208],[125,204],[125,211],[0,216]],[[0,241],[128,232],[128,251],[0,264]]])
    mapped(frame,panePoint,repaired);
  // The separate low shelf by the window sits behind the desk's nearest leg.
  const lowShelf=[[0,290],[123,278],[126,309],[52,350],[48,406],[45,578],[30,580],[27,599],[0,599]];
  shellPlane(lowShelf,p=>onZ(p,deskZ+.14+Math.max(0,(357-p[1])*.012)));
  // Full length of the little book cabinet, cropped off on the left at rest.
  const bookCase=p=>onZ(p,deskZ+.13+Math.max(0,(357-p[1])*.012));
  for(const r of [rect(-204,296,1,310),rect(-204,391,1,411),rect(-204,548,1,562),
    rect(-204,311,-194,583),rect(-14,310,-6,578)])tile(r.map(bookCase),0);
  tile(rect(-191,313,-14,548).map(p=>onZ(p,deskZ+.29)),2);
  for(let i=0;i<8;i++){
    const x=-185+i*20,src=732+(i%6)*13;
    photo(rect(x,324+(i%3)*3,x+18,390).map(bookCase),rect(src,108,src+11,164),original);
  }
  for(let i=0;i<11;i++){
    const x=-190+i*16,y=420+(i%3)*6,src=728+(i%6)*14;
    photo(rect(x,y,x+14,548).map(bookCase),rect(src,108,src+10,164),original);
  }
  cutout(silhouettes.shelf,wallZ-.14,.16,{color:'#705738'});
  // Continue the book ledge just past the frame. Its last board, side grain,
  // spines and corbel are individually visible on a turn toward the lamp.
  const ledge=p=>onZ(p,wallZ-.15);
  photo([[899,162],[1018,163],[1024,168],[1023,183],[899,185]].map(ledge),[[805,163],[895,163],[899,169],[899,183],[805,184]],original);
  for(const [i,height] of [74,81,83,63,68].entries()){
    const x=925+i*12,y=162-height,src=735+i%3*13;
    photo(rect(x,y,x+11,163).map(p=>onZ(p,wallZ-.16-i*.003)),rect(src,86,src+10,164),original);
    photo([[x+11,y],[x+14,y+2],[x+14,163],[x+11,163]].map(ledge),rect(src+9,86,src+11,164),original);
  }

  // The shell of the solid worktop is a horizontal plane with a rounded
  // projecting edge. The two legs behind the chair sit deeper than the apron.
  shellPlane(topOutline,p=>onY(p,topY),{textureBrightness:p=>.87+.13*p.lamp});
  shellPlane([[17,344],[899,338],[899,358],[848,359],[50,364],[15,359]],p=>onZ(p,deskZ-.011));
  shellPlane(apronOutline,p=>onZ(p,deskZ+.009));
  for(const [key,z,thickness] of [['leftLeg',deskZ+.036,.13],['rightLeg',deskZ+.038,.13],['rearLeg',deskZ+.56,.095]])
    cutout(silhouettes[key],z,thickness,{color:'#744a2d'});

  for(const [key,[,thickness]] of Object.entries(props)){
    if(key==='contact')continue;
    const id=['research','profile','photos'].includes(key)?key:key.startsWith('lamp')?'lamp':undefined;
    const optics=key==='lampShade'?{textureBrightness:p=>.48+.52*p.lamp,glow:true}:{};
    cutout(silhouettes[key],propDepth(key),thickness,{id,...optics});
  }
  mapped(silhouettes.contact,p=>onY(p,topY+.008),original,{id:'contact'});

  // The near chair back has a long curved crest and a second, horizontal
  // cane seat. The cat and rear feet are independent occluding volumes.
  cutout(silhouettes.cat,onY([184,582],.018)[2],.10,{color:'#726858'});
  cutout(silhouettes.chairBack,deskZ-.31,.105,{color:'#663c26'});
  const seat=p=>onY(p,.36);
  mapped(silhouettes.chairSeat,seat,original);edges(silhouettes.chairSeat,seat,.07);

  // A felt-lined drawer box moves independently of its frame and brass pull.
  const slide={id:'drawer',transform:(x,y,z,p)=>[x,y,z-.46*p.drawer]};
  const dz=deskZ-.024,drawerPoint=p=>onZ(p,dz);
  mapped(drawerOutline,drawerPoint,original,slide);
  const lo=drawerPoint([80,413]),hi=drawerPoint([425,364]);
  const x1=lo[0]+.023,x2=hi[0]-.020,y0=lo[1]+.021,y1=hi[1]-.027;
  const dc=dz+.023,back=dc+.52;
  tile([[x1,y0,dc],[x2,y0,dc],[x2,y0,back],[x1,y0,back]],2,slide);
  tile([[x1,y1,dc],[x1,y1,back],[x1,y0,back],[x1,y0,dc]],0,slide);
  tile([[x2,y1,back],[x2,y1,dc],[x2,y0,dc],[x2,y0,back]],0,slide);
  tile([[x1,y1,back],[x2,y1,back],[x2,y0,back],[x1,y0,back]],0,slide);
  for(let i=0;i<3;i++)s.box(x1+.155+i*.004,y0+.014+i*.006,dc+.23+i*.006,.206,.005,.15,'#d9ccaa',slide);
  const card=rect(0,0,1,1).map(([u,v])=>[x1+.057+u*.199,y0+.031,dc+.166+v*.143]);
  tile(card,4,slide);
  for(let i=0;i<4;i++){
    const x=x2-.06-i*.023;
    s.box(x,y0+.017,dc+.24,.011,.012,.24,['#9a533a','#544e3c','#b7955b','#633a31'][i],slide);
    s.face([[x-.005,y0+.024,dc+.12],[x+.005,y0+.024,dc+.12],[x,y0+.019,dc+.092]],'#bd9c6c',slide);
  }
  cutout([[190,386],[193,379],[202,376],[209,379],[211,387],[207,392],[213,395],[280,395],[285,391],[282,385],[284,379],[291,376],[297,380],[299,386],[295,392],[291,397],[285,402],[207,402],[199,399],[196,392]],dz-.014,.014,slide);

  addBook();
  return s;

  function addBook() {
    const book={id:'notebook'},Y=topY+.044;
    // Fit a local frame to the actual photographed cover, then deform each
    // sheet in the same book coordinates used by the WebGL study and reader.
    const left=onY([313,323],Y),right=onY([463,323],Y),far=onY([329,293],Y);
    const sx=(right[0]-left[0])/BOOK_WIDTH,sz=(far[2]-left[2])/BOOK_DEPTH;
    const skew=(far[0]-left[0])/BOOK_DEPTH;
    const world=(x,y,z)=>[left[0]+x*sx+(BOOK_DEPTH/2-z)*skew,Y+(y-.123)*sx,left[2]+(BOOK_DEPTH/2-z)*sz];
    const inverse=(x,y,z)=>[(x-left[0]-(z-left[2])/sz*skew)/sx,(y-Y)/sx+.123,BOOK_DEPTH/2-(z-left[2])/sz];
    const poseCover=(x,y,z,p)=>{
      const local=inverse(x,y,z),pose=coverPose(p.notebook),dy=local[1]-.112;
      return world(Math.cos(pose.angle)*local[0]-Math.sin(pose.angle)*dy,pose.height+Math.sin(pose.angle)*local[0]+Math.cos(pose.angle)*dy,local[2]);
    };
    const cover={...book,transform:poseCover};
    const foreEdge=[[312,322],[464,321],[466,334],[465,337],[332,337],[329,341],[323,340],[324,337],[313,336]];
    mapped(foreEdge,p=>onZ(p,left[2]-.003),original,book);
    mapped([[458,292],[464,322],[466,335],[461,316]],p=>onZ(p,left[2]+.015),original,book);
    const corners=[[.011,-1],[BOOK_WIDTH-.013,-1],[BOOK_WIDTH-.013,1],[.011,1]];
    const rightPage=corners.map(([x,z])=>world(x,.094,z*(BOOK_DEPTH/2-.016)));
    tile(rightPage,6,book);
    const coords=[[329,293],[457,292],[463,322],[313,323]];
    const top=[world(0,.123,-BOOK_DEPTH/2),world(BOOK_WIDTH,.123,-BOOK_DEPTH/2),world(BOOK_WIDTH,.123,BOOK_DEPTH/2),world(0,.123,BOOK_DEPTH/2)];
    photo(top,coords,original,cover);
    const lower=top.map(v=>[v[0],v[1]-.010,v[2]]);
    for(let i=0;i<4;i++){const j=(i+1)%4;tile([top[i],top[j],lower[j],lower[i]],2,cover);}
    tile([lower[3],lower[2],lower[1],lower[0]],7,cover);
    for(let i=0;i<3;i++){const y=topY+.010+i*.005;s.box((left[0]+right[0])/2,y,left[2]+.002,right[0]-left[0],.002,.009,'#ba9f76',book);}
    const localLeaf=(u,v,side)=>world(.012+(BOOK_WIDTH-.037)*u,.098+side*.0008,(v-.5)*(BOOK_DEPTH-.038));
    const leaf={...book,transform:(x,y,z,p)=>{
      const a=inverse(x,y,z),u=(a[0]-.012)/(BOOK_WIDTH-.037),v=a[2]/(BOOK_DEPTH-.038)+.5;
      const b=leafPosition(p.notebook,u,v,false,[]);
      const neighbor=leafPosition(p.notebook,u+.0001,v,false,[]);
      const dx=neighbor[0]-b[0],dy=neighbor[1]-b[1],len=Math.hypot(dx,dy)||1;
      return world(b[0]-(a[1]-.098)*dy/len,b[1]+(a[1]-.098)*dx/len,b[2]);
    }};
    for(let i=0;i<13;i++)for(let j=0;j<3;j++)for(const side of [-1,1]){
      const a=i/13,b=(i+1)/13,c=j/3,d=(j+1)/3;
      const grid=[[a,c],[b,c],[b,d],[a,d]],slot=side===1?4:5;
      const uv=grid.map(([u,v])=>[(slot%4+.01+.98*(side===1?u:1-u))/4,(1+.01+v*.98)/2]);
      s.face(grid.map(([u,v])=>localLeaf(u,v,side)),'#e8d6ad',{...leaf,texture:'desk-joinery',uv});
    }
  }
}
