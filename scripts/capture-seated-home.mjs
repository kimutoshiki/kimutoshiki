/** Actual Chromium/WebGL captures of the production source scene.
 * Usage: node scripts/capture-seated-home.mjs [--base URL] [--phase day|dusk|night|all] [--exterior]
 * Final posters:1400×1100 desktop and780×600 for the390×300 mobile stage.
 * PNGs and optional --compare-targets / --hide-grass / --ground-segments diagnostics
 * stay under ignored work/seated-capture. No diagnostic overrides enter posters.
 * Chromium may require a sandbox escalation in managed environments.
 */
import { chromium } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const argv=process.argv.slice(2), opts={base:'http://127.0.0.1:4173',phase:'all',exterior:false};
for(let i=0;i<argv.length;i++) {
 if(['--exterior','--hide-grass'].includes(argv[i]))opts[argv[i].slice(2)]=true;
 else if(['--base','--phase','--compare-targets','--ground-segments'].includes(argv[i])&&argv[i+1])opts[argv[i].slice(2)]=argv[++i];
 else throw new Error('Usage: capture-seated-home.mjs [--base URL] [--phase day|dusk|night|all] [--exterior]');
}
if(!['day','dusk','night','all'].includes(opts.phase))throw new Error('Unknown phase');
const phases={day:'2026-11-07T12:00:00+09:00',dusk:'2026-11-07T17:30:00+09:00',night:'2026-11-07T23:00:00+09:00'};
const selected=Object.entries(phases).filter(([name])=>opts.phase==='all'||opts.phase===name);
const out=path.join(repo,'docs/reviews/seated-home'), posters=path.join(repo,'images/world'), raw=path.join(repo,'work/seated-capture');
await mkdir(out,{recursive:true}); await mkdir(posters,{recursive:true}); await mkdir(raw,{recursive:true});
const errors=[],warnings=[],transportCancellations=[],requests=new Set(),captures=[],lifecycle=[];
const comparisonTargets=opts['compare-targets']?opts['compare-targets'].split(',').map(Number):[null];
if((opts['hide-grass']||opts['ground-segments'])&&!opts['compare-targets'])throw new Error('Diagnostic geometry options require --compare-targets; never use them for posters.');
if(comparisonTargets.some(v=>v!==null&&!Number.isFinite(v)))throw new Error('Invalid comparison target');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function encode(png,file,budget=180000) {
 const image=await loadImage(png),canvas=createCanvas(image.width,image.height);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data,colors=new Set();for(let i=0;i<pixels.length;i+=1024)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);if(colors.size<32)throw new Error(`Blank or uniform capture: ${file}`);
 let quality=86,bytes=canvas.toBuffer('image/webp',quality);
 while(bytes.length>budget&&quality>42)bytes=canvas.toBuffer('image/webp',quality-=2);
 if(bytes.length>budget)throw new Error(`Capture exceeds ${budget} bytes at quality ${quality}: ${file}`);
 await writeFile(file,bytes);
 return {file:path.relative(repo,file),width:image.width,height:image.height,bytes:bytes.length,quality,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function skyProbe(png) {
 const image=await loadImage(png),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 // This patch is unobstructed sky at the production leave() route arrival.
 const pixels=ctx.getImageData(100,20,40,40).data,rgb=[0,0,0];
 for(let i=0;i<pixels.length;i+=4)for(let channel=0;channel<3;channel++)rgb[channel]+=pixels[i+channel]/1600;
 return {region:[100,20,40,40],rgb,luminance:.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
}
try {
 const context=await browser.newContext({viewport:{width:1400,height:1100},deviceScaleFactor:1,timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());else if(message.type()==='warning')warnings.push(message.text());});
 page.on('requestfinished',request=>{if(request.url().startsWith(opts.base))requests.add(new URL(request.url()).pathname);});
 page.on('requestfailed',request=>{const record=`${request.url()}: ${request.failure()?.errorText}`;if(request.failure()?.errorText==='net::ERR_ABORTED')transportCancellations.push(record);else errors.push(record);});
 await page.route('**/world-ui.js*',route=>route.abort());
 await page.route('**/__seated-capture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#182118}canvas{width:100%;height:100%;display:block}</style><canvas id="world"></canvas>'}));
 await page.goto(`${opts.base}/__seated-capture.html`);
 await page.evaluate(async date=>{
   window.captureDateISO=date;window.capture={pending:0,progress:[],renders:0,hideFrozenClocks:true};
   const T=await import('/js/vendor/three.module.min.js');
   const start=T.DefaultLoadingManager.itemStart.bind(T.DefaultLoadingManager),end=T.DefaultLoadingManager.itemEnd.bind(T.DefaultLoadingManager);
   T.DefaultLoadingManager.itemStart=url=>{window.capture.pending++;start(url);};
   T.DefaultLoadingManager.itemEnd=url=>{window.capture.pending--;end(url);};
   const {mountWorld}=await import('/scene/world.js');
   window.world=await mountWorld({canvas:document.querySelector('canvas'),seated:true,autoTime:true,reducedMotion:true,now:()=>new Date(window.captureDateISO),onError:error=>{throw error;},onProgress:event=>window.capture.progress.push(event.phase),rendererFactory:canvas=>{
     const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
     const render=renderer.render.bind(renderer);renderer.render=(scene,camera)=>{
       // PMREM/cubemap generation recursively renders its own temporary scenes.
       // Only instrument the production world, never those internal passes.
       if(!scene.getObjectByName('Grounded oak parquet floor'))return render(scene,camera);
       window.capture.scene=scene;window.capture.camera=camera;
       const clock=scene.getObjectByName('Brass wall clock');if(clock)clock.visible=!window.capture.hideFrozenClocks;
       window.capture.clockHandCount=0;window.capture.hiddenClockHands=0;
       scene.traverse(object=>{if(object.userData.worldClockHand){object.visible=!window.capture.hideFrozenClocks;window.capture.clockHandCount++;if(!object.visible)window.capture.hiddenClockHands++;}});
       const ground=scene.getObjectByName('Unbroken ground to the horizon');if(ground&&window.capture.hideGrass)ground.visible=false;
       if(ground&&window.capture.groundSegments&&!ground.userData.captureSubdivisions){
         const geometry=new T.PlaneGeometry(1800,1800,window.capture.groundSegments,window.capture.groundSegments);geometry.rotateX(-Math.PI/2);
         const uv=geometry.attributes.uv,p=geometry.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+ground.position.x)/3.2,(p.getZ(i)+ground.position.z)/3.2);
         ground.geometry=geometry;ground.userData.captureSubdivisions=window.capture.groundSegments;
       }
       if(window.capture.compareTargetY!=null){camera.lookAt(0,window.capture.compareTargetY,0);camera.updateMatrixWorld(true);}
       window.capture.renders++;
       window.capture.renderedCamera={position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,aspect:camera.aspect};
       const tracked=['Grounded oak parquet floor','Original burgundy desk rug'].map(name=>scene.getObjectByName(name)).filter(Boolean);
       const drawCounts={};for(const object of tracked){drawCounts[object.name]=0;object.onBeforeRender=()=>drawCounts[object.name]++;}
       const result=render(scene,camera);
       const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
       window.capture.floorDiagnostics=tracked.map(object=>({name:object.name,draws:drawCounts[object.name],visible:object.visible,frustumCulled:object.frustumCulled,inFrustum:frustum.intersectsObject(object),matrixWorld:object.matrixWorld.toArray(),boundingSphere:object.geometry.boundingSphere?{center:object.geometry.boundingSphere.center.toArray(),radius:object.geometry.boundingSphere.radius}:null,geometryId:object.geometry.uuid,materialId:object.material.uuid,opacity:object.material.opacity,transparent:object.material.transparent,worldBounds:new T.Box3().setFromObject(object).getSize(new T.Vector3()).toArray()}));
       return result;
     };
     window.capture.renderer=renderer;return renderer;
   }});
   window.world.setPaused(true);
 },selected[0][1]);
 await page.waitForFunction(()=>{
   const state=window.world?.getState();let minis=0;
   window.capture?.scene?.traverse(object=>{if(object.userData.home?.miniatures)minis=object.userData.home.miniatures.length;});
   return state?.catReady&&state.landmarksReady&&window.capture.pending===0&&minis===4;
 },{},{timeout:180000});
 await page.waitForLoadState('networkidle');
 const cdp=await context.newCDPSession(page);
 const metadata=async()=>{const data=await page.evaluate(()=>{
   const {renderer,scene,camera}=window.capture,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {state:window.world.getState(),camera:window.capture.renderedCamera,floorDiagnostics:window.capture.floorDiagnostics,buffer:[renderer.domElement.width,renderer.domElement.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),clockHidden:scene.getObjectByName('Brass wall clock')?.visible===false,clockHandCount:window.capture.clockHandCount,hiddenClockHands:window.capture.hiddenClockHands,comparisonTargetY:window.capture.compareTargetY??null,diagnosticGrassHidden:window.capture.hideGrass||false,diagnosticGroundSegments:window.capture.groundSegments||0,pending:window.capture.pending,progress:window.capture.progress,renderCalls:window.capture.renders};
 });
   if(data.clockHandCount!==16||data.floorDiagnostics.length!==2||!Number.isFinite(data.camera.fov))throw new Error('Capture metadata must describe the complete production world, not an internal PMREM render.');
   return data;
 };
 async function settle() {
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.waitForTimeout(400);
 }
 for(const targetY of comparisonTargets) for(const [phase,date] of selected) {
   await page.evaluate(({y,hideGrass,groundSegments})=>{window.capture.compareTargetY=y;window.capture.hideGrass=hideGrass;window.capture.groundSegments=groundSegments;},{y:targetY,hideGrass:!!opts['hide-grass'],groundSegments:Number(opts['ground-segments'])||0});
   await page.evaluate(date=>{window.captureDateISO=date;window.world.setLightingMode('auto');window.world.setPaused(true);},date);
   for(const [suffix,width,height] of [['',1400,1100],['-mobile',780,600]]) {
     await page.setViewportSize({width,height});
     await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();
     if(errors.length)throw new Error(errors.join('\n'));
     const png=await page.locator('canvas').screenshot();
     const name=targetY==null?`seated-${phase}${suffix}`:`comparison-target-${String(targetY).replace('.','')}-${phase}${opts['hide-grass']?'-grass-hidden':''}${opts['ground-segments']?'-grass-grid'+opts['ground-segments']:''}${suffix}`;
     await writeFile(path.join(raw,`${name}.png`),png);
     const record=await encode(png,path.join(targetY==null?posters:raw,`${name}.webp`),suffix?80000:180000);
     captures.push({...record,phase,date,displaySize:suffix?[390,300]:[1400,1100],...await metadata()});
     console.log(JSON.stringify({capture:record,phase}));
   }
 }
 if(opts.exterior) {
   // Traverse with production navigation at a small daylight viewport: software
   // WebGL can otherwise spend seconds shading each intermediate night frame.
   await page.evaluate(date=>{window.capture.hideFrozenClocks=false;window.captureDateISO=date;window.world.setLightingMode('auto');},phases.day);
   await page.setViewportSize({width:320,height:240});await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:240,deviceScaleFactor:1,mobile:false});await settle();
   const accepted=await page.evaluate(()=>window.world.standUp());if(!accepted)throw new Error('Stand-up refused');
   await page.waitForFunction(()=>window.world.getState().posture==='walking',{},{timeout:180000});
   if(!await page.evaluate(()=>window.world.leave()))throw new Error('Physical garden route refused');
   await page.waitForFunction(()=>{const s=window.world.getState();return !s.travel&&s.mode==='outside';},{},{timeout:300000});
   await page.setViewportSize({width:1400,height:900});await cdp.send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});await settle();
   for(const [phase,date] of Object.entries(phases)) {
     await page.evaluate(date=>{window.captureDateISO=date;window.world.setLightingMode('auto');},date);await settle();
     if(errors.length)throw new Error(errors.join('\n'));
     const png=await page.locator('canvas').screenshot();await writeFile(path.join(raw,`courtyard-${phase}.png`),png);
     const record=await encode(png,path.join(out,`courtyard-${phase}.webp`));captures.push({...record,phase,date,skyProbe:await skyProbe(png),physicalRoute:'standUp() then leave(); waited for actual route completion at a 320×240 daylight viewport; restored capture viewport and time afterward',...await metadata()});console.log(JSON.stringify({capture:record,phase}));
   }
   const daySky=captures.find(c=>c.physicalRoute&&c.phase==='day').skyProbe;
   const nightSky=captures.find(c=>c.physicalRoute&&c.phase==='night').skyProbe;
   if(nightSky.luminance>=daySky.luminance*.65)throw new Error('Night sky remained too bright relative to day; inspect equirectangular background/environment texture caches.');
   await page.evaluate(date=>{window.captureDateISO=date;window.world.setLightingMode('auto');},phases.day);
   await page.setViewportSize({width:320,height:240});await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:240,deviceScaleFactor:1,mobile:false});await settle();
   const returnToSeat={action:'sitDown() from the courtyard; physical route at 320×240 daylight',accepted:await page.evaluate(()=>window.world.sitDown())};lifecycle.push(returnToSeat);
   console.log(JSON.stringify({returnToSeat}));
   if(!returnToSeat.accepted)throw new Error('Physical return-to-seat route refused');
   const started=Date.now();
   try {await page.waitForFunction(()=>{const s=window.world.getState();return s.posture==='seated'&&!s.travel;},{},{timeout:120000});}
   catch(error){returnToSeat.finalState=await page.evaluate(()=>window.world.getState());await page.locator('canvas').screenshot({path:path.join(raw,'return-to-seat-failure.png')});throw error;}
   returnToSeat.elapsedWallMs=Date.now()-started;returnToSeat.finalState=await page.evaluate(()=>window.world.getState());console.log(JSON.stringify({returnToSeat}));
 }
 for(const cancellation of transportCancellations)if(!cancellation.includes('/draco_decoder.wasm:')||!captures.every(c=>c.state.catReady))errors.push(cancellation);
 if(errors.length)throw new Error(errors.join('\n'));
 await context.close();
} catch(error) {
 errors.push(String(error));throw error;
} finally {
 await browser.close();
 const sourceHashes={};
 for(const request of [...requests].sort()) {
   const file=path.resolve(repo,'.'+decodeURIComponent(request));
   if(!file.startsWith(repo+path.sep))continue;
   try {if((await stat(file)).isFile())sourceHashes[path.relative(repo,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}catch{}
 }
 sourceHashes['scripts/capture-seated-home.mjs']=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
 await writeFile(path.join(opts['compare-targets']?raw:out,opts['hide-grass']?'grass-diagnostic-manifest.json':opts['ground-segments']?'ground-grid-diagnostic-manifest.json':opts['compare-targets']?'comparison-manifest.json':'manifest.json'),JSON.stringify({verification:'Actual source Three.js scene rendered by Chromium WebGL through ANGLE SwiftShader software rendering. No frame-rate or physical-GPU performance claim.',fixture:opts['compare-targets']?'Diagnostic fixture only: seated eye preserved; explicit targetY and optional grass visibility/subdivision overrides recorded per image. Frozen clocks hidden. Diagnostic images never become production posters.':'Minimal same-origin canvas page; production mountWorld and assets. Wall clock group and tagged worldClockHand nodes hidden only for frozen seated posters; all clocks visible in courtyard captures at the injected JST time. No camera/geometry/material replacements.',browser:await browser.version(),sourceHashes,captures,lifecycle,errors,warnings,transportCancellations,comparisonTargets:opts['compare-targets']?comparisonTargets:undefined},null,2)+'\n');
}
