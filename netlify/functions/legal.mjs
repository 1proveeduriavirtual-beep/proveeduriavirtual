// Páginas legales: datos públicos del negocio y botón de arrepentimiento.
//   GET               -> razón social, CUIT y domicilio (los mismos que salen en la factura)
//   POST {nombre, email, telefono, pedido, motivo} -> registra el arrepentimiento y devuelve un código
import { getStore } from "@netlify/blobs";
import { leerConfig } from "../../lib/arca.mjs";
import { enviarMail } from "../../lib/aviso.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const txt = (v, n) => String(v ?? "").trim().slice(0, n);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DUENO = "1proveeduriavirtual@gmail.com";

export default async (req) => {
  if (req.method === "GET") {
    const c = await leerConfig();
    return J({ razon: c.razon || "", cuit: c.cuit || "", domicilio: c.domicilio || "" });
  }
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  const nombre = txt(b.nombre, 80), email = txt(b.email, 120), telefono = txt(b.telefono, 30), pedido = txt(b.pedido, 80), motivo = txt(b.motivo, 600);
  if (!nombre) return J({ error: "Poné tu nombre." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return J({ error: "Poné un email válido: ahí te mandamos el código." }, 400);
  if (telefono.replace(/\D/g, "").length < 8) return J({ error: "Poné tu teléfono." }, 400);

  const codigo = "ARR-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
  const r = { codigo, fecha: new Date().toISOString(), nombre, email, telefono, pedido, motivo };
  await getStore("arrepentimientos").setJSON(codigo, r);

  const datos = `<p><b>Código:</b> ${codigo}<br><b>Nombre:</b> ${esc(nombre)}<br><b>Email:</b> ${esc(email)}<br><b>Teléfono:</b> ${esc(telefono)}<br><b>Pedido / fecha de compra:</b> ${esc(pedido) || "-"}<br><b>Comentario:</b> ${esc(motivo) || "-"}</p>`;
  await Promise.all([
    enviarMail({ to: DUENO, subject: `Botón de arrepentimiento: ${codigo} - ${nombre}`, html: `<h2>Un cliente pidió cancelar su compra</h2>${datos}<p>Contactalo para coordinar la devolución y el reintegro.</p>` }).catch(() => false),
    enviarMail({ to: email, subject: `Recibimos tu pedido de arrepentimiento (${codigo})`, html: `<p>Hola ${esc(nombre)}, recibimos tu solicitud para revocar (cancelar) tu compra en Proveeduría Virtual.</p>${datos}<p>Guardá este código. Te vamos a contactar para coordinar la devolución y el reintegro.</p>` }).catch(() => false),
  ]);
  return J({ ok: true, codigo });
};
