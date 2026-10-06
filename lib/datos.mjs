// Precios de la tienda: los que se suben desde el panel (guardados en Netlify, store "tienda").
// Respaldo: los que vienen dentro de la página publicada.
// Ninguna de estas actualizaciones requiere volver a publicar la tienda.
import { getStore } from "@netlify/blobs";

const valido = d => d && Array.isArray(d.p) && d.p.length > 100 && Array.isArray(d.cats);

export async function leerDatos(site) {
  const store = getStore("tienda");
  const [blob, cfg] = await Promise.all([
    store.get("productos", { type: "json" }).catch(() => null),
    store.get("config", { type: "json" }).catch(() => null),
  ]);
  let D = valido(blob) ? blob : null;
  if (!D) {
    const html = await (await fetch(site + "/", { headers: { "cache-control": "no-cache" } })).text();
    const m = html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s);
    D = m ? JSON.parse(m[1]) : null;
  }
  if (D && cfg?.wa) D = { ...D, wa: cfg.wa };
  return D;
}
