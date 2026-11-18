// Physical desk and furnishings built in Blender. glTF uses metres, Y up,
// with the seated visitor on +Z. The same objects serve both rendering backends.
import {loadBlenderAsset} from './blender-assets.js';

const miniatureSpecs=[
  {asset:'okuma-auditorium',socket:'SocketResearch',link:'research',size:[.43,.48,.32]},
  {asset:'okuma-statue',socket:'SocketProfile',link:'profile',size:[.21,.54,.21]},
  {asset:'karatsu-castle',socket:'SocketPhotos',link:'photos',size:[.40,.40,.32]},
  {asset:'karatsu-bank',socket:'SocketBank',link:'blog',size:[.34,.24,.26]},
];
const messages={
  notebook:['ノートを閉じました。','ノートを開きました。ブログの記事を読めます。'],
  letter:['封筒を閉じました。','封筒を開きました。お問い合わせ先を表示します。'],
  drawer:['引き出しを閉じました。','引き出しを開きました。'],
  lamp:['ランプを消しました。','ランプをつけました。'],
};
const smooth=t=>t*t*(3-2*t);

export async function createBlenderRoom(T,{signal,waitForStudy=async()=>true,onAssetChange=()=>{},load=loadBlenderAsset}={}){
  const room=await load('study-room',{signal});
  if(signal?.aborted){room.dispose();throw signal.reason;}
  const group=room.scene;
  group.name='Blender study · furnished room';
  const leases=[room],selection=new Map(),pins=new Map(),clockHands=[];
  let clockTime;
  function updateClock(snapshot){
    clockTime=snapshot;
    for(const {node,kind} of clockHands)node.rotation.z=snapshot.clockAngles[kind];
  }
  let disposed=false,miniPending,journalTexture,articleTask,cat;
  const owner=name=>{
    const found=group.getObjectByName(name);
    if(!found)throw new Error('Missing Blender room node '+name);
    return found;
  };
  const props={notebook:owner('Notebook'),letter:owner('Letter'),drawer:owner('Drawer'),lamp:owner('Lamp')};
  const joints={cover:owner('NotebookCover'),leaf:owner('NotebookLeaf'),page:owner('NotebookPageFlex'),
    flap:owner('LetterFlap'),drawer:props.drawer,shade:owner('LampShade')};
  const rest=new Map(Object.values(joints).map(n=>[n,{p:n.position.clone(),r:n.rotation.clone()}]));
  const roots=new Set();
  function setTarget(node,id){node.userData.studyPick=id;roots.add(node);}
  for(const [key,node] of Object.entries(props))setTarget(node,key);
  setTarget(owner('Nameplate'),'profile');
  const journalPages=[],bulbs=[];
  let bulb;
  group.traverse(node=>{
    if(!node.isMesh)return;
    node.geometry?.computeBoundingBox();
    const materials=Array.isArray(node.material)?node.material:[node.material];
    node.receiveShadow=true;
    node.castShadow=materials.some(m=>!m.transparent&&m.opacity!==0);
    for(const mat of materials){
      if(mat.name==='Printed journal cloth and folios'&&!journalPages.includes(mat))journalPages.push(mat);
      if(mat.name==='Incandescent pearl bulb'&&!bulbs.includes(mat)){bulbs.push(mat);bulb=node;}
    }
  });
  const lampLight=new T.PointLight('#ffcf83',1.3,3.4,2);
  (bulb||joints.shade).add(lampLight);lampLight.position.set(0,-.035,0);
  const fill=new T.HemisphereLight('#fff1dc','#9a7356',.49);group.add(fill);
  const bounce=new T.PointLight('#f8d3a3',1.5,6.5,2);bounce.position.set(-.88,1.76,.92);group.add(bounce);
  let daylight=1;
  function setLamp(progress){
    lampLight.intensity=progress*(1.15+(1-daylight)*.85);
    for(const m of bulbs)m.emissiveIntensity=.12+progress*1.35;
  }
  function printArticles(){
    if(articleTask||!journalPages.length)return;
    articleTask=import('../js/notebook-articles.js').then(async articles=>{
      const items=await articles.readNotebookArticles();
      if(disposed||signal?.aborted||!await waitForStudy())return;
      const paper=document.createElement('canvas');paper.width=paper.height=1024;
      const font='"Study Mincho","Study Mincho Reading","Yu Mincho","Hiragino Mincho ProN",serif';
      const ctx=paper.getContext('2d'),print=()=>{
        const cover=journalPages[0].map?.image;
        if(!journalTexture && cover)ctx.drawImage(cover,0,0,1024,1024);
        articles.printNotebookEntries(paper,items,0,font);
      };
      print();
      journalTexture=new T.CanvasTexture(paper);journalTexture.flipY=false;journalTexture.colorSpace=T.SRGBColorSpace;
      for(const material of journalPages){material.map=journalTexture;material.needsUpdate=true;}
      onAssetChange();
      if(document.fonts?.status==='loading')document.fonts.ready.then(()=>{
        if(disposed)return;
        print();journalTexture.needsUpdate=true;onAssetChange();
      });
    }).catch(()=>{articleTask=undefined;});
  }
  const state={notebook:false,letter:false,lamp:true,drawer:false};
  const progress={notebook:0,letter:0,lamp:1,drawer:0};
  const active=new Set();
  function pose(id,v){
    const p=smooth(v);
    if(id==='notebook'){
      const leaf=smooth(Math.max(0,Math.min(1,(v-.22)/.78)));
      joints.cover.rotation.z=rest.get(joints.cover).r.z+3.095*p;joints.cover.position.y=rest.get(joints.cover).p.y-.021*p;
      joints.leaf.rotation.z=rest.get(joints.leaf).r.z+3.10*leaf;joints.leaf.position.y=rest.get(joints.leaf).p.y-.014*leaf;
      joints.page.traverse(node=>{if(node.morphTargetInfluences?.length)node.morphTargetInfluences[0]=Math.sin(Math.PI*leaf);});
    }else if(id==='letter')joints.flap.rotation.x=rest.get(joints.flap).r.x-2.73*p;
    else if(id==='drawer')joints.drawer.position.z=rest.get(joints.drawer).p.z+.38*p;
    else if(id==='lamp'){joints.shade.rotation.x=rest.get(joints.shade).r.x+.14*(1-p);setLamp(p);}
  }
  const durations={notebook:.80,letter:.47,drawer:.52,lamp:.27};
  const deskActions={
    getState:()=>({...state}),isAnimating:()=>active.size>0,
    trigger(id,animate=true){
      if(!(id in state))return null;
      state[id]=!state[id];if(id==='notebook'&&state[id])printArticles();
      if(animate)active.add(id);else{progress[id]=Number(state[id]);pose(id,progress[id]);active.delete(id);}
      return messages[id][Number(state[id])];
    },
    update(dt,animate){
      if(!active.size)return false;
      for(const id of active){
        const end=Number(state[id]),distance=end-progress[id],step=animate?dt/durations[id]:1;
        progress[id]+=Math.sign(distance)*Math.min(step,Math.abs(distance));pose(id,progress[id]);
        if(progress[id]===end)active.delete(id);
      }
      return true;
    },
    finished:id=>!active.has(id),
  };
  function placePin(key,node,local){
    pins.set(key,{node,local:new T.Vector3(...local)});
  }
  placePin('blog',props.notebook,[.16,.034,0]);
  placePin('contact',props.letter,[0,.014,0]);
  group.updateMatrixWorld(true);
  const furnishings=['WalnutJoinery','DeskStationery','CaneChair','DeskRightDrawer'].map(name=>{
    const node=owner(name);return {node,bounds:new T.Box3().setFromObject(node)};
  });
  const rayPoint=new T.Vector3();
  function pick(raycaster){
    const candidates=[];
    for(const node of roots){
      let box=selection.get(node);
      if(!box){box=new T.Box3();selection.set(node,box);}
      const animated=node===props.drawer||node===props.notebook||node===props.letter||node===props.lamp||node===cat?.group;
      if(box.isEmpty()||animated)box.setFromObject(node);
      if(!box.isEmpty()&&raycaster.ray.intersectsBox(box))candidates.push(node);
    }
    if(!candidates.length)return null;
    const hit=raycaster.intersectObjects(candidates,true).find(h=>h.object.visible);
    if(!hit)return null;
    // A paw behind a chair or a letter hidden by the desk edge is not exposed
    // to a click. Reject only actual nearer triangles of the opaque joinery.
    const front=furnishings.filter(({bounds})=>raycaster.ray.intersectBox(bounds,rayPoint) &&
      rayPoint.distanceToSquared(raycaster.ray.origin)<hit.distance*hit.distance);
    if(front.length){
      const blocker=raycaster.intersectObjects(front.map(x=>x.node),true)[0];
      if(blocker && blocker.distance<hit.distance-.001)return null;
    }
    let node=hit.object;while(node&&!node.userData.studyPick)node=node.parent;
    return node?.userData.studyPick||null;
  }
  let lastProjection='';
  const projected=new T.Vector3();
  function project(camera){
    const points={};camera.updateWorldMatrix(true,false);
    for(const [key,{node,local}] of pins){
      node.localToWorld(projected.copy(local)).project(camera);
      if(Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&Math.abs(projected.z)<=1)
        points[key]=[Math.round((1+projected.x)*5000)/10000,Math.round((1-projected.y)*5000)/10000];
    }
    return points;
  }
  const destinations={project,pick,projectionChanged(camera){
    const points=project(camera),signature=JSON.stringify(points);
    if(signature===lastProjection)return null;lastProjection=signature;return points;
  },reset(){lastProjection='';}};
  function loadMiniatures(){
    if(!miniPending)miniPending=Promise.all(miniatureSpecs.map(async spec=>{
      if(disposed||!await waitForStudy())return false;
      const asset=await load(spec.asset,{signal});if(disposed||!await waitForStudy()){asset.dispose();return false;}
      leases.push(asset);
      const root=asset.scene;root.name='desk-'+spec.asset;
      const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),mid=box.getCenter(new T.Vector3());
      const scale=Math.min(...spec.size.map((max,i)=>max/Math.max(.0001,[size.x,size.y,size.z][i])));
      const model=new T.Group();model.scale.setScalar(scale);
      root.position.sub(new T.Vector3(mid.x,box.min.y,mid.z));model.add(root);owner(spec.socket).add(model);
      model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.geometry?.computeBoundingBox();}});
      model.traverse(node=>{
        const kind=node.userData.worldClockHand;
        if(kind==='hour'||kind==='minute')clockHands.push({node,kind});
      });
      if(clockTime)updateClock(clockTime);
      setTarget(model,spec.link);
      if(spec.asset!=='karatsu-bank')placePin(spec.link,model,[0,size.y*.68,0]);
      onAssetChange();return true;
    })).then(results=>results.every(Boolean));
    return miniPending;
  }
  function attachCat(actor){
    if(disposed||!actor?.group){actor?.dispose?.();return;}
    cat=actor;owner('SocketCat').add(actor.group);setTarget(actor.group,'cat');onAssetChange();return actor;
  }
  // Keep the writing table solid when the visitor returns from a walk.
  const collisions=[{id:'desk',box:new T.Box3(new T.Vector3(-1.25,0,-.49),new T.Vector3(1.25,.8,.49))}];
  return {blender:true,group,deskActions,pick,destinations,collisions,updateClock,targets:[],loadMiniatures,attachCat,
    get landmarksReady(){return miniPending;},
    setDaylight(value){daylight=value;setLamp(progress.lamp);},
    dispose(){disposed=true;cat?.dispose?.();journalTexture?.dispose();for(const lease of leases)lease.dispose();selection.clear();pins.clear();roots.clear();},
  };
}
