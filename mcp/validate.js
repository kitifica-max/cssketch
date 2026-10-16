/* ═══════════════════════════════════════════════════════════
   validate.js — Validador de CSS Art generado por LLM
   Comprueba el contrato del Prompt Técnico Maestro y devuelve
   un informe + el manifest de variables que la UI consume.

   Node-safe: no toca el DOM. Importa parseVariables y
   extractRootBlock de ../js/parser.js (también DOM-free).
   ═══════════════════════════════════════════════════════════ */

import { parseVariables, extractRootBlock } from '../js/parser.js';

/* ── técnicas exigidas por el prompt (solo isométrico) ──── */
const TECHNIQUES = [
  { id: 'css-vars',    label: 'Variables CSS en :root',         re: /--[\w-]+\s*:/ },
  { id: 'calc',        label: 'calc() con variables',           re: /calc\(\s*var\(--/ },
  { id: 'aspect-ratio',label: 'aspect-ratio',                   re: /aspect-ratio\s*:/i },
  { id: 'svg-inline',  label: 'SVG inline con viewBox',         re: /<svg[\s>][^>]*viewBox/i },
  { id: 'polygon-path',label: 'Polígonos/paths de caras',       re: /<(?:polygon|path)\b/i },
  { id: 'iso-matrix',  label: 'Matriz isométrica (caras)',      re: /matrix\(\s*0?\.866/ },
];

/* Señales de proyección isométrica: matriz de cara (0.866) o transform 3D. */
const ISO_SIGNALS = /matrix\(\s*0?\.866|rotateX\(|rotateY\(|matrix3d\(/i;

/* Ángulos permitidos de arista (mod 180°) en la cuadrícula base: ±30° y vertical. */
const GRID_ANGLES = [30, 90, 150];
const GRID_TOLERANCE = 1.5;

/** Cuenta aristas de <polygon> que no caen en la cuadrícula de 30°. */
function offGridEdges(source) {
  const off = [];
  const re = /<polygon\b[^>]*\bpoints\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const nums = m[1].trim().split(/[\s,]+/).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (Math.hypot(dx, dy) < 1) continue;
      const a = ((Math.atan2(dy, dx) * 180) / Math.PI % 180 + 180) % 180;
      const ok = GRID_ANGLES.some((g) => Math.abs(a - g) <= GRID_TOLERANCE);
      if (!ok) off.push(`(${x1},${y1})→(${x2},${y2}) ${a.toFixed(1)}°`);
    }
  }
  return off;
}

/** Orden de capas: los data-z deben aparecer en orden no decreciente en el DOM. */
function zOrderBreaks(source) {
  const zs = [...source.matchAll(/data-z\s*=\s*"(\d+)"/gi)].map((m) => Number(m[1]));
  const breaks = [];
  for (let i = 1; i < zs.length; i++) {
    if (zs[i] < zs[i - 1]) breaks.push(`data-z="${zs[i]}" aparece después de data-z="${zs[i - 1]}"`);
  }
  return { count: zs.length, breaks };
}

/* Gradientes y efectos de pintura: no pertenecen al canon de línea/flat-tone. */
const PAINTERLY = [
  { id: 'gradient', label: 'degradados (linear/radial/conic-gradient)', re: /(?:repeating-)?(?:linear|radial|conic)-gradient\(/ },
  { id: 'mask',     label: 'mask-image',                                re: /-?(?:webkit-)?mask-image\s*:/i },
  { id: 'blend',    label: 'mix-blend-mode',                            re: /mix-blend-mode\s*:/i },
  { id: 'blur',     label: 'filter/blur',                               re: /filter\s*:\s*(?!none)|feGaussianBlur/i },
];

const FORBIDDEN = [
  { id: 'link',    label: '<link>',          re: /<link\b/i },
  { id: 'script',  label: '<script>',        re: /<script\b/i },
  { id: 'img',     label: '<img>',           re: /<img\b/i },
  { id: 'iframe',  label: '<iframe>',        re: /<iframe\b/i },
  { id: 'import',  label: '@import',         re: /@import\b/ },
  { id: 'url-http',label: 'url() externa',   re: /url\(\s*['"]?https?:/i },
];

/* ── utilidades ─────────────────────────────────────────── */

/** Cuenta nodos de marcado aproximados (tags de apertura + cierre únicos). */
function countNodes(html) {
  const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
  return tags.length;
}

/** Extrae todo el CSS de un documento (bloques <style> concatenados). */
function extractCSS(html) {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out.join('\n');
}

/** Balanceo de llaves: ¿el CSS tiene {} equilibrado? */
function bracesBalanced(css) {
  let d = 0;
  for (const ch of css) {
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

/* ── API principal ──────────────────────────────────────── */

/**
 * Valida un documento CSS Art.
 *
 * @param {string} html documento completo o fragmento con <style>
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   stats: { nodes:number, styleBlocks:number, pseudoSelectors:number, sizeKB:number },
 *   techniques: Array<{id:string,label:string,present:boolean}>,
 *   variables: Array<import('../js/parser.js').parseVariables extends Function ? any : never>,
 *   fragment: string
 * }}
 */
export function validateArt(html) {
  const errors = [];
  const warnings = [];
  const source = String(html || '');

  if (!source.trim()) {
    return {
      ok: false, errors: ['Documento vacío.'], warnings: [],
      stats: { nodes: 0, styleBlocks: 0, pseudoSelectors: 0, sizeKB: 0 },
      techniques: [], variables: [], fragment: '',
    };
  }

  /* ── estructura ── */
  const styleBlocks = (source.match(/<style[^>]*>/gi) || []).length;
  const css = extractCSS(source);

  if (!/<style[^>]*>/i.test(source)) {
    errors.push('Falta un bloque <style>. El documento debe ser HTML autocontenido.');
  }
  if (styleBlocks > 1) {
    warnings.push(`Hay ${styleBlocks} bloques <style>. El contrato exige exactamente uno.`);
  }
  if (!bracesBalanced(css)) {
    errors.push('Llaves CSS desbalanceadas: el documento no compila.');
  }
  if (!/<html|<!doctype/i.test(source)) {
    warnings.push('No hay <!doctype html> ni <html>. El render funciona, pero no es un documento completo.');
  }

  /* ── prohibidos ── */
  for (const f of FORBIDDEN) {
    if (f.re.test(source)) {
      errors.push(`Contenido prohibido por el contrato: ${f.label}.`);
    }
  }

  /* ── :root + variables ── */
  const root = extractRootBlock(source);
  if (!root) {
    errors.push('No se encontró un bloque :root (o html { … }) con variables.');
  }

  const variables = root ? parseVariables(source) : [];
  if (root && variables.length === 0) {
    errors.push('El bloque :root existe pero no contiene variables --custom parseables.');
  }
  if (variables.length && variables.length < 5) {
    warnings.push(`Solo ${variables.length} variables declaradas. El prompt exige una escena paramétrica rica.`);
  }

  // sanity: rangos válidos
  for (const v of variables) {
    if (v.type === 'range') {
      if (!Number.isFinite(v.min) || !Number.isFinite(v.max) || v.max <= v.min) {
        warnings.push(`${v.name}: rango inválido (min=${v.min}, max=${v.max}).`);
      }
      if (!Number.isFinite(v.number)) {
        errors.push(`${v.name}: el valor no es numérico pero está marcado como range.`);
      }
    }
    if (v.type === 'select' && (!v.options || v.options.length < 2)) {
      warnings.push(`${v.name}: type:select con menos de 2 opciones.`);
    }
    if (v.type === 'color' && !isColorValue(v.value)) {
      warnings.push(`${v.name}: marcado como color pero el valor no lo es (${v.value}).`);
    }
  }

  /* ── isométrico: el arte debe tener geometría de tres ejes ── */
  if (!ISO_SIGNALS.test(source)) {
    errors.push('No parece isométrico: falta transform de cara (matrix 0.866) o 3D (rotateX / matrix3d).');
  }
  const off = offGridEdges(source);
  if (off.length) {
    errors.push(`${off.length} arista(s) fuera de la cuadrícula de 30°. Ej.: ${off.slice(0, 3).join('; ')}.`);
  }

  /* ── orden de capas ── */
  const z = zOrderBreaks(source);
  if (z.count === 0) {
    warnings.push('Sin orden de capas explícito: falta data-z en los grupos (ver ORDEN DE CAPAS).');
  }
  for (const b of z.breaks) {
    errors.push(`Orden de capas roto: ${b}.`);
  }

  /* ── técnicas ── */
  const techniques = TECHNIQUES.map((t) => ({
    id: t.id, label: t.label, present: t.re.test(source),
  }));
  for (const t of techniques.filter((t) => !t.present)) {
    warnings.push(`Técnica ausente: ${t.label}.`);
  }
  for (const p of PAINTERLY) {
    if (p.re.test(source)) {
      warnings.push(`Efecto fuera del canon isométrico: ${p.label}. Usa tonos planos y línea.`);
    }
  }

  /* ── profundidad / nodos ── */
  const nodes = countNodes(source);
  if (nodes < 40) {
    warnings.push(`Solo ${nodes} nodos de marcado. El prompt exige al menos 60 para lograr profundidad.`);
  }

  /* ── tamaño ── */
  const sizeKB = Math.round(source.length / 102.4) / 10;

  const ok = errors.length === 0;

  return {
    ok,
    errors,
    warnings,
    stats: { nodes, styleBlocks, sizeKB },
    techniques,
    variables,
    fragment: buildFragment(source),
  };
}

function isColorValue(v) {
  const s = String(v || '').trim();
  return /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(s);
}

/**
 * Codifica el HTML en un fragmento de URL para abrir la UI sin storage.
 * Formato: #d=<base64url>  (lo consume js/art-loader.js en modo inline)
 */
export function buildFragment(html) {
  const b64 = Buffer.from(String(html), 'utf8').toString('base64url');
  return `#d=${b64}`;
}

/** Decodifica un fragmento #d=<base64url> de vuelta a HTML (Node). */
export function decodeFragment(fragment) {
  const m = /#d=([A-Za-z0-9_-]+)/.exec(String(fragment || ''));
  if (!m) return null;
  return Buffer.from(m[1], 'base64url').toString('utf8');
}

export default validateArt;
