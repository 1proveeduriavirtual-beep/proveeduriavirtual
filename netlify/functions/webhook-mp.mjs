import { getStore } from "@netlify/blobs";
import { avisarPedido } from "../../lib/aviso.mjs";

export default async (req) => {
  const token = Netlify.env.get("MP_ACCESS_TOKEN");
  if (!token) return new Response("ok");
  const url = new URL(req.url);
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
  let type = url.searchParams.get("type") || url.searchParams.get("topic");
  try {
    const body = await req.json();
    paymentId = paymentId || body?.data?.id;
    type = type || body?.type;
  } catch {}
  if (!paymentId || (type && type !== "payment")) return new Response("ok");

  // No confiamos en lo que llega: le preguntamos el estado a Mercado Pago con nuestra clave.
  const r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(paymentId), {
    headers: { authorization: "Bearer " + token },
  });
  if (!r.ok) return new Response("reintentar", { status: 502 });
  const p = await r.json();
  const id = p.external_reference;
  if (!id) return new Response("ok");
  const store = getStore("pedidos");
  const o = await store.get(id, { type: "json" });
  if (!o) return new Response("ok");
  const yaPagado = o.estado === "pagado" || o.estado === "entregado";
  o.estado = p.status === "approved" ? "pagado" : p.status; // pending, rejected, etc.
  o.pago = { id: p.id, medio: p.payment_type_id, monto: p.transaction_amount, fecha: p.date_approved || p.date_created };
  await store.setJSON(id, o);
  if (o.estado === "pagado" && !yaPagado) await avisarPedido(o, "Nuevo pedido PAGADO");
  return new Response("ok");
};
