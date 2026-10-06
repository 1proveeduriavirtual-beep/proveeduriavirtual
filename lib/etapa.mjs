// En qué paso está cada pedido (aparte de cómo se paga):
//   esperando pago -> nuevo (hay que comprarlo) -> preparando (ya se compró) -> en camino -> entregado
//   y "cancelado" en cualquier momento.
export const CONFIRMADO = ["pagado", "efectivo al recibir", "espera transferencia"];
export const ETAPAS = ["nuevo", "preparando", "en camino", "entregado", "cancelado"];
export const NOMBRE_ETAPA = {
  "esperando pago": "Esperando el pago",
  nuevo: "Recibido",
  preparando: "Preparando",
  "en camino": "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function etapaDe(o) {
  if (!o) return "";
  if (o.estado === "cancelado") return "cancelado";
  if (o.estado === "entregado") return "entregado";
  if (o.etapa && ETAPAS.includes(o.etapa)) return o.etapa;
  if (!CONFIRMADO.includes(o.estado)) return "esperando pago";
  return o.sale ? "en camino" : "nuevo";
}

// Cambia la etapa y la anota en el historial (para el seguimiento del cliente)
export function ponerEtapa(o, etapa, quien = "") {
  if (!ETAPAS.includes(etapa)) throw new Error("estado inválido");
  const f = new Date().toISOString();
  o.etapa = etapa;
  o.historial = [...(o.historial || []), { e: etapa, f, q: quien || undefined }].slice(-30);
  if (etapa === "en camino") o.sale = true;
  if (etapa === "entregado") { o.estado = "entregado"; o.entregado = f; o.entregoPor = quien || undefined; }
  if (etapa === "cancelado") { o.estadoPago = o.estado; o.estado = "cancelado"; o.cancelado = f; }
  return o;
}

// Link de seguimiento para el cliente
export const SITIO = () => (globalThis.Netlify?.env.get("URL") || "https://proveeduriavirtual.netlify.app").replace(/\/$/, "");
export const linkSeguimiento = o => `${SITIO()}/seguimiento.html?id=${encodeURIComponent(o.id)}`;
