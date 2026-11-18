/** End-to-end review of the native illustrated home and opt-in WebGL study.
 * Start the preview server first. Software-renderer times are observations only. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = process.env.REVIEW_OUTPUT ? pathToFileURL(resolve(process.env.REVIEW_OUTPUT) + sep) : new URL('../docs/reviews/live-study/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = { browser: await browser.version(), renderer: 'ANGLE SwiftShader', cases: [] };
const destinations = ['profile', 'research', 'blog', 'photos', 'contact'];
const engineResource = /\/(?:scene|models|js\/vendor)\//;
const outdoorResource = /world-chunk-(?:world-landscape|garden-boundary|world-landmarks)-/;

async function picture(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const bytes = await page.screenshot({ fullPage: true, timeout: 90000 });
  const img = await loadImage(bytes), canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  await writeFile(new URL(name + '.webp', output), await canvas.encode('webp', 82));
}
async function open(viewport, options = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', ...options });
  const requests = [], failures = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push([response.status(), response.url()]); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    window.__glCalls = 0;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl2' || type === 'webgl') window.__glCalls++;
      return getContext.call(this, type, ...args);
    };
    document.addEventListener('worldstate', e => { window.__worldState = e.detail; }, true);
  });
  return { page, requests, failures, errors };
}
async function goHome(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const img = document.getElementById('study-image');
    return img?.complete && img.naturalWidth > 0 && document.getElementById('main').dataset.displayMode === '2d';
  });
}
async function live(page) {
  await page.locator('#study-mode-3d').click();
  await page.waitForFunction(() => window.__worldState?.seated && window.__worldState?.catReady &&
    window.__worldState?.miniaturesReady && document.getElementById('main').classList.contains('is-rendered'), null, { timeout: 180000 });
}
async function choose(page, selector, id) {
  await page.locator(selector).click();
  const card = page.locator('.study-link-card');
  await card.waitFor({ state: 'visible' });
  const href = await card.locator('.study-link-go').getAttribute('href');
  assert.equal(new URL(href, page.url()).pathname, '/' + id + '.html');
  assert.equal(new URL(page.url()).pathname, '/', 'The first tap previews the destination');
  return card;
}
async function checkIllustration(page, requests) {
  const anchors = page.locator('[data-illustration-link]');
  assert.deepEqual(await anchors.evaluateAll(items => items.map(el => new URL(el.href).pathname).sort()),
    destinations.map(id => '/' + id + '.html').sort());
  assert.deepEqual(await page.locator('#home-menu a').evaluateAll(items => items.map(el => new URL(el.href).pathname)),
    destinations.map(id => '/' + id + '.html'));
  const source = await page.locator('#study-image').evaluate(img => ({ path: new URL(img.currentSrc).pathname, width: img.naturalWidth, height: img.naturalHeight }));
  assert.match(source.path, /^\/images\/study\/study-(640|960|1200|1536)\.webp$/);
  assert(Math.abs(source.width / source.height - 1.5) < .01);
  assert(!requests.some(url => engineResource.test(url)), 'The illustrated home downloads no renderer, models or 3D geometry');
  assert.equal(await page.evaluate(() => window.__glCalls), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return source.path;
}

try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }], ['narrow', { width: 320, height: 740 }]]) {
    const { page, requests, errors, failures } = await open(viewport);
    await goHome(page);
    const image = await checkIllustration(page, requests);
    if (viewport.width <= 640) assert(image.endsWith('study-640.webp'), 'A phone gets the 640px illustration at DPR 1');
    assert.equal(await page.locator('#study-mode-2d').getAttribute('aria-pressed'), 'true');
    await picture(page, name + '-2d');
    if (name === 'desktop') {
      const menu = page.locator('#home-menu [data-study-link="profile"]');
      await menu.focus();
      assert(await page.locator('[data-illustration-link="profile"]').evaluate(pin => pin.classList.contains('is-linked')), 'Keyboard focus on the menu highlights its object');
      await page.keyboard.press('Tab');
    }
    for (const id of destinations) {
      const pin = '[data-illustration-link="' + id + '"]';
      const card = await choose(page, pin, id);
      if (name === 'desktop' && id === 'blog') await picture(page, 'desktop-2d-linked-notebook');
      await card.locator('.study-link-close').click();
      await card.waitFor({ state: 'hidden' });
    }
    assert(!requests.some(url => engineResource.test(url)), 'Previewing all five destinations stays in 2D');
    if (name === 'mobile') {
      const card = await choose(page, '[data-illustration-link="contact"]', 'contact');
      await card.locator('.study-link-go').click();
      await page.waitForURL('**/contact.html');
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#main').getAttribute('data-display-mode'), '2d');
      assert(await page.locator('#study-image').isVisible());
      const restoredCard = page.locator('.study-link-card');
      if (await restoredCard.isVisible()) await restoredCard.locator('.study-link-close').click();
    }
    await page.locator('#world-stand').click();
    const garden = page.getByRole('dialog');
    await garden.waitFor();
    await page.waitForFunction(() => document.querySelector('.tour-view img')?.naturalWidth > 0);
    await page.keyboard.press('ArrowRight');
    assert.equal(await garden.locator('.tour-count').textContent(), '2 / 4');
    await page.keyboard.press('Escape');
    await garden.waitFor({ state:'hidden' });
    assert(!requests.some(url => engineResource.test(url)));
    report.cases.push({ name: name + ' illustration', image, destinations: 5, webglContexts: 0, viewport });
    if (name === 'narrow') { assert.deepEqual(errors, []); assert.deepEqual(failures, []); await page.close(); continue; }

    await live(page);
    assert.equal(await page.locator('#study-mode-3d').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.study-pin[data-live-link]').count(), 5);
    await picture(page, name + '-3d');
    const card = await choose(page, '[data-live-link="blog"]', 'blog');
    assert.equal(await page.evaluate(() => window.__worldState.deskProps.notebook), true, 'The live notebook actually opens on selection');
    if (name === 'desktop') {
      assert(await page.locator('#home-menu [data-study-link="blog"]').evaluate(link => link.classList.contains('is-linked')), 'The selected live object highlights its matching menu entry');
      await picture(page, 'desktop-3d-linked-notebook');
    }
    await page.keyboard.press('Escape');
    await card.waitFor({ state:'hidden' });
    assert(!requests.some(url => outdoorResource.test(url)), 'Desk inspection does not load the exterior');
    const contexts = await page.evaluate(() => window.__glCalls);
    const firstEngineRequests = requests.filter(url => /world\.bundle|cat-world.*\.glb/.test(url)).length;
    await page.locator('#study-mode-2d').click();
    await page.waitForFunction(() => document.getElementById('main').dataset.displayMode === '2d');
    assert(await page.locator('#study-artwork').isVisible());
    assert(!await page.locator('.study-pin[data-live-link]').first().isVisible());
    await live(page);
    assert.equal(await page.evaluate(() => window.__glCalls), contexts, 'Switching modes reuses its WebGL context');
    assert.equal(requests.filter(url => /world\.bundle|cat-world.*\.glb/.test(url)).length, firstEngineRequests);
    report.cases.push({ name: name + ' live desk', sameViewport: viewport, retainedContext: true, realNotebook: true });
    if (name === 'desktop') {
      await page.setViewportSize({ width: 640, height: 480 });
      await page.locator('#world-stand').click();
      await page.waitForFunction(() => window.__worldState?.standing && window.__worldState.mode === 'outside' && window.__worldState.landmarksReady, null, { timeout: 180000 });
      assert(await page.locator('#world-live-controls').isVisible());
      assert(!await page.locator('#home-menu').isVisible());
      await page.setViewportSize({ width: 960, height: 640 });
      await picture(page, 'garden');
      await page.setViewportSize({ width: 480, height: 360 });
      await page.locator('#world-seat').click();
      await page.waitForFunction(() => window.__worldState?.seated && !document.getElementById('main').classList.contains('is-walking'), null, { timeout: 180000 });
      assert(await page.locator('#home-menu').isVisible());
      assert.equal(await page.evaluate(() => window.__glCalls), contexts);
      report.cases.push({name:'Garden entrance and continuous return to the same desk', retainedContext:true});
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []); await page.close();
  }

  const slow = await open({ width: 960, height: 720 });
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await slow.page.route('**/scene/world.bundle.js*', async route => { await hold; await route.continue(); });
  await goHome(slow.page);
  const engineRequest = slow.page.waitForRequest('**/scene/world.bundle.js*');
  await slow.page.locator('#study-mode-3d').click();
  await engineRequest;
  await slow.page.locator('#study-mode-2d').click();
  release();
  await slow.page.waitForLoadState('networkidle');
  assert.equal(await slow.page.locator('#main').getAttribute('data-display-mode'), '2d');
  assert(!await slow.page.locator('#main').evaluate(el => el.classList.contains('is-rendered')));
  assert(!slow.requests.some(url => /cat-world.*\.glb/.test(url)), 'A canceled world import cannot start a fresh cat download');
  await slow.page.close();

  const unsupported = await open({ width: 390, height: 844 });
  await unsupported.page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : native.call(this, type, ...args); };
  });
  await goHome(unsupported.page);
  const illustration = await unsupported.page.locator('#study-image').evaluate(img => img.currentSrc);
  await unsupported.page.locator('#study-mode-3d').click();
  await unsupported.page.waitForFunction(() => document.getElementById('main').dataset.displayMode === '2d' && document.getElementById('study-mode-status').textContent.trim());
  assert.equal(await unsupported.page.locator('#study-image').evaluate(img => img.currentSrc), illustration);
  assert(await unsupported.page.locator('#home-menu').isVisible());
  assert(await unsupported.page.locator('#study-mode-3d').isEnabled(), 'An explicit retry remains available');
  await choose(unsupported.page, '[data-illustration-link="profile"]', 'profile');
  await unsupported.page.close();
  report.cases.push({name:'Canceled or unavailable WebGL leaves the illustration usable'});

  const nojs = await browser.newPage({ javaScriptEnabled:false, viewport:{width:390,height:844} });
  await nojs.goto(base, { waitUntil:'networkidle' });
  assert(await nojs.locator('#study-image').isVisible());
  assert.equal(await nojs.locator('#home-menu a').count(), 5);
  assert.equal(await nojs.locator('a[data-illustration-link]').count(), 5);
  await nojs.locator('[data-illustration-link="profile"]').click();
  assert.equal(new URL(nojs.url()).pathname, '/profile.html');
  await nojs.close();
  report.cases.push({name:'JavaScript disabled', nativeNavigation:true, illustration:true});
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
