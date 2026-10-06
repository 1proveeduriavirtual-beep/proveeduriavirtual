import { getStore } from "@netlify/blobs";
import { avisarPedido, mailCliente } from "../../lib/aviso.mjs";
import { armarPedido } from "../../lib/pedido.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Pedidos sin Mercado Pago: efectivo al recibir o transferencia directa.
export default async (req) => {
  const alias = (Netlify.env.get("ALIAS_TRANSFERENCIA") || "").trim();
  if (req.method === "GET") return J({ transferencia: !!alias, alias });
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }
  const metodo = b.metodo === "transferencia" ? "transferencia" : b.metodo === "efectivo" ? "efectivo" : null;
  if (!metodo || (metodo === "transferencia" && !alias)) return J({ error: "Forma de pago no disponible." }, 400);
  const r = await armarPedido(b, new URL(req.url).origin);
  if (r.error) return J({ error: r.error }, r.status || 400);
  const id = crypto.randomUUID();
  const ped = {
    id, fecha: new Date().toISOString(), ...r.ped,
    estado: metodo === "efectivo" ? "efectivo al recibir" : "espera transferencia",
    pago: { medio: metodo === "efectivo" ? "efectivo" : "transferencia" },
  };
  await getStore("pedidos").setJSON(id, ped);
  await Promise.all([avisarPedido(ped, metodo === "efectivo" ? "Nuevo pedido: pagás al recibir" : "Nuevo pedido: espera transferencia"), mailCliente(ped, "recibido")]);
  return J({ ok: true, total: ped.total, envio: ped.envio ?? null, alias: metodo === "transferencia" ? alias : undefined });
};
