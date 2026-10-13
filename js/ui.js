/* ═══════════════════════════════════════════════════════════
   ui.js  ·  entrypoint
   Drag & drop, transiciones entre pasos, generación dinámica
   de controles y orquestación entre api-mock, parser y renderer.
   ═══════════════════════════════════════════════════════════ */

import { analyzeImages, generateCode } from './api-mock.js';
import { parseVariables, formatValue, prettify } from './parser.js';
import * as renderer from './renderer.js';
import { loadArtFromHash } from './art-loader.js';

/* ── estado ──────────────────────────────────────────────── */

const state = {
  step: 1,
  maxStep: 1,
  sketch: null,
  ref: null,
  sketchURL: null,
  refURL: null,
  prompt: '',
  vars: [],
  originals: new Map(),   // name → valor original
  refs: new Map(),        // name → { inputs:[], valueEl }
  built: false,
};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ── cache de nodos ──────────────────────────────────────── */

const el = {};
function cacheNodes() {
  el.app          = $('#app');
  el.steps        = $$('.step');
  el.stepItems    = $$('.stepper__item');
  el.rails        = $$('.stepper__rail');
  el.toast        = $('#toast');
  el.statusLeft   = $('#status-left');

  el.dropSketch   = $('#drop-sketch');
  el.dropRef      = $('#drop-ref');
  el.btnTo2       = $('#btn-to-2');
  el.btnAnalyze   = $('#btn-analyze');
  el.btnReanaly   = $('#btn-reanalyze');
  el.btnBuild     = $('#btn-build');
  el.prompt       = $('#prompt-editor');
  el.chipChars    = $('#chip-chars');
  el.chipSketch   = $('[data-chip="sketch"]');
  el.chipRef      = $('[data-chip="ref"]');

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
  el.btnResetApp  = $('#btn-reset-app');
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

function setStepStatus(n, text, kind = '') {
  const node = $(`[data-status="${n}"]`);
  if (!node) return;
  node.textContent = text;
  node.classList.remove('is-ok', 'is-err', 'is-busy');
  if (kind) node.classList.add(`is-${kind}`);
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

function goto(step) {
  if (step > state.maxStep) return;
  state.step = step;

  for (const s of el.steps) {
    s.classList.toggle('is-active', Number(s.dataset.step) === step);
  }

  el.stepItems.forEach((item, i) => {
    const n = i + 1;
    item.classList.toggle('is-active', n === step);
    item.classList.toggle('is-done', n < step);
    item.disabled = n > state.maxStep;
  });

  el.rails.forEach((rail, i) => {
    rail.classList.toggle('is-done', i + 2 <= state.maxStep);
  });

  el.app.dataset.step = String(step);
  setStatus(
    ['', 'paso 1 · subir boceto', 'paso 2 · subir referencia',
     'paso 3 · plan de construcción', 'paso 4 · workspace'][step]
  );
}

function unlock(step) {
  if (step > state.maxStep) {
    state.maxStep = step;
    goto(state.step);   // refresca estados del stepper
  }
}

/* ── drag & drop ─────────────────────────────────────────── */

function setupDrop(zone) {
  const input = $('input[type="file"]', zone);
  const key = zone.id === 'drop-sketch' ? 'sketch' : 'ref';

  const open = () => input.click();

  zone.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) return;
    if (zone.classList.contains('has-file')) return;
    open();
  });

  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!zone.classList.contains('has-file')) open();
    }
  });

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) acceptFile(zone, key, input.files[0]);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) => {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('is-drag');
    });
  });

  ['dragleave', 'dragend'].forEach((type) => {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
      // sólo salir si el puntero salió realmente de la zona
      if (type === 'dragleave' && zone.contains(e.relatedTarget)) return;
      zone.classList.remove('is-drag');
    });
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('is-drag');
    const file = e.dataTransfer && e.dataTransfer.files
      ? e.dataTransfer.files[0]
      : null;
    if (file) acceptFile(zone, key, file);
  });

  const clearBtn = $('[data-clear]', zone);
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearFile(zone, key);
    });
  }
}

