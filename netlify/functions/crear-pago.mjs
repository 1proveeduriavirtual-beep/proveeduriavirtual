import { getStore } from "@netlify/blobs";
import { armarPedido } from "../../lib/pedido.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  const token = Netlify.env.get("MP_ACCESS_TOKEN");
  if (!token) return J({ error: "El pago online todavía no está configurado." }, 503);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  // Los precios se leen de la tienda (nunca del navegador del cliente).
  const site = new URL(req.url).origin;
  const r0 = await armarPedido(b, site);
  if (r0.error) return J({ error: r0.error }, r0.status || 400);
  const P = r0.ped;
  const items = P.items.map(i => ({ id: i.sku, title: i.nombre, quantity: i.cantidad, unit_price: i.precio, currency_id: "ARS" }));
  if (P.envio > 0) items.push({ id: "envio", title: `Envío ${P.zona}`, quantity: 1, unit_price: P.envio, currency_id: "ARS" });

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

  await getStore("pedidos").setJSON(id, { id, fecha: new Date().toISOString(), estado: "pendiente", ...P });
  return J({ url: d.init_point });
};
