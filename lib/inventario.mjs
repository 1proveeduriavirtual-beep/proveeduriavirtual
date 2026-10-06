// Stock propio del depósito, movimientos, compras, proveedores y productos propios.
// Todo automático: cada venta descuenta stock, cada compra registrada lo repone.
// Un stock negativo significa "vendido y todavía no comprado": la lista de compras lo toma solo.
import { getStore } from "@netlify/blobs";

const S = () => getStore("inventario");
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
      if (nueva !== x.c) movs.push({ f, sku, n: r.nombre || x.n || "", d: nueva - (x.c || 0), t: tipo, ref: "", q: quien });
      x.c = nueva;
    }
    if (r.minimo !== undefined && r.minimo !== "" && !isNaN(+r.minimo)) x.m = Math.max(0, Math.round(+r.minimo));
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

// Lista de compras sugerida: lo vendido sin stock (negativo) + lo que quedó debajo del mínimo
export function sugerirCompras(st, cat, costos) {
  const by = new Map((cat?.p || []).map(p => [p[1], p]));
  const out = [];
  for (const [sku, x] of Object.entries(st)) {
    const c = x.c || 0, m = x.m || 0;
    const falta = Math.max(0, m > 0 ? m - c : -c);
    if (!falta) continue;
    const p = by.get(sku), bu = p?.[5] > 1 ? p[5] : 1, co = costos?.[sku];
    const bultos = bu > 1 ? Math.ceil(falta / bu) : 0;
    const unidades = bu > 1 ? bultos * bu : falta;
    const costoU = co ? (bu > 1 ? co[1] : co[0]) : 0;
    out.push({ sku, nombre: x.n || p?.[2] || sku, stock: c, minimo: m, falta, bu, bultos, unidades, costoU, costo: Math.round(costoU * unidades) });
  }
  return out.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}

// Compras registradas
export async function leerCompras() { return (await S().get("compras", { type: "json" }).catch(() => null)) || []; }
export async function registrarCompra(c, quien) {
  const items = (c.items || []).map(i => ({ sku: String(i.sku || "").trim(), nombre: String(i.nombre || "").slice(0, 200), unidades: Math.max(0, Math.round(+i.unidades || 0)), costo: Math.max(0, +i.costo || 0) })).filter(i => i.sku && i.unidades);
  if (!items.length) throw new Error("La compra no tiene productos.");
  const compra = { id: crypto.randomUUID(), fecha: new Date().toISOString(), proveedor: String(c.proveedor || "Maxiconsumo").slice(0, 80), nota: String(c.nota || "").slice(0, 300), items, total: Math.round(items.reduce((s, i) => s + i.costo * i.unidades, 0)), quien: quien || "" };
  const l = await leerCompras(); l.unshift(compra); await S().setJSON("compras", l.slice(0, 5000));
  await mover(items, +1, "compra", compra.id, quien);
  return compra;
}

// Proveedores
const PROV_DEF = [{ id: "maxiconsumo", nombre: "Maxiconsumo", web: "https://www.maxiconsumo.com", telefono: "", contacto: "", notas: "Precios y stock se actualizan solos todos los días.", fijo: true }];
export async function leerProveedores() { return (await S().get("proveedores", { type: "json" }).catch(() => null)) || PROV_DEF; }
export const guardarProveedores = l => S().setJSON("proveedores", l);

// Productos propios (cargados a mano o importados): [{ sku, nombre, cat, pu, pb, bu, foto, costo, activo }]
export async function leerPropios() { return (await S().get("propios", { type: "json" }).catch(() => null)) || []; }
export const guardarPropios = l => S().setJSON("propios", l);
