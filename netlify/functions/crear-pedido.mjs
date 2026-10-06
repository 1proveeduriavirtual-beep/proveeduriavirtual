import { leerDatos } from "../../lib/datos.mjs";
import { getStore } from "@netlify/blobs";
import { avisarPedido } from "../../lib/aviso.mjs";
import { pctDe, conDescuento, norm } from "../../lib/cupon.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const unesc = s => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Pedidos sin Mercado Pago: efectivo al recibir o transferencia directa.
export default async (req) => {
  const alias = (Netlify.env.get("ALIAS_TRANSFERENCIA") || "").trim();
  if (req.method === "GET") return J({ transferencia: !!alias, alias });
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  const metodo = b.metodo === "transferencia" ? "transferencia" : b.metodo === "efectivo" ? "efectivo" : null;
  if (!metodo || (metodo === "transferencia" && !alias)) return J({ error: "Forma de pago no disponible." }, 400);
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const direccion = String(b.direccion || "").trim().slice(0, 160);
  const telefono = String(b.telefono || "").trim().slice(0, 30);
  const email = String(b.email || "").trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return J({ error: "Revisá el email (o dejalo vacío)." }, 400);
  if (!nombre || !direccion || telefono.replace(/\D/g, "").length < 8) return J({ error: "Completá nombre, dirección y teléfono." }, 400);
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) return J({ error: "El carrito está vacío." }, 400);

  const site = new URL(req.url).origin;
  const D = await leerDatos(site);
  if (!D) return J({ error: "No pude leer los precios." }, 500);
  const by = new Map(D.p.map(p => [p[1], p]));
  const pct = await pctDe(b.cupon);
  const items = [];
  let total = 0;
  for (const it of b.items) {
    const p = by.get(String(it.e));
    const n = Math.floor(Number(it.n));
    if (!p || !(n >= 1 && n <= 99)) return J({ error: "Hay un producto que ya no está disponible. Actualizá la página." }, 400);
    items.push({ nombre: unesc(p[2]).slice(0, 250), cantidad: n, precio: conDescuento(p[3], pct) });
    total += conDescuento(p[3], pct) * n;
  }
  if (total < 80000) return J({ error: "La compra mínima es $ 80.000." }, 400);

  const id = crypto.randomUUID();
  const ped = {
    id, fecha: new Date().toISOString(), cupon: pct ? norm(b.cupon) : undefined, descuento: pct || undefined, nombre, direccion, telefono, email: email || undefined, total, items,
    estado: metodo === "efectivo" ? "efectivo al recibir" : "espera transferencia",
    pago: { medio: metodo === "efectivo" ? "efectivo" : "transferencia" },
  };
  await getStore("pedidos").setJSON(id, ped);
  await avisarPedido(ped, "Nuevo pedido: pagás al recibir");
  return J({ ok: true, total, alias: metodo === "transferencia" ? alias : undefined });
};
