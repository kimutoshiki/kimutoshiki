// Surfaces and fittings for the walkable study, in the writing desk's native units.
function finish(T, color, roughness, metalness = 0, coat = 0) {
  return new T.MeshPhysicalMaterial({color, roughness, metalness, clearcoat:coat, clearcoatRoughness:.25});
}
function mesh(T, owner, name, geometry, material) {
  const part = new T.Mesh(geometry,material);
  part.name=name; part.castShadow=part.receiveShadow=true; owner.add(part); return part;
}
function turned(T, owner, name, profile, material, sides=40) {
  return mesh(T,owner,name,new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),sides),material);
}
function tube(T, owner, name, points, radius, material, segments=16) {
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return mesh(T,owner,name,new T.TubeGeometry(path,segments,radius,7,false),material);
}
function sphere(T,owner,name,material,scale,position) {
  const object=mesh(T,owner,name,new T.SphereGeometry(1,16,10),material);
  object.scale.set(...scale);object.position.set(...position);return object;
}
function texture(T,w,h,paint) {
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  paint(canvas.getContext('2d'),w,h);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
}

export function createReadingLamp(T,lamp) {
  lamp.userData.readingLamp=true;
  const brass=finish(T,'#b68c4e',.28,.73,.17), antique=finish(T,'#765332',.45,.68);
  const enamel=finish(T,'#164b34',.23,.28,.82);
  const lining=finish(T,'#dfb771',.35,.53,.18);
  const body=turned(T,lamp,'Turned brass pedestal',[[.01,.004],[.265,.004],[.289,.022],[.29,.048],[.271,.061],[.265,.084],[.221,.117],[.204,.124],[.097,.127],[.075,.159],[.056,.163]],brass);
  body.receiveShadow=true;
  turned(T,lamp,'Recessed patinated foot',[[.270,.012],[.287,.014],[.288,.025],[.278,.030]],antique);
  const footCollar=turned(T,lamp,'Socket collar',[[.048,.14],[.059,.152],[.057,.182],[.046,.195]],brass);
  footCollar.position.x=-.005;
  for(const offset of [-.041,.041]) {
    const z=offset+.025;
    tube(T,lamp,'Curved brass standard',[[0,.154,z],[-.012,.29,z],[-.01,.59,z+.006],
      [-.034,.862,z+.015],[-.112,1.011,z+.043],[-.255,1.094,z+.07],[-.383,1.093,z+.103]],.021,brass,32);
    sphere(T,lamp,'Pivot screw',antique,[.052,.053,.032],[-.003,.158,z]);
  }
  const pivot=new T.Group();pivot.name='Desk lamp shade pivot';pivot.position.set(-.38,1.055,.13);pivot.rotation.z=-.13;lamp.add(pivot);
  const cap=turned(T,pivot,'Turned finial',[[.034,-.004],[.052,.004],[.054,.022],[.04,.035],[.031,.066],[.018,.079],[0,.085]],brass);
  cap.castShadow=true;
  turned(T,pivot,'Bottle-green enamel reading shade',[[.374,-.202],[.377,-.188],[.356,-.173],[.317,-.157],[.267,-.118],[.207,-.065],[.141,-.022],[.077,.002],[.042,.005]],enamel,56);
  const lip=mesh(T,pivot,'Rolled brass shade lip',new T.TorusGeometry(.372,.012,9,52),brass);
  lip.rotation.x=Math.PI/2;lip.position.y=-.201;
  lining.side=T.DoubleSide;
  turned(T,pivot,'Brass shade interior',[[.043,-.010],[.112,-.037],[.207,-.077],[.293,-.145],[.358,-.191],[.369,-.203]],lining,48);
  const bulbMaterial=new T.MeshStandardMaterial({color:'#ffe8bc',emissive:'#ffbf75',emissiveIntensity:2});
  const bulb=sphere(T,pivot,'Desk lamp bulb',bulbMaterial,[.055,.065,.055],[0,-.145,0]);bulb.castShadow=false;
  const lampLight=new T.PointLight('#ffd094',3.5,3.4,2);
  lampLight.position.set(-.38,.795,.13);lamp.add(lampLight);
  tube(T,lamp,'Woven power cord',[[0,.045,-.10],[.20,.012,-.30],[.37,-.02,-.42],[.44,-.58,-.45],[.48,-2.12,-.43]],.008,antique);
  return lampLight;
}

