// Cuentas de clientes de la tienda: entran con su mail y un código que les llega (sin contraseñas que olvidar).
// La cuenta guarda sus datos de entrega, ve sus pedidos y puede pedir acceso a precios mayoristas.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const S = () => getStore("cuentas");
export const normMail = e => String(e || "").trim().toLowerCase().slice(0, 120);
export const mailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const k = e => "u-" + crypto.createHash("sha256").update(normMail(e)).digest("hex").slice(0, 32);
const secreto = () => "cli|" + (Netlify.env.get("ADMIN_KEY") || "");
const firma = t => crypto.createHmac("sha256", secreto()).update(t).digest("base64url");

export const leerCuenta = async e => (await S().get(k(e), { type: "json" }).catch(() => null));
export const guardarCuenta = c => S().setJSON(k(c.email), c);

// Lista de todas las cuentas (para el panel)
export async function todasLasCuentas() {
  const { blobs } = await S().list();
  return (await Promise.all(blobs.filter(b => b.key.startsWith("u-")).map(b => S().get(b.key, { type: "json" }).catch(() => null)))).filter(Boolean);
}

// Código de 6 números, vale 15 minutos, 5 intentos. Devuelve el código o un error.
export async function nuevoCodigo(email) {
  const ck = "c" + k(email);
  const prev = await S().get(ck, { type: "json" }).catch(() => null);
  if (prev && Date.now() - prev.f < 60e3) return { error: "Esperá un minuto antes de pedir otro código." };
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  await S().setJSON(ck, { h: firma(codigo + email), f: Date.now(), n: 0 });
  return { codigo };
}
export async function probarCodigo(email, codigo) {
  const ck = "c" + k(email), c = await S().get(ck, { type: "json" }).catch(() => null);
  if (!c || Date.now() - c.f > 15 * 60e3) return false;
  if (c.n >= 5) return false;
  const ok = c.h === firma(String(codigo || "").replace(/\D/g, "") + email);
  if (ok) await S().delete(ck); else { c.n++; await S().setJSON(ck, c); }
  return ok;
}

// Sesión firmada (dura 180 días)
export function token(email) {
  const p = Buffer.from(JSON.stringify({ e: normMail(email), x: Date.now() + 180 * 864e5 })).toString("base64url");
  return p + "." + firma(p);
}
export async function cuentaDe(t) {
  const [p, s] = String(t || "").split(".");
  if (!p || !s || s !== firma(p)) return null;
  let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  if (!(d.x > Date.now())) return null;
  const c = await leerCuenta(d.e);
  return c && c.activo !== false ? c : null;
}
export const esMayoristaAprobado = c => c?.mayorista?.estado === "aprobado";
