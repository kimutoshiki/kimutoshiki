/** Object-owned actions. No invisible oversized hit boxes or timers per prop. */
export function createObjectActions(T, root){
  const entries=new Map(),running=new Map(),applied=[],drawers=new Map();
  root.traverse(object=>{
    const spec=object.userData.roomAction;if(!spec)return;
    const id='object-'+entries.size,parts={},materials=new Set();
    object.traverse(o=>{if(o.userData.actionPart)parts[o.userData.actionPart]=o;if(o.isMesh&&spec.kind==='lamp'&&o.material.emissiveIntensity>0)materials.add(o.material);});
    const entry={id,object,...spec,parts,materials};entries.set(id,entry);object.userData.roomActionId=id;
    if(spec.kind==='drawer')drawers.set(id,{entry,closed:object.position.z,target:object.position.z,open:false});
  });
  function restore(){for(const undo of applied)undo();applied.length=0;}
  function angle(o,axis,amount){if(!o)return;const base=o.rotation[axis];applied.push(()=>o.rotation[axis]=base);o.rotation[axis]+=amount;}
  function height(o,amount){const base=o.position.y;applied.push(()=>o.position.y=base);o.position.y+=amount;}
  function identify(object){for(let o=object;o;o=o.parent)if(o.userData.roomActionId)return o.userData.roomActionId;return null;}
  return {
    entries,identify,restore,
    trigger(id){
      const entry=entries.get(id);if(!entry)return null;
      if(drawers.has(id)){
        const drawer=drawers.get(id);drawer.open=!drawer.open;entry.open=drawer.open;
        drawer.target=drawer.closed+(drawer.open?(entry.travel||1.2):0);
        entry.object.userData.drawerOpen=drawer.open;return entry;
      }
      running.clear();running.set(id,{entry,elapsed:0});return entry;
    },
    // Pausing or changing the view preserves an opened drawer and its contents.
    clear(){restore();running.clear();for(const state of drawers.values())state.entry.object.position.z=state.target;},
    update(delta,enabled=true){
      let drawerMotion=false;
      for(const state of drawers.values()){
        const object=state.entry.object,distance=state.target-object.position.z;
        if(Math.abs(distance)<.0005||!enabled)object.position.z=state.target;
        else{object.position.z+=distance*(1-Math.exp(-Math.min(delta,.1)*10));drawerMotion=true;}
      }
      if(!enabled){running.clear();return drawerMotion;}
      for(const [id,state] of running){
        state.elapsed+=delta;const t=state.elapsed,e=state.entry;if(t>=2.5){running.delete(id);continue;}
        const envelope=Math.sin(Math.PI*Math.min(t/2.5,1))*Math.exp(-t*.65),wave=Math.sin(t*12)*envelope;
        if(e.kind==='bird'){
          angle(e.parts['wing-left'],'z',-.52*Math.abs(wave));angle(e.parts['wing-right'],'z',.52*Math.abs(wave));
          angle(e.parts.head,'y',.35*Math.sin(t*4)*envelope);angle(e.parts.tail,'x',wave*.13);
          height(e.object,.025*Math.max(0,Math.sin(t*7))*envelope);
        }else if(e.kind==='plant'){angle(e.parts.foliage,'z',wave*.065);angle(e.parts.foliage,'x',envelope*Math.sin(t*9)*.035);}
        else if(e.kind==='mobile'){angle(e.parts.pendulum,'y',Math.sin(t*4)*envelope*.65);angle(e.parts.pendulum,'z',wave*.075);}
        else if(e.kind==='cat'){angle(e.parts['cat-head'],'x',-.13*envelope);angle(e.parts['cat-head'],'z',wave*.035);}
        else if(e.kind==='lamp')for(const material of e.materials){const base=material.emissiveIntensity;applied.push(()=>material.emissiveIntensity=base);material.emissiveIntensity=base+.85*envelope;}
      }
      return running.size>0||drawerMotion;
    },
  };
}
