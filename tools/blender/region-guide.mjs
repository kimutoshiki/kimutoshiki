// Existing surveyed site footprints, floor profiles, and building shells for Blender authoring.
// Waseda's entrance axis follows its current campus plan. Karatsu's north and
// east offsets relate its streets to the historic bank, Mt Mitsushima and bay.
import { CASTLE_CENTER, CASTLE_COURT_Y, REGION_BOUNDS, regionalHeight } from '../../scene/world-layout.js';
import { coloredGeometry,treeGeometry } from '../../scene/walk-districts.js';
import {createLeafSprays} from '../../scene/grove-foliage.js';

function surfaceMap(T,kind) {
  const side=128,bytes=new Uint8Array(side*side*4);
  let seed=24691;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const tones={court:[163,151,131],walk:[166,157,145],street:[83,84,82],shore:[102,113,78],sea:[57,115,143],sand:[191,173,143]};
  for(let y=0;y<side;y++)for(let x=0;x<side;x++) {
    const row=Math.floor(y/24),mortar=kind==='walk' && (y%24===0||(x+row%2*32)%64===0);
    const grit=(rand()-.5)*(kind==='street'?20:14)+Math.sin(x*.142+Math.sin(y*.042))*2;
    const glint=kind==='sea'?Math.pow(Math.max(0,Math.cos(y*.45+Math.sin(x*.23)+Math.sin(y*.147))),11)*18:0;
    const offset=(y*side+x)*4;
    for(let k=0;k<3;k++)bytes[offset+k]=tones[kind][k]+grit+glint-(mortar?29:0);
    bytes[offset+3]=255;
  }
  const map=new T.DataTexture(bytes,side,side);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=T.LinearFilter;
  map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}

