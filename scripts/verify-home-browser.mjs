/** End-to-end review of the native illustrated home and opt-in WebGL study.
 * Start the preview server first. Software-renderer times are observations only. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { OUTDOOR_VIEWS, districtAt } from '../scene/world-layout.js';
import { SOFTWARE_PLACES } from '../js/software-garden.js';
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
const engineResource = /\/(?:scene|models|js\/vendor)\/|\/js\/software-[^/?]+\.js|\/images\/study\/desk-(?:joinery|room)\.webp/;
const galleryResource = /\/images\/outdoors\//;
const places = [
  { key:'okuma-auditorium', name:'大隈講堂', detail:'時計塔' },
  { key:'okuma-statue', name:'大隈重信像', detail:'杖' },
  { key:'karatsu-castle', name:'唐津城', detail:'本丸' },
  { key:'karatsu-bank', name:'旧唐津銀行', detail:'れんが' },
];
const outdoorResource = /world-chunk-(?:world-landscape|garden-boundary|world-landmarks)-|software-garden\.js/;

async function picture(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const bytes = await page.screenshot({ fullPage: true, timeout: 90000 });
  const img = await loadImage(bytes), canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  await writeFile(new URL(name + '.webp', output), await canvas.encode('webp', 82));
}
async function open(viewport, {rendererName = 'ANGLE (Intel, Intel UHD Graphics)', ...options} = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', ...options });
  const requests = [], failures = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push([response.status(), response.url()]); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(rendererName => {
    // Exercise accelerated routing with real WebGL drawing on CI. Only this
    // identification string is overridden. One explicit case keeps SwiftShader.
    window.__identifiedRenderers=[];
    if(window.WebGL2RenderingContext){
      const getParameter=WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter=function(parameter){
        const value=getParameter.call(this,parameter);
        if(parameter!==0x9246 && parameter!==this.RENDERER)return value;
        window.__identifiedRenderers.push(value);
        return rendererName??value;
      };
    }
    const getContext = HTMLCanvasElement.prototype.getContext;
    window.__glCalls = 0;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl2' || type === 'webgl') window.__glCalls++;
      return getContext.call(this, type, ...args);
    };
    document.addEventListener('worldstate', e => { window.__worldState = e.detail; }, true);
  }, rendererName);
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
  assert(!requests.some(url => galleryResource.test(url)), 'No outdoor gallery images are downloaded on initial entry');
  assert(!requests.some(url => /\/js\/notebook-(?:view|render|geometry)\.js/.test(url)), 'The close-up notebook is on demand');
  assert.equal(await page.evaluate(() => window.__glCalls), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return source.path;
}

async function numbers(page, liveMode = false) {
  const menuNumbers = await page.locator('#home-menu [data-study-link]').evaluateAll(items =>
    items.map(item => [item.dataset.studyLink, item.querySelector('.menu-symbol')?.textContent.trim()]));
  const selector = liveMode ? '[data-live-link]' : '[data-illustration-link]';
  const pinNumbers = await page.locator(selector).evaluateAll(items =>
    items.map(item => [item.dataset.liveLink || item.dataset.illustrationLink, item.querySelector('.pin-dot')?.textContent.trim()]));
  const expected = destinations.map((key, index) => [key, String(index + 1)]);
  assert.deepEqual(menuNumbers, expected);
  assert.deepEqual(pinNumbers, expected, 'The five actual menu and object numbers agree in order');
}
async function pixelSample(canvas) {
  return canvas.evaluate(view => {
    const context = view.getContext('2d');
    const { width, height } = view;
    const data = context.getImageData(0, 0, width, height).data;
    const colors = new Set();
    let hash = 2166136261;
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 120))) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 160))) {
        const at = 4 * (y * width + x);
        const rgb = (data[at] << 16) + (data[at + 1] << 8) + data[at + 2];
        colors.add(rgb);
        hash = Math.imul(hash ^ rgb, 16777619);
      }
    }
    return { colors: colors.size, hash: hash >>> 0, width, height };
  });
}
async function inspectNotebook(page, name, capture = false) {
  const dialog = page.getByRole('dialog', {name:'旅の手帖'});
  const stage = dialog.locator('.notebook-stage');
  const canvas = stage.locator('canvas');
  await dialog.waitFor();
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelector('.notebook-stage canvas')?.width > 320 ||
    document.querySelector('.notebook-stage canvas')?.clientWidth > 150);
  assert.match(await canvas.getAttribute('aria-label'), /大隈講堂.*唐津城/);
  assert.equal(await stage.getAttribute('data-position'), 'spread');
  const onIllustration = name.endsWith('-2d');
  if (onIllustration) assert.equal(await page.locator('#study-artwork .notebook-on-desk').count(), 0, 'Reduced motion opens the spread immediately without animating the desk');
  const open = await pixelSample(canvas);
  assert(open.colors > 32 && open.width > 100 && open.height > 80, 'The open spread contains drawn, varied artwork');
  if (capture) await picture(page, name + '-sketchbook');
  await dialog.getByRole('button', {name:'前のページ'}).click();
  assert.equal(await stage.getAttribute('data-position'), 'first');
  const pageOne = await pixelSample(canvas);
  assert.notEqual(pageOne.hash, open.hash, 'Turning a page changes the pixels, as well as the accessible state');
  await dialog.getByRole('button', {name:'表紙を閉じる'}).click();
  assert.equal(await stage.getAttribute('data-position'), 'closed');
  assert(await dialog.getByRole('button', {name:'次のページ'}).isDisabled());
  if (!onIllustration) assert.equal(await page.evaluate(() => window.__worldState.deskProps.notebook), false, 'Closing the cover also closes the real desk prop');
  const closed = await pixelSample(canvas);
  assert.notEqual(closed.hash, pageOne.hash);
  if (capture && name === 'desktop-2d') await picture(page, name + '-book-cover');
  await dialog.getByRole('button', {name:'表紙を開く'}).click();
  assert.equal(await stage.getAttribute('data-position'), 'spread');
  if (!onIllustration) assert.equal(await page.evaluate(() => window.__worldState.deskProps.notebook), true);
  assert.equal(new URL(await dialog.locator('.study-link-go').getAttribute('href'), page.url()).pathname, '/blog.html');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
}
async function galleryView(page, scene, index, viewportWidth) {
  const garden = page.locator('.study-tour[open]');
  await garden.waitFor();
  await page.waitForFunction(key => {
    const img = document.querySelector('.study-tour[open] .tour-view img');
    return img && !img.hidden && img.complete && img.naturalWidth > 0 && img.currentSrc.includes('/' + key + '-');
  }, scene.key);
  assert.equal(await garden.locator('.tour-place h3').textContent(), scene.name);
  assert.equal(await garden.locator('.tour-count').textContent(), (index + 1) + ' / 4');
  const image = garden.locator('.tour-view img');
  assert((await image.getAttribute('alt')).includes(scene.detail), 'Outdoor illustration has a scene-specific text alternative');
  const src = await image.evaluate(img => new URL(img.currentSrc).pathname);
  assert.match(src, new RegExp('^/images/outdoors/' + scene.key + '-(768|1280|1536)\\.webp$'));
  if (viewportWidth <= 620) assert(src.endsWith('-768.webp'));
  return garden;
}
async function seekGallery(page, index, viewportWidth) {
  const counter = page.locator('.study-tour[open] .tour-count');
  await counter.waitFor();
  const current = Number((await counter.textContent()).split('/')[0]) - 1;
  for (let step = 0; step < (index - current + places.length) % places.length; step++) await page.locator('.tour-next').click();
  return galleryView(page, places[index], index, viewportWidth);
}
async function exploreAndReturn(page, scene, renderer, capture) {
  await page.locator('.tour-explore').click();
  await page.waitForFunction(key => {
    const s = window.__worldState;
    return s?.standing && s.mode === 'outside' && s.landmarksReady && (s.webgl ? s.placeArtReady : s.textureReady && s.renderedDistrict==='landmark-'+key) && s.focus === 'landmark-' + key;
  }, scene.key, { timeout: 180000 });
  const state = await page.evaluate(() => window.__worldState);
  const nativeEye = OUTDOOR_VIEWS[scene.key].eye, simulated = SOFTWARE_PLACES['landmark-' + scene.key];
  const eye = renderer === 'software' ? [simulated.x,simulated.z] : nativeEye;
  assert(Math.hypot(state.position.x-eye[0],state.position.z-eye[1]) < .12, 'The camera starts physically at the depicted site');
  assert.equal(state.district, districtAt({x:nativeEye[0],z:nativeEye[1]}));
  assert.equal(await page.locator('#world-location-name').textContent(), state.district);
  const veil = page.locator('.tour-arrival');
  if (await veil.count()) await veil.waitFor({state:'hidden',timeout:15000});
  if (capture) await picture(page, renderer + '-place-' + scene.key);
  await page.locator('#study-mode-2d').click();
  const returnView = await galleryView(page, scene, places.indexOf(scene), page.viewportSize().width);
  assert.equal(await page.locator('#main').getAttribute('data-display-mode'), '2d');
  await returnView.locator('.tour-close').click();
  await returnView.waitFor({state:'hidden'});
  assert(await page.locator('#study-artwork').isVisible(), 'Closing the returned illustration reveals the native desk');
  await page.locator('#study-mode-3d').click();
  await page.waitForFunction(district => document.querySelector('#main.is-rendered.is-walking[data-display-mode="3d"]') &&
    window.__worldState?.mode === 'outside' && window.__worldState?.district === district, state.district, {timeout:180000});
  if (renderer === 'software') {
    const surface = page.locator('canvas[data-renderer="software"]');
    const before = await pixelSample(surface);
    assert(before.colors >= 12, 'The CPU renderer paints the actual exterior');
    await page.locator('#world-canvas').focus();
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(start => {
        const p = window.__worldState.position;
        return Math.hypot(p.x-start.x, p.z-start.z) > .005;
      },state.position);
    } finally { await page.keyboard.up('w'); }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await pixelSample(surface);
    assert.notEqual(after.hash, before.hash, 'Manual walking changes the perspective-rendered exterior');
  }
  await page.locator('#world-seat').click();
  await page.waitForFunction(() => window.__worldState?.seated && !document.getElementById('main').classList.contains('is-walking'), null, {timeout:180000});
  assert(await page.locator('#home-menu').isVisible());
  return state.district;
}
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }], ['narrow', { width: 320, height: 740 }]]) {
    const { page, requests, errors, failures } = await open(viewport);
    await goHome(page);
    const image = await checkIllustration(page, requests);
    await numbers(page);
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
      if (id === 'blog') await inspectNotebook(page, name + '-2d', name !== 'narrow');
      else await card.locator('.study-link-close').click();
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
    for (const [i,scene] of places.entries()) {
      await galleryView(page, scene, i, viewport.width);
      if (name === 'desktop') await picture(page, 'gallery-' + scene.key);
      if (name === 'desktop' && i === 0) {
        assert(!places.slice(1).some(other => requests.some(url => url.includes('/images/outdoors/' + other.key))), 'Opening one outdoor illustration does not fetch the following stops');
      }
      if (i + 1 < places.length) await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Escape');
    await garden.waitFor({ state:'hidden' });
    assert(!requests.some(url => engineResource.test(url)));
    report.cases.push({ name: name + ' illustration', image, destinations: 5, webglContexts: 0, viewport });
    if (name === 'narrow') { assert.deepEqual(errors, []); assert.deepEqual(failures, []); await page.close(); continue; }

    await live(page);
    assert.equal(await page.locator('#study-mode-3d').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.study-pin[data-live-link]').count(), 5);
    await numbers(page, true);
    await picture(page, name + '-3d');
    const card = await choose(page, '[data-live-link="blog"]', 'blog');
    assert.equal(await page.evaluate(() => window.__worldState.deskProps.notebook), true, 'The live notebook actually opens on selection');
    if (name === 'desktop') {
      assert(await page.locator('#home-menu [data-study-link="blog"]').evaluate(link => link.classList.contains('is-linked')), 'The selected live object highlights its matching menu entry');
    }
    await inspectNotebook(page, name + '-3d', true);
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
      await page.locator('#study-mode-2d').click();
      await page.locator('#world-stand').click();
      const castle = places[2];
      await seekGallery(page, 2, 480);
      await page.setViewportSize({width:800,height:560});
      const district = await exploreAndReturn(page, castle, 'webgl', true);
      report.cases.push({name:'Illustrated castle to its native 3D viewpoint and back', district});

    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []); await page.close();
  }

  // Observe the physically hinged book on the actual illustration before
  // its close-up opens. Tests above use reduced motion for deterministic poses.
  const animated = await open({width: 1280, height: 800}, {reducedMotion:'no-preference'});
  await goHome(animated.page);
  await animated.page.evaluate(() => {
    window.__deskBookFrames = new Set();
    const end = performance.now() + 8000;
    function sample() {
      const overlay = document.querySelector('#study-artwork .notebook-on-desk');
      if (overlay?.width > 12) {
        const ctx = overlay.getContext('2d'), {data} = ctx.getImageData(0, 0, overlay.width, overlay.height);
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 28) hash = Math.imul(hash ^ (data[i] + data[i+3] * 256), 16777619);
        window.__deskBookFrames.add(hash);
      }
      if (window.__deskBookFrames.size < 3 && performance.now() < end) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await animated.page.locator('[data-illustration-link="blog"]').click();
  await animated.page.waitForFunction(() => window.__deskBookFrames.size >= 3, null, {timeout:10000});
  await animated.page.getByRole('dialog', {name:'旅の手帖'}).waitFor();
  await animated.page.keyboard.press('Escape');
  await animated.page.locator('.notebook-on-desk').waitFor({state:'detached'});
  assert.deepEqual(animated.errors, []);
  await animated.page.close();
  report.cases.push({name:'Photographed cover visibly rises on the actual illustrated desktop'});

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

  const emulated=await open({width:720,height:480},{rendererName:null});
  await goHome(emulated.page);
  await checkIllustration(emulated.page,emulated.requests);
  await emulated.page.locator('#study-mode-3d').click();
  await emulated.page.waitForFunction(()=>window.__worldState?.renderer==='software' && window.__worldState?.renderedDistrict==='room');
  assert(await emulated.page.evaluate(()=>window.__identifiedRenderers.some(label=>/swiftshader|llvmpipe|softpipe|software renderer|software rasterizer|microsoft basic render/i.test(label))),
    'The actual Chromium software GL context was identified on normal entry');
  assert(!emulated.requests.some(url=>/world\.bundle|cat-world.*\.glb/.test(url)), 'An emulated GPU does not transfer the native renderer');
  assert.equal(await emulated.page.locator('canvas[data-renderer="software"]').count(),1);
  assert((await pixelSample(emulated.page.locator('canvas[data-renderer="software"]'))).colors>1800);
  await emulated.page.locator('#world-stand').click();
  await emulated.page.waitForFunction(()=>window.__worldState?.standing && window.__worldState.mode==='outside');
  await emulated.page.locator('#world-seat').click();
  await emulated.page.waitForFunction(()=>window.__worldState?.seated);
  assert.deepEqual(emulated.errors,[]);assert.deepEqual(emulated.failures,[]);
  await emulated.page.close();
  report.cases.push({name:'Available software-emulated WebGL selects the textured CPU world before any native renderer transfer'});

  const unsupported = await open({ width: 390, height: 844 });
  await unsupported.page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : native.call(this, type, ...args); };
  });
  await goHome(unsupported.page);
  const cpu = unsupported.page;
  await checkIllustration(cpu, unsupported.requests);
  await cpu.locator('#study-mode-3d').click();
  await cpu.waitForFunction(() => window.__worldState?.renderer === 'software' && window.__worldState.seated &&
    !!document.querySelector('#main.is-rendered[data-display-mode="3d"]'));
  const surface = cpu.locator('canvas[data-renderer="software"]');
  assert((await pixelSample(surface)).colors >= 12, 'Disabling WebGL activates a working perspective renderer');
  assert(!unsupported.requests.some(url => /world\.bundle|cat-world.*\.glb/.test(url)), 'The CPU-only path does not load WebGL or its model');
  await numbers(cpu, true);
  await picture(cpu, 'software-mobile-desk');
  await cpu.locator('[data-desk-action="notebook"]').click();
  await inspectNotebook(cpu, 'software-mobile', true);
  assert.equal(await cpu.evaluate(() => window.__worldState.deskProps.notebook), true);
  for (const [index,scene] of places.entries()) {
    await cpu.locator('#study-mode-2d').click();
    await cpu.locator('#world-stand').click();
    await seekGallery(cpu, index, 390);
    const district = await exploreAndReturn(cpu, scene, 'software', true);
    report.cases.push({name:'Software 3D gallery arrival, movement and return', site:scene.name, district});
  }
  assert.deepEqual(unsupported.errors, []); assert.deepEqual(unsupported.failures, []);
  await cpu.close();
  const failure = await open({width:390,height:844});
  await failure.page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await goHome(failure.page);
  const illustration = await failure.page.locator('#study-image').evaluate(img => img.currentSrc);
  await failure.page.locator('#study-mode-3d').click();
  await failure.page.waitForFunction(() => document.getElementById('main').dataset.displayMode === '2d' && document.getElementById('study-mode-status').textContent.includes('3D'));
  assert.equal(await failure.page.locator('#study-image').evaluate(img => img.currentSrc), illustration);
  assert(await failure.page.locator('#study-mode-3d').isEnabled());
  await choose(failure.page, '[data-illustration-link="profile"]', 'profile');
  await failure.page.close();
  report.cases.push({name:'Canceled or unavailable renderers leave the illustrated menu usable'});

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
