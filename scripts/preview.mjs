// Dependency-free development server for this buildless GitHub Pages site.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf'};
createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(requestUrl.pathname);
    const file = resolve(root, '.' + pathname);
    if (!(file === root || file.startsWith(root + sep)) || pathname.split('/').some(p=>p.startsWith('.'))) { res.writeHead(403); res.end(); return; }
    const path = (await stat(file)).isDirectory() ? resolve(file, 'index.html') : file;
    let data = await readFile(path);
    // Opt-in local measurement; production HTML never loads the GL wrappers.
    if (args.includes('--performance') && requestUrl.searchParams.get('performance') === '1' && path === resolve(root, 'index.html')) {
      data = data.toString().replace(/<script src="js\/study-ui\.js[^\"]*" defer>\s*<\/script>/,
        '<script type="module" src="scripts/performance-audit.js"></script>');
    }
    res.writeHead(200, {'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(argument('--port', '4173')), argument('--host', '0.0.0.0'));
