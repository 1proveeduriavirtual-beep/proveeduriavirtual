// Gestión del negocio para el panel: usuarios, clientes, stock, compras, proveedores, productos propios, promociones y resumen diario.
// Uso: /.netlify/functions/gestion?r=RECURSO&k=CLAVE_O_TOKEN
import { getStore } from "@netlify/blobs";
import { login, quien, puede, leerUsuarios, guardarUsuarios, hashClave, ROLES, NOMBRE_ROL } from "../../lib/auth.mjs";
import { etapaDe, ponerEtapa } from "../../lib/etapa.mjs";
import { leerCostos, textoCantidad, leerStock, fijar, leerMovimientos, movimientosEntre, leerAjustes, guardarAjustes, sugerirCompras, leerCompras, registrarCompra, leerProveedores, guardarProveedores, leerPropios, guardarPropios } from "../../lib/inventario.mjs";
import { leerDatos, hoyAR } from "../../lib/datos.mjs";
import { enviarMail } from "../../lib/aviso.mjs";
import { todosLosPedidos } from "../../lib/listado.mjs";
import { numerar, leerFichas, guardarFichas, claveCliente } from "../../lib/clientes.mjs";
import { todasLasCuentas, leerCuenta, guardarCuenta } from "../../lib/cuentas.mjs";
import { leerOfertas, guardarOfertas, buscarProducto, ofertaRazonable, vigentes } from "../../lib/ofertas.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const txt = (v, n = 120) => String(v ?? "").trim().slice(0, n);
const VENDIDO = ["pagado", "entregado", "efectivo al recibir", "espera transferencia"];
const DUENO = "1proveeduriavirtual@gmail.com";

