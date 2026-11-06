import { build } from 'esbuild';
import { readdir, unlink } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url), directory = new URL('scene/', root);
for (const name of await readdir(directory)) if (/^world\.bundle\.js(?:\.LEGAL\.txt)?$/.test(name) || /^world-chunk-.*\.js(?:\.LEGAL\.txt)?$/.test(name)) await unlink(new URL(name, directory));
const result = await build({ absWorkingDir: root.pathname, entryPoints: { 'world.bundle': 'scene/world.js' }, outdir: 'scene', bundle: true, splitting: true, format: 'esm', target: ['es2022'], minify: true, legalComments: 'linked', chunkNames: 'world-chunk-[name]-[hash]', metafile: true });
let bytes = 0, gzip = 0;
for (const name of Object.keys(result.metafile.outputs)) { const data = await readFile(new URL(name, root)); bytes += data.length; gzip += gzipSync(data).length; }
console.log(JSON.stringify({ files: Object.keys(result.metafile.outputs), bytes, gzip }, null, 2));
