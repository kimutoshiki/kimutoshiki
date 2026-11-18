// Keep a single model, camera, animation and picking implementation on devices
// without WebGL. Only the final triangle-to-pixel stage is replaced.
import { mountWorld } from '../scene/world.bundle.js?v=atelier1';
import { createMeshRaster } from '../scene/mesh-raster.js?v=atelier1';
export async function mountSoftwareWorld(options) {
  const engine=await mountWorld({...options, rendererFactory:createMeshRaster});
  if (engine?.getState?.().geometrySource !== 'blender') {
    engine?.dispose?.();
    throw Error('Blender scene could not start');
  }
  return engine;
}
