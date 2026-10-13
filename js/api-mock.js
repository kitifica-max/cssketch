/* ═══════════════════════════════════════════════════════════
   api-mock.js
   Stubs asíncronos con la misma firma que tendría la API real.
   Sustituir el cuerpo por fetch() cuando exista backend/LLM.
   ═══════════════════════════════════════════════════════════ */

const DELAY_ANALYZE = 1100;
const DELAY_GENERATE = 2200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fileLabel(file) {
  if (!file) return '(sin archivo)';
  return `${file.name} · ${(file.size / 1024).toFixed(1)} kB`;
}

/* ───────────────────────────────────────────────────────────
   analyzeImages(sketchFile, refFile) → string
   Devuelve el "Prompt Técnico Maestro" en texto plano.
   ─────────────────────────────────────────────────────────── */
export async function analyzeImages(sketchFile, refFile) {
  await sleep(DELAY_ANALYZE);

  const prompt = [
    `# PROMPT TÉCNICO MAESTRO — CSSketch`,
    ``,
    `## Entradas`,
    `- Estructura (boceto): ${fileLabel(sketchFile)}`,
    `- Estilo (referencia): ${fileLabel(refFile)}`,
    ``,
    `## Rol`,
    `Actúa como ilustrador técnico especializado en CSS Art de alta complejidad.`,
    `Tu salida es UN ÚNICO documento HTML autocontenido: un bloque <style> seguido`,
    `de marcado HTML. Sin dependencias, sin frameworks, sin JavaScript, sin imágenes`,
    `externas. Todo debe dibujarse con CSS puro y, cuando aporte, SVG embebido inline.`,
    ``,
    `## Sistema de variables obligatorio`,
    `Declara TODOS los parámetros editables dentro de :root, cada uno acompañado de`,
    `un comentario semántico que la UI usará para construir los controles:`,
    ``,
    `  /*type:color*/ --sky-top: #0b1d3a;`,
    `  /*type:range|min:0|max:100|step:1|unit:%*/ --horizon: 62;`,
    `  /*type:range|min:0|max:360|step:1|unit:deg*/ --sun-angle: 205;`,
    `  /*type:select|options:normal|screen|overlay|multiply*/ --blend-mode: screen;`,
    `  /*type:text*/ --caption: "Costa Norte";`,
    ``,
    `Reglas de la sintaxis de comentario:`,
    `  - type:color  → color plano (hex de 6 dígitos).`,
    `  - type:range  → numérico. Opcionales min, max, step y unit (px|%|deg|rem|vh).`,
    `                   El valor en :root es NUMÉRICO puro; la unit se aplica al usarlo.`,
    `  - type:select → lista de opciones separadas por "|".`,
    `  - type:text   → cadena libre.`,
    `  - Agrupa por prefijo de nombre (--sky-*, --hill-*, --sea-*) para las secciones.`,
    ``,
    `## Técnicas de construcción exigidas`,
    `1. Capas apiladas con position:absolute e inset fijo; escena con position:relative`,
    `   y overflow:hidden para que nada se salga del lienzo.`,
    `2. Gradientes complejos: linear-gradient con 4+ paradas, radial-gradient para`,
    `   resplandores y conic-gradient + repeating-conic-gradient para rayos, brillos`,
    `   y texturas de rayado.`,
    `3. clip-path con polygon() para siluetas orgánicas (colinas, olas, velas).`,
    `   mask-image / -webkit-mask-image con gradientes para desvanecer bordes.`,
    `4. Pseudo-elementos ::before y ::after en al menos 8 selectores distintos,`,
    `   usando content:"" + transform + filter para duplicar formas sin añadir nodos.`,
    `5. Múltiples box-shadows en una sola declaración (3+ sombras) para profundidad,`,
    `   neblina y contornos de luz.`,
    `6. SVG embebido con <defs>, <linearGradient>, <path>, <use> y filter (feGaussianBlur)`,
    `   para elementos que el CSS puro haría mal: aves, reflejos finos, espuma.`,
    `7. Variable CSS usada dentro de calc() y dentro de transform, de modo que moverla`,
    `   reposicione la pieza en tiempo real sin reflow de la estructura.`,
    `8. Mezcla de modos con mix-blend-mode leído desde una variable type:select.`,
    `9. Filtro de grano y viñeta como capa final, opacidad regulable por variable.`,
    `10. Responsive dentro del iframe: la escena usa aspect-ratio y clamp() para que`,
    `    el render funcione a cualquier tamaño de lienzo.`,
    ``,
    `## Estructura de capas mínima (mínimo 4 niveles de anidación)`,
    `  .scene > .sky > .sun > .sun__rays            (radial + conic)`,
    `  .scene > .sky > .clouds > .cloud > .cloud__puff  (pseudo-elementos)`,
    `  .scene > .terrain > .hill--far|mid|near > .hill__ridge (clip-path)`,
    `  .scene > .sea > .wave > .wave__foam          (mask + box-shadow)`,
    `  .scene > .cast > .boat > .boat__sail         (SVG use + gradientes)`,
    `  .scene > .overlay > .grain / .vignette       (mix-blend-mode)`,
    ``,
    `## Restricciones de salida`,
    `  - Exactamente un bloque <style> en el head. Sin <link>, sin <script>.`,
    `  - Todas las medidas derivadas de variables vía calc(var(--x) * 1unit).`,
    `  - Ninguna regla con !important salvo los fallback de máscara.`,
    `  - El marcado debe ser HTML válido y profundo: no menos de 60 nodos.`,
    `  - Comentarios de sección en CSS (/*── Cielo ──*/) para legibilidad.`,
    ``,
    `## Objetivo visual`,
    `Composición del boceto con la paleta, temperatura de luz, dirección de la`,
    `iluminación y nivel de detalle de la referencia. Busca profundidad atmosférica:`,
    `planos separados por contraste, no por contorno.`,
  ].join('\n');

  return prompt;
}

