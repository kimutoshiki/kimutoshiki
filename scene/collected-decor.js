/* Original 3D objects modeled from the generated collected-room concept.
 * Raster artwork stays on framed print / textile surfaces; all ornaments,
 * vessels, shelves, furniture, foliage and hanging mobiles are real geometry.
 */
import { surface } from './surface-materials.js?v=20260916-perf1';
import { createSongbirdFactory, createPetalGeometry } from './natural-props.js?v=20260916-perf1';

export function addCollectedDecor(T, { group: room, palette, mainRug, onTextureLoad = () => {} }) {
  const group = new T.Group(); group.name = 'Collected room: art, ceramics and textiles'; room.add(group);
  const motions = [], records = [], interactiveRoots = [], loadedTextures = new Set();
  const retiredMaterials = new Set(), retiredTextures = new Set(); let disposed = false;
  const loader = new T.TextureLoader();
  const cube = new T.BufferGeometry().copy(new T.BoxGeometry(1, 1, 1));
  const sphere = new T.SphereGeometry(1, 20, 12), smallSphere = new T.SphereGeometry(1, 10, 7), cylinder = new T.CylinderGeometry(1, 1, 1, 20);
  const rodGeo = new T.CylinderGeometry(1, 1, 1, 7), ringGeo = new T.TorusGeometry(1, .045, 6, 36);
  const plane = new T.PlaneGeometry(1, 1), disc = new T.CircleGeometry(1, 48);
  const cone = new T.ConeGeometry(1, 1, 12);
  const mat = (color, roughness = .7, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const ceramic = mat('#f3e4ce', .35), sage = mat('#8ba092', .42), blue = mat('#376967', .42);
  const honey = mat('#c39355', .63), rose = mat('#b77662', .48), dark = mat('#29332b', .9);
  const cream = mat('#e8d6ac', .95), brass = mat('#c5a062', .3, .68), cord = mat('#c6ae86', 1);
  const wood = palette.wood, darkWood = palette.darkWood;
  const glow = mat('#fff2d0', .73); glow.emissive.set('#ffdca4'); glow.emissiveIntensity = .32;
  const linen = surface(mat('#ffffff', 1), 'linen');
  const leafMats = ['#9eb878', '#718f58', '#b0bc86'].map(c => surface(mat(c, .46), 'leaf', { tint: c, roughness:.46, bumpScale:.0012 }));
  const flowerMat=surface(mat('#f6e5d5',.82),'petal',{tint:'#fff2e2',bumpScale:.0006});flowerMat.side=T.DoubleSide;
  const pinkPetal=surface(mat('#c78f89',.82),'petal',{tint:'#c9918c',bumpScale:.0006});pinkPetal.side=T.DoubleSide;
  const petalGeo=createPetalGeometry(T),pollenGeo=new T.IcosahedronGeometry(1,0),songbird=createSongbirdFactory(T);
  function imageMaterial(file, fallback, roughness = 1, repeat = [1, 1], tint = '#ffffff') {
    const material = mat(fallback, roughness);
    loader.load(new URL('../images/decor/' + file + '.webp', import.meta.url).href, texture => {
      if (disposed) { texture.dispose(); return; }
      loadedTextures.add(texture); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
      texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(...repeat);
      material.map = texture; material.color.set(tint); material.needsUpdate = true;
      onTextureLoad(file);
    }, undefined, () => {});
    return material;
  }
  const rugBurgundy = imageMaterial('burgundy-rug', '#894c49'), rugForest = imageMaterial('forest-rug', '#547054');
  const wicker = imageMaterial('honey-wicker', '#bc8e53', .94, [2, 1]);
  const velvet = imageMaterial('forest-velvet', '#365f48', 1, [2, 2]);
  if (mainRug) {
    retiredMaterials.add(mainRug.material); if(mainRug.material.map)retiredTextures.add(mainRug.material.map);
    mainRug.material = rugBurgundy; mainRug.name = 'Burgundy botanical desk rug';mainRug.position.y=-.021;
    mainRug.userData.roomAction={kind:'detail',label:'臙脂のラグ'};
    // The original beveled box has physical-unit UVs; the new rug is one artwork.
    const uv=mainRug.geometry.attributes.uv,p=mainRug.geometry.attributes.position,n=mainRug.geometry.attributes.normal;
    for(let i=0;i<uv.count;i++)if(Math.abs(n.getY(i))>.5)uv.setXY(i,p.getX(i)/6.2+.5,p.getZ(i)/3.14+.5);
    uv.needsUpdate=true;
  }
  function mesh(geo, material, parent = group, cast = true) {
    const m = new T.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(size, pos, material = wood, parent = group) { const m = mesh(cube, material, parent); m.scale.set(...size); m.position.set(...pos); return m; }
  function ball(size, pos, material = ceramic, parent = group) { const m = mesh(Math.max(...size)<=.095?smallSphere:sphere, material, parent); m.scale.set(...size); m.position.set(...pos); return m; }
  function cyl(r, height, pos, material = wood, parent = group) { const m = mesh(cylinder, material, parent); m.scale.set(r, height, r); m.position.set(...pos); return m; }
  function rod(a, b, radius, material = brass, parent = group) {
    const from = new T.Vector3(...a), delta = new T.Vector3(...b).sub(from), m = mesh(rodGeo, material, parent, false);
    m.position.copy(from).addScaledVector(delta, .5); m.scale.set(radius, delta.length(), radius); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function ring(r, pos, material = brass, parent = group, horizontal = false, oval = 1) {
    const m = mesh(ringGeo, material, parent, false); m.scale.set(r, r * oval, r); m.position.set(...pos); if (horizontal) m.rotation.x = -Math.PI / 2; return m;
  }
  function node(name, pos, parent = group, rotation = 0) {
    const n = new T.Group(); n.name = name; n.position.set(...pos); n.rotation.y = rotation; parent.add(n); return n;
  }
  function interact(n,kind,label){n.userData.roomAction={kind,label};interactiveRoots.push(n);return n;}
  function record(n, category) { n.updateWorldMatrix(true, true); const b = new T.Box3().setFromObject(n); records.push({ name: n.name, category, min: b.min.toArray(), max: b.max.toArray() }); }
  function sway(n, amount = .025, speed = .5, axis = 'z') { motions.push({ object: n, base: n.rotation[axis], amount, speed, axis, phase: motions.length * 1.73 }); }
  function lathe(profile) { return new T.LatheGeometry(profile.map(p => new T.Vector2(...p)), 24); }
  const vaseGeo = lathe([[.0,0],[.19,0],[.23,.06],[.26,.20],[.23,.35],[.115,.49],[.105,.63],[.125,.655],[.125,.68],[.087,.68],[.086,.61],[.091,.51],[.205,.34],[.235,.20],[.202,.07],[0,.065]]);
  const jugGeo = lathe([[0,0],[.21,0],[.265,.09],[.30,.28],[.24,.49],[.15,.56],[.15,.67],[.115,.67],[.115,.57],[.207,.47],[.262,.28],[.23,.1],[0,.055]]);
  const bowlGeo = lathe([[0,.015],[.18,.015],[.24,.07],[.34,.22],[.34,.25],[.30,.25],[.21,.095],[.16,.06],[0,.06]]);
  function vase(parent, pos, scale = 1, material = ceramic, jug = false) {
    const v = node(jug ? 'Handled ceramic pitcher' : 'Glazed bud vase', pos, parent); v.scale.setScalar(scale);
    mesh(jug ? jugGeo : vaseGeo, material, v);
    if (jug) { const handle = ring(.185, [.255,.37,0], material, v, false, 1.25);  }
    return v;
  }
  function bookStack(parent, pos, width = .6, count = 3) {
    const n = node('Small clothbound book stack', pos, parent);
    for (let i = 0; i < count; i++) {
      const b = node('Clothbound volume', [i*.017,i*.095,0], n, i%2 ? -.11 : .05), cover = [velvet,linen,blue,rose][i%4];
      box([width,.068,width*.7],[0,.045,0],cream,b);
      for (const y of [.008,.083]) box([width+.028,.014,width*.73],[0,y,0],cover,b);
      box([.026,.095,width*.73],[-width/2, .048,0],cover,b);
    }
    return n;
  }
  function bird(parent, pos, scale = 1, material = sage) {
    const n=songbird(parent,pos,scale);interact(n,'bird','小鳥');
    n.traverse(o=>{if(o.userData.actionPart)interactiveRoots.push(o);});
    return n;
  }
  const roofShape=new T.Shape();roofShape.moveTo(-.5,0);roofShape.lineTo(0,.65);roofShape.lineTo(.5,0);roofShape.closePath();
  const roofGeo=new T.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false});roofGeo.translate(0,0,-.5);
  function house(parent,pos,scale=1,index=0){
    const n=node('Little ceramic house',pos,parent);n.scale.setScalar(scale);
    box([.38,.48,.32],[0,.24,0],ceramic,n);const roof=mesh(roofGeo,[rose,blue,sage][index%3],n);roof.scale.set(.45,.35,.40);roof.position.y=.48;
    for(const x of [-.105,.105])for(const y of [.20,.37]){box([.074,.091,.012],[x,y,.165],honey,n);box([.048,.064,.012],[x,y,.173],glow,n);box([.006,.066,.006],[x,y,.183],ceramic,n);}
    box([.07,.125,.012],[0,.067,.166],dark,n);box([.055,.18,.075],[.13,.6,-.03],ceramic,n);
    return n;
  }
  // Cupped leaf surfaces, shared across vines and bouquets.
  const lp=[],luv=[],li=[];
  for(let row=0;row<=7;row++)for(let col=0;col<=4;col++){
    const t=row/7,u=col/4*2-1,w=Math.pow(Math.sin(Math.PI*t),.72);
    lp.push(u*w,.16*Math.sin(t*Math.PI)*(1-u*u)+.05*t,2*t-1);luv.push(col/4,t);
  }
  for(let row=0;row<7;row++)for(let col=0;col<4;col++){const a=row*5+col,b=a+5;li.push(a,b,a+1,b,b+1,a+1);}
  const leafGeo=new T.BufferGeometry();leafGeo.setAttribute('position',new T.Float32BufferAttribute(lp,3));leafGeo.setAttribute('uv',new T.Float32BufferAttribute(luv,2));leafGeo.setIndex(li);leafGeo.computeVertexNormals();
  leafMats.forEach(m=>m.side=T.DoubleSide);
  function leaf(parent,position,size,rotation,index=0){const m=mesh(leafGeo,leafMats[index%3],parent,false);m.position.set(...position);m.scale.set(...size);m.rotation.set(...rotation);return m;}
  function trailingPlant(parent,pos,size=.6,length=1.1){
    const n=node('Trailing heart-leaf plant',pos,parent);n.scale.setScalar(size);
    interact(n,'plant','垂れ下がる葉');
    const pot=vase(n,[0,0,0],.7,sage);pot.scale.y*=.62;cyl(.082,.012,[0,.292,0],dark,n);
    const vines=node('Swaying leaf tendrils',[0,.28,0],n);vines.userData.actionPart='foliage';sway(vines,.028,.55);
    for(let v=0;v<5;v++){
      const angle=v*2.399,points=[];
      for(let j=0;j<=12;j++){
        const t=j/12,x=Math.cos(angle)*(.12+t*.25)+Math.sin(t*7+v)*.06,y=.06*Math.sin(t*3.14)-t*length*(.7+v*.06),z=Math.sin(angle)*(.12+t*.2)+.15;
        points.push(new T.Vector3(x,y,z));
        if(j>0)leaf(vines,[x,y,z],[.07+.012*(j%3),.08,.12],[.45,angle+j*.28,(j%2?1:-1)*.5],j+v);
      }
      mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),16,.007,4,false),leafMats[1],vines,false);
    }
    return n;
  }
  function bouquet(parent,pos,size=1){
    const n=node('Daisies and meadow flowers',pos,parent);n.scale.setScalar(size);
    interact(n,'plant','野の花');
    vase(n,[0,0,0],.85,ceramic,true);const flowers=node('Gently moving flower stems',[0,.47,0],n);flowers.userData.actionPart='foliage';sway(flowers,.015,.65);
    for(let i=0;i<9;i++){
      const a=i*2.399,x=Math.cos(a)*(.13+i*.018),z=Math.sin(a)*(.13+i*.018),h=.36+(i%4)*.105;
      mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(x*.3,h*.56,z*.4),new T.Vector3(x,h,z)]),9,.007,5,false),leafMats[1],flowers,false);
      for(const side of [-1,1])leaf(flowers,[x*.55,h*.48,z*.55],[.045,.04,.13],[-.7,a+side*.8,.3],i);
      const bloom=node('Daisy flower head',[x,h,z],flowers);bloom.rotation.set(.25*Math.cos(a),0,.25*Math.sin(a));
      for(let petal=0;petal<11;petal++){const b=petal*Math.PI*2/11,p=mesh(petalGeo,i%4===0?pinkPetal:flowerMat,bloom,false);p.position.set(Math.sin(b)*.026,0,Math.cos(b)*.026);p.scale.set(.025,.071,.073+(petal%3)*.005);p.rotation.set((petal%2)*.08,b,0);}
      ball([.04,.022,.04],[0,.006,0],honey,bloom).castShadow=false;
      for(let dot=0;dot<13;dot++){const a=dot*2.399,r=.029*Math.sqrt(dot/13),p=mesh(pollenGeo,dot%2?cream:honey,bloom,false);p.scale.set(.005,.007,.005);p.position.set(Math.cos(a)*r,.025,Math.sin(a)*r);}
      for(let sepal=0;sepal<4;sepal++)leaf(bloom,[0,-.007,0],[.014,.014,.042],[0,sepal*Math.PI/2,0],1);
    }
    return n;
  }
  function basket(parent,pos,r=.4,height=.55,blanket=false){
    const n=node('Woven basket with collected things',pos,parent);
    const geo=lathe([[0,0],[r*.78,0],[r*.86,.05],[r,height],[r-.04,height],[r*.86-.04,.07],[0,.07]]);mesh(geo,wicker,n);
    ring(r,[0,height,0],honey,n,true);ring(r*.86,[0,.045,0],honey,n,true);
    for(const x of [-1,1]){const handle=ring(r*.3,[x*r*.90,height+.08,0],honey,n,false,.6);handle.rotation.y=Math.PI/2;}
    for(let i=0;i<18;i++){const a=i*Math.PI/9;rod([Math.cos(a)*r*.83,.035,Math.sin(a)*r*.83],[Math.cos(a)*(r-.01),height-.01,Math.sin(a)*(r-.01)],.009,honey,n);}
    if(blanket){
      const clothGeo=new T.PlaneGeometry(r*1.35,height*1.8,12,16),p=clothGeo.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),t=(y+height*.9)/(height*1.8);p.setXYZ(i,x,height*(.18+.94*t),r*.75-.14*Math.sin(t*Math.PI)+.026*Math.cos(x*28));}
      clothGeo.computeVertexNormals();const clothMat=linen.clone();clothMat.side=T.DoubleSide;mesh(clothGeo,clothMat,n,false);
      for(let i=0;i<14;i++){const x=-r*.62+i*r*1.24/13;rod([x,height*.18,r*.75],[x+.01,height*.1,r*.76],.008,cord,n);}
    }else bookStack(n,[0,height*.46,0],r*1.1,3);
    return n;
  }
  function roundRug(parent,pos,radius,material= rugForest,aspect=1){
    const n=node('Botanical round rug',pos,parent);interact(n,'detail','植物模様のラグ');n.userData.rug={radius:radius+.05,aspect};const rug=mesh(disc,material,n,false);rug.rotation.x=-Math.PI/2; rug.scale.set(radius,radius*aspect,1);
    const edge=mesh(new T.TorusGeometry(radius,.013,5,96),cord,n,false);edge.rotation.x=-Math.PI/2;edge.scale.y=aspect;edge.position.y=-.004;
    for(let i=0;i<64;i++){const a=i*Math.PI/32;rod([Math.cos(a)*radius,0,Math.sin(a)*radius*aspect],[Math.cos(a)*(radius+.05),0,Math.sin(a)*(radius+.05)*aspect],.009,cord,n);}
    return n;
  }
  function ottoman(parent,pos,r=.55){
    const n=node('Forest velvet tufted ottoman',pos,parent);
    cyl(r*.88,.10,[0,.08,0],wood,n);const body=ball([r,.34,r],[0,.35,0],velvet,n);body.name='Soft upholstered ottoman';
    const piping=mesh(new T.TorusGeometry(r*.975,.008,5,48),velvet,n,false);piping.rotation.x=-Math.PI/2;piping.position.y=.34;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ball([.022,.012,.022],[Math.cos(a)*r*.54,.632,Math.sin(a)*r*.54],dark,n);}
    ball([.024,.012,.024],[0,.679,0],dark,n);return n;
  }
  function teaTable(parent,pos,r=.49,height=.83){
    const n=node('Round tea table and porcelain set',pos,parent);
    cyl(r,.075,[0,height,0],wood,n);ring(r*.93,[0,height+.04,0],brass,n,true);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod([Math.cos(a)*r*.76,0,Math.sin(a)*r*.76],[Math.cos(a)*r*.60,height-.045,Math.sin(a)*r*.60],.047,wood,n);}
    cyl(r*.65,.034,[0,.27,0],wood,n);bookStack(n,[0,.29,0],.46,2);
    const tray=node('Tea tray',[0,height+.045,0],n);cyl(r*.76,.016,[0,0,0],brass,tray);
    const teapot=vase(tray,[-.10,.009,-.06],.32,ceramic,true);teapot.scale.y*=.8;
    const spout=mesh(cone,ceramic,teapot);spout.scale.set(.075,.33,.075);spout.position.set(-.25,.38,0);spout.rotation.z=.9;
    ball([.12,.035,.12],[0,.69,0],ceramic,teapot);ball([.027,.04,.027],[0,.73,0],brass,teapot);
    for(const [x,z] of [[.16,.13],[-.18,.16]]){cyl(.084,.009,[x,.012,z],ceramic,tray);const cup=vase(tray,[x,.018,z],.14,sage);cup.scale.y=.10;ring(.024,[x+.044,.053,z],sage,tray);}
    return n;
  }
  function mushroom(parent,pos,size=1){
    const n=node('Warm ceramic mushroom lamp',pos,parent);n.scale.setScalar(size);
    interact(n,'lamp','きのこのランプ');
    const stem=lathe([[0,0],[.115,0],[.135,.035],[.10,.31],[.07,.38],[0,.38]]);mesh(stem,ceramic,n);
    const cap=mesh(new T.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),glow.clone(),n);cap.scale.set(.30,.18,.30);cap.position.y=.34;
    const underside=mesh(disc,ceramic,n,false);underside.rotation.x=Math.PI/2;underside.scale.setScalar(.30);underside.position.y=.34;
    ring(.292,[0,.343,0],honey,n,true);return n;
  }
  function paperLantern(parent,pos,size=.55){
    const n=node('Pleated warm paper lantern',pos,parent);n.scale.setScalar(size);
    interact(n,'lamp','プリーツの灯り');
    const body=ball([.51,.67,.51],[0,0,0],glow.clone(),n);body.castShadow=false;
    for(let i=1;i<16;i++){const y=-.67+i*1.34/16,r=.51*Math.sqrt(Math.max(0,1-y*y/(.67*.67)));ring(r,[0,y,0],cream,n,true);}
    cyl(.12,.05,[0,-.67,0],brass,n);cyl(.12,.05,[0,.67,0],brass,n);return n;
  }
  function sunMirror(parent,pos,r=.42,rotation=0){
    const n=node('Brass sunburst wall mirror',pos,parent,rotation);
    // Subtle opaque silver-blue glass: never pretend a painted view is a live reflection.
    const mirrorMat=mat('#bdd0c5',.22,.68);const face=mesh(disc,mirrorMat,n,false);face.scale.setScalar(r*.66);face.position.z=.013;
    ring(r*.68,[0,0,.021],brass,n);ring(r*.73,[0,0,0],wood,n);
    for(let i=0;i<32;i++){const a=i*Math.PI/16,outer=r*(i%2?.92:1.10);rod([Math.sin(a)*r*.73,Math.cos(a)*r*.73,0],[Math.sin(a)*outer,Math.cos(a)*outer,.016],.013,brass,n);}
    return n;
  }
  const moonShape=new T.Shape();moonShape.absarc(0,0,.22,Math.PI*.28,Math.PI*1.72,false);moonShape.quadraticCurveTo(-.12,0,Math.cos(Math.PI*.28)*.22,Math.sin(Math.PI*.28)*.22);
  const moonGeo=new T.ExtrudeGeometry(moonShape,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.005,bevelSegments:2,curveSegments:24});
  function mobile(parent,pos,size=1){
    const n=node('Swaying moon and leaf mobile',pos,parent);n.scale.setScalar(size);
    interact(n,'mobile','月と葉のモビール');
    rod([0,0,0],[0,-.21,0],.008,cord,n);const pendulum=node('Hanging brass ornaments',[0,-.21,0],n);pendulum.userData.actionPart='pendulum';sway(pendulum,.095,.43,'y');sway(pendulum,.03,.67,'z');
    ring(.29,[0,-.30,0],brass,pendulum);const moon=mesh(moonGeo,brass,pendulum,false);moon.position.set(0,-.3,.012);
    for(const [i,x] of [-.26,0,.26].entries()){
      const length=.28+i*.14;rod([x,-.48,0],[x,-.48-length,0],.0045,cord,pendulum);
      const drop=ball([.05,.095,.012],[x,-.55-length,0],brass,pendulum);drop.rotation.z=(i-1)*.18;
    }
    return n;
  }
  function displayShelf(parent,pos,width=2.5,height=1.75,rotation=0){
    const n=node('Walnut cubby cabinet with ceramic collection',pos,parent,rotation),depth=.34;
    box([width,height,.035],[0,0,-depth*.5],darkWood,n);
    for(const x of [-width/2,width/2])box([.065,height,.41],[x,0,0],wood,n);
    for(const y of [-height/2,0,height/2])box([width+.07,.065,.41],[0,y,0],wood,n);
    for(const x of [-width/6,width/6])box([.038,height,.36],[x,0,0],wood,n);
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const x=(col-1)*width/3,y=-height/2+row*height/2+.033,z=.015,i=row*3+col;
      if(i===0||i===5)house(n,[x,y,z],.69,i);
      else if(i===1||i===3)vase(n,[x,y,z],.65,[ceramic,sage,blue][col],i===3);
      else if(i===2)bird(n,[x,y,z],.62,rose);
      else bookStack(n,[x,y,z],width*.23,3);
    }
    return n;
  }

  // The room uses quiet plaster and an original atlas inlay.

  // First pass: floor collections and a visible right-hand cabinet.
  const leftBasket=basket(group,[-5.73,-.025,.43],.35,.63,true);record(leftBasket,'floor');
  const tea=teaTable(group,[4.95,-.025,1.18],.49,.83);record(tea,'floor');
  const rightOttoman=ottoman(group,[4.15,-.025,2.14],.53);record(rightOttoman,'floor');
  roundRug(group,[4.15,-.016,2.20],.73,rugForest,.83);
  const narrow=node('Tall narrow collection cabinet',[5.79,0,-1.08],group);
  for(const x of [-.32,.32])for(const z of [-.13,.13])rod([x,-.025,z],[x,.18,z],.036,wood,narrow);
  box([.76,2.61,.08],[0,1.48,-.15],darkWood,narrow);
  for(const x of [-.39,.39])box([.06,2.68,.39],[x,1.49,0],wood,narrow);
  for(const [i,y] of [.17,.79,1.45,2.10,2.79].entries()){
    box([.84,.055,.45],[0,y,0],wood,narrow);
    if(i===0)bookStack(narrow,[0,y+.029,0],.49,4);
    if(i===1)house(narrow,[0,y+.029,0],.72,1);
    if(i===2)vase(narrow,[0,y+.029,0],.78,sage,true);
    if(i===3)bird(narrow,[0,y+.029,0],.81,ceramic);
  }
  bouquet(narrow,[0,2.82,0],.57);record(narrow,'rear');
  // Small mobiles remain at the edges, leaving the central navigation clear.
  const leftMobile=mobile(group,[-3.95,6.36,1.55],1.10);record(leftMobile,'ceiling');
  const rightMobile=mobile(group,[4.96,6.36,2.05],.82);record(rightMobile,'ceiling');
  // Floor reading corner, still outside the cat and the initial viewing rays.
  const reading=node('Reading corner with textile layers',[-4.48,0,4.90],group,.10);
  roundRug(reading,[0,-.016,0],1.24,rugForest,.93);
  const seat=ottoman(reading,[0,-.025,0],.61);bookStack(seat,[.04,.69,.0],.49,2);
  const woven=basket(reading,[-1.03,-.025,.37],.37,.58,true);
  teaTable(reading,[1.00,-.025,-.03],.44,.77);
  bouquet(reading,[1.0,.79,-.03],.40);record(reading,'floor');
  const mushroomCorner=node('Mushroom lights and small forest collection',[5.15,0,4.24],group);
  for(const [i,x] of [-.35,.22].entries()){
    const stump=cyl(i?.27:.36,i?.40:.62,[x,i?.20:.31,0],wood,mushroomCorner);
    ring(i?.25:.34,[x,i?.408:.628,0],brass,mushroomCorner,true);
    mushroom(mushroomCorner,[x,i?.42:.65,0],i?.75:1.0);
  }
  bird(mushroomCorner,[-.27,.65,.22],.6,sage);trailingPlant(mushroomCorner,[.57,.02,.19],.84,.17);
  roundRug(mushroomCorner,[.04,-.016,.10],1.11,rugBurgundy,.80);record(mushroomCorner,'floor');
  const basketFront=basket(group,[-5.42,-.025,6.55],.45,.79,true);record(basketFront,'floor');

  // The fourth wall gets a low cabinet and a broad, asymmetrical print collection.
  const console=node('Entrance console and ceramic still life',[2.76,0,8.68],group,Math.PI);
  for(const x of [-1.65,1.65])for(const z of [-.27,.27])rod([x,-.025,z],[x,.34,z],.065,wood,console);
  box([3.75,.96,.72],[0,.79,0],wood,console);box([3.91,.085,.84],[0,1.31,0],darkWood,console);
  for(const x of [-1.20,0,1.20]){
    box([1.09,.77,.025],[x,.8,.376],darkWood,console);box([.96,.64,.027],[x,.8,.40],wicker,console);
    ball([.043,.043,.032],[x,.92,.438],brass,console);
  }
  bouquet(console,[-1.40,1.354,.04],.88);bookStack(console,[.61,1.354,0],.7,3);
  bird(console,[-.54,1.354,.1],.86,sage);vase(console,[.12,1.354,.04],.64,blue);
  const tableLamp=paperLantern(console,[1.36,1.354+.49,0],.64);cyl(.18,.10,[1.36,1.405,0],brass,console);record(console,'front-wall');
  roundRug(group,[.15,-.016,6.05],2.0,rugForest,.65);

  // Bake repeated static pieces, retaining small animated groups independently.
  function batch(root, excluded = []) {
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map(),world=new T.Matrix4();
    root.traverse(o=>{
      if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material))return;
      for(let p=o;p&&p!==root;p=p.parent)if(excluded.includes(p))return;
      const key=o.geometry.uuid+':'+o.material.uuid+':'+Number(o.castShadow);
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);
    });
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;
      const inst=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);inst.name='Collected detail instances';
      inst.castShadow=meshes[0].castShadow;inst.receiveShadow=true;
      meshes.forEach((m,i)=>{world.multiplyMatrices(inverse,m.matrixWorld);inst.setMatrixAt(i,world);m.removeFromParent();});
      inst.computeBoundingSphere();root.add(inst);
    }
  }
  const animatedRoots=[...new Set(motions.map(m=>m.object))];
  const independentRoots=[...new Set([...interactiveRoots,...animatedRoots])];
  // An action owns its actual geometry after batching; picking and wing/leaf
  // motion must never act on an empty group or all instances in the room.
  for(const n of independentRoots)batch(n,independentRoots.filter(x=>x!==n));batch(group,independentRoots);
  const localGlows=[];group.traverse(o=>{if(o.isMesh&&o.material.emissive?.getHex()===glow.emissive.getHex())localGlows.push(o.material);});
  let triangles=0,drawCalls=0,instances=0;
  group.traverse(o=>{if(o.isMesh){const n=o.isInstancedMesh?o.count:1;instances+=n;drawCalls++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*n;}});
  group.userData.decorStats={instances,triangles,drawCalls,animatedGroups:animatedRoots.length,collections:records};
  group.updateMatrixWorld(true);
  return {
    group,
    update(time){for(const m of motions)m.object.rotation[m.axis]=m.base+Math.sin(time*m.speed+m.phase)*m.amount;},
    setDaylight(daylight){for(const m of localGlows)m.emissiveIntensity=.15+(1-daylight)*.95;},
    dispose(){disposed=true;loadedTextures.forEach(t=>t.dispose());retiredTextures.forEach(t=>t.dispose());retiredMaterials.forEach(m=>m.dispose());},
  };
}
