/* ═══════════════════════════════════════════════════════════
   netlify/functions/mcp.js — CSSketch MCP sobre HTTP (stateless)
   Cada POST crea un McpServer + WebStandardStreamableHTTP
   nuevos (Netlify Functions es aislado por invocación), con
   enableJsonResponse para responder JSON plano sin SSE.

   El motor de generación es el cliente (p. ej. Claude Code). Este
   servidor no llama a ninguna API de IA: prepara el prompt y las
   imágenes, y valida el HTML que el cliente escribe.

   Tools HTTP:
     cssketch_prompt   → Prompt Técnico Maestro (descripciones en texto)
     cssketch_start    → Prompt + imágenes (base64) para que el cliente genere
     cssketch_validate → validación + manifest + uiUrl con el arte embebido
   ═══════════════════════════════════════════════════════════ */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import { buildPrompt } from '../../mcp/prompt.js';
import { validateArt, buildFragment } from '../../mcp/validate.js';

/* ── helper: content blocks ─────────────────────────────── */
const text = (s) => ({ type: 'text', text: s });
const image = (data, mimeType) => ({ type: 'image', data, mimeType });
const json = (obj) => text(JSON.stringify(obj, null, 2));

/* ── servidor por request ───────────────────────────────── */
function buildServer() {
  const server = new McpServer({ name: 'cssketch', version: '1.0.0' });

  server.registerTool(
    'cssketch_prompt',
    {
      title: 'CSSketch · prompt de generación',
      description:
        'Devuelve el Prompt Técnico Maestro isométrico condicionado por las descripciones del boceto ' +
        '(estructura) y la referencia (estilo, puede no ser isométrica). Sin referencia, basta la indicación. ' +
        'Quien llama escribe el HTML con este prompt y lo valida con cssketch_validate.',
      inputSchema: {
        sketch: z.string().optional().describe('Descripción del boceto (estructura).'),
        ref: z.string().optional().describe('Descripción de la referencia (estilo y forma).'),
        hint: z.string().optional().describe('Indicación opcional (objetos, paleta, estilo line-art | flat-tone).'),
      },
    },
    async ({ sketch, ref, hint }) => ({
      content: [text(buildPrompt({ sketch, ref, hint }))],
    })
  );

  server.registerTool(
    'cssketch_start',
    {
      title: 'CSSketch · prompt + imágenes',
      description:
        'Devuelve el Prompt Técnico Maestro isométrico junto con las imágenes en base64 (boceto y/o referencia). ' +
        'No llama a ninguna API: quien llama (p. ej. Claude Code) ve las imágenes, escribe el HTML con el ' +
        'prompt y lo valida con cssketch_validate. Sin imágenes, pasa al menos hint.',
      inputSchema: {
        sketch_b64: z.string().optional().describe('Boceto en base64 (sin prefijo data:). Opcional.'),
        ref_b64: z.string().optional().describe('Referencia en base64 (sin prefijo data:). Opcional; no tiene que ser isométrica.'),
        media_type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
          .optional().describe('Tipo MIME de las imágenes. Default image/png.'),
        hint: z.string().optional().describe('Indicación del usuario. Obligatoria si no hay imágenes.'),
      },
    },
    async ({ sketch_b64, ref_b64, media_type, hint }) => {
      if (!sketch_b64 && !ref_b64 && !hint) {
        return { content: [text('Error: sin imágenes ni indicación: pasa sketch_b64, ref_b64 o hint.')], isError: true };
      }
      const mime = media_type || 'image/png';
      const prompt = buildPrompt({
        sketch: sketch_b64 ? 'boceto (imagen adjunta)' : undefined,
        ref: ref_b64 ? 'referencia (imagen adjunta)' : undefined,
        hint,
      });
      const blocks = [text(prompt)];
      if (sketch_b64) blocks.push(image(sketch_b64, mime));
      if (ref_b64) blocks.push(image(ref_b64, mime));
      return { content: blocks };
    }
  );

  server.registerTool(
    'cssketch_validate',
    {
      title: 'CSSketch · validar arte',
      description:
        'Valida un CSS Art contra el contrato del Prompt Técnico Maestro y devuelve informe + manifest de ' +
        'variables + uiUrl con el arte embebido en #d=<base64> para abrirlo en la UI sin storage.',
      inputSchema: {
        html: z.string().min(1).describe('Documento HTML autocontenido con <style> y :root.'),
      },
    },
    async ({ html }) => {
      const r = validateArt(html);
      return {
        content: [json({
          ok: r.ok,
          errors: r.errors,
          warnings: r.warnings,
          stats: r.stats,
          techniques: r.techniques,
          architecture: r.architecture,
          variables: r.variables.map((v) => ({
            name: v.name, type: v.type, group: v.group, label: v.label, value: v.value,
            ...(v.options ? { options: v.options } : {}),
            ...(v.type === 'range' ? { min: v.min, max: v.max, step: v.step, unit: v.unit, displayUnit: v.displayUnit } : {}),
          })),
          // abriendo la UI con este hash se renderiza el arte sin storage
          uiUrl: `${process.env.URL || 'https://cssketch.kitifica.com'}/editor.html${buildFragment(html)}`,
        })],
        isError: !r.ok,
      };
    }
  );

  return server;
}

/* ── handler Netlify ────────────────────────────────────── */
export default async function handler(req) {
  // stateless: no sesiones, no SSE. Solo POST con JSON-RPC.
  if (req.method === 'GET' || req.method === 'DELETE') {
    return new Response(
      JSON.stringify({ error: 'Usa POST con JSON-RPC (initialize, tools/list, tools/call).' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);

  // el transport exige accept con json o text/event-stream
  const headers = new Headers(req.headers);
  if (!headers.get('accept')) headers.set('accept', 'application/json, text/event-stream');

  const request = new Request(req.url, { method: 'POST', headers, body: JSON.stringify(body) });
  return transport.handleRequest(request);
}
