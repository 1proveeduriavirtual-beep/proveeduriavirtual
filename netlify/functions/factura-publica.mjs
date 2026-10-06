// Factura para el cliente: se abre con el link que le llega por mail (id + código secreto de la factura).
import { getStore } from "@netlify/blobs";
import { leerConfig } from "../../lib/arca.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "", t = url.searchParams.get("t") || "";
  const o = id && t ? await getStore("pedidos").get(id, { type: "json" }) : null;
  if (!o?.factura?.token || o.factura.token !== t) return J({ error: "Factura no encontrada." }, 404);
  const e = await leerConfig();
  const { nombre, direccion, items, cupon, descuento, pago, factura } = o;
  const { token, ...f } = factura;
  return J({
    pedido: { nombre, direccion, items, cupon, descuento, pago: pago ? { medio: pago.medio } : undefined, factura: f },
    emisor: { razon: e.razon, domicilio: e.domicilio, condIva: e.condIva, iibb: e.iibb, inicio: e.inicio },
  });
};
