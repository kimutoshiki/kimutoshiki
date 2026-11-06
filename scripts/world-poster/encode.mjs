import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/world-poster/encode.mjs [--input-dir DIRECTORY] [--output-dir DIRECTORY]');
  process.exit(0);
}
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!['--input-dir', '--output-dir'].includes(args[i]) || !args[i + 1] || options.has(args[i])) {
    throw new Error('Expected --input-dir DIRECTORY and/or --output-dir DIRECTORY.');
  }
  options.set(args[i], args[i + 1]);
}
const input = path.resolve(options.get('--input-dir') || path.join(repo, 'work/world-poster'));
const output = path.resolve(options.get('--output-dir') || input);
await mkdir(output, { recursive: true });

for (const name of ['poster', 'poster-mobile']) {
  const image = await loadImage(path.join(input, `${name}.png`));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const quality = 84;
  const buffer = canvas.toBuffer('image/webp', quality);
  const file = path.join(output, `${name}.webp`);
  await writeFile(file, buffer);
  console.log(JSON.stringify({ file, width: image.width, height: image.height, quality, bytes: buffer.length }));
}
