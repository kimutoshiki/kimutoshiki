/** Orbit inside a complete room; lens zoom never pushes the camera through a wall. */
export function createOrbitNavigation(T, bounds) {
  const center=new T.Vector3(0,2.7,.65),offset=new T.Vector3(),direction=new T.Vector3();
  const position=new T.Vector3(),target=center.clone();
  let yaw=.015,pitch=.105,radius=8.5,subjectHeight=1,subjectWidth=1,aspect=.46,zoom=1,subject='room',portrait=false;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function update(){
    target.copy(center).add(offset);if(subject==='room')target.clamp(bounds.min,bounds.max);
    direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    let travel=radius;
    for(const axis of subject==='room'?['x','y','z']:[]) {
      const d=direction[axis];if(Math.abs(d)<1e-8)continue;
      const edge=d>0?bounds.max[axis]:bounds.min[axis];
      travel=Math.min(travel,(edge-target[axis])/d);
    }
    position.copy(target).addScaledVector(direction,Math.max(.12,travel));
    const portraitZoom=subject==='room'?.52:Math.min(.9,2*radius*Math.tan(25*Math.PI/180)*aspect*.80/subjectWidth);
    return {position,target,zoom:zoom*(portrait?portraitZoom:1),scale:zoom,yaw,pitch,subject};
  }
  function reset(){center.set(0,2.7,.65);offset.set(0,0,0);yaw=.015;pitch=.105;radius=8.5;zoom=1;subject='room';return update();}
  return {
    update,reset,
    resize(value,viewportAspect=.46){portrait=value;aspect=viewportAspect;return update();},
    rotate(dx,dy){yaw-=dx;pitch=clamp(pitch+dy,-Math.PI/2+.02,Math.PI/2-.02);return update();},
    pan(delta){offset.add(delta);if(subject==='room'){const t=center.clone().add(offset).clamp(bounds.min.clone().addScalar(.2),bounds.max.clone().addScalar(-.2));offset.copy(t).sub(center);}else offset.clampLength(0,radius*.35);return update();},
    zoom(factor){if(Number.isFinite(factor)&&factor>0)zoom=clamp(zoom*factor,.65,6);return update();},
    preset(name){const low=subject==='room'?-.25:-Math.asin(Math.min(.65,subjectHeight*.42/radius));const presets={front:[0,.105],left:[-Math.PI/2,.15],right:[Math.PI/2,.15],back:[Math.PI,.15],top:[0,1.54],low:[0,low]};if(presets[name]){[yaw,pitch]=presets[name];offset.set(0,0,0);}return update();},
    inspect(id,object){if(id==='room'||!object)return reset();
      object.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3());box.getCenter(center);
      subject=id;offset.set(0,0,0);zoom=1;yaw=0;pitch=.18;
      radius=Math.max(.75,Math.max(size.x,size.y,size.z)*2.1);
      subjectHeight=size.y;
      subjectWidth=Math.max(size.x,size.z,.001);
      return update();
    },
  };
}
