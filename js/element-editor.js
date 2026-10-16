/* ═══════════════════════════════════════════════════════════
   element-editor.js
   Editor de elementos tipo vectorial DENTRO del iframe:
   clic para seleccionar, arrastrar para mover (--x/--y),
   panel de propiedades inline, borrar, duplicar y capas.

   No toca el documento del arte de forma permanente: todo lo
   inyectado lleva la marca .ck-ui / #ck-editor-style y se
   elimina del clon antes de exportar (stripFromClone).
   ═══════════════════════════════════════════════════════════ */

const STYLE_ID = 'ck-editor-style';

const INJECTED_CSS = `
body[data-ck-edit] .stage > *, body[data-ck-edit] .scene > * { cursor: grab; touch-action: none; }
body[data-ck-edit] .stage > *:hover { outline: 2px dashed rgba(255,255,255,.55); outline-offset: 3px; }
body[data-ck-edit] { user-select: none; -webkit-user-select: none; }
.ck-ui { position: absolute; z-index: 99; pointer-events: none; }
#ck-sel {
  border: 2px solid #5eead4;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(10,12,16,.55), 0 10px 28px -10px rgba(0,0,0,.6);
}
#ck-label {
  font: 600 10px ui-monospace, "SF Mono", Menlo, monospace;
  color: #052e26;
  background: #5eead4;
  padding: 2px 6px;
  border-radius: 4px;
  transform: translateY(calc(-100% - 4px));
  white-space: nowrap;
}
`;

/* ── helpers ─────────────────────────────────────────────── */

