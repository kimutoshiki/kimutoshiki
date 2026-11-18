/** Render the no-WebGL visitor's photographs from the same study and landscape.
 * Start the normal preview first. Output is requested one view at a time at runtime. */
import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';

const preview = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = new URL('../images/world/tour/', import.meta.url);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({viewport:{width:1152,height:780}, deviceScaleFactor:1});
  page.on('pageerror', e => console.error(e.message));
  await page.route('**/tour-capture.html', route => route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta charset="utf-8"><style>*{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>'}));
  await page.goto(preview + '/tour-capture.html');
  await page.evaluate(async () => {
    const T = await import('/js/vendor/three.module.min.js');
    const {mountWorld} = await import('/scene/world.js');
    const canvas = document.querySelector('canvas');
    const fixture = window.fixture = {T, instant:'2026-11-18T12:00:00+09:00'};
    fixture.world = await mountWorld({canvas, seated:true, reducedMotion:true, now:() => new Date(fixture.instant),
      rendererFactory: () => {
        const renderer = fixture.renderer = new T.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:true});
        const render = renderer.render.bind(renderer);
        renderer.render = (scene, camera) => {
          if (scene.getObjectByName('Grounded oak parquet floor')) {
            fixture.scene = scene; fixture.camera = camera;
          }
          return render(scene,camera);
        };
        return renderer;
      },
      onError: error => { throw error; }
    });
  });
  await page.waitForFunction(() => {
    const state = window.fixture.world.getState();
    return state.catReady && state.miniaturesReady;
  },null,{timeout:180000});
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const {world,scene,camera,renderer,T} = window.fixture;
    world.setRenderingActive(false);
    renderer.setPixelRatio(1); renderer.setSize(1152,780,false);
    const wallClock = scene.getObjectByName('Brass wall clock');
    if (wallClock) wallClock.visible = false;
    scene.traverse(o => { if (o.userData.worldClockHand) o.visible = false; });
    window.fixture.frame = view => {
      scene.updateMatrixWorld(true);
      renderer.shadowMap.needsUpdate = true;
      scene.traverse(o => { if (o.shadow) o.shadow.needsUpdate = true; });
      renderer.render(scene, view || camera);
      return renderer.domElement.toDataURL('image/webp', .81).split(',')[1];
    };
    window.fixture.hotspots = {};
    scene.traverse(o => {
      const id = o.userData.deskProp;
      if (!id) return;
      const point = id === 'lamp' ? o.getObjectByName('Desk lamp shade pivot').localToWorld(new T.Vector3(0,-.12,.18)) :
        o.localToWorld(id === 'drawer' ? new T.Vector3(0,-.056,.869) : new T.Vector3(.415,.116,0));
      point.project(camera);
      window.fixture.hotspots[id] = [(.5+point.x/2),(.5-point.y/2)].map(x=>Math.round(x*1000)/1000);
    });
  });
  console.log('Desk targets', await page.evaluate(() => window.fixture.hotspots));
  const writeView = async (name,data) => {
    const bytes = Buffer.from(data,'base64');
    if (bytes.length < 5000) throw Error('Empty capture: ' + name);
    await writeFile(new URL(name+'.webp',output),bytes);
  };
  if (!process.argv.includes('--outdoors-only')) {
    for (const [phase,time] of Object.entries({day:'12:00',dusk:'17:30',night:'22:00'})) {
      for (let mask=0;mask<8;mask++) {
        const image = await page.evaluate(({mask,time}) => {
          const f=window.fixture;
          f.instant='2026-11-18T'+time+':00+09:00';
          f.world.setLightingMode('auto');
          const wanted = {notebook:!!(mask&1),lamp:!(mask&2),drawer:!!(mask&4)};
          for (const [id,value] of Object.entries(wanted)) if(f.world.getState().deskProps[id] !== value) f.world.interactDesk(id);
          return f.frame();
        },{mask,time});
        await writeView(phase+'-'+mask,image);
      }
      console.log('Captured all desk states for '+phase);
    }
  }
  await page.evaluate(async () => {
    const f=window.fixture;
    f.instant='2026-11-18T13:00:00+09:00'; f.world.setLightingMode('auto');
    f.world.setRenderingActive(true); f.world.standUp(); await f.world.prewarmExterior();
  });
  await page.waitForFunction(() => window.fixture.world.getState().mode==='outside' && window.fixture.world.getState().landmarksReady,null,{timeout:180000});
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.fixture.world.setRenderingActive(false));
  const views = [
    ['okuma-auditorium',[-1,1.95,23],[-25,14,48],57],
    ['karatsu-castle',[4.5,2.2,37],[25,11.5,66],52],
    ['okuma-statue',[-2.3,1.62,13],[-7,2.8,22],46],
    ['karatsu-bank',[-1.8,1.8,16.2],[19,5.9,25],54],
  ];
  for(const [name,eye,target,fov] of views){
    const image = await page.evaluate(({eye,target,fov}) => {
      const f=window.fixture, camera=new f.T.PerspectiveCamera(fov,1152/780,.035,700);
      camera.position.fromArray(eye);camera.lookAt(...target);camera.updateMatrixWorld();
      return f.frame(camera);
    },{eye,target,fov});
    await writeView(name,image);
  }
  console.log('Captured all four outdoor views');
} finally { await browser.close(); }
