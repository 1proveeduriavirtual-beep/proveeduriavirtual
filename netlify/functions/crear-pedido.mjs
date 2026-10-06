import { getStore } from "@netlify/blobs";
import { avisarPedido, mailCliente } from "../../lib/aviso.mjs";
import { armarPedido } from "../../lib/pedido.mjs";
import { descontarPedido } from "../../lib/inventario.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Pedidos sin Mercado Pago: efectivo al recibir o transferencia directa.
export default async (req) => {
  const pg = (await getStore("tienda").get("config", { type: "json" }).catch(() => null))?.pagos || {};
  const alias = pg.transferencia ? pg.alias : (Netlify.env.get("ALIAS_TRANSFERENCIA") || "").trim();
  const efectivo = pg.efectivo !== false;
  if (req.method === "GET") return J({ transferencia: !!alias, alias, efectivo, mp: pg.mp !== false });
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  const metodo = b.metodo === "transferencia" ? "transferencia" : b.metodo === "efectivo" ? "efectivo" : null;
  if (!metodo || (metodo === "transferencia" && !alias) || (metodo === "efectivo" && !efectivo)) return J({ error: "Forma de pago no disponible." }, 400);
  const r = await armarPedido(b, new URL(req.url).origin);
  if (r.error) return J({ error: r.error }, r.status || 400);
  const id = crypto.randomUUID();
  const ped = {
    id, fecha: new Date().toISOString(), ...r.ped,
    estado: metodo === "efectivo" ? "efectivo al recibir" : "espera transferencia",
    pago: { medio: metodo === "efectivo" ? "efectivo" : "transferencia" },
  };
  const P = getStore("pedidos");
  await P.setJSON(id, ped);
  await descontarPedido(ped, P).catch(e => console.error("stock:", e?.message)); // el stock baja solo con cada venta
  await Promise.all([avisarPedido(ped, metodo === "efectivo" ? "Nuevo pedido: pagás al recibir" : "Nuevo pedido: espera transferencia"), mailCliente(ped, "recibido")]);
  return J({ ok: true, id, total: ped.total, envio: ped.envio ?? null, alias: metodo === "transferencia" ? alias : undefined });
};
