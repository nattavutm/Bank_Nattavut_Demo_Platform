import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const port = Number(process.env.PORT || 8787);
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.startsWith('/api/')) {
      const health = path === '/api/health';
      response.writeHead(health ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(health ? { app: 'r5r5 Bank', mode: 'ui-preview', integrations: { model: 'not-configured', guard: 'not-configured', scanner: 'not-configured' } } : { error: 'Live integrations are not configured.' }));
      return;
    }
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403); response.end(); return; }
    let content;
    let type = mime[extname(target)] || 'application/octet-stream';
    try { content = await readFile(target); }
    catch { content = await readFile(resolve(root, 'index.html')); type = mime['.html']; }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch { response.writeHead(500); response.end('Preview server error'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write('r5r5 Bank preview: http://127.0.0.1:' + port + '\n'));
process.on('SIGINT', () => server.close(() => process.exit(0)));
