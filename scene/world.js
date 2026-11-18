import { createWindowLight } from './study-finishes.js';
import * as T from './world-three.js';
import { createBlenderRoom } from './blender-room.js';
import { createWalkNavigation } from './home-navigation.js';
import { getWorldTime } from './world-time.js';
import { createWorldSky } from './world-sky.js';
import { HOME, WORLD_BOUNDS, WAYPOINTS, LANDMARK_SITES, LANDMARK_RESERVATIONS, OUTDOOR_VIEWS, REGION_BOUNDS, regionalHeight, districtAt, worldFov } from './world-layout.js';

const clamp = T.MathUtils.clamp;
const pixelRatio = (w, h) => Math.min(globalThis.devicePixelRatio || 1, 2, Math.max(.7, Math.sqrt(2500000 / Math.max(1, w * h))));
const collision = ({ id, box }) => ({ id, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
const inHome = p => p.x > HOME.bounds.minX && p.x < HOME.bounds.maxX && p.z > HOME.bounds.minZ && p.z < HOME.bounds.maxZ;
const sight = { room: [24, 11, 22], waseda: [330, 205, 315], karatsu: [570, 340, 550] };

const angle = value => Math.atan2(Math.sin(value), Math.cos(value));

/** Start at the desk. Standing opens the same world at its garden entrance. */
export async function mountWorld({ canvas, onReady = () => {}, onError = () => {}, onSelect = () => {}, onProgress = () => {}, rendererFactory, rendererContext, loadLandmarks, loadRegion, seated: startSeated = true, autoTime = true, now = () => new Date(), scheduleClockWake = (callback, delay) => setTimeout(callback, delay), cancelClockWake = token => clearTimeout(token), reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false } = {}) {
  let renderer;
  try {
    renderer = rendererFactory ? rendererFactory(canvas) : new T.WebGLRenderer({ canvas, context: rendererContext, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error); return { getState: () => ({ webgl: false, catReady: false, landmarksReady: false }), dispose() {} };
  }
  let disposed = false, paused = reducedMotion, visible = !document.hidden, renderingActive=true, raf = 0, paintRaf = 0, paintTimer = 0, previousMs = 0, lastDraw = 0;
  let studyActive = true, finishPaint;
  const assetWaiters = new Set();
  function waitForStudy() {
    if (disposed || studyActive) return Promise.resolve(!disposed);
    return new Promise(resolve => assetWaiters.add(resolve));
  }
  function releaseWaiters() {
    for (const resolve of assetWaiters) resolve(!disposed);
    assetWaiters.clear();
  }
  let lastHover = null;
  let landmarks, home, cat, navigation, skyOwner, shadowDirty = true, revision = 1, lightingMode = autoTime ? 'auto' : 'day', focusId = 'room', lastState = '', lastView = '';
  let miniaturesReady=false,outdoorsReady=false,outdoorsLoading=false,outdoorsError=null;
  let clockWake = 0, firstFrameReady = false, performanceScale = 1, slowFrames = 0, fastFrames = 0, lastPerformanceChange = 0;
  let pendingGardenArrival = false, movementHeld = false, seatedZoom = 0, placeRequest = 0;
  let region = null, regionalScene = null, placeKey = null, geometryReady = false;
  let regionAbort, requestedPlace = 'okuma-auditorium';
  let shadowAnchor={x:0,y:0,z:35};
  let lastShadowRefresh = -Infinity, hoverEvent;
  let pendingSubject = null, deskAction = null, deskStatus = '', deskActionSequence = 0;
  const performanceStats={frames:0,lastRenderMs:0,drawCalls:0,triangles:0,pixelRatio:1,shadowRefreshes:0};
  let posture = startSeated ? 'seated' : 'walking', postureTransition = null, pendingSeat = false;
  let timeState, lastTimeSample = -Infinity, lastClockKey = '', lastLightKey = '';
  const seatPosition = HOME.seated.position, seatTarget = HOME.seated.target;
  const seatedSpawn = { x: seatPosition[0], z: seatPosition[2], yaw: Math.atan2(seatTarget[0]-seatPosition[0],seatTarget[2]-seatPosition[2]), pitch: Math.atan2(seatTarget[1]-seatPosition[1],Math.hypot(seatTarget[0]-seatPosition[0],seatTarget[2]-seatPosition[2])) };
  const seatLook = { x: seatTarget[0], y: seatTarget[1], z: seatTarget[2] };
  let width = 1, height = 1, down = null, dragging = null, moved = false, wheelInputUntil = 0;
  const abort = new AbortController(), listeners = [], pressed = new Set(), activePointers = new Set();
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(62, 1, .035, sight.room[0]);
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  function listen(target, name, handler, options) { target.addEventListener(name, handler, options); listeners.push(() => target.removeEventListener(name, handler, options)); }
  function wake() {
    if (!firstFrameReady || disposed || !visible || !studyActive || !renderingActive) return;
    if (clockWake) {
      cancelClockWake(clockWake); clockWake = 0;
      // Input after a long idle wait advances from this input, not from the last clock tick.
      previousMs = 0;
    }
    if (!raf) raf = requestAnimationFrame(animate);
  }
  function suspendFrames() {
    cancelAnimationFrame(raf); raf = 0;
    if (clockWake) cancelClockWake(clockWake);
    clockWake = 0; previousMs = 0; lastTimeSample = -Infinity;
  }
  function invalidate() { revision++; shadowDirty = true; wake(); }
  try {
    home=await createBlenderRoom(T,{signal:abort.signal,waitForStudy,onAssetChange:invalidate});
    scene.add(home.group);
    sharpenTextures(home.group);
    navigation = createWalkNavigation({ camera, bounds: WORLD_BOUNDS, obstacles: [...(home.collisions || []).map(collision), ...LANDMARK_RESERVATIONS, loadingGate()], spawn: startSeated ? seatedSpawn : HOME.spawn, eyeHeight: startSeated ? seatPosition[1] : HOME.eyeHeight, radius: .20, speed: 2.4, waypoints: WAYPOINTS });
  } catch (error) { home?.dispose?.(); renderer.dispose(); onError(error); return { getState: () => ({ webgl: false, catReady: false, landmarksReady: false }), dispose() {} }; }
  scene.fog = new T.Fog('#dce0d1', sight.room[1], sight.room[2]);
  skyOwner=createWorldSky(T);
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const sun = new T.DirectionalLight('#ffe4bd', 2.6); sun.position.set(-38, 55, -12); sun.target.position.set(0, 0, 35);
  const shadowResolution = Math.min(2048, renderer.capabilities?.maxTextureSize || 2048); sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 68, bottom: -68, near: 1, far: 185 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 2;
  const hemisphere = new T.HemisphereLight('#e1eee9', '#7a6b50', 1.15), ambient = new T.AmbientLight('#eee2ca', .30);
  const roomFill = new T.PointLight('#ffe4bd', 2.3, 8, 1); roomFill.position.set(.2, 2.12, 1.25);
  // The close window-light map retains chair legs and desk details; the cat
  // keeps its moving contact plane and the broad sun map serves the garden.
  const windowLight = new T.DirectionalLight('#fff0d5', .65); windowLight.position.set(-3, 3, -2.3); windowLight.target.position.set(0, .1, 1.1); windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(shadowResolution,shadowResolution); Object.assign(windowLight.shadow.camera, { left: -3.8, right: 3.8, top: 4, bottom: -4, near: .1, far: 14 }); windowLight.shadow.camera.updateProjectionMatrix(); windowLight.shadow.normalBias = .007; windowLight.shadow.bias = -.00005;
  sun.shadow.autoUpdate = false; windowLight.shadow.autoUpdate = false;
  const sash = createWindowLight(T);
  scene.add(sash.light,sash.light.target);
  scene.add(sun, sun.target, hemisphere, ambient, roomFill, windowLight, windowLight.target);

  function sharpenTextures(group) {
    const quality = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() || 1);
    if (quality <= 1) return;
    group.traverse(node => {
      for (const material of [].concat(node.material || [])) {
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture && texture.anisotropy < quality) { texture.anisotropy = quality; texture.needsUpdate = true; }
        }
      }
    });
  }

  function applyTime(force=false) {
    const snapshot=getWorldTime(now(),lightingMode);
    timeState=snapshot;
    if(force || snapshot.secondKey!==lastClockKey) {
      lastClockKey=snapshot.secondKey;
      home.updateClock?.(snapshot);landmarks?.updateClock?.(snapshot);
      revision++;
    }
    if(force || snapshot.lightingKey!==lastLightKey) {
      lastLightKey=snapshot.lightingKey;
      sun.intensity=snapshot.sun.intensity;sun.color.set(snapshot.sun.color);
      sun.position.fromArray(snapshot.sun.position);
      sun.position.x+=shadowAnchor.x;sun.position.y+=shadowAnchor.y;sun.position.z+=shadowAnchor.z-35;
      sun.target.position.set(shadowAnchor.x,shadowAnchor.y,shadowAnchor.z);
      hemisphere.intensity=snapshot.hemisphere.intensity;
      hemisphere.color.set(snapshot.hemisphere.skyColor);hemisphere.groundColor.set(snapshot.hemisphere.groundColor);
      ambient.intensity=snapshot.ambientIntensity;ambient.color.set(snapshot.ambientColor);
      roomFill.intensity=snapshot.roomFillIntensity*.83;windowLight.intensity=snapshot.windowLightIntensity*1.30;
      sash.light.intensity=5.8*snapshot.daylight + 1.35*snapshot.dusk;
      home.setDaylight?.(snapshot.daylight);
      if(home.lampLight)home.lampLight.intensity=snapshot.deskLampIntensity;
      scene.environmentIntensity=snapshot.environmentIntensity;scene.backgroundIntensity=snapshot.backgroundIntensity;
      renderer.toneMappingExposure=snapshot.exposure;scene.fog.color.set(snapshot.fogColor);
      const sky=skyOwner.update(snapshot);scene.background=sky.background;scene.environment=sky.environment;
      invalidate();
    }
  }
  function loadingGate() {return {id:'garden-loading-threshold',minX:HOME.door.x-.7,maxX:HOME.door.x+.7,minZ:HOME.door.z-.04,maxZ:HOME.door.z+.12};}
  function walkingObstacles(area=region, context=regionalScene) {
    if (!area) return [...(home.collisions || []).map(collision), loadingGate()];
    const ids = new Set(context.architecture.sites.map(site => 'landmark-' + site.key));
    return [...context.collisions.map(collision), ...LANDMARK_RESERVATIONS.filter(reservation => ids.has(reservation.id))];
  }
  function choosePlace(key) {
    if (placeKey === key) return;
    placeKey = key;
    updateProjection();
    if (!key) return;
    const view = OUTDOOR_VIEWS[key], site = LANDMARK_SITES.find(site => site.key === key);
    shadowAnchor = {x: (view.eye[0] + site.position[0]) * .5,
      y: regionalHeight(view.region, ...view.eye) + site.height * .18, z: (view.eye[1] + site.position[1]) * .5};
    applyTime(true);
  }
  function followPlace(x,z) {
    if(!region)return;
    let nearby=null,nearest=Infinity;
    for(const [key,view] of Object.entries(OUTDOOR_VIEWS)){
      if(view.region!==region)continue;
      const d=(x-view.eye[0])**2+(z-view.eye[1])**2;
      if(d<nearest){nearest=d;nearby=key;}
    }
    if(nearest<39**2)choosePlace(nearby);
    else if(placeKey){
      const [px,pz]=OUTDOOR_VIEWS[placeKey].eye;
      if((px-x)**2+(pz-z)**2>62**2)choosePlace(null);
    }
  }
  function enterSpace(area, context, spawn) {
    const next = createWalkNavigation({camera, bounds: area ? REGION_BOUNDS[area] : WORLD_BOUNDS,
      waypoints: area ? [] : WAYPOINTS, obstacles: walkingObstacles(area, context),
      spawn, eyeHeight: HOME.eyeHeight, groundHeight: (x,z) => regionalHeight(area,x,z), radius: .20, speed: 2.4});
    navigation.dispose(); navigation = next;
    regionalScene?.group.removeFromParent();
    regionalScene?.dispose();
    region = area; regionalScene = context; landmarks = context?.architecture;
    if (context) {
      scene.add(context.group);
      landmarks.updateClock?.(timeState);
    }
    home.group.visible = roomFill.visible = windowLight.visible = sash.light.visible = !area;
    sun.castShadow = !!area;
    placeKey = null; geometryReady = false; outdoorsReady = !!context;
    shadowAnchor = area ? {x:spawn.x,y:regionalHeight(area,spawn.x,spawn.z),z:spawn.z} : {x:0,y:0,z:35};
    applyTime(true); updateProjection(); revision++; wake();
  }
  function cancelRegionLoad() {
    placeRequest++;
    regionAbort?.abort(); regionAbort = null; outdoorsLoading = false;
  }
  function homeEntrance() {
    cancelRegionLoad();
    if (region) enterSpace(null, null, HOME.spawn);
  }
  function applyCatShadowPolicy() {
    // The animated contact plane follows every paw step. It avoids repeating
    // the entire static desk's shadow render for one small moving pet.
    cat?.model?.traverse(object=>{if(object.isMesh)object.castShadow=false;});
  }
  function prewarmExterior() {
    return explorePlace(requestedPlace);
  }
  function state() {
    const view = navigation.getState();
    return { webgl: !renderer.isMeshRaster, renderer: renderer.isMeshRaster ? 'software' : 'webgl', geometrySource:'blender', region,placeKey,geometryReady,district: inHome(view.position) ? '書斎' : districtAt(view.position), deskProps: home.deskActions?.getState() || {}, deskAction, deskStatus, deskActionSequence, catReady: !!cat?.model, landmarksReady: !!landmarks, miniaturesReady, outdoorsReady, outdoorsLoading, outdoorsError, renderingActive, readyPhase: !miniaturesReady || !cat?.model ? 'home' : !outdoorsReady ? 'study' : !landmarks ? 'garden' : 'complete', focus: focusId, paused, lightingMode, mode: inHome(view.position) ? 'inside' : 'outside', travel: !!view.routeActive || !!postureTransition, seated: posture === 'seated', standing: posture === 'walking' || posture === 'returning-to-seat', posture, time: timeState, position: { ...view.position } };
  }
  function emit(force = false) {
    if(disposed)return;
    const value = state(), key = [region,placeKey,geometryReady,deskActionSequence, value.catReady, value.landmarksReady, value.miniaturesReady, value.outdoorsReady, value.outdoorsLoading, value.outdoorsError, value.renderingActive, value.focus, value.paused, value.lightingMode, value.mode, value.district, value.travel, value.posture, value.time?.label, value.time?.phase].join(',');
    if (force || key !== lastState) { lastState = key; canvas.dispatchEvent(new CustomEvent('worldstate', { detail: value })); }
  }
  function updateProjection() {
    camera.aspect = width / height;
    const [far, fogNear, fogFar] = sight[region || 'room'];
    camera.near = region ? .12 : .035; camera.far = far;
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    const arrival = region && OUTDOOR_VIEWS[placeKey];
    camera.fov = arrival ? Math.min(91, 360 / Math.PI * Math.atan(Math.tan(arrival.fov * Math.PI / 360) * Math.max(1, 1.35 / camera.aspect)))
      : worldFov(camera.aspect,posture === 'seated') + (posture === 'seated' ? seatedZoom : 0);
    camera.updateProjectionMatrix();
  }
  function resize() {
    // Hidden 2D and mobile layout transitions briefly report a zero viewport.
    // Keep the last real 3D frame until there is a new visible size to draw.
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    width = canvas.clientWidth; height = canvas.clientHeight;
    const ratio = Math.max(.65,pixelRatio(width, height)*performanceScale); if (renderer.getPixelRatio?.() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false); performanceStats.pixelRatio=ratio; updateProjection(); revision++; wake();
  }
  function draw(ms, force = false) {
    if (disposed || !visible || !studyActive || !renderingActive) return;
    const elapsed = previousMs ? Math.max(0,(ms-previousMs)/1000) : .016, delta=Math.min(elapsed,.075); previousMs=ms;
    if (wheelInputUntil && ms > wheelInputUntil) { wheelInputUntil = 0; movementHeld = false; navigation.setInput({ forward: 0, right: 0 }); }
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
      if(t===1) {
        posture=transition.kind==='standing-up'?'walking':'seated';postureTransition=null;
        if (posture === 'walking') arriveInGarden();
        else { seatedZoom = 0; updateProjection(); }
      }
      view=navigation.getState();
    }
    if(region){
      followPlace(view.position.x,view.position.z);
      if((view.position.x-shadowAnchor.x)**2+(view.position.z-shadowAnchor.z)**2>40**2){
        shadowAnchor={x:view.position.x,y:regionalHeight(region,view.position.x,view.position.z),z:view.position.z};applyTime(true);
      }
    }
    if(posture==='seated'){
      const turn=angle(view.yaw-seatedSpawn.yaw);
      camera.position.x+=Math.sin(turn)*.31;
      camera.position.y-=Math.sin(view.pitch-seatedSpawn.pitch)*.10;
      camera.position.z+=(1-Math.cos(turn))*.31;
      camera.updateMatrixWorld();
    }
    const inside=inHome(view.position);
    const catVisible=inside || Math.hypot(view.position.x,view.position.z)<9;
    if(cat){cat.group.visible=catVisible;if(cat.contactShadow)cat.contactShadow.visible=catVisible&&!!cat.model;}
    const catMoved = cat?.update(delta, !paused && catVisible);
    const deskMoved = !region && home.deskActions?.update(delta, !paused);
    if (deskMoved) shadowDirty = true;
    const blindsMoved = home.update?.(delta, !paused);
    const movingScenery = !paused && !renderer.isMeshRaster && regionalScene?.wantsMotion?.(view.position, view.yaw);
    const key = [revision, view.position.x, view.position.y, view.position.z, view.yaw, view.pitch, width, height].join(',');
    if (force || deskMoved || blindsMoved || catMoved || movingScenery || key !== lastView) {
      if (regionalScene?.update?.(view.position, movingScenery ? ms / 1000 : undefined)) shadowDirty = true;
      // During a desk animation, preserve the moving object every frame and
      // resample its shadow at intervals. Always settle on an exact final shadow.
      const refreshShadows = shadowDirty && (!deskMoved || !home.deskActions.isAnimating() || ms - lastShadowRefresh >= 85);
      if (refreshShadows) {
        if (region) sun.shadow.needsUpdate = true;
        else windowLight.shadow.needsUpdate = true;
        lastShadowRefresh = ms;
        renderer.shadowMap.needsUpdate = true; shadowDirty = false; performanceStats.shadowRefreshes++;
      }
      const renderStart = performance.now();
      const reuseStudy = renderer.isMeshRaster && !region && cat?.group.visible && !deskMoved && !blindsMoved;
      if (reuseStudy) renderer.render(scene, camera, {staticFrameKey: key, dynamicRoot: cat.group});
      else renderer.render(scene, camera);
      if (regionalScene) geometryReady = true;
      if(posture==='seated'){
        const points=home.destinations.projectionChanged(camera);
        if(points)canvas.dispatchEvent(new CustomEvent('studyprojection',{bubbles:true,detail:{points}}));
      }
      performanceStats.lastRenderMs=performance.now()-renderStart;performanceStats.frameIntervalMs=elapsed*1000;performanceStats.frames++;
      performanceStats.drawCalls=renderer.info?.render?.calls||0;performanceStats.triangles=renderer.info?.render?.triangles||0;
      lastView=key;
      // Only sustained measured slow frames reduce resolution. Geometry, texture
      // detail and navigation stay intact; a new load never immediately downgrades.
      if (!refreshShadows && firstFrameReady && (movementHeld || view.routeActive || dragging || catMoved || deskMoved)) {
        const busy = movementHeld || view.routeActive || dragging || deskMoved;
        slowFrames = elapsed > (busy ? .038 : .065) ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        fastFrames = elapsed < (busy ? .024 : .042) ? fastFrames + 1 : Math.max(0, fastFrames - 2);
        const minimumScale = renderer.isMeshRaster ? .55 : .65;
        if (slowFrames >= 6 && ms - lastPerformanceChange > 1800 && performanceScale > minimumScale) {
          performanceScale = Math.max(minimumScale, performanceScale - .13);
          fastFrames = slowFrames = 0; lastPerformanceChange = ms; resize();
        } else if (fastFrames >= 90 && ms - lastPerformanceChange > 8000 && performanceScale < 1) {
          performanceScale = Math.min(1, performanceScale + .1);
          fastFrames = slowFrames = 0; lastPerformanceChange = ms; resize();
        }
      }
      prefetchNearby(view.position);
    }
    processHover();
    revealDeskSubject();
    emit();
  }
  function animate(ms) {
    raf = 0;
    if (disposed || !visible || !studyActive || !renderingActive) return;
    const view = navigation.getState();
    const active = postureTransition || view.routeActive || movementHeld || dragging || home.deskActions?.isAnimating();
    const ambient = !paused && (cat?.model && cat.group.visible || !renderer.isMeshRaster && regionalScene?.wantsMotion?.(view.position, view.yaw));
    if ((!active && !ambient) || ms - lastDraw >= (active ? 14 : 1000 / (region ? 14 : 26))) {
      lastDraw = ms; draw(ms);
    }
    if (disposed || !visible || !studyActive || !renderingActive || raf) return;
    if (active || ambient) raf = requestAnimationFrame(animate);
    else clockWake = scheduleClockWake(() => {
      clockWake = 0;
      if (!disposed && visible && renderingActive) raf = requestAnimationFrame(animate);
    }, Math.max(16, 1000 - (ms - lastTimeSample)));
  }
  function arriveInGarden() {
    if (!pendingGardenArrival || posture !== 'walking') return;
    pendingGardenArrival = false;
    void explorePlace('okuma-auditorium');
  }
  function walk(points, focus, look) {
    if (disposed || posture === 'seated' || postureTransition) return false;
    cancelRegionLoad();pendingGardenArrival=false;pendingSeat=false;posture='walking';
    const accepted = navigation.walkRoute(points, look);
    if (accepted) { focusId = focus; pressed.clear(); movementHeld=false; revision++; wake(); emit(true); }
    return accepted;
  }
  function beginPosture(kind,to) {
    pendingSubject=null;
    navigation.stop();pendingSeat=false;movementHeld=false;pressed.clear();posture=kind;seatedZoom=0;updateProjection();
    const current=navigation.getState();
    postureTransition={kind,from:current.position.y,to,fromPitch:current.pitch,toPitch:Math.atan2(seatTarget[1]-to,Math.hypot(seatTarget[0]-current.position.x,seatTarget[2]-current.position.z)),elapsed:0,duration:reducedMotion ? .01 : .9};
    revision++;wake();emit(true);
  }
  function standUp() {
    if(disposed || posture!=='seated')return false;
    placeRequest++;canvas.style.cursor = '';pendingGardenArrival=true;beginPosture('standing-up',HOME.eyeHeight);return true;
  }
  function sitDown() {
    if(disposed || posture==='seated' || postureTransition)return false;
    homeEntrance();
    const accepted=walk([{x:seatedSpawn.x,z:seatedSpawn.z}],'room',seatLook);
    if(accepted){pendingSeat=true;posture='returning-to-seat';emit(true);}return accepted;
  }
  function leave() {
    if (disposed || posture === 'seated' || postureTransition) return false;
    void explorePlace('okuma-auditorium'); return true;
  }
  function returnHome() { homeEntrance();cat?.useRoomDetail?.(); return walk([{ x: seatedSpawn.x, z: seatedSpawn.z }], 'room', seatLook); }
  function prefetchNearby(eye) {
    if (!regionalScene || outdoorsLoading) return;
    const context = regionalScene;
    for (const site of context.architecture.sites) {
      const [x, z] = site.position;
      if (context.architecture.hasRequested(site.key) || context.prefetched.has(site.key) || (eye.x - x) ** 2 + (eye.z - z) ** 2 > 215 ** 2) continue;
      context.prefetched.add(site.key);
      context.architecture.ensure(site.key).then(asset => {
        if (context === regionalScene) { sharpenTextures(asset.group); invalidate(); }
      }).catch(() => {}); // An explicit visit can retry a background download.
    }
  }
  async function explorePlace(id) {
    const key = typeof id === 'string' ? id.replace(/^landmark-/, '') : '';
    const view = Object.hasOwn(OUTDOOR_VIEWS,key) && OUTDOOR_VIEWS[key];
    if (!view || disposed || !studyActive) return false;
    cancelRegionLoad();
    const token = placeRequest, controller = new AbortController(); regionAbort = controller;
    requestedPlace = key; outdoorsError = null; outdoorsLoading = view.region !== region || !landmarks?.has(key); emit(true);
    const [x,z]=view.eye,[tx,ty,tz]=view.target;
    const eyeY=regionalHeight(view.region,x,z)+HOME.eyeHeight;
    const spawn={x,z,yaw:Math.atan2(tx-x,tz-z),pitch:Math.atan2(ty-eyeY,Math.hypot(tx-x,tz-z))};
    try{
      if(region!==view.region) {
        const [{createRegionalLandscape}, {createRegionalLandmarks}] = await Promise.all([
          loadRegion ? {createRegionalLandscape: loadRegion} : import('./place-settings.js'),
          import('./world-landmarks.js'),
        ]);
        if (controller.signal.aborted) return false;
        const architecture = createRegionalLandmarks(T, view.region, loadLandmarks);
        const abandon = () => architecture.dispose();
        controller.signal.addEventListener('abort', abandon, {once: true});
        const result = await Promise.allSettled([
          createRegionalLandscape(T, view.region, {signal: controller.signal}),
          architecture.ensure(key),
        ]);
        controller.signal.removeEventListener('abort', abandon);
        const failed = result.find(item => item.status === 'rejected');
        if (failed || controller.signal.aborted) {
          architecture.dispose();
          if (result[0].status === 'fulfilled') result[0].value.dispose();
          if (failed) throw failed.reason;
          return false;
        }
        const [terrain, primary] = result.map(item => item.value);
        sharpenTextures(terrain.group); sharpenTextures(primary.group);
        const group = new T.Group();
        group.add(terrain.group, architecture.group);
        const context = {...terrain, group, architecture, prefetched: new Set(), dispose() { architecture.dispose(); terrain.dispose(); }};
        try { enterSpace(view.region, context, spawn); } catch (error) { context.dispose(); throw error; }
        onProgress({phase:'garden'}); onProgress({phase:'architecture'});
      } else {
        const asset = await landmarks.ensure(key);
        if (controller.signal.aborted || !navigation.relocate(spawn)) return false;
        sharpenTextures(asset.group);
      }
    } catch (error) {
      if (token === placeRequest && !disposed) { outdoorsError = String(error?.message || error); emit(true); }
      return false;
    } finally {
      if (token === placeRequest) { outdoorsLoading = false; regionAbort = null; emit(); }
    }
    geometryReady = false; choosePlace(key);
    pendingGardenArrival=false;pendingSeat=false;postureTransition=null;
    pressed.clear();movementHeld=false;seatedZoom=0;posture='walking';focusId='landmark-'+key;
    navigation.setEyeHeight(HOME.eyeHeight); updateProjection();cat?.useRoomDetail?.();
    revision++;wake();emit(true); return true;
  }
  function goToLandmark(id) {
    if(disposed||posture==='seated'||postureTransition)return false;
    cat?.useRoomDetail?.();
    const key = id.replace(/^landmark-/, ''), site = LANDMARK_SITES.find(s => s.key === key); if (!site) return false;
    if(region!==site.region || !landmarks?.has(key) || Math.hypot(site.arrival[0]-navigation.getState().position.x,site.arrival[1]-navigation.getState().position.z)>220){
      void explorePlace(key);return true;
    }
    return walk([{ x: site.arrival[0], z: site.arrival[1] }], 'landmark-' + key, { x: site.position[0], y: site.lookHeight, z: site.position[1] });
  }
  function focus(id) {
    if(id==='cat')homeEntrance();
    if (id === 'world' || id === 'room' || id === 'home') return returnHome();
    if (id === 'outside' || id === 'garden') return leave();
    if (id === 'cat' && cat?.model) {
      const point = new T.Vector3(); cat.group.getWorldPosition(point); point.y += .25;
      cat.react(); cat.ensureDetail?.();
      return walk([{ x: HOME.spawn.x, z: HOME.spawn.z }], 'cat', { x: point.x, y: point.y, z: point.z });
    }
    return goToLandmark(id);
  }
  function setMovement(input = {}) {
    if (posture === 'seated' || postureTransition) return;
    movementHeld = !!(input.forward || input.right);
    navigation.setInput(input);
    if (movementHeld) {
      pendingGardenArrival = pendingSeat = false; posture = 'walking';
      focusId = inHome(navigation.getState().position) ? 'room' : 'outside';
    }
    revision++; wake(); emit();
  }
  function stopMovement() {
    navigation.stop(); pendingSeat = movementHeld = false;
    if (posture === 'returning-to-seat') posture = 'walking';
    pressed.clear(); wheelInputUntil = 0; revision++; wake(); emit();
  }
  function look(dx, dy) {
    if (postureTransition || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (posture === 'seated') {
      const view = navigation.getState(), offset = angle(view.yaw - seatedSpawn.yaw);
      dx = clamp(offset + dx, -.34, .34) - offset;
      dy = clamp(view.pitch + dy, seatedSpawn.pitch - .23, seatedSpawn.pitch + .18) - view.pitch;
    } else { pendingGardenArrival = pendingSeat = false; posture = 'walking'; }
    navigation.rotate(dx, dy); revision++; wake();
  }
  function zoom(delta) {
    if (!Number.isFinite(delta) || !delta || postureTransition) return;
    if (posture === 'seated') {
      seatedZoom = clamp(seatedZoom + Math.sign(delta) * 3, -15, 6);
      updateProjection(); revision++; wake();
    } else { setMovement({ forward: delta < 0 ? 1 : -1 }); wheelInputUntil = performance.now() + 150; }
  }
  function announceSubject(key,type,source) {
    if(type==='hover' && lastHover===key)return;
    if(type==='hover')lastHover=key;
    canvas.dispatchEvent(new CustomEvent('studysubject',{bubbles:true,detail:{key,type,source}}));
  }
  function revealDeskSubject(){
    if(!pendingSubject || posture!=='seated' || !studyActive)return;
    const {id,key,source}=pendingSubject;
    if(home.deskActions.finished && !home.deskActions.finished(id))return;
    pendingSubject=null;announceSubject(key,'select',source);
  }
  function interactDesk(id,{reveal=true,source}={}) {
    if (disposed || !studyActive || posture !== 'seated') return false;
    const animate = !paused && !reducedMotion;
    const status = home.deskActions?.trigger(id, animate);
    if (!status) return false;
    pendingSubject=null;
    const key=id==='notebook'?'blog':id==='letter'?'contact':null;
    if(key && reveal && home.deskActions.getState()[id])pendingSubject={id,key,source};
    deskAction = id; deskStatus = status; deskActionSequence++;
    if (!home.deskActions.isAnimating()) shadowDirty = true;
    revision++; wake(); emit(true); revealDeskSubject();return true;
  }
  function aimPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function processHover() {
    if (!hoverEvent || dragging || posture !== 'seated') return;
    aimPointer(hoverEvent); hoverEvent = undefined;
    const key = home.pick(raycaster);
    announceSubject(key === 'notebook' ? 'blog' : key === 'letter' ? 'contact' : key, 'hover');
    canvas.style.cursor = key ? 'pointer' : '';
  }
  function select(event) {
    aimPointer(event);
    if (posture === 'seated') {
      const key=home.pick(raycaster);
      if(key==='cat' && cat){
        deskAction='cat'; deskStatus=cat.react(!paused) || '猫がこちらを向きました。'; deskActionSequence++;
        revision++;wake();emit(true);return;
      }
      if(!key)return;
      if(Object.hasOwn(home.deskActions.getState(),key))interactDesk(key);
      else announceSubject(key,'select');
      return;
    }
    const roots = (landmarks?.targets || []).map(t => t.object).filter(object=>object.visible); if (!region && cat?.model) roots.push(cat.group);
    // Wall/furniture intersections occlude selectable geometry outside the home.
    const hits = raycaster.intersectObjects(region ? roots : [home.group, ...roots], true);
    const hit = hits.find(h => h.object.visible && !(Array.isArray(h.object.material) ? h.object.material.every(m => m.transparent && m.opacity < .15) : h.object.material?.transparent && h.object.material.opacity < .15));
    if (!hit) return;
    let id; for (let object = hit.object; object; object = object.parent) if (object.userData.targetId) { id = object.userData.targetId; break; }
    if (!id) return;
    if (id.startsWith('landmark-') || id === 'cat') focus(id);
    onSelect(id);
  }
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || postureTransition) return;
    hoverEvent = undefined;
    canvas.style.cursor = '';canvas.focus?.({ preventScroll: true }); canvas.setPointerCapture?.(event.pointerId);
    activePointers.add(event.pointerId); if (activePointers.size > 1) { moved = true; return; }
    if (dragging) return; wake(); dragging = { id: event.pointerId, x: event.clientX, y: event.clientY }; down = { ...dragging }; moved = false;
  });
  listen(canvas, 'pointermove', event => {
    if (!dragging) {
      if (posture === 'seated' && event.pointerType === 'mouse') {
        hoverEvent = event; wake();
      }
      return;
    }
    if (dragging.id !== event.pointerId || activePointers.size > 1) return;
    if (!moved && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) return;
    moved = true;
    look(-(event.clientX - dragging.x) / width * 2.7, (event.clientY - dragging.y) / height * 1.7);
    dragging.x = event.clientX; dragging.y = event.clientY;
  });
  function endPointer(event, cancel = false) {
    activePointers.delete(event.pointerId);
    if (!dragging || dragging.id !== event.pointerId) return;
    if (!cancel && !moved && down) select(event);
    dragging = down = null; if (cancel) stopMovement();
  }
  listen(canvas, 'pointerleave', () => { hoverEvent = undefined; canvas.style.cursor = ''; announceSubject(null,'hover'); });
  listen(canvas, 'pointerup', event => endPointer(event)); listen(canvas, 'pointercancel', event => endPointer(event, true)); listen(canvas, 'lostpointercapture', event => endPointer(event, true));
  listen(canvas, 'wheel', event => { if (event.ctrlKey || event.metaKey || postureTransition) return; event.preventDefault(); zoom(clamp(event.deltaY, -300, 300)); }, { passive: false });
  const keyMovement = () => setMovement({ forward: Number(pressed.has('w') || pressed.has('arrowup')) - Number(pressed.has('s') || pressed.has('arrowdown')), right: Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft')), sprint: pressed.has('shift') });
  listen(canvas, 'keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (posture === 'seated') {
      if (key.startsWith('arrow')) {
        event.preventDefault();
        look((Number(key === 'arrowleft') - Number(key === 'arrowright')) * .055,
          (Number(key === 'arrowup') - Number(key === 'arrowdown')) * .045);
      } else if (['+', '=', '-'].includes(key)) { event.preventDefault(); zoom(key === '-' ? 1 : -1); }
      else if (key === 'home') {
        event.preventDefault(); const view = navigation.getState();
        look(angle(seatedSpawn.yaw - view.yaw), seatedSpawn.pitch - view.pitch);
        seatedZoom = 0; updateProjection(); revision++; wake();
      }
      return;
    }
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)) { event.preventDefault(); pressed.add(key); keyMovement(); }
    else if (key === 'q' || key === 'e') { event.preventDefault(); look(key === 'q' ? .13 : -.13, 0); }
    else if (key === 'r' || key === 'f') { event.preventDefault(); look(0,key==='r' ? .10 : -.10); }
    else if (key === 'escape') { event.preventDefault(); cancelRegionLoad();pendingGardenArrival=false; stopMovement(); }
    else if (key === 'home') { event.preventDefault(); returnHome(); }
  });
  listen(window, 'keyup', event => { if (pressed.delete(event.key.toLowerCase())) { keyMovement(); revision++; } });
  // Hiding a loading note, loading a typeface or wrapping toolbar text can
  // change the canvas size without changing the browser window.
  const sizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (!disposed && (width !== canvas.clientWidth || height !== canvas.clientHeight)) resize();
  });
  sizeObserver?.observe(canvas);
  listen(window, 'blur', stopMovement); listen(canvas, 'blur', stopMovement); listen(window, 'resize', resize);
  listen(document, 'visibilitychange', () => { visible = !document.hidden; stopMovement(); suspendFrames(); if (visible) { revision++; wake(); } });
  function setRenderingActive(value) {
    const next=!!value;if(disposed||next===renderingActive)return;
    renderingActive=next;suspendFrames();
    if(next&&visible){revision++;wake();}
    else stopMovement();
    emit();
  }
  function setStudyActive(value) {
    if(disposed || studyActive===!!value)return;
    if (!value) cancelRegionLoad();
    studyActive=!!value;if(!studyActive)pendingSubject=null;
    if(studyActive){releaseWaiters();revision++;wake();}
    else {hoverEvent = undefined;stopMovement();suspendFrames();announceSubject(null,'hover');}
  }
  function dispose() {
    if (disposed) return; disposed = true;cancelRegionLoad();regionalScene?.dispose?.();releaseWaiters();finishPaint?.(); sizeObserver?.disconnect(); abort.abort(); suspendFrames(); cancelAnimationFrame(paintRaf); clearTimeout(paintTimer); listeners.forEach(remove => remove()); navigation.dispose();home.dispose?.(); sash.dispose();skyOwner.dispose(); renderer.dispose();
  }
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); dispose(); onError(new Error('World graphics context lost')); });
  applyTime(true); resize(); draw(0, true);firstFrameReady=true; onReady(); onProgress({ phase: 'home' }); emit(true); raf = requestAnimationFrame(animate);
  const afterPaint = () => new Promise(resolve => { finishPaint=resolve; paintRaf = requestAnimationFrame(() => { paintRaf = 0; paintTimer = setTimeout(() => { paintTimer = 0; resolve(); }, 0); }); });
  afterPaint().then(async () => {
    finishPaint=null;if(disposed||(!studyActive&&!await waitForStudy()))return;
    // Cat decoding and desk architecture have independent lifetimes. Neither
    // waits for a garden factory, surface image, or the other asset to finish.
    Promise.resolve().then(async ()=>{
      if(disposed||(!studyActive&&!await waitForStudy()))return;
      const [{createBlenderCat},{loadBlenderAsset}]=await Promise.all([import('./blender-cat.js'),import('./blender-assets.js')]);
      const actor=await createBlenderCat(T,{load:loadBlenderAsset,signal:abort.signal,invalidate});
      if(disposed||(!studyActive&&!await waitForStudy())){actor.dispose();return;}
      cat=home.attachCat(actor);sharpenTextures(cat.group);applyCatShadowPolicy();invalidate();emit();onProgress({phase:'cat'});
    }).catch(error=>{if(!disposed&&error.name!=='AbortError')console.warn('Room cat unavailable:',error);});
    home.loadMiniatures().then(async ready=>{
      if(disposed||(!studyActive&&!await waitForStudy()))return;
      miniaturesReady=ready;sharpenTextures(home.group);invalidate();emit();onProgress({phase:'miniatures'});
    }).catch(error=>{if(!disposed)console.warn('Desk landmarks unavailable:',error);});
    // Landscape and architecture are requested only when the visitor enters
    // the garden. Desk readers never pay to decode geometry they cannot see.
  }).catch(error=>{if(!disposed)onError(error);});
  return {
    getState: state, getPerformance: () => ({...performanceStats,outdoorsReady,miniaturesReady}), setRenderingActive, setStudyActive, interactDesk, prewarmExterior, standUp, sitDown, focus, leave, returnHome, explorePlace, goToLandmark, reset: returnHome, zoom, setMovement, look, stopMovement,
    setPaused(value) { paused = !!value; revision++; wake(); emit(); },
    setLightingMode(value) {
      if (!['day','night','auto'].includes(value)) return;
      lightingMode=value;applyTime(true);emit();
    },
    dispose,
  };
}
