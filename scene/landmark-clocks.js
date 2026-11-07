/** Preserve and move the auditorium's actual authored hands. No source model,
 * texture or GLB is replaced. Capture runs before any static mesh batching. */
export function captureLandmarkClocks(root) {
  const clocks=[];
  root.traverse(face=>{
    if(!/^Clock face [1-4]$/.test(face.name))return;
    // The source's two thin iron boxes have a distinct width/depth/front plane;
    // tick marks are .055 × .19 × .035 and are deliberately never selected.
    const hands=face.children.filter(o=>o.isMesh&&!o.isInstancedMesh&&o.geometry?.type==='BoxGeometry'
      &&Math.abs(o.scale.x-.065)<1e-6&&Math.abs(o.scale.z-.04)<1e-6&&Math.abs(o.position.z-.1)<1e-6);
    const hour=hands.find(o=>Math.abs(o.scale.y-.55)<1e-6);
    const minute=hands.find(o=>Math.abs(o.scale.y-.78)<1e-6);
    if(!hour||!minute)return; // An unrelated/future clock must not break the scene.
    for(const [kind,hand] of [['hour',hour],['minute',minute]]){
      hand.name=kind==='hour'?'Hour hand':'Minute hand';
      hand.userData.worldClockHand=kind;
      hand.userData.clockFace=face.name;
      hand.matrixAutoUpdate=true;
    }
    face.userData.clockTimeZone='Asia/Tokyo';
    clocks.push({face,hour,minute,hourLength:hour.scale.y,minuteLength:minute.scale.y,hourZ:hour.position.z,minuteZ:minute.position.z});
  });
  return clocks;
}

/** Snapshot angles rotate clockwise from +Y. Each authored hand is centered at
 * half its length, so both its centre and rotation must move around the dial. */
export function updateLandmarkClocks(clocks,snapshot) {
  const angles=snapshot?.clockAngles;
  if(!Number.isFinite(angles?.hour)||!Number.isFinite(angles?.minute))return false;
  let changed=false;
  for(const clock of clocks){
    for(const kind of ['hour','minute']){
      const hand=clock[kind],angle=angles[kind],length=clock[kind+'Length'];
      const x=-Math.sin(angle)*length/2,y=Math.cos(angle)*length/2;
      if(hand.rotation.z!==angle||hand.position.x!==x||hand.position.y!==y)changed=true;
      hand.position.set(x,y,clock[kind+'Z']);hand.rotation.z=angle;
      // Explicit refresh also works if an external owner later caches matrices.
      hand.updateMatrix();
    }
    clock.face.userData.localTime=snapshot.label;
    clock.face.userData.clockTimeZone=snapshot.timeZone||'Asia/Tokyo';
  }
  return changed;
}
