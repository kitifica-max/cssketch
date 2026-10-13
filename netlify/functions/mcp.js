/* ═══════════════════════════════════════════════════════════
   netlify/functions/mcp.js — CSSketch MCP sobre HTTP (stateless)
   Cada POST crea un McpServer + WebStandardStreamableHTTP
   nuevos (Netlify Functions es aislado por invocación), con
   enableJsonResponse para responder JSON plano sin SSE.

   Tools HTTP:
     cssketch_prompt   → Prompt Técnico Maestro (el agente ya vio las imágenes)
     cssketch_validate → validación + manifest + fragmento #d=
     cssketch_generate → fallback Anthropic (solo con ANTHROPIC_API_KEY)
   ═══════════════════════════════════════════════════════════ */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import { buildPrompt } from '../../mcp/prompt.js';
import { validateArt, buildFragment } from '../../mcp/validate.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CSSKETCH_MODEL || 'claude-sonnet-4-5';

/* ── helper: content blocks de texto ────────────────────── */
const text = (s) => ({ type: 'text', text: s });
const json = (obj) => text(JSON.stringify(obj, null, 2));
const toolError = (message) => ({ content: [text(`Error: ${message}`)], isError: true });

/* ── fallback Anthropic ─────────────────────────────────── */
async function callAnthropic({ sketchB64, refB64, mediaType, hint }) {
  const prompt = buildPrompt({ sketch: 'boceto (imagen adjunta)', ref: 'referencia (imagen adjunta)', hint });

  const body = {
    model: MODEL,
    max_tokens: 8000,
    system: prompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: sketchB64 } },
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: refB64 } },
        { type: 'text', text: 'Genera el CSS Art siguiendo el Prompt Técnico Maestro. Devuelve solo el documento HTML autocontenido.' },
      ],
    }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const html = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!html) throw new Error('Anthropic no devolvió HTML.');
  return html;
}

/* ── servidor por request ───────────────────────────────── */
function buildServer() {
  const server = new McpServer({ name: 'cssketch', version: '1.0.0' });

  server.registerTool(
    'cssketch_prompt',
    {
      title: 'CSSketch · prompt de generación',
      description:
        'Devuelve el Prompt Técnico Maestro condicionado por las descripciones del boceto (estructura) y ' +
        'la referencia (estilo). Usa este prompt para generar un CSS Art autocontenido con <style> y :root paramétrico.',
      inputSchema: {
        sketch: z.string().optional().describe('Descripción del boceto (estructura).'),
        ref: z.string().optional().describe('Descripción de la referencia (estilo).'),
        hint: z.string().optional().describe('Indicación opcional (tono, paleta, época).'),
      },
    },
    async ({ sketch, ref, hint }) => ({
      content: [text(buildPrompt({ sketch, ref, hint }))],
    })
  );

  server.registerTool(
    'cssketch_validate',
    {
      title: 'CSSketch · validar arte',
      description:
        'Valida un CSS Art contra el contrato del Prompt Técnico Maestro y devuelve informe + manifest de ' +
        'variables + fragmento #d=<base64> para abrirlo en la UI sin storage.',
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
          variables: r.variables.map((v) => ({
            name: v.name, type: v.type, group: v.group, label: v.label, value: v.value,
            ...(v.options ? { options: v.options } : {}),
            ...(v.type === 'range' ? { min: v.min, max: v.max, step: v.step, unit: v.unit, displayUnit: v.displayUnit } : {}),
          })),
          // abriendo la UI con este hash se renderiza el arte sin storage
          uiUrl: `${process.env.URL || 'https://cssketch.netlify.app'}/${buildFragment(html)}`,
        })],
        isError: !r.ok,
      };
    }
  );

  // registro condicional del fallback (solo con API key)
  if (ANTHROPIC_KEY) {
    server.registerTool(
      'cssketch_generate',
      {
        title: 'CSSketch · generar con IA (fallback)',
        description:
          'Genera un CSS Art desde dos imágenes (boceto y referencia) usando la API de Anthropic. ' +
          'Solo disponible si el servidor tiene ANTHROPIC_API_KEY configurada. Devuelve el HTML validado.',
        inputSchema: {
          sketch_b64: z.string().min(1).describe('Boceto en base64 (sin prefijo data:).'),
          ref_b64: z.string().min(1).describe('Referencia en base64 (sin prefijo data:).'),
          media_type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
            .optional().describe('Tipo MIME de ambas imágenes. Default image/png.'),
          hint: z.string().optional().describe('Indicación opcional (tono, paleta, época).'),
        },
      },
      async ({ sketch_b64, ref_b64, media_type, hint }) => {
        try {
          const html = await callAnthropic({
            sketchB64: sketch_b64,
            refB64: ref_b64,
            mediaType: media_type || 'image/png',
            hint,
          });
          const report = validateArt(html);
          return {
            content: [json({
              ok: report.ok,
              warnings: report.warnings,
              variables: report.variables.length,
              nodes: report.stats.nodes,
              html,
              uiUrl: `${process.env.URL || 'https://cssketch.netlify.app'}/${buildFragment(html)}`,
            })],
            isError: !report.ok,
          };
        } catch (err) {
          return toolError(`Fallo al generar: ${err.message}`);
        }
      }
    );
  }

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
