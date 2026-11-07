/** Real Chromium checks for the automatic live study and retained walking scene.
 * Start the preview server first. SwiftShader is not a device FPS benchmark. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = new URL('../docs/reviews/live-study/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { browser: await browser.version(), renderer: 'Chromium / ANGLE SwiftShader (software)', checkedAt: new Date().toISOString(), cases: [] };
async function picture(page, name, fullPage = false) {
  const bytes = await page.screenshot({ fullPage, timeout: 90000 });
  const img = await loadImage(bytes), c = createCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0);
  await writeFile(new URL(name + '.webp', output), await c.encode('webp', 82));
}
async function open(viewport, night = false, gateEngine = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // Hold civil time only; leave RAF/performance/timers native.
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
    document.addEventListener('DOMContentLoaded', () => {
      const canvas = document.getElementById('world-canvas'); window.__originalCanvas = canvas;
      canvas?.addEventListener('worldstate', e => { window.__worldState = e.detail; });
      const observer = new MutationObserver(() => {
        if (!window.__firstFrame && document.getElementById('main').classList.contains('is-rendered')) window.__firstFrame = performance.now();
      });
      observer.observe(document.getElementById('main'), {attributes:true, attributeFilter:['class']});
    });
  });
  const errors = [], responses = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) responses.push({url:r.url(), status:r.status()}); });
  page.on('request', r => requests.push(r.url()));
  let release;
  if (gateEngine) {
    const hold = new Promise(resolve => { release = resolve; });
    await page.route('**/scene/world.bundle.js*', async route => { await hold; await route.continue(); });
  }
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return { page, errors, responses, requests, release };
}
async function settledStudy(page) {
  await page.waitForFunction(() => document.getElementById('main').classList.contains('is-rendered') && window.__worldState?.seated && window.__worldState?.catReady && window.__worldState?.miniaturesReady, null, {timeout:180000});
}
try {
  for (const [name, viewport, night] of [['desktop', {width:1440,height:900}, false], ['mobile', {width:390,height:844}, false], ['narrow-night', {width:320,height:740}, true]]) {
    const { page, errors, responses, requests, release } = await open(viewport, night, name === 'desktop');
    if (release) {
      assert.equal(await page.locator('#home-menu a').count(), 5);
      for (const link of await page.locator('#home-menu a').all()) assert(await link.isVisible(), 'menus work before the renderer downloads');
      assert(await page.locator('#world-stand').isDisabled()); release();
    }
    await settledStudy(page);
    assert(await page.evaluate(() => window.__glCalls > 0), 'homepage must automatically create a real WebGL context');
    assert(!requests.some(url => /\/images\/world\/seated-/.test(url)), 'normal live entry must not download a still poster');
    assert.equal(await page.locator('#world-clock').textContent(), night ? '23:42' : '12:42');
    assert.equal(await page.locator('#home-menu a').count(), 5);
    for (const link of await page.locator('#home-menu a').all()) assert(await link.isVisible());
    assert(await page.locator('#world-stand').isEnabled());
    assert(!await page.locator('#main').evaluate(e => e.classList.contains('is-walking')));
    assert(await page.evaluate(() => [...document.querySelectorAll('.home-memories img')].every(img => img.complete && img.naturalWidth > 0)));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    assert(!/FROM KARATSU|書斎へ、ようこそ|唐津から早稲田へ/.test(await page.locator('body').innerText()));
    await picture(page, name, true);
    assert.deepEqual(responses, []); assert.deepEqual(errors, []);
    report.cases.push({name, automaticLive3D:true, menusBeforeRenderer:!!release, posterRequests:0, firstFrameMs:await page.evaluate(()=>window.__firstFrame), canvas:await page.locator('#world-canvas').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})), resources: await page.evaluate(() => performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.decodedBodySize}))) });
    if (name !== 'desktop') { await page.close(); continue; }
    // The full-size seated composition is captured above. Use a smaller live
    // canvas for the software-GPU route; do not change scene/camera geometry.
    await page.setViewportSize({width:640,height:480});
    const contexts = await page.evaluate(() => window.__glCalls), initialEngineRequests = requests.filter(u=>/world\.bundle|cat-world.*\.glb/.test(u)).length;
    const riseStart = performance.now();
    await page.locator('#world-stand').click();
    await page.waitForFunction(() => window.__worldState?.standing, null, {timeout:120000});
    const riseMs = performance.now()-riseStart;
    assert(await page.locator('#world-live-controls').isVisible());
    assert.equal(await page.locator('#home-menu').isVisible(), false);
    await page.locator('#world-settings summary').click();
    await page.locator('#world-seat').click();
    await page.waitForFunction(() => window.__worldState?.seated && !document.getElementById('main').classList.contains('is-walking'), null, {timeout:120000});
    assert(await page.locator('#home-menu').isVisible());
    assert(await page.locator('#world-stand').isEnabled());
    assert.equal(await page.evaluate(() => window.__glCalls), contexts, 'sitting must retain the renderer/context');
    assert(await page.evaluate(()=>document.getElementById('world-canvas')===window.__originalCanvas));
    await page.locator('#world-stand').click();
    await page.waitForFunction(() => window.__worldState?.standing && window.__worldState?.outdoorsReady, null, {timeout:120000});
    assert.equal(await page.evaluate(() => window.__glCalls), contexts, 'second rise must reuse the same context');
    assert.equal(requests.filter(u=>/world\.bundle|cat-world.*\.glb/.test(u)).length, initialEngineRequests, 'standing must not re-download the engine or cat');
    await page.setViewportSize({width:320,height:320});
    await page.locator('#world-travel').click();
    await page.waitForFunction(() => window.__worldState?.mode === 'outside' && !window.__worldState?.travel, null, {timeout:180000});
    await page.setViewportSize({width:960,height:640});
    await picture(page,'garden-bundle');
    assert.deepEqual(errors, []); assert.deepEqual(responses, []);
    report.cases.push({name:'walking lifecycle', riseMs, timingNote:'Local software-renderer observation, not a device benchmark', doorway:true, sitAtDesk:true, sameContextAndCanvas:true, engineAndCatRedownloads:0, browserErrors:0});
    await page.close();
  }
  const fallback = await browser.newPage({viewport:{width:390,height:844}});
  await fallback.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type,...args) { return type === 'webgl2' ? null : original.call(this,type,...args); }; });
  await fallback.goto(base); await fallback.waitForSelector('.is-fallback');
  assert(await fallback.locator('#home-menu').isVisible()); assert(await fallback.locator('#world-stand').isDisabled());
  await fallback.waitForFunction(()=>document.querySelector('.world-poster img').naturalWidth>0);
  report.cases.push({name:'WebGL unavailable', nativeMenu:true, fallbackPoster:true}); await fallback.close();
  const nojs = await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await nojs.goto(base); assert.equal(await nojs.locator('#home-menu a').count(),5); assert(await nojs.locator('#home-menu').isVisible());
  report.cases.push({name:'JavaScript disabled', nativeMenu:true}); await nojs.close();
  report.sourceHashes = {};
  for (const file of ['index.html','css/world.css','js/world-ui.js','scene/world.bundle.js','scripts/verify-home-browser.mjs']) report.sourceHashes[file] = createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,cases:report.cases.map(({resources,...item})=>item)},null,2));
} finally { await browser.close(); }
