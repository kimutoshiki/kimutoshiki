import { surface } from './surface-materials.js?v=20260916-cat3';

// One curved, pointed blade: a petal or an individual feather, not a thick oval.
export function createPetalGeometry(T, feather=false){
  const p=[],uv=[],index=[],rows=8,cols=4;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const t=j/rows,u=i/cols*2-1,w=Math.pow(Math.sin(Math.PI*t),feather?.58:.42);
    p.push(u*w,.16*Math.sin(Math.PI*t)*(1-u*u)+.24*t*t+.022*Math.sin(t*22)*u*u,t*2);
    uv.push(i/cols,t);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;index.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

export function createSongbirdFactory(T){
  const sphere=new T.SphereGeometry(1,22,14),tiny=new T.SphereGeometry(1,10,7),blade=createPetalGeometry(T,true);
  const shaft=new T.CylinderGeometry(1,1,1,6),beakGeo=new T.ConeGeometry(1,1,10);
  const make=(color,roughness=.88)=>new T.MeshStandardMaterial({color,roughness});
  const coat=surface(make('#aa8b68'),'feather',{tint:'#dbc5a5',repeat:[2,1],bumpScale:.0017});
  const breast=surface(make('#dccdaf'),'feather',{tint:'#fff3d8',repeat:[2,1],bumpScale:.001});
  const flight=surface(make('#746650'),'feather',{tint:'#b8a389',bumpScale:.001});flight.side=T.DoubleSide;
  const eye=make('#161813',.14),glint=make('#ffedd2',.2),horn=make('#756047',.46);
  function mesh(geo,material,parent){const o=new T.Mesh(geo,material);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
  function oval(size,pos,material,parent){const o=mesh(Math.max(...size)<.04?tiny:sphere,material,parent);o.scale.set(...size);o.position.set(...pos);return o;}
  function rod(a,b,r,parent){const va=new T.Vector3(...a),delta=new T.Vector3(...b).sub(va),o=mesh(shaft,horn,parent);o.position.copy(va).addScaledVector(delta,.5);o.scale.set(r,delta.length(),r);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}
  return function songbird(parent,pos,scale=1){
    const bird=new T.Group();bird.name='Feathered shelf songbird';bird.userData.roomAction={kind:'bird',label:'小鳥'};bird.position.set(...pos);bird.scale.setScalar(scale);parent.add(bird);
    const body=oval([.153,.178,.216],[0,.223,0],coat,bird);body.rotation.x=-.17;
    oval([.119,.140,.071],[0,.237,.144],breast,bird);
    const head=new T.Group();head.name='Songbird turning head';head.userData.actionPart='head';head.position.set(0,.405,.095);bird.add(head);
    oval([.111,.105,.114],[0,0,0],coat,head);
    for(const side of [-1,1]){
      oval([.015,.017,.011],[side*.075,.02,.082],eye,head);
      oval([.004,.004,.003],[side*.079,.026,.089],glint,head);
      oval([.037,.029,.015],[side*.081,-.032,.071],breast,head);
      const wing=new T.Group();wing.name='Layered flight feathers';wing.userData.actionPart=side<0?'wing-left':'wing-right';wing.position.set(side*.122,.322,.032);wing.rotation.set(-.28,0,side*.10);bird.add(wing);
      oval([.033,.100,.15],[side*.005,-.075,-.077],coat,wing);
      for(let i=0;i<7;i++){
        const f=mesh(blade,flight,wing);f.position.set(side*(.018+i*.005),-.02-i*.013,-.02);f.scale.set(.021,.055,.115+i*.006);f.rotation.set(Math.PI-.24,side*(.12+i*.035),side*.08);
      }
      rod([side*.05,.065,.018],[side*.05,.008,.060],.009,bird);
      for(let toe=0;toe<3;toe++)rod([side*.05,.01,.053],[side*.05+(toe-1)*.024,.008,.099-Math.abs(toe-1)*.012],.004,bird);
    }
    const beak=mesh(beakGeo,horn,head);beak.scale.set(.025,.085,.025);beak.rotation.x=Math.PI/2;beak.position.set(0,-.014,.143);
    const tail=new T.Group();tail.name='Fanned tail feathers';tail.userData.actionPart='tail';tail.position.set(0,.17,-.155);bird.add(tail);
    for(let i=0;i<5;i++){const f=mesh(blade,flight,tail);f.position.x=(i-2)*.017;f.scale.set(.022,.06,.124);f.rotation.set(Math.PI-.23,(i-2)*.09,0);}
    return bird;
  };
}
