import { GLTFLoader } from '../js/vendor/GLTFLoader.js';
import { DRACOLoader } from '../js/vendor/DRACOLoader.js';

/** Distant coat/rig first; the original groom is reserved for explicit focus. */
export async function loadWorldCat(detail = 'world', { signal } = {}) {
  const decoder = new DRACOLoader().setDecoderPath(new URL('../js/vendor/draco/', import.meta.url).href).setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const file = detail === 'full' ? 'tabby-cat.glb' : 'tabby-cat-world.glb';
  try {
    const timeout = AbortSignal.timeout(45000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(new URL('../models/' + file, import.meta.url), { signal: requestSignal, priority: 'low' });
    if (!response.ok) throw new Error('World cat: HTTP ' + response.status);
    return await loader.parseAsync(await response.arrayBuffer(), new URL('../models/', import.meta.url).href);
  } finally { decoder.dispose(); }
}
