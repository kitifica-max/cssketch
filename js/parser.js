/* ═══════════════════════════════════════════════════════════
   parser.js
   Escanea el bloque :root de un documento HTML/CSS y extrae
   todas las variables --custom con su metadata semántica.

   Sintaxis soportada en el comentario de cada variable:

     /*type:color*​/
     /*type:range|min:0|max:100|step:1|unit:%*​/
     /*type:select|options:normal|screen|overlay*​/
     /*type:text*​/

   Si no hay comentario de tipo, la variable se clasifica
   automáticamente por el patrón de su valor.
   ═══════════════════════════════════════════════════════════ */

const DECL_RE = /\/\*([\s\S]*?)\*\/|--([\w-]+)\s*:\s*([^;{}]+);/g;

const COLOR_RE = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;
const NUM_UNIT_RE = /^(-?\d*\.?\d+)(px|rem|em|ex|ch|vh|vw|vmin|vmax|%|deg|rad|turn|s|ms)?$/i;
const UNIT_RE = /(px|rem|em|ex|ch|vh|vw|vmin|vmax|%|deg|rad|turn|s|ms)$/i;

/* ── utilidades ──────────────────────────────────────────── */

export function isColor(value) {
  return COLOR_RE.test(String(value).trim());
}

export function isMeasure(value) {
  return NUM_UNIT_RE.test(String(value).trim());
}

/** Detecta si un valor es una coordenada/posición (px o % con signo). */
export function isCoordinate(value, name = '') {
  const v = String(value).trim();
  if (!NUM_UNIT_RE.test(v)) return false;
  if (/-\d/.test(v)) return true;                       // valor con signo negativo
  return /(x|y|pos|top|left|right|bottom|offset|origin)/i.test(name);
}

/**
 * Clasifica un valor crudo en una familia semántica.
 * @returns {'color'|'coordinate'|'measure'|'number'|'text'}
 */
export function classifyValue(value, name = '') {
  const v = String(value).trim();
  if (isColor(v)) return 'color';
  if (!NUM_UNIT_RE.test(v)) return 'text';
  if (isCoordinate(v, name)) return 'coordinate';
  if (!UNIT_RE.test(v)) return 'number';
  return 'measure';
}

/** Extrae { number, unit } de un valor o devuelve null. */
function splitNumberUnit(value, fallbackUnit = '') {
  const raw = String(value).trim();
  const m = raw.match(NUM_UNIT_RE);
  if (!m) return null;
  return { number: parseFloat(m[1]), unit: (m[2] || fallbackUnit || '').toLowerCase() };
}

/** Extrae el bloque :root { … } con balanceo de llaves. */
export function extractRootBlock(source) {
  const html = String(source);

  let idx = -1;
  let selector = '';
  for (const cand of [':root', 'html']) {
    const re = new RegExp(`(?:^|[\\s}])${cand}\\s*\\{`, 'm');
    const m = re.exec(html);
    if (m) { idx = m.index + m[0].length - 1; selector = cand; break; }
  }
  if (idx < 0) return null;

  let depth = 0;
  for (let i = idx; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { selector, body: html.slice(idx + 1, i) };
    }
  }
  return null;
}

/* ── parsing de la anotación /*type:…*​/ ──────────────────── */

function parseHint(text) {
  const hint = { raw: text };
  const parts = String(text).split('|').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return hint;

  const head = parts[0];
  if (head.toLowerCase().startsWith('type:')) {
    hint.type = head.slice(5).trim().toLowerCase();
    parts.shift();
  } else {
    hint.type = null;
  }

  if (hint.type === 'select') {
    // options ocupa el resto de la anotación
    const joined = parts.join('|');
    const oi = joined.toLowerCase().indexOf('options:');
    if (oi >= 0) {
      const rest = joined.slice(oi + 'options:'.length);
      hint.options = rest.split('|').map((s) => s.trim()).filter(Boolean);
    }
    return hint;
  }

  for (const p of parts) {
    const ci = p.indexOf(':');
    if (ci < 0) continue;
    const key = p.slice(0, ci).trim().toLowerCase();
    const val = p.slice(ci + 1).trim();
    switch (key) {
      case 'min':     hint.min = parseFloat(val); break;
      case 'max':     hint.max = parseFloat(val); break;
      case 'step':    hint.step = parseFloat(val); break;
      case 'unit':    hint.unit = val.toLowerCase(); break;
      case 'options': hint.options = val.split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'label':   hint.label = val; break;
      default: break;
    }
  }
  return hint;
}

