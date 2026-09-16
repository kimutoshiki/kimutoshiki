import { GLTFLoader } from '../js/vendor/GLTFLoader.js';
import { DRACOLoader } from '../js/vendor/DRACOLoader.js';

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

export function disposeCatAsset(asset) {
  if (!asset) return;
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  asset.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => { texture.image?.close?.(); texture.dispose(); });
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
}
