/* ═══════════════════════════════════════════════════════════
   renderer.js
   Inyecta el HTML/CSS en el <iframe> vía srcdoc y aplica los
   cambios de variables en tiempo real sobre el documentElement
   del iframe, sin recargar la página.

   Rendimiento:
   · Las escrituras se acumulan en un Map y se vacían dentro de
     un único requestAnimationFrame (1 batch por frame, no uno
     por evento).
   · setProperty sobre :root no provoca re-layout de selectores,
     sólo repintado de las reglas que consumen la variable.
   · El listener es delegado sobre el panel, así que da igual
     cuántos controles/nodos existan.
   ═══════════════════════════════════════════════════════════ */

let frame = null;
let doc = null;
let lastCode = '';

/** nombre → valor ya formateado, pendiente de escribirse */
let pending = new Map();
/** nombre → valor ya escrito en el documento (para diffs) */
const applied = new Map();

let rafId = 0;
let ready = false;

const listeners = new Set();

/* ── ciclo de vida ───────────────────────────────────────── */

export function init(iframe) {
  frame = iframe;
  doc = null;
  ready = false;

  frame.addEventListener('load', () => {
    doc = frame.contentDocument;
    ready = !!(doc && doc.documentElement);
    if (ready) {
      // reaplica todo lo que se haya pedido antes de terminar de cargar
      for (const [name, value] of pending) write(name, value);
      flushNow();
    }
    emit({ type: 'load', nodes: countNodes() });
  });
}

/** Monta un documento completo dentro del sandbox (srcdoc). */
export function render(html) {
  if (!frame) throw new Error('renderer: iframe no inicializado');
  lastCode = html || '';
  ready = false;
  doc = null;
  pending.clear();
  applied.clear();
  frame.srcdoc = lastCode;
}

/** Re-inyecta el último documento (botón "Recargar"). */
export function reload() {
  if (lastCode) render(lastCode);
}

export function getCode() {
  return lastCode;
}

export function isReady() {
  return ready;
}

/* ── escritura de variables ──────────────────────────────── */

/**
 * Programa la escritura de una variable CSS dentro del iframe.
 * Segura de llamar en cada evento `input`: hace diff y batch.
 */
export function setVariable(name, value) {
  if (applied.get(name) === value && !pending.has(name)) return false;
  pending.set(name, value);
  schedule();
  return true;
}

/** Escritura múltiple (reset, aplicar preset, etc.). */
export function setVariables(map) {
  let dirty = false;
  for (const [name, value] of Object.entries(map)) {
    if (applied.get(name) === value) continue;
    pending.set(name, value);
    dirty = true;
  }
  if (dirty) schedule();
  return dirty;
}

/** Quita las override y restaura el valor del CSS original. */
export function clearVariables(names) {
  let dirty = false;
  for (const name of names) {
    // puede que la override esté todavía en el buffer (pendiente de rAF)
    if (!applied.has(name) && !pending.has(name)) continue;
    pending.set(name, null);   // null ⇒ removeProperty
    applied.delete(name);
    dirty = true;
  }
  if (dirty) schedule();
  return dirty;
}

function schedule() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    flushNow();
  });
}

function flushNow() {
  if (!pending.size) return;
  if (!ready || !doc || !doc.documentElement) {
    // aún cargando: se conserva el Map y se reescribe en `load`
    return;
  }
  const root = doc.documentElement;
  const batch = pending;
  pending = new Map();

  for (const [name, value] of batch) {
    write(name, value, root);
  }
}

function write(name, value, rootRef) {
  const root = rootRef || (ready && doc && doc.documentElement);
  if (!root) {
    pending.set(name, value);
    return;
  }
  try {
    if (value === null || value === undefined) {
      root.style.removeProperty(name);
      applied.delete(name);
    } else {
      root.style.setProperty(name, String(value));
      applied.set(name, String(value));
    }
  } catch (err) {
    console.warn('[renderer] no se pudo escribir', name, err);
  }
}

/** Snapshot de lo que está aplicado ahora mismo. */
export function getApplied() {
  return Object.fromEntries(applied);
}

/** Valor actual real en el documento (estilo inline + :root del CSS). */
export function readVariable(name) {
  if (!ready || !doc) return undefined;
  const inline = doc.documentElement.style.getPropertyValue(name).trim();
  if (inline) return inline;
  try {
    return getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
  } catch {
    return undefined;
  }
}

/* ── métricas / utilidades del sandbox ───────────────────── */

export function countNodes() {
  if (!ready || !doc) return 0;
  try {
    return doc.body ? doc.body.querySelectorAll('*').length : 0;
  } catch {
    return 0;
  }
}

export function getDoc() {
  return ready ? doc : null;
}

/** Exporta el documento con las variables actuales ya resueltas. */
export function exportHTML() {
  if (!lastCode) return '';
  if (!ready || !doc) return lastCode;

  try {
    const clone = doc.documentElement.cloneNode(true);
    // limpia el atributo style inline → lo volvemos a meter en :root
    const inline = clone.getAttribute('style') || '';
    clone.removeAttribute('style');

    const out = '<!DOCTYPE html>\n' + clone.outerHTML;
    if (!inline.trim()) return out;
    return injectRootOverrides(out, inline);
  } catch (err) {
    console.warn('[renderer] exportHTML fallback', err);
    return lastCode;
  }
}

/**
 * Inserta las variables override al FINAL del bloque `:root`, no al principio:
 * si van antes, la declaración original posterior las pisa por cascada CSS.
 */
function injectRootOverrides(source, inline) {
  const start = source.search(/:root\s*\{/);
  if (start < 0) return source;

  // balanceo de llaves para localizar el cierre de :root
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return source;

  const block = inline.replace(/;\s*$/, ';').replace(/;\s*/g, '\n  ');
  return source.slice(0, end)
    + `  /* variables editadas en CSSketch */\n  ${block}\n`
    + source.slice(end);
}

/* ── eventos ─────────────────────────────────────────────── */

export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(evt) {
  for (const fn of listeners) {
    try { fn(evt); } catch (err) { console.error(err); }
  }
}

/* ── bridge de input: delegación de eventos ──────────────── */

/**
 * Vincula un contenedor de controles al renderer.
 * Usa delegación: un solo listener para N controles.
 *
 * Convención de dataset en los inputs generados por ui.js:
 *   data-var="--sun-x"        nombre de la variable
 *   data-format="range|color|select|text"
 *   data-unit="%"
 */
export function bindControls(container, { onBefore, onAfter } = {}) {
  const handler = (event) => {
    const el = event.target;
    if (!el || !el.dataset || !el.dataset.var) return;

    const name = el.dataset.var;
    const unit = el.dataset.unit || '';
    let value = el.value;

    if (el.dataset.format === 'range') {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      value = unit ? `${n}${unit}` : String(n);
    } else if (el.dataset.quote) {
      // el input muestra el texto pelado; content: necesita un <string> de CSS
      value = JSON.stringify(String(value));
    }

    if (onBefore && onBefore(name, value, el) === false) return;
    setVariable(name, value);
    if (onAfter) onAfter(name, value, el);
  };

  // `input` cubre slider, color, text y select en tiempo real
  container.addEventListener('input', handler, { passive: true });
  container.addEventListener('change', handler, { passive: true });

  return () => {
    container.removeEventListener('input', handler);
    container.removeEventListener('change', handler);
  };
}
