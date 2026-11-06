import { build } from 'esbuild';
import { readdir, unlink, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url), directory = new URL('scene/', root);
// Legacy unbundled pages use query revisions. One physical source should still
// appear only once in this content-hashed build, especially the surface loader.
const sourceRevisions = { name: 'canonical-local-sources', setup(bundler) {
  bundler.onResolve({ filter: /\?v=/ }, args => bundler.resolve(args.path.split('?')[0], { resolveDir: args.resolveDir, kind: args.kind }));
} };
const result = await build({ absWorkingDir: root.pathname, entryPoints: { 'world.bundle': 'scene/world.js' }, outdir: 'scene', bundle: true, splitting: true, format: 'esm', target: ['es2022'], minify: true, legalComments: 'linked', chunkNames: 'world-chunk-[name]-[hash]', metafile: true, write: false, plugins: [sourceRevisions] });
// Keep the last working build intact if compilation fails.
for (const name of await readdir(directory)) if (/^world\.bundle\.js(?:\.LEGAL\.txt)?$/.test(name) || /^world-chunk-.*\.js(?:\.LEGAL\.txt)?$/.test(name)) await unlink(new URL(name, directory));
for (const file of result.outputFiles) await writeFile(file.path, file.contents);
let bytes = 0, gzip = 0;
for (const name of Object.keys(result.metafile.outputs)) { const data = await readFile(new URL(name, root)); bytes += data.length; gzip += gzipSync(data).length; }
const initial = new Set();
function visit(file) {
  if (initial.has(file)) return;
  initial.add(file);
  for (const dependency of result.metafile.outputs[file]?.imports || []) if (!dependency.external && dependency.kind !== 'dynamic-import') visit(dependency.path);
}
visit('scene/world.bundle.js');
let initialBytes = 0, initialGzip = 0;
for (const name of initial) { const data = await readFile(new URL(name, root)); initialBytes += data.length; initialGzip += gzipSync(data).length; }
console.log(JSON.stringify({ files: Object.keys(result.metafile.outputs), bytes, gzip, initial: { files: [...initial], bytes: initialBytes, gzip: initialGzip } }, null, 2));