function acceptFile(zone, key, file) {
  if (!file.type.startsWith('image/')) {
    toast(`"${file.name}" no es una imagen`, true);
    setStepStatus(key === 'sketch' ? 1 : 2, 'Formato no soportado.', 'err');
    return;
  }

  if (state[`${key}URL`]) URL.revokeObjectURL(state[`${key}URL`]);

  state[key] = file;
  state[`${key}URL`] = URL.createObjectURL(file);

  $('img', zone).src = state[`${key}URL`];
  $('.drop__name', zone).textContent = file.name;
  $('.drop__meta', zone).textContent = `${fmtBytes(file.size)} · ${file.type.replace('image/', '').toUpperCase()}`;
  zone.classList.add('has-file');

  const ready = !!state.sketch;
  el.btnTo2.disabled = !ready;
  el.btnAnalyze.disabled = !(state.sketch && state.ref);

  if (key === 'sketch') unlock(2);   // el boceto habilita el paso 2

  setStepStatus(
    key === 'sketch' ? 1 : 2,
    `✓ ${file.name} cargado`,
    'ok'
  );
  updateChips();
}

function clearFile(zone, key) {
  if (state[`${key}URL`]) URL.revokeObjectURL(state[`${key}URL`]);
  state[key] = null;
  state[`${key}URL`] = null;
  zone.classList.remove('has-file');
  $('img', zone).removeAttribute('src');

  el.btnTo2.disabled = !state.sketch;
  el.btnAnalyze.disabled = true;
  setStepStatus(key === 'sketch' ? 1 : 2,
    key === 'sketch' ? 'Esperando imagen del boceto…' : 'Esperando imagen de referencia…');

  if (key === 'sketch' && state.maxStep === 2) {
    state.maxStep = 1;
    if (state.step === 2) goto(1); else goto(state.step);
  }
  updateChips();
}

function updateChips() {
  el.chipSketch.textContent = state.sketch ? `boceto: ${state.sketch.name}` : 'boceto: —';
  el.chipRef.textContent    = state.ref ? `ref: ${state.ref.name}` : 'ref: —';
}

/* ── flujo analizar → prompt ─────────────────────────────── */

async function runAnalysis() {
  if (!state.sketch || !state.ref) return;
  busy(el.btnAnalyze, true, 'Analizando…');
  setStatus('analizando imágenes…', 'busy');
  setStepStatus(2, 'Extrayendo estructura y estilo…', 'busy');

  try {
    const prompt = await analyzeImages(state.sketch, state.ref);
    state.prompt = prompt;
    el.prompt.value = prompt;
    updateCharCount();

    setStepStatus(2, '✓ análisis completo', 'ok');
    setStepStatus(3, 'Plan listo. Edítalo libremente.', 'ok');
    unlock(3);
    goto(3);
    toast('Prompt Técnico Maestro generado');
    setStatus('paso 3 · plan de construcción');
  } catch (err) {
    console.error(err);
    setStepStatus(2, 'Error al analizar.', 'err');
    setStatus('error en el análisis', 'err');
    toast(String(err.message || err), true);
  } finally {
    busy(el.btnAnalyze, false);
  }
}

function updateCharCount() {
  const v = el.prompt.value;
  el.chipChars.textContent = `${v.length} car. · ${v.split('\n').length} líneas`;
}

/* ── flujo construir → render ────────────────────────────── */

async function runBuild() {
  const prompt = el.prompt.value.trim();
  if (!prompt) {
    toast('El prompt está vacío', true);
    return;
  }
  state.prompt = prompt;

  busy(el.btnBuild, true, 'Generando…');
  setStatus('generando código…', 'busy');
  setStepStatus(3, 'Renderizando el documento…', 'busy');

  try {
    const html = await generateCode(prompt);
    mountArt(html);
  } catch (err) {
    console.error(err);
    setStepStatus(3, 'Error al generar.', 'err');
    setStatus('error al generar', 'err');
    toast(String(err.message || err), true);
  } finally {
    busy(el.btnBuild, false);
  }
}

