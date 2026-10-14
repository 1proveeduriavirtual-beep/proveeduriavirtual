// Stock propio del depósito, movimientos, compras, proveedores y productos propios.
// Todo automático: cada venta descuenta stock, cada compra registrada lo repone.
// Un stock negativo significa "vendido y todavía no comprado": la lista de compras lo toma solo.
import { getStore } from "@netlify/blobs";
import { vigentes } from "./ofertas.mjs";

const S = () => getStore("inventario");
// Costo de cada producto: el del proveedor principal y, si Supermercado usa Carrefour Maxi, el de Maxi
export async function leerCostos() {
  const T = getStore("tienda");
  const [a, b, o] = await Promise.all([T.get("costos", { type: "json" }).catch(() => null), T.get("costosMaxi", { type: "json" }).catch(() => null), getStore("ofertas").get("estado", { type: "json" }).catch(() => null)]);
  const c = { ...(b || {}), ...(a || {}) };
  for (const [sku, x] of Object.entries(vigentes(o?.activas))) c[sku] = [Math.min(c[sku]?.[0] || x.costoU, x.costoU), x.costoU, x.tienda]; // oferta aprobada: se compra ahí
  return c;
}
export const unidadesDe = i => (Number(i.cantidad) || 0) * (Number(i.bulto) || 1);

// stock: { sku: { c: cantidad (unidades), m: mínimo, n: nombre } }
export async function leerStock() { return (await S().get("stock", { type: "json" }).catch(() => null)) || {}; }
const guardarStock = st => S().setJSON("stock", st);

