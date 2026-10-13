/* ═══════════════════════════════════════════════════════════
   validate.js — Validador de CSS Art generado por LLM
   Comprueba el contrato del Prompt Técnico Maestro y devuelve
   un informe + el manifest de variables que la UI consume.

   Node-safe: no toca el DOM. Importa parseVariables y
   extractRootBlock de ../js/parser.js (también DOM-free).
   ═══════════════════════════════════════════════════════════ */

import { parseVariables, extractRootBlock } from '../js/parser.js';

/* ── técnicas exigidas por el prompt ────────────────────── */
const TECHNIQUES = [
  { id: 'css-vars',        label: 'Variables CSS en :root',      re: /--[\w-]+\s*:/ },
  { id: 'calc',            label: 'calc() con variables',        re: /calc\(\s*var\(--/ },
  { id: 'absolute',        label: 'Capas position:absolute',     re: /position\s*:\s*absolute/i },
  { id: 'pseudo-before',   label: 'Pseudo-elemento ::before',    re: /::before|:before/ },
  { id: 'pseudo-after',    label: 'Pseudo-elemento ::after',     re: /::after|:after/ },
  { id: 'box-shadow',      label: 'Múltiples box-shadows',       re: /box-shadow\s*:[^;]{0,400},[^;]/ },
  { id: 'linear-gradient', label: 'linear-gradient',             re: /linear-gradient\(/ },
  { id: 'radial-gradient', label: 'radial-gradient',             re: /radial-gradient\(/ },
  { id: 'conic-gradient',  label: 'conic-gradient',              re: /(?:repeating-)?conic-gradient\(/ },
  { id: 'clip-path',       label: 'clip-path con polygon',       re: /clip-path\s*:\s*polygon\(/i },
  { id: 'mask-image',      label: 'mask-image',                  re: /-?(?:webkit-)?mask-image\s*:/i },
  { id: 'blend-mode',      label: 'mix-blend-mode',              re: /mix-blend-mode\s*:/i },
  { id: 'filter',          label: 'filter',                      re: /filter\s*:\s*(?!none)/i },
  { id: 'aspect-ratio',    label: 'aspect-ratio',                re: /aspect-ratio\s*:/i },
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

/** ¿Hay al menos N selectores distintos con pseudo-elementos? */
function countPseudoSelectors(css) {
  const uniq = new Set();
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const sel = m[1].trim();
    if (/::?(?:before|after)/i.test(sel)) {
      for (const part of sel.split(',')) {
        const s = part.trim();
        if (s) uniq.add(s);
      }
    }
  }
  return uniq.size;
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

  /* ── técnicas ── */
  const techniques = TECHNIQUES.map((t) => ({
    id: t.id, label: t.label, present: t.re.test(source),
  }));
  const missing = techniques.filter((t) => !t.present);
  for (const t of missing) {
    warnings.push(`Técnica ausente: ${t.label}.`);
  }

  /* ── profundidad / nodos ── */
  const nodes = countNodes(source);
  if (nodes < 40) {
    warnings.push(`Solo ${nodes} nodos de marcado. El prompt exige al menos 60 para lograr profundidad.`);
  }

  const pseudoSelectors = countPseudoSelectors(css);
  if (pseudoSelectors < 5) {
    warnings.push(`Solo ${pseudoSelectors} selectores con pseudo-elementos. El prompt exige al menos 8.`);
  }

  /* ── tamaño ── */
  const sizeKB = Math.round(source.length / 102.4) / 10;

  const ok = errors.length === 0;

  return {
    ok,
    errors,
    warnings,
    stats: { nodes, styleBlocks, pseudoSelectors, sizeKB },
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
