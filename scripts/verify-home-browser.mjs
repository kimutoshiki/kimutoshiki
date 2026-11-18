/** End-to-end review of the native illustrated home and opt-in WebGL study.
 * Start the preview server first. Software-renderer times are observations only. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { OUTDOOR_VIEWS, districtAt, worldFov } from '../scene/world-layout.js';
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
const blenderAsset = /\/assets\/models\/blender\/([^/?]+)\.glb/;
const loadedModels = requests => [...new Set(requests.map(url=>url.match(blenderAsset)?.[1]).filter(Boolean))];
const engineResource = /\/(?:scene|models|js\/vendor)\/|\/js\/software-[^/?]+\.js|\/assets\/models\/blender\/|\/js\/blender-software-world\.js|\/images\/study\/desk-(?:joinery|room)\.webp/;
const galleryResource = /\/images\/outdoors\//;
const places = [
  { key:'okuma-auditorium', name:'大隈講堂', detail:'時計塔' },
  { key:'okuma-statue', name:'大隈重信像', detail:'杖' },
  { key:'karatsu-castle', name:'唐津城', detail:'本丸' },
  { key:'karatsu-bank', name:'旧唐津銀行', detail:'れんが' },
];
const outdoorResource = /\/assets\/models\/blender\/(?:waseda-campus|karatsu-town)\.glb|world-chunk-place-(?:photo|settings)-/;

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
    document.addEventListener('studyprojection', e => { window.__studyPoints=e.detail.points; },true);
    document.addEventListener('studysubject',e=>{if(e.detail.type==='hover')window.__hoverSubject=e.detail.key;},true);
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
  const dialog = page.getByRole('dialog', {name:'ブログの手帖'});
  const stage = dialog.locator('.notebook-stage');
  const canvas = stage.locator('canvas');
  await dialog.waitFor();
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelector('.notebook-stage canvas')?.width > 320 ||
    document.querySelector('.notebook-stage canvas')?.clientWidth > 150);
  const article=dialog.locator('.notebook-entry-list article');
  await article.first().waitFor();
  const latest=await page.evaluate(async()=>{
    const html=await (await fetch('blog.html')).text(),doc=new DOMParser().parseFromString(html,'text/html');
    return [...doc.querySelectorAll('.blog-item[id]')].flatMap(item=>{
      const title=item.querySelector('.blog-title')?.textContent.trim(),body=item.querySelector('.blog-content-inner')?.textContent.trim().replace(/\s+/g,' ');
      return title&&body&&!/^(本文は)?準備中[。.!！…\s]*$/.test(body)?[{title,body,id:item.id,date:item.querySelector('.blog-date').textContent.trim()}]:[];
    });
  });
  assert(latest.length>=3);
  async function checkArticle(n) {
    const entry=article.first(),link=entry.locator('a');
    assert.equal(await link.textContent(),latest[n].title);
    assert.equal(new URL(await link.getAttribute('href'),page.url()).hash.slice(1),latest[n].id);
    assert((await entry.locator('small').textContent()).includes(latest[n].date));
    const excerpt=(await entry.locator('p').textContent()).replace(/…$/,'');
    assert(excerpt.length>0&&latest[n].body.startsWith(excerpt),'Notebook text is an excerpt of the same published post');
  }
  await checkArticle(0);
  assert.equal(await stage.getAttribute('data-position'), 'spread');
  const onIllustration = name.endsWith('-2d');
  if (onIllustration) assert.equal(await page.locator('#study-artwork .notebook-on-desk').count(), 0, 'Reduced motion opens the spread immediately without animating the desk');
  const open = await pixelSample(canvas);
  assert(open.colors > 32 && open.width > 100 && open.height > 80, 'The open spread contains drawn, varied artwork');
  if (capture) await picture(page, name + '-sketchbook');
  assert(await dialog.getByRole('button',{name:'前のページ'}).isDisabled());
  await dialog.getByRole('button',{name:'次のページ'}).click();
  await checkArticle(2);
  const pageOne=await pixelSample(canvas);
  assert.notEqual(pageOne.hash,open.hash,'The printed canvas changes to the next pair of published posts');
  await dialog.getByRole('button',{name:'前のページ'}).click();
  await checkArticle(0);
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
async function physicalDeskActions(page) {
  const canvas=page.locator('#world-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect=await canvas.boundingBox();
  const aspect=rect.width/rect.height;
  const projectionScale=Math.tan(22*Math.PI/180)/Math.tan(worldFov(aspect,true)*Math.PI/360);
  // Measured rays on the actual Blender meshes, normalized for a 3:2 camera
  // at vertical FOV 44°. Reproject the same rays into this viewport.
  async function aim(subject,[u,v]) {
    const cx=rect.x+rect.width*(.5+(u-.5)*1.5/aspect*projectionScale);
    const cy=rect.y+rect.height*(.5+(v-.5)*projectionScale);
    const unit=rect.height/480;
    for(const radius of [0,8,16,25,35,49,64]){
      for(const [dx,dy] of radius?[[1,0],[-1,0],[0,-1],[0,1],[.7,-.7],[-.7,.7],[.7,.7],[-.7,-.7]]:[[0,0]]){
        const x=Math.round(cx+dx*radius*unit),y=Math.round(cy+dy*radius*unit);
        if(!await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.id==='world-canvas',[x,y]))continue;
        await page.mouse.move(x,y);
        if(await page.evaluate(key=>window.__hoverSubject===key,subject))return {x,y};
      }
    }
    throw Error('No exposed, ray-pickable physical surface for '+subject+' around '+[cx,cy]);
  }
  const before=await page.evaluate(()=>({position:window.__worldState.position,point:window.__studyPoints.blog}));
  const from={x:rect.x+rect.width*.49,y:rect.y+rect.height*.14};
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+rect.width*.11,from.y+rect.height*.035,{steps:5});await page.mouse.up();
  await page.waitForFunction(previous=>Math.abs(window.__studyPoints.blog[0]-previous[0])>.013,before.point);
  assert.deepEqual(await page.evaluate(()=>window.__worldState.position),before.position);
  await canvas.focus();await page.keyboard.press('Home');
  await page.waitForFunction(previous=>Math.abs(window.__studyPoints.blog[0]-previous[0])<.004,before.point);
  for(const [key,ray,expected] of [
    ['profile',[.1973,.5093],'profile'],['contact',[.6248,.5333],'contact'],
    ['drawer',[.2881,.6251],null],['cat',[.3046,.8205],null],['blog',[.4699,.5054],'blog'],
  ]){
    const hit=await aim(key,ray);
    let crop;
    if(key==='cat'){
      const screen=page.viewportSize();
      crop={x:Math.max(0,Math.min(screen.width-90,hit.x-45)),y:Math.max(0,Math.min(screen.height-90,hit.y-45)),width:90,height:90};
      const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
      crop.x+=scroll.x;crop.y+=scroll.y;
    }
    const beforeCat=crop&&await page.screenshot({clip:crop});
    await page.mouse.click(hit.x,hit.y);
    if(key==='cat'){
      await page.waitForFunction(()=>window.__worldState.deskAction==='cat' && /猫|ねこ/.test(window.__worldState.deskStatus));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert(!(await page.screenshot({clip:crop})).equals(beforeCat),'A physical tap changes the pose of the visible cat');
    }else if(key==='drawer'){
      await page.waitForFunction(()=>window.__worldState.deskProps.drawer);
      assert.equal(await page.locator('#world-prop-drawer').getAttribute('aria-pressed'),'true');
      await page.locator('#world-prop-drawer').click();
    }else if(key==='blog'){
      await inspectNotebook(page,'desktop-3d-physical',true);
      await page.locator('#world-prop-notebook').click();
    }else{
      const card=page.locator('.study-link-card');
      await card.waitFor();
      assert.equal(new URL(await card.locator('.study-link-go').getAttribute('href'),page.url()).pathname,'/'+expected+'.html');
      if(key==='contact')assert(await page.evaluate(()=>window.__worldState.deskProps.letter));
      await card.locator('.study-link-close').click();
      if(key==='contact')await page.locator('#world-prop-letter').click();
    }
  }
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
    return s?.standing && s.mode === 'outside' && s.geometryReady && s.geometrySource==='blender' && s.placeKey===key && s.focus === 'landmark-' + key;
  }, scene.key, { timeout: 180000 });
  const state = await page.evaluate(() => window.__worldState);
  const eye=OUTDOOR_VIEWS[scene.key].eye;
  assert(Math.hypot(state.position.x-eye[0],state.position.z-eye[1]) < .12, 'The camera starts physically at the depicted site');
  assert.equal(state.district, districtAt({x:eye[0],z:eye[1]}));
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
    // Reopening the saved viewpoint waits for layout/IntersectionObserver and
    // the next complete physical frame, even when the canvas was hidden.
    await page.waitForFunction(() => {
      const target=document.querySelector('canvas[data-renderer="software"]');
      if (!target || target.width<100 || target.height<100) return false;
      const {data}=target.getContext('2d').getImageData(0,0,target.width,target.height);
      const samples=new Set();
      for(let i=0;i<data.length;i+=4*107) {
        samples.add((data[i]<<16)|(data[i+1]<<8)|data[i+2]);
        if(samples.size>=12)return true;
      }
      return false;
    },null,{timeout:30000});
    const before = await pixelSample(surface);
    assert(before.colors >= 12, 'The CPU renderer paints the actual exterior');
    await page.locator('#world-canvas').focus();
    await page.keyboard.down('w');
    try {
      let changed=false;
      for(let i=0;i<36 && !changed;i++) {
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        changed=(await pixelSample(surface)).hash!==before.hash;
      }
      assert(changed,'A held movement key changes the actual rendered perspective');
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
    if(name==='desktop')await physicalDeskActions(page);
    const card = await choose(page, '[data-live-link="blog"]', 'blog');
    assert.equal(await page.evaluate(() => window.__worldState.deskProps.notebook), true, 'The live notebook actually opens on selection');
    if (name === 'desktop') {
      assert(await page.locator('#home-menu [data-study-link="blog"]').evaluate(link => link.classList.contains('is-linked')), 'The selected live object highlights its matching menu entry');
    }
    await inspectNotebook(page, name + '-3d', true);
    await card.waitFor({ state:'hidden' });
    assert(!requests.some(url => outdoorResource.test(url)), 'Desk inspection does not load the exterior');
    const contexts = await page.evaluate(() => window.__glCalls);
    const firstEngineRequests = requests.filter(url => /world\.bundle|study-room\.glb|cat\.glb/.test(url)).length;
    await page.locator('#study-mode-2d').click();
    await page.waitForFunction(() => document.getElementById('main').dataset.displayMode === '2d');
    assert(await page.locator('#study-artwork').isVisible());
    assert(!await page.locator('.study-pin[data-live-link]').first().isVisible());
    await live(page);
    assert.equal(await page.evaluate(() => window.__glCalls), contexts, 'Switching modes reuses its WebGL context');
    assert.equal(requests.filter(url => /world\.bundle|study-room\.glb|cat\.glb/.test(url)).length, firstEngineRequests);
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
  await animated.page.getByRole('dialog', {name:'ブログの手帖'}).waitFor();
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
  assert(!slow.requests.some(url => /(?:study-room|cat)\.glb/.test(url)), 'A canceled world import cannot start a fresh cat download');
  await slow.page.close();

  const emulated=await open({width:720,height:480},{rendererName:null});
  await goHome(emulated.page);
  await checkIllustration(emulated.page,emulated.requests);
  await live(emulated.page);
  assert(await emulated.page.evaluate(()=>{
    const gl=document.querySelector('#world-canvas').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
    return /swiftshader|llvmpipe|softpipe|software renderer|software rasterizer|microsoft basic render/i.test(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL||gl.RENDERER));
  }),
    'The CI browser really exposes a working software WebGL driver');
  assert.equal(await emulated.page.evaluate(()=>window.__worldState.webgl&&window.__worldState.geometrySource==='blender'),true);
  assert.equal(await emulated.page.locator('canvas[data-renderer="software"]').count(),0,'A working WebGL driver draws the original meshes natively');
  assert(loadedModels(emulated.requests).includes('study-room')&&loadedModels(emulated.requests).includes('cat'));
  assert(!emulated.requests.some(url=>url.includes('blender-software-world.js')));
  await emulated.page.locator('#world-stand').click();
  await emulated.page.waitForFunction(()=>window.__worldState?.standing && window.__worldState.geometryReady);
  await emulated.page.locator('#world-seat').click();
  await emulated.page.waitForFunction(()=>window.__worldState?.seated);
  assert.deepEqual(emulated.errors,[]);assert.deepEqual(emulated.failures,[]);
  await emulated.page.close();
  report.cases.push({name:'Working software WebGL keeps the same native Blender scene and models'});

  const unsupported = await open({ width: 390, height: 844 });
  await unsupported.page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : native.call(this, type, ...args); };
  });
  await goHome(unsupported.page);
  const cpu = unsupported.page;
  await checkIllustration(cpu, unsupported.requests);
  await cpu.locator('#study-mode-3d').click();
  await cpu.waitForFunction(() => window.__worldState?.geometrySource === 'blender' && window.__worldState.seated && window.__worldState.catReady && window.__worldState.miniaturesReady &&
    !!document.querySelector('#main.is-rendered[data-display-mode="3d"]'));
  const surface = cpu.locator('canvas[data-renderer="software"]');
  assert((await pixelSample(surface)).colors >= 12, 'Disabling WebGL activates a working perspective renderer');
  assert(unsupported.requests.some(url=>url.includes('/js/blender-software-world.js')));
  assert.deepEqual(loadedModels(unsupported.requests).sort(),['cat','study-room','okuma-auditorium','okuma-statue','karatsu-castle','karatsu-bank'].sort(),'Without WebGL the same real desk, animated cat and four miniatures are decoded');
  assert(!unsupported.requests.some(url=>/\/images\/outdoors\//.test(url)),'The 3D desk does not request painted outdoor backdrops');
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
    assert(loadedModels(unsupported.requests).includes(index<2?'waseda-campus':'karatsu-town'));
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
