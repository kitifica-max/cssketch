#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   cssketch-mcp — servidor MCP por stdio
   Herramientas locales para generar, validar, guardar y
   previsualizar CSS Art sin depender de backend ni storage.

   Transporte: StdioServerTransport (para Claude Code y
   cualquier cliente MCP que lance el binario).
   ═══════════════════════════════════════════════════════════ */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildPrompt } from './prompt.js';
import { validateArt } from './validate.js';
import {
  startPreview, ensureArtesDir, artPath, sanitizeName, ARTES_DIR,
} from './preview.js';

const execFileP = promisify(execFile);

/* ── utilidades ─────────────────────────────────────────── */

function fileLabel(p) {
  if (!p) return '(sin archivo)';
  return path.basename(p);
}

function mimeOf(p) {
  const ext = path.extname(p).toLowerCase();
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  })[ext] || 'application/octet-stream';
}

function isImage(p) {
  return mimeOf(p).startsWith('image/');
}

/** Lee una imagen y devuelve el content block de MCP. */
async function imageBlock(p) {
  const data = await fs.readFile(p);
  return { type: 'image', data: data.toString('base64'), mimeType: mimeOf(p) };
}

function text(s) {
  return { type: 'text', text: s };
}

function json(obj) {
  return text(JSON.stringify(obj, null, 2));
}

function toolError(message) {
  return { content: [text(`Error: ${message}`)], isError: true };
}

/* ── servidor ───────────────────────────────────────────── */

const server = new McpServer({ name: 'cssketch', version: '1.0.0' });

/* ── cssketch_start ─────────────────────────────────────── */
server.registerTool(
  'cssketch_start',
  {
    title: 'CSSketch · análisis de boceto',
    description:
      'Lee el boceto (estructura) y la referencia (estilo) desde disco, los devuelve como imágenes ' +
      'y entrega el Prompt Técnico Maestro que rige la generación del CSS Art. ' +
      'Usa este prompt para generar UN documento HTML autocontenido con <style> y :root paramétrico.',
    inputSchema: {
      sketch_path: z.string().describe('Ruta absoluta del boceto (estructura).'),
      ref_path: z.string().describe('Ruta absoluta de la referencia (estilo).'),
      hint: z.string().optional().describe('Indicación opcional del usuario (tono, paleta, época).'),
    },
  },
  async ({ sketch_path, ref_path, hint }) => {
    try {
      await fs.access(sketch_path);
      await fs.access(ref_path);
      if (!isImage(sketch_path)) return toolError(`El boceto no es una imagen: ${sketch_path}`);
      if (!isImage(ref_path)) return toolError(`La referencia no es una imagen: ${ref_path}`);

      const prompt = buildPrompt({
        sketch: fileLabel(sketch_path),
        ref: fileLabel(ref_path),
        hint,
      });

      return {
        content: [
          text(prompt),
          await imageBlock(sketch_path),
          await imageBlock(ref_path),
        ],
      };
    } catch (err) {
      return toolError(`No se pudieron leer las imágenes: ${err.message}`);
    }
  }
);

/* ── cssketch_save ──────────────────────────────────────── */
server.registerTool(
  'cssketch_save',
  {
    title: 'CSSketch · guardar arte',
    description:
      'Valida un CSS Art generado, lo escribe en ~/cssketch/artes/<name>.html y arranca el servidor ' +
      'local de preview. Devuelve la URL para abrirlo en el browser con el panel de propiedades.',
    inputSchema: {
      name: z.string().min(1).describe('Nombre del arte (kebab-case).'),
      html: z.string().min(1).describe('Documento HTML autocontenido con <style> y :root.'),
    },
  },
  async ({ name, html }) => {
    const report = validateArt(html);
    if (!report.ok) {
      return toolError(
        `El CSS Art no es válido:\n${report.errors.map((e) => `· ${e}`).join('\n')}`
      );
    }

    const safe = sanitizeName(name);
    await ensureArtesDir();
    const file = artPath(safe);
    await fs.writeFile(file, html, 'utf8');

    const preview = await startPreview();
    const url = `${preview.url}/#arte=${encodeURIComponent(safe)}`;

    return {
      content: [
        json({
          ok: true,
          name: safe,
          file,
          url,
          port: preview.port,
          variables: report.variables.length,
          nodes: report.stats.nodes,
          techniques: `${report.techniques.filter((t) => t.present).length}/${report.techniques.length}`,
          warnings: report.warnings,
        }),
      ],
    };
  }
);

