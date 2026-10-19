/* ═══════════════════════════════════════════════════════════
   ui.js  ·  entrypoint
   Editor de la ilustración: carga desde el enlace de Claude Code,
   controles dinámicos, editor de elementos y exportación.
   ═══════════════════════════════════════════════════════════ */

import { parseVariables, formatValue, prettify } from './parser.js';
import * as renderer from './renderer.js';
import * as elementEditor from './element-editor.js';
import { loadArtFromHash } from './art-loader.js';

/* ── estado ──────────────────────────────────────────────── */

const state = {
  vars: [],
  originals: new Map(),   // name → valor original
  refs: new Map(),        // name → { inputs:[], valueEl }
  editMode: false,
};

let editorCtl = null;   // controller del editor de elementos (iframe)

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ── cache de nodos ──────────────────────────────────────── */

const el = {};
function cacheNodes() {
  el.toast        = $('#toast');
  el.empty        = $('#empty');
  el.workspace    = $('#workspace');
  el.statusLeft   = $('#status-left');


  el.frame        = $('#render-frame');
  el.propsBody    = $('#props-body');
  el.propsCount   = $('#props-count');
  el.frameMeta    = $('#frame-meta');
  el.frameFps     = $('#frame-fps');

  el.btnResetVars = $('#btn-reset-vars');
  el.btnCollapse  = $('#btn-collapse');
  el.btnReload    = $('#btn-reload');
  el.btnCopy      = $('#btn-copy');
  el.btnDownload  = $('#btn-download');

  el.btnEditMode  = $('#btn-edit-mode');
  el.selPanel     = $('#sel-panel');
  el.selTitle     = $('#sel-title');
  el.selProps     = $('#sel-props');
  el.btnSelClose  = $('#btn-sel-close');
  el.btnSelDel    = $('#btn-sel-del');
  el.btnSelDup    = $('#btn-sel-dup');
  el.btnSelDown   = $('#btn-sel-down');
  el.btnSelUp     = $('#btn-sel-up');
}

/* ── utilidades ──────────────────────────────────────────── */

let toastTimer = 0;
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('is-err', isError);
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2600);
}

function setStatus(text, kind = '') {
  el.statusLeft.textContent = text;
  el.statusLeft.classList.toggle('is-busy', kind === 'busy');
  el.statusLeft.classList.toggle('is-err', kind === 'err');
}

function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.classList.add('is-busy');
    btn.disabled = true;
    if (label) btn.textContent = label;
  } else {
    btn.classList.remove('is-busy');
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} kB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function expandHex(v) {
  const h = v.trim();
  if (h.length === 4 || h.length === 5) {
    return '#' + [...h.slice(1)].map((c) => c + c).join('');
  }
  return h.toLowerCase();
}

/* ── transición de pasos ─────────────────────────────────── */

/**
 * Monta un documento CSS Art en el editor: parsea variables,
 * construye controles y renderiza en el sandbox.
 * Lo usa la carga desde el enlace de Claude Code (art-loader).
 */
function mountArt(html, { source = 'generated' } = {}) {
  const vars = parseVariables(html);

  state.vars = vars;
  state.originals.clear();
  for (const v of vars) {
    let original;
    if (v.type === 'range') original = formatValue(v, v.number);
    else if (v.type === 'text' && v.quoted) original = v.value.slice(1, -1);
    else original = v.value;
    state.originals.set(v.name, original);
  }

  buildControls(vars);
  renderer.render(html);

  showWorkspace(true);
  setStatus(`${vars.length} variables · ${renderer.countNodes()} nodos`, 'ok');
  toast(
    source === 'art'
      ? `Arte cargado: ${vars.length} variables editables`
      : `Construido: ${vars.length} variables editables`
  );
}

/* ── construcción de controles ───────────────────────────── */

function groupVars(vars) {
  const map = new Map();
  for (const v of vars) {
    if (!map.has(v.group)) map.set(v.group, []);
    map.get(v.group).push(v);
  }
  return map;
}

function buildControls(vars) {
  state.refs.clear();
  el.propsBody.textContent = '';
  el.propsCount.textContent = String(vars.length);

  if (!vars.length) {
    el.propsBody.innerHTML = '<p class="props__empty">No se detectaron variables en :root</p>';
    return;
  }

  const groups = groupVars(vars);
  const frag = document.createDocumentFragment();

  for (const [group, list] of groups) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.dataset.group = group;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'group__head';
    head.innerHTML =
      `<span class="caret">▼</span>` +
      `<span>${escapeHTML(group)}</span>` +
      `<span class="group__n">${list.length}</span>`;
    head.addEventListener('click', () => sec.classList.toggle('is-collapsed'));

    const body = document.createElement('div');
    body.className = 'group__body';

    for (const v of list) body.appendChild(buildControl(v));

    sec.append(head, body);
    frag.appendChild(sec);
  }

  el.propsBody.appendChild(frag);
}

