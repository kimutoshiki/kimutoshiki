import { GLTFLoader } from '../js/vendor/GLTFLoader.js';
import { DRACOLoader } from '../js/vendor/DRACOLoader.js';
export { disposeCatAsset } from './cat-disposal.js';

// Both levels come from the supplied Blender file. Decode on two workers;
// the full groom is requested only when the visitor looks closely.
export async function loadCatAsset(detail = 'room') {
  const decoder = new DRACOLoader().setDecoderPath(new URL('../js/vendor/draco/', import.meta.url).href).setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  try {
    const url = new URL(detail === 'full' ? '../models/tabby-cat.glb' : '../models/tabby-cat-room.glb', import.meta.url);
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Cat asset: HTTP ${response.status}`);
    return await loader.parseAsync(await response.arrayBuffer(), new URL('../models/', import.meta.url).href);
  } finally { decoder.dispose(); }
}
