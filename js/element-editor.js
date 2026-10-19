/* ═══════════════════════════════════════════════════════════
   element-editor.js
   Editor de elementos DENTRO del iframe:

   · clic      → selecciona la PIEZA (g[data-z], svg > g o hijo
                 directo de .scene/.stage), no el svg entero.
   · arrastrar → mueve la pieza (transform sobre un wrapper <g>).
   · esquinas  → escala con los tiradores del marco de selección.
   · teclado   → flechas nudgear, ⌫ borrar, Esc deseleccionar.

   La transformación vive en un <g data-ck-wrap> envolvente (o en
   el propio elemento si es HTML), así el CSS del arte —y sus
   variables— sigue mandando sobre la pieza original: mover la
   lupa no apaga su --lens-dy.

   Nada de esto se exporta como "ruido": los wrappers y sus
   transform SÍ se conservan (son los cambios del usuario), y todo
   lo demás (.ck-ui, #ck-editor-style) se limpia del clon antes de
   serializar (stripFromClone).
   ═══════════════════════════════════════════════════════════ */

const STYLE_ID = 'ck-editor-style';
const NS_SVG = 'http://www.w3.org/2000/svg';
const WRAP_ATTR = 'data-ck-wrap';

const INJECTED_CSS = `
body[data-ck-edit] { user-select: none; -webkit-user-select: none; }
body[data-ck-edit], body[data-ck-edit] * { cursor: grab; touch-action: none; }
body[data-ck-edit] [data-z], body[data-ck-edit] svg > g { pointer-events: all; }
.ck-ui { position: fixed; z-index: 99; pointer-events: none; box-sizing: border-box; }
.ck-ui[hidden] { display: none !important; }
#ck-sel {
  border: 2px solid #5eead4;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(10,12,16,.55);
}
#ck-hover {
  border: 1.5px dashed rgba(34,211,238,.9);
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(10,12,16,.35);
}
#ck-label {
  font: 600 10px ui-monospace, "SF Mono", Menlo, monospace;
  color: #052e26;
  background: #5eead4;
  padding: 2px 6px;
  border-radius: 4px;
  transform: translateY(calc(-100% - 6px));
  white-space: nowrap;
}
.ck-ui.ck-handle {
  position: absolute;
  width: 11px;
  height: 11px;
  background: #5eead4;
  border: 1.5px solid #052e26;
  border-radius: 3px;
  pointer-events: auto;
}
.ck-handle[data-h="nw"] { left: 0;  top: 0;    transform: translate(-50%,-50%); cursor: nwse-resize; }
.ck-handle[data-h="ne"] { right: 0; top: 0;    transform: translate(50%,-50%);  cursor: nesw-resize; }
.ck-handle[data-h="sw"] { left: 0;  bottom: 0; transform: translate(-50%,50%);  cursor: nesw-resize; }
.ck-handle[data-h="se"] { right: 0; bottom: 0; transform: translate(50%,50%);   cursor: nwse-resize; }
`;

/* ── helpers ─────────────────────────────────────────────── */

