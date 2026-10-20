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
  { id: 'fillet',      label: 'Filetes/curvas (rx, círculos, arcos)', re: /<circle\b|<ellipse\b|\brx\s*=|\bry\s*=|\bd\s*=\s*"[^"]*[AaCcQq]/i },
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

/* ── arquitectura de estilos: tokens, cascada, contraste ── */

/** Propiedades que sólo deben recibir tokens (nunca un número literal). */
const MEASURE_PROPS =
  'stroke-width|stroke-dasharray|opacity|fill-opacity|stroke-opacity|font-size|letter-spacing|border-radius|rx|ry';

/** Limpia comentarios, url() y cadenas para escanear literales sin falsos positivos. */
function stripCss(css) {
  return String(css)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/url\([^)]*\)/gi, 'url()')
    .replace(/"[^"]*"|'[^']*'/g, "''");
}

/** Rango [start,end) del bloque de tokens (:root o html) dentro del CSS saneado. */
function tokenRange(css) {
  for (const cand of [':root', 'html']) {
    const re = new RegExp(`(?:^|[\\s}])${cand}\\s*\\{`, 'm');
    const m = re.exec(css);
    if (!m) continue;
    const start = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = start; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) return { selector: cand, start, end: i };
      }
    }
  }
  return null;
}