function num(v) {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

function describeProps(el) {
  const style = el.getAttribute('style') || '';
  const props = [];
  const re = /(--[\w-]+)\s*:\s*([^;]+)/g;
  let m;
  while ((m = re.exec(style)) !== null) {
    const name = m[1];
    const raw = m[2].trim();
    props.push({ name, raw, ...classify(name, raw) });
  }
  return props;
}

function classify(name, raw) {
  if (/^#[0-9a-f]{3,8}$/i.test(raw) || /^(rgba?|hsla?)\(/i.test(raw)) {
    return { type: 'color', value: raw };
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = parseFloat(raw);
    let min = -100, max = 200, step = 1;
    if (/-x$/.test(name)) { min = -20; max = 140; }
    else if (/-y$/.test(name)) { min = -20; max = 160; }
    else if (/size$|-w$|-h$/.test(name)) { min = 1; max = 100; }
    else if (/tilt|kr|rot/.test(name)) { min = -45; max = 45; }
    return { type: 'range', value: n, min, max, step };
  }
  return { type: 'text', value: raw };
}

function labelOf(el) {
  const cls = [...el.classList].find((c) => c && c !== 'ck-ui');
  const tag = el.tagName.toLowerCase();
  return cls ? `${tag}.${cls}` : tag;
}

/* ── API pública ─────────────────────────────────────────── */

/**
 * Adjunta el editor al documento del iframe.
 * @param {Document} doc
 * @param {{ onSelect?:Function, onDirty?:Function }} cb
 */
export function attach(doc, cb = {}) {
  if (!doc || !doc.documentElement) return null;

  detach(doc);                       // idempotente

  const win = doc.defaultView;
  const scene = doc.querySelector('.scene') || doc.body;
  const stage = doc.querySelector('.stage') || scene;

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = INJECTED_CSS;
  doc.head.appendChild(style);
  doc.body.setAttribute('data-ck-edit', '');

  const selBox = doc.createElement('div');
  selBox.className = 'ck-ui';
  selBox.id = 'ck-sel';
  selBox.hidden = true;
  scene.appendChild(selBox);

  const label = doc.createElement('div');
  label.className = 'ck-ui';
  label.id = 'ck-label';
  label.hidden = true;
  scene.appendChild(label);

  let selected = null;

  const candidates = () =>
    [...stage.children].filter(
      (el) => el.nodeType === 1 && !el.classList.contains('ck-ui') && el.id !== 'ck-sel'
    );

  const rootOf = (target) => {
    let el = target;
    while (el && el.parentElement !== stage) el = el.parentElement;
    return el && el.parentElement === stage ? el : null;
  };

  function updateOverlay() {
    if (!selected || !selected.isConnected) {
      selBox.hidden = true;
      label.hidden = true;
      selected = null;
      return;
    }
    const s = scene.getBoundingClientRect();
    const r = selected.getBoundingClientRect();
    selBox.hidden = false;
    label.hidden = false;
    selBox.style.left = `${r.left - s.left - 3}px`;
    selBox.style.top = `${r.top - s.top - 3}px`;
    selBox.style.width = `${r.width + 6}px`;
    selBox.style.height = `${r.height + 6}px`;
    label.style.left = `${r.left - s.left - 3}px`;
    label.style.top = `${r.top - s.top - 3}px`;
    label.textContent = `${labelOf(selected)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  function select(el) {
    selected = el || null;
    updateOverlay();
    cb.onSelect?.(selected, selected ? describeProps(selected) : []);
  }

  /* clic + drag */
  function onPointerDown(e) {
    if (e.button !== 0) return;
    const el = rootOf(e.target);
    if (!el) { select(null); return; }
    e.preventDefault();

    if (selected !== el) select(el);

    const rect = scene.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = num(win.getComputedStyle(el).getPropertyValue('--x'));
    const oy = num(win.getComputedStyle(el).getPropertyValue('--y'));

    const onMove = (ev) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.width) * 100; // cqw: eje Y también en cqw
      el.style.setProperty('--x', (ox + dx).toFixed(2));
      el.style.setProperty('--y', (oy + dy).toFixed(2));
      updateOverlay();
      cb.onDirty?.(el);
    };
    const onUp = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
  }

  /* teclado: flechas nudgear, Supr borrar, Esc deselect */
  function onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

    if (e.key === 'Escape') { select(null); return; }
    if (!selected) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const el = selected;
      select(null);
      el.remove();
      cb.onDirty?.(null, 'delete');
      return;
    }

    const step = e.shiftKey ? 5 : 1;
    const map = { ArrowLeft: ['--x', -step], ArrowRight: ['--x', step], ArrowUp: ['--y', -step], ArrowDown: ['--y', step] };
    if (map[e.key]) {
      e.preventDefault();
      const [prop, d] = map[e.key];
      const cur = num(win.getComputedStyle(selected).getPropertyValue(prop));
      selected.style.setProperty(prop, (cur + d).toFixed(2));
      updateOverlay();
      cb.onDirty?.(selected);
    }
  }

  scene.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('keydown', onKeyDown);
  win.addEventListener('resize', updateOverlay);

  const ctl = {
    doc,
    get selected() { return selected; },

    setProp(name, value) {
      if (!selected) return;
      selected.style.setProperty(name, String(value));
      updateOverlay();
      cb.onDirty?.(selected);
    },

    deleteSelected() {
      if (!selected) return;
      const el = selected;
      select(null);
      el.remove();
      cb.onDirty?.(null, 'delete');
    },

    duplicateSelected() {
      if (!selected) return;
      const copy = selected.cloneNode(true);
      const x = num(win.getComputedStyle(selected).getPropertyValue('--x')) + 4;
      const y = num(win.getComputedStyle(selected).getPropertyValue('--y')) + 4;
      copy.style.setProperty('--x', x.toFixed(2));
      copy.style.setProperty('--y', y.toFixed(2));
      stage.appendChild(copy);
      select(copy);
      cb.onDirty?.(copy, 'duplicate');
    },

    moveLayer(dir) {
      if (!selected) return;
      if (dir > 0) stage.appendChild(selected);
      else stage.insertBefore(selected, stage.firstChild);
      updateOverlay();
      cb.onDirty?.(selected, 'layer');
    },

    refreshOverlay: updateOverlay,

    detach() {
      scene.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('resize', updateOverlay);
      selBox.remove();
      label.remove();
      style.remove();
      doc.body.removeAttribute('data-ck-edit');
    },
  };

  win.__ckEditor = ctl;   // referencia para detach(doc)
  return ctl;
}

export function detach(doc) {
  const ctl = doc?.defaultView?.__ckEditor;
  if (ctl) {
    ctl.detach();
    try { delete doc.defaultView.__ckEditor; } catch { /* readonly */ }
  }
  // limpieza defensiva por si quedó basura
  doc?.querySelectorAll(`#${STYLE_ID}, #ck-sel, #ck-label`).forEach((n) => n.remove());
  doc?.body?.removeAttribute('data-ck-edit');
}

/**
 * Elimina todo rastro del editor de un clon del DOM
 * (llamado por renderer.exportHTML antes de serializar).
 */
export function stripFromClone(cloneRoot) {
  const scope = cloneRoot.getRootNode?.() || document;
  scope.querySelectorAll(`#${STYLE_ID}, .ck-ui`).forEach((n) => n.remove());
  cloneRoot.removeAttribute?.('data-ck-edit');
}