/**
 * Monta un documento CSS Art en el workspace: parsea variables,
 * construye controles, renderiza en el sandbox y salta al paso 4.
 * Compartido por el flujo generado (runBuild) y la carga desde
 * fragmento de URL (art-loader).
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
  state.built = true;

  unlock(4);
  goto(4);

  setStepStatus(3, '✓ ilustración construida', 'ok');
  setStepStatus(4, `${vars.length} variables · ${renderer.countNodes()} nodos`, 'ok');
  setStatus('workspace activo');
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

function resetApp() {
  if (state.sketchURL) URL.revokeObjectURL(state.sketchURL);
  if (state.refURL) URL.revokeObjectURL(state.refURL);

  state.sketch = state.ref = null;
  state.sketchURL = state.refURL = null;
  state.prompt = '';
  state.vars = [];
  state.built = false;
  state.originals.clear();
  state.refs.clear();
  state.maxStep = 1;

  for (const zone of [el.dropSketch, el.dropRef]) {
    zone.classList.remove('has-file', 'is-drag');
    $('img', zone).removeAttribute('src');
  }
  el.prompt.value = '';
  updateCharCount();
  updateChips();

  el.btnTo2.disabled = true;
  el.btnAnalyze.disabled = true;
  el.propsBody.textContent = '';
  el.propsCount.textContent = '0';
  el.frame.removeAttribute('srcdoc');
  el.frameMeta.textContent = '—';
  el.frameFps.textContent = '—';

  setStepStatus(1, 'Esperando imagen del boceto…');
  setStepStatus(2, 'Esperando imagen de referencia…');
  setStepStatus(3, 'Edita el plan cuando quieras.');
  setStepStatus(4, '—');

  goto(1);
  toast('Sesión reiniciada');
}

/* ── init ────────────────────────────────────────────────── */

function init() {
  cacheNodes();

  renderer.init(el.frame);
  renderer.onEvent((evt) => {
    if (evt.type === 'load') {
      el.frameMeta.textContent = `${evt.nodes} nodos DOM · srcdoc aislado`;
      const n = Object.keys(renderer.getApplied()).length;
      el.frameFps.textContent = n ? `${n} override(s) activas` : 'sin overrides';
      if (state.built) {
        setStepStatus(4, `${state.vars.length} variables · ${evt.nodes} nodos`, 'ok');
      }
    }
  });

  renderer.bindControls(el.propsBody, { onBefore, onAfter });

  setupDrop(el.dropSketch);
  setupDrop(el.dropRef);

  // navegación (stepper + botones data-goto)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto]');
    if (!btn) return;
    e.preventDefault();
    const target = Number(btn.dataset.goto);
    if (Number.isFinite(target)) goto(target);
  });

  el.prompt.addEventListener('input', updateCharCount);
  el.btnTo2.addEventListener('click', () => goto(2));
  el.btnAnalyze.addEventListener('click', runAnalysis);
  el.btnBuild.addEventListener('click', runBuild);
  el.btnReanaly.addEventListener('click', async () => {
    if (!state.sketch || !state.ref) return toast('Faltan imágenes', true);
    busy(el.btnReanaly, true, '…');
    try {
      const p = await analyzeImages(state.sketch, state.ref);
      state.prompt = p;
      el.prompt.value = p;
      updateCharCount();
      toast('Plan regenerado');
    } finally {
      busy(el.btnReanaly, false);
    }
  });

  el.btnResetVars.addEventListener('click', resetVars);
  el.btnCollapse.addEventListener('click', toggleCollapseAll);
  el.btnReload.addEventListener('click', () => { renderer.reload(); toast('Sandbox recargado'); });
  el.btnCopy.addEventListener('click', copyHTML);
  el.btnDownload.addEventListener('click', downloadHTML);
  el.btnResetApp.addEventListener('click', resetApp);

  // atajos: Cmd/Ctrl+Enter ejecuta el plan
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state.step === 3) {
      e.preventDefault();
      runBuild();
    }
  });

  updateChips();
  updateCharCount();
  goto(1);
  setStatus('listo · arrastra un boceto para empezar');

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
