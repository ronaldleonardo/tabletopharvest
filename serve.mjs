// serve.mjs  (c) 2026 Ronald  - minimal static server for Astro (format: file) output
// with canonical-URL cleanup that Cloudflare Tunnel alone does not provide:
//   1. trailing-slash  -> no-slash  (301, matches emitted canonical)
//   2. http            -> https     (301, when the original scheme is visible at origin)
// Run: PORT=8084 node serve.mjs   (serves ./dist)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

function safePath(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0')) return null;
  const norm = normalize(p).replace(/^(\.\.[/\\])+/, '');
  if (norm.startsWith('..') || p.split('/').includes('..')) return null;
  return norm;
}

async function anyFile(base) {
  for (const cand of [`${base}.html`, base, join(base, 'index.html')]) {
    try {
      const s = await stat(cand);
      if (s.isFile()) return cand;
    } catch {}
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = url.pathname;

  // 1. Force https when origin can see the original scheme (Cloudflare sets x-forwarded-proto).
  const proto = req.headers['x-forwarded-proto'] || '';
  if (proto === 'http') {
    res.writeHead(301, { Location: `https://${req.headers.host}${url.pathname}${url.search}` });
    return res.end();
  }

  // 2. Normalize trailing slash (skip root) to the no-slash canonical form.
  if (path.length > 1 && path.endsWith('/')) {
    res.writeHead(301, { Location: path.slice(0, -1) + url.search });
    return res.end();
  }

  // 3. Serve file.
  let rel = safePath(path);
  if (rel === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Bad Request');
  }
  if (rel === '') rel = 'index.html';
  let file = await anyFile(join(ROOT, rel));
  if (!file) {
    file = await anyFile(join(ROOT, '404'));
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not Found');
    }
    res.writeHead(404, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    return res.end(await readFile(file));
  }
  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Robots-Tag': 'index, follow',
  });
  res.end(body);
});

server.listen(PORT, HOST, () => {
  console.log(`serve.mjs: serving ${ROOT} on http://${HOST}:${PORT}`);
});