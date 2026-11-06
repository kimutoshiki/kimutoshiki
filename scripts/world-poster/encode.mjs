import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/world-poster/encode.mjs [--input-dir DIRECTORY] [--output-dir DIRECTORY] [--manifest FILE]');
  process.exit(0);
}
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!['--input-dir', '--output-dir', '--manifest'].includes(args[i]) || !args[i + 1] || options.has(args[i])) {
    throw new Error('Expected --input-dir DIRECTORY and/or --output-dir DIRECTORY.');
  }
  options.set(args[i], args[i + 1]);
}
const input = path.resolve(options.get('--input-dir') || path.join(repo, 'work/world-poster'));
const output = path.resolve(options.get('--output-dir') || input);
await mkdir(output, { recursive: true });

const posters = [];
for (const name of ['poster', 'poster-mobile']) {
  const image = await loadImage(path.join(input, `${name}.png`));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const preferredBudget = name === 'poster' ? 100000 : 50000;
  let quality = 84, buffer = canvas.toBuffer('image/webp', quality);
  while (buffer.length > preferredBudget && quality > 40) buffer = canvas.toBuffer('image/webp', quality -= 2);
  const budget = name === 'poster' && buffer.length > preferredBudget ? 150000 : preferredBudget;
  if (buffer.length > budget) throw new Error(`${name} exceeds ${budget} bytes at quality ${quality}.`);
  const file = path.join(output, `${name}.webp`);
  await writeFile(file, buffer);
  const record = {file: `${name}.webp`, width: image.width, height: image.height, webpQuality: quality, bytes: buffer.length, preferredBudget, budget, sha256: createHash('sha256').update(buffer).digest('hex')};
  posters.push(record);
  console.log(JSON.stringify(record));
}

if (options.has('--manifest')) {
  const snapshot = JSON.parse(await readFile(path.join(input, 'snapshot-metadata.json'), 'utf8'));
  const manifest = {
    render: 'Blender 4.3.2 / CPU Cycles / 192 samples / adaptive threshold 0.008 / AgX',
    encodingScript: {file: 'scripts/world-poster/encode.mjs', sha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex')},
    verification: 'Actual Three.js geometry/material/image snapshot rendered offline. Cycles lighting is an approximation; this is not a browser or WebGL verification.',
    camera: {desktop: {...snapshot.camera, size: [1600,1000]}, mobile: {...snapshot.mobileCamera, size: [650,1000]}},
    cat: snapshot.cat, sun: snapshot.sun, lights: snapshot.lights, windowLight: snapshot.windowLight, fog: {...snapshot.fog, formula: '1-exp(-(density*depth)^2)'},
    geometry: snapshot.geometry, sourceHashes: snapshot.sourceHashes, textureHashes: snapshot.textureHashes, posters,
  };
  await writeFile(path.resolve(options.get('--manifest')), JSON.stringify(manifest, null, 2) + '\n');
}
