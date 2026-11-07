/** Procedural atmosphere with separate, bounded background and light maps.
 * There are no downloaded textures, sky meshes or post-processing passes. */
export function createWorldSky(T) {
  const width=512,height=256;
  const backgroundCanvas=document.createElement('canvas');backgroundCanvas.width=width;backgroundCanvas.height=height;
  const environmentCanvas=document.createElement('canvas');environmentCanvas.width=256;environmentCanvas.height=128;
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=width;cloudCanvas.height=height;
  const context=backgroundCanvas.getContext('2d'),environmentContext=environmentCanvas.getContext('2d'),cloudContext=cloudCanvas.getContext('2d');
  const cloudImage=cloudContext.createImageData(width,height),mask=new Uint8Array(width*height),cloudShade=new Uint8Array(width*height);
  const clamp=(value,a=0,b=1)=>Math.max(a,Math.min(b,value));
  const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
  const hash=(x,y)=>{let n=Math.imul(x+67,374761393)^Math.imul(y+131,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  function noise(x,y,period) {
    const ix=Math.floor(x),iy=Math.floor(y),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy);
    const h=(dx,dy)=>hash(((ix+dx)%period+period)%period,iy+dy);
    return (h(0,0)*(1-u)+h(1,0)*u)*(1-v)+(h(0,1)*(1-u)+h(1,1)*u)*v;
  }
  // Longitude wraps exactly. Long, softly broken bands suggest high cloud,
  // with clear zenith and a thin, open horizon rather than opaque cloud cards.
  for(let y=0;y<height/2;y++)for(let x=0;x<width;x++) {
    const u=x/width,v=y/height;
    const detail=noise(u*32,v*72,32);
    const field=noise(u*8,v*18,8)*.58+noise(u*16,v*36,16)*.28+detail*.14;
    const envelope=smooth(.015,.10,v)*(1-smooth(.40,.50,v));
    mask[y*width+x]=Math.round(255*smooth(.42,.70,field)*envelope);
    cloudShade[y*width+x]=Math.round(255*(.84+detail*.16));
  }
  const stats={backgroundSize:[width,height],environmentSize:[256,128],externalRequests:0,drawCalls:0,updates:0};
  let key=null,current=null,disposed=false;
  const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  const rgba=(rgb,alpha)=>`rgba(${rgb.join(',')},${alpha})`;
  function texture(canvas,name) {const map=new T.CanvasTexture(canvas);map.name=name;map.mapping=T.EquirectangularReflectionMapping;map.colorSpace=T.SRGBColorSpace;return map;}
  function update(snapshot) {
    if(disposed)throw new Error('Cannot update a disposed world sky');
    if(current&&key===snapshot.lightingKey)return current;
    key=snapshot.lightingKey;
    const gradient=context.createLinearGradient(0,0,0,height);
    for(const stop of snapshot.skyStops)gradient.addColorStop(stop.offset,stop.color);
    context.fillStyle=gradient;context.fillRect(0,0,width,height);
    const daylight=clamp(snapshot.daylight),twilight=Math.max(snapshot.dawn||0,snapshot.dusk||0);
    const blueStrength=daylight*(1-twilight*.8),upperBlue=context.createLinearGradient(0,0,0,height);
    upperBlue.addColorStop(0,`rgba(71,127,173,${blueStrength*.56})`);
    upperBlue.addColorStop(.40,`rgba(71,127,173,${blueStrength*.38})`);
    upperBlue.addColorStop(.52,'rgba(71,127,173,0)');upperBlue.addColorStop(1,'rgba(71,127,173,0)');
    context.fillStyle=upperBlue;context.fillRect(0,0,width,height);
    let cloudColor=mix([138,160,184],[248,245,232],daylight);
    cloudColor=mix(cloudColor,[246,193,158],twilight*.55);
    const cloudOpacity=.11+daylight*.64;
    for(let i=0;i<mask.length;i++){const offset=i*4,shade=cloudShade[i]/255;cloudImage.data[offset]=Math.round(cloudColor[0]*shade);cloudImage.data[offset+1]=Math.round(cloudColor[1]*shade);cloudImage.data[offset+2]=Math.round(cloudColor[2]*shade);cloudImage.data[offset+3]=Math.round(mask[i]*cloudOpacity);}
    cloudContext.putImageData(cloudImage,0,0);context.drawImage(cloudCanvas,0,0);
    // A broad glow follows the same light direction as the scene; no separate
    // decorative sun is placed at an inconsistent angle or time of day.
    const position=snapshot.sun.position,target=snapshot.sun.target||[0,0,0];
    const sx=position[0]-target[0],sy=position[1]-target[1],sz=position[2]-target[2];
    const longitude=(.5+Math.atan2(sz,sx)/(Math.PI*2))*width;
    const latitude=(.5-Math.asin(sy/Math.hypot(sx,sy,sz))/Math.PI)*height;
    const glowColor=channels(snapshot.sun.color),glowOpacity=daylight*.055+twilight*.10;
    for(const offset of [-width,0,width]){
      const glow=context.createRadialGradient(longitude+offset,latitude,0,longitude+offset,latitude,width*.20);
      glow.addColorStop(0,rgba(glowColor,glowOpacity));glow.addColorStop(1,rgba(glowColor,0));
      context.fillStyle=glow;context.fillRect(0,0,width,height);
    }
    // Downsample the same atmosphere for indirect light. A detailed background
    // must not force a large PMREM convolution during the first live frame.
    environmentContext.drawImage(backgroundCanvas,0,0,256,128);
    const previous=current;
    current={background:texture(backgroundCanvas,'Procedural layered sky'),environment:texture(environmentCanvas,'Small procedural sky lighting map')};
    previous?.background.dispose();previous?.environment.dispose();stats.updates++;
    return current;
  }
  return {update,stats,dispose(){if(disposed)return;disposed=true;current?.background.dispose();current?.environment.dispose();current=null;}};
}
