/* ═══════════════════════════════════════════════════════════
   art-loader.js
   Carga un CSS Art desde el fragmento de la URL, sin storage.

   Soporta dos modos:
     #arte=<name>     → fetch a /arte/<name> (preview local, sin codificar)
     #d=<base64url>   → HTML embebido en la URL (Netlify / sin servidor)

   Devuelve { html, name } o null. No toca el DOM de la UI:
   quien monta el documento es ui.js.
   ═══════════════════════════════════════════════════════════ */

/** Decodifica base64url → UTF-8 string (navegador). */
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  // binario → Uint8Array → TextDecoder para UTF-8 correcto
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Codifica string UTF-8 → base64url (para el MCP o enlaces). */
export function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Lee el fragmento actual y devuelve el arte embebido, si lo hay.
 * @param {string} [hash] por defecto location.hash
 * @returns {Promise<{html:string, name:string}|null>}
 */
export async function loadArtFromHash(hash = location.hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!h) return null;

  // modo local con nombre: #arte=costa-atardecer
  const named = /(?:^|&)arte=([^&]+)/.exec(h);
  if (named) {
    const name = decodeURIComponent(named[1]);
    try {
      const res = await fetch(`/arte/${encodeURIComponent(name)}.html`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { html: await res.text(), name };
    } catch (err) {
      console.warn(`[art-loader] no se pudo cargar /arte/${name}:`, err.message);
      return null;
    }
  }

  // modo inline: #d=<base64url>
  const inline = /(?:^|&)d=([A-Za-z0-9_-]+)/.exec(h);
  if (inline) {
    try {
      return { html: b64urlDecode(inline[1]), name: '(embebido)' };
    } catch (err) {
      console.warn('[art-loader] no se pudo decodificar #d=:', err.message);
      return null;
    }
  }

  return null;
}

export default loadArtFromHash;
