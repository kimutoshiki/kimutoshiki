/** Actual source-world visual review; run after starting npm run dev.
 * Usage: node scripts/capture-live-world.mjs [--output work/live-sky]
 * Walks with the public API, preserves every model/clock, captures native WebGL
 * pixels, and records the camera, adaptive resolution and source hashes.
 * ANGLE SwiftShader is software rendering, not a hardware performance benchmark.
 */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const repo=fileURLToPath(new URL('../',import.meta.url));process.chdir(repo);
const argv=process.argv.slice(2);if(argv.length&&!(argv.length===2&&argv[0]==='--output'))throw new Error('Usage: capture-live-world.mjs [--output path]');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4173',out=argv[1]||'docs/reviews/live-study',raw='work/live-sky';await mkdir(out,{recursive:true});await mkdir(raw,{recursive:true});
const sourceFiles=['scene/world.js','scene/world-landscape.js','scene/world-sky.js','scene/world-time.js','scene/garden-boundary.js','scene/home-interior.js','scene/desk-landmarks.js','scene/cat-life.js','scene/cat-disposal.js','scene/cat-asset.js','scene/home-navigation.js','scene/world-layout.js','scene/landmark-clocks.js','scene/world-landmarks.js','scripts/capture-live-world.mjs'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),initialHashes={};for(const file of sourceFiles)initialHashes[file]=digest(await readFile(file));
const requests=new Set();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={type:'Actual production source WebGL through ANGLE SwiftShader; no hardware-FPS claim',browser:await browser.version(),fixture:'Minimal same-origin page; production mountWorld, real standUp()/leave() path, source camera, paused cat, injected JST12:00/17:30/23:00. No scene/camera/material overrides; all clocks visible.',captures:[],errors:[],warnings:[]};
try{
 const page=await browser.newPage({viewport:{width:320,height:240},deviceScaleFactor:1});
 page.on('requestfinished',request=>{if(request.url().startsWith(base))requests.add(new URL(request.url()).pathname);});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
 await page.route('**/__sky-review.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas></canvas>'}));
 await page.goto(base+'/__sky-review.html');
 await page.evaluate(async()=>{
   window.reviewDate='2026-11-07T12:00:00+09:00';window.review={};const T=await import('/js/vendor/three.module.min.js'),{mountWorld}=await import('/scene/world.js');
   window.world=await mountWorld({canvas:document.querySelector('canvas'),seated:true,autoTime:true,reducedMotion:true,now:()=>new Date(window.reviewDate),onError:e=>{throw e;},rendererFactory:canvas=>{
     const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});const render=renderer.render.bind(renderer);
     renderer.render=(scene,camera)=>{if(scene.getObjectByName('Grounded oak parquet floor')){window.review.scene=scene;window.review.camera={position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,aspect:camera.aspect};}return render(scene,camera);};window.review.renderer=renderer;return renderer;
   }});window.world.setPaused(true);await window.world.prewarmExterior();
 });
 await page.waitForFunction(()=>{const s=window.world?.getState();return s?.catReady&&s.miniaturesReady&&s.outdoorsReady&&s.landmarksReady;},{},{timeout:240000});
 if(!await page.evaluate(()=>window.world.standUp()))throw new Error('standUp refused');
 await page.waitForFunction(()=>window.world.getState().posture==='walking',{},{timeout:180000});
 if(!await page.evaluate(()=>window.world.leave()))throw new Error('leave refused');
 await page.waitForFunction(()=>{const s=window.world.getState();return s.mode==='outside'&&!s.travel;},{},{timeout:240000});
 await page.setViewportSize({width:1600,height:1050});
 for(const [phase,time] of [['day','12:00'],['dusk','17:30'],['night','23:00']]){
   await page.evaluate(date=>{window.reviewDate=date;window.world.setLightingMode('auto');},'2026-11-07T'+time+':00+09:00');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const capture=await page.evaluate(()=>{const {renderer,scene,camera}=window.review;let landscape;scene.traverse(o=>{if(o.userData.landscapeStats)landscape=o.userData.landscapeStats;});return{png:renderer.domElement.toDataURL('image/png'),state:window.world.getState(),performance:window.world.getPerformance(),camera,buffer:[renderer.domElement.width,renderer.domElement.height],landscape};});
   const png=Buffer.from(capture.png.split(',')[1],'base64');delete capture.png;
   await writeFile(raw+'/courtyard-'+phase+'.png',png);const image=await loadImage(png),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
   let quality=88,bytes=canvas.toBuffer('image/webp',quality);while(bytes.length>220000&&quality>64)bytes=canvas.toBuffer('image/webp',quality-=2);if(bytes.length>220000)throw new Error('Review WebP budget exceeded');
   const file=path.join(out,'courtyard-'+phase+'.webp');await writeFile(file,bytes);capture.file=file;capture.bytes=bytes.length;capture.quality=quality;capture.sha256=digest(bytes);
   report.captures.push({phase,...capture});console.log(JSON.stringify({phase,buffer:capture.buffer,state:capture.state.posture,performance:capture.performance}));
 }
 if(report.errors.length)throw new Error(report.errors.join('\n'));
}catch(error){report.errors.push(String(error));throw error;}
finally{
 await browser.close();report.sourceHashes={...initialHashes};report.sourceChangesDuringCapture=[];
 for(const file of sourceFiles)if(digest(await readFile(file))!==initialHashes[file])report.sourceChangesDuringCapture.push(file);
 for(const request of requests){const file=path.resolve(repo,'.'+decodeURIComponent(request));if(!file.startsWith(repo))continue;try{report.sourceHashes[path.relative(repo,file)]=digest(await readFile(file));}catch{}}
 if(report.sourceChangesDuringCapture.length){report.errors.push('Source changed during capture: '+report.sourceChangesDuringCapture.join(', '));process.exitCode=1;}
 await writeFile(path.join(out,'world-report.json'),JSON.stringify(report,null,2)+'\n');
}
