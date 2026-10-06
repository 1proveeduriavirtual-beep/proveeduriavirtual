// Catálogo de la tienda:
//  1) los productos de Maxiconsumo que se actualizan solos (store "tienda", clave "productos")
//  2) + los productos propios cargados o importados en el panel (store "inventario", clave "propios")
//  3) + las promociones armadas en el panel (store "tienda", clave "promos"), que bajan el precio y lo marcan como oferta
// Respaldo: los que vienen dentro de la página publicada.
// Ninguna de estas actualizaciones requiere volver a publicar la tienda.
import { getStore } from "@netlify/blobs";

const valido = d => d && Array.isArray(d.p) && d.p.length > 100 && Array.isArray(d.cats);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const r10 = n => Math.ceil(n / 10) * 10;
export const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// Una promo vale hoy si está activa y dentro de sus fechas
export const promoVigente = (pr, hoy = hoyAR()) => pr && pr.activa !== false && (!pr.desde || pr.desde <= hoy) && (!pr.hasta || pr.hasta >= hoy) && pr.pct > 0;

// Agrega productos propios y aplica promos sobre una copia de D
export function armarCatalogo(D, propios = [], promos = [], stock = {}) {
  if (!D) return D;
  const cats = [...(D.cats || [])];
  const p = (D.p || []).map(r => r.slice());
  const ci = n => { let i = cats.indexOf(n); if (i < 0) { cats.push(n); i = cats.length - 1; } return i; };
  for (const x of propios || []) {
    if (x.activo === false || !(x.pu > 0 || x.pb > 0)) continue;
    const s = stock[x.sku];
    if (s && !(s.c > 0) && !x.sinStock) continue; // propio sin stock: no se muestra (salvo que se venda igual)
    const bu = Math.max(1, Math.floor(+x.bu || 1));
    p.push([ci(String(x.cat || "otros").toLowerCase()), String(x.sku), esc(x.nombre), Math.round(+x.pu || +x.pb || 0), bu > 1 && x.pb > 0 ? Math.round(+x.pb) * bu : 0, bu, /^https:\/\//.test(x.foto || "") ? x.foto : "", 0, 0, 0]);
  }
  const hoy = hoyAR(), vig = (promos || []).filter(pr => promoVigente(pr, hoy));
  if (vig.length) {
    for (const r of p) {
      const cat = cats[r[0]];
      let best = null;
      for (const pr of vig) {
        const ok = (pr.skus || []).includes(r[1]) || (pr.cats || []).includes(cat) || (!(pr.skus || []).length && !(pr.cats || []).length);
        if (ok && (!best || pr.pct > best.pct)) best = pr;
      }
      if (!best) continue;
      const f = 1 - best.pct / 100;
      if (best.modo !== "bulto") { const a = r[3]; r[3] = r10(a * f); r[7] = Math.max(r[7] || 0, a); }
      if (best.modo !== "unidad" && r[4] > 0) { const a = r[4]; r[4] = r10(a / r[5] * f) * r[5]; r[8] = Math.max(r[8] || 0, a); }
      r[10] = best.nombre || "";
    }
  }
  return { ...D, cats, p };
}

// crudo: solo lo de Maxiconsumo (para comparar al actualizar precios)
export async function leerDatos(site, { crudo = false } = {}) {
  const T = getStore("tienda"), I = getStore("inventario");
  const [blob, cfg, propios, promos, stock] = await Promise.all([
    T.get("productos", { type: "json" }).catch(() => null),
    T.get("config", { type: "json" }).catch(() => null),
    crudo ? null : I.get("propios", { type: "json" }).catch(() => null),
    crudo ? null : T.get("promos", { type: "json" }).catch(() => null),
    crudo ? null : I.get("stock", { type: "json" }).catch(() => null),
  ]);
  let D = valido(blob) ? blob : null;
  if (!D) {
    const html = await (await fetch(site + "/", { headers: { "cache-control": "no-cache" } })).text();
    const m = html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s);
    D = m ? JSON.parse(m[1]) : null;
  }
  if (D && cfg?.wa) D = { ...D, wa: cfg.wa };
  return crudo ? D : armarCatalogo(D, propios || [], promos || [], stock || {});
}
