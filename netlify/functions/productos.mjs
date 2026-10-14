// Precios de la tienda guardados en Netlify (se actualizan desde el panel, sin volver a publicar la tienda).
//   GET  /.netlify/functions/productos            -> { datos, wa }  (público, lo usa la tienda)
//   POST /.netlify/functions/productos?k=CLAVE     -> { archivo, margen } o { wa }  (panel)
import { getStore } from "@netlify/blobs";
import { parseMaxi, parseMaxiconsumo, marcarOfertas, fechaHoy } from "../../lib/precios.mjs";
import { leerDatos, armarCatalogo } from "../../lib/datos.mjs";
import { autorizar } from "../../lib/auth.mjs";
import { MEMB_DEF, limpiarMembresia, beneficiosTxt, cambiarMonto } from "../../lib/membresia.mjs";
import { todasLasCuentas } from "../../lib/cuentas.mjs";
import { vigentes } from "../../lib/ofertas.mjs";

const J = (o, s = 200, cache = "no-store") => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": cache } });

export default async (req) => {
  const store = getStore("tienda");
  const url = new URL(req.url);
  if (req.method === "GET" && !url.searchParams.get("k")) {
    const I = getStore("inventario");
    const [datos, cfg, propios, promos, stock, ajustes, maxi, ofe] = await Promise.all([store.get("productos", { type: "json" }), store.get("config", { type: "json" }), I.get("propios", { type: "json" }).catch(() => null), store.get("promos", { type: "json" }).catch(() => null), I.get("stock", { type: "json" }).catch(() => null), I.get("ajustes", { type: "json" }).catch(() => null), store.get("productosMaxi", { type: "json" }).catch(() => null), getStore("ofertas").get("estado", { type: "json" }).catch(() => null)]);
    const pg = cfg?.pagos || {};
    let cat = datos ? armarCatalogo(datos, propios || [], promos || [], stock || {}, ajustes || {}, cfg?.supermercado === "maxi" ? maxi : null, vigentes(ofe?.activas)) : null;
    // Mayoristas con registro: el precio por bulto no se publica (-1 = "registrate para verlo"); lo ven solo las cuentas aprobadas
    if (cat && cfg?.mayoristasRegistro) cat = { ...cat, mayReg: true, p: cat.p.map(r => r[4] > 0 ? Object.assign(r.slice(), { 4: -1, 8: 0 }) : r) };
    const mb = { ...MEMB_DEF, ...(cfg?.membresia || {}) };
    return J({ membresia: mb.activa ? { nombre: mb.nombre, precio: mb.precio, descripcion: mb.descripcion, beneficios: beneficiosTxt(mb), descuento: mb.descuento, envioGratis: mb.envioGratis, mayoristaSinMinimo: mb.mayoristaSinMinimo } : null, mantenimiento: cfg?.mantenimiento ? { msg: cfg.mantenimientoMsg || "" } : null, datos: cat, wa: cfg?.wa || null, envio: cfg?.envio || null, horarios: cfg?.horarios || null, pagos: { mp: pg.mp !== false, efectivo: pg.efectivo !== false } }, 200, "public, max-age=60");
  }
  if (!(await autorizar(req, "precios"))) return J({ error: "clave incorrecta o sin permiso" }, 401);
  const cfg = (await store.get("config", { type: "json" })) || {};
  const site = url.origin;

  if (req.method === "GET") { // panel: estado actual
    const D = await leerDatos(site, { crudo: true });
    const mx = await store.get("productosMaxi", { type: "json" }).catch(() => null);
    return J({ supermercado: { fuente: cfg.supermercado === "maxi" ? "maxi" : "principal", fecha: mx?.fecha || null, productos: mx?.p?.length || 0 }, pagos: cfg.pagos || {}, fecha: D?.fecha, productos: D?.p?.length || 0, proveedor: D?.proveedor || "maxi", margen: cfg.margen ?? D?.margen ?? 60, margenBulto: cfg.margenBulto ?? cfg.margen ?? 60, wa: cfg.wa || D?.wa || "", envio: cfg.envio || null, horarios: cfg.horarios || null, mayoristasRegistro: !!cfg.mayoristasRegistro, mantenimiento: !!cfg.mantenimiento, mantenimientoMsg: cfg.mantenimientoMsg || "", soporte: cfg.soporte || "", membresia: { ...MEMB_DEF, ...(cfg.membresia || {}) } });
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

  if (b.membresia) { // membresía: precio y beneficios. Si cambia el precio, se actualiza la suscripción de los socios activos
    const antes = { ...MEMB_DEF, ...(cfg.membresia || {}) }, m = limpiarMembresia(b.membresia);
    cfg.membresia = m;
    await store.setJSON("config", cfg);
    let actualizados = 0;
    if (m.precio !== antes.precio && Netlify.env.get("MP_ACCESS_TOKEN")) {
      for (const c of await todasLasCuentas()) if (c.socio?.id && c.socio.estado === "activo") { const r = await cambiarMonto(c.socio.id, m.precio).catch(() => null); if (r?.ok) actualizados++; }
    }
    return J({ ok: true, membresia: m, actualizados });
  }

  if (b.tienda) { // opciones de la tienda: mayoristas con registro, modo mantenimiento
    const x = b.tienda;
    if (x.mayoristasRegistro !== undefined) cfg.mayoristasRegistro = !!x.mayoristasRegistro;
    if (x.mantenimiento !== undefined) cfg.mantenimiento = !!x.mantenimiento;
    if (x.supermercado !== undefined) cfg.supermercado = x.supermercado === "maxi" ? "maxi" : "principal";
    if (x.soporte !== undefined) cfg.soporte = String(x.soporte || "").replace(/[<>]/g, "").trim().slice(0, 120);
    if (x.mantenimientoMsg !== undefined) cfg.mantenimientoMsg = String(x.mantenimientoMsg || "").replace(/[<>]/g, "").trim().slice(0, 300);
    await store.setJSON("config", cfg);
    return J({ ok: true, mayoristasRegistro: !!cfg.mayoristasRegistro, mantenimiento: !!cfg.mantenimiento, mantenimientoMsg: cfg.mantenimientoMsg || "", soporte: cfg.soporte || "" });
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
    // Archivo de Carrefour Maxi con la tienda ya en Maxiconsumo: son los precios de Supermercado (por unidad); Mayoristas sigue con Maxiconsumo
    if (!esMC && actual?.proveedor === "maxiconsumo") {
      let mx; try { mx = parseMaxi(b.archivo, margen, (await store.get("productosMaxi", { type: "json" }).catch(() => null))?.cats || actual.cats || []); } catch (e) { return J({ error: e.message }, 400); }
      if (mx.p.length < 100) return J({ error: `El archivo trae solo ${mx.p.length} productos. Volvé a tocar el marcador y subilo de nuevo.` }, 400);
      const costos = {}; for (const l of String(b.archivo).split("\n")) { const f = l.split("|"); if (f.length >= 5 && /^\d{6,14}$/.test((f[1] || "").trim()) && +f[3] > 0) costos[f[1].trim()] = [+f[3], +f[3]]; }
      await store.setJSON("productosMaxi", { cats: mx.cats, p: mx.p, fecha: fechaHoy() });
      await store.setJSON("costosMaxi", costos);
      cfg.supermercado = "maxi"; cfg.margen = margen; await store.setJSON("config", cfg);
      return J({ ok: true, supermercado: true, productos: mx.p.length, fecha: fechaHoy() });
    }
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
