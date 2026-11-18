import {LANDMARK_SITES} from './world-layout.js';

const CASTLE = LANDMARK_SITES.find(site=>site.key==='karatsu-castle');

// Individual architectural surroundings share one material and one colour
// buffer per place, so a street of shopfronts or an entire masonry bank needs
// a single draw call and can be culled independently of the other places.
export function createPlaceSettings(T,{root,obstacle,materials,geometries,textures,makeGeometry}) {
  const material=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.89});
  material.name='Local stone, brick, timber and painted plaster';materials.add(material);
  const groups=[];
  function place(name,build) {
    const shape=makeGeometry(T);build(shape);
    const geometry=shape.finish();geometries.add(geometry);
    const mesh=new T.Mesh(geometry,material);
    mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.placeSetting=true;
    root.add(mesh);groups.push(mesh);
  }

  function roofAlongX(g,x,z,w,d,eave,rise,color) {
    const end=xx=>[[xx,eave,z-d/2],[xx,eave+rise,z],[xx,eave,z+d/2]];
    g.rings(end(x-w/2),end(x+w/2),color);
    g.box(x,eave+rise,z,w+.13,.11,.17,'#616364');
    g.box(x,eave-.03,z+d/2,w,.12,.19,'#343a3c');
    g.box(x,eave-.03,z-d/2,w,.12,.19,'#343a3c');
  }

  function campusWing(g,x,z,bays) {
    const pitch=2.44,w=bays*pitch+.95,h=8.6,depth=6.6;
    const front=z+depth/2, stone='#cfbd9c', brick='#93533e';
    g.box(x,h/2,z,w,h,depth,brick);
    obstacle('campus-campus-wing-'+x,x,z,w,depth,h);
    g.box(x,.34,z,w+.18,.68,depth+.17,'#9c917d');
    for(const y of [3.54,7.7,8.42])g.box(x,y,front+.025,w+.24,.12,.29,stone);
    roofAlongX(g,x,z,w+.85,depth+.78,h,.95,'#555a54');
    for(let i=0;i<bays;i++){
      const xx=x+(i-(bays-1)/2)*pitch;
      for(const y of [2.0,5.63]){
        const width=1.56,height=2.54;
        g.box(xx,y,front+.07,width+.22,height+.23,.18,'#c7ae8c');
        g.box(xx,y-.02,front+.17,width,height,.12,'#364d50');
        g.box(xx+.35,y+.33,front+.245,.57,1.12,.03,'#65817e');
        g.box(xx,y,front+.27,.10,height,.08,'#c0af94');
        g.box(xx,y+.45,front+.28,width,.085,.09,stone);
        g.box(xx,y-.48,front+.28,width,.064,.09,'#b39879');
        g.box(xx,y-height/2-.12,front+.17,width+.43,.14,.44,stone);
        g.box(xx,y+height/2+.10,front+.17,width+.32,.18,.35,'#b98c68');
      }
      for(const y of [.80,3.26,4.26,6.94]){
        g.box(xx+pitch/2,y,front+.07,.35,.16,.22,'#bb9b78');
      }
    }
  }

  place('Waseda quadrangle · brick faculty wing and clock plaza',g=>{
    campusWing(g,-31,21.7,7);
    // Paired limestone entrance piers with copper caps frame the approach.
    for(const [x,z] of [[-7.3,35.2],[-10.0,30.1]]){
      g.box(x,.15,z,1.09,.30,1.09,'#a19582');
      g.box(x,1.15,z,.81,1.78,.81,'#9c5947');
      for(const y of [.45,1.73,2.08])g.box(x,y,z,.94,.10,.94,'#d6c5a7');
      g.box(x,2.17,z,1.08,.10,1.08,'#9c907a');
      g.rings([[-.51,.23,-.51],[.51,.23,-.51],[.51,.23,.51],[-.51,.23,.51]].map(([a,b,c])=>[x+a,2+b,z+c]),
        [[-.23,.41,-.23],[.23,.41,-.23],[.23,.41,.23],[-.23,.41,.23]].map(([a,b,c])=>[x+a,2+b,z+c]),'#748378');
      obstacle('clock-plaza-pier-'+x,x,z,1.09,1.09,2.45);
    }
  });

  place('Okuma avenue · clipped garden borders and reading benches',g=>{
    const axis=[-.56,.828], perpendicular=[.828,.56], origin=[-7,22];
    const point=(along,side)=>[origin[0]+along*axis[0]+side*perpendicular[0],origin[1]+along*axis[1]+side*perpendicular[1]];
    for(const side of [-1,1])for(const along of [-7.3,-2.6,3.9,8.5]){
      const [x,z]=point(along,side*3.45);
      // Foliage clusters within low, edged beds leave the central sightline open.
      g.box(x,.13,z,1.62,.25,1.38,'#a99f8d');
      g.box(x,.37,z,1.48,.41,1.24,'#476452');
      g.box(x-.20,.59,z+.04,.94,.15,.87,'#63835d');
      obstacle('avenue-hedge-'+side+'-'+along,x,z,1.62,1.38,.68);
    }
    const granite=['#a49986','#bdb099','#9f9483'];
    const radius=2.16,w=.23,segments=40;
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2-.006;
      const corner=(ang,r,y)=>[origin[0]+Math.cos(ang)*r,y,origin[1]+Math.sin(ang)*r];
      const face=y=>[corner(a,radius,y),corner(b,radius,y),corner(b,radius-w,y),corner(a,radius-w,y)];
      g.rings(face(-.01),face(.012),granite[i%3]);
    }
  });

  function merchant(g,x,z,width,depth,story,cloth,frontSign=1) {
    const h=story?5.84:3.25, dark='#514338', plaster=story?'#d5c5ad':'#c5b29a';
    const f=z+frontSign*depth/2;
    const facade=(xx,y,offset,w,h,d,color)=>g.box(xx,y,f+frontSign*offset,w,h,d,color);
    g.box(x,h/2,z,width,h,depth,plaster);
    obstacle('bank-street-shop-'+x+'-'+z,x,z,width,depth,h);
    g.box(x,.14,z,width+.22,.28,depth+.14,'#9a9388');
    roofAlongX(g,x,z,width+.74,depth+.9,h,1.24,'#505a5c');
    for(let i=0;i<=4;i++)facade(x+(i/4-.5)*width,1.56,.06,.16,2.88,.21,dark);
    facade(x,1.43,.031,width-.26,2.26,.08,'#5b5247');
    for(let i=0;i<27;i++)facade(x+(i/26-.5)*(width-.35),1.36,.11,.045,2.04,.08,'#85725b');
    for(const y of [.46,1.16,2.37])facade(x,y,.16,width-.14,.07,.06,'#5e4938');
    // Three split noren curtains, attached to a bamboo rail above the doorway.
    const signX=x-width*.16;
    facade(signX,2.02,.25,width*.35,.073,.08,'#b59c73');
    for(let i=0;i<3;i++) {
      const xx=signX+(i-1)*width*.105;
      facade(xx,1.74,.23,width*.098,.50,.045,cloth);
      facade(xx,1.79,.262,.115,.115,.015,'#ddc8a4');
    }
    const awningTop=f-frontSign*.12,awningEdge=f+frontSign*.88;
    const awning=xx=>[[xx,2.98,awningTop],[xx,2.98,awningTop+frontSign*.13],[xx,2.61,awningEdge],[xx,2.53,awningEdge]];
    g.rings(awning(x-width*.53),awning(x+width*.53),'#515c59');
    facade(x,2.56,.88,width*1.07,.085,.11,'#8e7761');
    if(story){
      facade(x,4.44,.065,width*.80,1.36,.13,'#526264');
      for(let i=0;i<=12;i++)facade(x+(i/12-.5)*width*.81,4.45,.16,.067,1.48,.085,dark);
      for(const y of [3.69,5.17])facade(x,y,.16,width*.86,.17,.18,dark);
      for(let i=0;i<3;i++)facade(x+(i-1)*width*.40,4.46,.17,.13,1.48,.11,'#e0ccb1');
    }
    for(let j=0;j<=Math.floor(width/.48);j++){
      const xx=x-width*.49+j*.48;
      g.beam([xx,h+1.23,z],[xx,h+.02,z+frontSign*(depth/2+.4)],.046,.046,'#707775',5);
    }
  }
  place('Karatsu old town · timber shopfronts and copper eaves',g=>{
    for(const [x,z,w,d,s,c] of [[9.1,5.9,5,4.3,1,'#365965'],[15.15,6.2,6.1,4.0,1,'#874f45'],[21.8,6.1,6.0,4.3,0,'#5c7050'],[28.45,6.3,6.6,4.4,1,'#55576a'],[36.3,6.0,5.6,4.4,0,'#9b7044']])merchant(g,x,z,w,d,s,c);
    for(const [x,z] of [[8,10.1],[23.6,10.5],[37.9,10.3]]){
      g.box(x,.15,z,.37,.30,.37,'#aaa294');g.beam([x,.20,z],[x,3.30,z],.081,.054,'#394f4d',8);
      g.box(x,3.40,z,.32,.42,.32,'#e6d9ad');g.box(x,3.66,z,.48,.10,.48,'#607c70');
      for(const sx of [-1,1])for(const sz of [-1,1])g.box(x+sx*.16,3.40,z+sz*.16,.035,.44,.035,'#52665c');
      obstacle('street-light-'+x,x,z,.36,.36,3.76);
    }
  });

  // Superellipse shoulders retain room for the rectangular keep above. Every
  // course follows the actual battered bank, including the rounded corners.
  const {position:[cx,cz],rotation,foundationY:top}=CASTLE;
  const contour=(angle,t,y)=>{
    const co=Math.cos(angle),si=Math.sin(angle);
    const ax=(20.05-5.05*t)*Math.sign(co)*Math.sqrt(Math.abs(co));
    const az=(15.8-4.4*t)*Math.sign(si)*Math.sqrt(Math.abs(si));
    return [cx+ax*Math.cos(rotation)+az*Math.sin(rotation),y,cz-ax*Math.sin(rotation)+az*Math.cos(rotation)];
  };
  const perimeter=Array.from({length:80},(_,i)=>contour(2*Math.PI*i/80,0,0));
  for(let z=Math.floor(Math.min(...perimeter.map(p=>p[2])));z<Math.ceil(Math.max(...perimeter.map(p=>p[2])));z+=1.75){
    const xs=[];
    for(let i=0;i<perimeter.length;i++){
      const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
      if(a[2]>=z&&a[2]<=z+1.75)xs.push(a[0]);
      for(const edge of [z,z+1.75])if((a[2]<edge)!==(b[2]<edge))xs.push(a[0]+(edge-a[2])/(b[2]-a[2])*(b[0]-a[0]));
    }
    if(xs.length>1){const min=Math.min(...xs),max=Math.max(...xs);obstacle('castle-hillside-'+z,(min+max)/2,z+.875,max-min,1.75,top);}
  }
  place('Karatsu Castle · terraced pine hill and battered stone revetment',g=>{
    const count=96, tones=['#929887','#aaa694','#929886','#b3ab95','#9d9c89','#a9a18e'];
    const topLoop=Array.from({length:count},(_,i)=>contour(i/count*2*Math.PI,1,top));
    g.rings(Array.from({length:count},(_,i)=>contour(i/count*2*Math.PI,.01,-.025)),topLoop,'#788262');
    // Equal arc lengths around the curve avoid stretched blocks at the corners.
    const lengths=[0];let length=0;
    for(let i=1;i<=count;i++){const a=topLoop[i-1],b=topLoop[i%count];length+=Math.hypot(a[0]-b[0],a[2]-b[2]);lengths.push(length);}
    const angleAt=t=>{
      const s=((t%1+1)%1)*length;let i=1;while(i<count&&lengths[i]<s)i++;
      return 2*Math.PI*(i-1+(s-lengths[i-1])/(lengths[i]-lengths[i-1]))/count;
    };
    for(let row=0;row<6;row++){
      const lo=row/6*.81,hi=(row+1)/6*.81, n=48+row%3;
      for(let i=0;i<n;i++){
        const a=angleAt((i+(row%2)*.48+.017)/n),b=angleAt((i+1+(row%2)*.48-.017)/n);
        const slice=inset=>[contour(a,lo-.025+inset,lo*top+.025),contour(b,lo-.025+inset,lo*top+.045),contour(b,hi-.026+inset,hi*top-.025),contour(a,hi-.026+inset,hi*top-.044)];
        g.rings(slice(0),slice(.046),tones[(i*13+row*5)%tones.length]);
      }
    }
  });
  // Material changes at the boundaries of the actual streets; all three
  // surfaces receive cast shadows and keep the metre-scale walking grade.
  function paving(name,kind,x,z,w,d,angle,span) {
    const size=256, canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
    let seed=24691;
    const vary=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const row=Math.floor(j/(kind==='brick'?32:64)),shifted=(i+(row%2)*32)%size;
      const dx=shifted%(kind==='brick'?64:128),dy=j%(kind==='brick'?32:64);
      const block=(Math.floor(shifted/(kind==='brick'?64:128))*17+row*13)%7;
      const seam=kind!=='street'&&(dx<2||dy<2);
      const grain=(vary()-.5)*(kind==='street'?19:11);
      let color;
      if(kind==='brick')color=seam?[121,114,100]:[162+block*4,110+block*3,82+block*3];
      else if(kind==='granite')color=seam?[115,117,111]:[150+block*3,151+block*3,139+block*3];
      else color=[112,115,112];
      const off=(j*size+i)*4;
      for(let c=0;c<3;c++)pixels.data[off+c]=color[c]+grain;
      pixels.data[off+3]=255;
    }
    ctx.putImageData(pixels,0,0);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(w/span,d/span);map.anisotropy=4;textures.add(map);
    const surface=new T.MeshStandardMaterial({map,roughness:.94,bumpMap:map,bumpScale:.027,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    surface.name=name;materials.add(surface);
    const g=new T.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);geometries.add(g);
    const mesh=new T.Mesh(g,surface);mesh.name=name;mesh.position.set(x,.003,z);mesh.rotation.y=angle;
    mesh.receiveShadow=true;root.add(mesh);
  }
  paving('Auditorium brick quadrangle','brick',-23,45,38.5,31.5,Math.PI*.70,2.6);
  paving('Granite avenue leading to the statue','granite',-6.15,20.8,6.37,20.6,-.595,2.8);
  paving('Old bank street roadway','street',23.3,10.5,33,3.2,0,2.1);
  return {groups, hillPine(angle,t){const p=contour(angle,t,top*t);return [p[0],p[2],p[1]];}};
}
