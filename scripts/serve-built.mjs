// Local preview of the static artifact and production headers. No proxy, OAuth or secrets here.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, 'dist/site-chips-in-hand/browser');
const port = Number(process.env.PORT || 4300);
const apiOrigin = process.env.API_BASE_URL || '';
if (apiOrigin) {
  const url = new URL(apiOrigin);
  if (
    url.origin !== apiOrigin ||
    (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('API_BASE_URL must be an HTTPS origin (HTTP loopback is allowed).');
  }
}
const headers = JSON.parse(await readFile(resolve(project, 'deploy/headers.example.json'), 'utf8'));
headers['Content-Security-Policy'] = headers['Content-Security-Policy']
  .replace('https://api.example.com', apiOrigin || "'self'")
  .replace('; upgrade-insecure-requests', '');
delete headers['Strict-Transport-Security'];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
await stat(resolve(root, 'index.html'));
createServer(async (request, response) => {
  // Never log request URLs: /pay/ paths contain access tokens.
  try {
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/runtime-config.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        request.method === 'HEAD' ? undefined : JSON.stringify({ apiBaseUrl: apiOrigin }),
      );
      return;
    }
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (pathname.startsWith('/api/') || pathname === '/api') {
      response.writeHead(404);
      response.end();
      return;
    }
    let target = file;
    try {
      if (!(await stat(target)).isFile()) target = resolve(root, 'index.html');
    } catch {
      if (extname(pathname) && !pathname.startsWith('/pay/')) {
        response.writeHead(404);
        response.end();
        return;
      }
      target = resolve(root, 'index.html');
    }
    if (target.endsWith('index.html') && pathname !== '/')
      response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (/-[A-Z0-9]{8,}\.(js|css)$/i.test(target))
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('Content-Type', mime[extname(target)] || 'application/octet-stream');
    response.end(request.method === 'HEAD' ? undefined : await readFile(target));
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(port, '127.0.0.1', () => console.info(`Static preview: http://localhost:${port}`));