function buildControl(v) {
  const ctl = document.createElement('div');
  ctl.className = `ctl ctl--${v.type}`;
  ctl.dataset.name = v.name;

  const refs = { inputs: [], valueEl: null };

  const top = document.createElement('div');
  top.className = 'ctl__top';

  const label = document.createElement('span');
  label.className = 'ctl__label';
  label.innerHTML = `${escapeHTML(v.label)} <code>${escapeHTML(v.name)}</code>`;

  const tag = document.createElement('span');
  tag.className = 'ctl__tag';
  tag.textContent = v.type === 'range' ? (v.displayUnit || 'num') : v.type;

  const valueEl = document.createElement('span');
  valueEl.className = 'ctl__value';

  top.append(label, tag, valueEl);
  ctl.appendChild(top);
  refs.valueEl = valueEl;

  if (v.type === 'range') {
    const original = state.originals.get(v.name);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(v.min);
    input.max = String(v.max);
    input.step = String(v.step);
    input.value = String(v.number);
    input.dataset.var = v.name;
    input.dataset.format = 'range';
    input.dataset.unit = v.unit || '';
    input.dataset.displayUnit = v.displayUnit || '';
    input.setAttribute('aria-label', v.label);

    valueEl.textContent = original;
    refs.inputs.push(input);
    ctl.appendChild(input);
  }

  else if (v.type === 'color') {
    const hex = expandHex(v.value);

    const row = document.createElement('div');
    row.className = 'ctl__row';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'ctl__swatch';
    swatch.value = hex.slice(0, 7);
    swatch.dataset.var = v.name;
    swatch.dataset.format = 'color';
    swatch.setAttribute('aria-label', `${v.label} selector de color`);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'ctl__hex';
    text.value = v.value;
    text.spellcheck = false;
    text.dataset.var = v.name;
    text.dataset.format = 'color';
    text.setAttribute('aria-label', `${v.label} valor hex`);

    valueEl.textContent = v.value;
    refs.inputs.push(swatch, text);
    refs.pair = { swatch, text };
    row.append(swatch, text);
    ctl.appendChild(row);
  }

  else if (v.type === 'select') {
    const select = document.createElement('select');
    select.className = 'ctl__select';
    select.dataset.var = v.name;
    select.dataset.format = 'select';
    select.setAttribute('aria-label', v.label);

    for (const opt of v.options || []) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === v.value) o.selected = true;
      select.appendChild(o);
    }

    valueEl.textContent = v.value;
    refs.inputs.push(select);
    ctl.appendChild(select);
  }

  else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ctl__text';
    // mostramos el texto "pelado"; el renderer lo vuelve a comillas al escribir
    input.value = v.quoted ? v.value.slice(1, -1) : v.value;
    if (v.quoted) input.dataset.quote = '1';
    input.spellcheck = false;
    input.dataset.var = v.name;
    input.dataset.format = 'text';
    input.setAttribute('aria-label', v.label);

    valueEl.textContent = input.value;
    refs.inputs.push(input);
    ctl.appendChild(input);
  }

  state.refs.set(v.name, refs);
  return ctl;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── callbacks del bridge de controles ───────────────────── */

function onBefore(name, value, node) {
  if (node.classList.contains('ctl__hex')) {
    if (!HEX_RE.test(value.trim())) {
      node.classList.add('is-invalid');
      return false;
    }
    node.classList.remove('is-invalid');
  }
  return true;
}

function onAfter(name, value, node) {
  const refs = state.refs.get(name);
  if (!refs) return;

  if (refs.valueEl) {
    if (node.type === 'range') {
      // el readout es formato visible (con el sufijo del comentario unit:)
      // mientras que `value` es lo que se escribe en el CSS
      refs.valueEl.textContent = `${node.value}${node.dataset.displayUnit || ''}`;
    } else if (node.classList.contains('ctl__text')) {
      // en campos de texto el valor escrito lleva comillas de CSS;
      // el readout muestra lo que el usuario ve en el input
      refs.valueEl.textContent = node.value;
    } else {
      refs.valueEl.textContent = value;
    }
  }

  // sincroniza swatch ↔ hex
  if (refs.pair) {
    const { swatch, text } = refs.pair;
    if (node === swatch) {
      text.value = value;
      text.classList.remove('is-invalid');
    } else if (node === text && HEX_RE.test(value.trim())) {
      const expanded = expandHex(value);
      swatch.value = expanded.slice(0, 7);
    }
  }
}

/* ── editor de elementos (modo vectorial) ────────────────── */

