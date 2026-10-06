// Gestión del negocio para el panel: usuarios, clientes, stock, compras, proveedores, productos propios, promociones y resumen diario.
// Uso: /.netlify/functions/gestion?r=RECURSO&k=CLAVE_O_TOKEN
import { getStore } from "@netlify/blobs";
import { login, quien, puede, leerUsuarios, guardarUsuarios, hashClave, ROLES, NOMBRE_ROL } from "../../lib/auth.mjs";
import { etapaDe, ponerEtapa } from "../../lib/etapa.mjs";
import { leerStock, fijar, leerMovimientos, sugerirCompras, leerCompras, registrarCompra, leerProveedores, guardarProveedores, leerPropios, guardarPropios } from "../../lib/inventario.mjs";
import { leerDatos, hoyAR } from "../../lib/datos.mjs";
import { enviarMail } from "../../lib/aviso.mjs";
import { todosLosPedidos } from "../../lib/listado.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const txt = (v, n = 120) => String(v ?? "").trim().slice(0, n);
const VENDIDO = ["pagado", "entregado", "efectivo al recibir", "espera transferencia"];
const DUENO = "1proveeduriavirtual@gmail.com";

// Permiso que pide cada recurso
const PERMISO = { yo: null, usuarios: "usuarios", repartidores: "pedidos", clientes: "clientes", stock: "stock", movimientos: "stock", catalogo: "stock", compras: "compras", proveedores: "proveedores", propios: "stock", promos: "promos", resumen: "resumen" };

