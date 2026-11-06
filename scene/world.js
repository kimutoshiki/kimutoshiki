import * as T from './world-three.js';
import { createWorldLandscape } from './world-landscape.js';
import { createWorldNavigation } from './world-navigation.js';

const clamp = T.MathUtils.clamp;
const pixelRatio = (w, h) => Math.min(globalThis.devicePixelRatio || 1, 1.75, Math.max(1, Math.sqrt(2100000 / Math.max(1, w * h))));

/** Render terrain immediately. Architecture, surface maps and the cat have
 * separate, cancellable lifetimes and never gate the HTML/poster/navigation. */
export async function mountWorld({ canvas, onReady = () => {}, onError = () => {}, onSelect = () => {}, onProgress = () => {}, rendererFactory, rendererContext, loadLandmarks, loadCat, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  let renderer;
  try {
    renderer = rendererFactory ? rendererFactory(canvas) : new T.WebGLRenderer({ canvas, context: rendererContext, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error);
    return { getState: () => ({ webgl: false, catReady: false, landmarksReady: false }), dispose() {} };
  }
  let disposed = false, paused = reducedMotion, visible = !document.hidden, ready = false, raf = 0, paintRaf = 0, paintTimer = 0, lastDraw = 0, time = 0, previousMs = 0, lastShadow = -1000;
  let landmarks, cat, surfaces, catRevision = 0, seenCatRevision = 0, revision = 1, lastState = '', shadowDirty = true, lightingMode = 'day', focusId = 'world';
  const abort = new AbortController(), listeners = [], targets = new Map(), navigation = createWorldNavigation(T);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(43, 1, .1, 1800);
  const landscape = createWorldLandscape(T); scene.add(landscape.group);
  scene.fog = new T.FogExp2('#93a9b2', .0036);
  // A tiny original sky supplies broad reflected highlights without an HDR.
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 256; skyCanvas.height = 128;
  const skyContext = skyCanvas.getContext('2d'), skyGradient = skyContext.createLinearGradient(0, 0, 0, 128);
  skyGradient.addColorStop(0, '#183044'); skyGradient.addColorStop(.44, '#9db5bd'); skyGradient.addColorStop(.51, '#ded0ad'); skyGradient.addColorStop(.62, '#71959d'); skyGradient.addColorStop(1, '#183c4b');
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 256, 128);
  skyContext.fillStyle = '#fff2d4'; skyContext.fillRect(53, 34, 16, 12);
  const sky = new T.CanvasTexture(skyCanvas); sky.mapping = T.EquirectangularReflectionMapping; sky.colorSpace = T.SRGBColorSpace;
  scene.background = sky; scene.environment = sky; scene.environmentIntensity = .38;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const sun = new T.DirectionalLight('#ffdeb0', 3.2); sun.position.set(-30, 55, 30); sun.target.position.set(0, 0, 0); sun.castShadow = true;
  const resolution = Math.min(2048, renderer.capabilities?.maxTextureSize || 2048); sun.shadow.mapSize.set(resolution, resolution);
  Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 40, bottom: -40, near: 1, far: 180 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 2;
  const hemisphere = new T.HemisphereLight('#bddeed', '#293238', .8), ambient = new T.AmbientLight('#dde8ea', .12);
  scene.add(sun, sun.target, hemisphere, ambient);
  const raycaster = new T.Raycaster(), pointer = new T.Vector2(), catPoint = new T.Vector3();
  let width = 1, height = 1, dragging = null, moved = false, down = null;
  const fingers = new Map(); let pinch = 0;
  function state() { return { webgl: true, catReady: !!cat?.model, landmarksReady: !!landmarks, focus: focusId, paused, lightingMode }; }
  function emit() { canvas.dispatchEvent(new CustomEvent('worldstate', { detail: state() })); }
  function listen(target, name, handler, options) { target.addEventListener(name, handler, options); listeners.push(() => target.removeEventListener(name, handler, options)); }
  function resize() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
    const ratio = pixelRatio(width, height);
    if (renderer.getPixelRatio?.() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); navigation.resize(camera.aspect); revision++;
  }
  function draw(ms, force = false) {
    if (disposed || !visible) return;
    const moving = !paused, delta = previousMs ? Math.min((ms - previousMs) / 1000, .075) : .016; previousMs = ms;
    if (moving) { time += delta; landscape.update(time, true); }
    const catMoved = cat?.update(delta, moving);
    if (catRevision !== seenCatRevision) { seenCatRevision = catRevision; revision++; shadowDirty = true; }
    if (focusId === 'cat' && cat?.model) { cat.group.getWorldPosition(catPoint); catPoint.y += 1.0; navigation.follow(catPoint); }
    const view = navigation.update(); camera.position.copy(view.position); camera.lookAt(view.target); camera.updateMatrixWorld();
    const key = [revision, view.position.x, view.position.y, view.position.z, view.target.x, view.target.y, view.target.z, width, height].join(',');
    if (force || moving || catMoved || key !== lastState) {
      if (shadowDirty || (catMoved && ms - lastShadow >= 100)) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; lastShadow = ms; }
      renderer.render(scene, camera); lastState = key;
    }
  }
  function animate(ms) {
    if (disposed || !visible) return;
    raf = requestAnimationFrame(animate);
    if (ms - lastDraw < 32) return; lastDraw = ms; draw(ms);
  }
  function focus(id) {
    if (disposed) return;
    if (id === 'world') { focusId = 'world'; navigation.reset(); cat?.useRoomDetail(); }
    else if (id === 'cat' && cat?.model) {
      cat.group.getWorldPosition(catPoint); const box = new T.Box3().setFromCenterAndSize(catPoint.clone().add(new T.Vector3(0, 1, 0)), new T.Vector3(3.3, 2.3, 3.3));
      focusId = 'cat'; navigation.focus('cat', box); cat.react(); cat.ensureDetail();
    } else if (targets.has(id)) {
      focusId = id; navigation.focus(id, new T.Box3().setFromObject(targets.get(id).object));
      cat?.useRoomDetail();
    } else return;
    revision++; emit();
  }
  function select(event) {
    if (!ready) return;
    const bounds = canvas.getBoundingClientRect(); pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const roots = [...targets.values()].map(target => target.object); if (cat?.model) roots.push(cat.group);
    const hit = raycaster.intersectObjects(roots, true)[0]; if (!hit) return;
    let id; for (let object = hit.object; object; object = object.parent) if (object.userData.targetId) { id = object.userData.targetId; break; }
    if (id) { focus(id); onSelect(id); }
  }
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || !ready) return; canvas.setPointerCapture?.(event.pointerId); fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 1) { dragging = { x: event.clientX, y: event.clientY }; down = { ...dragging }; moved = false; }
    else { const [a, b] = [...fingers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; dragging = null; }
  });
  listen(canvas, 'pointermove', event => {
    if (!fingers.has(event.pointerId)) return; fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size >= 2) { const [a, b] = [...fingers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0) navigation.zoom(-Math.log(distance / pinch) / .18); pinch = distance; revision++; return; }
    if (!dragging) return;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) moved = true;
    navigation.rotate((event.clientX - dragging.x) / width * 3.0, (event.clientY - dragging.y) / height * 1.4); dragging = { x: event.clientX, y: event.clientY }; revision++;
  });
  function endPointer(event, cancel = false) {
    if (!fingers.has(event.pointerId)) return; fingers.delete(event.pointerId);
    if (!cancel && !moved && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) select(event);
    down = null; pinch = 0; dragging = fingers.values().next().value || null; if (dragging) moved = true;
  }
  listen(canvas, 'pointerup', event => endPointer(event)); listen(canvas, 'pointercancel', event => endPointer(event, true)); listen(canvas, 'lostpointercapture', event => endPointer(event, true));
  listen(canvas, 'wheel', event => { if (event.ctrlKey || event.metaKey || !ready) return; event.preventDefault(); navigation.zoom(clamp(event.deltaY * (event.deltaMode === 1 ? 16 : 1), -300, 300) * .008); revision++; }, { passive: false });
  listen(canvas, 'keydown', event => {
    if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Escape', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape' || event.key === 'Home') focus('world');
    else if (event.key === '+' || event.key === '=') navigation.zoom(-.7);
    else if (event.key === '-') navigation.zoom(.7);
    else navigation.rotate(event.key === 'ArrowLeft' ? -.13 : event.key === 'ArrowRight' ? .13 : 0, event.key === 'ArrowUp' ? -.09 : event.key === 'ArrowDown' ? .09 : 0);
    revision++;
  });
  listen(window, 'resize', resize);
  listen(document, 'visibilitychange', () => { visible = !document.hidden; cancelAnimationFrame(raf); previousMs = 0; if (visible && !disposed) { revision++; raf = requestAnimationFrame(animate); } });
  function dispose() {
    if (disposed) return; disposed = true; abort.abort(); cancelAnimationFrame(raf); cancelAnimationFrame(paintRaf); clearTimeout(paintTimer); listeners.forEach(remove => remove());
    surfaces?.dispose(); cat?.dispose(); landmarks?.dispose(); landscape.dispose(); sky.dispose(); renderer.dispose();
  }
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); dispose(); onError(new Error('World graphics context lost')); });
  resize(); draw(0, true); // No await, cat request, photograph or font before this frame.
  raf = requestAnimationFrame(animate); onProgress({ phase: 'landscape' });
  const afterPaint = () => new Promise(resolve => { paintRaf = requestAnimationFrame(() => { paintRaf = 0; paintTimer = setTimeout(() => { paintTimer = 0; resolve(); }, 0); }); });
  afterPaint().then(async () => {
    if (disposed) return;
    const factory = loadLandmarks || (await import('./world-landmarks.js')).createWorldLandmarks;
    const result = await factory(T);
    if (disposed) { result.dispose?.(); return; }
    landmarks = result; scene.add(result.group); result.targets.forEach(target => targets.set(target.id, target));
    navigation.setObstacles(result.targets.map(target => ({ id: target.id, box: new T.Box3().setFromObject(target.object) }))); revision++; shadowDirty = true;
    draw(performance.now(), true); ready = true; emit(); onReady(); onProgress({ phase: 'architecture' });
    // Surface refinement and the original animated cat start after the useful
    // hero frame. A failed detail request cannot cover the working world.
    import('./surface-materials.js').then(({ loadSurfaceMaterials }) => {
      if (disposed) return; surfaces = loadSurfaceMaterials(T, result.group, { anisotropy: renderer.capabilities?.getMaxAnisotropy?.() || 1, onLoad() { revision++; } });
    }).catch(error => console.warn('World surface refinement unavailable:', error));
    try {
    const [{ createRoomCat }, { loadWorldCat }] = await Promise.all([import('./cat-life.js'), loadCat ? Promise.resolve({ loadWorldCat: loadCat }) : import('./world-cat-loader.js')]);
    if (disposed) return;
    const holder = new T.Group(); holder.name = 'Original tabby · coastal promenade'; holder.position.z = 13; holder.scale.setScalar(10 / 3); scene.add(holder);
    cat = createRoomCat(T, { group: holder, floorY: .052 / (10 / 3), contactY: .051 / (10 / 3), route: [[-.8, 0], [-.4, -.7], [.6, -.4], [1.2, .3], [.4, 1], [-.7, .8]], loadDetail: () => loadWorldCat('full', { signal: abort.signal }), onAssetChange() { catRevision++; revision++; shadowDirty = true; } });
    cat.group.userData.targetId = 'cat';
    loadWorldCat('world', { signal: abort.signal }).then(asset => { if (cat.installAsset(asset)) { revision++; shadowDirty = true; emit(); } }).catch(error => { if (!disposed && error.name !== 'AbortError') console.warn('World cat could not load:', error); });
    } catch (error) { if (!disposed) console.warn('World cat module unavailable:', error); }
  }).catch(error => { if (!disposed) onError(error); });
  return {
    getState: state, focus, reset() { focus('world'); }, zoom(delta) { navigation.zoom(delta); revision++; },
    setPaused(value) { paused = !!value; revision++; emit(); },
    setLightingMode(value) {
      if (!['day', 'night', 'auto'].includes(value)) return; lightingMode = value;
      const night = value === 'night' || value === 'auto' && (new Date().getHours() < 6 || new Date().getHours() >= 19);
      sun.intensity = night ? .7 : 3.2; sun.color.set(night ? '#b2ccf2' : '#ffdeb0'); hemisphere.intensity = night ? .32 : .8; ambient.intensity = night ? .08 : .12; scene.environmentIntensity = night ? .22 : .38; scene.backgroundIntensity = night ? .2 : 1; renderer.toneMappingExposure = night ? .82 : 1.08; scene.fog.color.set(night ? '#324b60' : '#93a9b2'); revision++; shadowDirty = true; emit();
    },
    dispose,
  };
}
