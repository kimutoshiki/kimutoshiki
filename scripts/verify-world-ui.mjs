import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

const source = await readFile(new URL('../js/world-ui.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const canvasMarkup = html.match(/<canvas\b(?=[^>]*\bid="world-canvas")[^>]*>/)?.[0];
assert.match(canvasMarkup || '', /tabindex="-1"/); assert.match(canvasMarkup, /aria-hidden="true"/);
const navigation = html.match(/<nav\b(?=[^>]*\bid="walking-navigation")[^>]*>([\s\S]*?)<\/nav>/)?.[1];
const links = [...(navigation || '').matchAll(/<a\b[^>]*?\bhref="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
assert.deepEqual(links.map(match => match[1]), ['profile.html', 'research.html', 'blog.html', 'photos.html', 'contact.html']);
assert(links.every(match => match[2].trim()), 'All five native page links retain accessible names');
const seatedMenu = html.match(/<nav\b(?=[^>]*\bid="home-menu")[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
assert.deepEqual([...seatedMenu.matchAll(/<a\b[^>]*?\bhref="([^"]+)"/g)].map(match => match[1]), links.map(match => match[1]), 'The seated home exposes the same five native pages');
assert.match(html, /data-display-mode="2d"/, 'The server markup opens in two dimensions');
for (const width of [640, 960, 1536]) assert.match(html, new RegExp('study-' + width + '\\.webp'));
const picture = html.match(/<img\b(?=[^>]*\bid="study-image")[^>]*>/)?.[0] || '';
assert.match(picture, /\ssrcset="[^"]+"/);
assert.match(picture, /\ssrc="[^"]+\.webp(?:\?[^"]*)?"/, 'The illustration has a native source before JavaScript runs');
assert.equal((html.match(/data-illustration-link=/g) || []).length, 5);
assert.match(html, /id="world-live-controls"[^>]*\bhidden/);
assert.match(html, /id="world-travel"[^>]*\bdisabled/);
for (const id of ['home-menu', 'home-intro', 'world-stand', 'world-seat']) assert.match(html, new RegExp(`id="${id}"`));
assert.equal((html.match(/data-world-focus=/g) || []).length, 5);
assert.equal((html.match(/data-walk=/g) || []).length, 4);
const rendererImport = /import\(url\)/g;
assert.match(source, /const url = ['"]\.\.\/scene\/world\.bundle\.js/);
const gardenImport = /import\(['"]\.\/study-tour\.js[^'"]*['"]\)/g;
assert.equal([...source.matchAll(rendererImport)].length, 2, 'The GPU and CPU renderers each have a lazy import boundary');
assert.equal([...source.matchAll(gardenImport)].length, 1, 'The photograph tour has its own dynamic import boundary');
const executable = source.replace(rendererImport, 'testImport(url)').replace(gardenImport, 'testTourImport()');
const emit = (target, type, values = {}) => {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
};
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

function harness({ context = 'supported', reduced = false, importFails = false, softwareFails = false, observeViewport = false } = {}) {
  const ids = new Map(), focusButtons = [], walkButtons = [], deskButtons = [], toggleQueue = new Set();
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null });
  class Element extends EventTarget {
    hidden = false; disabled = false; tabIndex = -1; textContent = ''; dataset = {}; attributes = new Map(); captures = new Set();
    constructor() {
      super(); const classes = new Set();
      this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle: (name, force) => { const add = force ?? !classes.has(name); if (add) classes.add(name); else classes.delete(name); return add; } };
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    get open() { return !!this._open; }
    set open(value) { if (this.open !== !!value) { this._open = !!value; toggleQueue.add(this); } }
    focus() { if (document.activeElement !== this) { if (document.activeElement) emit(document.activeElement, 'blur'); document.activeElement = this; } }
    setPointerCapture(id) { this.captures.add(id); }
    querySelector(selector) { assert(['summary', 'small'].includes(selector)); return this[selector] ||= new Element(); }
  }
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const tag = match[0], id = tag.match(/\bid="([^"]+)"/)?.[1], focus = tag.match(/\bdata-world-focus="([^"]+)"/)?.[1], walk = tag.match(/\bdata-walk="([^"]+)"/)?.[1];
    const deskAction = tag.match(/\bdata-desk-action="([^"]+)"/)?.[1];
    if (!id && !focus && !walk && !deskAction) continue;
    const element = new Element(); element.hidden = /\shidden(?:\s|>)/.test(tag); element.disabled = /\sdisabled(?:\s|>)/.test(tag);
    for (const attribute of tag.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attribute[1], attribute[2]);
    for (const name of (element.attributes.get('class') || '').split(/\s+/).filter(Boolean)) element.classList.add(name);
    if (element.attributes.has('tabindex')) element.tabIndex = Number(element.attributes.get('tabindex'));
    if (id) ids.set(id, element);
    if (deskAction) { element.dataset.deskAction = deskAction; deskButtons.push(element); }
    if (focus) { element.dataset.worldFocus = focus; focusButtons.push(element); }
    if (walk) { element.dataset.walk = walk; walkButtons.push(element); }
  }
  const byId = id => { assert(ids.has(id), `Requested HTML element ${id} exists`); return ids.get(id); };
  const selected = new Map(['.skip-link'].map(selector => [selector, new Element()]));
  Object.assign(document, { getElementById: byId, querySelector: selector => { assert(selected.has(selector), `Known document selector ${selector}`); return selected.get(selector); }, querySelectorAll: selector => { if (selector === '[data-world-focus]') return focusButtons; if (selector === '[data-walk]') return walkButtons; if (selector === '[data-desk-action]') return deskButtons; throw new Error('Unexpected selector: ' + selector); } });
  const window = new EventTarget(), media = Object.assign(new EventTarget(), { matches: reduced });
  const frames = new Map(), tasks = new Map(), warnings = [], calls = [];
  const observers = [];
  let nextId = 0, imports = 0, contextRequests = 0, softwareImports = 0, tourOptions, mountOptions, resolveMount, launch, now = 0;
  const rendererContext = {
    RENDERER:0x1f01,
    getExtension(name) {
      if(name==='WEBGL_debug_renderer_info' && context!=='softpipe-generic')return {UNMASKED_RENDERER_WEBGL:0x9246};
      return null;
    },
    getParameter(parameter){
      if(parameter===0x9246&&context==='swiftshader')return 'ANGLE (Google, Vulkan 1.3.0 SwiftShader Device (Subzero))';
      if(parameter===this.RENDERER&&context==='softpipe-generic')return 'Mesa softpipe';
      return 'Intel Iris Xe Graphics';
    },
  };
  byId('world-canvas').getContext = (kind, options) => {
    contextRequests++; assert.equal(kind, 'webgl2'); same(options, { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (context === 'throw') throw new Error('Simulated GPU creation error');
    return context === 'null' ? null : rendererContext;
  };
  const engineState = { deskProps: { notebook: false, lamp: true, drawer: false, letter: false }, deskActionSequence: 0, catReady: false, landmarksReady: false, outdoorsReady: false, paused: reduced, lightingMode: 'auto', focus: 'room', mode: 'inside', travel: false, seated: true };
  const record = (name, value) => calls.push({ name, value });
  window.addEventListener('resize', () => record('resize'));
  const engine = {
    getState: () => ({ ...engineState }),
    interactDesk(id) {
      if (!engineState.seated || !Object.hasOwn(engineState.deskProps, id)) return false;
      record('interactDesk', id);
      engineState.deskProps = { ...engineState.deskProps, [id]: !engineState.deskProps[id] };
      notify({ deskAction: id, deskStatus: '操作しました', deskActionSequence: engineState.deskActionSequence + 1 });
      return true;
    },
    explorePlace(key) { record('explorePlace', key); notify({ seated: false, standing: true, posture: 'walking', mode: 'outside', focus: 'landmark-' + key, district: '唐津城・本丸', outdoorsReady: true, landmarksReady: true }); },
    standUp() { record('standUp'); Object.assign(engineState, { seated: false, standing: true, posture: 'walking', mode: 'inside' }); return true; },
    prewarmExterior() { record('prewarmExterior'); return Promise.resolve(); },
    setRenderingActive(value) { record('setRenderingActive', value); },
    setStudyActive(value) { record('setStudyActive', value); },
    sitDown() { record('sitDown'); Object.assign(engineState, { travel: true, posture: 'sitting-down', focus: 'room' }); return true; },
    leave() { record('leave'); Object.assign(engineState, { travel: true, focus: 'room' }); },
    returnHome() { record('returnHome'); Object.assign(engineState, { travel: true, focus: 'room' }); },
    stopMovement() { record('stopMovement'); engineState.travel = false; },
    focus(id) { record('focus', id); Object.assign(engineState, { focus: id, travel: true }); },
    setMovement(vector) { record('setMovement', { ...vector }); },
    setPaused(value) { record('setPaused', value); engineState.paused = value; },
    setLightingMode(value) { record('setLightingMode', value); engineState.lightingMode = value; },
    dispose() { record('dispose'); },
  };
  const epoch = Date.UTC(2026, 10, 6, 18, 5);
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [epoch + now])); } static now() { return epoch + now; } }
  const scope = createContext({ document, window, Event, CustomEvent: class extends Event { constructor(type, options = {}) { super(type, options); this.detail = options.detail; } }, Date: ClockDate, matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; },
    ...(observeViewport ? { IntersectionObserver: class {
      constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    } } : {}),
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay = 0) => { tasks.set(++nextId, { callback, at: now + delay }); return nextId; }, clearTimeout: id => tasks.delete(id),
    setInterval: (callback, interval) => { tasks.set(++nextId, { callback, at: now + interval, interval }); return nextId; }, clearInterval: id => tasks.delete(id),
    console: { warn: (...values) => warnings.push(values) },
    testTourImport: async () => {
      record('tourImport');
      return { createGardenTour: (button, options) => {
        assert.equal(button, byId('world-stand')); tourOptions = options;
        return { open() { record('tourOpen'); }, destroy() { record('tourDestroy'); } };
      } };
    },
    testImport: async url => {
      const software = url.startsWith('./blender-software-world.js');
      if (software) {
        softwareImports++; record('softwareURL', url);
        if (softwareFails) throw new Error('Simulated CPU module failure');
      } else {
        assert.match(url, /^\.\.\/scene\/world\.bundle\.js/); record('engineURL', url); imports++;
        if (importFails === true || (importFails === 'once' && imports === 1)) throw new Error('Simulated GPU module failure');
      }
      const mount = options => {
        mountOptions = options; assert.equal(options.canvas, byId('world-canvas'));
        if (!software) assert.equal(options.rendererContext, rendererContext);
        Object.assign(engineState, { webgl: !software, renderer: software ? 'software' : 'native', seated: true, travel: false });
        return new Promise(resolve => { resolveMount = resolve; });
      };
      return software ? { mountSoftwareWorld: mount } : { mountWorld: mount };
    },
  });
  new Script(executable).runInContext(scope);
  function runFrame() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } }
  async function runTask() { for (const [id, task] of [...tasks]) if (task.at <= now) { tasks.delete(id); launch = task.callback(); } await tick(); }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; tasks.delete(next[0]);
      if (next[1].interval) tasks.set(next[0], { ...next[1], at: now + next[1].interval });
      next[1].callback(); await tick();
    }
    now = end;
  }
  async function select3d() { emit(byId('study-mode-3d'), 'click'); runFrame(); await runTask(); await tick(); }
  function select2d() { emit(byId('study-mode-2d'), 'click'); }
  async function attach() { assert(resolveMount); resolveMount(engine); await launch; await tick(); }
  function notify(next) { Object.assign(engineState, next); emit(byId('world-canvas'), 'worldstate', { detail: { ...engineState } }); }
  function flushToggles() { for (let count = 0; toggleQueue.size; count++) { assert(count < 10); const pending = [...toggleQueue]; toggleQueue.clear(); for (const target of pending) emit(target, 'toggle'); } }
  async function requestStand() { emit(byId('world-stand'), 'click'); runFrame(); await runTask(); await tick(); }
  return { byId, focusButtons, walkButtons, deskButtons, select3d, select2d, document, window, media, warnings, calls, engine, engineState, runFrame, runTask, advance, attach, notify, flushToggles, requestStand, selected, observers,
    get pendingFrames() { return frames.size; },
    get imports() { return imports; }, get softwareImports() { return softwareImports; }, get tourOptions() { return tourOptions; }, get contextRequests() { return contextRequests; }, get options() { return mountOptions; },
    async finishUnsupported() { await launch; }, count: name => calls.filter(call => call.name === name).length,
    lastMovement: () => calls.filter(call => call.name === 'setMovement').at(-1)?.value,
    pad: direction => walkButtons.find(button => button.dataset.walk === direction),
  };
}
function assertUnavailable(h) {
  assert(h.byId('world-live-controls').hidden); assert(h.byId('world-help').hidden);
  assert.equal(h.byId('world-canvas').tabIndex, -1); assert.equal(h.byId('world-canvas').attributes.get('aria-hidden'), 'true');
  assert(h.byId('world-travel').disabled); assert(h.focusButtons.every(button => button.disabled)); assert(h.walkButtons.every(button => button.disabled));
}
function assertLanding(h) {
  assert(h.byId('world-live-controls').hidden && h.byId('world-help').hidden);
  assert(!h.byId('home-menu').hidden && !h.byId('home-intro').hidden, 'The seated home keeps its native menu and introduction');
  assert(!h.byId('main').classList.contains('is-walking'));
}
async function booted(options) {
  const h = harness(options); assertLanding(h);
  assert.equal(h.contextRequests, 0); assert.equal(h.imports, 0);
  h.runFrame(); await h.runTask(); await h.advance(2000);
  assert.equal(h.contextRequests, 0); assert.equal(h.imports, 0, 'Idle time on the 2D home never starts the 3D engine');
  await h.select3d(); assert.equal(h.imports, 1); assert.equal(h.contextRequests, 1);
  emit(h.byId('world-stand'), 'click'); emit(h.byId('world-stand'), 'click'); assert.equal(h.imports, 1, 'Repeated stand input during startup cannot mount another engine');
  assert.equal(h.options.seated, true); assert.equal(h.options.autoTime, true);
  assertLanding(h);
  h.options.onReady();
  assert(h.byId('world-stand').disabled, 'onReady before the async mount resolves cannot enable unattached engine actions');
  assert(h.walkButtons.every(button => button.disabled));
  await h.attach();
  assert.equal(h.count('tourImport'), 0, 'WebGL never needs the photographic tour');
  assert.equal(h.count('standUp'), 0, 'Automatic engine startup stays seated until requested');
  assertLanding(h); assert(h.byId('main').classList.contains('is-rendered'), 'The initial home shows the actual seated WebGL frame');
  assert(!h.byId('world-stand').disabled);
  return h;
}
async function mounted(options) {
  const h = await booted(options);
  await h.requestStand();
  assert(h.deskButtons.every(button => button.disabled), 'Seated prop controls are disabled while walking');
  assert.equal(h.count('standUp'), 1); assert.equal(h.imports, 1); assert.equal(h.contextRequests, 1); assert.equal(h.count('dispose'), 0);
  assert(h.byId('main').classList.contains('is-walking'));
  assert(!h.byId('world-live-controls').hidden && !h.byId('world-help').hidden);
  assert(h.byId('home-menu').hidden && h.byId('home-intro').hidden, 'Walking exposes the scene without covering it with the seated home menus');
  assert.equal(h.byId('world-canvas').tabIndex, 0); assert(!h.byId('world-canvas').attributes.has('aria-hidden'));
  assert(h.byId('world-travel').disabled, 'Standing can finish before outdoor assets; travel remains gated');
  h.notify({ landmarksReady: true, outdoorsReady: false });
  assert(h.focusButtons.filter(button => button.dataset.worldFocus !== 'cat').every(button => button.disabled), 'Landmarks cannot be selected before the outdoor world is ready');
  h.notify({ landmarksReady: false, outdoorsReady: true });
  assert(!h.byId('world-travel').disabled); assert(h.walkButtons.every(button => !button.disabled));
  assert(h.focusButtons.every(button => button.disabled), 'Optional asset actions remain gated after the first paint');
  return h;
}

