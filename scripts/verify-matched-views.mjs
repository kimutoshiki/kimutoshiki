// Isolate the real engines from UI chrome for like-for-like captures at the
// gallery photograph's 3:2 aspect ratio. Interaction through the public page
// lives in verify-home-browser.mjs. Neither test exposes a production debug API.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadImage } from '@napi-rs/canvas';
import { reviewViews, sourceAsset, compareFrames, compareSubject, frameDetail, saveComparison } from './helpers/visual-comparison.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(process.env.REVIEW_OUTPUT||join(root,'docs/reviews/live-study'),'views');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[], failures=[];
async function settle(page, renderer) {
  if(renderer==='software') await page.waitForFunction(()=>!window.cameraReview.getPerformance().fast);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
async function strafe(page){
  return page.evaluate(async()=>{
    const e=window.cameraReview,start=e.getState().position,t0=performance.now();
    let previous=t0,frames=e.getPerformance().frames,samples=[],distance=0;
    e.setMovement({right:1});
    try {
      do {
        await new Promise(requestAnimationFrame);
        const data=e.getPerformance(),now=performance.now(),end=e.getState().position;
        distance=Math.hypot(end.x-start.x,end.z-start.z);
        if(data.frames!==frames) {samples.push(now-previous);frames=data.frames;previous=now;}
      }while((distance<1.2||samples.length<8)&&performance.now()-t0<9000);
    }finally{e.stopMovement();}
    samples.sort((a,b)=>a-b);
    const median=samples[Math.floor(samples.length/2)],p95=samples[Math.floor(samples.length*.95)];
    return {frames:samples.length,elapsedMs:Math.round(performance.now()-t0),medianFrameMs:+median.toFixed(1),p95FrameMs:+p95.toFixed(1),medianFps:+(1000/median).toFixed(1)};
  });
}
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
      let movingPerformance;
      if(key!=='desk') movingPerformance=await strafe(page);
      else await page.evaluate(()=>window.cameraReview.look(.16,0));
      await settle(page,renderer);
      const sideways=await loadImage(await canvas.screenshot());
      const actual=await page.evaluate(()=>window.cameraReview.getState().position);
      await page.evaluate(desk=>window.cameraReview.look(desk?-.31:.38,.025),key==='desk');
      await settle(page,renderer);
      const turned=await loadImage(await canvas.screenshot());
      const surround=[];
      if(key!=='desk'){
        for(const [name,delta] of [['right',Math.PI/2-.38],['rear',Math.PI/2]]){
          await page.evaluate(delta=>window.cameraReview.look(delta,0),delta);
          await settle(page,renderer);
          surround.push({name,label:name==='right'?'Perpendicular to arrival':'Facing away from the landmark',image:await loadImage(await canvas.screenshot())});
        }
      }
      const registration=compareFrames(source,arrival), translation=compareFrames(arrival,sideways), turn=compareFrames(sideways,turned);
      const lm=Math.hypot(actual.x-before.x,actual.z-before.z), detail=frameDetail(arrival), away=frameDetail(turned);
      const subject=compareSubject(key,source,arrival);
      const entry={renderer,key,subject,width:arrival.width,height:arrival.height,position:before,metresTranslated:lm,registration,translation,turn,detail,turnedDetail:away,surroundDetail:surround.map(view=>frameDetail(view.image)),performance,movingPerformance};
      results.push(entry);
      await saveComparison(directory,renderer+'-'+key,[
        {name:'reference',label:'2D source',image:source},{name:'arrival',label:'3D arrival / '+renderer,image:arrival},
        {name:'side',label:key==='desk'?'Seated look right':'Camera translated '+lm.toFixed(2)+' m',image:sideways},
        {name:'turn',label:'Camera turned',image:turned},...surround]);
      const require=(value,why)=>{if(!value) failures.push(renderer+' '+key+': '+why);};
      require(arrival.width===720&&arrival.height===480,'common 3:2 camera capture');
      require(translation.meanRgbError>1.5&&turn.meanRgbError>4,'visible change under each camera motion');
      require(key==='desk'||lm>=.9,'real translation');
      require(detail.colors>1800&&away.colors>1250,'arrival and off-axis image retain full-color material detail');
      // The native indoor study is independently modelled. Outdoors both
      // renderers and the CPU desk are calibrated against their exact source.
      if(key!=='desk'||renderer==='software'){
        if(renderer==='software')require(subject.meanRgbError<27&&subject.luminanceCorrelation>.74,'the foreground subject itself differs from the corresponding artwork');
        const limit=renderer==='software'?27:55,minimum=renderer==='software'?.80:.55;
        require(registration.meanRgbError<limit,'registered RGB block error exceeds '+limit+'/255');
        require(registration.luminanceCorrelation>minimum,'registered luminance correlation is below '+minimum);
      }
      if(renderer==='software'){
        const idle=await page.evaluate(async()=>{
          const e=window.cameraReview,start=e.getPerformance().frames;
          await new Promise(resolve=>setTimeout(resolve,260));return e.getPerformance().frames-start;
        });
        require(idle<=1,'still CPU view kept repainting while idle');
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