export function finishEnvelope(T,root) {
  root.userData.studyDestination='contact';
  root.scale.set(1.33,1.18,1.30);root.position.set(.70,2.19,.56);root.rotation.y=.105;
  const fiber=texture(T,128,128,(c,w,h)=>{
    c.fillStyle='#f2e5c7';c.fillRect(0,0,w,h);
    for(let i=0;i<1400;i++){const x=i*73%w,y=(i*43+Math.floor(i/w)*11)%h;c.fillStyle=i%3?'#e8d8b8':'#fff5df';c.fillRect(x,y,i%3?1:3,1);}
  });
  const paper=finish(T,'#fff8e6',.89);paper.map=fiber;
  const flap=new T.BufferGeometry();
  flap.setAttribute('position',new T.Float32BufferAttribute([-.315,.010,-.191,.315,.010,-.191,0,.018,.078],3));
  flap.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,.5,1],2));flap.setIndex([0,2,1]);flap.computeVertexNormals();
  mesh(T,root,'Folded cream laid-paper flap',flap,paper);
  const wax=finish(T,'#781e27',.34,.06,.34), high=finish(T,'#ad504a',.42,.09);
  const seal=turned(T,root,'Burgundy sealing wax',[[.009,0],[.052,.001],[.061,.006],[.061,.014],[.053,.020],[.045,.018],[.037,.015],[0,.015]],wax,28);
  seal.scale.z=.81;seal.rotation.y=.18;seal.position.set(0,.022,.05);
  const rim=mesh(T,root,'Impressed wax border',new T.TorusGeometry(.037,.0025,5,24),high);rim.scale.y=.82;rim.rotation.x=-Math.PI/2;rim.position.set(0,.039,.05);
  for(const [a,b] of [[[0,-.015],[0,.015]],[[0,0],[.013,-.012]],[[.001,0],[.015,.012]]])
    tube(T,root,'Impressed seal initial',[[a[0]-.006,.039,.05+a[1]],[b[0]-.006,.039,.05+b[1]]],.0019,high,2);
}

function mapleArrangement(T,room) {
  const arrangement=new T.Group();arrangement.name='Maple cuttings in a glazed stoneware vase';arrangement.position.set(-3.37,2.094,-.29);room.add(arrangement);
  const glaze=finish(T,'#826347',.33,.06,.46);
  const mottling=texture(T,128,128,(c,w,h)=>{
    c.fillStyle='#d6bc9c';c.fillRect(0,0,w,h);
    let seed=23811;const random=()=>(seed=seed*16807%2147483647)/2147483647;
    for(let i=0;i<1850;i++){c.fillStyle=i%3?'#917354':'#f0d5aa';c.globalAlpha=.15+random()*.34;c.fillRect(random()*w,random()*h,1+random()*2,1+random()*2);}c.globalAlpha=1;
  });glaze.map=mottling;
  turned(T,arrangement,'Speckled stoneware bud vase',[[0,0],[.098,0],[.102,.025],[.120,.068],[.145,.165],[.139,.263],[.107,.329],[.062,.373],[.047,.411],[.050,.446],[.056,.454],[.056,.474],[.044,.481],[.036,.466],[.038,.442]],glaze,32);
  const bark=finish(T,'#61472e',.8);
  const branches=[
    [[0,.444,0],[.012,.67,-.012],[.088,.98,-.028],[.233,1.25,-.003],[.35,1.43,-.052]],
    [[0,.447,0],[-.038,.71,.015],[-.174,.94,.01],[-.30,1.045,.068],[-.385,1.23,.072]],
    [[0,.448,0],[.021,.74,.023],[.166,.86,.07],[.322,.90,.122],[.437,.99,.16]],
    [[.015,.696,.012],[-.055,.952,-.065],[-.045,1.23,-.14],[-.14,1.46,-.175]],
  ];
  const pos=[],colors=[],indices=[];
  const leafTones=['#bf602c','#a54525','#bb4421','#d1823a','#c25925','#9d492a','#aa6a32'];
  function leaf(x,y,z,scale,heading,tilt,index) {
    const root=pos.length/3,col=new T.Color(leafTones[index%leafTones.length]);
    const vert=(u,v,h,light)=>{
      const ux=Math.cos(heading)*u+Math.sin(heading)*v*.5;
      const depth=-Math.sin(heading)*u+Math.cos(heading)*v*.5;
      pos.push(x+ux*scale,y+(v*tilt+h)*scale,z+depth*scale);
      colors.push(col.r*light,col.g*light,col.b*light);
    };
    vert(0,0,.04,1.12);
    const ring=[[-.08,-.10],[-.56,-.19],[-.31,.00],[-.97,.19],[-.42,.20],[-.83,.63],[-.25,.41],
      [-.47,.97],[-.13,.57],[.01,1.23],[.18,.57],[.52,.94],[.31,.38],[.86,.61],[.46,.20],[.98,.14],[.34,-.02],[.55,-.22],[.09,-.09]];
    ring.forEach(([u,v],k)=>vert(u,v,k%2?-.08:.006,k%2?.78:1.03));
    ring.forEach((_,k)=>indices.push(root,root+1+k,root+1+(k+1)%ring.length));
  }
  let number=0;
  branches.forEach((branch,b)=>{
    tube(T,arrangement,'Cut maple twig',branch,b===0?.009:.006,bark,13);
    branch.slice(2).forEach(([x,y,z],j)=>{
      for(const sign of [-1,1]){
        const dx=sign*(.065+.025*(b%2)),dz=.035*Math.cos(b+j+sign),dy=.02+.025*j;
        tube(T,arrangement,'Leaf petiole',[[x,y,z],[x+dx,y+dy,z+dz]],.0028,bark,2);
        leaf(x+dx,y+dy,z+dz,.068+.011*((b+j)%3),b*1.7+j*.62+sign*.66,.25+.34*Math.sin(b+j+sign),number++);
      }
    });
  });
  const leaves=new T.BufferGeometry();leaves.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  leaves.setAttribute('color',new T.Float32BufferAttribute(colors,3));leaves.setIndex(indices);leaves.computeVertexNormals();
  mesh(T,arrangement,'Copper and vermilion maple leaves',leaves,new T.MeshStandardMaterial({vertexColors:true,roughness:.67,side:T.DoubleSide}));
}

