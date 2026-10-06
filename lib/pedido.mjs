// Arma y valida un pedido con los precios guardados en la tienda (nunca con los que manda el navegador).
// Lo usan crear-pago (Mercado Pago) y crear-pedido (efectivo / transferencia).
import { getStore } from "@netlify/blobs";
import { leerDatos } from "./datos.mjs";
import { pctDe, conDescuento, norm } from "./cupon.mjs";
import { precioDe } from "./precios.mjs";
import { costoEnvio, turnos } from "./envio.mjs";

const unesc = s => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const MINIMO = { bulto: 100000, unidad: 20000 }; // mayoristas / supermercado

// Devuelve { error } o { ped } (sin id, fecha ni estado)
export async function armarPedido(b, site) {
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const calle = String(b.direccion || "").trim().slice(0, 160);
  const telefono = String(b.telefono || "").trim().slice(0, 30);
  const email = String(b.email || "").trim().slice(0, 120);
  const zona = b.zona === "CABA" || b.zona === "GBA" ? b.zona : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Revisá el email (o dejalo vacío)." };
  if (!nombre || !calle || telefono.replace(/\D/g, "").length < 8) return { error: "Completá nombre, dirección y teléfono." };
  if (!zona) return { error: "Elegí tu zona (CABA o GBA)." };
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) return { error: "El carrito está vacío." };

  const [D, cfg] = await Promise.all([leerDatos(site), getStore("tienda").get("config", { type: "json" }).catch(() => null)]);
  if (!D) return { error: "No pude leer los precios.", status: 500 };
  const by = new Map(D.p.map(p => [p[1], p]));
  const pct = await pctDe(b.cupon);
  const modo = b.modo === "bulto" ? "bulto" : "unidad";
  const items = [];
  let subtotal = 0;
  for (const it of b.items) {
    const p = by.get(String(it.e));
    const n = Math.floor(Number(it.n));
    if (!p || !(n >= 1 && n <= 99)) return { error: "Hay un producto que ya no está disponible. Actualizá la página." };
    const pr = precioDe(p, modo);
    const precio = conDescuento(pr.precio, pct);
    items.push({ sku: p[1], nombre: ((pr.bulto ? `BULTO x${pr.unidades} - ` : "") + unesc(p[2])).slice(0, 250), cantidad: n, precio, ...(pr.bulto ? { bulto: pr.unidades } : {}) });
    subtotal += precio * n;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  if (subtotal < MINIMO[modo]) return { error: `La compra mínima es $ ${MINIMO[modo].toLocaleString("es-AR")}.` };

  // horario de entrega: tiene que ser uno de los turnos que ofrece la tienda (se acepta el de hace un rato por si cambió el día)
  const H = cfg?.horarios;
  const ok = new Set([...turnos(H), ...turnos(H, Date.now() - 2 * 3600e3)]);
  const entrega = String(b.entrega || "").trim();
  if (ok.size && !ok.has(entrega)) return { error: "Elegí el día y horario de entrega." };

  const envio = costoEnvio(cfg?.envio, zona, subtotal); // null = a coordinar
  const total = subtotal + (envio || 0);
  return {
    ped: {
      modo, cupon: pct ? norm(b.cupon) : undefined, descuento: pct || undefined, nombre, direccion: `${calle} (${zona})`, zona, telefono,
      email: email || undefined, entrega: entrega || undefined, subtotal, envio: envio ?? undefined, envioACoordinar: envio === null || undefined, total, items,
    },
  };
}