function cleanSection(text) {
  return String(text)
    .replace(/[─━═▚▞▪◆●·|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── API principal ───────────────────────────────────────── */

/**
 * Extrae todas las variables de :root de un string HTML/CSS.
 *
 * @param {string} source documento completo o fragmento con <style>
 * @returns {Array<{
 *   name:string, value:string, type:'color'|'range'|'select'|'text',
 *   family:'color'|'coordinate'|'measure'|'number'|'text',
 *   group:string, label:string,
 *   min?:number, max?:number, step?:number,
 *   unit?:string,          // unidad YA presente en el valor → se reescribe tal cual
 *   displayUnit?:string,   // sufijo visible en la UI (unit: del comentario)
 *   options?:string[], number?:number
 * }>}
 */
export function parseVariables(source) {
  const block = extractRootBlock(source);
  if (!block) return [];

  const vars = [];
  let section = 'general';
  let pendingHint = null;

  DECL_RE.lastIndex = 0;
  let m;
  while ((m = DECL_RE.exec(block.body)) !== null) {
    if (m[1] !== undefined) {
      // ── comentario ──
      const text = m[1].trim();
      if (/^type:/i.test(text)) {
        pendingHint = parseHint(text);
      } else {
        const clean = cleanSection(text);
        if (clean) section = clean.toLowerCase();
        pendingHint = null;
      }
      continue;
    }

    // ── declaración ──
    const name = `--${m[2]}`;
    const rawValue = m[3].trim();
    const hint = pendingHint || {};
    pendingHint = null;

    const family = classifyValue(rawValue, name);
    const nameGroup = name.slice(2).split('-')[0];
    const group = (section && section !== 'general') ? section : nameGroup;
    const base = {
      name,
      value: rawValue,
      family,
      group,
      label: hint.label || prettify(name),
    };

    let type = hint.type;
    if (!type) {
      type = family === 'color' ? 'color'
        : (family === 'number' || family === 'measure' || family === 'coordinate') ? 'range'
        : 'text';
    }

    if (type === 'color') {
      if (family !== 'color') {
        // el hint miente: degradamos a texto para no romper el <input type=color>
        vars.push({
          ...base,
          type: 'text',
          quoted: /^(?:"[^"]*"|'[^']*')$/.test(rawValue),
        });
      } else {
        vars.push({ ...base, type: 'color' });
      }
      continue;
    }

    if (type === 'select') {
      const options = hint.options && hint.options.length
        ? hint.options
        : [rawValue];
      vars.push({ ...base, type: 'select', options, value: rawValue });
      continue;
    }

    if (type === 'range') {
      const nu = splitNumberUnit(rawValue);
      if (!nu) {
        vars.push({
          ...base,
          type: 'text',
          quoted: /^(?:"[^"]*"|'[^']*')$/.test(rawValue),
        });
        continue;
      }
      const number = nu.number;

      // La unidad que se REESCRIBE sólo puede venir del valor original.
      // El `unit:` del comentario es una pista de presentación: si el valor
      // es numérico puro (`62`) el CSS lo consume como escalar dentro de
      // calc(var(--x) * 1%) y añadirle sufijo lo rompería.
      const unit = nu.unit;
      const displayUnit = unit || (hint.unit || '').toLowerCase();

      const isFractional = displayUnit === '' && Math.abs(number) <= 1;
      const step = Number.isFinite(hint.step) ? hint.step
        : (isFractional ? 0.01 : (Number.isInteger(number) ? 1 : 0.1));

      let min = Number.isFinite(hint.min) ? hint.min : defaultMin(number, displayUnit);
      let max = Number.isFinite(hint.max) ? hint.max : defaultMax(number, displayUnit, min);

      // sanidad: el valor actual siempre cabe dentro del rango
      if (number < min) min = Math.min(number, min);
      if (number > max) max = Math.max(number, max);

      vars.push({
        ...base,
        type: 'range',
        number,
        unit,
        displayUnit,
        min,
        max,
        step,
        value: rawValue,
      });
      continue;
    }

    // Un <string> de CSS sólo es válido entre comillas: lo marcamos para
    // que la UI muestre el texto "pelado" y lo vuelva a comillas al escribir.
    const quoted = /^(?:"[^"]*"|'[^']*')$/.test(rawValue);
    vars.push({ ...base, type: 'text', value: rawValue, quoted });
  }

  return vars;
}

/* ── defaults cuando el comentario no trae min/max ──────── */

function defaultMin(number, unit) {
  if (number < 0) return Math.floor(number * 1.5);
  return 0;
}

function defaultMax(number, unit, min) {
  if (unit === '%') return 100;
  if (unit === 'deg') return 360;
  if (unit === 'turn') return 1;
  const scale = number <= 1 && unit === '' ? 1 : Math.max(10, Math.ceil(number * 2));
  return Math.max(scale, min + 1);
}

/** "--sun-glow" → "Sun glow" */
export function prettify(name) {
  const s = name.replace(/^--/, '').replace(/[-_]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Formato **visible** de un valor numérico (lo que muestra el readout de la UI).
 * El valor que se escribe en el CSS lo arma el renderer con `v.unit`, que sólo
 * contiene la unidad si venía en el valor original.
 * @param {object} v descriptor de variable
 * @param {string|number} raw valor crudo del input
 */
export function formatValue(v, raw) {
  if (v.type !== 'range') return String(raw);
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const unit = v.displayUnit ?? v.unit ?? '';
  const text = formatNumber(n, v.step);
  return unit ? `${text}${unit}` : text;
}

function formatNumber(n, step) {
  if (Number.isInteger(n)) return String(n);
  const decimals = step && step < 1 ? String(step).split('.')[1].length : 2;
  return n.toFixed(Math.min(decimals, 4)).replace(/\.?0+$/, '') || '0';
}
