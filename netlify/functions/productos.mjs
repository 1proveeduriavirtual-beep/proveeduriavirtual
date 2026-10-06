// Precios de la tienda guardados en Netlify (se actualizan desde el panel, sin volver a publicar la tienda).
//   GET  /.netlify/functions/productos            -> { datos, wa }  (público, lo usa la tienda)
//   POST /.netlify/functions/productos?k=CLAVE     -> { archivo, margen } o { wa }  (panel)
import { getStore } from "@netlify/blobs";
import { parseMaxi, parseMaxiconsumo, marcarOfertas, fechaHoy } from "../../lib/precios.mjs";
import { leerDatos, armarCatalogo } from "../../lib/datos.mjs";
import { autorizar } from "../../lib/auth.mjs";

const J = (o, s = 200, cache = "no-store") => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": cache } });

export default async (req) => {
  const store = getStore("tienda");
  const url = new URL(req.url);
  if (req.method === "GET" && !url.searchParams.get("k")) {
    const I = getStore("inventario");
    const [datos, cfg, propios, promos, stock] = await Promise.all([store.get("productos", { type: "json" }), store.get("config", { type: "json" }), I.get("propios", { type: "json" }).catch(() => null), store.get("promos", { type: "json" }).catch(() => null), I.get("stock", { type: "json" }).catch(() => null)]);
    const pg = cfg?.pagos || {};
    return J({ datos: datos ? armarCatalogo(datos, propios || [], promos || [], stock || {}) : null, wa: cfg?.wa || null, envio: cfg?.envio || null, horarios: cfg?.horarios || null, pagos: { mp: pg.mp !== false, efectivo: pg.efectivo !== false } }, 200, "public, max-age=60");
  }
  if (!(await autorizar(req, "precios"))) return J({ error: "clave incorrecta o sin permiso" }, 401);
  const cfg = (await store.get("config", { type: "json" })) || {};
  const site = url.origin;

  if (req.method === "GET") { // panel: estado actual
    const D = await leerDatos(site, { crudo: true });
    return J({ pagos: cfg.pagos || {}, fecha: D?.fecha, productos: D?.p?.length || 0, proveedor: D?.proveedor || "maxi", margen: cfg.margen ?? D?.margen ?? 60, margenBulto: cfg.margenBulto ?? cfg.margen ?? 60, wa: cfg.wa || D?.wa || "", envio: cfg.envio || null, horarios: cfg.horarios || null });
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

  if (b.pagos) { // medios de pago: se activan o desactivan desde el panel
    cfg.pagos = { mp: b.pagos.mp !== false, efectivo: b.pagos.efectivo !== false, transferencia: !!b.pagos.transferencia, alias: String(b.pagos.alias || "").trim().slice(0, 60) };
    if (cfg.pagos.transferencia && !cfg.pagos.alias) return J({ error: "Para cobrar por transferencia poné el alias o CBU." }, 400);
    await store.setJSON("config", cfg);
    return J({ ok: true, pagos: cfg.pagos });
  }

  if (b.envio || b.horarios) { // costo de envío y horarios de entrega
    const n = v => v === "" || v === null || v === undefined ? null : Math.max(0, Math.round(Number(v) || 0));
    if (b.envio) cfg.envio = { caba: n(b.envio.caba), gba: n(b.envio.gba), gratisDesde: n(b.envio.gratisDesde) };
    if (b.horarios) {
      const dias = [...new Set((b.horarios.dias || []).map(Number).filter(d => d >= 0 && d <= 6))];
      const franjas = (b.horarios.franjas || []).map(f => String(f).trim().slice(0, 40)).filter(Boolean).slice(0, 6);
      cfg.horarios = { dias, franjas, anticipacion: Math.min(7, Math.max(0, Math.floor(Number(b.horarios.anticipacion) || 0))) };
    }
    await store.setJSON("config", cfg);
    return J({ ok: true, envio: cfg.envio || null, horarios: cfg.horarios || null });
  }

  if (b.soloGanancia) { // guardar las ganancias sin subir archivo: se usan en la próxima actualización automática
    const margen = Number(b.margen), margenBulto = Number(b.margenBulto);
    if (!(margen >= 0 && margen <= 500) || !(margenBulto >= 0 && margenBulto <= 500)) return J({ error: "Poné un margen de ganancia entre 0 y 500 %." }, 400);
    cfg.margen = margen; cfg.margenBulto = margenBulto;
    await store.setJSON("config", cfg);
    return J({ ok: true, soloGanancia: true, margen, margenBulto });
  }

  if (b.archivo) {
    const margen = Number(b.margen ?? cfg.margen ?? 60);
    const margenBulto = Number(b.margenBulto ?? cfg.margenBulto ?? margen);
    if (!(margen >= 0 && margen <= 500) || !(margenBulto >= 0 && margenBulto <= 500)) return J({ error: "Poné un margen de ganancia entre 0 y 500 %." }, 400);
    const actual = await leerDatos(site, { crudo: true });
    const esMC = String(b.archivo).startsWith("#maxiconsumo|");
    const proveedor = esMC ? "maxiconsumo" : "maxi";
    let nuevo;
    try { nuevo = esMC ? parseMaxiconsumo(b.archivo, margen, margenBulto, actual?.proveedor === proveedor ? actual?.cats || [] : []) : parseMaxi(b.archivo, margen, actual?.cats || []); } catch (e) { return J({ error: e.message }, 400); }
    if (nuevo.p.length < 100) return J({ error: `El archivo trae solo ${nuevo.p.length} productos. Volvé a tocar el marcador y subilo de nuevo.` }, 400);
    const n0 = (actual?.proveedor || "maxi") === proveedor ? actual?.p?.length || 0 : 0; // si cambia de mayorista no se compara
    if (n0 && !b.forzar && (nuevo.p.length < 0.8 * n0 || nuevo.p.length > 1.5 * n0))
      return J({ error: `Ojo: la tienda tenía ${n0} productos y el archivo trae ${nuevo.p.length}. Si estás seguro, tildá "Forzar" y volvé a subirlo.`, confirmar: true }, 409);
    let ofertas = 0;
    if (esMC) { // ofertas semanales: bajas de costo de 10% o más + promos de Maxiconsumo
      const refs = (await store.get("referencias", { type: "json" }).catch(() => null)) || {};
      const o = marcarOfertas(nuevo.p, nuevo.costos, refs, margen, margenBulto);
      await store.setJSON("referencias", o.refs);
      await store.setJSON("costos", nuevo.costos); // costo de cada producto (para ganancia y lista de compras)
      ofertas = o.ofertas;
    }
    const D = { wa: cfg.wa || actual?.wa || "5491100000000", proveedor, margen, margenBulto, fecha: fechaHoy(), ts: new Date().toISOString(), img: nuevo.img || undefined, cats: nuevo.cats, p: nuevo.p };
    await store.setJSON("productos", D);
    cfg.margen = margen; cfg.margenBulto = margenBulto;
    await store.setJSON("config", cfg);
    // comparar con lo anterior
    const old = new Map((actual?.p || []).map(r => [r[1], r[3]]));
    let suben = 0, bajan = 0, nuevos = 0;
    for (const r of D.p) { const o = old.get(r[1]); if (o === undefined) nuevos++; else if (r[3] > o) suben++; else if (r[3] < o) bajan++; }
    const nueva = new Set(D.p.map(r => r[1]));
    const retirados = [...old.keys()].filter(e => !nueva.has(e)).length;
    return J({ ok: true, fecha: D.fecha, proveedor, productos: D.p.length, suben, bajan, nuevos, retirados, ofertas, sinStock: nuevo.sinStock || 0 });
  }
  return J({ error: "No mandaste nada para actualizar." }, 400);
};
