// Bring the same surveyed image planes, physical returns and finite terrain into
// the native renderer. The source-camera depth is a projective texture coordinate,
// independent of the visitor's camera, so details stay attached as they walk.
import { ShaderMaterial, ShapeUtils } from '../js/vendor/three.module.min.js';
import { geometry } from '../js/software-renderer.js';
import { buildPhotographicDistrict, PHOTO_PLACES } from '../js/software-districts.js';
import { HOME, regionalHeight, worldFov } from './world-layout.js';

const vertexShader = `
  attribute vec3 projectedUV;
  attribute vec3 pigment;
  attribute vec4 edgeMargin;
  attribute vec4 edgeRegion;
  varying vec4 margin;
  varying vec4 region;
  varying vec3 sourceUV;
  varying vec3 surfaceColor;
  void main() {
    margin = edgeMargin; region = edgeRegion;
    sourceUV = projectedUV;
    surfaceColor = pigment;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const fragmentShader = `
  uniform sampler2D plate;
  uniform float textured;
  uniform float strength;
  uniform float alphaCut;
  uniform vec3 lighting;
  varying vec4 margin;
  varying vec4 region;
  varying vec3 sourceUV;
  varying vec3 surfaceColor;
  void main() {
    // Screen-door fading leaves depth/occlusion identical for every fragment
    // assigned to this pixel, including transparent leaf edges and portals.
    if (strength < 0.999 && fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056,.00583715)))) > strength) discard;
    vec4 sampleColor = vec4(1.0);
    vec2 uv = sourceUV.xy / max(.00001,sourceUV.z);
    if (textured > .5) sampleColor = texture2D(plate, uv);
    vec2 localUV=(uv-region.xy)/max(vec2(.0001),region.zw-region.xy);
    vec4 distanceToEdge=vec4(localUV,1.-localUV);
    vec4 edge=mix(vec4(1.),smoothstep(vec4(0.),max(margin,vec4(.00001)),distanceToEdge),step(vec4(.0001),margin));
    sampleColor.a *= min(min(edge.x,edge.y),min(edge.z,edge.w));
    if (sampleColor.a < alphaCut) discard;
    // Photographic assets already contain the site's light and sRGB contrast.
    gl_FragColor = vec4(sampleColor.rgb * surfaceColor * lighting, sampleColor.a);
  }`;

function triangles(T, points) {
  if (points.length < 4) return [[0,1,2]];
  if (points.length === 4) return [[0,1,2],[0,2,3]];
  // An architectural outline (gables, eaves, crenellations) can be concave.
  // Flatten along its polygon normal before tessellating.
  const normal = [0,0,0];
  for (let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    normal[0]+=(a[1]-b[1])*(a[2]+b[2]);
    normal[1]+=(a[2]-b[2])*(a[0]+b[0]);
    normal[2]+=(a[0]-b[0])*(a[1]+b[1]);
  }
  const m=normal.map(Math.abs), omit=m.indexOf(Math.max(...m));
  const flat=points.map(p=>new T.Vector2(p[(omit+1)%3],p[(omit+2)%3]));
  return ShapeUtils.triangulateShape(flat,[]);
}

function registerCamera(T,view,source) {
  const h=regionalHeight(view.region,...view.eye)+HOME.eyeHeight;
  const eye=new T.Vector3(view.eye[0],h,view.eye[1]);
  const forward=new T.Vector3(...view.target).sub(eye).normalize();
  const right=forward.clone().cross(new T.Vector3(0,1,0)).normalize();
  const up=right.clone().cross(forward);
  const sf=Math.sin(source.yaw), cf=Math.cos(source.yaw), sp=Math.sin(source.pitch), cp=Math.cos(source.pitch);
  const lens=Math.tan(worldFov(1.5,false)*Math.PI/360)/Math.tan(source.fov*Math.PI/360);
  // Both cameras use the mapped eye in metres. Canvas and Three.js put
  // screen-right on opposite sides of their camera's positive Z axis.
  const result=new T.Vector3();
  function position(p) {
    const x=p[0]-source.x, y=p[1]-source.eyeY, z=p[2]-source.z;
    const horizontal=x*sf+z*cf;
    return result.copy(eye).addScaledVector(right,(x*cf-z*sf)*lens)
      .addScaledVector(up,(y*cp-horizontal*sp)*lens)
      .addScaledVector(forward,(y*sp+horizontal*cp));
  }
  return {eye,position};
}

export function createPlacePhoto(T,{key,view,onReady}) {
  const plain=key.replace(/^landmark-/,''), source=PHOTO_PLACES['landmark-'+plain];
  const shape=geometry(), scene=new T.Scene(), group=new T.Group();
  scene.add(group);group.name='Photographic surfaces · '+plain;
  let disposed=false,ready=false;
  buildPhotographicDistrict(shape,plain,{horizonRadius:135});
  const registered=registerCamera(T,view,source);
  const batches=new Map(), materials=[],textures=new Set(),buffers=[];
  const contextStrength={value:1};
  const common={strength:{value:1},lighting:{value:new T.Vector3(1,1,1)}};
  for (const face of shape.faces) {
    if (face.label || face.points.length<3 || face.points.some(p=>!p.every(Number.isFinite))) continue;
    const texture=face.options.texture || '';
    const soft=!!(face.options.feather || face.options.blend);
    const local=!!face.options.nearView;
    const batchKey=texture+(soft?'#blend':'#solid')+(local?'#near':'');
    if(!batches.has(batchKey)) batches.set(batchKey,{texture,soft,local,positions:[],uvq:[],colors:[],margins:[],regions:[]});
    const b=batches.get(batchKey), rgb=typeof face.color==='number'?face.color:parseInt(face.color.slice(1),16);
    const power=face.options.textureBrightness??1;
    const tint=texture?[power,power,power]:[rgb>>16&255,rgb>>8&255,rgb&255].map(x=>x/255*(face.light??1));
    for(const indices of triangles(T,face.points)) for(const index of indices){
      const p=registered.position(face.points[index]);b.positions.push(p.x,p.y,p.z);
      b.uvq.push(...(face.uvq?.[index]||[0,0,1]));b.colors.push(...tint);
      b.margins.push(...(face.options.feather||[0,0,0,0]));
      b.regions.push(...(face.options.featherUV||[0,0,1,1]));
    }
  }
  const loader=new T.TextureLoader(),promises=[],decoded=new Map();
  for(const b of batches.values()){
    const descriptor=shape.textureSources.get(b.texture);
    const material=new ShaderMaterial({vertexShader,fragmentShader,side:T.DoubleSide,toneMapped:false,transparent:b.soft,depthWrite:!b.soft,
      uniforms:{...common,strength:b.local?contextStrength:common.strength,alphaCut:{value:b.soft?.015:.38},textured:{value:0},plate:{value:null}}});
    const buffer=new T.BufferGeometry();
    buffer.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));
    buffer.setAttribute('projectedUV',new T.Float32BufferAttribute(b.uvq,3));
    buffer.setAttribute('pigment',new T.Float32BufferAttribute(b.colors,3));
    buffer.setAttribute('edgeMargin',new T.Float32BufferAttribute(b.margins,4));
    buffer.setAttribute('edgeRegion',new T.Float32BufferAttribute(b.regions,4));
    buffer.computeBoundingSphere();buffers.push(buffer);materials.push(material);
    group.add(new T.Mesh(buffer,material));
    if(!descriptor) continue;
    const url=new URL(descriptor.path,import.meta.url);
    url.searchParams.set('v','survey2');
    if (b.texture === plain) {
      // Reuse exactly the resolution the visitor was looking at in the gallery.
      const image=globalThis.document?.querySelector?.('.study-tour .tour-view img');
      const shown=image?.complete&&image.naturalWidth&&image.currentSrc?new URL(image.currentSrc):null;
      if(shown?.origin===url.origin && shown.pathname.replace(/-\d+\.webp$/,'')===url.pathname.replace(/-\d+\.webp$/,'')){
        url.pathname=shown.pathname;
      } else if ((globalThis.innerWidth||1280)<=640 && (globalThis.devicePixelRatio||1)<1.6) {
        url.pathname=url.pathname.replace(/-1280\.webp$/,'-768.webp');
      } else if ((globalThis.innerWidth||0)>1350) {
        url.pathname=url.pathname.replace(/-1280\.webp$/,'-1536.webp');
      }
    }
    let loading=decoded.get(url.href);
    if(!loading){loading=loader.loadAsync(url.href);decoded.set(url.href,loading);}
    promises.push(loading.then(map=>{
      if(disposed){map.dispose();return;}
      map.flipY=false;map.colorSpace=T.NoColorSpace;map.anisotropy=4;
      if(descriptor.repeat) map.wrapS=map.wrapT=T.RepeatWrapping;
      map.needsUpdate=true;textures.add(map);
      material.uniforms.plate.value=map;material.uniforms.textured.value=1;
    }));
  }
  const pending=Promise.all(promises).then(()=>{
    if(disposed)return false;
    ready=true;onReady?.();return true;
  });
  return {group,ready:pending,
    get coversView() {return ready && !disposed && common.strength.value===1;},
    update(camera,time) {
      const delta=camera.position.distanceTo(registered.eye);
      common.strength.value=1-T.MathUtils.smoothstep(delta,30,51);
      contextStrength.value=1-T.MathUtils.smoothstep(delta,12,25);
      const night=Math.min(1,Math.max(0,time?.nightMix??0));
      common.lighting.value.set(1-.45*night,1-.39*night,1-.28*night);
    },
    render(renderer,camera,fullFrame=false) {
      if(!ready || disposed || common.strength.value<.004 || !renderer.clearDepth) return false;
      const original=renderer.autoClear;
      try {
        // The textured dome encloses the camera near the registered view.
        // Only the transition out of that area needs the regional scene behind it.
        renderer.autoClear=fullFrame;
        if (!fullFrame) renderer.clearDepth();
        renderer.render(scene,camera);
      }
      finally {renderer.autoClear=original;}
      return true;
    },
    dispose() {
      disposed=true;group.clear();
      for(const buffer of buffers)buffer.dispose();
      for(const material of materials)material.dispose();
      for(const map of textures)map.dispose();
    }
  };
}
