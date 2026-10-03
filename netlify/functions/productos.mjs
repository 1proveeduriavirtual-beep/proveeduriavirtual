// Precios de la tienda guardados en Netlify (se actualizan desde el panel, sin volver a publicar la tienda).
//   GET  /.netlify/functions/productos            -> { datos, wa }  (público, lo usa la tienda)
//   POST /.netlify/functions/productos?k=CLAVE     -> { archivo, margen } o { wa }  (panel)
import { getStore } from "@netlify/blobs";
import { parseMaxi, fechaHoy } from "../../lib/precios.mjs";
import { leerDatos } from "../../lib/datos.mjs";

const J = (o, s = 200, cache = "no-store") => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": cache } });

export default async (req) => {
  const store = getStore("tienda");
  const url = new URL(req.url);
  if (req.method === "GET" && !url.searchParams.get("k")) {
    const [datos, cfg] = await Promise.all([store.get("productos", { type: "json" }), store.get("config", { type: "json" })]);
    return J({ datos: datos || null, wa: cfg?.wa || null }, 200, "public, max-age=60");
  }
  const key = Netlify.env.get("ADMIN_KEY");
  if (!key || url.searchParams.get("k") !== key) return J({ error: "clave incorrecta" }, 401);
  const cfg = (await store.get("config", { type: "json" })) || {};
  const site = url.origin;

  if (req.method === "GET") { // panel: estado actual
    const D = await leerDatos(site);
    return J({ fecha: D?.fecha, productos: D?.p?.length || 0, margen: cfg.margen ?? D?.margen ?? 60, wa: cfg.wa || D?.wa || "" });
  }
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }

  if (b.wa !== undefined) {
    const wa = String(b.wa).replace(/\D/g, "");
    if (wa.length < 10 || wa.length > 15) return J({ error: "El WhatsApp tiene que ir con 549 + código de área + número, sin espacios. Ej: 5491123456789" }, 400);
    cfg.wa = wa;
    await store.setJSON("config", cfg);
    if (!b.archivo) return J({ ok: true, wa });
  }

  if (b.archivo) {
    const margen = Number(b.margen ?? cfg.margen ?? 60);
    if (!(margen >= 0 && margen <= 500)) return J({ error: "Poné un margen de ganancia entre 0 y 500 %." }, 400);
    const actual = await leerDatos(site);
    let nuevo;
    try { nuevo = parseMaxi(b.archivo, margen, actual?.cats || []); } catch (e) { return J({ error: e.message }, 400); }
    if (nuevo.p.length < 100) return J({ error: `El archivo trae solo ${nuevo.p.length} productos. Puede que la sesión de Maxi esté vencida: entrá a Maxi, volvé a tocar el marcador y subilo de nuevo.` }, 400);
    const n0 = actual?.p?.length || 0;
    if (n0 && !b.forzar && (nuevo.p.length < 0.8 * n0 || nuevo.p.length > 1.5 * n0))
      return J({ error: `Ojo: la tienda tenía ${n0} productos y el archivo trae ${nuevo.p.length}. Si estás seguro, tildá "Forzar" y volvé a subirlo.`, confirmar: true }, 409);
    const D = { wa: cfg.wa || actual?.wa || "5491100000000", margen, fecha: fechaHoy(), ts: new Date().toISOString(), cats: nuevo.cats, p: nuevo.p };
    await store.setJSON("productos", D);
    cfg.margen = margen;
    await store.setJSON("config", cfg);
    // comparar con lo anterior
    const old = new Map((actual?.p || []).map(r => [r[1], r[3]]));
    let suben = 0, bajan = 0, nuevos = 0;
    for (const r of D.p) { const o = old.get(r[1]); if (o === undefined) nuevos++; else if (r[3] > o) suben++; else if (r[3] < o) bajan++; }
    const nueva = new Set(D.p.map(r => r[1]));
    const retirados = [...old.keys()].filter(e => !nueva.has(e)).length;
    return J({ ok: true, fecha: D.fecha, productos: D.p.length, suben, bajan, nuevos, retirados });
  }
  return J({ error: "No mandaste nada para actualizar." }, 400);
};
