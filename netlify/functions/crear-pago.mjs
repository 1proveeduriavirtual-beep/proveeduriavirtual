import { leerDatos } from "../../lib/datos.mjs";
import { getStore } from "@netlify/blobs";
import { pctDe, conDescuento, norm } from "../../lib/cupon.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const unesc = s => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export default async (req) => {
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  const token = Netlify.env.get("MP_ACCESS_TOKEN");
  if (!token) return J({ error: "El pago online todavía no está configurado." }, 503);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const direccion = String(b.direccion || "").trim().slice(0, 160);
  const telefono = String(b.telefono || "").trim().slice(0, 30);
  if (!nombre || !direccion || telefono.replace(/\D/g, "").length < 8) return J({ error: "Completá nombre, dirección y teléfono." }, 400);
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) return J({ error: "El carrito está vacío." }, 400);

  // Los precios se leen de la tienda publicada (nunca del navegador del cliente).
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
    items.push({ id: p[1], title: unesc(p[2]).slice(0, 250), quantity: n, unit_price: conDescuento(p[3], pct), currency_id: "ARS" });
    total += conDescuento(p[3], pct) * n;
  }

  if (total < 80000) return J({ error: "La compra mínima es $ 80.000." }, 400);

  const id = crypto.randomUUID();
  const pref = {
    items,
    external_reference: id,
    notification_url: site + "/.netlify/functions/webhook-mp",
    back_urls: { success: site + "/?pago=ok", failure: site + "/?pago=error", pending: site + "/?pago=pendiente" },
    auto_return: "approved",
    statement_descriptor: "PROVEEDURIA",
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(pref),
  });
  const d = await r.json();
  if (!r.ok || !d.init_point) return J({ error: "Mercado Pago no pudo crear el pago." }, 502);

  await getStore("pedidos").setJSON(id, {
    id, fecha: new Date().toISOString(), estado: "pendiente", cupon: pct ? norm(b.cupon) : undefined, descuento: pct || undefined, nombre, direccion, telefono, total,
    items: items.map(i => ({ nombre: i.title, cantidad: i.quantity, precio: i.unit_price })),
  });
  return J({ url: d.init_point });
};