const clockOnly = harness(); assertLanding(clockOnly);
assert.equal(clockOnly.byId('world-clock').textContent, '03:05', 'The clock uses Japanese time rather than executor UTC');
assert.equal(clockOnly.byId('world-clock').attributes.get('datetime'), '2026-11-06T18:05:00.000Z');
assert.equal(clockOnly.byId('world-time-phase').textContent, '夜間');

await clockOnly.advance(60020); assert.equal(clockOnly.byId('world-clock').textContent, '03:06');
clockOnly.document.hidden = true; emit(clockOnly.document, 'visibilitychange'); await clockOnly.advance(240000);
assert.equal(clockOnly.byId('world-clock').textContent, '03:06', 'Hidden documents stop their clock timer');
clockOnly.document.hidden = false; emit(clockOnly.document, 'visibilitychange'); assert.equal(clockOnly.byId('world-clock').textContent, '03:10');
emit(clockOnly.window, 'pagehide', { persisted: true }); await clockOnly.advance(60000); assert.equal(clockOnly.byId('world-clock').textContent, '03:10');
emit(clockOnly.window, 'pageshow'); assert.equal(clockOnly.byId('world-clock').textContent, '03:11', 'Returning from the back-forward cache refreshes the clock');
await clockOnly.advance(9 * 60 * 60000);
assert.equal(clockOnly.byId('world-time-phase').textContent, '日中');

