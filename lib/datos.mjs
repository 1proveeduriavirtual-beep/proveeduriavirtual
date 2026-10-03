// Precios de la tienda. Se usa la versión más nueva entre:
//  1) la que se sube desde el panel (guardada en Netlify, store "tienda")
//  2) la rama "datos" de GitHub (actualización automática con Claude, opcional)
//  3) la que viene dentro de la página publicada (respaldo)
// Ninguna de estas actualizaciones requiere volver a publicar la tienda.
import { getStore } from "@netlify/blobs";
import { fechaNum } from "./precios.mjs";

export const DATOS_URL = "https://raw.githubusercontent.com/agustinoramonecristaldo-jpg/proveeduriavirtual/datos/productos.json";

const valido = d => d && Array.isArray(d.p) && d.p.length > 100 && Array.isArray(d.cats);

export async function leerDatos(site) {
  const store = getStore("tienda");
  const [blob, cfg, gh] = await Promise.all([
    store.get("productos", { type: "json" }).catch(() => null),
    store.get("config", { type: "json" }).catch(() => null),
    fetch(DATOS_URL + "?t=" + Date.now(), { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  let D = null;
  for (const c of [blob, gh]) if (valido(c) && (!D || fechaNum(c.fecha) > fechaNum(D.fecha))) D = c;
  if (!D) {
    const html = await (await fetch(site + "/", { headers: { "cache-control": "no-cache" } })).text();
    const m = html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s);
    D = m ? JSON.parse(m[1]) : null;
  }
  if (D && cfg?.wa) D = { ...D, wa: cfg.wa };
  return D;
}
