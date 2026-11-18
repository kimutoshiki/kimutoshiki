// One metric, articulated house cat. The study's two rendering backends use the
// same rig, eyelid geometry, in-place gait and metre-based route.
export async function createBlenderCat(T, {load, signal, invalidate = () => {}}) {
  const asset = await load('cat', {signal});
  if (signal?.aborted) {asset.dispose(); throw signal.reason;}
  const group = new T.Group(), model = asset.scene;
  group.name = 'Study tabby'; group.userData.targetId = 'cat';
  model.name = 'Tabby | articulated'; group.add(model);
  // Soft ground contact survives devices which disable shadow maps. The oval
  // follows the torso, while the four smaller footprints anchor the stance.
  const resolution=48, pixels=new Uint8Array(resolution*resolution*4);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const across=(x+.5)/resolution-.5, along=(y+.5)/resolution-.5;
    let shade=.25*Math.exp(-across*across*25-along*along*14);
    for(const front of [-.23,.23])for(const side of [-.13,.13]){
      shade+=.14*Math.exp(-((across-side)**2*480+(along-front)**2*720));
    }
    pixels.set([34,26,20,Math.round(shade*255)],(y*resolution+x)*4);
  }
  const shadowMap=new T.DataTexture(pixels,resolution,resolution,T.RGBAFormat);
  shadowMap.magFilter=T.LinearFilter;shadowMap.minFilter=T.LinearFilter;shadowMap.needsUpdate=true;
  const shadowMaterial=new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,toneMapped:false});
  const contactShadow=new T.Mesh(new T.PlaneGeometry(.60,.81),shadowMaterial);
  contactShadow.name='Tabby | floor contact';contactShadow.rotation.x=-Math.PI/2;
  contactShadow.position.y=.0025;contactShadow.raycast=()=>{};group.add(contactShadow);
  const mixer = new T.AnimationMixer(model), bones = new Map(), eyes = [];
  model.traverse(node => {
    if (node.isBone) bones.set(node.name.replace(/[^a-z0-9]/gi,'').toLowerCase(), node);
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true;
    if (node.isSkinnedMesh) {
      // Raycasts test the current skinned vertices; keep the broad-phase bounds
      // valid as the cat bends, without measuring the entire coat on each tap.
      node.geometry.computeBoundingSphere();node.geometry.computeBoundingBox();
      node.boundingSphere = node.geometry.boundingSphere.clone();
      node.boundingSphere.radius += .14;
      node.boundingBox = node.geometry.boundingBox.clone().expandByScalar(.14);
      node.frustumCulled = false;
    }
    if (node.morphTargetDictionary?.Blink !== undefined) eyes.push(node);
  });
  const clip = name => {
    const source = asset.animations.find(animation => animation.name === name);
    if (!source) throw new Error('Missing study cat clip '+name);
    return mixer.clipAction(source).play();
  };
  const idle = clip('Idle'), walk = clip('Walk');
  walk.setEffectiveWeight(0);
  const curvedPath = new T.CatmullRomCurve3([
    [0,.02],[-.035,.11],[.08,.205],[.30,.218],[.46,.14],
    [.45,.035],[.27,-.025],[.02,-.07],[-.13,-.055],[-.12,.018]
  ].map(([x,z]) => new T.Vector3(x,0,z)), true, 'centripetal');
  const length = curvedPath.getLength(), tangent = new T.Vector3();
  const habits = [[false,5.7],[true,3.9],[false,4.1],[true,5.2],[false,6.4],[true,4.3]];
  const posed = ['chest','head','neck','earl','earr','tail01','tail03','tail05'].map(name => {
    const node = bones.get(name);
    return node && {name,node,rotation:node.quaternion.clone(),scale:node.scale.clone()};
  }).filter(Boolean);
  const angle = (x,y) => Math.atan2(Math.sin(y-x),Math.cos(y-x));
  const approach = (v,target,dt,rate) => target+(v-target)*Math.exp(-dt*rate);
  const pulse = (time,start,width) => {
    const phase = (time-start)/width;
    return phase <= 0 || phase >= 1 ? 0 : Math.sin(Math.PI*phase)**1.25;
  };
  let elapsed=0, habit=0, habitTime=0, speed=0, distance=0, reaction=-1, greeting=0;
  let yaw=.91, held=false, disposed=false, motionAllowed=true, blinkTime=1, blinkAt=2.3, blinkCount=0;
  function pose() {
    // Remove the previous procedural accents before sampling the authored clips.
    for (const p of posed) {p.node.quaternion.copy(p.rotation);p.node.scale.copy(p.scale);}
    const moving = Math.min(1,speed/.128);
    walk.setEffectiveWeight(moving);
    walk.setEffectiveTimeScale(Math.max(.38,speed/.142));
    idle.setEffectiveWeight(1-moving);
    const dt = elapsed - mixer.time;
    mixer.update(Math.max(0,dt));
    const easy = Math.sin(elapsed*2.65);
    for (const p of posed) {
      const n=p.node;p.rotation.copy(n.quaternion);p.scale.copy(n.scale);
      switch(p.name) {
        case 'chest': n.scale.x*=1+.014*easy; n.scale.z*=1+.012*easy; break;
        case 'neck': n.rotateX(.05*greeting);break;
        case 'head':
          n.rotateY(-.23*greeting+.027*Math.sin(elapsed*.61));
          n.rotateX(.14*greeting+.017*Math.sin(elapsed*1.1)); break;
        case 'earl':
          n.rotateY(.09*Math.sin(elapsed*.81)+.24*pulse(elapsed%8.3,5.1,.37)-.22*greeting);break;
        case 'earr':
          n.rotateY(-.075*Math.sin(elapsed*.71)-.27*pulse(elapsed%6.8,3.7,.36)+.18*greeting);break;
        case 'tail01': n.rotateZ(.105*Math.sin(elapsed*1.03)+.10*greeting);break;
        case 'tail03': n.rotateZ(.14*Math.sin(elapsed*1.03-.52));n.rotateX(.10*greeting);break;
        case 'tail05': n.rotateZ(.195*Math.sin(elapsed*1.03-1.04)+.09*greeting);break;
      }
    }
    const blink = Math.max(pulse(blinkTime,0,.24),blinkCount%3===0?pulse(blinkTime,.38,.18):0,
      reaction>=0?pulse(reaction,.47,.58):0,held ? .72 : 0);
    const gaze = .48+.43*Math.sin(elapsed*.77)*Math.cos(elapsed*.19);
    for (const mesh of eyes) {
      const keys=mesh.morphTargetDictionary;
      mesh.morphTargetInfluences[keys.Blink]=blink;
      if(keys.Gaze!==undefined)mesh.morphTargetInfluences[keys.Gaze]=gaze*(1-blink);
    }
    curvedPath.getPointAt((distance%length)/length,group.position);
    // The socket rests on the rug; the rest mesh already holds a 2 mm paw pad.
    group.position.y=-.001;
    group.rotation.y=yaw;
  }
  function update(dt, animated=true) {
    motionAllowed=animated;
    if(disposed||!animated||dt<=0)return false;
    const step=Math.min(dt,.24);held=false;elapsed+=step;
    if(reaction>=0){reaction+=step;if(reaction>=3.2)reaction=-1;}
    else {
      habitTime+=step;
      if(habitTime>=habits[habit][1]){habitTime-=habits[habit][1];habit=(habit+1)%habits.length;}
    }
    blinkTime+=step;
    if(elapsed>=blinkAt){blinkTime=0;blinkCount++;blinkAt=elapsed+[3.7,4.4,3.1,5.1][blinkCount%4];}
    greeting=approach(greeting,reaction>=0&&reaction<2.3?1:0,step,4.2);
    const target=habits[habit][0] && reaction<0 ? .128 : 0;
    curvedPath.getTangentAt((distance%length)/length,tangent);
    const heading=Math.atan2(tangent.x,tangent.z);
    const facing=reaction>=0 ? .23 : target ? heading : yaw;
    yaw+=angle(yaw,facing)*(1-Math.exp(-step*(reaction>=0?2.8:4.5)));
    // Turn paws into the next step before travelling in that direction.
    const forward=target*Math.max(.08,Math.cos(angle(yaw,heading)));
    speed=approach(speed,forward,step,3.8);
    distance+=speed*step;
    pose();return true;
  }
  function react(animate=motionAllowed) {
    if(disposed)return '';
    reaction=0;greeting=animate ? .36 : 1;held=!animate;speed*=.47;
    yaw+=angle(yaw,.23)*(animate ? .08 : .60);
    pose();invalidate();
    return 'ねこがこちらを向いて、ゆっくりまばたきをしました。';
  }
  pose();
  return {group,model,contactShadow,update,react,dispose(){
    if(disposed)return;disposed=true;
    mixer.stopAllAction();mixer.uncacheRoot(model);group.removeFromParent();
    contactShadow.geometry.dispose();shadowMaterial.dispose();shadowMap.dispose();asset.dispose();
  }};
}
