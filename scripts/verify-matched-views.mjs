// Isolate the real engines from UI chrome for like-for-like captures at the
// gallery photograph's 3:2 aspect ratio. Interaction through the public page
// lives in verify-home-browser.mjs. Neither test exposes a production debug API.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadImage } from '@napi-rs/canvas';
import { reviewViews, sourceAsset, compareFrames, frameDetail, saveComparison } from './helpers/visual-comparison.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(process.env.REVIEW_OUTPUT||join(root,'docs/reviews/live-study'),'views');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[], failures=[];
await mkdir(directory,{recursive:true});
try {
  for (const renderer of ['software','native']) {
    const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=origin+'/__camera_review__';
    await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;width:100%;height:100%}canvas{display:block;width:100vw;height:100vh}</style><canvas tabindex="0"></canvas>'}));
    await page.goto(url);
    page.setDefaultTimeout(120000);
    await page.evaluate(async renderer=>{
      const canvas=document.querySelector('canvas');
      window.viewErrors=[];
      if(renderer==='software') {
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:getContext.call(this,type,...args);};
      }
      const options={canvas,autoTime:false,seated:true,reducedMotion:true,now:()=>new Date('2026-11-18T03:00:00Z'),
        onError:e=>window.viewErrors.push(String(e?.message||e))};
      const mount=renderer==='software'?(await import('/js/software-world.js')).mountSoftwareWorld:(await import('/scene/world.bundle.js')).mountWorld;
      window.cameraReview=await mount(options);
      window.cameraReview.setLightingMode('day');
    },renderer);
    const canvas=page.locator('canvas').first();
    for(const key of reviewViews) {
      if(key!=='desk') assert(await page.evaluate(key=>window.cameraReview.explorePlace(key),key),'The chosen site is reachable: '+key);
      await page.waitForFunction(({key,renderer})=>{
        const engine=window.cameraReview, state=engine.getState();
        if(renderer==='software') return state.textureReady && state.texturedFaces>0 && state.renderedDistrict===(key==='desk'?'room':'landmark-'+key);
        if(key==='desk') return state.seated&&state.miniaturesReady&&state.catReady;
        return state.landmarksReady && state.focus==='landmark-'+key && state.placeArtReady&&state.photoPlace===key;
      },{key,renderer});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const performance=await page.evaluate(()=>window.cameraReview.getPerformance());
      const source=await loadImage(join(root,sourceAsset(key)));
      const arrival=await loadImage(await canvas.screenshot());
      const before=await page.evaluate(()=>window.cameraReview.getState().position);
      if(key!=='desk'){
        await page.evaluate(()=>window.cameraReview.setMovement({right:1}));
        try{
          await page.waitForFunction(start=>{const p=window.cameraReview.getState().position;return Math.hypot(p.x-start.x,p.z-start.z)>=.9;},before);
        }finally{await page.evaluate(()=>window.cameraReview.stopMovement());}
      }else{await page.evaluate(()=>window.cameraReview.look(.16,0));}
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const sideways=await loadImage(await canvas.screenshot());
      const actual=await page.evaluate(()=>window.cameraReview.getState().position);
      await page.evaluate(desk=>window.cameraReview.look(desk?-.31:.38,.025),key==='desk');
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const turned=await loadImage(await canvas.screenshot());
      const registration=compareFrames(source,arrival), translation=compareFrames(arrival,sideways), turn=compareFrames(sideways,turned);
      const lm=Math.hypot(actual.x-before.x,actual.z-before.z), detail=frameDetail(arrival), away=frameDetail(turned);
      const entry={renderer,key,width:arrival.width,height:arrival.height,position:before,metresTranslated:lm,registration,translation,turn,detail,turnedDetail:away,performance};
      results.push(entry);
      await saveComparison(directory,renderer+'-'+key,[
        {name:'reference',label:'2D source',image:source},{name:'arrival',label:'3D arrival / '+renderer,image:arrival},
        {name:'side',label:key==='desk'?'Seated look right':'Camera translated '+lm.toFixed(2)+' m',image:sideways},
        {name:'turn',label:'Camera turned',image:turned}]);
      const require=(value,why)=>{if(!value) failures.push(renderer+' '+key+': '+why);};
      require(arrival.width===720&&arrival.height===480,'common 3:2 camera capture');
      require(translation.meanRgbError>1.5&&turn.meanRgbError>4,'visible change under each camera motion');
      require(key==='desk'||lm>=.9,'real translation');
      require(detail.colors>1800&&away.colors>1250,'arrival and off-axis image retain full-color material detail');
      // The native indoor study is independently modelled. Outdoors both
      // renderers and the CPU desk are calibrated against their exact source.
      if(key!=='desk'||renderer==='software'){
        require(registration.meanRgbError<55,'registered RGB block error exceeds 55/255');
        require(registration.luminanceCorrelation>.55,'registered luminance correlation is below 0.55');
      }
      console.log(renderer,key,JSON.stringify({registration,translation:translation.meanRgbError,turn:turn.meanRgbError,detail}));
    }
    assert.deepEqual(await page.evaluate(()=>window.viewErrors),[]);
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>window.cameraReview.dispose());
    await page.close();
  }
} finally {
  await writeFile(join(directory,'view-metrics.json'),JSON.stringify({sampling:'96 by 64 RGB area resample; errors are code values 0 to 255',results,failures},null,2)+'\n');
  await browser.close();
}
assert.deepEqual(failures,[]);