function num(v) {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function isSvg(el) {
  return Boolean(el) && el.namespaceURI === NS_SVG;
}

function mk(doc, tag, cls) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

/* ── estado de transformación (sobre el host) ────────────── */

function readState(host) {
  if (!host || !host.dataset) return { tx: 0, ty: 0, s: 1 };
  const s = host.dataset.ckS !== undefined ? num(host.dataset.ckS) : 1;
  return {
    tx: num(host.dataset.ckTx),
    ty: num(host.dataset.ckTy),
    s: s || 1,
  };
}

/**
 * Escribe la transformación en el host.
 * · envolvente (SVG): origin se anula a 0 0 y el escalado se
 *   hace con la matriz explícita t · c · s · c⁻¹ (el centro c
 *   sale de getBBox), porque transform-origin por defecto en SVG
 *   apunta al centro del viewBox y desplazaría la pieza.
 * · host HTML: translate + scale con el origin 50% 50% nativo.
 */
function applyState(host, st) {
  if (!host || !host.style) return;
  const sandwich = host.getAttribute(WRAP_ATTR) !== null;
  if (sandwich) host.style.transformOrigin = '0 0';

  if (st.tx === 0 && st.ty === 0 && st.s === 1) {
    host.style.transform = '';
  } else {
    let t = `translate(${r2(st.tx)}px, ${r2(st.ty)}px)`;
    if (st.s !== 1) {
      if (sandwich) {
        let cx = 0, cy = 0;
        try {
          const b = host.getBBox();
          cx = b.x + b.width / 2;
          cy = b.y + b.height / 2;
        } catch { /* sin bbox aún */ }
        t += ` translate(${r2(cx)}px, ${r2(cy)}px)`
           + ` scale(${st.s})`
           + ` translate(${r2(-cx)}px, ${r2(-cy)}px)`;
      } else {
        t += ` scale(${st.s})`;
      }
    }
    host.style.transform = t;
  }

  host.dataset.ckTx = String(r2(st.tx));
  host.dataset.ckTy = String(r2(st.ty));
  host.dataset.ckS = String(r2(st.s));
}

/* ── descripción de la pieza para el panel ───────────────── */

function describeProps(el, host) {
  const style = el.getAttribute('style') || '';
  const props = [];
  const re = /(--[\w-]+)\s*:\s*([^;]+)/g;
  let m;
  while ((m = re.exec(style)) !== null) {
    const name = m[1];
    const raw = m[2].trim();
    props.push({ name, raw, ...classify(name, raw) });
  }

  // posición y escala del editor (siempre presentes)
  const names = new Set(props.map((p) => p.name));
  const st = readState(host);
  if (!names.has('--x')) {
    props.push({ name: '--x', type: 'range', value: r2(st.tx), min: -800, max: 800, step: 1 });
  }
  if (!names.has('--y')) {
    props.push({ name: '--y', type: 'range', value: r2(st.ty), min: -800, max: 800, step: 1 });
  }
  if (!names.has('--scale')) {
    props.push({ name: '--scale', type: 'range', value: r2(st.s), min: 0.1, max: 4, step: 0.01 });
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
  const id = el.id ? `#${el.id}` : '';
  if (id) return cls ? `${tag}${id}.${cls}` : `${tag}${id}`;
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
  const stageEl = doc.querySelector('.stage');

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = INJECTED_CSS;
  doc.head.appendChild(style);
  doc.body.setAttribute('data-ck-edit', '');

  // overlays en el body con position:fixed → no los recorta
  // el overflow:hidden del .scene
  const selBox = mk(doc, 'div', 'ck-ui');
  selBox.id = 'ck-sel';
  selBox.hidden = true;
  for (const h of ['nw', 'ne', 'sw', 'se']) {
    const handle = mk(doc, 'div', 'ck-ui ck-handle');
    handle.dataset.h = h;
    handle.setAttribute('aria-hidden', 'true');
    selBox.appendChild(handle);
  }

  const hoverBox = mk(doc, 'div', 'ck-ui');
  hoverBox.id = 'ck-hover';
  hoverBox.hidden = true;

  const label = mk(doc, 'div', 'ck-ui');
  label.id = 'ck-label';
  label.hidden = true;

  doc.body.append(selBox, hoverBox, label);

  let selected = null;
  let dragging = false;
  /** finalizador del drag en curso (para blur/pointercancel/Esc) */
  let activeEnd = null;

  function endActiveDrag() {
    if (!activeEnd) return;
    const finish = activeEnd;
    activeEnd = null;
    finish();
  }

  /* ── piezas seleccionables ── */

  const isPiece = (n) =>
    n && n.nodeType === 1 && !n.classList.contains('ck-ui') && n.id !== 'ck-sel';

  const units = () => {
    if (stageEl) return [...stageEl.children].filter(isPiece);
    const zGroups = scene.querySelectorAll('[data-z]');
    if (zGroups.length) return [...zGroups];
    // fallback: si una pieza ya está envuelta, la unidad es el hijo
    const svgGroups = [...scene.querySelectorAll('svg > g')]
      .map((g) => (g.getAttribute(WRAP_ATTR) !== null ? g.firstElementChild : g))
      .filter((g) => g && isPiece(g));
    if (svgGroups.length) return svgGroups;
    return [...scene.children].filter(isPiece);
  };

  const rootOf = (target) => {
    if (!target || target.nodeType !== 1) return null;
    if (target.closest && target.closest('.ck-ui')) return null;
    const set = new Set(units());
    if (!set.size) return null;
    let n = target;
    while (n && n !== scene && n !== doc.body) {
      if (set.has(n)) return n;
      n = n.parentElement;
    }
    return null;
  };

  /* ── host = donde vive la transformación ── */

  const hostOf = (unit, create = false) => {
    if (!unit) return null;
    if (unit.getAttribute(WRAP_ATTR) !== null) return unit;  // ya es el host
    const parent = unit.parentElement;
    if (parent && parent.getAttribute(WRAP_ATTR) !== null) return parent;
    // solo se envuelve si el padre es SVG (un <g> dentro de un
    // <div> no sería HTML válido)
    if (!isSvg(unit) || !isSvg(parent)) return unit;
    if (!create) return unit;
    const wrap = doc.createElementNS(NS_SVG, 'g');
    wrap.setAttribute(WRAP_ATTR, '');
    parent.insertBefore(wrap, unit);
    wrap.appendChild(unit);
    return wrap;
  };

  /** unidades de usuario del SVG por píxel de pantalla */
  const userPerPx = (unit) => {
    const host = hostOf(unit, false);
    const p = host && host.parentElement;
    try {
      if (p && typeof p.getScreenCTM === 'function') {
        const m = p.getScreenCTM();
        const k = m ? Math.hypot(m.a, m.b) : 0;
        if (k > 1e-6) return 1 / k;
      }
    } catch { /* sin CTM */ }
    return 1;
  };

  const setTransform = (unit, tx, ty, s) => {
    const host = hostOf(unit, true);
    applyState(host, { tx, ty, s });
  };

  /* ── overlays ── */

  function placeBox(box, rect) {
    box.hidden = false;
    box.style.left = `${rect.left - 3}px`;
    box.style.top = `${rect.top - 3}px`;
    box.style.width = `${rect.width + 6}px`;
    box.style.height = `${rect.height + 6}px`;
  }

  function updateOverlay() {
    if (!selected || !selected.isConnected) {
      selBox.hidden = true;
      label.hidden = true;
      if (selected && !selected.isConnected) selected = null;
      return;
    }
    const r = selected.getBoundingClientRect();
    placeBox(selBox, r);
    label.hidden = false;
    label.style.left = `${r.left - 3}px`;
    label.style.top = `${r.top - 3}px`;
    label.textContent = `${labelOf(selected)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  function notify() {
    cb.onSelect?.(selected, selected ? describeProps(selected, hostOf(selected, false)) : []);
  }

  function select(el) {
    selected = el || null;
    updateOverlay();
    notify();
  }

  /* ── hover: resalta la pieza bajo el cursor ── */

  function onSceneMove(e) {
    if (dragging) return;
    const unit = rootOf(e.target);
    if (!unit || unit === selected) { hoverBox.hidden = true; return; }
    placeBox(hoverBox, unit.getBoundingClientRect());
  }

  function hideHover() { hoverBox.hidden = true; }

  /* ── drag: mover pieza ── */

  function startMove(unit, e) {
    endActiveDrag();
    dragging = true;
    hideHover();
    capture(e);

    const st = readState(hostOf(unit, false));
    const upx = userPerPx(unit);
    const sx = e.clientX;
    const sy = e.clientY;

    const onMove = (ev) => {
      setTransform(
        unit,
        st.tx + (ev.clientX - sx) * upx,
        st.ty + (ev.clientY - sy) * upx,
        st.s
      );
      updateOverlay();
      cb.onDirty?.(unit);
    };
    const finish = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', finish);
      win.removeEventListener('pointercancel', finish);
      if (activeEnd === finish) activeEnd = null;
      dragging = false;
      updateOverlay();
      notify();                      // refresca los sliders del panel
    };
    activeEnd = finish;
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', finish);
    win.addEventListener('pointercancel', finish);
  }

  /* ── drag: escalar desde las esquinas ── */

  function startScale(e) {
    if (!selected) return;
    endActiveDrag();
    dragging = true;
    hideHover();
    capture(e);

    const st = readState(hostOf(selected, false));
    const r = selected.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d0 = Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 4);

    const onMove = (ev) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const s = clamp(st.s * (d / d0), 0.05, 20);
      setTransform(selected, st.tx, st.ty, s);
      updateOverlay();
      cb.onDirty?.(selected);
    };
    const finish = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', finish);
      win.removeEventListener('pointercancel', finish);
      if (activeEnd === finish) activeEnd = null;
      dragging = false;
      updateOverlay();
      notify();
    };
    activeEnd = finish;
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', finish);
    win.addEventListener('pointercancel', finish);
  }

  /** captura el puntero para que el drag siga aunque el cursor
      salga de la pieza (o de los tiradores) dentro del iframe */
  function capture(e) {
    try { e.target?.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }

  /* ── eventos ── */

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const unit = rootOf(e.target);
    if (!unit) { select(null); return; }
    e.preventDefault();
    try { win.focus(); } catch { /* noop */ }
    if (selected !== unit) select(unit);
    startMove(unit, e);
  }

  function onHandleDown(e) {
    const handle = e.target && e.target.closest ? e.target.closest('.ck-handle') : null;
    if (!handle || !selected) return;
    e.preventDefault();
    e.stopPropagation();
    try { win.focus(); } catch { /* noop */ }
    startScale(e);
  }

  /* teclado: flechas nudgear, Supr borrar, Esc deselect */
  function handleKey(e) {
    const t = e.target;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    ) return;

    if (e.key === 'Escape') { endActiveDrag(); select(null); return; }
    if (!selected) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const host = hostOf(selected, false) || selected;
      select(null);
      host.remove();
      cb.onDirty?.(null, 'delete');
      return;
    }

    const step = e.shiftKey ? 5 : 1;
    const map = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (map[e.key]) {
      e.preventDefault();
      const [dx, dy] = map[e.key];
      const st = readState(hostOf(selected, false));
      setTransform(selected, st.tx + dx, st.ty + dy, st.s);
      updateOverlay();
      notify();
      cb.onDirty?.(selected);
    }
  }

  scene.addEventListener('pointerdown', onPointerDown);
  scene.addEventListener('pointermove', onSceneMove);
  scene.addEventListener('pointerleave', hideHover);
  selBox.addEventListener('pointerdown', onHandleDown);
  win.addEventListener('keydown', handleKey);
  win.addEventListener('resize', updateOverlay);
  win.addEventListener('scroll', updateOverlay, true);
  win.addEventListener('blur', endActiveDrag);

  const ctl = {
    doc,
    get selected() { return selected; },

    handleKey,

    setProp(name, value) {
      if (!selected) return;
      if (name === '--x' || name === '--y' || name === '--scale') {
        const v = parseFloat(value);
        if (!Number.isFinite(v)) return;
        const st = readState(hostOf(selected, false));
        if (name === '--x') st.tx = v;
        else if (name === '--y') st.ty = v;
        else st.s = clamp(v, 0.05, 20);
        setTransform(selected, st.tx, st.ty, st.s);
        updateOverlay();
        cb.onDirty?.(selected);
        return;
      }
      selected.style.setProperty(name, String(value));
      updateOverlay();
      cb.onDirty?.(selected);
    },

    deleteSelected() {
      if (!selected) return;
      const host = hostOf(selected, false) || selected;
      select(null);
      host.remove();
      cb.onDirty?.(null, 'delete');
    },

    duplicateSelected() {
      if (!selected) return;
      const src = selected;
      const host = hostOf(src, false) || src;
      const st = readState(host);
      const copy = src.cloneNode(true);

      // offset = 4% del ancho de la escena, en unidades del host
      const off = userPerPx(src) * (scene.getBoundingClientRect().width || 450) * 0.04;
      host.parentNode.insertBefore(copy, host.nextSibling);

      applyState(hostOf(copy, true), { tx: st.tx + off, ty: st.ty + off, s: st.s });
      select(copy);
      cb.onDirty?.(copy, 'duplicate');
    },

    moveLayer(dir) {
      if (!selected) return;
      const host = hostOf(selected, false) || selected;
      const parent = host.parentNode;
      if (!parent) return;
      if (dir > 0) {
        parent.appendChild(host);
      } else {
        const first = parent.firstElementChild;
        if (first && first !== host) parent.insertBefore(host, first);
      }
      updateOverlay();
      cb.onDirty?.(selected, 'layer');
    },

    refreshOverlay: updateOverlay,

    detach() {
      endActiveDrag();
      scene.removeEventListener('pointerdown', onPointerDown);
      scene.removeEventListener('pointermove', onSceneMove);
      scene.removeEventListener('pointerleave', hideHover);
      selBox.removeEventListener('pointerdown', onHandleDown);
      win.removeEventListener('keydown', handleKey);
      win.removeEventListener('resize', updateOverlay);
      win.removeEventListener('scroll', updateOverlay, true);
      win.removeEventListener('blur', endActiveDrag);
      selBox.remove();
      hoverBox.remove();
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
  doc?.querySelectorAll(`#${STYLE_ID}, #ck-sel, #ck-hover, #ck-label`).forEach((n) => n.remove());
  doc?.body?.removeAttribute('data-ck-edit');
}

/**
 * Elimina todo rastro del editor de un clon del DOM
 * (llamado por renderer.exportHTML antes de serializar).
 * Los <g data-ck-wrap> y su transform se conservan: son la
 * edición del usuario (posición/escala de la pieza).
 */
export function stripFromClone(cloneRoot) {
  const scope = cloneRoot.getRootNode?.() || document;
  scope.querySelectorAll(`#${STYLE_ID}, .ck-ui`).forEach((n) => n.remove());
  cloneRoot.removeAttribute?.('data-ck-edit');
}
