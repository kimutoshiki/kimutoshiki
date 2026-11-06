import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

const source = await readFile(new URL('../js/world-ui.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const canvasMarkup = html.match(/<canvas\b(?=[^>]*\bid="world-canvas")[^>]*>/)?.[0];
assert.ok(canvasMarkup); assert.match(canvasMarkup, /tabindex="-1"/); assert.match(canvasMarkup, /aria-hidden="true"/);
const navigation = html.match(/<nav\b(?=[^>]*\bid="navigation")[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(navigation);
for (const page of ['profile.html', 'research.html', 'blog.html', 'photos.html', 'contact.html']) {
  assert.ok(navigation.includes(`href="${page}"`), `The initial HTML has a native ${page} link`);
}

class Element extends EventTarget {
  hidden = false; disabled = false; tabIndex = -1; textContent = ''; dataset = {}; attributes = new Map();
  classList = { remove() {}, add() {} };
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
}

async function unsupportedContext({ throws = false } = {}) {
  const ids = new Map();
  const element = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
  const canvas = element('world-canvas');
  let contextRequests = 0, imports = 0, nextFrame, nextTask;
  canvas.getContext = (kind, options) => {
    contextRequests++; assert.equal(kind, 'webgl2');
    assert.equal(options.antialias, true); assert.equal(options.alpha, false); assert.equal(options.powerPreference, 'high-performance');
    if (throws) throw new Error('Simulated graphics context creation failure');
    return null;
  };
  const buttons = ['cat', 'landmark-karatsu-castle', 'landmark-karatsu-bank', 'landmark-okuma-auditorium', 'landmark-okuma-statue'].map(id => {
    const value = new Element(); value.dataset.worldFocus = id; return value;
  });
  const document = Object.assign(new EventTarget(), { getElementById: element, querySelectorAll: () => buttons });
  const media = Object.assign(new EventTarget(), { matches: false });
  const window = new EventTarget(), warnings = [];
  const scope = createContext({
    document, window, matchMedia: () => media,
    requestAnimationFrame: callback => { nextFrame = callback; return 1; },
    setTimeout: callback => { nextTask = callback; return 1; }, clearTimeout() {}, cancelAnimationFrame() {},
    console: { warn(...values) { warnings.push(values); } },
  });
  // Execute the real UI, including its asynchronous first-paint boundary. The
  // unavailable-GPU path must return before evaluating any dynamic import.
  new Script(source, { importModuleDynamically() { imports++; throw new Error('An unsupported device must not request the engine'); } }).runInContext(scope);
  nextFrame(); await nextTask();
  assert.equal(contextRequests, 1); assert.equal(imports, 0);
  assert.equal(canvas.tabIndex, -1); assert.equal(canvas.attributes.get('aria-hidden'), 'true');
  assert.equal(element('world-help').hidden, true); assert.equal(element('world-live-controls').hidden, true);
  assert.ok(buttons.every(button => button.disabled)); assert.equal(warnings.length, 1);
  assert.ok(element('world-status').textContent.includes('メニュー'));
  // System preferences and late state notifications must remain harmless when
  // mountWorld never ran and no engine methods exist.
  const changed = new Event('change'); changed.matches = true; media.dispatchEvent(changed);
  const late = new Event('worldstate'); late.detail = { catReady: true, landmarksReady: true, focus: 'world' }; canvas.dispatchEvent(late);
  assert.ok(buttons.every(button => button.disabled)); assert.equal(element('world-live-controls').hidden, true);
  const hide = new Event('pagehide'); hide.persisted = false; window.dispatchEvent(hide);
}

await unsupportedContext();
await unsupportedContext({ throws: true });
console.log(JSON.stringify({ result: 'PASS', checks: [
  'Initial HTML has five native page links and excludes the unready canvas from keyboard/accessibility navigation',
  'Null and throwing WebGL2 context creation request the landscape engine zero times',
  'Static fallback hides unavailable controls and gesture instructions with one failure announcement',
  'Preference changes, late ready-state notifications and page departure remain safe without an engine',
] }, null, 2));
