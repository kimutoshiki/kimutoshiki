// Small homepage derivatives of the existing owner-supplied photographs.
// Full photos and factual captions remain in the original catalog and pages.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('images/home/', root), {recursive:true});
for (const [source, name] of [['waseda-night-thumb','waseda'],['kyukeisha-karatsu-thumb','kyukeisha']]) {
  const image = await loadImage(new URL(`images/journeys/${source}.webp`,root).pathname);
  const canvas = createCanvas(320, Math.round(image.height * 320 / image.width));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const bytes = await canvas.encode('webp',78);
  await writeFile(new URL(`images/home/${name}.webp`,root),bytes);
  console.log(`${name}: ${canvas.width} × ${canvas.height}, ${bytes.length} bytes`);
}