const mes = (d = new Date()) => d.toISOString().slice(0, 7);
async function anotar(movs) {
  if (!movs.length) return;
  const k = "movs-" + mes();
  const l = (await S().get(k, { type: "json" }).catch(() => null)) || [];
  l.push(...movs);
  await S().setJSON(k, l.slice(-20000));
}
export async function leerMovimientos(m = mes()) { return (await S().get("movs-" + m, { type: "json" }).catch(() => null)) || []; }
// Movimientos entre dos fechas (YYYY-MM-DD), juntando los meses que hagan falta (máximo 24)
export async function movimientosEntre(desde, hasta) {
  const meses = [], d = new Date(desde.slice(0, 7) + "-01T12:00:00Z"), h = hasta.slice(0, 7);
  while (d.toISOString().slice(0, 7) <= h && meses.length < 24) { meses.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  const l = (await Promise.all(meses.map(leerMovimientos))).flat();
  const dia = f => new Date(new Date(f) - 3 * 3600e3).toISOString().slice(0, 10);
  return l.filter(m => dia(m.f) >= desde && dia(m.f) <= hasta);
}
// Ajustes a mano de productos del proveedor: { sku: { oculto, pu, pb } } (precio propio o esconderlo de la tienda)
export async function leerAjustes() { return (await S().get("ajustes", { type: "json" }).catch(() => null)) || {}; }
export const guardarAjustes = a => S().setJSON("ajustes", a);

// items: [{ sku, nombre, unidades }] · signo: -1 venta, +1 compra/devolución · tipo: "venta" | "compra" | "ajuste" | "devolucion" | "importacion"
export async function mover(items, signo, tipo, ref, quien) {
  const st = await leerStock(), f = new Date().toISOString(), movs = [];
  for (const i of items) {
    const sku = String(i.sku || ""); const u = Math.round(Number(i.unidades) || 0);
    if (!sku || !u) continue;
    const x = st[sku] || { c: 0, m: 0 };
    x.c = (x.c || 0) + signo * u;
    if (i.nombre) x.n = String(i.nombre).slice(0, 200);
    st[sku] = x;
    movs.push({ f, sku, n: x.n || "", d: signo * u, t: tipo, ref: ref || "", q: quien || "" });
  }
  await guardarStock(st);
  await anotar(movs);
  return st;
}

// Ajuste manual o importación: fija cantidad y/o mínimo
export async function fijar(filas, tipo = "ajuste", quien = "") {
  const st = await leerStock(), f = new Date().toISOString(), movs = [];
  for (const r of filas) {
    const sku = String(r.sku || "").trim(); if (!sku) continue;
    const x = st[sku] || { c: 0, m: 0 };
    if (r.cantidad !== undefined && r.cantidad !== "" && !isNaN(+r.cantidad)) {
      const nueva = Math.round(+r.cantidad);
      if (nueva !== x.c) movs.push({ f, sku, n: r.nombre || x.n || "", d: nueva - (x.c || 0), t: tipo, ref: r.ref || "", q: quien, ...(r.vence ? { ven: r.vence } : {}) });
      x.c = nueva;
    }
    if (r.minimo !== undefined && r.minimo !== "" && !isNaN(+r.minimo)) x.m = Math.max(0, Math.round(+r.minimo));
    for (const [k, c] of [["ingreso", "ing"], ["vence", "ven"]]) if (r[k] !== undefined) { if (/^\d{4}-\d{2}-\d{2}$/.test(r[k])) x[c] = r[k]; else if (r[k] === "") delete x[c]; } // fecha de ingreso y de vencimiento (último lote)
    if (r.nombre) x.n = String(r.nombre).slice(0, 200);
    st[sku] = x;
  }
  await guardarStock(st);
  await anotar(movs);
  return st;
}

// Venta: descuenta stock una sola vez por pedido
export async function descontarPedido(o, store) {
  if (!o || o.stockDescontado || !Array.isArray(o.items)) return o;
  const its = o.items.filter(i => i.sku).map(i => ({ sku: i.sku, nombre: i.nombre.replace(/^BULTO x\d+ - /, ""), unidades: unidadesDe(i) }));
  await mover(its, -1, "venta", o.id);
  o.stockDescontado = true;
  if (store) await store.setJSON(o.id, o);
  return o;
}
// Pedido borrado sin entregar: devuelve el stock
export async function devolverPedido(o) {
  if (!o?.stockDescontado || o.estado === "entregado") return;
  const its = o.items.filter(i => i.sku).map(i => ({ sku: i.sku, nombre: i.nombre.replace(/^BULTO x\d+ - /, ""), unidades: unidadesDe(i) }));
  await mover(its, +1, "devolucion", o.id);
}

// Lista de compras sugerida: lo vendido sin stock (negativo) + lo que quedó debajo del mínimo.
// Se compran bultos cerrados solo cuando alcanza para uno (o cuando el bulto sale más barato que las sueltas);
// lo que sobra se compra por unidad, así no se compra un bulto entero para vender una sola unidad.
// pedidos (opcional): solo lo que hace falta para esos pedidos (los que se marcaron en el panel); dice además de qué sección es cada producto.
export function sugerirCompras(st, cat, costos, pedidos) {
  const by = new Map((cat?.p || []).map(p => [p[1], p]));
  const sel = pedidos ? new Map() : null, sec = new Map();
  for (const o of pedidos || []) for (const i of o.items || []) if (i.sku) { sel.set(i.sku, (sel.get(i.sku) || 0) + unidadesDe(i)); sec.set(i.sku, new Set([...(sec.get(i.sku) || []), ({ bulto: "Mayoristas", intl: "Internacional" }[o.modo] || "Supermercado")])); }
  const out = [];
  for (const [sku, x] of Object.entries(st)) {
    const c = x.c || 0, m = x.m || 0;
    let falta = Math.max(0, m > 0 ? m - c : -c);
    if (sel) falta = Math.min(falta, sel.get(sku) || 0);
    if (!falta) continue;
    const p = by.get(sku), bu = p?.[5] > 1 ? p[5] : 1, co = costos?.[sku];
    const cuSuelta = co ? +co[0] || +co[1] || 0 : 0, cuBulto = co ? +co[1] || +co[0] || 0 : 0;
    let bultos = bu > 1 ? Math.floor(falta / bu) : 0, sueltas = bu > 1 ? falta - bultos * bu : falta;
    if (bu > 1 && sueltas && cuSuelta && sueltas * cuSuelta >= bu * cuBulto) { bultos++; sueltas = 0; } // conviene un bulto más
    const unidades = bultos * bu + sueltas;
    const costo = Math.round(bultos * bu * cuBulto + sueltas * cuSuelta);
    out.push({ sku, nombre: x.n || p?.[2] || sku, stock: c, minimo: m, falta, bu, bultos, sueltas, unidades, costoU: unidades ? Math.round(costo / unidades * 100) / 100 : 0, costo, seccion: sec.has(sku) ? [...sec.get(sku)].join(" y ") : "", proveedor: co?.[2] ? co[2] + " (oferta)" : p?.[12] === "m" ? "Proveedor por unidad" : "Proveedor principal" });
  }
  return out.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}
export const textoCantidad = x => [x.bultos ? `${x.bultos} bulto${x.bultos > 1 ? "s" : ""} x${x.bu}` : "", x.sueltas ? `${x.sueltas} suelta${x.sueltas > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ") || `${x.unidades} u.`;

// Compras registradas
export async function leerCompras() { return (await S().get("compras", { type: "json" }).catch(() => null)) || []; }
export async function registrarCompra(c, quien) {
  const items = (c.items || []).map(i => ({ sku: String(i.sku || "").trim(), nombre: String(i.nombre || "").slice(0, 200), unidades: Math.max(0, Math.round(+i.unidades || 0)), costo: Math.max(0, +i.costo || 0) })).filter(i => i.sku && i.unidades);
  if (!items.length) throw new Error("La compra no tiene productos.");
  const compra = { id: crypto.randomUUID(), fecha: new Date().toISOString(), proveedor: String(c.proveedor || "Proveedor principal").slice(0, 80), nota: String(c.nota || "").slice(0, 300), items, total: Math.round(items.reduce((s, i) => s + i.costo * i.unidades, 0)), quien: quien || "" };
  const l = await leerCompras(); l.unshift(compra); await S().setJSON("compras", l.slice(0, 5000));
  await mover(items, +1, "compra", compra.id, quien);
  return compra;
}

// Proveedores
// El proveedor de siempre se muestra como "Proveedor principal" (el nombre real no aparece en ningún lado; se puede cambiar en el panel)
const PROV_DEF = [{ id: "maxiconsumo", nombre: "Proveedor principal", web: "", telefono: "", contacto: "", notas: "Precios y stock se actualizan solos todos los días.", fijo: true }];
export async function leerProveedores() {
  const l = (await S().get("proveedores", { type: "json" }).catch(() => null)) || PROV_DEF;
  return l.map(p => p.fijo && /maxi/i.test(p.nombre) ? { ...p, nombre: "Proveedor principal", web: /maxiconsumo/i.test(p.web || "") ? "" : p.web } : p);
}
export const guardarProveedores = l => S().setJSON("proveedores", l);

// Productos propios (cargados a mano o importados): [{ sku, nombre, cat, pu, pb, bu, foto, costo, activo }]
export async function leerPropios() { return (await S().get("propios", { type: "json" }).catch(() => null)) || []; }
export const guardarPropios = l => S().setJSON("propios", l);
