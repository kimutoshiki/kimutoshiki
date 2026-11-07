import * as T from './world-three.js';
import { createHomeInterior } from './home-interior.js';
import { createWalkNavigation } from './home-navigation.js';
import { getWorldTime } from './world-time.js';
import { createWorldSky } from './world-sky.js';
import { loadSurfaceMaterials } from './surface-materials.js';
import { HOME, WORLD_BOUNDS, WAYPOINTS, LANDMARK_SITES, LANDMARK_RESERVATIONS, worldFov } from './world-layout.js';

const clamp = T.MathUtils.clamp;
const pixelRatio = (w, h) => Math.min(globalThis.devicePixelRatio || 1, 1.6, Math.max(1, Math.sqrt(1900000 / Math.max(1, w * h))));
const collision = ({ id, box }) => ({ id, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
const inHome = p => p.x > HOME.bounds.minX && p.x < HOME.bounds.maxX && p.z > HOME.bounds.minZ && p.z < HOME.bounds.maxZ;

/** Start in the original study. Every trip outside is a physical, eye-level walk. */
export async function mountWorld({ canvas, onReady = () => {}, onError = () => {}, onSelect = () => {}, onProgress = () => {}, rendererFactory, rendererContext, loadLandmarks, loadCat, loadLandscape, loadBoundary, seated: startSeated = true, autoTime = true, now = () => new Date(), reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false } = {}) {
  let renderer;
  try {
    renderer = rendererFactory ? rendererFactory(canvas) : new T.WebGLRenderer({ canvas, context: rendererContext, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error); return { getState: () => ({ webgl: false, catReady: false, landmarksReady: false }), dispose() {} };
  }
  let disposed = false, paused = reducedMotion, visible = !document.hidden, renderingActive=true, raf = 0, paintRaf = 0, paintTimer = 0, previousMs = 0, lastDraw = 0;
  let landmarks, home, cat, landscape, boundary, navigation, skyOwner, shadowDirty = true, revision = 1, lightingMode = autoTime ? 'auto' : 'day', focusId = 'room', lastState = '', lastView = '';
  let miniaturesReady=false,outdoorsReady=false,outdoorsLoading=false,outdoorsError=null,outdoorPromise,landmarkPromise;
  let prewarmTimer=0,idleHandle=0,firstFrameReady=false,performanceScale=1,slowFrames=0,lastPerformanceChange=0;
  const surfaceOwners=[],performanceStats={frames:0,lastRenderMs:0,drawCalls:0,triangles:0,pixelRatio:1,shadowRefreshes:0};
  let posture = startSeated ? 'seated' : 'walking', postureTransition = null, pendingSeat = false;
  let timeState, lastTimeSample = -Infinity, lastClockKey = '', lastLightKey = '';
  const seatPosition = HOME.seated.position, seatTarget = HOME.seated.target;
  const seatedSpawn = { x: seatPosition[0], z: seatPosition[2], yaw: Math.atan2(seatTarget[0]-seatPosition[0],seatTarget[2]-seatPosition[2]), pitch: Math.atan2(seatTarget[1]-seatPosition[1],Math.hypot(seatTarget[0]-seatPosition[0],seatTarget[2]-seatPosition[2])) };
  const seatLook = { x: seatTarget[0], y: seatTarget[1], z: seatTarget[2] };
  let width = 1, height = 1, down = null, dragging = null, moved = false, wheelInputUntil = 0;
  const abort = new AbortController(), listeners = [], targets = new Map(), pressed = new Set(), activePointers = new Set();
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(62, 1, .035, 700);
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  function listen(target, name, handler, options) { target.addEventListener(name, handler, options); listeners.push(() => target.removeEventListener(name, handler, options)); }
  function invalidate() { revision++; shadowDirty = true; }
  try {
    home = createHomeInterior(T, { onTextureLoad: invalidate, onAssetChange: () => { applyCatShadowPolicy(); invalidate(); }, loadCatDetail: () => (loadCat || defaultLoadCat)('full', { signal: abort.signal }) });
    scene.add(home.group); for (const target of home.targets || []) targets.set(target.id, target); cat = home.cat;
    if (cat) { cat.group.scale.setScalar(1 / (1.8 * HOME.scale)); cat.group.userData.targetId = 'cat'; }
    navigation = createWalkNavigation({ camera, bounds: WORLD_BOUNDS, obstacles: [...(home.collisions || []).map(collision), ...LANDMARK_RESERVATIONS, loadingGate()], spawn: startSeated ? seatedSpawn : HOME.spawn, eyeHeight: startSeated ? seatPosition[1] : HOME.eyeHeight, radius: .20, speed: 2.4, waypoints: WAYPOINTS });
  } catch (error) { home?.dispose?.(); landscape?.dispose?.(); boundary?.dispose?.(); renderer.dispose(); onError(error); return { getState: () => ({ webgl: false, catReady: false, landmarksReady: false }), dispose() {} }; }
  scene.fog = new T.FogExp2('#dce0d1', .00165);
  skyOwner=createWorldSky(T);
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const sun = new T.DirectionalLight('#ffe4bd', 2.6); sun.position.set(-38, 55, -12); sun.target.position.set(0, 0, 35); sun.castShadow = true;
  const shadowResolution = Math.min(2048, renderer.capabilities?.maxTextureSize || 2048); sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 68, bottom: -68, near: 1, far: 185 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 2;
  const hemisphere = new T.HemisphereLight('#e1eee9', '#7a6b50', 1.15), ambient = new T.AmbientLight('#eee2ca', .30);
  const roomFill = new T.PointLight('#ffe4bd', 2.3, 8, 1); roomFill.position.set(.2, 2.12, 1.25);
  // The close window-light map retains chair legs and desk details; the cat
  // keeps its moving contact plane and the broad sun map serves the garden.
  const windowLight = new T.DirectionalLight('#fff0d5', .65); windowLight.position.set(-3, 3, -2.3); windowLight.target.position.set(0, .1, 1.1); windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(1024, 1024); Object.assign(windowLight.shadow.camera, { left: -3.8, right: 3.8, top: 4, bottom: -4, near: .1, far: 14 }); windowLight.shadow.camera.updateProjectionMatrix(); windowLight.shadow.normalBias = .007; windowLight.shadow.bias = -.00005;
  sun.shadow.autoUpdate = false; windowLight.shadow.autoUpdate = false;
  scene.add(sun, sun.target, hemisphere, ambient, roomFill, windowLight, windowLight.target);

  function applyTime(force=false) {
    const snapshot=getWorldTime(now(),lightingMode);
    timeState=snapshot;
    if(force || snapshot.secondKey!==lastClockKey) {
      lastClockKey=snapshot.secondKey;
      home.updateClock?.(snapshot);landmarks?.updateClock?.(snapshot);
      if(home.clock) {
        if(home.clock.hour)home.clock.hour.rotation.z=snapshot.clockAngles.hour;
        if(home.clock.minute)home.clock.minute.rotation.z=snapshot.clockAngles.minute;
        if(home.clock.second)home.clock.second.rotation.z=snapshot.clockAngles.second;
        home.clock.group.userData.localTime=snapshot.label;
        home.clock.group.userData.timeZone=snapshot.timeZone;
      }
      revision++;
    }
    if(force || snapshot.lightingKey!==lastLightKey) {
      lastLightKey=snapshot.lightingKey;
      sun.intensity=snapshot.sun.intensity;sun.color.set(snapshot.sun.color);
      sun.position.fromArray(snapshot.sun.position);
      hemisphere.intensity=snapshot.hemisphere.intensity;
      hemisphere.color.set(snapshot.hemisphere.skyColor);hemisphere.groundColor.set(snapshot.hemisphere.groundColor);
      ambient.intensity=snapshot.ambientIntensity;ambient.color.set(snapshot.ambientColor);
      roomFill.intensity=snapshot.roomFillIntensity;windowLight.intensity=snapshot.windowLightIntensity;
      if(home.lampLight)home.lampLight.intensity=snapshot.deskLampIntensity;
      scene.environmentIntensity=snapshot.environmentIntensity;scene.backgroundIntensity=snapshot.backgroundIntensity;
      renderer.toneMappingExposure=snapshot.exposure;scene.fog.color.set(snapshot.fogColor);
      const sky=skyOwner.update(snapshot);scene.background=sky.background;scene.environment=sky.environment;
      boundary?.setNightFactor(snapshot.nightMix);landscape?.setTime?.(snapshot);invalidate();
    }
  }
  function loadingGate() {return {id:'garden-loading-threshold',minX:HOME.door.x-.7,maxX:HOME.door.x+.7,minZ:HOME.door.z-.04,maxZ:HOME.door.z+.12};}
  function refreshObstacles() {
    navigation.setObstacles([...[...(home.collisions||[]),...(landscape?.collisions||[]),...(boundary?.collisions||[])].map(collision),
      ...(landmarks?landmarks.targets.map(target=>collision({id:target.id,box:new T.Box3().setFromObject(target.object)})):LANDMARK_RESERVATIONS),
      ...(!outdoorsReady?[loadingGate()]:[])]);
  }
  function applyCatShadowPolicy() {
    // The animated contact plane follows every paw step. It avoids repeating
    // the entire static desk's shadow render for one small moving pet.
    cat?.model?.traverse(object=>{if(object.isMesh)object.castShadow=false;});
  }
  function refineSurfaces(group) {
    if(disposed)return;
    surfaceOwners.push(loadSurfaceMaterials(T,group,{anisotropy:renderer.capabilities?.getMaxAnisotropy?.()||1,onLoad:invalidate}));
  }
  function updateNearbyLights(position) {
    if(!boundary)return;
    const active=timeState?.nightMix>0;
    const closest=[...boundary.lamps].sort((a,b)=>Math.hypot(a.position[0]-position.x,a.position[2]-position.z)-Math.hypot(b.position[0]-position.x,b.position[2]-position.z)).slice(0,2);
    for(const lamp of boundary.lamps)lamp.light.visible=active&&closest.includes(lamp);
  }
  function loadOutdoorLandmarks() {
    if(landmarkPromise)return landmarkPromise;
    landmarkPromise=(async()=>{
      const factory=loadLandmarks||(await import('./world-landmarks.js')).createWorldLandmarks;
      if(disposed)return false;const result=await factory(T);
      if(disposed){result.dispose?.();return false;}
      landmarks=result;result.updateClock?.(timeState);scene.add(result.group);result.targets.forEach(target=>targets.set(target.id,target));
      refreshObstacles();refineSurfaces(result.group);invalidate();emit();onProgress({phase:'architecture'});return true;
    })().catch(error=>{landmarkPromise=null;if(!disposed){outdoorsError=String(error?.message||error);console.warn('Garden landmarks unavailable:',error);emit();}return false;});
    return landmarkPromise;
  }
  function prewarmExterior() {
    if(disposed)return Promise.resolve(false);
    if(outdoorsReady){if(landmarks)return Promise.resolve(true);if(landmarkPromise)return landmarkPromise;outdoorsError=null;outdoorsLoading=true;emit();return loadOutdoorLandmarks().then(ready=>{outdoorsLoading=false;emit();return ready;});}
    if(outdoorPromise)return outdoorPromise;
    clearTimeout(prewarmTimer);prewarmTimer=0;if(idleHandle){globalThis.cancelIdleCallback?.(idleHandle);idleHandle=0;}
    outdoorsError=null;outdoorsLoading=true;emit();
    outdoorPromise=(async()=>{
      const factories=await Promise.all([loadLandscape?Promise.resolve(loadLandscape):import('./world-landscape.js').then(module=>module.createWorldLandscape),loadBoundary?Promise.resolve(loadBoundary):import('./garden-boundary.js').then(module=>module.createGardenBoundary)]);
      if(disposed)return false;
      landscape=await factories[0](T);if(disposed){landscape.dispose?.();return false;}scene.add(landscape.group);landscape.setTime?.(timeState);
      await new Promise(resolve=>setTimeout(resolve,0));if(disposed)return false;
      boundary=await factories[1](T,{bounds:WORLD_BOUNDS});if(disposed){boundary.dispose?.();return false;}scene.add(boundary.group);boundary.setNightFactor(timeState.nightMix);
      outdoorsReady=true;refreshObstacles();refineSurfaces(boundary.group);invalidate();emit();onProgress({phase:'garden'});
      const architectureReady=await loadOutdoorLandmarks();outdoorsLoading=false;if(!disposed)emit();return architectureReady;
    })().catch(error=>{if(disposed)return false;outdoorsLoading=false;outdoorPromise=null;if(!outdoorsReady){landscape?.group.removeFromParent();landscape?.dispose();landscape=undefined;boundary?.group.removeFromParent();boundary?.dispose();boundary=undefined;}if(!disposed){outdoorsError=String(error?.message||error);console.warn('Garden preparation unavailable:',error);emit();}return false;});
    return outdoorPromise;
  }
  function state() {
    const view = navigation.getState();
    return { webgl: true, catReady: !!cat?.model, landmarksReady: !!landmarks, miniaturesReady, outdoorsReady, outdoorsLoading, outdoorsError, renderingActive, readyPhase: !miniaturesReady || !cat?.model ? 'home' : !outdoorsReady ? 'study' : !landmarks ? 'garden' : 'complete', focus: focusId, paused, lightingMode, mode: inHome(view.position) ? 'inside' : 'outside', travel: !!view.routeActive || !!postureTransition, seated: posture === 'seated', standing: posture === 'walking' || posture === 'returning-to-seat', posture, time: timeState, position: { ...view.position } };
  }
  function emit(force = false) {
    if(disposed)return;
    const value = state(), key = [value.catReady, value.landmarksReady, value.miniaturesReady, value.outdoorsReady, value.outdoorsLoading, value.outdoorsError, value.renderingActive, value.focus, value.paused, value.lightingMode, value.mode, value.travel, value.posture, value.time?.label, value.time?.phase].join(',');
    if (force || key !== lastState) { lastState = key; canvas.dispatchEvent(new CustomEvent('worldstate', { detail: value })); }
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
    const ratio = Math.max(.65,pixelRatio(width, height)*performanceScale); if (renderer.getPixelRatio?.() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false); performanceStats.pixelRatio=ratio; camera.aspect = width / height; camera.fov = worldFov(camera.aspect); camera.updateProjectionMatrix(); revision++;
  }
  function draw(ms, force = false) {
    if (disposed || !visible || !renderingActive) return;
    const elapsed = previousMs ? Math.max(0,(ms-previousMs)/1000) : .016, delta=Math.min(elapsed,.075); previousMs=ms;
    if (wheelInputUntil && ms > wheelInputUntil) { wheelInputUntil = 0; navigation.setInput({ forward: 0, right: 0 }); }
    if (ms-lastTimeSample>=1000) { lastTimeSample=ms; applyTime(); }
    // Navigation keeps its swept .045 m collision steps; consume slow visible
    // frames in bounded solver slices instead of slowing walking to .075 s/frame.
    let remaining=Math.min(elapsed,1),view=navigation.getState();
    do {const step=Math.min(.1,remaining);view=navigation.update(step);remaining-=step;} while(remaining>1e-7);
    if (pendingSeat && !view.routeActive) {
      pendingSeat=false;
      if(Math.hypot(view.position.x-seatPosition[0],view.position.z-seatPosition[2])<.03) beginPosture('sitting-down',seatPosition[1]);
      else posture='walking';
    }
    if (postureTransition) {
      const transition=postureTransition;transition.elapsed=Math.min(transition.duration,transition.elapsed+elapsed);
      const t=transition.elapsed/transition.duration,ease=t*t*(3-2*t);
      navigation.setEyeHeight(transition.from+(transition.to-transition.from)*ease);
      const nextPitch=transition.fromPitch+(transition.toPitch-transition.fromPitch)*ease;
      navigation.rotate(0,nextPitch-navigation.getState().pitch);
      if(t===1) { posture=transition.kind==='standing-up'?'walking':'seated';postureTransition=null; }
      view=navigation.getState();
    }
    const inside=inHome(view.position),showGarden=!inside || view.position.z>1 && Math.cos(view.yaw)>.15;
    const catVisible=inside || Math.hypot(view.position.x,view.position.z)<9;
    if(cat){cat.group.visible=catVisible;cat.contactShadow.visible=catVisible&&!!cat.model;}
    landscape?.setInteriorView?.(!showGarden);
    updateNearbyLights(view.position);
    const catMoved = cat?.update(delta, !paused && catVisible);
    home.update?.(delta, !paused);
    const key = [revision, view.position.x, view.position.y, view.position.z, view.yaw, view.pitch, width, height].join(',');
    if (force || catMoved || key !== lastView) {
      const refreshShadows=shadowDirty;
      if(refreshShadows) {
        // Bake the complete exterior before hiding foliage behind opaque study
        // walls. Cached sun shadows therefore remain correct at the doorway.
        landscape?.setInteriorView?.(false);
        sun.shadow.needsUpdate=true;windowLight.shadow.needsUpdate=true;
        renderer.shadowMap.needsUpdate=true;shadowDirty=false;performanceStats.shadowRefreshes++;
      }
      const renderStart=performance.now();renderer.render(scene,camera);
      performanceStats.lastRenderMs=performance.now()-renderStart;performanceStats.frameIntervalMs=elapsed*1000;performanceStats.frames++;
      performanceStats.drawCalls=renderer.info?.render?.calls||0;performanceStats.triangles=renderer.info?.render?.triangles||0;
      if(refreshShadows)landscape?.setInteriorView?.(!showGarden);
      lastView=key;
      // Only sustained measured slow frames reduce resolution. Geometry, texture
      // detail and navigation stay intact; a new load never immediately downgrades.
      if(!refreshShadows && firstFrameReady && ms-lastPerformanceChange>3000) {
        slowFrames=elapsed>.07 ? slowFrames+1 : Math.max(0,slowFrames-1);
        if(slowFrames>=8 && performanceStats.pixelRatio>.65) {performanceScale=Math.max(.4,performanceScale-.1);slowFrames=0;lastPerformanceChange=ms;resize();}
      }
    }
    emit();
  }
  function animate(ms) { if (disposed || !visible || !renderingActive) return; raf=requestAnimationFrame(animate);const view=navigation.getState(),moving=postureTransition||view.routeActive||view.moving||dragging||pressed.size;if(ms-lastDraw<(moving?16:32))return;lastDraw=ms;draw(ms); }
  function walk(points, focus, look) {
    if (disposed || posture === 'seated' || postureTransition) return false;
    pendingSeat=false;posture='walking';
    const accepted = navigation.walkRoute(points, look);
    if (accepted) { focusId = focus; pressed.clear(); revision++; emit(true); }
    return accepted;
  }
  function beginPosture(kind,to) {
    navigation.stop();pendingSeat=false;pressed.clear();posture=kind;
    const current=navigation.getState();
    postureTransition={kind,from:current.position.y,to,fromPitch:current.pitch,toPitch:Math.atan2(seatTarget[1]-to,Math.hypot(seatTarget[0]-current.position.x,seatTarget[2]-current.position.z)),elapsed:0,duration:.9};
    revision++;emit(true);
  }
  function standUp() {
    if(disposed || posture!=='seated')return false;
    beginPosture('standing-up',HOME.eyeHeight);void prewarmExterior();return true;
  }
  function sitDown() {
    if(disposed || posture==='seated' || postureTransition)return false;
    const accepted=walk([{x:seatedSpawn.x,z:seatedSpawn.z}],'room',seatLook);
    if(accepted){pendingSeat=true;posture='returning-to-seat';emit(true);}return accepted;
  }
  function leave() { if(!outdoorsReady){void prewarmExterior();return false;} cat?.useRoomDetail?.(); return walk([{ x: HOME.door.x, z: 4.8 }, { x: HOME.door.x, z: 9 }], 'outside', { x: 0, y: 6.5, z: 40 }); }
  function returnHome() { cat?.useRoomDetail?.(); return walk([{ x: seatedSpawn.x, z: seatedSpawn.z }], 'room', seatLook); }
  function goToLandmark(id) {
    if(!outdoorsReady){void prewarmExterior();return false;}
    cat?.useRoomDetail?.();
    const key = id.replace(/^landmark-/, ''), site = LANDMARK_SITES.find(s => s.key === key); if (!site) return false;
    return walk([{ x: site.arrival[0], z: site.arrival[1] }], 'landmark-' + key, { x: site.position[0], y: site.lookHeight, z: site.position[1] });
  }
  function focus(id) {
    if (id === 'world' || id === 'room' || id === 'home') return returnHome();
    if (id === 'outside' || id === 'garden') return leave();
    if (id === 'cat' && cat?.model) {
      const point = new T.Vector3(); cat.group.getWorldPosition(point); point.y += .25;
      cat.react(); cat.ensureDetail?.();
      return walk([{ x: HOME.spawn.x, z: HOME.spawn.z }], 'cat', { x: point.x, y: point.y, z: point.z });
    }
    return goToLandmark(id);
  }
  function setMovement(input = {}) { if (posture === 'seated' || postureTransition) return; if(input.forward || input.right) {pendingSeat=false;posture='walking';} navigation.setInput(input); if (input.forward || input.right) { focusId = inHome(navigation.getState().position) ? 'room' : 'outside'; revision++; emit(); } }
  function stopMovement() { navigation.stop(); pendingSeat=false; if(posture==='returning-to-seat')posture='walking'; pressed.clear(); wheelInputUntil = 0; revision++; emit(); }
  function look(dx, dy) { if(posture==='seated'||postureTransition)return;pendingSeat=false;posture='walking'; navigation.rotate(dx, dy); revision++; }
  function zoom(delta) { if (!Number.isFinite(delta) || delta === 0) return; setMovement({ forward: delta < 0 ? 1 : -1, right: 0 }); wheelInputUntil = performance.now() + 150; }
  function select(event) {
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const roots = (landmarks?.targets || []).map(t => t.object); if (cat?.model) roots.push(cat.group);
    // Wall/furniture intersections occlude selectable geometry outside the home.
    const hits = raycaster.intersectObjects([home.group, ...roots], true);
    const hit = hits.find(h => h.object.visible && !(Array.isArray(h.object.material) ? h.object.material.every(m => m.transparent && m.opacity < .15) : h.object.material?.transparent && h.object.material.opacity < .15));
    if (!hit) return;
    let id; for (let object = hit.object; object; object = object.parent) if (object.userData.targetId) { id = object.userData.targetId; break; }
    if (!id) return;
    if (id.startsWith('landmark-') || id === 'cat') focus(id);
    onSelect(id);
  }
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || posture === 'seated' || postureTransition) return;
    canvas.focus?.({ preventScroll: true }); canvas.setPointerCapture?.(event.pointerId);
    activePointers.add(event.pointerId); if (activePointers.size > 1) { moved = true; return; }
    if (dragging) return; dragging = { id: event.pointerId, x: event.clientX, y: event.clientY }; down = { ...dragging }; moved = false;
  });
  listen(canvas, 'pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId || activePointers.size > 1) return;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) moved = true;
    if (moved) { navigation.cancelRoute(); look(-(event.clientX - dragging.x) / width * 2.7, (event.clientY - dragging.y) / height * 1.7); }
    dragging.x = event.clientX; dragging.y = event.clientY;
  });
  function endPointer(event, cancel = false) {
    activePointers.delete(event.pointerId);
    if (!dragging || dragging.id !== event.pointerId) return;
    if (!cancel && !moved && down) select(event);
    dragging = down = null; if (cancel) stopMovement();
  }
  listen(canvas, 'pointerup', event => endPointer(event)); listen(canvas, 'pointercancel', event => endPointer(event, true)); listen(canvas, 'lostpointercapture', event => endPointer(event, true));
  listen(canvas, 'wheel', event => { if (event.ctrlKey || event.metaKey || posture === 'seated' || postureTransition) return; event.preventDefault(); zoom(clamp(event.deltaY, -300, 300)); }, { passive: false });
  const keyMovement = () => setMovement({ forward: Number(pressed.has('w') || pressed.has('arrowup')) - Number(pressed.has('s') || pressed.has('arrowdown')), right: Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft')), sprint: pressed.has('shift') });
  listen(canvas, 'keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)) { event.preventDefault(); pressed.add(key); keyMovement(); }
    else if (key === 'escape') { event.preventDefault(); stopMovement(); }
    else if (key === 'home') { event.preventDefault(); returnHome(); }
  });
  listen(window, 'keyup', event => { if (pressed.delete(event.key.toLowerCase())) { keyMovement(); revision++; } });
  listen(window, 'blur', stopMovement); listen(canvas, 'blur', stopMovement); listen(window, 'resize', resize);
  listen(document, 'visibilitychange', () => { visible = !document.hidden; stopMovement(); cancelAnimationFrame(raf); previousMs = 0; lastTimeSample=-Infinity; if (visible && renderingActive && !disposed) { revision++; raf = requestAnimationFrame(animate); } });
  function setRenderingActive(value) {
    const next=!!value;if(disposed||next===renderingActive)return;
    renderingActive=next;cancelAnimationFrame(raf);previousMs=0;lastTimeSample=-Infinity;
    if(next&&visible){revision++;raf=requestAnimationFrame(animate);if(!outdoorPromise)prewarmTimer=setTimeout(()=>{prewarmTimer=0;if(renderingActive&&!disposed)void prewarmExterior();},350);}
    else {clearTimeout(prewarmTimer);prewarmTimer=0;if(idleHandle){globalThis.cancelIdleCallback?.(idleHandle);idleHandle=0;}stopMovement();}
    emit();
  }
  function dispose() {
    if (disposed) return; disposed = true; abort.abort(); cancelAnimationFrame(raf); cancelAnimationFrame(paintRaf); clearTimeout(paintTimer);clearTimeout(prewarmTimer);if(idleHandle)globalThis.cancelIdleCallback?.(idleHandle); listeners.forEach(remove => remove()); navigation.dispose();surfaceOwners.forEach(owner=>owner.dispose()); home.dispose?.(); landmarks?.dispose(); landscape?.dispose(); boundary?.dispose(); skyOwner.dispose(); renderer.dispose();
  }
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); dispose(); onError(new Error('World graphics context lost')); });
  applyTime(true); resize(); draw(0, true);firstFrameReady=true; onReady(); onProgress({ phase: 'home' }); emit(true); raf = requestAnimationFrame(animate);
  async function defaultLoadCat(tier, options) { const { loadWorldCat } = await import('./world-cat-loader.js'); return loadWorldCat(tier, options); }
  const afterPaint = () => new Promise(resolve => { paintRaf = requestAnimationFrame(() => { paintRaf = 0; paintTimer = setTimeout(() => { paintTimer = 0; resolve(); }, 0); }); });
  afterPaint().then(() => {
    if(disposed)return;
    // Cat decoding and desk architecture have independent lifetimes. Neither
    // waits for a garden factory, surface image, or the other asset to finish.
    home.refine?.();refineSurfaces(home.group);
    Promise.resolve().then(()=>(loadCat||defaultLoadCat)('world',{signal:abort.signal})).then(asset=>{
      if(cat?.installAsset(asset)){applyCatShadowPolicy();invalidate();emit();onProgress({phase:'cat'});}
    }).catch(error=>{if(!disposed&&error.name!=='AbortError')console.warn('Room cat unavailable:',error);});
    home.loadMiniatures?.();
    home.landmarksReady?.then(result=>{
      if(disposed)return;miniaturesReady=!!result;
      for(const target of home.targets||[])targets.set(target.id,target);
      if(result?.group)refineSurfaces(result.group);invalidate();emit();onProgress({phase:'miniatures'});
    }).catch(error=>console.warn('Desk landmarks unavailable:',error));
    // Yield a useful live room frame before prewarming the garden. Standing can
    // promote this work immediately without recreating the renderer or cat.
    prewarmTimer=setTimeout(()=>{
      prewarmTimer=0;if(disposed||!renderingActive||!visible)return;
      if(globalThis.requestIdleCallback)idleHandle=globalThis.requestIdleCallback(()=>{idleHandle=0;if(renderingActive&&visible&&!disposed)void prewarmExterior();},{timeout:1600});
      else void prewarmExterior();
    },350);
  }).catch(error=>{if(!disposed)onError(error);});
  return {
    getState: state, getPerformance: () => ({...performanceStats,outdoorsReady,miniaturesReady}), setRenderingActive, prewarmExterior, standUp, sitDown, focus, leave, returnHome, goToLandmark, reset: returnHome, zoom, setMovement, look, stopMovement,
    setPaused(value) { paused = !!value; revision++; emit(); },
    setLightingMode(value) {
      if (!['day','night','auto'].includes(value)) return;
      lightingMode=value;applyTime(true);emit();
    },
    dispose,
  };
}
