// Serves the browser client: /shared/* from shared/, everything else from public/.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function staticHandler(root) {
  const mounts = [['/shared/', path.join(root, 'shared')], ['/', path.join(root, 'public')]];
  return async (req, res) => {
    let url;
    try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { url = null; }
    const mount = url && mounts.find(([prefix]) => url.startsWith(prefix));
    if (mount) {
      const [prefix, dir] = mount;
      const file = path.join(dir, url.slice(prefix.length) || 'index.html');
      if (file.startsWith(dir + path.sep)) { // no ../ escapes
        try {
          const body = await readFile(file);
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
          res.end(body);
          return;
        } catch {}
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
}
