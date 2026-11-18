// Keep a single model, camera, animation and picking implementation on devices
// without WebGL. Only the final triangle-to-pixel stage is replaced.
import { mountWorld } from '../scene/world.bundle.js?v=atelier1';
import { createMeshRaster } from '../scene/mesh-raster.js?v=atelier1';
export async function mountSoftwareWorld(options) {
  let raster;
  const engine=await mountWorld({...options, rendererFactory:canvas=>(raster=createMeshRaster(canvas))});
  if (!engine?.getState?.().webgl) {engine?.dispose?.();throw Error('Blender scene could not start');}
  const state=engine.getState;
  engine.getState=()=>({...state(),webgl:false,renderer:'software',renderedMeshes:raster.info.render.calls});
  return engine;
}
