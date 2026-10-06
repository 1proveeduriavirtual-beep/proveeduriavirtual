// Usuarios del panel y permisos.
// - La clave ADMIN_KEY (la de Netlify) siempre entra como dueño.
// - Los usuarios creados en el panel entran con usuario + clave y reciben un token firmado (dura 30 días).
// Roles: dueño (todo), vendedor, deposito, repartidor.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

export const ROLES = {
  "dueño": ["*"],
  vendedor: ["pedidos", "entregas", "clientes", "promos", "estadisticas", "facturar"],
  deposito: ["pedidos", "entregas", "stock", "compras", "proveedores"],
  repartidor: ["entregas"],
};
export const NOMBRE_ROL = { "dueño": "Dueño", vendedor: "Vendedor", deposito: "Depósito", repartidor: "Repartidor" };

const b64 = s => Buffer.from(s).toString("base64url");
const firma = (txt, key) => crypto.createHmac("sha256", key).update(txt).digest("base64url");
export const hashClave = (clave, salt = crypto.randomBytes(12).toString("hex")) => ({ salt, hash: crypto.scryptSync(String(clave), salt, 32).toString("hex") });
const igual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function leerUsuarios() {
  return (await getStore("usuarios").get("lista", { type: "json" }).catch(() => null)) || [];
}
export const guardarUsuarios = l => getStore("usuarios").setJSON("lista", l);

// Devuelve un token o null
export async function login(usuario, clave) {
  const key = Netlify.env.get("ADMIN_KEY");
  if (!key) return null;
  const u = (await leerUsuarios()).find(x => x.usuario === String(usuario || "").trim().toLowerCase() && x.activo !== false);
  if (!u) return null;
  const h = hashClave(clave, u.salt).hash;
  if (!igual(h, u.hash)) return null;
  const p = b64(JSON.stringify({ u: u.usuario, rol: u.rol, n: u.nombre, exp: Date.now() + 30 * 864e5 }));
  return { token: `${p}.${firma(p, key)}`, rol: u.rol, nombre: u.nombre };
}

// k = ADMIN_KEY o token. Devuelve { usuario, rol, nombre } o null.
export async function quien(k) {
  const key = Netlify.env.get("ADMIN_KEY");
  if (!key || !k) return null;
  if (igual(String(k), key)) return { usuario: "dueño", rol: "dueño", nombre: "Dueño" };
  const [p, s] = String(k).split(".");
  if (!p || !s || !igual(s, firma(p, key))) return null;
  let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  if (!(d.exp > Date.now())) return null;
  const u = (await leerUsuarios()).find(x => x.usuario === d.u && x.activo !== false);
  return u ? { usuario: u.usuario, rol: u.rol, nombre: u.nombre } : null; // si lo dieron de baja, deja de entrar
}

export const puede = (u, permiso) => !!u && (ROLES[u.rol] || []).some(p => p === "*" || p === permiso);

// Atajo para las funciones: devuelve el usuario si tiene permiso, o null
export async function autorizar(req, permiso) {
  const u = await quien(new URL(req.url).searchParams.get("k"));
  return u && (!permiso || puede(u, permiso)) ? u : null;
}
