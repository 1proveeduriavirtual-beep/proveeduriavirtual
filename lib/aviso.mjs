// Aviso por mail al dueño cuando entra un pedido.
// Principal: se manda desde el Gmail del negocio (GMAIL_APP_PASSWORD = contraseña de aplicación de Google).
// Respaldo: Resend (RESEND_API_KEY), si no hay contraseña de Gmail cargada.
import nodemailer from "nodemailer";

const PARA = "1proveeduriavirtual@gmail.com";
const DE = "1proveeduriavirtual@gmail.com";
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export async function avisarPedido(o, titulo) {
  const filas = (o.items || []).map(i => `<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("");
  const html = `<h2>${esc(titulo)}</h2><p><b>${esc(o.nombre)}</b> · ${esc(o.telefono)}<br>${esc(o.direccion)}${o.email ? "<br>" + esc(o.email) : ""}</p><ul>${filas}</ul><p><b>Total $ ${Number(o.total).toLocaleString("es-AR")}</b>${o.cupon ? " · cupón " + esc(o.cupon) : ""}</p><p>Forma de pago: ${esc(o.pago?.medio || "Mercado Pago")}</p>`;
  const subject = titulo + " - $ " + Number(o.total).toLocaleString("es-AR");

  await enviarMail({ to: PARA, subject, html });
}

// Envío genérico desde el Gmail del negocio (o Resend de respaldo). Devuelve true si salió.
export async function enviarMail({ to, subject, html }) {
  const pass = (Netlify.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  if (pass) {
    try {
      const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: DE, pass } });
      await t.sendMail({ from: `"Proveeduría Virtual" <${DE}>`, to, subject, html });
      return true;
    } catch (e) {
      console.error("mail gmail falló:", e?.message);
    }
  }
  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ from: "Proveeduría Virtual <onboarding@resend.dev>", to: [to], subject, html }),
    });
    if (!r.ok) console.error("mail resend falló:", r.status);
    return r.ok;
  } catch (e) {
    console.error("mail resend falló:", e?.message);
    return false;
  }
}

// Manda la factura al cliente: resumen + link para verla e imprimirla.
export async function mandarFactura(o, emisor, link) {
  const f = o.factura;
  const nro = String(f.ptoVta).padStart(5, "0") + "-" + String(f.nro).padStart(8, "0");
  const prueba = f.prod ? "" : " (PRUEBA - sin validez fiscal)";
  const html = `<p>Hola ${esc(o.nombre)}, gracias por tu compra en Proveeduría Virtual.</p>`
    + `<p>Te mandamos tu <b>Factura ${f.tipo} N° ${nro}</b>${prueba} por <b>$ ${Number(f.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</b>.</p>`
    + `<p><a href="${esc(link)}" style="display:inline-block;background:#1f5c3a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver e imprimir la factura</a></p>`
    + `<p style="color:#666;font-size:13px">Emitida por ${esc(emisor.razon || "")} · CUIT ${esc(f.cuit)} · CAE ${esc(f.cae)}</p>`;
  return enviarMail({ to: o.email, subject: `Tu factura ${f.tipo} ${nro} - Proveeduría Virtual${prueba}`, html });
}