assert.equal(clockOnly.contextRequests, 0); assert.equal(clockOnly.imports, 0, 'The clock runs in 2D without a rendering engine');
emit(clockOnly.window, 'pagehide', { persisted: false }); const finalClock = clockOnly.byId('world-clock').textContent;
await clockOnly.advance(120000); emit(clockOnly.window, 'pageshow'); assert.equal(clockOnly.byId('world-clock').textContent, finalClock);

for (const context of ['null', 'throw']) {
  const h = harness({ context }); assertLanding(h);
  assert.equal(h.softwareImports, 0);
  await h.select3d(); await h.finishUnsupported();
  assert.equal(h.contextRequests, 1); assert.equal(h.softwareImports, 1); assert.equal(h.imports, 0);
  assert.equal(h.warnings.length, 0); assertUnavailable(h);
  h.options.onReady(); await h.attach();
  assert.equal(h.byId('main').dataset.displayMode, '3d');
  assert.equal(h.byId('world-stand').disabled, false);
  assert.match(h.byId('study-mode-status').textContent, /軽量3D/);
  await h.requestStand(); assert.equal(h.count('standUp'), 1);
  h.select2d(); await h.select3d();
  assert.equal(h.contextRequests, 1); assert.equal(h.softwareImports, 1, 'The same software engine resumes without probing the GPU again');
  emit(h.window, 'pagehide', { persisted: false });
}
for (const driver of ['swiftshader','softpipe-generic']){
  const active=await booted({context:driver});
  assert.equal(active.softwareImports,0,'A working WebGL2 context renders the original scene on any GPU driver');
  emit(active.window,'pagehide',{persisted:false});
}
const noCanvas = harness({ context: 'null', softwareFails: true });
await noCanvas.select3d(); await tick();
assert.equal(noCanvas.byId('main').dataset.displayMode, '2d'); assertUnavailable(noCanvas);
assert.match(noCanvas.byId('study-mode-status').textContent, /もう一度/);
assert.equal(noCanvas.warnings.length, 1);
const gardenOnly = harness();
await gardenOnly.requestStand();
assert.equal(gardenOnly.count('tourImport'), 1);
assert.equal(gardenOnly.count('tourOpen'), 1);
await gardenOnly.requestStand();
assert.equal(gardenOnly.count('tourImport'), 1, 'Opening the photograph tour again reuses its module');
assert.equal(gardenOnly.contextRequests, 0);
assert.equal(gardenOnly.imports, 0); assert.equal(gardenOnly.softwareImports, 0);
assert.equal(gardenOnly.byId('world-stand-label').textContent, '外をのぞいてみる');
gardenOnly.tourOptions.onExplore('karatsu-castle'); await tick();
await gardenOnly.attach(); gardenOnly.options.onReady(); await tick();
assert.equal(gardenOnly.count('explorePlace'), 1);
assert.equal(gardenOnly.byId('main').dataset.displayMode, '3d');
assert.equal(gardenOnly.byId('world-location-name').textContent, '唐津城・本丸');
assert(gardenOnly.byId('main').classList.contains('is-walking'));
const canceled = harness();
await canceled.select3d(); canceled.select2d(); canceled.options.onReady(); await canceled.attach();
assert.equal(canceled.byId('main').dataset.displayMode, '2d');
assert(!canceled.byId('main').classList.contains('is-rendered'), 'A mount resolving late never exposes a canceled 3D scene');
assertUnavailable(canceled);
const retained = await booted();
retained.select2d();
assert.equal(retained.byId('main').dataset.displayMode, '2d');
assert.equal(retained.calls.filter(call=>call.name==='setStudyActive').at(-1)?.value, false);
await retained.select3d();
assert.equal(retained.contextRequests, 1); assert.equal(retained.imports, 1);
assert(!retained.byId('world-stand').disabled);
const h = await mounted(), click = id => emit(h.byId(id), 'click');
const retry = await mounted();
retry.notify({ outdoorsReady: false, outdoorsError: true, outdoorsLoading: false, mode: 'inside', travel: false });
assert(!retry.byId('world-travel').disabled); assert.equal(retry.byId('world-travel-label').textContent, '屋外を再読み込み');
emit(retry.byId('world-travel'), 'click');
assert.equal(retry.count('prewarmExterior'), 1, 'A garden failure retries exterior loading through the existing engine');
assert.equal(retry.count('leave'), 0, 'Retry cannot start a walk into an unavailable garden');
assert.equal(retry.imports, 1); assert.equal(retry.count('dispose'), 0);
retry.notify({ outdoorsError: false, outdoorsLoading: true });
assert(retry.byId('world-travel').disabled); assert.equal(retry.byId('world-travel-label').textContent, '屋外を読み込み中…');
emit(retry.byId('world-travel'), 'click'); assert.equal(retry.count('prewarmExterior'), 1, 'Loading gates repeated retry clicks');
retry.notify({ outdoorsReady: true, outdoorsError: false, outdoorsLoading: false });
assert(!retry.byId('world-travel').disabled); assert.equal(retry.byId('world-travel-label').textContent, '外へ歩く');
emit(retry.byId('world-travel'), 'click'); assert.equal(retry.count('leave'), 1, 'Successful recovery restores ordinary outdoor walking');
const partial = await mounted();
partial.notify({ outdoorsReady: true, landmarksReady: false, outdoorsError: true, outdoorsLoading: false, mode: 'inside', travel: false });
assert(!partial.byId('world-retry-row').hidden && !partial.byId('world-retry').disabled, 'A partial architecture failure exposes its own retry action');
assert.equal(partial.byId('world-travel-label').textContent, '外へ歩く'); assert(!partial.byId('world-travel').disabled);
emit(partial.byId('world-travel'), 'click'); assert.equal(partial.count('leave'), 1); assert.equal(partial.count('prewarmExterior'), 0, 'Available ground remains walkable without invoking architecture retry');
partial.notify({ mode: 'outside', travel: false });
assert.equal(partial.byId('world-travel-label').textContent, '部屋へ戻る'); assert(!partial.byId('world-travel').disabled);
emit(partial.byId('world-travel'), 'click'); assert.equal(partial.count('returnHome'), 1, 'Failed architecture cannot replace or block the return-home action');
emit(partial.byId('world-retry'), 'click'); assert.equal(partial.count('prewarmExterior'), 1);
assert.equal(partial.count('leave'), 1); assert.equal(partial.count('returnHome'), 1);
partial.notify({ outdoorsLoading: true }); assert(partial.byId('world-retry').disabled);
emit(partial.byId('world-retry'), 'click'); assert.equal(partial.count('prewarmExterior'), 1, 'An architecture retry already loading cannot start again');
partial.notify({ landmarksReady: true, outdoorsLoading: false, outdoorsError: false, travel: false });
assert(partial.byId('world-retry-row').hidden, 'Successful architecture recovery removes the retry prompt');
emit(partial.byId('world-retry'), 'click'); assert.equal(partial.count('prewarmExterior'), 1, 'A hidden retry control cannot start an unnecessary request');
assert(partial.focusButtons.filter(button => button.dataset.worldFocus !== 'cat').every(button => !button.disabled));
assert.equal(partial.imports, 1); assert.equal(partial.count('dispose'), 0);
h.notify({ seated: false, posture: 'standing-up' }); assert(h.byId('world-travel').disabled && h.byId('world-seat').disabled); assert(h.walkButtons.every(button => button.disabled), 'Movement is gated during the stand-up transition');
h.notify({ seated: false, posture: 'walking' }); assert(!h.byId('world-travel').disabled);
assert.equal(h.byId('world-travel-label').textContent, '外へ歩く');
click('world-travel'); assert.equal(h.count('leave'), 1); assert.equal(h.byId('world-travel-label').textContent, '移動を止める');
assert(h.byId('world-travel').classList.contains('is-travelling')); assert.equal(h.document.activeElement, h.byId('world-canvas'));
assert.match(h.byId('world-status').textContent, /歩いています/);
click('world-travel'); assert.equal(h.count('stopMovement'), 1); assert.equal(h.byId('world-travel-label').textContent, '外へ歩く');
h.notify({ mode: 'outside', travel: false }); assert.equal(h.byId('world-location-name').textContent, '屋外'); assert.equal(h.byId('world-travel-label').textContent, '部屋へ戻る');
click('world-travel'); assert.equal(h.count('returnHome'), 1);
h.notify({ travel: false, catReady: true });
assert.equal(h.focusButtons.filter(button => !button.disabled).length, 1); assert(!h.focusButtons.find(button => button.dataset.worldFocus === 'cat').disabled);
const subjectLinks = { 'landmark-karatsu-castle': 'photos.html', 'landmark-karatsu-bank': 'blog.html', 'landmark-okuma-auditorium': 'research.html', 'landmark-okuma-statue': 'profile.html' };
const gated = h.focusButtons.find(button => button.dataset.worldFocus !== 'cat'); emit(gated, 'click'); assert.equal(h.count('focus'), 0);
h.notify({ landmarksReady: true }); assert(h.focusButtons.every(button => !button.disabled));
for (const button of h.focusButtons) {
  emit(button, 'click'); assert.equal(h.calls.filter(call => call.name === 'focus').at(-1).value, button.dataset.worldFocus);
  assert(!h.byId('world-caption').hidden); assert.match(h.byId('world-caption-name').textContent, /へ移動中$/);
  if (button.dataset.worldFocus === 'cat') assert(h.byId('world-caption-link').hidden);
  else { assert(!h.byId('world-caption-link').hidden); assert.equal(h.byId('world-caption-link').href, subjectLinks[button.dataset.worldFocus]); }
  h.notify({ travel: false }); assert(!h.byId('world-caption-name').textContent.includes('移動中'));
}
h.notify({ focus: 'room', mode: 'inside', travel: false }); assert(h.byId('world-caption').hidden);
emit(h.media, 'change', { matches: true }); assert(h.engineState.paused); assert.equal(h.byId('world-motion').attributes.get('aria-pressed'), 'true');
click('world-motion'); assert(!h.engineState.paused); const preferenceCalls = h.count('setPaused');
emit(h.media, 'change', { matches: true }); assert.equal(h.count('setPaused'), preferenceCalls, 'Explicit motion choice takes precedence over later system changes');
assert.equal(h.byId('world-motion-label').textContent, '動いています');
assert.equal(h.engineState.lightingMode, 'auto');
click('world-lighting'); assert.equal(h.engineState.lightingMode, 'day'); assert.match(h.byId('world-lighting-label').textContent, /昼/);
click('world-lighting'); assert.equal(h.engineState.lightingMode, 'night'); assert.match(h.byId('world-lighting-label').textContent, /夜/);
click('world-lighting'); assert.equal(h.engineState.lightingMode, 'auto');

