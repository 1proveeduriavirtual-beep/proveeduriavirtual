// Membresía mensual: el cliente se suscribe con Mercado Pago (débito automático todos los meses).
// El precio y los beneficios los elige el dueño en el panel. Los beneficios valen mientras la suscripción esté activa,
// o si el dueño lo marca como socio a mano en la ficha del cliente (por ejemplo, si paga en efectivo).
import { getStore } from "@netlify/blobs";

export const MEMB_DEF = { activa: false, nombre: "Club Proveeduría", precio: 5000, descripcion: "Beneficios todos los meses para los clientes que más compran.", envioGratis: true, descuento: 5, mayoristaSinMinimo: false };
export async function leerMembresia() {
  const cfg = (await getStore("tienda").get("config", { type: "json" }).catch(() => null)) || {};
  return { ...MEMB_DEF, ...(cfg.membresia || {}) };
}
export function limpiarMembresia(x) {
  return {
    activa: !!x.activa,
    nombre: String(x.nombre || MEMB_DEF.nombre).replace(/[<>]/g, "").trim().slice(0, 60),
    precio: Math.max(100, Math.round(+x.precio || 0)),
    descripcion: String(x.descripcion || "").replace(/[<>]/g, "").trim().slice(0, 400),
    envioGratis: !!x.envioGratis,
    descuento: Math.min(50, Math.max(0, Math.round(+x.descuento || 0))),
    mayoristaSinMinimo: !!x.mayoristaSinMinimo,
  };
}
export const beneficiosTxt = m => [m.envioGratis ? "Envío gratis en todas tus compras" : "", m.descuento ? `${m.descuento}% de descuento en todo` : "", m.mayoristaSinMinimo ? "Comprás en Mayoristas sin compra mínima" : ""].filter(Boolean);

const MP = (path, opt = {}) => fetch("https://api.mercadopago.com" + path, { ...opt, headers: { "content-type": "application/json", authorization: "Bearer " + Netlify.env.get("MP_ACCESS_TOKEN"), ...(opt.headers || {}) } });

// Crea la suscripción en Mercado Pago y devuelve el link para que el cliente la autorice
export async function crearSuscripcion(email, m, site) {
  const r = await MP("/preapproval", { method: "POST", body: JSON.stringify({
    reason: `${m.nombre} - Proveeduría Virtual`, external_reference: "socio:" + email, payer_email: email,
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: m.precio, currency_id: "ARS" },
    back_url: site + "/?socio=1", status: "pending",
  }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.init_point) throw new Error(d.message ? "Mercado Pago: " + d.message : "Mercado Pago no pudo crear la suscripción.");
  return { id: d.id, url: d.init_point };
}
export async function estadoSuscripcion(id) {
  const r = await MP("/preapproval/" + encodeURIComponent(id));
  if (!r.ok) return null;
  const d = await r.json();
  return { estado: d.status === "authorized" ? "activo" : d.status === "pending" ? "pendiente" : "inactivo", mp: d.status, email: String(d.external_reference || "").replace(/^socio:/, "") };
}
export const cancelarSuscripcion = id => MP("/preapproval/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
export const cambiarMonto = (id, monto) => MP("/preapproval/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: monto, currency_id: "ARS" } }) });

// ¿Tiene beneficios de socio? (suscripción activa o marcado a mano en la ficha)
export const esSocio = (cuenta, ficha) => cuenta?.socio?.estado === "activo" || !!(ficha?.socio && ficha.activo !== false);