export default async (req) => {
  const url = new URL(req.url), r = url.searchParams.get("r") || "";
  const metodo = req.method;
  let b = {};
  if (metodo === "POST") { try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); } }

  if (r === "login") {
    if (metodo !== "POST") return J({ error: "método no permitido" }, 405);
    const t = await login(b.usuario, b.clave);
    return t ? J({ ok: true, ...t }) : J({ error: "Usuario o clave incorrectos." }, 401);
  }
  if (!(r in PERMISO)) return J({ error: "recurso desconocido" }, 404);
  const u = await quien(url.searchParams.get("k"));
  if (!u || (PERMISO[r] && !puede(u, PERMISO[r]))) return J({ error: "clave incorrecta o sin permiso" }, 401);

  try {
    // ---------- quién soy ----------
    if (r === "yo") return J({ ...u, rolNombre: NOMBRE_ROL[u.rol], permisos: ROLES[u.rol] });

    // ---------- usuarios (solo dueño) ----------
    if (r === "usuarios") {
      let l = await leerUsuarios();
      if (metodo === "POST") {
        const usuario = txt(b.usuario, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");
        if (b.accion === "crear") {
          if (!usuario || usuario === "dueño") return J({ error: "Poné un usuario (letras y números, sin espacios)." }, 400);
          if (l.some(x => x.usuario === usuario)) return J({ error: "Ese usuario ya existe." }, 400);
          if (!ROLES[b.rol]) return J({ error: "Elegí un rol." }, 400);
          if (String(b.clave || "").length < 6) return J({ error: "La clave tiene que tener al menos 6 caracteres." }, 400);
          l.push({ usuario, nombre: txt(b.nombre, 60) || usuario, rol: b.rol, activo: true, creado: new Date().toISOString(), ...hashClave(b.clave) });
        } else {
          const x = l.find(y => y.usuario === usuario); if (!x) return J({ error: "No existe ese usuario." }, 404);
          if (b.accion === "borrar") l = l.filter(y => y !== x);
          else {
            if (b.rol && ROLES[b.rol]) x.rol = b.rol;
            if (b.nombre) x.nombre = txt(b.nombre, 60);
            if (b.activo !== undefined) x.activo = !!b.activo;
            if (b.clave) { if (String(b.clave).length < 6) return J({ error: "La clave tiene que tener al menos 6 caracteres." }, 400); Object.assign(x, hashClave(b.clave)); }
          }
        }
        await guardarUsuarios(l);
      }
      return J(l.map(({ hash, salt, ...x }) => ({ ...x, rolNombre: NOMBRE_ROL[x.rol] })));
    }
    if (r === "repartidores") return J((await leerUsuarios()).filter(x => x.rol === "repartidor" && x.activo !== false).map(x => ({ usuario: x.usuario, nombre: x.nombre })));

    // ---------- clientes (se arman solos con los pedidos) ----------
    if (r === "clientes") {
      const M = new Map();
      for (const o of await todosLosPedidos()) {
        if (!VENDIDO.includes(o.estado)) continue;
        const k = String(o.telefono || "").replace(/\D/g, "").slice(-10) || String(o.email || "").toLowerCase(); if (!k) continue;
        const c = M.get(k) || { clave: k, nombre: o.nombre, telefono: o.telefono, email: o.email || "", direccion: o.direccion, pedidos: 0, total: 0, primero: o.fecha, ultimo: o.fecha, mayorista: false };
        c.pedidos++; c.total += o.total || 0;
        if (o.fecha > c.ultimo) { c.ultimo = o.fecha; c.nombre = o.nombre; c.direccion = o.direccion; if (o.email) c.email = o.email; }
        if (o.fecha < c.primero) c.primero = o.fecha;
        if (o.modo === "bulto") c.mayorista = true;
        M.set(k, c);
      }
      return J([...M.values()].sort((a, b) => b.total - a.total));
    }

    // ---------- stock ----------
    if (r === "stock") {
      if (metodo === "POST") {
        const filas = (b.filas || []).slice(0, 20000);
        await fijar(filas, b.tipo === "importacion" ? "importacion" : "ajuste", u.nombre);
      }
      const [st, costos] = await Promise.all([leerStock(), getStore("tienda").get("costos", { type: "json" }).catch(() => null)]);
      return J({ stock: st, costos: costos || {} });
    }
    if (r === "movimientos") return J(await leerMovimientos(url.searchParams.get("mes") || undefined));
    if (r === "catalogo") { // lista liviana de productos para buscar y agregar al stock
      const D = await leerDatos(url.origin);
      return J({ cats: D?.cats || [], p: (D?.p || []).map(p => [p[0], p[1], p[2], p[3], p[4], p[5]]) });
    }

    // ---------- compras ----------
    if (r === "compras") {
      if (metodo === "POST") {
        if (!puede(u, "compras")) return J({ error: "sin permiso" }, 403);
        const c = await registrarCompra(b, u.nombre);
        // "Ya compré todo": los pedidos que estaban esperando la compra pasan a "Preparando"
        let preparando = 0;
        if (b.pasarPedidos !== false) {
          const P = getStore("pedidos");
          for (const o of await todosLosPedidos()) {
            if (etapaDe(o) !== "nuevo") continue;
            ponerEtapa(o, "preparando", u.nombre);
            await P.setJSON(o.id, o);
            preparando++;
          }
        }
        return J({ ok: true, compra: c, preparando });
      }
      const [st, D, costos, compras] = await Promise.all([leerStock(), leerDatos(url.origin), getStore("tienda").get("costos", { type: "json" }).catch(() => null), leerCompras()]);
      return J({ sugeridas: sugerirCompras(st, D, costos || {}), compras: compras.slice(0, 300) });
    }

    // ---------- proveedores ----------
    if (r === "proveedores") {
      let l = await leerProveedores();
      if (metodo === "POST") {
        if (b.accion === "borrar") l = l.filter(x => x.id !== b.id || x.fijo);
        else {
          const x = { id: b.id || crypto.randomUUID(), nombre: txt(b.nombre, 80), contacto: txt(b.contacto, 80), telefono: txt(b.telefono, 40), email: txt(b.email, 120), web: txt(b.web, 200), notas: txt(b.notas, 500) };
          if (!x.nombre) return J({ error: "Poné el nombre del proveedor." }, 400);
          const i = l.findIndex(y => y.id === x.id); if (i >= 0) l[i] = { ...l[i], ...x }; else l.push(x);
        }
        await guardarProveedores(l);
      }
      return J(l);
    }

    // ---------- productos propios (cargados a mano o importados) ----------
    if (r === "propios") {
      let l = await leerPropios();
      if (metodo === "POST") {
        const limpio = x => ({ sku: txt(x.sku, 30) || "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: txt(x.nombre, 200), cat: txt(x.cat, 40).toLowerCase() || "otros", pu: Math.max(0, Math.round(+x.pu || 0)), pb: Math.max(0, Math.round(+x.pb || 0)), bu: Math.max(1, Math.floor(+x.bu || 1)), costo: Math.max(0, +x.costo || 0), foto: /^https:\/\//.test(x.foto || "") ? txt(x.foto, 400) : "", activo: x.activo !== false, sinStock: !!x.sinStock });
        if (b.accion === "borrar") l = l.filter(x => x.sku !== b.sku);
        else {
          const pares = (b.accion === "importar" ? b.filas || [] : [b]).slice(0, 5000).map(x => [x, limpio(x)]).filter(([, y]) => y.nombre && (y.pu > 0 || y.pb > 0));
          if (!pares.length) return J({ error: "Faltan nombre y precio." }, 400);
          for (const [, x] of pares) { const i = l.findIndex(y => y.sku === x.sku); if (i >= 0) l[i] = x; else l.push(x); }
          const conStock = pares.filter(([x]) => x.stock !== undefined && x.stock !== "" && x.stock !== null);
          if (conStock.length) await fijar(conStock.map(([x, y]) => ({ sku: y.sku, cantidad: x.stock, minimo: x.minimo, nombre: y.nombre })), "importacion", u.nombre);
        }
        await guardarPropios(l);
      }
      return J(l);
    }

    // ---------- promociones ----------
    if (r === "promos") {
      const T = getStore("tienda");
      let l = (await T.get("promos", { type: "json" }).catch(() => null)) || [];
      if (metodo === "POST") {
        if (b.accion === "borrar") l = l.filter(x => x.id !== b.id);
        else {
          const x = { id: b.id || crypto.randomUUID(), nombre: txt(b.nombre, 60) || "Promo", pct: Math.min(90, Math.max(1, Math.round(+b.pct || 0))), cats: (b.cats || []).map(c => txt(c, 40)).filter(Boolean), skus: (b.skus || []).map(c => txt(c, 30)).filter(Boolean), modo: ["unidad", "bulto"].includes(b.modo) ? b.modo : "ambos", desde: /^\d{4}-\d{2}-\d{2}$/.test(b.desde || "") ? b.desde : "", hasta: /^\d{4}-\d{2}-\d{2}$/.test(b.hasta || "") ? b.hasta : "", activa: b.activa !== false };
          if (!(+b.pct >= 1)) return J({ error: "Poné el % de descuento (1 a 90)." }, 400);
          const i = l.findIndex(y => y.id === x.id); if (i >= 0) l[i] = x; else l.push(x);
        }
        await T.setJSON("promos", l);
      }
      return J(l);
    }

    // ---------- resumen diario por mail (lo dispara GitHub todos los días después de actualizar precios) ----------
    if (r === "resumen") {
      const [ped, st, D, costos] = await Promise.all([todosLosPedidos(), leerStock(), leerDatos(url.origin), getStore("tienda").get("costos", { type: "json" }).catch(() => null)]);
      const hoy = hoyAR(), ayer = new Date(Date.now() - 27 * 3600e3).toISOString().slice(0, 10);
      const dia = f => new Date(new Date(f).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      const vAyer = ped.filter(o => VENDIDO.includes(o.estado) && dia(o.fecha) === ayer);
      const tot = vAyer.reduce((s, o) => s + (o.total || 0), 0), gan = vAyer.reduce((s, o) => s + o.items.reduce((a, i) => a + (i.costo ? (i.precio - i.costo) * i.cantidad : 0), 0), 0);
      const [, mm, dd] = hoy.split("-"), hoyTxt = `${+dd}/${+mm}`;
      const entregar = ped.filter(o => ["nuevo", "preparando", "en camino"].includes(etapaDe(o)));
      const deHoy = entregar.filter(o => String(o.entrega || "").includes(" " + hoyTxt + " "));
      const sug = sugerirCompras(st, D, costos || {});
      const bajos = Object.entries(st).filter(([, x]) => x.m > 0 && x.c > 0 && x.c < x.m);
      const pl = n => "$ " + Math.round(n).toLocaleString("es-AR");
      const es = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const html = `<h2>Resumen del día - Proveeduría Virtual</h2>
<p><b>Ayer:</b> ${vAyer.length} pedidos · ventas ${pl(tot)}${gan ? ` · ganancia aprox. ${pl(gan)}` : ""}</p>
<p><b>Pedidos sin entregar:</b> ${entregar.length}${deHoy.length ? ` · <b>${deHoy.length} para entregar hoy</b>` : ""}</p>
${deHoy.length ? `<ul>${deHoy.map(o => `<li>${es(o.entrega)} — ${es(o.nombre)}, ${es(o.direccion)} (${pl(o.total)})</li>`).join("")}</ul>` : ""}
<h3>Para comprar en Maxiconsumo (${sug.length} productos${sug.length ? ", aprox. " + pl(sug.reduce((s, x) => s + x.costo, 0)) : ""})</h3>
${sug.length ? `<ul>${sug.slice(0, 80).map(x => `<li>${x.bultos ? `${x.bultos} bulto${x.bultos > 1 ? "s" : ""} x${x.bu}` : `${x.unidades} u.`} — ${es(x.nombre)}</li>`).join("")}</ul>` : "<p>Nada para comprar.</p>"}
${bajos.length ? `<h3>Stock bajo (${bajos.length})</h3><ul>${bajos.slice(0, 50).map(([, x]) => `<li>${es(x.n)}: quedan ${x.c} (mínimo ${x.m})</li>`).join("")}</ul>` : ""}
<p style="color:#666;font-size:13px">Detalle completo en el panel: ${url.origin}/pedidos.html</p>`;
      const enviado = url.searchParams.get("mandar") === "0" ? false : await enviarMail({ to: DUENO, subject: `Resumen del día: ${vAyer.length} pedidos ayer · ${deHoy.length} para entregar hoy · ${sug.length} para comprar`, html });
      return J({ ok: true, enviado, pedidosAyer: vAyer.length, ventasAyer: tot, entregarHoy: deHoy.length, sinEntregar: entregar.length, paraComprar: sug.length, stockBajo: bajos.length });
    }
  } catch (e) {
    return J({ error: e.message || "Error inesperado" }, 400);
  }
  return J({ error: "método no permitido" }, 405);
};
