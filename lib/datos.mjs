// Precios de la tienda. Se actualizan en la rama "datos" del repo (Netlify no la publica,
// así que actualizar precios no gasta créditos). Si no se puede leer, usa los de la página publicada.
export const DATOS_URL = "https://raw.githubusercontent.com/agustinoramonecristaldo-jpg/proveeduriavirtual/datos/productos.json";

const valido = d => d && Array.isArray(d.p) && d.p.length > 100 && Array.isArray(d.cats);

export async function leerDatos(site) {
  try {
    const r = await fetch(DATOS_URL + "?t=" + Date.now(), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      if (valido(d)) return d;
    }
  } catch {}
  const html = await (await fetch(site + "/", { headers: { "cache-control": "no-cache" } })).text();
  const m = html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}