function setEditMode(on) {
  state.editMode = on;
  el.btnEditMode.setAttribute('aria-pressed', String(on));

  if (on) {
    attachEditor();
    if (!editorCtl) {
      // el sandbox aún no terminó de cargar: se queda el modo armado
      // y el evento 'load' del iframe adjunta el editor al terminar
      setStatus('cargando sandbox · el modo elementos se activará solo', 'busy');
      toast('Sandbox cargando: el modo elementos se activará automáticamente');
      return;
    }
    setStatus('modo elementos activo · clic para seleccionar, arrastrar para mover');
    toast('Modo elementos: clic = seleccionar · arrastrar = mover · esquinas = escalar · ⌫ = borrar');
  } else {
    editorCtl?.detach();
    editorCtl = null;
    clearSelPanel();
    setStatus('workspace activo');
  }
}

function attachEditor() {
  const doc = renderer.getDoc();
  if (!doc) return;
  editorCtl?.detach();
  editorCtl = elementEditor.attach(doc, {
    onSelect: (elNode, props) => renderSelPanel(elNode, props),
    onDirty: () => {
      const n = renderer.countNodes();
      el.frameMeta.textContent = `${n} nodos DOM · srcdoc aislado`;
      el.frameFps.textContent = 'elementos editados sin guardar';
    },
  });
}

function clearSelPanel() {
  el.selPanel.hidden = true;
  el.selTitle.textContent = '—';
  el.selProps.textContent = '';
}

function renderSelPanel(elNode, props) {
  if (!elNode) { clearSelPanel(); return; }

  el.selPanel.hidden = false;
  const cls = [...elNode.classList].find((c) => c && c !== 'ck-ui') || '';
  const tag = elNode.tagName.toLowerCase();
  el.selTitle.textContent = elNode.id
    ? `${tag}#${elNode.id}${cls ? '.' + cls : ''}`
    : cls ? `.${cls}` : tag;

  el.selProps.textContent = '';
  if (!props.length) {
    el.selProps.innerHTML = '<p class="sel__empty">Este elemento no tiene variables inline (--x, --y, colores…)</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const p of props) frag.appendChild(buildElControl(p));
  el.selProps.appendChild(frag);
}

function buildElControl(p) {
  const ctl = document.createElement('div');
  ctl.className = `ctl ctl--${p.type}`;

  const top = document.createElement('div');
  top.className = 'ctl__top';

  const label = document.createElement('span');
  label.className = 'ctl__label';
  label.innerHTML = `<code>${escapeHTML(p.name)}</code>`;

  const valueEl = document.createElement('span');
  valueEl.className = 'ctl__value';
  valueEl.textContent = String(p.value);

  top.append(label, valueEl);
  ctl.appendChild(top);

  if (p.type === 'range') {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(p.min);
    input.max = String(p.max);
    input.step = String(p.step);
    input.value = String(p.value);
    input.dataset.elprop = p.name;
    input.setAttribute('aria-label', p.name);
    input.addEventListener('input', () => {
      valueEl.textContent = input.value;
      editorCtl?.setProp(p.name, input.value);
    });
    ctl.appendChild(input);
  } else if (p.type === 'color') {
    const row = document.createElement('div');
    row.className = 'ctl__row';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'ctl__swatch';
    const hex = /^#[0-9a-f]{3,8}$/i.test(p.value) ? p.value : '#ffffff';
    swatch.value = hex.length === 4 || hex.length === 5
      ? '#' + [...hex.slice(1)].map((c) => c + c).join('').slice(0, 7)
      : hex.slice(0, 7);
    swatch.setAttribute('aria-label', `${p.name} selector`);
    swatch.addEventListener('input', () => {
      valueEl.textContent = swatch.value;
      editorCtl?.setProp(p.name, swatch.value);
    });

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'ctl__hex';
    text.value = p.value;
    text.spellcheck = false;
    text.addEventListener('change', () => {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.value.trim())) {
        text.classList.remove('is-invalid');
        valueEl.textContent = text.value;
        editorCtl?.setProp(p.name, text.value);
      } else {
        text.classList.add('is-invalid');
      }
    });

    row.append(swatch, text);
    ctl.appendChild(row);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ctl__text';
    input.value = p.value;
    input.spellcheck = false;
    input.addEventListener('change', () => {
      valueEl.textContent = input.value;
      editorCtl?.setProp(p.name, input.value);
    });
    ctl.appendChild(input);
  }

  return ctl;
}

/* ── acciones del workspace ──────────────────────────────── */