/* ───────────────────────────────────────────────────────────
   generateCode(technicalPrompt) → string (documento HTML)
   ─────────────────────────────────────────────────────────── */
export async function generateCode(technicalPrompt) {
  await sleep(DELAY_GENERATE);

  // El prompt real condicionaría la salida; el mock sólo lo respeta en firma.
  void technicalPrompt;

  return DOC;
}

/* ═══════════════════════════════════════════════════════════
   Ilustración mock — "Costa al atardecer"
   Multi-capa, pseudo-elementos, clip-path, conic/radial,
   SVG embebido con defs/use, ~140 nodos.
   ═══════════════════════════════════════════════════════════ */
const DOC = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Costa al atardecer · CSS Sketch</title>
<style>
/* ════════════════════════════════════════════════════════
   VARIABLES MAESTRAS
   ════════════════════════════════════════════════════════ */
:root {
  /*── composición ──*/
  /*type:range|min:40|max:85|step:1|unit:%*/ --horizon: 62;
  /*type:range|min:0|max:100|step:1|unit:%*/ --scene-scale: 100;
  /*type:range|min:0|max:40|step:1|unit:px*/ --scene-radius: 14;

  /*── cielo ──*/
  /*type:color*/ --sky-top: #0a1a3f;
  /*type:color*/ --sky-mid: #3d3f86;
  /*type:color*/ --sky-low: #e0724a;
  /*type:range|min:0|max:360|step:1|unit:deg*/ --sky-angle: 168;

  /*── sol ──*/
  /*type:color*/ --sun-core: #fff1c2;
  /*type:color*/ --sun-halo: #ff9f45;
  /*type:range|min:20|max:80|step:1|unit:%*/ --sun-x: 63;
  /*type:range|min:5|max:70|step:1|unit:%*/ --sun-y: 34;
  /*type:range|min:40|max:340|step:4|unit:px*/ --sun-size: 176;
  /*type:range|min:0|max:100|step:1|unit:%*/ --sun-rays: 55;
  /*type:range|min:0|max:360|step:1|unit:deg*/ --sun-spin: 12;

  /*── nubes ──*/
  /*type:color*/ --cloud-hi: #ffd7b0;
  /*type:color*/ --cloud-lo: #7a4f7d;
  /*type:range|min:0|max:100|step:1|unit:%*/ --cloud-cover: 64;
  /*type:range|min:0|max:60|step:1|unit:px*/ --cloud-blur: 6;

  /*── estrellas ──*/
  /*type:color*/ --star-color: #eaf2ff;
  /*type:range|min:0|max:100|step:1|unit:%*/ --star-density: 40;
  /*type:range|min:0|max:100|step:1|unit:%*/ --star-glow: 70;

  /*── relieve ──*/
  /*type:color*/ --hill-far: #4a3c78;
  /*type:color*/ --hill-mid: #2e2a5e;
  /*type:color*/ --hill-near: #141536;
  /*type:range|min:8|max:34|step:1|unit:%*/ --hill-far-h: 22;
  /*type:range|min:8|max:34|step:1|unit:%*/ --hill-mid-h: 27;
  /*type:range|min:8|max:34|step:1|unit:%*/ --hill-near-h: 32;
  /*type:range|min:0|max:100|step:1|unit:%*/ --hill-haze: 38;

  /*── mar ──*/
  /*type:color*/ --sea-deep: #10203f;
  /*type:color*/ --sea-shallow: #2f5a7a;
  /*type:color*/ --sea-glint: #ffb469;
  /*type:range|min:0|max:100|step:1|unit:%*/ --wave-height: 46;
  /*type:range|min:0|max:100|step:1|unit:%*/ --glare-width: 58;

  /*── barco ──*/
  /*type:color*/ --boat-hull: #101426;
  /*type:color*/ --boat-sail: #ffe6cf;
  /*type:color*/ --boat-sail-shade: #d98b5f;
  /*type:range|min:4|max:22|step:1|unit:%*/ --boat-size: 11;
  /*type:range|min:5|max:60|step:1|unit:%*/ --boat-x: 34;
  /*type:range|min:0|max:100|step:1|unit:%*/ --boat-bob: 55;

  /*── aves ──*/
  /*type:color*/ --bird-ink: #101426;
  /*type:range|min:0|max:100|step:1|unit:%*/ --bird-count: 60;
  /*type:range|min:0|max:100|step:1|unit:%*/ --bird-spread: 70;

  /*── palmera ──*/
  /*type:color*/ --palm-ink: #0a0d1e;
  /*type:range|min:60|max:220|step:4|unit:px*/ --palm-height: 148;

  /*── acabado ──*/
  /*type:select|options:normal|screen|overlay|multiply|soft-light*/ --blend-mode: screen;
  /*type:range|min:0|max:100|step:1|unit:%*/ --grain-opacity: 22;
  /*type:range|min:0|max:100|step:1|unit:%*/ --vignette: 46;
  /*type:color*/ --vignette-ink: #04050d;
  /*type:text*/ --caption: "Costa Norte";
}