let pointerId = 0;
function press(direction, extra = {}) { const target = h.pad(direction), id = ++pointerId; const event = emit(target, 'pointerdown', { pointerId: id, button: 0, ...extra }); return { target, id, event }; }
function release(press, type = 'pointerup') { emit(press.target, type, { pointerId: press.id }); }
for (const [direction, vector, end] of [ ['forward', { forward: 1, right: 0 }, 'pointerup'], ['back', { forward: -1, right: 0 }, 'pointercancel'], ['left', { forward: 0, right: -1 }, 'lostpointercapture'], ['right', { forward: 0, right: 1 }, 'pointerup'] ]) {
  const held = press(direction); assert(held.event.defaultPrevented); assert(held.target.captures.has(held.id)); assert(held.target.classList.contains('is-held')); same(h.lastMovement(), vector);
  release(held, end); same(h.lastMovement(), { forward: 0, right: 0 }); assert(!held.target.classList.contains('is-held'));
}
const forward = press('forward'), right = press('right'); same(h.lastMovement(), { forward: 1, right: 1 });
release(forward); same(h.lastMovement(), { forward: 0, right: 1 }); release(right); same(h.lastMovement(), { forward: 0, right: 0 });
const left = press('left'), opposite = press('right'); same(h.lastMovement(), { forward: 0, right: 0 }); release(left); release(opposite);
const beforeSecondary = h.count('setMovement'); const secondary = press('forward', { button: 2 }); assert(!secondary.event.defaultPrevented); assert.equal(h.count('setMovement'), beforeSecondary);
for (const key of [' ', 'Enter']) {
  const button = h.pad('forward'); button.focus(); assert(emit(button, 'keydown', { key }).defaultPrevented); same(h.lastMovement(), { forward: 1, right: 0 });
  assert(emit(button, 'keyup', { key }).defaultPrevented); same(h.lastMovement(), { forward: 0, right: 0 });
}
for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
  const before = h.count('setMovement'), values = { key: ' ', [modifier]: true };
  assert(!emit(h.pad('forward'), 'keydown', values).defaultPrevented, 'Browser-modified movement keys keep their native behavior');
  assert(!emit(h.pad('forward'), 'keyup', values).defaultPrevented, 'Unconsumed modified key releases keep their native behavior');
  assert.equal(h.count('setMovement'), before);
}
h.pad('left').focus(); emit(h.pad('left'), 'keydown', { key: 'Enter' }); h.byId('world-travel').focus(); same(h.lastMovement(), { forward: 0, right: 0 }, 'Keyboard movement stops when its button loses focus');
for (const kind of ['blur', 'visibilitychange']) {
  press('forward');
  if (kind === 'blur') emit(h.window, kind); else { h.document.hidden = true; emit(h.document, kind); h.document.hidden = false; }
  same(h.lastMovement(), { forward: 0, right: 0 }, `Held movement stops on ${kind}`);
}
// A details toggle event is queued by the browser. Its delayed close event must
// not cancel the route just started by a destination/travel button.
const places = h.byId('world-places'), settings = h.byId('world-settings');
places.open = true; h.flushToggles(); const stopsBeforeTravel = h.count('stopMovement'); click('world-travel'); h.flushToggles();
assert.equal(h.count('stopMovement'), stopsBeforeTravel); assert(h.engineState.travel, 'Closing an open panel cannot cancel its newly selected route');
places.open = true; h.flushToggles(); const stopsBeforeFocus = h.count('stopMovement'); emit(h.focusButtons[0], 'click'); h.flushToggles();
assert.equal(h.count('stopMovement'), stopsBeforeFocus); assert(h.engineState.travel);
press('forward'); settings.open = true; h.flushToggles(); same(h.lastMovement(), { forward: 0, right: 0 }); assert(!h.engineState.travel, 'Opening a panel stops movement');
places.open = true; h.flushToggles(); assert(!settings.open, 'Only one control panel opens at once');
emit(h.document, 'keydown', { key: 'Escape' }); h.flushToggles(); assert(!places.open && !settings.open); assert.equal(h.document.activeElement, places.summary); assert(!h.engineState.travel);
click('world-reset'); assert(h.engineState.travel); h.notify({ travel: false });
press('back'); const disposalsBeforeCache = h.count('dispose'); emit(h.window, 'pagehide', { persisted: true });
same(h.lastMovement(), { forward: 0, right: 0 }); assert.equal(h.count('dispose'), disposalsBeforeCache, 'Back-forward cache preserves the engine after stopping movement');
press('right'); emit(h.window, 'pagehide', { persisted: false }); same(h.lastMovement(), { forward: 0, right: 0 }); assert.equal(h.count('dispose'), disposalsBeforeCache + 1);