function resetVars() {
  if (!state.vars.length) return;
  renderer.clearVariables([...state.originals.keys()]);

  for (const [name, original] of state.originals) {
    const refs = state.refs.get(name);
    if (!refs) continue;
    const desc = state.vars.find((v) => v.name === name);

    if (desc && desc.type === 'range') {
      const num = parseFloat(original);
      refs.inputs.forEach((i) => { i.value = String(num); });
      if (refs.valueEl) refs.valueEl.textContent = original;
    } else if (desc && desc.type === 'color') {
      const hex = expandHex(original).slice(0, 7);
      refs.inputs.forEach((i) => {
        if (i.classList.contains('ctl__swatch')) i.value = hex;
        else { i.value = original; i.classList.remove('is-invalid'); }
      });
      if (refs.valueEl) refs.valueEl.textContent = original;
    } else if (desc) {
      refs.inputs.forEach((i) => { i.value = original; });
      if (refs.valueEl) refs.valueEl.textContent = original;
    }
  }

  toast('Variables restauradas al estado original');
}

function toggleCollapseAll() {
  const groups = $$('.group', el.propsBody);
  const anyOpen = groups.some((g) => !g.classList.contains('is-collapsed'));
  groups.forEach((g) => g.classList.toggle('is-collapsed', anyOpen));
  el.btnCollapse.textContent = anyOpen ? 'Expandir todo' : 'Colapsar todo';
}

async function copyHTML() {
  const html = renderer.exportHTML();
  if (!html) return toast('Nada que copiar', true);
  try {
    await navigator.clipboard.writeText(html);
    toast('HTML copiado al portapapeles');
  } catch {
    // fallback sin API de portapapeles (contextos no seguros)
    const ta = document.createElement('textarea');
    ta.value = html;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('HTML copiado al portapapeles');
    } catch {
      toast('No se pudo copiar', true);
    }
    ta.remove();
  }
}

function downloadHTML() {
  const html = renderer.exportHTML();
  if (!html) return toast('Nada que descargar', true);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cssketch-illustration.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Descarga iniciada');
}

/* ── init ────────────────────────────────────────────────── */

function showWorkspace(on) {
  el.workspace.classList.toggle('is-active', on);
  el.empty.hidden = on;
}

function init() {
  cacheNodes();
  showWorkspace(false);

  renderer.init(el.frame);
  renderer.onEvent((evt) => {
    if (evt.type === 'load') {
      el.frameMeta.textContent = `${evt.nodes} nodos DOM · srcdoc aislado`;
      const n = Object.keys(renderer.getApplied()).length;
      el.frameFps.textContent = n ? `${n} override(s) activas` : 'sin overrides';
      if (state.vars.length) setStatus(`${state.vars.length} variables · ${evt.nodes} nodos`, 'ok');
      // readjunta el editor de elementos si el modo quedó activo
      if (state.editMode) {
        attachEditor();
        if (editorCtl) {
          setStatus('modo elementos activo · clic para seleccionar, arrastrar para mover');
          toast('Modo elementos activo');
        }
      }
    }
  });

  renderer.bindControls(el.propsBody, { onBefore, onAfter });

  el.btnResetVars.addEventListener('click', resetVars);
  el.btnCollapse.addEventListener('click', toggleCollapseAll);
  el.btnReload.addEventListener('click', () => { renderer.reload(); toast('Sandbox recargado'); });
  el.btnCopy.addEventListener('click', copyHTML);
  el.btnDownload.addEventListener('click', downloadHTML);

  // editor de elementos (modo vectorial)
  el.btnEditMode.addEventListener('click', () => setEditMode(!state.editMode));
  // el foco puede quedar en la UI madre (p. ej. tras pulsar "Elementos"):
  // en ese caso las teclas nunca llegarían al iframe, así que se reenvían
  document.addEventListener('keydown', (e) => {
    if (!state.editMode || !editorCtl) return;
    editorCtl.handleKey(e);
  });
  el.btnSelClose.addEventListener('click', () => {
    editorCtl?.detach();
    if (state.editMode) attachEditor();   // limpia la selección re-adjuntando
  });
  el.btnSelDel.addEventListener('click', () => {
    editorCtl?.deleteSelected();
    clearSelPanel();
    toast('Elemento borrado · usa “Copiar HTML” para exportar');
  });
  el.btnSelDup.addEventListener('click', () => {
    editorCtl?.duplicateSelected();
    toast('Elemento duplicado (a la derecha y abajo)');
  });
  el.btnSelDown.addEventListener('click', () => editorCtl?.moveLayer(-1));
  el.btnSelUp.addEventListener('click', () => editorCtl?.moveLayer(1));

  setStatus('sin ilustración · pídela en Claude Code');

  // si la URL trae un arte embebido (#arte=<nombre> o #d=<base64>), lo monta
  loadFromFragment();
}

async function loadFromFragment() {
  const art = await loadArtFromHash();
  if (!art) return;
  try {
    mountArt(art.html, { source: 'art' });
  } catch (err) {
    console.error('[ui] arte del fragmento inválido:', err);
    toast(`Arte "${art.name}" inválido: ${err.message}`, true);
  }
}

init();
