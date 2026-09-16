import { disposeCatAsset } from './cat-asset.js?v=20260916-cat3';

/** The supplied cat's actual skeleton and authored clips, on a quiet room route. */
export function createRoomCat(T, { group: parent, floorY = .01, route, asset, loadDetail, onAssetChange } = {}) {
  const group = new T.Group(); group.name = 'Wandering tabby cat'; parent?.add(group);
  // The source is metric: a 49 cm cat. The room's furniture uses a larger scale.
  const modelScale = 1.8;
  const path = new T.CatmullRomCurve3((route || [[-1.87,.79],[-1.45,.58],[-.59,.67],[-.34,1.08],[-1.17,1.28],[-1.98,1.16]])
    .map(([x,z]) => new T.Vector3(x,floorY,z)), true, 'centripetal');
  path.arcLengthDivisions = 300;
  const pathLength = path.getLength(), tangent = new T.Vector3(), point = new T.Vector3();
  const habits = [['walk',12],['idle',3.2],['walk',10],['stretch',4.1],['idle',2],['walk',12],['rest',7.4],['idle',4]];
  const clipNames = {walk:'Walk',idle:'Idle',look:'Idle',stretch:'Stretch',rest:'Lie_Roll_Rest'};
  let currentAsset, model, mixer, actions = new Map(), currentAction, clipName = 'Idle';
  let distance = 0, habitIndex = 0, habitTime = 0, reaction = 3.6, speed = 0, paused = false, disposed = false;
  let detailPromise, detailedAsset, fullDetail = false, wantsDetail = false, detailRetryAt = 0;
  const angleDelta = (from,to) => Math.atan2(Math.sin(to-from),Math.cos(to-from));

  function chooseClip(name, immediate = false) {
    const next = actions.get(name) || actions.get('Idle');
    if (!next || next === currentAction) return;
    const previous = currentAction; currentAction = next; clipName = name;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (previous && !immediate) { next.fadeIn(.32); previous.fadeOut(.32); }
    else previous?.stop();
  }
  function install(nextAsset) {
    const previousTime = currentAction?.time || 0, previousDuration = currentAction?.getClip().duration || 1;
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(model); }
    model?.removeFromParent(); currentAsset = nextAsset; model = nextAsset.scene;
    model.name = 'Supplied animated tabby cat'; model.scale.setScalar(modelScale); model.position.y = -.001213 * modelScale;
    model.traverse(object => {
      if (!object.isMesh) return;
      const groom = /groom|fur strand/i.test(object.name);
      object.castShadow = !groom; object.receiveShadow = true; object.frustumCulled = false;
      if (object.isSkinnedMesh) {
        // Raycasting otherwise retains the first hovered pose's sphere, which
        // can reject a later stretched paw before testing its real triangles.
        // Source-space padding covers every authored habit without rescanning
        // the animated vertices on every frame or pointer movement.
        if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
        object.boundingSphere = object.geometry.boundingSphere.clone();
        object.boundingSphere.radius += 1;
        if (object.boundingBox) {
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
          object.boundingBox = object.geometry.boundingBox.clone().expandByScalar(1);
        }
      }
      if (groom) object.raycast = () => {};
    });
    group.add(model); mixer = new T.AnimationMixer(model); actions = new Map(); currentAction = null;
    for (const clip of nextAsset.animations) {
      const action = mixer.clipAction(clip);
      if (['Stretch','Lie_Roll_Rest'].includes(clip.name)) { action.setLoop(T.LoopOnce,1); action.clampWhenFinished = true; }
      actions.set(clip.name,action);
    }
    chooseClip(clipName,true);
    if (currentAction) currentAction.time = previousTime / previousDuration * currentAction.getClip().duration;
    mixer.update(0); group.updateMatrixWorld(true);
    onAssetChange?.();
  }
  if (asset) install(asset);

  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(64,64,3,64,64,61);
  gradient.addColorStop(0,'rgba(34,28,19,.30)'); gradient.addColorStop(.38,'rgba(34,28,19,.17)'); gradient.addColorStop(1,'rgba(34,28,19,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  const shadowMap = new T.CanvasTexture(canvas);
  const shadowMaterial = new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false});
  const contactShadow = new T.Mesh(new T.PlaneGeometry(.66,1.18),shadowMaterial);
  contactShadow.name = 'Cat floor contact'; contactShadow.rotation.x = -Math.PI/2; contactShadow.raycast = () => {}; parent?.add(contactShadow);
  function updateContact() { contactShadow.position.set(group.position.x,floorY-.005,group.position.z); contactShadow.rotation.z = -group.rotation.y; }
  path.getPointAt(0,point); group.position.copy(point);
  group.rotation.y = Math.atan2(-group.position.x,8.24-group.position.z)+.14;
  group.userData.catState = 'look'; group.userData.detailLevel = 'room'; updateContact();
  function react() { reaction = 3.4; group.userData.catState = 'look'; }
  group.userData.roomAction = {kind:'cat-life',label:'歩く猫',onActivate:react};

  return {
    group, path, contactShadow, react,
    get model(){return model;}, get mixer(){return mixer;}, get asset(){return currentAsset;},
    get state(){return group.userData.catState;}, get fullDetail(){return fullDetail;},
    setPaused(value){paused = !!value;},
    ensureDetail(){
      wantsDetail = true;
      if (disposed || fullDetail || !asset || !loadDetail || Date.now()<detailRetryAt) return Promise.resolve(false);
      if(detailedAsset){fullDetail=true;group.userData.detailLevel='full';install(detailedAsset);return Promise.resolve(true);}
      if (!detailPromise) detailPromise = loadDetail().then(next => {
        if (disposed) { disposeCatAsset(next); return false; }
        detailedAsset=next;if(!wantsDetail)return false;
        fullDetail = true; group.userData.detailLevel = 'full'; install(next); return true;
      }).catch(error => { detailPromise=undefined;detailRetryAt=Date.now()+30000;console.warn('Cat detail remains at room resolution:',error);return false; });
      return detailPromise;
    },
    useRoomDetail(){wantsDetail=false;if(disposed||!fullDetail||!asset)return;fullDetail=false;group.userData.detailLevel='room';install(asset);},
    update(delta,enabled = true){
      if (disposed || paused || !enabled || delta <= 0) return false;
      const dt = Math.min(delta,.075);
      if (reaction > 0) reaction = Math.max(0,reaction-dt);
      else { habitTime += dt; if (habitTime >= habits[habitIndex][1]) { habitTime = 0; habitIndex = (habitIndex+1)%habits.length; } }
      const state = reaction > 0 ? 'look' : habits[habitIndex][0];
      path.getTangentAt(distance/pathLength,tangent);
      const desiredYaw = reaction > 0 ? Math.atan2(-group.position.x,8.24-group.position.z) : Math.atan2(tangent.x,tangent.z);
      const alignment = Math.max(0,Math.cos(angleDelta(group.rotation.y,desiredYaw)));
      speed += ((state === 'walk' ? .235*alignment : 0)-speed)*(1-Math.exp(-dt*6));
      if (speed > .001) distance = (distance+speed*dt)%pathLength;
      path.getPointAt(distance/pathLength,point); group.position.copy(point);
      if (state === 'walk' || state === 'look') group.rotation.y += T.MathUtils.clamp(angleDelta(group.rotation.y,desiredYaw)*(1-Math.exp(-dt*3)),-1.35*dt,1.35*dt);
      chooseClip(clipNames[state]);
      // Source stance speed is .142 m/s, measured from the authored foot tracks.
      if (currentAction && state === 'walk') currentAction.setEffectiveTimeScale(Math.max(.12,speed/(.142*modelScale)));
      mixer?.update(dt); group.userData.catState = state;
      group.updateMatrixWorld(true); updateContact(); return true;
    },
    dispose(){
      if (disposed) return; disposed = true; mixer?.stopAllAction(); if(model)mixer?.uncacheRoot(model);
      disposeCatAsset(asset);if(detailedAsset&&detailedAsset!==asset)disposeCatAsset(detailedAsset);
      shadowMap.dispose(); shadowMaterial.dispose(); contactShadow.geometry.dispose(); contactShadow.removeFromParent();
    },
  };
}
