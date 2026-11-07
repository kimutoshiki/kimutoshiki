import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

const source = await readFile(new URL('../js/world-ui.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const canvasMarkup = html.match(/<canvas\b(?=[^>]*\bid="world-canvas")[^>]*>/)?.[0];
assert.match(canvasMarkup || '', /tabindex="-1"/); assert.match(canvasMarkup, /aria-hidden="true"/);
const navigation = html.match(/<nav\b(?=[^>]*\bid="walking-navigation")[^>]*>([\s\S]*?)<\/nav>/)?.[1];
const links = [...(navigation || '').matchAll(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
assert.deepEqual(links.map(match => match[1]), ['profile.html', 'research.html', 'blog.html', 'photos.html', 'contact.html']);
assert(links.every(match => match[2].trim()), 'All five native page links retain accessible names');
const seatedMenu = html.match(/<nav\b(?=[^>]*\bid="home-menu")[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
assert.deepEqual([...seatedMenu.matchAll(/<a\s+href="([^"]+)"/g)].map(match => match[1]), links.map(match => match[1]), 'The static seated home exposes the same five native pages');
assert.match(html, /id="world-live-controls"[^>]*\bhidden/);
assert.match(html, /id="world-travel"[^>]*\bdisabled/);
for (const id of ['home-menu', 'home-intro', 'world-stand', 'world-seat']) assert.match(html, new RegExp(`id="${id}"`));
assert.equal((html.match(/data-world-focus=/g) || []).length, 5);
assert.equal((html.match(/data-walk=/g) || []).length, 4);
const importExpression = source.match(/await import\('\.\.\/scene\/world\.bundle\.js[^']*'\)/)?.[0];
assert(importExpression, 'The UI imports the production world bundle asynchronously');
assert.equal((source.match(/\bimport\s*\(/g) || []).length, 1, 'The lightweight clock does not import a world-time or rendering module');
// Replace only the module-loader boundary. All production UI handlers, state
// transitions, first-paint scheduling and failure handling execute unchanged.
const executable = source.replace(importExpression, 'await testImport()');
const emit = (target, type, values = {}) => {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
};
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

function harness({ context = 'supported', reduced = false, importFails = false } = {}) {
  const ids = new Map(), focusButtons = [], walkButtons = [], toggleQueue = new Set();
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null });
  class Element extends EventTarget {
    hidden = false; disabled = false; tabIndex = -1; textContent = ''; dataset = {}; attributes = new Map(); captures = new Set();
    constructor() {
      super(); const classes = new Set();
      this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle: (name, force) => { const add = force ?? !classes.has(name); if (add) classes.add(name); else classes.delete(name); return add; } };
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); }
    get open() { return !!this._open; }
    set open(value) { if (this.open !== !!value) { this._open = !!value; toggleQueue.add(this); } }
    focus() { if (document.activeElement !== this) { if (document.activeElement) emit(document.activeElement, 'blur'); document.activeElement = this; } }
    setPointerCapture(id) { this.captures.add(id); }
    querySelector(selector) { assert.equal(selector, 'summary'); return this.summary ||= new Element(); }
  }
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const tag = match[0], id = tag.match(/\bid="([^"]+)"/)?.[1], focus = tag.match(/\bdata-world-focus="([^"]+)"/)?.[1], walk = tag.match(/\bdata-walk="([^"]+)"/)?.[1];
    if (!id && !focus && !walk) continue;
    const element = new Element(); element.hidden = /\shidden(?:\s|>)/.test(tag); element.disabled = /\sdisabled(?:\s|>)/.test(tag);
    for (const attribute of tag.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attribute[1], attribute[2]);
    for (const name of (element.attributes.get('class') || '').split(/\s+/).filter(Boolean)) element.classList.add(name);
    if (element.attributes.has('tabindex')) element.tabIndex = Number(element.attributes.get('tabindex'));
    if (id) ids.set(id, element);
    if (focus) { element.dataset.worldFocus = focus; focusButtons.push(element); }
    if (walk) { element.dataset.walk = walk; walkButtons.push(element); }
  }
  const byId = id => { assert(ids.has(id), `Requested HTML element ${id} exists`); return ids.get(id); };
  const selected = new Map(['.world-poster img', '.world-poster source', '.skip-link'].map(selector => [selector, new Element()]));
  Object.assign(document, { getElementById: byId, querySelector: selector => { assert(selected.has(selector), `Known document selector ${selector}`); return selected.get(selector); }, querySelectorAll: selector => { if (selector === '[data-world-focus]') return focusButtons; if (selector === '[data-walk]') return walkButtons; throw new Error('Unexpected selector: ' + selector); } });
  const window = new EventTarget(), media = Object.assign(new EventTarget(), { matches: reduced });
  const frames = new Map(), tasks = new Map(), warnings = [], calls = [];
  let nextId = 0, imports = 0, contextRequests = 0, mountOptions, resolveMount, launch, now = 0;
  const rendererContext = {};
  byId('world-canvas').getContext = (kind, options) => {
    contextRequests++; assert.equal(kind, 'webgl2'); same(options, { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (context === 'throw') throw new Error('Simulated GPU creation error');
    return context === 'null' ? null : rendererContext;
  };
  const engineState = { catReady: false, landmarksReady: false, paused: reduced, lightingMode: 'auto', focus: 'room', mode: 'inside', travel: false, seated: true };
  const record = (name, value) => calls.push({ name, value });
  const engine = {
    getState: () => ({ ...engineState }),
    standUp() { record('standUp'); Object.assign(engineState, { seated: false, standing: true, posture: 'walking', mode: 'inside' }); },
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
  const scope = createContext({ document, window, Date: ClockDate, matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; },
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay = 0) => { tasks.set(++nextId, { callback, at: now + delay }); return nextId; }, clearTimeout: id => tasks.delete(id),
    setInterval: (callback, interval) => { tasks.set(++nextId, { callback, at: now + interval, interval }); return nextId; }, clearInterval: id => tasks.delete(id),
    console: { warn: (...values) => warnings.push(values) },
    testImport: async () => { imports++; if (importFails) throw new Error('Simulated module import failure'); return { mountWorld: options => { mountOptions = options; assert.equal(options.canvas, byId('world-canvas')); assert.equal(options.rendererContext, rendererContext); Object.assign(engineState, { seated: true, travel: false }); return new Promise(resolve => { resolveMount = resolve; }); } }; },
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
  async function attach() { assert(resolveMount); resolveMount(engine); await launch; await tick(); }
  function notify(next) { Object.assign(engineState, next); emit(byId('world-canvas'), 'worldstate', { detail: { ...engineState } }); }
  function flushToggles() { for (let count = 0; toggleQueue.size; count++) { assert(count < 10); const pending = [...toggleQueue]; toggleQueue.clear(); for (const target of pending) emit(target, 'toggle'); } }
  async function requestStand() { emit(byId('world-stand'), 'click'); runFrame(); await runTask(); await tick(); }
  return { byId, focusButtons, walkButtons, document, window, media, warnings, calls, engine, engineState, runFrame, runTask, advance, attach, notify, flushToggles, requestStand, selected,
    get pendingFrames() { return frames.size; },
    get imports() { return imports; }, get contextRequests() { return contextRequests; }, get options() { return mountOptions; },
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
  assertUnavailable(h);
  assert(!h.byId('home-menu').hidden && !h.byId('home-intro').hidden, 'The static seated home keeps its native menu and introduction');
  assert(!h.byId('main').classList.contains('is-live'));
}
async function mounted(options) {
  const h = harness(options); assertLanding(h);
  assert.equal(h.contextRequests, 0); assert.equal(h.imports, 0);
  h.runFrame(); await h.runTask(); await h.advance(1000);
  assert.equal(h.contextRequests, 0, 'Page load and clock ticks cannot request a graphics context');
  assert.equal(h.imports, 0, 'Page load does not fetch the world engine');
  await h.requestStand(); assert.equal(h.imports, 1); assert.equal(h.contextRequests, 1);
  await h.requestStand(); assert.equal(h.imports, 1, 'Repeated stand clicks share a single pending mount');
  assert.equal(h.options.seated, true); assert.equal(h.options.autoTime, true);
  assertUnavailable(h);
  h.options.onReady();
  assert(h.byId('world-travel').disabled, 'onReady before the async mount resolves cannot enable unattached engine actions');
  assert(h.walkButtons.every(button => button.disabled));
  await h.attach();
  assert.equal(h.count('standUp'), 1, 'Standing starts once, after both engine attachment and its first rendered frame');
  assert(!h.byId('world-live-controls').hidden && !h.byId('world-help').hidden);
  assert(h.byId('home-menu').hidden && h.byId('home-intro').hidden, 'Walking exposes the scene without covering it with the seated home menus');
  assert.equal(h.byId('world-canvas').tabIndex, 0); assert(!h.byId('world-canvas').attributes.has('aria-hidden'));
  assert(!h.byId('world-travel').disabled); assert(h.walkButtons.every(button => !button.disabled));
  assert(h.focusButtons.every(button => button.disabled), 'Optional asset actions remain gated after the first paint');
  return h;
}

const clockOnly = harness(); assertLanding(clockOnly);
assert.equal(clockOnly.pendingFrames, 0, 'The static homepage starts no animation-frame loop');
assert.equal(clockOnly.byId('world-clock').textContent, '03:05', 'The clock uses Japanese time rather than executor UTC');
assert.equal(clockOnly.byId('world-clock').attributes.get('datetime'), '2026-11-06T18:05:00.000Z');
assert.equal(clockOnly.byId('world-time-phase').textContent, '夜の書斎');
assert.equal(clockOnly.selected.get('.world-poster img').src, 'images/world/seated-night.webp');
await clockOnly.advance(60020); assert.equal(clockOnly.byId('world-clock').textContent, '03:06');
clockOnly.document.hidden = true; emit(clockOnly.document, 'visibilitychange'); await clockOnly.advance(240000);
assert.equal(clockOnly.byId('world-clock').textContent, '03:06', 'Hidden documents stop their clock timer');
clockOnly.document.hidden = false; emit(clockOnly.document, 'visibilitychange'); assert.equal(clockOnly.byId('world-clock').textContent, '03:10');
emit(clockOnly.window, 'pagehide', { persisted: true }); await clockOnly.advance(60000); assert.equal(clockOnly.byId('world-clock').textContent, '03:10');
emit(clockOnly.window, 'pageshow'); assert.equal(clockOnly.byId('world-clock').textContent, '03:11', 'Returning from the back-forward cache refreshes the clock');
await clockOnly.advance(9 * 60 * 60000);
assert.match(clockOnly.byId('world-time-phase').textContent, /昼/); assert.equal(clockOnly.selected.get('.world-poster img').src, 'images/world/seated-day.webp');
assert.equal(clockOnly.selected.get('.world-poster source').srcset, 'images/world/seated-day-mobile.webp');
assert.equal(clockOnly.contextRequests, 0); assert.equal(clockOnly.imports, 0, 'Hours of clock and poster updates remain independent of WebGL');
emit(clockOnly.window, 'pagehide', { persisted: false }); const finalClock = clockOnly.byId('world-clock').textContent;
await clockOnly.advance(120000); emit(clockOnly.window, 'pageshow'); assert.equal(clockOnly.byId('world-clock').textContent, finalClock);

for (const context of ['null', 'throw']) {
  const h = harness({ context }); assertLanding(h); await h.requestStand(); await h.finishUnsupported();
  assert.equal(h.contextRequests, 1); assert.equal(h.imports, 0); assert.equal(h.warnings.length, 1); assertUnavailable(h);
  assertLanding(h); assert(h.byId('world-stand').disabled);
  await h.requestStand(); assert.equal(h.contextRequests, 1, 'A failed stand attempt does not enter a retry loop');
  assert.match(h.byId('world-status').textContent, /メニュー/);
  emit(h.media, 'change', { matches: true }); h.notify({ catReady: true, landmarksReady: true, travel: true });
  assertUnavailable(h); emit(h.window, 'pagehide', { persisted: false });
}
const h = await mounted(), click = id => emit(h.byId(id), 'click');
h.notify({ seated: false, posture: 'standing-up' }); assert(h.byId('world-travel').disabled && h.byId('world-seat').disabled); assert(h.walkButtons.every(button => button.disabled), 'Movement is gated during the stand-up transition');
h.notify({ seated: false, posture: 'walking' }); assert(!h.byId('world-travel').disabled);
assert.equal(h.byId('world-travel-label').textContent, '外へ歩く');
click('world-travel'); assert.equal(h.count('leave'), 1); assert.equal(h.byId('world-travel-label').textContent, '移動を止める');
assert(h.byId('world-travel').classList.contains('is-travelling')); assert.equal(h.document.activeElement, h.byId('world-canvas'));
assert.match(h.byId('world-status').textContent, /歩いています/);
click('world-travel'); assert.equal(h.count('stopMovement'), 1); assert.equal(h.byId('world-travel-label').textContent, '外へ歩く');
h.notify({ mode: 'outside', travel: false }); assert.equal(h.byId('world-location-name').textContent, '庭'); assert.equal(h.byId('world-travel-label').textContent, '部屋へ戻る');
click('world-travel'); assert.equal(h.count('returnHome'), 1);
h.notify({ travel: false, catReady: true });
assert.equal(h.focusButtons.filter(button => !button.disabled).length, 1); assert(!h.focusButtons.find(button => button.dataset.worldFocus === 'cat').disabled);
const subjectLinks = { 'landmark-karatsu-castle': 'photos.html', 'landmark-karatsu-bank': 'blog.html', 'landmark-okuma-auditorium': 'profile.html', 'landmark-okuma-statue': 'research.html' };
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

const failure = await mounted(); emit(failure.pad('forward'), 'click', { detail: 0 }); failure.options.onError(new Error('Simulated context loss')); assertUnavailable(failure); assert.equal(failure.count('dispose'), 1);
same(failure.lastMovement(), { forward: 0, right: 0 }); const failedMovementCalls = failure.count('setMovement'); await failure.advance(200); assert.equal(failure.count('setMovement'), failedMovementCalls, 'Failure clears a pending nudge timer');
failure.notify({ catReady: true, landmarksReady: true, mode: 'outside' }); failure.options.onReady(); emit(failure.media, 'change', { matches: true });
assertUnavailable(failure); assert.equal(failure.warnings.length, 1, 'Late events do not resurrect a failed view');
const late = harness(); await late.requestStand(); late.options.onReady(); late.options.onError(new Error('Failed while mount was pending')); await late.attach();
assertUnavailable(late); assert.equal(late.count('dispose'), 1, 'An engine resolving after failure is disposed'); late.options.onReady(); assertUnavailable(late);
const departed = harness(); await departed.requestStand(); emit(departed.window, 'pagehide', { persisted: false }); await departed.attach();
assert.equal(departed.count('dispose'), 1); departed.options.onReady(); assertUnavailable(departed);
const immediateDeparture = harness(); emit(immediateDeparture.window, 'pagehide', { persisted: false }); immediateDeparture.runFrame(); await immediateDeparture.runTask(); assert.equal(immediateDeparture.imports, 0);
const reduceAtStart = await mounted({ reduced: true }); assert.equal(reduceAtStart.options.reducedMotion, true); assert(reduceAtStart.engineState.paused);

const brokenImport = harness({ importFails: true }); await brokenImport.requestStand(); assertLanding(brokenImport);
assert.equal(brokenImport.imports, 1); assert.equal(brokenImport.warnings.length, 1); assert(brokenImport.byId('world-stand').disabled);
await brokenImport.requestStand(); assert.equal(brokenImport.imports, 1, 'An import failure keeps a usable static home without repeatedly importing');

const attachFirst = harness(); await attachFirst.requestStand(); await attachFirst.attach();
assert.equal(attachFirst.count('standUp'), 0, 'Mount resolution alone cannot start standing before the first frame');
assertLanding(attachFirst); attachFirst.options.onReady(); await tick();
assert.equal(attachFirst.count('standUp'), 1); attachFirst.options.onReady(); await tick(); assert.equal(attachFirst.count('standUp'), 1, 'Duplicate ready notifications cannot stand twice');

const seatedAgain = await mounted(), oldOptions = seatedAgain.options;
emit(seatedAgain.byId('world-seat'), 'click'); assert.equal(seatedAgain.count('sitDown'), 1);
assert.equal(seatedAgain.count('dispose'), 0, 'The seated transition completes before its live engine is released');
seatedAgain.notify({ seated: true, posture: 'seated', travel: false }); await seatedAgain.advance(0); assertLanding(seatedAgain);
assert.equal(seatedAgain.count('dispose'), 1); assert(!seatedAgain.byId('world-stand').disabled, 'The seated landing can be entered again');
oldOptions.onReady(); seatedAgain.notify({ seated: false, catReady: true, landmarksReady: true }); assertLanding(seatedAgain);
await seatedAgain.requestStand(); assert.equal(seatedAgain.imports, 2); seatedAgain.options.onReady(); await seatedAgain.attach();
assert.equal(seatedAgain.count('standUp'), 2, 'A new stand request mounts exactly one fresh walking session');
oldOptions.onError(new Error('Late failure from the disposed session')); oldOptions.onReady();
assert(!seatedAgain.byId('world-live-controls').hidden, 'Callbacks from the old seated session cannot fail or replace the current engine');

console.log(JSON.stringify({ result: 'PASS', checks: [
  'Five native links and static seated menus require no initial WebGL context or engine import',
  'Japan-time clock and matching day/night posters update without rendering imports and pause while hidden',
  'Standing mounts once on demand; either async ready/mount ordering starts one transition',
  'Unsupported GPU and failed imports preserve native menus without retry loops',
  'Sitting restores the static landing, disposes the engine and safely permits another session',
  'Walk, stop, return, four landmark destinations, cat readiness and contextual captions',
  'Explicit motion choice overrides preferences; lighting cycles auto, day and night',
  'Four-direction pointer capture, diagonals, release, cancel and lost capture',
  'Space/Enter hold, focus release and untouched browser-modified shortcuts',
  'Click-only assistive activation nudges for 180ms without duplicating physical input or leaving stale timers',
  'Blur, hidden document, cached and permanent departure release held movement',
  'Delayed panel-close toggles cannot cancel newly requested routes',
  'Context loss, failed pending mounts and late ready events cannot resurrect controls',
] }, null, 2));
