// Aviso por mail al dueño cuando entra un pedido. Usa Resend (gratis). Si no hay clave, no hace nada.
const PARA = "1proveeduriavirtual@gmail.com";
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
export async function avisarPedido(o, titulo) {
  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key) return;
  const filas = (o.items || []).map(i => `<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("");
  const html = `<h2>${esc(titulo)}</h2><p><b>${esc(o.nombre)}</b> · ${esc(o.telefono)}<br>${esc(o.direccion)}</p><ul>${filas}</ul><p><b>Total $ ${Number(o.total).toLocaleString("es-AR")}</b>${o.cupon ? " · cupón " + esc(o.cupon) : ""}</p><p>Forma de pago: ${esc(o.pago?.medio || "Mercado Pago")}</p>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ from: "Proveeduría Virtual <onboarding@resend.dev>", to: [PARA], subject: titulo + " - $ " + Number(o.total).toLocaleString("es-AR"), html }),
    });
  } catch {}
}