/* reset mínimo dentro del sandbox */
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  display: grid;
  place-items: center;
  background: #05060c;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
}

/* ════════════════════════════════════════════════════════
   ESCENA
   ════════════════════════════════════════════════════════ */
.scene {
  position: relative;
  width: min(100vw, 177.7vh);
  aspect-ratio: 16 / 9;
  max-height: 100vh;
  overflow: hidden;
  border-radius: calc(var(--scene-radius) * 1px);
  transform: scale(calc(var(--scene-scale) / 100));
  transform-origin: center;
  isolation: isolate;
  background: #05060c;
}
.scene > * { position: absolute; inset: 0; }

/* ─── Cielo ────────────────────────────────────────────── */
.sky {
  background:
    linear-gradient(
      calc(var(--sky-angle) * 1deg),
      var(--sky-top) 0%,
      var(--sky-mid) 44%,
      var(--sky-low) calc(var(--horizon) * 1%),
      var(--sky-low) 100%
    );
}
/* brillo atmosférico en el horizonte */
.sky::before {
  content: "";
  position: absolute;
  left: -10%; right: -10%;
  bottom: 0;
  height: calc((100 - var(--horizon)) * 1.6%);
  background:
    radial-gradient(120% 100% at 63% 100%,
      rgba(255, 176, 96, .75) 0%,
      rgba(255, 120, 70, .35) 38%,
      transparent 72%);
  filter: blur(calc(var(--cloud-blur) * 1px));
  pointer-events: none;
}
/* franja de light-pollution */
.sky::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: calc(var(--horizon) * 1%);
  background: repeating-linear-gradient(
    180deg,
    rgba(255,255,255,.028) 0 2px,
    transparent 2px 7px
  );
  mask-image: linear-gradient(transparent, #000 70%);
  -webkit-mask-image: linear-gradient(transparent, #000 70%);
}

/* ─── Sol ──────────────────────────────────────────────── */
.sun {
  position: absolute;
  inset: auto;
  left: calc(var(--sun-x) * 1%);
  top: calc(var(--sun-y) * 1%);
  width: calc(var(--sun-size) * 1px);
  height: calc(var(--sun-size) * 1px);
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 calc(var(--sun-size) * .45px) var(--sun-halo));
}
.sun__core {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 34%,
    #fffdf2 0%, var(--sun-core) 42%, var(--sun-halo) 100%);
  box-shadow:
    0 0 0 6px rgba(255, 235, 190, .18),
    0 0 42px 10px rgba(255, 159, 69, .55),
    inset -14px -18px 40px rgba(226, 110, 45, .55);
}
.sun__halo {
  position: absolute;
  inset: -45%;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 168, 76, .62) 0%,
    rgba(255, 130, 70, .28) 45%,
    transparent 70%);
  mix-blend-mode: var(--blend-mode);
}
.sun__rays {
  position: absolute;
  inset: -70%;
  border-radius: 50%;
  opacity: calc(var(--sun-rays) / 100);
  transform: rotate(calc(var(--sun-spin) * 1deg));
  background:
    repeating-conic-gradient(from 0deg,
      rgba(255, 214, 150, .55) 0deg 2deg,
      transparent 2deg 14deg);
  mask-image: radial-gradient(circle, transparent 26%, #000 38%, transparent 68%);
  -webkit-mask-image: radial-gradient(circle, transparent 26%, #000 38%, transparent 68%);
  mix-blend-mode: var(--blend-mode);
}

/* ─── Estrellas ────────────────────────────────────────── */
.stars {
  position: absolute;
  inset: 0 0 auto 0;
  height: calc(var(--horizon) * .72%);
  opacity: calc(var(--star-density) / 100);
}
.stars span {
  position: absolute;
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--star-color);
  box-shadow:
    0 0 calc(var(--star-glow) * .12px) calc(var(--star-glow) * .03px) var(--star-color),
    0 0 2px 1px rgba(255,255,255,.35);
  animation: twinkle 4.2s ease-in-out infinite;
}
.stars span:nth-child(1) { left: 7%;  top: 12%; animation-delay: 0s;   }
.stars span:nth-child(2) { left: 16%; top: 34%; animation-delay: .7s;  transform: scale(.7); }
.stars span:nth-child(3) { left: 25%; top: 8%;  animation-delay: 1.4s; transform: scale(1.2); }
.stars span:nth-child(4) { left: 37%; top: 26%; animation-delay: .3s;  transform: scale(.6); }
.stars span:nth-child(5) { left: 48%; top: 11%; animation-delay: 2.1s; }
.stars span:nth-child(6) { left: 74%; top: 9%;  animation-delay: 1.1s; transform: scale(.8); }
.stars span:nth-child(7) { left: 84%; top: 28%; animation-delay: 1.8s; transform: scale(1.3); }
.stars span:nth-child(8) { left: 93%; top: 15%; animation-delay: .5s;  transform: scale(.7); }
.stars span:nth-child(9) { left: 58%; top: 33%; animation-delay: 2.6s; transform: scale(.55); }
@keyframes twinkle { 50% { opacity: .25; } }

/* ─── Nubes ────────────────────────────────────────────── */
.clouds {
  position: absolute;
  inset: 0;
  opacity: calc(var(--cloud-cover) / 100);
  filter: blur(calc(var(--cloud-blur) * 1px));
}
.cloud { position: absolute; width: 27%; height: 8%; }
.cloud::before,
.cloud::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--cloud-hi), var(--cloud-lo));
}
.cloud::before { left: 12%; top: -70%; width: 46%; height: 190%; }
.cloud::after  { left: 44%; top: -34%; width: 36%; height: 140%; }
.cloud > span {
  position: absolute;
  left: 0; bottom: 0;
  width: 100%; height: 62%;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--cloud-hi) 0%, var(--cloud-lo) 100%);
  box-shadow:
    0 8px 22px -8px rgba(20, 12, 40, .75),
    inset 0 -6px 14px -6px rgba(60, 30, 80, .7);
}
.cloud--a { left: 4%;  top: 16%; transform: scale(1.15); }
.cloud--b { left: 46%; top: 11%; transform: scale(.82); }
.cloud--c { left: 70%; top: 25%; transform: scale(1.05); }
.cloud--d { left: 26%; top: 30%; transform: scale(.66); opacity: .8; }

