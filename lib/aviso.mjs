// Aviso por mail al dueño cuando entra un pedido.
// Principal: se manda desde el Gmail del negocio (GMAIL_APP_PASSWORD = contraseña de aplicación de Google).
// Respaldo: Resend (RESEND_API_KEY), si no hay contraseña de Gmail cargada.
import nodemailer from "nodemailer";

const PARA = "1proveeduriavirtual@gmail.com";
const DE = "1proveeduriavirtual@gmail.com";
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export async function avisarPedido(o, titulo) {
  const filas = (o.items || []).map(i => `<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("");
  const html = `<h2>${esc(titulo)}</h2><p><b>${esc(o.nombre)}</b> · ${esc(o.telefono)}<br>${esc(o.direccion)}</p><ul>${filas}</ul><p><b>Total $ ${Number(o.total).toLocaleString("es-AR")}</b>${o.cupon ? " · cupón " + esc(o.cupon) : ""}</p><p>Forma de pago: ${esc(o.pago?.medio || "Mercado Pago")}</p>`;
  const subject = titulo + " - $ " + Number(o.total).toLocaleString("es-AR");

  const pass = (Netlify.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  if (pass) {
    try {
      const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: DE, pass } });
      await t.sendMail({ from: `"Proveeduría Virtual" <${DE}>`, to: PARA, subject, html });
      return;
    } catch (e) {
      console.error("aviso gmail falló:", e?.message);
    }
  }

  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ from: "Proveeduría Virtual <onboarding@resend.dev>", to: [PARA], subject, html }),
    });
    if (!r.ok) console.error("aviso resend falló:", r.status);
  } catch (e) {
    console.error("aviso resend falló:", e?.message);
  }
}
