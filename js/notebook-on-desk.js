import { paintNotebook } from './notebook-render.js';

const crop={x:256,y:266,w:566,h:327};
const overlays=new WeakMap();
let photograph, deskAtlas;
function photoTexture(image, printed) {
  if(deskAtlas && photograph===image.currentSrc)return deskAtlas;
  const atlas=document.createElement('canvas');atlas.width=atlas.height=1024;
  const ctx=atlas.getContext('2d');
  ctx.drawImage(printed,0,0);
  // Rectify the cloth photographed in the hero. Preserve its real gold tooling
  // and cloth grain instead of painting a second, differently printed cover.
  const sx=image.naturalWidth/1536,sy=image.naturalHeight/1024;
  for(let i=0;i<64;i++){
    const t=i/64, left=562-28*t, right=779+13*t;
    ctx.drawImage(image,left*sx,(500+t*51)*sy,(right-left)*sx,.82*sy,0,i*8,512,8.2);
  }
  photograph=image.currentSrc;deskAtlas=atlas;return atlas;
}
export function deskNotebook(artwork, printed) {
  const image=artwork?.querySelector('.study-image');
  if(!image?.naturalWidth || !artwork.clientWidth)return null;
  overlays.get(artwork)?.dispose();
  const canvas=document.createElement('canvas');canvas.className='notebook-on-desk';
  canvas.setAttribute('aria-hidden','true');
  for(const [property,value] of Object.entries({left:crop.x/1536,top:crop.y/1024,width:crop.w/1536,height:crop.h/1024}))
    canvas.style[property]=value*100+'%';
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  const texture=photoTexture(image,printed);
  artwork.append(canvas);
  const size=canvas.getBoundingClientRect(), density=Math.min(1.7,devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(size.width*density));canvas.height=Math.max(1,Math.round(size.height*density));
  let progress=0, frame=0, live=true;
  function draw(value) {
    if(!live)return;
    progress=value;
    paintNotebook(ctx,texture,canvas.width,canvas.height,value,crop);
  }
  function dispose() {
    if(!live)return;
    live=false;cancelAnimationFrame(frame);canvas.remove();overlays.delete(artwork);
  }
  function fold(immediate) {
    if(immediate || !artwork.offsetWidth || !progress)return dispose();
    const from=progress,start=performance.now();
    function tick(now) {
      if(!live)return;
      const remaining=Math.max(0,from-(now-start)/520);
      if(remaining){draw(remaining);frame=requestAnimationFrame(tick);}
      else dispose();
    }
    frame=requestAnimationFrame(tick);
  }
  const overlay={draw,fold,dispose};overlays.set(artwork,overlay);
  return overlay;
}
