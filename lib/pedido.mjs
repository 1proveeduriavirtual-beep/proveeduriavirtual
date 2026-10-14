// Arma y valida un pedido con los precios guardados en la tienda (nunca con los que manda el navegador).
// Lo usan crear-pago (Mercado Pago) y crear-pedido (efectivo / transferencia).
import { getStore } from "@netlify/blobs";
import { leerDatos } from "./datos.mjs";
import { pctDe, conDescuento, norm } from "./cupon.mjs";
import { precioDe } from "./precios.mjs";
import { costoEnvio, turnos } from "./envio.mjs";
import { fichaDe } from "./clientes.mjs";
import { leerCostos } from "./inventario.mjs";
import { cuentaDe, esMayoristaAprobado } from "./cuentas.mjs";
import { leerMembresia, esSocio } from "./membresia.mjs";

const unesc = s => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const MINIMO = { bulto: 100000, unidad: 20000, intl: 20000 }; // mayoristas / supermercado / internacional

// Devuelve { error } o { ped } (sin id, fecha ni estado)
export async function armarPedido(b, site) {
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const calle = String(b.direccion || "").trim().slice(0, 160);
  const telefono = String(b.telefono || "").trim().slice(0, 30);
  const email = String(b.email || "").trim().slice(0, 120);
  const zona = b.zona === "CABA" || b.zona === "GBA" ? b.zona : "";
  const localidad = String(b.localidad || "").replace(/[<>]/g, "").trim().slice(0, 60);
  const dni = String(b.dni || "").replace(/[^\d-]/g, "").slice(0, 15);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Revisá el email (o dejalo vacío)." };
  if (!nombre || !calle || telefono.replace(/\D/g, "").length < 8) return { error: "Completá nombre, dirección y teléfono." };
  if (!zona) return { error: "Elegí tu zona (CABA o GBA)." };
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) return { error: "El carrito está vacío." };

  const T = getStore("tienda");
  const [D, cfg, costos, propios] = await Promise.all([leerDatos(site), T.get("config", { type: "json" }).catch(() => null), leerCostos(), getStore("inventario").get("propios", { type: "json" }).catch(() => null)]);
  const costoPropio = new Map((propios || []).map(x => [String(x.sku), +x.costo || 0]));
  if (!D) return { error: "No pude leer los precios.", status: 500 };
  const by = new Map(D.p.map(p => [p[1], p]));
  const modo = ["bulto", "intl"].includes(b.modo) ? b.modo : "unidad";
  const cuenta = b.t ? await cuentaDe(b.t).catch(() => null) : null;
  if (modo === "bulto" && cfg?.mayoristasRegistro && !esMayoristaAprobado(cuenta)) return { error: "Para comprar en Mayoristas necesitás tu cuenta mayorista aprobada. Entrá en 👤 Mi cuenta." };
  // Socios de la membresía (suscripción activa o marcados a mano en la ficha): descuento, envío gratis y/o sin mínimo en Mayoristas
  const ficha = await fichaDe({ telefono, email: email || cuenta?.email }).catch(() => null);
  const memb = await leerMembresia().catch(() => null), socio = !!(memb?.activa && esSocio(cuenta, ficha));
  const pctCupon = await pctDe(b.cupon), pct = Math.max(pctCupon || 0, socio ? memb.descuento || 0 : 0);
  const items = [];
  let subtotal = 0;
  for (const it of b.items) {
    const p = by.get(String(it.e));
    const n = Math.floor(Number(it.n));
    if (!p || !(n >= 1 && n <= 99)) return { error: "Hay un producto que ya no está disponible. Actualizá la página." };
    if ((p[11] === 1) !== (modo === "intl")) return { error: "Hay un producto de otra sección en el carrito. Actualizá la página." }; // Internacional va aparte
    const pr = precioDe(p, modo);
    if (!(pr.precio > 0)) return { error: "Hay un producto que no se vende en esta sección. Actualizá la página." };
    const precio = conDescuento(pr.precio, pct);
    const c = costos?.[p[1]], cu = c ? c[0] : costoPropio.get(p[1]) || 0, cb = c ? c[1] : cu;
    const costo = Math.round((pr.bulto ? cb * pr.unidades : cu) * 100) / 100; // lo que te cuesta a vos (para calcular la ganancia)
    items.push({ sku: p[1], nombre: ((pr.bulto ? `BULTO x${pr.unidades} - ` : "") + unesc(p[2])).slice(0, 250), cantidad: n, precio, ...(costo ? { costo } : {}), ...(pr.bulto ? { bulto: pr.unidades } : {}) });
    subtotal += precio * n;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  if (subtotal < MINIMO[modo] && !(socio && memb.mayoristaSinMinimo && modo === "bulto")) return { error: `La compra mínima es $ ${MINIMO[modo].toLocaleString("es-AR")}.` };

  // horario de entrega: tiene que ser uno de los turnos que ofrece la tienda (se acepta el de hace un rato por si cambió el día)
  const H = cfg?.horarios;
  const ok = new Set([...turnos(H), ...turnos(H, Date.now() - 2 * 3600e3)]);
  const entrega = String(b.entrega || "").trim();
  if (ok.size && !ok.has(entrega)) return { error: "Elegí el día y horario de entrega." };

  const envio = (ficha?.envioGratis && ficha.activo !== false) || (socio && memb.envioGratis) ? 0 : costoEnvio(cfg?.envio, zona, subtotal); // null = a coordinar; 0 si el dueño le dio envío gratis
  const total = subtotal + (envio || 0);
  return {
    ped: {
      modo, cuenta: cuenta?.email || undefined, cupon: pctCupon && pct === pctCupon ? norm(b.cupon) : undefined, descuento: pct || undefined, socio: socio || undefined, nombre, direccion: `${calle} (${zona})`, zona, telefono,
      email: email || undefined, localidad: localidad || undefined, dni: dni || undefined, entrega: entrega || undefined, subtotal, envio: envio ?? undefined, envioACoordinar: envio === null || undefined, total, items,
    },
  };
}