// Click-only assistive activation gets one bounded movement pulse. The fake
// clock checks its duration and proves canceled timers cannot stop newer input.
const assistive = await mounted();
const activate = direction => emit(assistive.pad(direction), 'click', { detail: 0 });
for (const [direction, vector] of [['forward', { forward: 1, right: 0 }], ['back', { forward: -1, right: 0 }], ['left', { forward: 0, right: -1 }], ['right', { forward: 0, right: 1 }]]) {
  activate(direction); same(assistive.lastMovement(), vector);
  await assistive.advance(179); same(assistive.lastMovement(), vector, 'The click-only nudge remains active for its bounded interval');
  await assistive.advance(1); same(assistive.lastMovement(), { forward: 0, right: 0 }, 'The assistive nudge stops at 180ms');
}
let beforeNudge = assistive.count('setMovement'); emit(assistive.pad('forward'), 'click', { detail: 1 }); assert.equal(assistive.count('setMovement'), beforeNudge, 'Pointer-generated clicks do not add another movement pulse');
for (const key of [' ', 'Enter']) {
  emit(assistive.pad('forward'), 'keydown', { key }); beforeNudge = assistive.count('setMovement'); activate('forward');
  assert.equal(assistive.count('setMovement'), beforeNudge, 'A click cannot duplicate held keyboard movement');
  emit(assistive.pad('forward'), 'keyup', { key }); beforeNudge = assistive.count('setMovement'); activate('forward');
  assert.equal(assistive.count('setMovement'), beforeNudge, 'The keyboard release click cannot restart movement');
  await assistive.advance(0);
}
emit(assistive.pad('forward'), 'keydown', { key: 'Enter' }); emit(assistive.pad('forward'), 'blur');
activate('forward'); same(assistive.lastMovement(), { forward: 1, right: 0 }, 'Losing keyboard focus does not permanently suppress assistive activation');
await assistive.advance(180);
activate('forward'); await assistive.advance(90); activate('right'); await assistive.advance(90);
same(assistive.lastMovement(), { forward: 0, right: 1 }, 'A new assistive direction replaces the previous nudge and timer');
await assistive.advance(90); same(assistive.lastMovement(), { forward: 0, right: 0 });
activate('forward'); emit(assistive.pad('left'), 'pointerdown', { pointerId: 90, button: 0 }); await assistive.advance(200);
same(assistive.lastMovement(), { forward: 0, right: -1 }, 'A canceled nudge timer cannot stop subsequent held pointer input');
emit(assistive.pad('left'), 'pointerup', { pointerId: 90 });
for (const cancel of [
  () => emit(assistive.window, 'blur'),
  () => emit(assistive.pad('forward'), 'blur'),
  () => { assistive.document.hidden = true; emit(assistive.document, 'visibilitychange'); assistive.document.hidden = false; },
  () => emit(assistive.document, 'pointerdown'),
  () => emit(assistive.document, 'keydown', { key: 'Tab' }),
  () => emit(assistive.document, 'click'),
  () => emit(assistive.byId('world-travel'), 'click'),
  () => emit(assistive.window, 'pagehide', { persisted: true }),
]) {
  activate('forward'); cancel(); same(assistive.lastMovement(), { forward: 0, right: 0 });
  const afterCancel = assistive.count('setMovement'); await assistive.advance(200);
  assert.equal(assistive.count('setMovement'), afterCancel, 'Canceled assistive timers cannot emit a late stop into a new route');
}
activate('forward'); emit(assistive.window, 'pagehide', { persisted: false }); same(assistive.lastMovement(), { forward: 0, right: 0 });
beforeNudge = assistive.count('setMovement'); activate('forward'); await assistive.advance(200); assert.equal(assistive.count('setMovement'), beforeNudge, 'Disposed controls cannot start an assistive nudge');