export function createRegionalLandscape(T,region) {
  if(!Object.hasOwn(REGION_BOUNDS,region))throw new RangeError('Unknown walking region');
  const group=new T.Group();group.name=region==='waseda'?'早稲田キャンパス · 正門と中央通り':'唐津 · 城下町と舞鶴公園';
  const geometries=new Set(),materials=new Set(),textures=new Set(),collisions=[],surfaces=new Map();
  const architecture=new T.MeshStandardMaterial({roughness:.92,flatShading:true,vertexColors:true});
  architecture.name='Architectural masonry and joinery';materials.add(architecture);
  const ground=(x,z)=>regionalHeight(region,x,z);
  const add=(geometry,material,name,cast=true)=>{
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=cast;mesh.receiveShadow=true;
    group.add(mesh);geometries.add(geometry);materials.add(material);return mesh;
  };
  function obstacle(name,x,z,w,d,h=3) {
    collisions.push({id:name,box:new T.Box3(new T.Vector3(x-w/2,ground(x,z),z-d/2),new T.Vector3(x+w/2,ground(x,z)+h,z+d/2))});
  }
  function build(name,fn){const g=coloredGeometry(T);fn(g);return add(g.finish(),architecture,name);}
  function top(name,kind,x,z,w,d,y=0,hill=false,nx=1,nz=1){
    if(!surfaces.has(kind)){
      const map=surfaceMap(T,kind);textures.add(map);
      const m=new T.MeshStandardMaterial({map,roughness:kind==='sea'?.48:.95,metalness:kind==='sea'?.10:0});
      m.name=kind;surfaces.set(kind,m);materials.add(m);
    }
    const geometry=new T.PlaneGeometry(w,d,nx,nz);geometry.rotateX(-Math.PI/2);
    const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');const repeat=kind==='sea'?13:2.8;
    for(let i=0;i<p.count;i++) {
      const xx=x+p.getX(i),zz=z+p.getZ(i);p.setY(i,y+(hill?ground(xx,zz):0));uv.setXY(i,xx/repeat,zz/repeat);
    }
    if(hill)geometry.computeVertexNormals();
    const mesh=add(geometry,surfaces.get(kind),name,false);mesh.position.set(x,0,z);
    return mesh;
  }
  function grove(name,pine,places) {
    if(!places.length)return;
    const forms=treeGeometry(T,pine),sprays=createLeafSprays(T,pine);
    if(!pine)sprays.material.color.set('#8f9d67');
    textures.add(sprays.texture);materials.add(sprays.material);
    const wood=new T.InstancedMesh(forms.wood,architecture,places.length);
    const leaves=new T.InstancedMesh(forms.leaves,sprays.material,places.length);
    wood.name=name+' · branching trunks';leaves.name=name+' · leaves';
    const transform=new T.Object3D();
    places.forEach(([x,z,size,angle],i)=>{
      transform.position.set(x,ground(x,z),z);transform.rotation.y=angle??i*2.399;transform.scale.setScalar(size);
      transform.updateMatrix();wood.setMatrixAt(i,transform.matrix);leaves.setMatrixAt(i,transform.matrix);
      obstacle('Tree '+x+','+z,x,z,.36*size,.36*size,3);
    });
    for(const mesh of [wood,leaves]){
      mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();geometries.add(mesh.geometry);group.add(mesh);
    }
  }
  function building(g,{x,z,w,d,h,floors,bays,front=1,color='#ab9a87',window='#5e7476',pilasters=false,road=false,offsite=false}) {
    const face=z+front*d/2,corner='#c7c1ad',timber=road?'#6f675c':'#8a8173';
    const facade=(px,py,offset,bw,bh,bd,bcolor)=>g.box(px,py,face+offset*front,bw,bh,bd,bcolor);
    // The occupied glass line sits inside the masonry, so a low side view
    // sees the jamb, sill and soffit of each opening, with accurate shadows.
    const campusFront=!road&&floors<8, recess=campusFront?.51:0;
    g.box(x,h/2,z-front*recess/2,w,h,d-recess,color);
    g.box(x,.25,z-front*recess/2,w+.12,.50,d-recess+.12,'#a6a093');
    g.box(x,h+.16,z,w+.45,.32,d+.42,corner);g.box(x,h+.43,z,w-.45,.28,d-.42,'#717974');
    if(!offsite)obstacle('Building '+x+','+z,x,z,w,d,h);
    if(campusFront) {
      for(const sign of [-1,1]){
        g.box(x,h+.58,z+sign*(d*.5-.15),w+.1,.65,.29,color);
        g.box(x,h+.94,z+sign*(d*.5-.15),w+.3,.12,.46,'#bcb4a0');
        g.box(x+sign*(w*.5-.15),h+.59,z,.29,.67,d-.54,color);
        g.box(x+sign*(w*.5-.15),h+.93,z,.43,.11,d-.44,'#bcb4a0');
      }
      for(const off of [-.43,.44]){
        const xx=x+w*off;
        g.beam([xx,.37,face+front*.21],[xx,h+.35,face+front*.21],.083,.083,'#6a7170',7);
        for(let yy=1.6;yy<h;yy+=3.1)facade(xx,yy,.20,.23,.065,.22,'#595d56');
      }
    }
    for(let n=0;n<floors;n++) {
      const sh=h/floors,yy=(n+.51)*sh;
      if(!campusFront || n>0)facade(x,(n+.03)*sh,.075,w+.19,.18,.27,corner);
      // Window reveals on both ends matter when circling buildings on foot.
      const ends=Math.max(2,Math.round(d/4.6));
      for(const sign of [-1,1]) for(let j=0;j<ends;j++){
        const zz=z+(j+.5-ends*.5)*d/ends,xx=x+sign*w*.5;
        g.box(xx+sign*.050,yy,zz,.13,sh*.65,d/ends*.59,corner);
        g.box(xx+sign*.140,yy,zz,.066,sh*.55,d/ends*.51,window);
        g.box(xx+sign*.182,yy,zz,.035,sh*.55,.064,timber);
      }
      const rear=z-front*d*.5;
      for(let j=0;j<bays;j++){
        const xx=x+(j+.5-bays*.5)*w/bays;
        g.box(xx,yy,rear-front*.06,w/bays*.55,sh*.60,.15,corner);
        g.box(xx,yy,rear-front*.159,w/bays*.48,sh*.51,.065,window);
      }
      for(let i=0;i<bays;i++){
        const pitch=w/bays,bw=pitch*(road?.67:.59),xx=x+(i+.5-bays*.5)*pitch,wh=sh*.59;
        if(campusFront){
          const door=n===0 && i===Math.floor((bays-1)/2);
          const opening=door?Math.min(pitch*.72,3.25):bw;
          const sill=door?.12:yy-wh*.5,head=door?Math.min(sh-.30,3.32):yy+wh*.5;
          const halfPier=(pitch-opening)/2,glassDepth=-.30;
          facade(xx,(n+1)*sh-((n+1)*sh-head)/2,-recess/2,pitch,(n+1)*sh-head,recess,color);
          for(const side of [-1,1]){
            facade(xx+side*(opening+halfPier)/2,(n+.5)*sh,-recess/2,halfPier,sh,recess,color);
            facade(xx+side*(opening/2+.015),(sill+head)/2,-.165,.10,head-sill,.34,corner);
          }
          if(n*sh<sill)facade(xx,(n*sh+sill)/2,-recess/2,opening,sill-n*sh,recess,color);
          const pane=door?'#455a59':[window,'#7c8988','#63797d','#87938d'][(n*3+i+Math.floor(Math.abs(x)))%4];
          facade(xx,(sill+head)/2,glassDepth,opening-.08,head-sill-.04,.075,pane);
          facade(xx,head-.04,-.08,opening+.22,.15,.46,corner);
          facade(xx,sill+.01,-.07,opening+.20,.12,.51,'#afa897');
          const inner=door?'#645746':'#696d65',light=head-(door?.57:.32*(head-sill));
          facade(xx,(sill+head)/2,glassDepth+.09,.069,head-sill,.095,inner);
          facade(xx,light,glassDepth+.09,opening-.04,.077,.085,inner);
          if(door){
            for(const side of [-1,1]){
              facade(xx+side*opening*.245,sill+.18,glassDepth+.075,opening*.46,.32,.083,'#74766a');
              facade(xx+side*.13,1.18,glassDepth+.19,.035,.45,.055,'#b3a28b');
            }
            facade(xx,head+.24,.30,opening+1.14,.21,1.48,'#6f7168');
            facade(xx,head+.39,.33,opening+1.22,.085,1.55,'#aea994');
            for(const side of [-1,1])g.beam([xx+side*opening*.43,head+.97,face],[xx+side*opening*.43,head+.41,face+front*.94],.027,.026,'#656963',5);
            for(let step=0;step<2;step++)facade(xx,.035+step*.05,.47-step*.20,opening+.55-step*.12,.07+step*.065,.78-step*.32,'#b9b6a5');
          }else if(pilasters && n===0){
            const pierX=xx-pitch/2+.18;
            facade(pierX,h*.5,.075,.35,h-.22,.37,'#baa58a');
            facade(pierX,.37,.135,.59,.68,.44,'#b0a58e');
            facade(pierX,h-.27,.145,.59,.25,.50,corner);
          }
          continue;
        }
        facade(xx,yy,.089,bw+.25,wh+.26,.22,corner);
        facade(xx,yy,.213,bw,wh,.065,window);
        facade(xx+bw*.22,yy+wh*.18,.253,bw*.27,wh*.47,.02,'#92a3a3');
        facade(xx,yy,.269,.075,wh,.08,timber);
        facade(xx,yy+wh*.16,.27,bw,.07,.08,timber);
        facade(xx,yy-wh/2-.10,.16,bw+.35,.14,.39,corner);
        if(pilasters&&n===0)facade(xx-pitch*.46,h/2,.13,.38,h-.22,.41,corner);
      }
    }
  }
  function bench(g,x,z,face=1) {
    const dark='#425047';for(const xx of [-.77,.77]){g.box(x+xx,.24,z,.10,.48,.63,dark);g.box(x+xx,.67,z-face*.27,.065,.83,.07,dark);}
    for(let i=0;i<4;i++)g.box(x,.51,z+(i-1.5)*.14,2.04,.065,.11,'#897459');
    for(let i=0;i<2;i++)g.box(x,.77+i*.16,z-face*.32,2.04,.11,.07,'#8f785b');
    obstacle('Bench '+x+','+z,x,z,2.04,.65,1);
  }
  if(region==='waseda'){
    top('Main campus · courtyard and open ground','court',83,230,281,190,-.012);
    top('Granite walk from the main gate to the statue','walk',49,230,203,14,.002);
    top('North–south cross walk at the bronze','walk',.1,228,11,125,.003);
    top('Street across the entrance and auditorium forecourt','walk',137,234,20.8,175,.004);
    top('Stepped forecourt on the west side of the auditorium','walk',155.6,253.4,39.8,68.0,.006);
    top('Approach beside Building 1','walk',126.9,251,14.2,46.1,.005);
    build('University buildings around the main gate',g=>{
      // The recreated old Building 3 faces the central avenue. Its modern
      // tower is set well back to the north as on the present campus plan.
      building(g,{x:61,z:207.5,w:92,d:31,h:13.6,floors:3,bays:16,front:1,color:'#b79d84',pilasters:true});
      building(g,{x:58,z:177.6,w:66,d:24,h:67.84,floors:14,bays:13,front:1,color:'#a6aaa5',window:'#829497'});
      building(g,{x:106.8,z:265.4,w:35.4,d:34.6,h:17,floors:4,bays:10,front:-1,color:'#b7ab96',pilasters:true});
      building(g,{x:52,z:273.8,w:36,d:46,h:14.1,floors:3,bays:10,front:-1,color:'#9f8873',pilasters:true});
      building(g,{x:-7,z:191.7,w:39,d:44,h:18.7,floors:5,bays:8,front:1,color:'#b9b3a4'});
      building(g,{x:-9,z:276.1,w:44,d:43,h:19.4,floors:5,bays:8,front:-1,color:'#b3b2a8'});
      // The avenue continues between two side elevations on its westward
      // sightline. These offsite shells sit beyond the walking boundary.
      building(g,{x:-77.5,z:207.5,w:34,d:26.5,h:12.4,floors:3,bays:6,front:1,color:'#ae9b85',window:'#71837f',offsite:true});
      building(g,{x:-82,z:260,w:38,d:33,h:16.2,floors:4,bays:7,front:-1,color:'#b8b0a0',window:'#72878a',offsite:true});
      // Low-rise street elevations beyond the auditorium grounds break up
      // the distant city blocks between the trees and the tower silhouette.
      building(g,{x:240,z:247,w:28,d:19.2,h:11.6,floors:3,bays:6,front:1,color:'#b7ac96',offsite:true});
      // The flagstones change direction at the campus intersection. Keep a
      // continuous level surface with pairs of slender stone sett bands.
      for(const zz of [223.75,236.25]){
        for(const [begin,end] of [[-51,-5.8],[5.8,131.1]]){
          const count=Math.ceil((end-begin)/3.2),span=(end-begin)/count;
          for(let j=0;j<count;j++)g.box(begin+(j+.5)*span,.014,zz,span-.022,.022,.16,j%4===0?'#aaa79a':'#b3afa2');
        }
      }
      for(const xx of [129.4,134.1]){
        for(let j=0;j<9;j++)g.box(xx,.017,221.1+j*2.04,.23,.021,2.01,j%2?'#b7b2a2':'#afa997');
      }
      // Low gateposts and the iron fence stop at the open central path.
      for(const zz of [221,239]){
        g.box(132,.24,zz,1.14,.48,1.14,'#999286');g.box(132,1.43,zz,.91,2.14,.91,'#a79a87');
        g.box(132,2.57,zz,1.13,.21,1.13,'#c4baab');obstacle('Main gate '+zz,132,zz,1.14,1.14);
      }
      for(const [lo,hi] of [[190,219.5],[240.4,269]]){
        for(let z=lo;z<hi;z+=.66)g.box(132,.87,z,.04,1.58,.042,'#595e55');
        g.box(132,1.45,(lo+hi)/2,.06,.09,hi-lo,'#626458');
      }
      // The monument's clipped planted bed has an open foreground pavement.
      const rounded=(w,d,r,h)=>Array.from({length:24},(_,i)=>{
        const corner=Math.floor(i/6),a=(corner*90+(i%6)*18)*Math.PI/180;
        const xx=[1,-1,-1,1][corner]*(w/2-r),zz=[1,1,-1,-1][corner]*(d/2-r);
        return [xx+Math.cos(a)*r,h,230+zz+Math.sin(a)*r];
      });
      g.rings(rounded(4.54,5.45,.75,.01),rounded(4.54,5.45,.75,.14),'#918e7c');
      g.rings(rounded(4.36,5.27,.70,.139),rounded(4.36,5.27,.70,.16),'#554c3c');
      obstacle('Planted statue bed',0,230,4.54,5.45,.65);
      for(const x of [-14,20,46,74]){bench(g,x,220.3,1);bench(g,x+3,239.2,-1);}
    });
    // The main axis stays open. Behind the statue, the campus path continues
    // between Buildings 7 and 8 rather than doubling back onto the auditorium.
    const trees=[];
    for(const [offset,line] of [[0,217.8],[3.7,242.3]]){
      for(const x of [-37,-24,-11,15,29,46,62,77,94,110,123])trees.push([x+offset,line+Math.sin(x)*.63,1.56+.13*Math.cos(x)]);
    }
    for(const [x,z] of [[-16,225],[-21,236],[149,207],[166,210],[181,212],[193,225],[198,219],[164,296],[190,304]])trees.push([x,z,1.65]);
    grove('Mature campus avenue and garden side planting',false,trees);
  }else{
    const [cx,cz]=CASTLE_CENTER;
    top('Ground of the Karatsu castle town','court',1990,875,1320,820,-.013);
    top('Sea north of Mt Mitsushima','sea',2080,cz-177,1280,155,-.016);
    top('Matsuura river mouth east of the keep','sea',cx+190,cz+58,160,350,-.01);
    obstacle('Bay shoreline',2080,cz-177,1280,155);
    const riverX=cx+190,bridgeZ=cz+100;
    for(const [low,high] of [[cz-117,bridgeZ-4.5],[bridgeZ+4.5,cz+233]])obstacle('East river '+low,riverX,(low+high)/2,160,high-low);
    top('Sandy levee on the east bank','sand',riverX+109,cz+71,57,327,-.005);
    top('Bridge and east-bank road junction','street',riverX+95,bridgeZ,31,9,.012);
    top('Bridge deck over the Matsuura river','street',riverX,bridgeZ,168,8.5,.11);
    build('Bridge railings at the river mouth',g=>{
      for(const side of [-1,1]){
        const z=bridgeZ+side*4.21;g.box(riverX,.94,z,168,.12,.11,'#88928b');
        for(let x=riverX-84;x<=riverX+84;x+=3.15)g.box(x,.57,z,.11,1.05,.13,'#777f7a');
        obstacle('Bridge railing '+side,riverX,z,168,.20,1.1);
      }
    });
    // A real smooth height field joins the inhabited city to the elevated
    // bailey. Walking samples this same terrain instead of floating at sea level.
    top('Mt Mitsushima · city-facing slope','shore',cx,cz+12,233,306,0,true,100,128);
    top('Packed earth of the upper bailey','sand',cx,cz+12,76,108,.012,true,46,64);
    top('Stone forecourt and foundation below the former bank','walk',1601,1098,36,30,.001);
    top('South street along the former bank frontage','street',1600,1118.8,197,12.6,.007);
    top('West cross street at the bank intersection','street',1579.8,1096.5,7.5,132,.009);
    top('Pavement south of the bank','walk',1602.9,1111.12,38.2,3.25,.011);
    top('Far sidewalk at the town crossroads','walk',1607,1127.5,171,4.2,.012);
    top('Eastward street into the castle district','street',1944,1075.5,758,9.7,.008);
    top('Castle approach from the city','street',cx-75,853,9.2,437,.009);
    build('Street blocks and footpaths around Gofukumachi',g=>{
      for(const [x,z,w,d,h,bays,c] of [[1558,1102,25,20,8.8,5,'#9f9482'],[1634,1094,18,29,10,4,'#bdb7a6'],[1660,1097,24,24,8,5,'#978576'],[1556,1140,27,16,7.8,6,'#b4ac99'],[1597,1141,22,17,8.4,5,'#bbb3a0'],[1624,1143,23,20,7.4,5,'#9d9183'],[1655,1140,27,17,12.1,6,'#a8a59a']]){
        building(g,{x,z,w,d,h,floors:h>11?3:2,bays,front:z<1120?1:-1,color:c,road:true});
      }
      for(const [x,z] of [[1585,1111.7],[1614,1112.2],[1636,1112.4],[1571.5,1127.2],[1611,1127.2]]){
        g.beam([x,0,z],[x,4.67,z],.083,.058,'#60706c',8);
        g.beam([x,4.62,z],[x,4.75,z+.64],.06,.052,'#52635e',6);
        g.box(x,4.61,z+.61,.28,.20,.42,'#d8d6c0');obstacle('Streetlight '+x,x,z,.24,.24,4.7);
      }
      for(let i=0;i<7;i++)g.box(1577.35,.02,1113.9+i*1.55,4.2,.02,.58,'#d0cec1');
      const shopColors=['#b2a895','#a8a090','#b3afa3','#9f9586','#aa9b8a'];
      // Low city blocks recede into the real gap between bank and castle.
      for(let i=0;i<30;i++){
        const x=1649+i*18.2,side=i%2?1:-1,z=1075.5+side*19.1,h=6+(i%4)*1.45;
        const w=12+(i%3)*1.5,depth=12+(i%2)*2.1;
        g.box(x,h/2,z,w,h,depth,shopColors[i%5]);g.box(x,h+.17,z,w+.4,.35,depth+.35,'#7b817c');
        obstacle('Town block '+i,x,z,w,depth,h);
      }
    });
    build('Honmaru · tiled parapet, entrance steps and outlook',g=>{
      const Y=CASTLE_COURT_Y;
      // A low plaster perimeter on the west side links the gate and keep.
      for(let i=0;i<6;i++){
        const x=cx-18.1-i*3.4,z=cz+8.6;
        g.box(x,Y+1.16,z,3.5,2.32,.68,'#d8d8c7');
        g.box(x,Y+.32,z,3.54,.64,.77,'#85897a');
        g.box(x,Y+2.35,z,3.63,.17,.99,'#536365');
        g.box(x,Y+2.51,z,3.53,.13,.72,'#6e7571');
        for(const off of [-.86,.76])g.box(x+off,Y+1.46,z+.347,.175,.25,.045,'#677067');
        obstacle('Honmaru tiled wall '+i,x,z,3.5,.75);
      }
      // The white gallery projects forward on the west side of the entrance.
      // Its gabled roof and separate recessed bays are visible from either side.
      const gx=cx-13.5,gz=cz+22.5,span=20,w=4.25,eave=Y+3.28;
      g.box(gx,Y+1.55,gz,w,3.10,span,'#d7d7c7');
      g.box(gx,Y+.40,gz,w+.05,.8,span+.06,'#84857b');
      const gable=zz=>[[gx-w*.64,eave-.14,zz],[gx,eave+1.02,zz],[gx+w*.64,eave-.14,zz]];
      g.rings(gable(gz-span*.52),gable(gz+span*.52),'#5e6865');
      g.box(gx,eave+1.02,gz,.19,.19,span+.84,'#7b807c');
      for(let i=0;i<13;i++){
        const z=gz-span*.49+i*span*.08;
        for(const dir of [-1,1]){
          g.beam([gx,eave+1.04,z],[gx+dir*w*.64,eave-.09,z],.038,.038,'#7a8079',5);
        }
      }
      for(let i=0;i<4;i++){
        const z=gz-span*.39+i*span*.25;
        g.box(gx+w/2+.035,Y+1.71,z,.065,.59,.46,'#48514b');
        g.box(gx+w/2+.045,Y+1.59,z+1.75,.09,3.07,.13,'#6b6654');
      }
      obstacle('White plaster west gallery',gx,gz,w,span,4.3);
      // The granite kerb separates the sandy court from planted ground.
      for(let j=0;j<12;j++){
        const z=cz+5+j*3,x=cx+24.8+.9*Math.sin(j*.41);
        g.box(x,ground(x,z)+.15,z,.41,.3,2.98,'#95958a');
      }
      for(let i=0;i<6;i++){
        const x=cx+14.9,z=cz+9+i*.43;
        g.box(x,Y+(6-i)*.109,z,3.64,.21,.79,'#abb0a4');
      }
    });
    const pines=[];
    for(let i=0;i<42;i++){
      const a=i*2.399,r=1.0+.43*Math.sin(i*23.71);
      const x=cx+Math.cos(a)*r*61,z=cz+12+Math.sin(a)*r*72;
      if(Math.abs(x-cx)<23&&z>cz-13&&z<cz+57)continue;
      pines.push([x,z,1.34+.39*(.5+.5*Math.sin(i+.4))]);
    }
    for(let i=0;i<14;i++)pines.push([riverX+94+8*Math.sin(i*2.11),cz-55+i*13,1.34+.19*Math.sin(i*3.17)]);
    grove('Pine crowns below the bailey and along the bay',true,pines);
  }
  group.updateMatrixWorld(true);
  let disposed=false;
  return {group,collisions,dispose(){
    if(disposed)return;disposed=true;
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }};
}