export function furnishStudy(T,original) {
  const room=original.group;
  mapleArrangement(T,room);
  const veneer = finish(T,'#855b3e',.39,.025,.41);
  for (const [index, drawer] of original.drawers.entries()) {
    const front=drawer.children.find(part=>part.isMesh && part.position.z===.772);
    if (!front) continue;
    front.name='Bookmatched walnut drawer veneer';
    front.material=veneer;front.geometry=front.geometry.clone();
    const {position,uv}=front.geometry.attributes;
    // Cut a narrow strip along the grain instead of squeezing an entire
    // rectangular photograph onto one long, shallow drawer.
    for(let i=0;i<uv.count;i++){
      const u=position.getX(i)/2.46+.5;
      uv.setXY(i,index?1-u:u,(index?.56:.43)+position.getY(i)*.61);
    }
    uv.needsUpdate=true;
  }
  const inset=room.getObjectByName('Olive leather writing inset');
  inset.material.color.set('#465039');inset.material.roughness=.57;inset.material.bumpScale=.0012;
  // A shared reflection map gives varnish, green enamel and bronze a readable
  // window reflection. It belongs only to indoor materials; outdoor light stays separate.
  const reflection=texture(T,256,128,(c,w,h)=>{
    const grad=c.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'#8e785c');grad.addColorStop(.37,'#5e4e41');grad.addColorStop(.59,'#5c4937');grad.addColorStop(1,'#342925');
    c.fillStyle=grad;c.fillRect(0,0,w,h);
    for(let y=20;y<81;y+=20)for(let x=17;x<91;x+=20){c.fillStyle=y<50?'#fff6d6':'#c6c2a8';c.fillRect(x,y,18,17);}
    c.fillStyle='#a57a50';c.fillRect(170,45,29,22);
  });
  reflection.mapping=T.EquirectangularReflectionMapping;
  const polish=group=>group.traverse(o=>{
    if(!o.isMesh)return;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!m.isMeshStandardMaterial)continue;
      if(m.metalness>.25||m.clearcoat>.1){m.envMap=reflection;m.envMapIntensity=m.metalness>.55?1.15:.64;}
    }
  });
  polish(room);
  function setMiniatureFinishes(group){polish(group);}
  return {setMiniatureFinishes,veneer};
}

export function createWindowLight(T) {
  // A single cookie carries the sash pattern across the facing wall. Window
  // light and moving props retain their own physical shadow casters.
  const pattern=texture(T,256,256,(c,w,h)=>{
    c.fillStyle='#23201b';c.fillRect(0,0,w,h);
    const g=c.createRadialGradient(123,135,4,132,132,145);
    g.addColorStop(0,'#fff9da');g.addColorStop(.60,'#efe6cc');g.addColorStop(1,'#222124');
    c.fillStyle=g;c.fillRect(0,0,w,h);
    c.save();c.translate(120,120);c.rotate(-.19);
    c.strokeStyle='#39372e';c.lineWidth=6;
    for(const x of [-76,-12,52]){c.beginPath();c.moveTo(x,-160);c.lineTo(x,160);c.stroke();}
    for(const y of [-68,18,106]){c.beginPath();c.moveTo(-160,y);c.lineTo(160,y);c.stroke();}
    c.restore();
  });
  const light=new T.SpotLight('#ffe4b2',12,6,.61,.42,1);
  light.name='Late afternoon light through the oak sash';
  light.position.set(-1.88,1.86,.27);light.target.position.set(-.72,1.22,-.48);light.map=pattern;
  // Its map defines the source, so it never needs another shadow rendering pass.
  return {light,dispose(){pattern.dispose();light.dispose();}};
}