const failure = await mounted(); emit(failure.pad('forward'), 'click', { detail: 0 });
const lostGPU = failure.options;
lostGPU.onError(new Error('Simulated context loss')); assertUnavailable(failure); assert.equal(failure.count('dispose'), 1);
same(failure.lastMovement(), { forward: 0, right: 0 });
const failedMovementCalls = failure.count('setMovement'); await failure.advance(200);
assert.equal(failure.count('setMovement'), failedMovementCalls, 'Failure clears a pending nudge timer');
assert.equal(failure.softwareImports, 1); lostGPU.onReady(); assertUnavailable(failure); await tick();
failure.options.onReady(); await failure.attach();
assert(!failure.byId('world-stand').disabled); assert.equal(failure.warnings.length, 0);
const late = harness({ softwareFails: true }); await late.select3d();
const lateGPU = late.options; lateGPU.onReady(); lateGPU.onError(new Error('Failed while mount was pending'));
await late.attach(); assertUnavailable(late);
assert.equal(late.count('dispose'), 1, 'An engine resolving after failure is disposed');
lateGPU.onReady(); assertUnavailable(late);
const departed = harness(); await departed.select3d(); emit(departed.window, 'pagehide', { persisted: false }); await departed.attach();
assert.equal(departed.count('dispose'), 1); departed.options.onReady(); assertUnavailable(departed);
const immediateDeparture = harness(); emit(immediateDeparture.window, 'pagehide', { persisted: false }); immediateDeparture.runFrame(); await immediateDeparture.runTask(); assert.equal(immediateDeparture.imports, 0);
const reduceAtStart = await mounted({ reduced: true }); assert.equal(reduceAtStart.options.reducedMotion, true); assert(reduceAtStart.engineState.paused);

