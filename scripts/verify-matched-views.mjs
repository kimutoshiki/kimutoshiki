// Capture the production CPU and WebGL engines at the same camera positions.
// verify-home-browser.mjs covers the switches, controls and other public UI.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadImage } from '@napi-rs/canvas';
import { HOME, OUTDOOR_VIEWS, regionalHeight } from '../scene/world-layout.js';
import { reviewViews, compareFrames, frameDetail, saveComparison } from './helpers/visual-comparison.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(process.env.REVIEW_OUTPUT||join(root,'docs/reviews/live-study'),'views');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[], pairs=[], failures=[], reference=new Map();
const outdoorModels=reviewViews.slice(1);
const deskModels=['cat','study-room',...outdoorModels.map(key=>'desk-'+key)].sort();
const regionalModels=['waseda-campus','karatsu-town','waseda-tree-crowns','karatsu-tree-crowns'];

async function settle(page){
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function strafe(page){
  return page.evaluate(async()=>{
    const engine=window.cameraReview,start=engine.getState().position,t0=performance.now();
    let previous=t0,frames=engine.getPerformance().frames,distance=0;
    const samples=[];
    engine.setMovement({right:1});
    try{
      do{
        await new Promise(requestAnimationFrame);
        const stats=engine.getPerformance(),now=performance.now(),end=engine.getState().position;
        distance=Math.hypot(end.x-start.x,end.z-start.z);
        if(stats.frames!==frames){samples.push(now-previous);frames=stats.frames;previous=now;}
      }while((distance<1.2||samples.length<5)&&performance.now()-t0<10000);
    }finally{engine.stopMovement();}
    if(!samples.length)throw Error('The view did not render any walking frames');
    samples.sort((a,b)=>a-b);
    return {frames:samples.length,elapsedMs:Math.round(performance.now()-t0),distance,
      medianFrameMs:Math.round(samples[Math.floor(samples.length/2)]),p95FrameMs:Math.round(samples[Math.floor(samples.length*.95)])};
  });
}
await mkdir(directory,{recursive:true});
try{
  for(const renderer of ['software','native']){
    const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[],assets=new Set(),retiredViews=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{
      const path=new URL(response.url()).pathname, model=path.match(/\/assets\/models\/blender\/([\w-]+)\.glb$/);
      if(response.status()>=400)errors.push(response.status()+' '+path);
      if(response.ok()&&model)assets.add(model[1]);
      if(/\/images\/(?:outdoors|study)\/|\/js\/software-(?:world|desk|garden)\.js/.test(path))retiredViews.push(path);
    });
    const url=origin+'/__camera_review__';
    await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;width:100%;height:100%}canvas{display:block;width:100vw;height:100vh}</style><canvas tabindex="0"></canvas>'}));
    page.setDefaultTimeout(120000);
    await page.goto(url);
    await page.evaluate(async renderer=>{
      const canvas=document.querySelector('canvas');
      window.viewErrors=[];
      if(renderer==='software'){
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:getContext.call(this,type,...args);};
      }
      const options={canvas,autoTime:false,seated:true,reducedMotion:true,now:()=>new Date('2026-11-18T03:00:00Z'),
        onError:error=>window.viewErrors.push(String(error?.message||error))};
      const mount=renderer==='software'?(await import('/js/blender-software-world.js')).mountSoftwareWorld:(await import('/scene/world.bundle.js')).mountWorld;
      window.cameraReview=await mount(options);
      window.cameraReview.setLightingMode('day');
    },renderer);
    const canvas=page.locator('canvas').first();
    async function shot(){await settle(page);return loadImage(await canvas.screenshot());}
    async function turn(horizontal,vertical){
      await page.evaluate(([x,y])=>window.cameraReview.look(x,y),[horizontal,vertical]);
      return shot();
    }
    for(const key of reviewViews){
      const home=key==='desk',view=OUTDOOR_VIEWS[key];
      if(!home)assert(await page.evaluate(key=>window.cameraReview.explorePlace(key),key),'The chosen place is reachable: '+key);
      await page.waitForFunction(key=>{
        const state=window.cameraReview.getState(),stats=window.cameraReview.getPerformance();
        return state.geometrySource==='blender' && stats.frames>0 && stats.drawCalls>0 && stats.triangles>0 &&
          (key==='desk'?state.seated&&state.miniaturesReady&&state.catReady:
            state.landmarksReady&&state.geometryReady&&state.placeKey===key&&state.focus==='landmark-'+key);
      },key);
      if(home)assert.deepEqual([...assets].sort(),deskModels,'Desk loads just the six Blender actor, room and miniature assets');
      else assert.ok(assets.has(view.region==='karatsu'?'karatsu-town':'waseda-campus'),'Regional Blender terrain was fetched');
      const state=await page.evaluate(()=>window.cameraReview.getState());
      assert.equal(state.webgl,renderer==='native');
      const actualPosition=[state.position.x,state.position.y,state.position.z];
      const expected=home?HOME.seated.position:[view.eye[0],HOME.eyeHeight+regionalHeight(view.region,...view.eye),view.eye[1]];
      actualPosition.forEach((p,i)=>assert.ok(Math.abs(p-expected[i])<.01,renderer+' '+key+' registered camera eye'));
      const performance=await page.evaluate(()=>window.cameraReview.getPerformance());
      const arrival=await shot();
      // A second precisely registered view catches a scene that only matches at entry.
      const offAxis=await turn(.30,.035);
      await turn(-.30,-.035);
      let movingPerformance;
      if(!home)movingPerformance=await strafe(page);
      else await page.evaluate(()=>window.cameraReview.look(.16,0));
      const sideways=await shot(),turned=await turn(home?-.31:.38,.025);
      const surround=[];
      if(!home)for(const [name,delta] of [['right',Math.PI/2-.38],['rear',Math.PI/2]]){
        surround.push({name,label:name+' street view',image:await turn(delta,0)});
      }
      const translation=compareFrames(arrival,sideways),rotation=compareFrames(sideways,turned);
      const detail=frameDetail(arrival),away=frameDetail(turned);
      const entry={renderer,key,position:actualPosition,performance,movingPerformance,translation,rotation,detail,turnedDetail:away,surroundDetail:surround.map(v=>frameDetail(v.image))};
      results.push(entry);
      const require=(ok,reason)=>{if(!ok)failures.push(renderer+' '+key+': '+reason);};
      require(arrival.width===720&&arrival.height===480,'common 3:2 camera capture');
      require(translation.meanRgbError>1.5&&rotation.meanRgbError>4,'visible change under each camera motion');
      require(home||movingPerformance.distance>=.9,'real translation');
      require(detail.colors>1800&&away.colors>1250,'arrival and off-axis image retain material detail');
      require(performance.triangles>1000&&performance.drawCalls>=3,'production meshes submitted to renderer');
      if(renderer==='software'){
        reference.set(key,{arrival,offAxis,position:actualPosition});
        const idle=await page.evaluate(async()=>{
          const engine=window.cameraReview,start=engine.getPerformance().frames;
          await new Promise(done=>setTimeout(done,260));return engine.getPerformance().frames-start;
        });
        require(idle<=1,'still CPU view kept repainting while idle');
      }else{
        const cpu=reference.get(key);
        assert.deepEqual(actualPosition,cpu.position,'CPU and WebGL eyes coincide');
        const registration=compareFrames(cpu.arrival,arrival),registeredTurn=compareFrames(cpu.offAxis,offAxis);
        const wrongArrival=compareFrames(cpu.arrival,offAxis),wrongTurn=compareFrames(cpu.offAxis,arrival);
        pairs.push({key,registration,registeredTurn,wrongArrival,wrongTurn});
        // The CPU approximates lighting. Test image structure against the other
        // renderer at two registered angles, allowing their tonal difference.
        for(const [label,match,cross] of [
          ['arrival',registration,wrongArrival],['turn',registeredTurn,wrongTurn]
        ]){
          require(match.luminanceCorrelation>.35 && match.luminanceCorrelation>cross.luminanceCorrelation+.06,
            label+' must agree with the corresponding renderer view more than the misaligned camera');
        }
        await saveComparison(directory,'paired-'+key,[{name:'cpu',label:'CPU arrival',image:cpu.arrival},
          {name:'webgl',label:'WebGL arrival',image:arrival},{name:'cpu-turn',label:'CPU rotated',image:cpu.offAxis},{name:'webgl-turn',label:'WebGL rotated',image:offAxis}]);
      }
      await saveComparison(directory,renderer+'-'+key,[{name:'arrival',label:'Blender scene / '+renderer,image:arrival},
        {name:'side',label:home?'Seated look right':'Camera translation',image:sideways},
        {name:'turn',label:'Camera turned',image:turned},...surround]);
      console.log(renderer,key,JSON.stringify({triangles:performance.triangles,translation:translation.meanRgbError,rotation:rotation.meanRgbError,detail}));
    }
    assert.deepEqual([...assets].sort(),[...deskModels,...regionalModels,...outdoorModels].sort(),'Both backends load every expected room, miniature, building and district asset');
    assert.deepEqual(retiredViews,[],'Renderers use geometry and material maps without photographed views');
    assert.deepEqual(await page.evaluate(()=>window.viewErrors),[]);assert.deepEqual(errors,[]);
    await page.evaluate(()=>window.cameraReview.dispose());await page.close();
  }
}finally{
  await writeFile(join(directory,'view-metrics.json'),JSON.stringify({sampling:'96 × 64 RGB area resample with matched cameras',results,pairs,failures},null,2)+'\n');
  await browser.close();
}
assert.deepEqual(failures,[]);
