// Seguimiento público del pedido para el cliente (con el número de pedido, que es imposible de adivinar).
// No devuelve dirección, teléfono ni email: solo en qué paso está y qué compró.
import { getStore } from "@netlify/blobs";
import { etapaDe, NOMBRE_ETAPA } from "../../lib/etapa.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ error: "No encontramos ese pedido." }, 404);
  const o = await getStore("pedidos").get(id, { type: "json" }).catch(() => null);
  if (!o) return J({ error: "No encontramos ese pedido." }, 404);
  const etapa = etapaDe(o);
  const cuando = { nuevo: o.pago?.fecha && o.estado === "pagado" ? o.pago.fecha : o.fecha };
  for (const h of o.historial || []) cuando[h.e] = h.f;
  if (o.entregado) cuando.entregado = o.entregado;
  return J({
    nro: id.slice(0, 8).toUpperCase(),
    nombre: String(o.nombre || "").split(" ")[0],
    fecha: o.fecha,
    etapa, etapaNombre: NOMBRE_ETAPA[etapa] || etapa,
    cuando,
    entrega: o.entrega || null,
    zona: o.zona || null,
    pago: o.pago?.medio === "efectivo" ? "efectivo" : o.pago?.medio === "transferencia" ? "transferencia" : o.pago?.medio ? "online" : null,
    pagoRechazado: ["rejected", "cancelled"].includes(o.estado),
    items: (o.items || []).map(i => ({ cantidad: i.cantidad, nombre: i.nombre, precio: i.precio })),
    envio: o.envio ?? null, envioACoordinar: !!o.envioACoordinar, total: o.total,
  });
};
