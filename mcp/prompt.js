/* ═══════════════════════════════════════════════════════════
   prompt.js — Prompt Técnico Maestro
   Fuente única de verdad del contrato que el LLM debe seguir
   para generar CSS Art parseable por js/parser.js.
   Compartido por: MCP stdio, MCP HTTP y el mock del navegador.
   ═══════════════════════════════════════════════════════════ */

/**
 * @param {object} entradas
 * @param {string} entradas.sketch  etiqueta del boceto (estructura)
 * @param {string} entradas.ref     etiqueta de la referencia (estilo)
 * @param {string} [entradas.hint]  indicación opcional del usuario
 * @returns {string} prompt completo en texto plano
 */
export function buildPrompt({ sketch, ref, hint }) {
  const lines = [
    `# PROMPT TÉCNICO MAESTRO — CSSketch`,
    ``,
    `## Entradas`,
    `- Estructura (boceto): ${sketch || '(sin archivo)'}`,
    `- Estilo (referencia): ${ref || '(sin archivo)'}`,
  ];

  if (hint) {
    lines.push(`- Indicación: ${hint}`);
  }

  lines.push(
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
    `planos separados por contraste, no por contorno.`
  );

  return lines.join('\n');
}

export default buildPrompt;