/** Color literal (hex/rgb/rgba/hsl/hsla) → [r,g,b] o null. */
function literalRgb(v) {
  const s = String(v || '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function isLiteralColor(v) {
  return literalRgb(v) !== null;
}

/** Contraste WCAG relativo (ratio 1..21). */
function contrastRatio(rgb1, rgb2) {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(rgb1), b = lum(rgb2);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

const FG_NAME = /(^|-)(ink|text|fg|line|stroke|caption|title)(-|$)/i;
const BG_NAME = /(^|-)(paper|bg|background|surface|canvas|ground|base)(-|$)/i;

/** Cuenta elementos curvos (círculos, elipses, arcos/bezier en paths) vs polígonos. */
function countCurves(source, css) {
  const polygons = (source.match(/<polygon\b/gi) || []).length;
  const elements = (source.match(/<(?:circle|ellipse)\b/gi) || []).length;
  let pathCurves = 0;
  for (const m of source.matchAll(/\bd\s*=\s*"([^"]+)"/gi)) {
    pathCurves += (m[1].match(/[AaCcQqSsTt]\s*-?[\d.]/g) || []).length;
  }
  const rxAttr = (source.match(/\brx\s*=/gi) || []).length;
  return { polygons, curves: elements + pathCurves + rxAttr };
}

/**
 * Revisa la arquitectura de estilos exigida por el prompt:
 * literales sólo en :root, selectores por clase, cascada ordenada,
 * tokens con consumo y contraste ink/paper.
 * @returns {{warnings:string[], architecture:object}}
 */
function architectureReport(css, source, variables) {
  const warnings = [];
  const nc = stripCss(css);
  const range = tokenRange(nc);
  const scan = range ? nc.slice(0, range.start) + nc.slice(range.end + 1) : nc;

  /* 1. colores literales fuera de la capa de tokens (el lookahead descarta #face { } selector) */
  const colorLits = [...new Set(scan.match(/#[0-9a-f]{3,8}\b(?!\s*[{,])|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) || [])];
  if (colorLits.length) {
    warnings.push(
      `Capa de tokens rota: ${colorLits.length} color(es) literal(es) fuera de ` +
      `${range ? range.selector : ':root'} (${colorLits.slice(0, 4).join(', ')}${colorLits.length > 4 ? '…' : ''}). ` +
      `El literal va en :root; fuera sólo var(--x).`
    );
  }

  /* 2. medidas/opacidad literales fuera de :root */
  const measureLits = [];
  const mre = new RegExp(`(?:^|[;{}])\\s*(${MEASURE_PROPS})\\s*:\\s*([^;{}]+)`, 'gi');
  let m;
  while ((m = mre.exec(scan)) !== null) {
    const val = m[2].trim();
    if (/^(?:calc|var|inherit|initial|unset|none)\b/i.test(val)) continue;
    if (/^-?\d*\.?\d/.test(val)) measureLits.push(`${m[1]}: ${val}`);
  }
  if (measureLits.length) {
    warnings.push(
      `Valores no paramétricos fuera de :root (${measureLits.slice(0, 3).join('; ')}). ` +
      `Usa calc(var(--x) * 1unit) o var(--x).`
    );
  }

  /* 3. #id como selector de estilos (los id del marcado son estructurales) */
  const idSel = [...new Set([...scan.matchAll(/(?:^|[;}])\s*(#[A-Za-z][\w-]*)\s*[,{]/g)].map((x) => x[1]))];
  if (idSel.length) {
    warnings.push(`Estilos por #id (${idSel.join(', ')}): estiliza por clase; los id del marcado no son selectores.`);
  }

  /* 4. literales de color en atributos del marcado */
  const markupLits = [...new Set([
    ...[...source.matchAll(/\b(?:fill|stroke)\s*=\s*"(#[0-9a-f]{3,8})"/gi)].map((x) => `${x[0]}`),
    ...[...source.matchAll(/\bstyle="[^"]*(?:#[0-9a-f]{3,8}|rgba?\()[^"]*"/gi)].map((x) => x[0].slice(0, 60)),
  ])];
  if (markupLits.length) {
    warnings.push(
      `Literales de color en el marcado (${markupLits.slice(0, 3).join('; ')}). ` +
      `La apariencia vive en clases CSS alimentadas por tokens.`
    );
  }

  /* 5. :root (settings) antes que cualquier otra regla */
  let rootFirst = true;
  if (range) {
    const firstBrace = nc.indexOf('{');
    const prelude = firstBrace >= 0 ? nc.slice(0, firstBrace).trim() : '';
    if (!(prelude.startsWith('@') || prelude.includes(range.selector))) {
      rootFirst = false;
      warnings.push(
        'Cascada desordenada: los tokens no son la primera regla. ' +
        'Orden esperado: :root (settings) → base → escena → trazos → piezas → utilidades.'
      );
    }
  }

  /* 6. tokens declarados sin uso (DRY: un valor, una declaración) */
  const used = new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((x) => x[1]));
  const unused = variables.filter((v) => !used.has(v.name)).map((v) => v.name);
  if (unused.length) {
    warnings.push(
      `Tokens declarados sin uso (${unused.length}): ${unused.slice(0, 6).join(', ')}` +
      `${unused.length > 6 ? '…' : ''}. Consumelos con var(--x) o elimínalos.`
    );
  }

  /* 7. contraste de texto/tinta (WCAG 1.4.3 → 4.5:1) */
  const contrast = [];
  const fgVars = variables.filter((v) => isLiteralColor(v.value) && FG_NAME.test(v.name));
  const bgVars = variables.filter((v) => isLiteralColor(v.value) && BG_NAME.test(v.name));
  for (const f of fgVars) {
    for (const b of bgVars) {
      const ratio = Math.round(contrastRatio(literalRgb(f.value), literalRgb(b.value)) * 100) / 100;
      contrast.push({ fg: f.name, bg: b.name, ratio, ok: ratio >= 4.5 });
      if (ratio < 4.5) {
        warnings.push(
          `Contraste insuficiente: ${f.name} (${f.value}) sobre ${b.name} (${b.value}) = ${ratio}:1 ` +
          `< 4.5:1 (WCAG 1.4.3; el contorno exige ≥3:1 en 1.4.11).`
        );
      }
    }
  }

  return {
    warnings,
    architecture: {
      tech: 'css-nativo (un solo <style>)',
      tokensDeclared: variables.length,
      tokensUsed: variables.length - unused.length,
      unusedTokens: unused,
      literalsOutsideRoot: colorLits.length + measureLits.length + markupLits.length,
      idSelectors: idSel.length,
      rootFirst,
      contrast,
    },
  };
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
 *   stats: { nodes:number, styleBlocks:number, sizeKB:number, shapes:{polygons:number,curves:number} },
 *   techniques: Array<{id:string,label:string,present:boolean}>,
 *   variables: Array<import('../js/parser.js').parseVariables extends Function ? any : never>,
 *   architecture: { tech:string, tokensDeclared:number, tokensUsed:number, unusedTokens:string[],
 *                   literalsOutsideRoot:number, idSelectors:number, rootFirst:boolean,
 *                   contrast:Array<{fg:string,bg:string,ratio:number,ok:boolean}> } | null,
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
      stats: { nodes: 0, styleBlocks: 0, sizeKB: 0, shapes: { polygons: 0, curves: 0 } },
      techniques: [], variables: [], architecture: null, fragment: '',
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
  if (/!important/i.test(stripCss(css))) {
    errors.push('Regla con !important: prohibida por el contrato. Ordena la cascada en su lugar.');
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

  /* ── arquitectura de estilos (tokens, cascada, contraste) ── */
  const arch = architectureReport(css, source, variables);
  warnings.push(...arch.warnings);

  /* ── curvas vs cajas: avisar si la escena es solo polígonos (anti-boxie) ── */
  const shape = countCurves(source, css);
  if (shape.polygons >= 6 && shape.curves === 0) {
    warnings.push(
      `Escena "boxie": ${shape.polygons} polígonos y 0 curvas. Aplica el método caja → círculo → recorte ` +
      `(ver Volúmenes curvos): cilindros, aros, casquetes, semicírculos o troncos de cono.`
    );
  }

  const ok = errors.length === 0;

  return {
    ok,
    errors,
    warnings,
    stats: { nodes, styleBlocks, sizeKB, shapes: shape },
    techniques,
    variables,
    architecture: arch.architecture,
    fragment: buildFragment(source),
  };
}

function isColorValue(v) {
  const s = String(v || '').trim();
  // alias semántico: --top: var(--ink) hereda el color de su token base
  if (/^var\(\s*--[\w-]+(\s*,[^)]*)?\)$/i.test(s)) return true;
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