/* ── cssketch_validate ──────────────────────────────────── */
server.registerTool(
  'cssketch_validate',
  {
    title: 'CSSketch · validar arte',
    description:
      'Valida un CSS Art contra el contrato del Prompt Técnico Maestro: :root, variables parseables, ' +
      'técnicas exigidas, ausencia de dependencias externas. Devuelve informe + manifest de variables.',
    inputSchema: {
      html: z.string().min(1).describe('Documento HTML autocontenido con <style> y :root.'),
    },
  },
  async ({ html }) => {
    const r = validateArt(html);
    return {
      content: [
        json({
          ok: r.ok,
          errors: r.errors,
          warnings: r.warnings,
          stats: r.stats,
          techniques: r.techniques,
          variables: r.variables.map((v) => ({
            name: v.name, type: v.type, group: v.group,
            label: v.label, value: v.value,
            ...(v.options ? { options: v.options } : {}),
            ...(v.type === 'range' ? { min: v.min, max: v.max, step: v.step, unit: v.unit, displayUnit: v.displayUnit } : {}),
          })),
        }),
      ],
      isError: !r.ok,
    };
  }
);

/* ── cssketch_list ──────────────────────────────────────── */
server.registerTool(
  'cssketch_list',
  {
    title: 'CSSketch · listar artes',
    description: 'Lista los CSS Art guardados en ~/cssketch/artes/ con su tamaño.',
    inputSchema: {},
  },
  async () => {
    try {
      await ensureArtesDir();
      const files = await fs.readdir(ARTES_DIR);
      const arts = [];
      for (const f of files.filter((f) => f.endsWith('.html')).sort()) {
        const st = await fs.stat(path.join(ARTES_DIR, f));
        arts.push({ name: f.replace(/\.html$/, ''), file: path.join(ARTES_DIR, f), sizeKB: Math.round(st.size / 102.4) / 10 });
      }
      return { content: [json({ dir: ARTES_DIR, count: arts.length, arts })] };
    } catch (err) {
      return toolError(`No se pudo listar: ${err.message}`);
    }
  }
);

/* ── cssketch_open ──────────────────────────────────────── */
server.registerTool(
  'cssketch_open',
  {
    title: 'CSSketch · abrir en browser',
    description:
      'Abre el servidor de preview en el browser. Si se indica name, abre ese arte con su panel de ' +
      'propiedades; si no, abre la UI en blanco lista para recibir un arte.',
    inputSchema: {
      name: z.string().optional().describe('Nombre del arte a abrir.'),
    },
  },
  async ({ name }) => {
    try {
      const preview = await startPreview();
      const target = name
        ? `${preview.url}/#arte=${encodeURIComponent(sanitizeName(name))}`
        : preview.url;

      await execFileP('open', [target]);

      return {
        content: [json({
          ok: true,
          url: target,
          port: preview.port,
          message: `Abierto en el browser: ${target}`,
        })],
      };
    } catch (err) {
      return toolError(`No se pudo abrir el browser: ${err.message}`);
    }
  }
);

/* ── arranque stdio ─────────────────────────────────────── */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout es el canal MCP: nada debe imprimirse ahí.
  console.error('[cssketch-mcp] listo por stdio');
}

main().catch((err) => {
  console.error('[cssketch-mcp] fatal:', err);
  process.exit(1);
});
