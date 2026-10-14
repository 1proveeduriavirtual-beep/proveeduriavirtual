// Cuenta del cliente en la tienda.
//   POST {accion:"codigo", email}                 -> manda un código de 6 números al mail
//   POST {accion:"entrar", email, codigo}         -> { t, cuenta }
//   GET  ?t=TOKEN                                 -> { cuenta, pedidos }
//   GET  ?t=TOKEN&r=precios                       -> precios mayoristas (solo cuentas mayoristas aprobadas)
//   POST {accion:"datos", t, nombre, telefono, ...} -> guarda datos de entrega
//   POST {accion:"mayorista", t, cuit, razon}     -> pide acceso a precios mayoristas (lo aprueba el dueño en el panel)
import { getStore } from "@netlify/blobs";
import { normMail, mailOk, leerCuenta, guardarCuenta, nuevoCodigo, probarCodigo, token, cuentaDe, esMayoristaAprobado } from "../../lib/cuentas.mjs";
import { enviarMail } from "../../lib/aviso.mjs";
import { todosLosPedidos } from "../../lib/listado.mjs";
import { etapaDe, NOMBRE_ETAPA } from "../../lib/etapa.mjs";
import { claveCliente } from "../../lib/clientes.mjs";
import { leerDatos } from "../../lib/datos.mjs";
import { leerMembresia, crearSuscripcion, estadoSuscripcion, cancelarSuscripcion } from "../../lib/membresia.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const t = (v, n) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const DUENO = "1proveeduriavirtual@gmail.com";
const publica = c => ({ email: c.email, nombre: c.nombre || "", telefono: c.telefono || "", direccion: c.direccion || "", localidad: c.localidad || "", zona: c.zona || "", dni: c.dni || "", mayorista: c.mayorista || null, socio: c.socio || null });

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const c = await cuentaDe(url.searchParams.get("t"));
    if (!c) return J({ error: "Tu sesión venció. Entrá de nuevo." }, 401);
    if (url.searchParams.get("r") === "precios") {
      if (!esMayoristaAprobado(c)) return J({ error: "Tu cuenta todavía no tiene acceso mayorista." }, 403);
      const D = await leerDatos(url.origin);
      return J(Object.fromEntries((D?.p || []).filter(p => p[4] > 0).map(p => [p[1], [p[4], p[8] || 0]])));
    }
    if (c.socio?.id && c.socio.estado !== "inactivo" && Netlify.env.get("MP_ACCESS_TOKEN")) { // revisa la suscripción en Mercado Pago (por si el aviso no llegó)
      const e = await estadoSuscripcion(c.socio.id).catch(() => null);
      if (e && e.estado !== c.socio.estado) { c.socio.estado = e.estado; await guardarCuenta(c); }
    }
    const kc = claveCliente(c), mail = c.email;
    const pedidos = (await todosLosPedidos()).filter(o => o.cuenta === mail || normMail(o.email) === mail || (kc && claveCliente(o) === kc)).slice(0, 50)
      .map(o => ({ id: o.id, fecha: o.fecha, modo: o.modo || "unidad", total: o.total, etapa: NOMBRE_ETAPA[etapaDe(o)] || etapaDe(o), items: (o.items || []).map(i => ({ sku: i.sku, nombre: i.nombre, cantidad: i.cantidad })) }));
    return J({ cuenta: publica(c), pedidos });
  }
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b; try { b = await req.json(); } catch { return J({ error: "inválido" }, 400); }

  if (b.accion === "codigo") {
    const email = normMail(b.email);
    if (!mailOk(email)) return J({ error: "Revisá el mail." }, 400);
    const r = await nuevoCodigo(email);
    if (r.error) return J({ error: r.error }, 429);
    const ok = await enviarMail({ to: email, subject: `Tu código para entrar: ${r.codigo} - Proveeduría Virtual`, html: `<p>Hola! Tu código para entrar a tu cuenta de Proveeduría Virtual es:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${r.codigo}</p><p style="color:#666">Vale por 15 minutos. Si no lo pediste vos, ignorá este mail.</p>` }).catch(() => false);
    return ok ? J({ ok: true }) : J({ error: "No pudimos mandar el mail. Probá de nuevo en un rato." }, 502);
  }
  if (b.accion === "entrar") {
    const email = normMail(b.email);
    if (!(await probarCodigo(email, b.codigo))) return J({ error: "El código no es correcto o ya venció." }, 401);
    let c = await leerCuenta(email);
    if (!c) { c = { email, alta: new Date().toISOString(), activo: true }; await guardarCuenta(c); }
    if (c.activo === false) return J({ error: "Esta cuenta está dada de baja. Escribinos por WhatsApp." }, 403);
    return J({ t: token(email), cuenta: publica(c) });
  }

  const c = await cuentaDe(b.t);
  if (!c) return J({ error: "Tu sesión venció. Entrá de nuevo." }, 401);
  if (b.accion === "datos") {
    for (const [f, n] of [["nombre", 80], ["telefono", 30], ["direccion", 160], ["localidad", 60], ["dni", 15]]) if (b[f] !== undefined) c[f] = t(b[f], n);
    if (["CABA", "GBA"].includes(b.zona)) c.zona = b.zona;
    await guardarCuenta(c);
    return J({ ok: true, cuenta: publica(c) });
  }
  if (b.accion === "mayorista") {
    const cuit = String(b.cuit || "").replace(/\D/g, "");
    if (cuit.length !== 11) return J({ error: "El CUIT tiene 11 números." }, 400);
    const razon = t(b.razon, 120);
    if (!razon) return J({ error: "Poné la razón social o el nombre del comercio." }, 400);
    if (esMayoristaAprobado(c)) return J({ ok: true, cuenta: publica(c) });
    c.mayorista = { estado: "pendiente", cuit, razon, rubro: t(b.rubro, 80), f: new Date().toISOString() };
    await guardarCuenta(c);
    await enviarMail({ to: DUENO, subject: `Pedido de acceso mayorista: ${razon}`, html: `<p><b>${razon}</b> (CUIT ${cuit}) pide acceso a los precios mayoristas.</p><p>Mail: ${c.email}${c.telefono ? " · Tel: " + c.telefono : ""}</p><p>Aprobalo en el panel: Clientes → Cuentas mayoristas.</p>` }).catch(() => {});
    return J({ ok: true, cuenta: publica(c) });
  }
  if (b.accion === "socio") {
    const m = await leerMembresia();
    if (!m.activa) return J({ error: "La membresía no está disponible por ahora." }, 400);
    if (!Netlify.env.get("MP_ACCESS_TOKEN")) return J({ error: "El cobro online todavía no está configurado." }, 503);
    if (c.socio?.estado === "activo") return J({ ok: true, cuenta: publica(c) });
    if (c.socio?.id) await cancelarSuscripcion(c.socio.id).catch(() => {}); // si había una a medio hacer, se reemplaza
    try {
      const s = await crearSuscripcion(c.email, m, url.origin);
      c.socio = { estado: "pendiente", id: s.id, monto: m.precio, f: new Date().toISOString() };
      await guardarCuenta(c);
      return J({ ok: true, url: s.url });
    } catch (e) { return J({ error: /^Mercado Pago/.test(e.message) ? e.message : "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato." }, 502); }
  }
  if (b.accion === "bajaSocio") {
    if (c.socio?.id) await cancelarSuscripcion(c.socio.id).catch(() => {});
    if (c.socio) { c.socio.estado = "inactivo"; c.socio.baja = new Date().toISOString(); await guardarCuenta(c); }
    return J({ ok: true, cuenta: publica(c) });
  }
  return J({ error: "acción desconocida" }, 400);
};
