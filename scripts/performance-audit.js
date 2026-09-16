// Opt-in developer page: measure the real GL context, with unchanged rendering.
const panel=document.getElementById('performance-audit')||document.createElement('pre');
panel.id='performance-audit';
panel.style.cssText='position:fixed;left:16px;bottom:24px;z-index:5000;background:#101526e8;color:white;padding:12px;font:11px monospace;pointer-events:none';
document.body.append(panel);
const frames=[],gpu=[];let gl,extension,pending=[],lastFrame=0,calls=0,triangles=0,textures=0,programs=0;
const getContext=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(type,...args){
  const context=getContext.call(this,type,...args);
  if(type!=='webgl2'||!context||gl)return context;
  gl=context;extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  for(const key of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
    const original=gl[key].bind(gl);gl[key]=(...params)=>{
      calls++;const count=key.startsWith('drawElements')?params[1]:params[2];
      const instances=key.endsWith('Instanced')?params.at(-1):1;
      if(params[0]===gl.TRIANGLES)triangles+=count/3*instances;
      return original(...params);
    };
  }
  for(const [create,remove,update] of [['createTexture','deleteTexture',value=>textures+=value],['createProgram','deleteProgram',value=>programs+=value]]){
    const a=gl[create].bind(gl),b=gl[remove].bind(gl);gl[create]=(...params)=>{update(1);return a(...params);};gl[remove]=(...params)=>{if(params[0])update(-1);return b(...params);};
  }
  return context;
};
const raf=window.requestAnimationFrame.bind(window);
window.requestAnimationFrame=callback=>raf(time=>{
  const beforeCalls=calls,beforeTriangles=triangles;
  const query=extension&&pending.length<12?gl.createQuery():null;
  if(query)gl.beginQuery(extension.TIME_ELAPSED_EXT,query);
  const start=performance.now();
  try{callback(time);}finally{
    const count=calls-beforeCalls;
    if(count){frames.push({cpu:performance.now()-start,interval:lastFrame?time-lastFrame:0,calls:count,triangles:triangles-beforeTriangles});lastFrame=time;}
    if(query){gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push({query,drawn:!!count});}
  }
});
const avg=(xs,key)=>xs.length?xs.reduce((s,x)=>s+(key?x[key]:x),0)/xs.length:0;
setInterval(()=>{
  if(gl)pending=pending.filter(({query,drawn})=>{
    if(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))return true;
    if(drawn&&!gl.getParameter(extension.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
    gl.deleteQuery(query);return false;
  });
  while(frames.length>120)frames.shift();while(gpu.length>120)gpu.shift();
  panel.textContent=JSON.stringify({samples:frames.length,frameCPUms:+avg(frames,'cpu').toFixed(2),frameIntervalMs:+avg(frames,'interval').toFixed(2),GPUms:gpu.length?+avg(gpu).toFixed(2):null,drawCalls:+avg(frames,'calls').toFixed(1),triangles:Math.round(avg(frames,'triangles')),textures,programs},null,2);
},1000);
await import('../js/study-ui.js?v=20260916-perf1');
