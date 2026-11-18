// Decode each image once. Mip levels allow the rasterizer to filter distant
// walls and paths without sampling a large picture for a tiny triangle.
const browserCanvas=(w,h)=>{
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;
};
export function decodeSoftwareTexture(source,{maxSize=1536,repeat=false,makeCanvas=browserCanvas}={}) {
  const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height;
  if(!sw||!sh)throw new Error('Texture dimensions are empty');
  const scale=Math.min(1,maxSize/Math.max(sw,sh));
  let width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale)),input=source,bytes=0;
  const levels=[];
  while(true){
    const target=makeCanvas(width,height);
    const ctx=target.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(input,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data;
    levels.push({width,height,pixels:new Uint32Array(rgba.buffer,rgba.byteOffset,width*height)});
    bytes+=rgba.byteLength;
    if(input!==source){input.width=1;input.height=1;}
    if(width===1&&height===1){target.width=1;target.height=1;break;}
    input=target;width=Math.max(1,width>>1);height=Math.max(1,height>>1);
  }
  return {levels,repeat,bytes};
}

async function readTexture(path,options,signal){
  const url=new URL(path,import.meta.url);
  const hero=document.getElementById?.('study-image');
  if(hero?.complete&&hero.naturalWidth&&hero.currentSrc===url.href)return decodeSoftwareTexture(hero,options);
  const outdoor=url.pathname.match(/^(.*\/images\/outdoors\/(?:okuma-auditorium|okuma-statue|karatsu-castle|karatsu-bank))-1280\.webp$/);
  if(outdoor){
    const openPhoto=document.querySelector?.('.study-tour .tour-view img');
    if(openPhoto?.complete&&openPhoto.naturalWidth&&openPhoto.currentSrc){
      const previouslyShown=new URL(openPhoto.currentSrc,document.baseURI);
      if(previouslyShown.origin===url.origin&&previouslyShown.pathname.replace(/-\d+\.webp$/,'')===outdoor[1])
        return decodeSoftwareTexture(openPhoto,options);
    }
    if((globalThis.innerWidth||1280)<=650)url.pathname=outdoor[1]+'-768.webp';
  }
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error('Texture request failed: '+response.status);
  const blob=await response.blob();
  let bitmap;
  if(typeof createImageBitmap==='function'){
    try{bitmap=await createImageBitmap(blob);}catch{if(signal.aborted)throw signal.reason;}
  }
  let objectURL;
  try{
    if(!bitmap){
      objectURL=URL.createObjectURL(blob);bitmap=new Image();bitmap.src=objectURL;await bitmap.decode();
    }
    if(signal.aborted)throw signal.reason;
    return decodeSoftwareTexture(bitmap,options);
  }finally{
    bitmap?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);
  }
}

// Only the desk or the current district asks for images. Changing areas aborts
// obsolete requests, while recently used decoded maps stay in a bounded cache.
export function createTextureCache(onChange,read=readTexture){
  const mobile=(globalThis.innerWidth||1280)<=650||globalThis.navigator?.deviceMemory<=3;
  const decodeLimit=mobile?1024:1536;
  const entries=new Map(),images=new Map(),wanted=new Map(),inFlight=new Map(),errors=new Set();
  const limit=globalThis.navigator?.deviceMemory<=3?24*1024**2:56*1024**2;
  let active=true,disposed=false,clock=0,ready=true,bytes=0;
  function trim(){
    if(bytes<=limit)return;
    const unused=[...entries].filter(([key])=>!wanted.has(key)).sort((a,b)=>a[1].used-b[1].used);
    for(const [key,entry] of unused){
      bytes-=entry.value.bytes;entries.delete(key);images.delete(key);
      if(bytes<=limit)break;
    }
  }
  function pump(){
    if(!active||disposed)return;
    for(const [key,source] of wanted){
      if(inFlight.size>=2)break;
      if(images.has(key)||errors.has(key)||inFlight.has(key))continue;
      const abort=new AbortController();inFlight.set(key,abort);
      Promise.resolve().then(()=>read(source.path,{...source,maxSize:Math.min(decodeLimit,source.maxSize||1536)},abort.signal)).then(value=>{
        if(disposed||abort.signal.aborted)return;
        entries.set(key,{value,used:++clock});images.set(key,value);bytes+=value.bytes;trim();
      }).catch(()=>{if(!disposed&&!abort.signal.aborted)errors.add(key);}).finally(()=>{
        if(inFlight.get(key)===abort)inFlight.delete(key);
        if(disposed)return;
        pump();onChange?.();
      });
    }
    ready=[...wanted.keys()].every(key=>images.has(key)||errors.has(key));
  }
  function select(model,district=''){
    const previous=new Set(wanted.keys());wanted.clear();
    for(const [key,source] of model.textureSources||[]){
      if(source.district&&source.district.replace(/^landmark-/,'')!==district)continue;
      wanted.set(key,source);
      if(!previous.has(key))errors.delete(key);
      const existing=entries.get(key);if(existing)existing.used=++clock;
    }
    for(const [key,task] of inFlight)if(!wanted.has(key)){task.abort();inFlight.delete(key);}
    trim();pump();
  }
  function setActive(value){
    if(active===value)return;
    active=value;
    if(active)pump();else{for(const task of inFlight.values())task.abort();inFlight.clear();}
  }
  function dispose(){
    disposed=true;setActive(false);images.clear();entries.clear();wanted.clear();errors.clear();bytes=0;
  }
  return {images,select,setActive,dispose,get ready(){return ready;},get pending(){return inFlight.size;},get loaded(){return images.size;}};
}