const brokenImport = harness({ importFails: 'once' }); await brokenImport.select3d(); assertLanding(brokenImport);
assert.equal(brokenImport.imports, 1); assert.equal(brokenImport.softwareImports, 1);
brokenImport.options.onReady(); await brokenImport.attach();
assert.equal(brokenImport.byId('main').dataset.displayMode, '3d'); assert(!brokenImport.byId('world-stand').disabled);
const retryImport = harness({ importFails: 'once', softwareFails: true }); await retryImport.select3d();
assert.equal(retryImport.byId('main').dataset.displayMode, '2d');
await retryImport.select3d(); retryImport.options.onReady(); await retryImport.attach();
const attempts = retryImport.calls.filter(call => call.name === 'engineURL').map(call => call.value);
assert.equal(attempts.length, 2); assert.notEqual(attempts[0], attempts[1], 'An explicit retry can recover a cached module failure');
assert.equal(retryImport.contextRequests, 1); assert(!retryImport.byId('world-stand').disabled);
const attachFirst = harness(); await attachFirst.select3d(); await attachFirst.attach();
assert.equal(attachFirst.count('standUp'), 0); assert(attachFirst.byId('world-stand').disabled, 'Mount resolution alone cannot enable standing before the first frame');
assertLanding(attachFirst); attachFirst.options.onReady(); await tick();
assert.equal(attachFirst.count('standUp'), 0); assert(!attachFirst.byId('world-stand').disabled);
await attachFirst.requestStand(); attachFirst.options.onReady(); await tick(); assert.equal(attachFirst.count('standUp'), 1, 'Duplicate ready notifications cannot stand twice');
assert(attachFirst.byId('main').classList.contains('is-walking'), 'A duplicate ready callback preserves the current walking layout');
await attachFirst.requestStand(); assert.equal(attachFirst.count('standUp'), 1, 'Repeated stand clicks cannot restart a standing engine');
assert.equal(attachFirst.imports, 1);

