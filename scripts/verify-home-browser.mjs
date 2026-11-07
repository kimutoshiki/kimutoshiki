/** Real Chromium checks for the static homepage and the opt-in walking flow.
 * Run with the preview server, and CHROMIUM_PATH if Chromium isn't /usr/bin/chromium.
 * SwiftShader verifies rendering and interaction; this is not a device FPS benchmark. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = new URL('../docs/reviews/seated-home/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { browser: await browser.version(), renderer: 'Chromium / ANGLE SwiftShader (software)', checkedAt: new Date().toISOString(), cases: [] };
async function picture(page, name, fullPage = false) {
  const bytes = await page.screenshot({ fullPage, timeout: 90000 });
  const img = await loadImage(bytes), c = createCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0);
  await writeFile(new URL(name + '.webp', output), await c.encode('webp', 82));
}
async function open(viewport, night = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // Hold civil time only; leave RAF/performance/timers entirely native.
  await page.addInitScript(iso => {
    const ActualDate = Date, instant = ActualDate.parse(iso);
    window.Date = class extends ActualDate {
      constructor(...args) { super(...(args.length ? args : [instant])); }
      static now() { return instant; }
    };
  }, night ? '2026-11-07T14:42:00Z' : '2026-11-07T03:42:00Z');
  await page.addInitScript(() => {
    window.__glCalls = 0; const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (type === 'webgl2' || type === 'webgl') window.__glCalls++; return getContext.call(this, type, ...args); };
    document.addEventListener('DOMContentLoaded', () => document.getElementById('world-canvas')?.addEventListener('worldstate', e => { window.__worldState = e.detail; }));
  });
  const errors = [], responses = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) responses.push({url:r.url(), status:r.status()}); });
  page.on('request', r => requests.push(r.url()));
  await page.goto(base, { waitUntil: 'networkidle' });
  return { page, errors, responses, requests };
}
try {
  for (const [name, viewport, night] of [['desktop', {width:1440,height:900}, false], ['mobile', {width:390,height:844}, false], ['narrow-night', {width:320,height:740}, true]]) {
    const { page, errors, responses, requests } = await open(viewport, night);
    assert.equal(await page.evaluate(() => window.__glCalls), 0, 'homepage must not create a WebGL context');
    assert(!requests.some(url => /\/scene\/|\.glb|three.*\.js/.test(url)), 'homepage must not download the world engine or models');
    assert.equal(await page.locator('#world-clock').textContent(), night ? '23:42' : '12:42');
    assert.equal(await page.locator('#home-menu a').count(), 5);
    for (const link of await page.locator('#home-menu a').all()) assert(await link.isVisible());
    assert(await page.locator('#world-stand').isVisible());
    assert(await page.evaluate(() => [...document.querySelectorAll('.world-poster img,.home-memories img')].every(img => img.complete && img.naturalWidth > 0)));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await picture(page, name, true);
    assert.deepEqual(responses, []); assert.deepEqual(errors, []);
    report.cases.push({name, initialWebGLContexts:0, initialWorldRequests:0, requests:requests.length, resources: await page.evaluate(() => performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.decodedBodySize}))) });
    if (name !== 'desktop') { await page.close(); continue; }
    // Use a smaller live canvas for software-GPU verification; the static
    // desktop composition above remains checked at the full 1440px viewport.
    await page.setViewportSize({width:960,height:640});
    console.log('Starting the real scene at 960 × 640.');
    await page.locator('#world-stand').click({noWaitAfter:true});
    console.log('Stand clicked; waiting for the real scene.');
    try { await page.waitForFunction(() => window.__worldState?.standing && window.__worldState?.catReady && window.__worldState?.landmarksReady, null, {timeout:180000}); } catch(error) { console.log(JSON.stringify({state:await page.evaluate(()=>window.__worldState),errors,responses,requests:requests.slice(-15)},null,2)); await picture(page,'failed-standing'); throw error; }
    console.log('Standing scene and assets ready.');
    assert(await page.locator('#world-live-controls').isVisible());
    assert(await page.locator('#world-clock').isVisible());
    assert.equal(await page.locator('#home-menu').isVisible(), false);
    assert.equal(await page.evaluate(() => window.__worldState.time.label), '12:42');
    await picture(page, 'standing');
    await page.setViewportSize({width:320,height:320});
    await page.locator('#world-settings summary').click();
    await page.locator('#world-seat').click();
    try { await page.waitForFunction(() => !document.getElementById('main').classList.contains('is-live'), null, {timeout:240000}); }
    catch (error) {
      console.log('Seat timeout', JSON.stringify(await page.evaluate(() => window.__worldState)));
      await picture(page,'failed-sitting');
      await page.keyboard.press('Escape');
      console.log('Stopped at', JSON.stringify(await page.evaluate(() => window.__worldState)));
      throw error;
    }
    console.log('Seated again.'); assert(await page.locator('#home-menu').isVisible());
    assert(await page.locator('#world-stand').isEnabled());
    await page.locator('#world-stand').click();
    await page.waitForFunction(() => window.__worldState?.standing && document.getElementById('main').classList.contains('is-live'), null, {timeout:120000});
    await page.setViewportSize({width:320,height:320});
    await page.locator('#world-travel').click();
    await page.waitForFunction(() => window.__worldState?.mode === 'outside' && !window.__worldState?.travel, null, {timeout:240000});
    console.log('Walked through the doorway.');
    await page.setViewportSize({width:960,height:640});
    await picture(page, 'garden-day');
    await page.locator('#world-settings summary').click();
    await page.locator('#world-lighting').click(); // auto -> day
    await page.locator('#world-lighting').click(); // day -> night
    await page.locator('#world-settings summary').click();
    await page.waitForFunction(() => window.__worldState?.lightingMode === 'night');
    console.log('Night preview ready.'); await picture(page, 'garden-night');
    assert.equal(await page.evaluate(() => window.__worldState.time.label), '12:42', 'lighting preview must not falsify the clock');
    // The full physical round trip is independently rendered by the capture
    // script. Here verify the UI return action starts that actual route; the
    // seated-state handoff and remount were exercised at the desk above.
    await page.setViewportSize({width:320,height:320});
    await page.locator('#world-settings summary').click();
    await page.locator('#world-lighting').click(); // night -> actual daytime
    await page.locator('#world-seat').click();
    await page.waitForFunction(() => window.__worldState?.posture === 'returning-to-seat', null, {timeout:30000});
    assert.deepEqual(errors, []); assert.deepEqual(responses, []);
    report.cases.push({name:'walking lifecycle', stand:true, doorway:true, night:true, sitAtDesk:true, remount:true, outsideReturnButtonStartsRoute:true, fullPhysicalReturnEvidence:'manifest.json / lifecycle', browserErrors:0});
    await page.close();
  }
  const fallback = await browser.newPage({viewport:{width:390,height:844}});
  await fallback.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type,...args) { return type === 'webgl2' ? null : original.call(this,type,...args); }; });
  await fallback.goto(base); await fallback.locator('#world-stand').click();
  await fallback.waitForSelector('.is-fallback');
  assert(await fallback.locator('#home-menu').isVisible());
  assert(await fallback.locator('#world-stand').isDisabled());
  report.cases.push({name:'WebGL unavailable', nativeMenu:true, explanatoryFallback:true});
  await fallback.close();
  const nojs = await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await nojs.goto(base); assert.equal(await nojs.locator('#home-menu a').count(),5); assert(await nojs.locator('#home-menu').isVisible());
  report.cases.push({name:'JavaScript disabled', nativeMenu:true}); await nojs.close();
  report.sourceHashes = {};
  for (const file of ['index.html','css/world.css','js/world-ui.js','scene/world.bundle.js','scripts/verify-home-browser.mjs']) report.sourceHashes[file] = createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
