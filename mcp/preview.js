/* ═══════════════════════════════════════════════════════════
   preview.js — Servidor local de previsualización
   Sirve el sitio CSSketch y los artes guardados en
   ~/cssketch/artes/ para que el browser los abra.

   Rutas:
     /            → index.html del sitio
     /css|/js|... → estáticos del sitio
     /arte/<name> → arte guardado (sin .html)
   ═══════════════════════════════════════════════════════════ */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = path.resolve(__dirname, '..');
export const ARTES_DIR = path.join(os.homedir(), 'cssketch', 'artes');

const PORT = Number(process.env.CSSKETCH_PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let server = null;
let currentPort = PORT;

/** Asegura que el directorio de artes existe. */
export async function ensureArtesDir() {
  await fs.mkdir(ARTES_DIR, { recursive: true });
  return ARTES_DIR;
}

/** Normaliza un nombre de arte a un identificador seguro. */
export function sanitizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'sin-nombre';
}

/** Ruta absoluta de un arte guardado. */
export function artPath(name) {
  return path.join(ARTES_DIR, `${sanitizeName(name)}.html`);
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function safeJoin(root, rel) {
  const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // ── arte guardado ──
    if (pathname.startsWith('/arte/')) {
      const name = pathname.slice('/arte/'.length).replace(/\.html$/, '');
      const file = artPath(name);
      const abs = safeJoin(ARTES_DIR, path.basename(file));
      if (!abs) return send(res, 400, 'Nombre inválido');
      try {
        const html = await fs.readFile(abs, 'utf8');
        return send(res, 200, html, MIME['.html']);
      } catch {
        return send(res, 404, `Arte "${sanitizeName(name)}" no encontrado`);
      }
    }

    // ── estáticos del sitio ──
    let rel = pathname === '/' ? 'editor.html' : pathname.replace(/^\/+/, '');
    const abs = safeJoin(SITE_ROOT, rel);
    if (!abs) return send(res, 403, 'Prohibido');

    try {
      const data = await fs.readFile(abs);
      const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
      return send(res, 200, data, type);
    } catch {
      // SPA fallback: rutas sin extensión → index.html
      if (!path.extname(rel)) {
        try {
          const html = await fs.readFile(path.join(SITE_ROOT, 'editor.html'));
          return send(res, 200, html, MIME['.html']);
        } catch { /* sigue al 404 */ }
      }
      return send(res, 404, 'No encontrado');
    }
  } catch (err) {
    return send(res, 500, `Error: ${err.message}`);
  }
}

/**
 * Arranca (o reutiliza) el servidor de preview.
 * @returns {Promise<{url:string, port:number, close:()=>Promise<void>}>}
 */
export async function startPreview() {
  if (server && server.listening) {
    return { url: `http://localhost:${currentPort}`, port: currentPort, close: stopPreview };
  }

  await ensureArtesDir();

  return new Promise((resolve, reject) => {
    const tryPort = (port, attempts = 0) => {
      const s = http.createServer((req, res) => { handle(req, res); });

      s.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < 20) {
          tryPort(port + 1, attempts + 1);
        } else {
          reject(err);
        }
      });

      s.listen(port, () => {
        server = s;
        currentPort = port;
        resolve({
          url: `http://localhost:${port}`,
          port,
          close: stopPreview,
        });
      });
    };

    tryPort(PORT);
  });
}

/** Cierra el servidor si está corriendo. */
export async function stopPreview() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise((resolve) => s.close(resolve));
}

export default startPreview;
