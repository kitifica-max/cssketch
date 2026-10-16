# CSSketch

Ilustraciones **CSS Art** generadas y editadas con IA. HTML5 + CSS3 + Vanilla JS, sin frameworks, sin backend, sin storage.

Un solo documento HTML autocontenido (`<style>` + `<marking>`) con un bloque `:root` paramétrico. La UI parsea las variables y genera controles en vivo para reeditar la ilustración.

## Modos de uso

### 1. Web (local)

```bash
npm run dev          # sirve en http://localhost:8080
```

Abre `http://localhost:8080`, sube boceto + referencia, genera el prompt, construye y edita en el workspace.

> Los ES Modules no corren bajo `file://`; sirve siempre por HTTP.

### 2. MCP stdio (Claude Code y clientes locales)

Herramientas que leen/escriben en tu disco y sirven un preview local:

| Tool | Hace |
|------|------|
| `cssketch_start(sketch_path?, ref_path?, hint?)` | Prompt isométrico (cuadrícula 30°, orden de capas). Referencia opcional, no tiene que ser isométrica; sin imágenes basta `hint` |
| `cssketch_save(name, html)` | Valida, escribe en `~/cssketch/artes/<name>.html`, arranca preview |
| `cssketch_validate(html)` | Valida contra el contrato + manifest de variables |
| `cssketch_list()` | Lista los artes guardados |
| `cssketch_open(name?)` | Abre el preview en el browser |

Registro en `~/.claude.json`:

```json
{
  "mcpServers": {
    "cssketch": {
      "command": "node",
      "args": ["/ruta/a/CSSketch/mcp/index.js"]
    }
  }
}
```

### 3. MCP HTTP (remoto, stateless)

`https://ccsketch.kitifica.com/mcp` — Streamable HTTP, sin storage.

| Tool | Hace |
|------|------|
| `cssketch_prompt(sketch, ref, hint?)` | Devuelve el Prompt Técnico Maestro |
| `cssketch_validate(html)` | Valida + manifest + `uiUrl` con el arte embebido en `#d=<base64>` |
| `cssketch_start(sketch_b64?, ref_b64?, hint?)` | Devuelve prompt + imágenes; el cliente (Claude Code) genera el HTML. Sin API de IA en el servidor |

Registro:

```json
{
  "mcpServers": {
    "cssketch-remote": {
      "type": "http",
      "url": "https://ccsketch.kitifica.com/mcp"
    }
  }
}
```

### Fragmentos de URL (abrir un arte sin storage)

- `#arte=<nombre>` — el preview local sirve `~/cssketch/artes/<nombre>.html`
- `#d=<base64url>` — HTML embebido en la URL (Netlify / enlaces compartibles)

## Contrato de generación

Toda ilustración debe ser un único documento HTML autocontenido:

- Un bloque `<style>`, sin `<link>`, `<script>`, `<img>` ni `url()` externas
- Variables en `:root` con anotación semántica:

```css
:root {
  /*type:color*/ --sky-top: #0b1d3a;
  /*type:range|min:0|max:100|step:1|unit:%*/ --horizon: 62;
  /*type:select|options:normal|screen|overlay*/ --blend-mode: screen;
  /*type:text*/ --caption: "Costa Norte";
}
```

El valor de un `range` es **numérico puro**; la unidad se aplica al consumirlo (`calc(var(--x) * 1%)`).

El Prompt Técnico Maestro completo está en [`mcp/prompt.js`](mcp/prompt.js).

## Estructura

```
index.html              UI (4 pasos)
css/styles.css          tokens + layout
js/
  parser.js             extrae variables de :root (DOM-free, compartible)
  renderer.js           monta el doc en un iframe aislado + overrides
  ui.js                 entrypoint: drag&drop, pasos, controles
  art-loader.js         decodifica #arte= / #d=
  api-mock.js           modo demo sin backend
mcp/
  index.js              servidor stdio
  prompt.js             Prompt Técnico Maestro
  validate.js           validador + manifest + fragmentos
  preview.js            servidor local de preview
netlify/functions/
  mcp.js                MCP HTTP stateless
```

## Variables de entorno (solo la function HTTP)

- `URL` — base del `uiUrl` devuelto por validate/generate

## Desarrollo

```bash
npm install
npm run mcp           # arranca el MCP stdio
npm run dev           # sirve la UI
```