// Permiso que pide cada recurso
const PERMISO = { yo: null, usuarios: "usuarios", repartidores: "pedidos", clientes: "clientes", carritos: "clientes", cuentas: "clientes", estado: "precios", ofertas: "precios", stock: "stock", movimientos: "stock", catalogo: "stock", ajustes: "stock", compras: "compras", proveedores: "proveedores", propios: "stock", promos: "promos", resumen: "resumen" };

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
      if (metodo === "POST") { // editar la ficha: envío gratis, socio, activo, DNI/CUIT, empresa, notas
        if (u.rol !== "dueño") return J({ error: "Solo el dueño puede cambiar la ficha del cliente." }, 403);
        const F = await leerFichas(), f = F[txt(b.clave, 120)];
        if (!f) return J({ error: "No existe ese cliente." }, 404);
        for (const k of ["envioGratis", "socio", "activo"]) if (b[k] !== undefined) f[k] = !!b[k];
        for (const k of ["dni", "empresa", "notas"]) if (b[k] !== undefined) f[k] = txt(b[k], k === "notas" ? 500 : 80);
        await guardarFichas(F);
      }
      const ped = await numerar(await todosLosPedidos()), F = await leerFichas();
      const M = new Map();
      for (const o of [...ped].reverse()) { // del más viejo al más nuevo: quedan los datos del último pedido
        const k = claveCliente(o); if (!k) continue;
        const c = M.get(k) || { clave: k, nro: F[k]?.nro, pedidos: 0, total: 0, primero: o.fecha, ultimo: o.fecha, mayorista: false };
        c.nombre = o.nombre; c.telefono = o.telefono; c.direccion = o.direccion; c.zona = o.zona || ""; if (o.email) c.email = o.email; c.ultimo = o.fecha;
        if (VENDIDO.includes(o.estado)) { c.pedidos++; c.total += o.total || 0; if (o.modo === "bulto") c.mayorista = true; }
        M.set(k, c);
      }
      const l = [...M.values()].map(c => { const f = F[c.clave] || {}; return { ...c, email: c.email || "", envioGratis: !!f.envioGratis, socio: !!f.socio, activo: f.activo !== false, dni: f.dni || "", empresa: f.empresa || "", notas: f.notas || "" }; });
      return J(l.sort((a, b) => (a.nro || 0) - (b.nro || 0)));
    }

    // ---------- ofertas de las revistas de otros mayoristas ----------
    if (r === "ofertas") {
      const O = await leerOfertas();
      const nk = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      if (metodo === "POST") {
        const [D, costos, cfg] = await Promise.all([leerDatos(url.origin, { crudo: true }), leerCostos(), getStore("tienda").get("config", { type: "json" }).catch(() => null)]);
        const by = new Map((D?.p || []).map(p => [p[1], p]));
        const mB = +(cfg?.margenBulto ?? cfg?.margen ?? 10);
        const hasta7 = new Date(Date.now() + 7 * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
        if (b.accion === "cargar") { // lo manda el robot de GitHub con lo que leyó de las revistas
          const cat = (D?.p || []).filter(p => p[4] > 0).map(p => ({ sku: p[1], nombre: String(p[2]).replace(/&[a-z#0-9]+;/g, " ") }));
          const vistos = new Set(), nuevas = [];
          let leidos = 0;
          for (const c of (b.candidatos || []).slice(0, 5000)) {
            leidos++;
            const precio = +c.precio, texto = String(c.texto || "").slice(0, 200), tienda = String(c.tienda || "").slice(0, 30);
            const m = buscarProducto(texto, cat, O.alias); if (!m) continue;
            const p = by.get(m.sku), cu = +(costos[m.sku]?.[1] || costos[m.sku]?.[0] || 0), bu = p?.[5] || 1;
            if (!ofertaRazonable(precio, cu)) continue;
            const key = m.sku + "|" + tienda;
            if (vistos.has(key) || O.descartes[nk(texto) + "|" + m.sku]) continue;
            vistos.add(key);
            nuevas.push({ id: crypto.randomUUID().slice(0, 8), sku: m.sku, nombre: p?.[2] || m.sku, tienda, texto, precio, costoU: cu, ahorro: Math.round((1 - precio / cu) * 100), bu, precioBultoActual: p?.[4] || 0, precioBultoNuevo: Math.ceil(precio * (1 + mB / 100) / 10) * 10 * bu, aprendido: !!m.aprendido, completo: !!m.completo, puntaje: Math.round(m.puntaje * 100) / 100, img: String(c.img || "").slice(0, 300), pagina: String(c.pagina || "").slice(0, 80) });
          }
          // de la misma marca en varias revistas, se propone la más barata
          const mejor = new Map(); for (const x of nuevas) { const y = mejor.get(x.sku); if (!y || x.precio < y.precio) mejor.set(x.sku, x); }
          // "Aplicar solas las seguras": las que ya se aprobaron antes o coinciden muy bien, con un ahorro razonable.
          // Un solo precio por producto: si ya había una oferta en uso y aparece otra más barata, la reemplaza.
          let solas = 0; const pend = [], act = vigentes(O.activas);
          for (const x of mejor.values()) {
            const segura = (x.aprendido || x.completo) && x.ahorro >= 5 && x.ahorro <= 40;
            if (act[x.sku] && act[x.sku].costoU <= x.precio) continue; // ya hay una igual o más barata en uso
            if (cfg?.ofertasAuto && segura) { O.activas[x.sku] = { tienda: x.tienda, costoU: x.precio, precioBulto: x.precioBultoNuevo, hasta: hasta7, texto: x.texto, nombre: x.nombre, aprobo: "automático" }; solas++; }
            else pend.push(x);
          }
          O.pendientes = pend.sort((a, b) => b.ahorro - a.ahorro);
          O.corrida = { f: new Date().toISOString(), leidos, propuestas: mejor.size, solas, tiendas: [...new Set((b.candidatos || []).map(c => c.tienda))] };
        } else if (b.accion === "aprobar") {
          const x = O.pendientes.find(y => y.id === b.id); if (!x) return J({ error: "Esa oferta ya no está." }, 404);
          O.activas[x.sku] = { tienda: x.tienda, costoU: x.precio, precioBulto: x.precioBultoNuevo, hasta: /^\d{4}-\d{2}-\d{2}$/.test(b.hasta || "") ? b.hasta : hasta7, texto: x.texto, nombre: x.nombre, aprobo: u.nombre };
          O.alias[nk(x.texto)] = x.sku; // la próxima vez lo reconoce solo
          O.pendientes = O.pendientes.filter(y => y.id !== b.id);
        } else if (b.accion === "descartar") {
          const x = O.pendientes.find(y => y.id === b.id);
          if (x) { O.descartes[nk(x.texto) + "|" + x.sku] = 1; O.pendientes = O.pendientes.filter(y => y.id !== b.id); }
        } else if (b.accion === "quitar") delete O.activas[txt(b.sku, 30)];
        await guardarOfertas(O);
      }
      const act = vigentes(O.activas);
      const cf = await getStore("tienda").get("config", { type: "json" }).catch(() => null);
      return J({ pendientes: O.pendientes, activas: Object.entries(act).map(([sku, x]) => ({ sku, ...x })), corrida: O.corrida, auto: !!cf?.ofertasAuto });
    }

    // ---------- semáforo: ¿anda todo? ----------
    if (r === "estado") {
      const T = getStore("tienda");
      const [cfg, D, ped, fcfg, cert] = await Promise.all([T.get("config", { type: "json" }).catch(() => null), leerDatos(url.origin, { crudo: true }).catch(() => null), todosLosPedidos().catch(() => null), getStore("facturacion").get("cfg", { type: "json" }).catch(() => null), getStore("facturacion").get("cert", { type: "json" }).catch(() => null)]);
      const l = [];
      const add = (id, nombre, nivel, txt) => l.push({ id, nombre, nivel, txt }); // nivel: ok | aviso | error
      add("tienda", "Tienda abierta", cfg?.mantenimiento ? "aviso" : ped ? "ok" : "error", cfg?.mantenimiento ? "Está en modo mantenimiento: los clientes ven el cartel y piden por WhatsApp." : ped ? "La tienda y la base de pedidos responden bien." : "No se pudo leer la base de pedidos.");
      // precios: ¿se actualizaron hoy o ayer?
      const m = String(D?.fecha || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), dias = m ? Math.floor((Date.now() - 3 * 3600e3 - Date.UTC(+m[3], +m[2] - 1, +m[1])) / 864e5) : 99;
      add("precios", "Precios actualizados", dias <= 1 ? "ok" : dias <= 3 ? "aviso" : "error", D?.fecha ? `Última actualización: ${D.fecha}${dias > 1 ? ` (hace ${dias} días)` : ""}.` : "No hay precios cargados.");
      // Mercado Pago
      const mpTok = Netlify.env.get("MP_ACCESS_TOKEN");
      let mp = mpTok ? "aviso" : "error", mpTxt = mpTok ? "No se pudo comprobar la conexión con Mercado Pago." : "No está cargada la clave de Mercado Pago (MP_ACCESS_TOKEN).";
      if (mpTok) { const x = await fetch("https://api.mercadopago.com/users/me", { headers: { authorization: "Bearer " + mpTok }, signal: AbortSignal.timeout(5000) }).catch(() => null); if (x?.ok) { mp = "ok"; mpTxt = "Conectado: los pagos online funcionan."; } else if (x && (x.status === 401 || x.status === 403)) { mp = "error"; mpTxt = "Mercado Pago rechaza la clave: hay que cargarla de nuevo."; } }
      if (cfg?.pagos?.mp === false) { mp = "aviso"; mpTxt = "El pago con Mercado Pago está apagado en Medios de pago."; }
      add("mp", "Pagos con Mercado Pago", mp, mpTxt);
      add("mail", "Mails a clientes", Netlify.env.get("GMAIL_APP_PASSWORD") || Netlify.env.get("RESEND_API_KEY") ? "ok" : "error", Netlify.env.get("GMAIL_APP_PASSWORD") || Netlify.env.get("RESEND_API_KEY") ? "Configurados: salen desde el Gmail del negocio." : "No está cargada la contraseña de aplicación de Gmail (GMAIL_APP_PASSWORD).");
      // pedidos trabados
      const viejos = (ped || []).filter(o => ["nuevo", "preparando"].includes(etapaDe(o)) && Date.now() - new Date(o.fecha) > 3 * 864e5).length;
      add("pedidos", "Pedidos al día", viejos ? "aviso" : "ok", viejos ? `${viejos} pedido${viejos > 1 ? "s" : ""} de hace más de 3 días todavía sin entregar.` : "No hay pedidos trabados.");
      if (fcfg?.activo || fcfg?.alPagar) { const v = cert?.vence ? Math.floor((new Date(cert.vence) - Date.now()) / 864e5) : -1; add("factura", "Facturación ARCA", v > 30 ? "ok" : v >= 0 ? "aviso" : "error", v > 30 ? `Certificado al día (vence en ${v} días).` : v >= 0 ? `El certificado vence en ${v} días: renovalo en Facturación.` : "Falta el certificado o venció: las facturas no salen."); }
      return J({ items: l, peor: l.some(x => x.nivel === "error") ? "error" : l.some(x => x.nivel === "aviso") ? "aviso" : "ok", f: new Date().toISOString() });
    }

    // ---------- cuentas de clientes de la tienda (y pedidos de acceso mayorista) ----------
    if (r === "cuentas") {
      if (metodo === "POST") {
        if (u.rol !== "dueño") return J({ error: "Solo el dueño puede aprobar cuentas." }, 403);
        const c = await leerCuenta(b.email); if (!c) return J({ error: "No existe esa cuenta." }, 404);
        if (b.accion === "aprobar" && c.mayorista) { c.mayorista.estado = "aprobado"; c.mayorista.aprobo = u.nombre; c.mayorista.fa = new Date().toISOString(); }
        if (b.accion === "rechazar" && c.mayorista) c.mayorista.estado = "rechazado";
        if (b.accion === "baja") c.activo = false;
        if (b.accion === "alta") c.activo = true;
        await guardarCuenta(c);
        if (b.accion === "aprobar") await enviarMail({ to: c.email, subject: "Tu cuenta mayorista está aprobada - Proveeduría Virtual", html: `<p>¡Hola! Ya podés ver los precios y comprar en <b>📦 Mayoristas</b>. Entrá a la tienda con tu mail: ${url.origin}</p>` }).catch(() => {});
      }
      return J((await todasLasCuentas()).map(c => ({ email: c.email, nombre: c.nombre || "", telefono: c.telefono || "", alta: c.alta, activo: c.activo !== false, mayorista: c.mayorista || null, socio: c.socio || null })).sort((a, b) => String(b.alta).localeCompare(String(a.alta))));
    }

    // ---------- carritos que no terminaron la compra ----------
    if (r === "carritos") {
      const C = getStore("carritos"), { blobs } = await C.list();
      const ped = await todosLosPedidos(), compro = new Map();
      for (const o of ped) if (VENDIDO.includes(o.estado)) { const k = claveCliente(o); if (k && (!compro.has(k) || o.fecha > compro.get(k))) compro.set(k, o.fecha); }
      const l = (await Promise.all(blobs.map(x => C.get(x.key, { type: "json" }).catch(() => null)))).filter(Boolean)
        .filter(c => { const f = compro.get(claveCliente(c)); return !(f && f >= c.fecha) && Date.now() - new Date(c.fecha) > 30 * 60e3; }); // si compró después, no cuenta; y le damos media hora
      // pedidos que quedaron sin pagar (Mercado Pago abandonado o rechazado)
      for (const o of ped) if (etapaDe(o) === "esperando pago" && Date.now() - new Date(o.fecha) > 60 * 60e3 && !(compro.get(claveCliente(o)) >= o.fecha))
        l.push({ id: o.id, fecha: o.fecha, nombre: o.nombre, telefono: o.telefono, email: o.email || "", modo: o.modo, items: o.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })), total: o.total, motivo: "No terminó de pagar" });
      return J(l.map(c => ({ ...c, motivo: c.motivo || "Cargó el carrito y no compró" })).sort((a, b) => b.fecha.localeCompare(a.fecha)));
    }

    // ---------- stock ----------
    if (r === "stock") {
      if (metodo === "POST") {
        const filas = (b.filas || []).slice(0, 20000);
        await fijar(filas, ["importacion", "ingreso"].includes(b.tipo) ? b.tipo : "ajuste", u.nombre);
      }
      const [st, costos] = await Promise.all([leerStock(), leerCostos()]);
      return J({ stock: st, costos: costos || {} });
    }
    if (r === "movimientos") {
      const d = url.searchParams.get("desde"), h = url.searchParams.get("hasta"), ok = x => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
      return J(ok(d) && ok(h) ? await movimientosEntre(d, h) : await leerMovimientos(url.searchParams.get("mes") || undefined));
    }
    if (r === "ajustes") { // ficha de un producto del proveedor: precio a mano o esconderlo de la tienda
      const A = await leerAjustes();
      if (metodo === "POST") {
        const sku = txt(b.sku, 30); if (!sku) return J({ error: "Falta el producto." }, 400);
        const x = { oculto: !!b.oculto, pu: Math.max(0, Math.round(+b.pu || 0)), pb: Math.max(0, Math.round(+b.pb || 0)) };
        if (!x.oculto && !x.pu && !x.pb) delete A[sku]; else A[sku] = { ...x, f: new Date().toISOString(), q: u.nombre };
        await guardarAjustes(A);
      }
      return J(A);
    }
    if (r === "catalogo") { // lista liviana de productos para buscar y agregar al stock
      const [D, prop] = await Promise.all([leerDatos(url.origin, { crudo: true }), leerPropios()]); // con los escondidos y los propios sin stock, para poder abrir su ficha
      const cats = [...(D?.cats || [])], ci = n => { let i = cats.indexOf(n); if (i < 0) { cats.push(n); i = cats.length - 1; } return i; };
      const p = (D?.p || []).map(p => [p[0], p[1], p[2], p[3], p[4], p[5]]);
      for (const x of prop) p.push([ci(String(x.cat || "otros").toLowerCase()), x.sku, x.nombre, x.pu || 0, x.bu > 1 && x.pb ? x.pb * x.bu : 0, x.bu || 1, 1, x.intl ? 1 : 0]); // el 1 del final = producto propio
      return J({ cats, p });
    }

    // ---------- compras ----------
    if (r === "compras") {
      if (metodo === "POST") {
        if (!puede(u, "compras")) return J({ error: "sin permiso" }, 403);
        const c = await registrarCompra(b, u.nombre);
        // "Ya compré todo": los pedidos que estaban esperando la compra pasan a "Preparando"
        let preparando = 0;
        if (b.pasarPedidos !== false) {
          const P = getStore("pedidos"), solo = Array.isArray(b.pedidos) && b.pedidos.length ? new Set(b.pedidos.map(String)) : null;
          for (const o of await todosLosPedidos()) {
            if (etapaDe(o) !== "nuevo" || (solo && !solo.has(o.id))) continue;
            ponerEtapa(o, "preparando", u.nombre);
            await P.setJSON(o.id, o);
            preparando++;
          }
        }
        return J({ ok: true, compra: c, preparando });
      }
      const [st, D, costos, compras, ped] = await Promise.all([leerStock(), leerDatos(url.origin), leerCostos(), leerCompras(), todosLosPedidos()]);
      const ids = url.searchParams.get("pedidos"), nuevos = ped.filter(o => etapaDe(o) === "nuevo");
      const elegidos = ids != null ? nuevos.filter(o => ids.split(",").includes(o.id)) : nuevos;
      const secc = new Map(sugerirCompras(st, D, costos || {}, nuevos).map(x => [x.sku, x.seccion]));
      return J({ sugeridas: sugerirCompras(st, D, costos || {}, ids != null ? elegidos : null).map(x => ({ ...x, seccion: x.seccion || secc.get(x.sku) || "Stock mínimo" })), compras: compras.slice(0, 300) });
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
        const limpio = x => ({ sku: txt(x.sku, 30) || "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: txt(x.nombre, 200), cat: txt(x.cat, 40).toLowerCase() || "otros", pu: Math.max(0, Math.round(+x.pu || 0)), pb: Math.max(0, Math.round(+x.pb || 0)), bu: Math.max(1, Math.floor(+x.bu || 1)), costo: Math.max(0, +x.costo || 0), foto: /^https:\/\//.test(x.foto || "") ? txt(x.foto, 400) : "", activo: x.activo !== false, sinStock: !!x.sinStock, intl: !!x.intl });
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
      const [ped, st, D, costos] = await Promise.all([todosLosPedidos(), leerStock(), leerDatos(url.origin), leerCostos()]);
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
<h3>Para comprar al proveedor (${sug.length} productos${sug.length ? ", aprox. " + pl(sug.reduce((s, x) => s + x.costo, 0)) : ""})</h3>
${sug.length ? `<ul>${sug.slice(0, 80).map(x => `<li>${textoCantidad(x)} — ${es(x.nombre)}</li>`).join("")}</ul>` : "<p>Nada para comprar.</p>"}
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