/* ─── Relieve (3 planos + clip-path) ───────────────────── */
.terrain { pointer-events: none; }
.hill {
  position: absolute;
  left: -4%; right: -4%;
  bottom: calc((100 - var(--horizon)) * 1%);
}
.hill__ridge { position: absolute; inset: auto 0 0 0; }

.hill--far {
  height: calc(var(--hill-far-h) * 1%);
  opacity: calc(.45 + var(--hill-haze) / 200);
}
.hill--far .hill__ridge {
  height: 100%;
  background: var(--hill-far);
  clip-path: polygon(
    0% 100%, 0% 64%, 7% 42%, 14% 58%, 22% 30%, 31% 52%,
    40% 24%, 49% 47%, 57% 33%, 66% 55%, 74% 36%, 83% 57%,
    91% 44%, 100% 61%, 100% 100%);
}
.hill--far .hill__ridge::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 214, 176, .55), transparent 55%);
  clip-path: inherit;
  opacity: calc(var(--hill-haze) / 100);
  mix-blend-mode: var(--blend-mode);
}

.hill--mid { height: calc(var(--hill-mid-h) * 1%); opacity: .9; }
.hill--mid .hill__ridge {
  height: 100%;
  background: linear-gradient(180deg, var(--hill-mid), #1d1b46);
  clip-path: polygon(
    0% 100%, 0% 72%, 9% 50%, 17% 66%, 26% 38%, 35% 60%,
    46% 34%, 55% 56%, 63% 41%, 72% 63%, 81% 47%, 90% 66%,
    100% 52%, 100% 100%);
}
.hill--mid .hill__ridge::before {
  content: "";
  position: absolute;
  left: 26%; top: 34%;
  width: 11%; height: 46%;
  background: rgba(255, 234, 205, .5);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  filter: blur(3px);
  mix-blend-mode: var(--blend-mode);
}

.hill--near { height: calc(var(--hill-near-h) * 1%); }
.hill--near .hill__ridge {
  height: 100%;
  background: linear-gradient(180deg, var(--hill-near) 0%, #090a20 100%);
  clip-path: polygon(
    0% 100%, 0% 80%, 6% 63%, 13% 74%, 21% 55%, 29% 70%,
    37% 58%, 44% 72%, 52% 64%, 60% 77%, 68% 68%, 77% 80%,
    85% 71%, 93% 83%, 100% 76%, 100% 100%);
}
.hill--near .hill__ridge::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 34%;
  background: repeating-linear-gradient(
    94deg,
    rgba(120, 140, 210, .16) 0 3px,
    transparent 3px 9px);
  mask-image: linear-gradient(transparent, #000);
  -webkit-mask-image: linear-gradient(transparent, #000);
}

/* ─── Mar ──────────────────────────────────────────────── */
.sea { inset: auto 0 0 0; height: calc((100 - var(--horizon)) * 1%); }
.sea::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg,
      var(--sea-shallow) 0%,
      var(--sea-deep) 46%,
      #070c1c 100%),
    repeating-linear-gradient(
      180deg,
      rgba(255,255,255,.03) 0 1px,
      transparent 1px 10px);
}
/* reflejo del sol sobre el agua */
.sea::after {
  content: "";
  position: absolute;
  left: calc(var(--sun-x) * 1%);
  top: 0;
  width: calc(var(--glare-width) * 1%);
  height: 100%;
  transform: translateX(-50%);
  background:
    linear-gradient(180deg,
      rgba(255, 190, 120, .85) 0%,
      rgba(255, 150, 90, .35) 40%,
      transparent 92%);
  mask-image:
    repeating-linear-gradient(180deg,
      #000 0 2px, transparent 2px 7px, #000 7px 9px, transparent 9px 16px),
    linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  -webkit-mask-image:
    repeating-linear-gradient(180deg,
      #000 0 2px, transparent 2px 7px, #000 7px 9px, transparent 9px 16px),
    linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
  filter: blur(3px);
  opacity: .45;
  mix-blend-mode: var(--blend-mode);
}

.wave {
  position: absolute;
  left: -6%; right: -6%;
  height: calc(var(--wave-height) * .34%);
  border-radius: 50%;
  background: linear-gradient(180deg,
    rgba(150, 200, 240, .5), rgba(60, 110, 160, .12));
  box-shadow:
    0 -1px 0 rgba(255, 226, 190, .18),
    0 6px 16px -8px rgba(0, 0, 0, .8),
    inset 0 2px 6px -2px rgba(255,255,255,.25);
}
.wave:nth-of-type(1) { top: 6%;  opacity: .55; transform: scaleX(1.1); }
.wave:nth-of-type(2) { top: 22%; opacity: .7;  transform: scaleX(.9); }
.wave:nth-of-type(3) { top: 40%; opacity: .8;  }
.wave:nth-of-type(4) { top: 58%; opacity: .9;  transform: scaleX(1.08); }
.wave:nth-of-type(5) { top: 76%; opacity: 1;   transform: scaleX(.96); }
.wave__foam {
  position: absolute;
  left: 10%; right: 10%; top: -40%;
  height: 60%;
  border-radius: 50%;
  background: rgba(255, 240, 220, .18);
  filter: blur(9px);
}

/* ─── Barco ────────────────────────────────────────────── */
.cast { pointer-events: none; }
.boat {
  position: absolute;
  inset: auto;
  left: calc(var(--boat-x) * 1%);
  bottom: calc((100 - var(--horizon)) * 1% + 6%);
  width: calc(var(--boat-size) * 1.6%);
  height: calc(var(--boat-size) * 2.4%);
  transform: translateX(-50%)
    rotate(calc((var(--boat-bob) - 50) * .06deg));
  animation: bob 5.5s ease-in-out infinite;
  filter: drop-shadow(0 10px 12px rgba(0,0,0,.55));
}
@keyframes bob {
  0%, 100% { translate: 0 0; }
  50%      { translate: 0 -6px; }
}
.boat__mast {
  position: absolute;
  left: 50%; bottom: 30%;
  width: 3px; height: 62%;
  background: var(--boat-hull);
  transform: translateX(-50%);
}
.boat__sail {
  position: absolute;
  left: 52%; bottom: 34%;
  width: 46%; height: 54%;
  background: linear-gradient(135deg, var(--boat-sail) 0%, var(--boat-sail-shade) 100%);
  clip-path: polygon(0 0, 100% 88%, 0 100%);
  box-shadow: inset -8px -6px 18px -8px rgba(120, 50, 30, .7);
}
.boat__sail::after {
  content: "";
  position: absolute;
  inset: 12% 0 0 18%;
  background: linear-gradient(180deg, transparent 40%, rgba(120,60,40,.35));
  clip-path: polygon(0 0, 100% 88%, 0 100%);
}
.boat__jib {
  position: absolute;
  left: 8%; bottom: 34%;
  width: 34%; height: 42%;
  background: linear-gradient(200deg, var(--boat-sail) 0%, var(--boat-sail-shade) 100%);
  clip-path: polygon(100% 0, 100% 100%, 0 92%);
  opacity: .92;
}
.boat__hull {
  position: absolute;
  left: 0; right: 0; bottom: 12%;
  height: 26%;
  background: linear-gradient(180deg, var(--boat-hull), #05070f);
  clip-path: polygon(0 0, 100% 0, 84% 100%, 16% 100%);
  box-shadow: 0 6px 14px -6px rgba(0,0,0,.9);
}
.boat__hull::after {
  content: "";
  position: absolute;
  left: 14%; right: 14%; top: 24%;
  height: 22%;
  background: rgba(255, 200, 150, .55);
  clip-path: polygon(0 0, 100% 0, 92% 100%, 8% 100%);
}
.boat__wake {
  position: absolute;
  left: -30%; right: -30%; bottom: 0;
  height: 18%;
  background: radial-gradient(60% 100% at 50% 0%,
    rgba(255, 226, 190, .7), transparent 70%);
  filter: blur(3px);
  mask-image: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 18px);
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 18px);
}

/* ─── Aves (SVG embebido) ──────────────────────────────── */
.birds {
  inset: auto;
  left: 4%;
  top: 12%;
  width: 46%;
  height: 34%;
  overflow: visible;
}
.birds .flock {
  opacity: calc(var(--bird-count) / 100);
  transform: translateX(calc(var(--bird-spread) * .4%));
}
.birds path {
  fill: none;
  stroke: var(--bird-ink);
  stroke-width: 2.4;
  stroke-linecap: round;
  filter: drop-shadow(0 2px 3px rgba(255, 200, 150, .35));
}
.birds .gull--soft path { stroke-width: 1.6; opacity: .65; }

/* ─── Palmera en primer plano ──────────────────────────── */
.palm {
  inset: auto;
  left: -2%;
  bottom: 0;
  height: calc(var(--palm-height) * 1px);
  width: auto;
  aspect-ratio: 1 / 1.4;
  overflow: visible;
  filter: drop-shadow(6px 4px 10px rgba(0,0,0,.6));
}
.palm__trunk {
  position: absolute;
  left: 34%; bottom: 0;
  width: 9%; height: 76%;
  background: linear-gradient(90deg, #05060f, var(--palm-ink) 55%, #1a1730);
  border-radius: 40% 60% 0 0 / 8% 12% 0 0;
  transform: rotate(7deg);
  transform-origin: bottom center;
}
.palm__trunk::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    180deg, transparent 0 9px, rgba(255,255,255,.07) 9px 11px);
  border-radius: inherit;
}
.palm__crown {
  position: absolute;
  left: 30%; top: 8%;
  width: 66%; height: 46%;
}
.palm__crown span {
  position: absolute;
  left: 50%; top: 50%;
  width: 96%; height: 26%;
  background: linear-gradient(90deg, var(--palm-ink), #191a3a);
  border-radius: 60% 8% 60% 8% / 80% 20% 80% 20%;
  transform-origin: 0% 50%;
  clip-path: polygon(0 40%, 30% 0, 66% 14%, 100% 42%, 70% 52%, 96% 74%, 60% 66%, 30% 86%, 12% 62%);
}
.palm__crown span:nth-child(1) { transform: rotate(-108deg); }
.palm__crown span:nth-child(2) { transform: rotate(-64deg);  }
.palm__crown span:nth-child(3) { transform: rotate(-22deg);  }
.palm__crown span:nth-child(4) { transform: rotate(18deg);   }
.palm__crown span:nth-child(5) { transform: rotate(60deg);   }
.palm__crown span:nth-child(6) { transform: rotate(104deg);  }
.palm__crown span:nth-child(7) { transform: rotate(148deg);  }
.palm__coconut {
  position: absolute;
  left: 44%; top: 46%;
  width: 15%; aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #2b2748, #0a0b18);
  box-shadow: 0 4px 8px -3px #000;
}

/* ─── Acabado ──────────────────────────────────────────── */
.grain {
  opacity: calc(var(--grain-opacity) / 100);
  mix-blend-mode: overlay;
  background-image:
    repeating-radial-gradient(circle at 17% 32%,
      rgba(255,255,255,.5) 0 1px, transparent 1px 3px),
    repeating-radial-gradient(circle at 71% 68%,
      rgba(0,0,0,.55) 0 1px, transparent 1px 4px);
  background-size: 7px 7px, 9px 9px;
  pointer-events: none;
}
.vignette {
  opacity: calc(var(--vignette) / 100);
  background: radial-gradient(120% 96% at 50% 46%,
    transparent 42%, var(--vignette-ink) 100%);
  pointer-events: none;
}
.caption {
  inset: auto auto 4.5% 4%;
  font-size: clamp(11px, 1.4vw, 16px);
  letter-spacing: .34em;
  text-transform: uppercase;
  color: rgba(255, 236, 214, .82);
  text-shadow: 0 2px 12px rgba(0,0,0,.8);
  padding-left: 12px;
  border-left: 2px solid rgba(255, 180, 110, .7);
}
.caption::before { content: var(--caption); }
</style>
</head>
<body>

<div class="scene">

  <!-- ── Cielo ─────────────────────────────────────────── -->
  <div class="sky">
    <div class="stars">
      <span></span><span></span><span></span><span></span><span></span>
      <span></span><span></span><span></span><span></span>
    </div>

    <div class="sun">
      <div class="sun__rays"></div>
      <div class="sun__halo"></div>
      <div class="sun__core"></div>
    </div>

    <div class="clouds">
      <div class="cloud cloud--a"><span></span></div>
      <div class="cloud cloud--b"><span></span></div>
      <div class="cloud cloud--c"><span></span></div>
      <div class="cloud cloud--d"><span></span></div>
    </div>
  </div>

  <!-- ── Relieve ───────────────────────────────────────── -->
  <div class="terrain">
    <div class="hill hill--far"><div class="hill__ridge"></div></div>
    <div class="hill hill--mid">
      <div class="hill__ridge">
        <svg width="0" height="0" aria-hidden="true">
          <defs>
            <linearGradient id="ridgeGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#ffd9ab" stop-opacity=".6"/>
              <stop offset="100%" stop-color="#ffd9ab" stop-opacity="0"/>
            </linearGradient>
            <filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
          </defs>
        </svg>
      </div>
    </div>
    <div class="hill hill--near"><div class="hill__ridge"></div></div>
  </div>

  <!-- ── Mar ───────────────────────────────────────────── -->
  <div class="sea">
    <div class="wave"><div class="wave__foam"></div></div>
    <div class="wave"><div class="wave__foam"></div></div>
    <div class="wave"><div class="wave__foam"></div></div>
    <div class="wave"><div class="wave__foam"></div></div>
    <div class="wave"><div class="wave__foam"></div></div>
  </div>

  <!-- ── Barco ─────────────────────────────────────────── -->
  <div class="cast">
    <div class="boat">
      <div class="boat__mast"></div>
      <div class="boat__sail"></div>
      <div class="boat__jib"></div>
      <div class="boat__hull"></div>
      <div class="boat__wake"></div>
    </div>
  </div>

  <!-- ── Aves ──────────────────────────────────────────── -->
  <svg class="birds" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
    <defs>
      <path id="gull" d="M0 10 Q10 0 20 10 Q30 0 40 10" />
      <g id="gullSoft">
        <path d="M0 8 Q9 0 18 8 Q27 0 36 8"/>
      </g>
    </defs>
    <g class="flock">
      <g class="gull"><use href="#gull" x="24"  y="30" transform="scale(1.05)"/></g>
      <g class="gull"><use href="#gull" x="78"  y="14" transform="scale(.8)"/></g>
      <g class="gull gull--soft"><use href="#gullSoft" x="122" y="48" transform="scale(1.2)"/></g>
      <g class="gull"><use href="#gull" x="168" y="22" transform="scale(.65)"/></g>
      <g class="gull gull--soft"><use href="#gullSoft" x="206" y="60" transform="scale(.95)"/></g>
      <g class="gull"><use href="#gull" x="252" y="18" transform="scale(1.1)"/></g>
      <g class="gull gull--soft"><use href="#gullSoft" x="300" y="44" transform="scale(.75)"/></g>
      <g class="gull"><use href="#gull" x="336" y="70" transform="scale(.9)"/></g>
      <g class="gull"><use href="#gull" x="44"  y="86" transform="scale(.6)"/></g>
      <g class="gull gull--soft"><use href="#gullSoft" x="150" y="104" transform="scale(.7)"/></g>
      <g class="gull"><use href="#gull" x="268" y="112" transform="scale(.55)"/></g>
      <g class="gull"><use href="#gull" x="366" y="34" transform="scale(.85)"/></g>
    </g>
  </svg>

  <!-- ── Palmera ───────────────────────────────────────── -->
  <div class="palm">
    <div class="palm__crown">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span><span></span>
      <div class="palm__coconut"></div>
    </div>
    <div class="palm__trunk"></div>
  </div>

  <!-- ── Acabado ───────────────────────────────────────── -->
  <div class="grain"></div>
  <div class="vignette"></div>
  <div class="caption"></div>

</div>

</body>
</html>`;