const seatedAgain = await mounted();
emit(seatedAgain.byId('world-seat'), 'click'); assert.equal(seatedAgain.count('sitDown'), 1);
assert.equal(seatedAgain.count('dispose'), 0);
const resizeBeforeSeating = seatedAgain.count('resize');
seatedAgain.notify({ seated: true, posture: 'seated', travel: false }); await seatedAgain.advance(0); assertLanding(seatedAgain);
assert.equal(seatedAgain.count('dispose'), 0); assert(!seatedAgain.byId('world-stand').disabled);
assert(seatedAgain.count('resize') > resizeBeforeSeating, 'Returning to the menu layout resizes the retained canvas');
assert(seatedAgain.byId('main').classList.contains('is-rendered'));
seatedAgain.options.onReady(); assertLanding(seatedAgain);
await seatedAgain.requestStand(); assert.equal(seatedAgain.imports, 1); assert.equal(seatedAgain.contextRequests, 1);
assert.equal(seatedAgain.count('standUp'), 2, 'Standing again reuses the same engine and decoded assets');
assert.equal(seatedAgain.count('dispose'), 0);
assert(!seatedAgain.byId('world-live-controls').hidden);

const warm = await booted();
assert.deepEqual(warm.deskButtons.map(button => button.dataset.deskAction).sort(), ['drawer', 'lamp', 'letter', 'notebook']);
for (const button of warm.deskButtons) {
  const id = button.dataset.deskAction;
  assert(!button.disabled);
  const before = warm.engineState.deskProps[id];
  assert.equal(button.attributes.get('aria-pressed'), String(before));
  emit(button, 'click');
  assert.equal(warm.calls.at(-1).value, id);
  assert.equal(button.attributes.get('aria-pressed'), String(!before));
  assert(warm.byId('world-prop-feedback').textContent.trim());
}
emit(warm.byId('world-stand'), 'pointerenter'); emit(warm.byId('world-stand'), 'focus');
assert.equal(warm.count('prewarmExterior'), 0, 'Tabbing through the menu or resting a pointer never fetches exterior assets');
assert.equal(warm.count('standUp'), 0); assert.equal(warm.imports, 1); assertLanding(warm);
const observed = harness({ observeViewport: true });
assert.equal(observed.observers.length, 1); assert.equal(observed.observers[0].target, observed.byId('world-canvas'));
assert.equal(observed.observers[0].options.rootMargin, '120px');
observed.observers[0].callback([{ isIntersecting: false }]); await observed.select3d(); observed.options.onReady(); await observed.attach();
assert.equal(observed.calls.filter(call => call.name === 'setRenderingActive').at(-1).value, false, 'An offscreen canvas does not retain an active rendering loop after mounting');
observed.observers[0].callback([{ isIntersecting: true }]);
assert.equal(observed.calls.filter(call => call.name === 'setRenderingActive').at(-1).value, true, 'The live scene resumes when its canvas approaches the viewport');
emit(observed.window, 'pagehide', { persisted: true }); assert(!observed.observers[0].disconnected); assert.equal(observed.count('dispose'), 0);
emit(observed.window, 'pagehide', { persisted: false }); assert(observed.observers[0].disconnected); assert.equal(observed.count('dispose'), 1);

console.log(JSON.stringify({ result: 'PASS', checks: [
  'Five native page menus and the responsive illustration remain interactive without a WebGL context; 3D waits for selection',
  'Japan-time clock updates in 2D without loading the renderer and pauses while hidden',
  'Either ready/mount ordering enables standing; standing reuses the existing engine',
  'A blocked GPU, lost context or failed native import switches to interactive CPU 3D; if both backends fail the menu offers a fresh retry',
  'Each outdoor artwork opens the matching 3D location after the renderer is ready',
  'Sitting restores menus and resizes the live canvas without disposing or remounting',
  'Outdoor travel and landmark navigation remain gated until exterior readiness',
  'Exterior failure exposes a retry action, gates loading and restores walking after recovery',
  'Partial landmark failure offers a separate retry while preserving leave and return-home actions',
  'Desk shortcuts mirror the real prop states and are disabled while walking; offscreen rendering pauses',
  'Walk, stop, return, four landmark destinations, cat readiness and contextual captions',
  'Explicit motion choice overrides preferences; lighting cycles auto, day and night',
  'Four-direction pointer capture, diagonals, release, cancel and lost capture',
  'Space/Enter hold, focus release and untouched browser-modified shortcuts',
  'Click-only assistive activation nudges for 180ms without duplicating physical input or leaving stale timers',
  'Blur, hidden document, cached and permanent departure release held movement',
  'Delayed panel-close toggles cannot cancel newly requested routes',
  'Context loss, failed pending mounts and late ready events cannot resurrect controls',
] }, null, 2));
