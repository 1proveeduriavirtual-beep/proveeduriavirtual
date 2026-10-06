// Pedidos para el panel.
//   GET  -> lista (el repartidor solo ve los que tiene asignados)
//   POST {id, etapa: "nuevo"|"preparando"|"en camino"|"entregado"|"cancelado"} · {id, estado:"pagado"} · {id, repartidor} · {id, borrar:true}
import { getStore } from "@netlify/blobs";
import { facturarAlPagar, facturarAuto } from "../../lib/arca.mjs";
import { mailCliente } from "../../lib/aviso.mjs";
import { autorizar, puede } from "../../lib/auth.mjs";
import { descontarPedido, devolverPedido } from "../../lib/inventario.mjs";
import { todosLosPedidos } from "../../lib/listado.mjs";
import { ETAPAS, etapaDe, ponerEtapa } from "../../lib/etapa.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const u = await autorizar(req);
  if (!u || !(puede(u, "pedidos") || puede(u, "entregas"))) return J({ error: "clave incorrecta o sin permiso" }, 401);
  const url = new URL(req.url);
  const store = getStore("pedidos");
  if (req.method === "POST") {
    const b = await req.json();
    const { id, estado, borrar, repartidor } = b;
    const o = await store.get(String(id), { type: "json" });
    if (!o) return J({ error: "no existe" }, 404);
    if (borrar) {
      if (!puede(u, "pedidos") || u.rol === "deposito") return J({ error: "sin permiso para borrar" }, 403);
      if (o.factura?.prod) return J({ error: "Este pedido tiene factura electrónica: no se puede borrar." }, 409);
      await devolverPedido(o).catch(() => {}); // si no se entregó, el stock vuelve
      await store.delete(String(id)); return J({ ok: true });
    }
    if (repartidor !== undefined) { // asignar repartidor
      if (!puede(u, "pedidos")) return J({ error: "sin permiso" }, 403);
      o.repartidor = String(repartidor || "") || undefined;
      await store.setJSON(o.id, o);
      return J({ ok: true });
    }
    // los botones mandan la etapa como "estado" (nuevo, preparando, en camino, entregado, cancelado)
    const etapa = b.etapa || (ETAPAS.includes(estado) ? estado : null);
    if (etapa) {
      if (!ETAPAS.includes(etapa)) return J({ error: "estado inválido" }, 400);
      if (u.rol === "repartidor" && !["en camino", "entregado"].includes(etapa)) return J({ error: "sin permiso" }, 403);
      if (u.rol === "repartidor" && o.repartidor && o.repartidor !== u.usuario) return J({ error: "Ese pedido es de otro repartidor." }, 403);
      if (etapa === "cancelado" && (!puede(u, "pedidos") || u.rol === "deposito")) return J({ error: "sin permiso para cancelar" }, 403);
      if (etapaDe(o) === "esperando pago" && etapa !== "cancelado") return J({ error: "Ese pedido todavía no está pagado." }, 409);
      const antes = etapaDe(o);
      if (antes === etapa) return J({ ok: true });
      if (etapa === "cancelado") { await devolverPedido(o).catch(() => {}); o.stockDescontado = false; }
      ponerEtapa(o, etapa, u.nombre);
      await store.setJSON(o.id, o);
      if (etapa === "en camino") await mailCliente(o, "sale");
      if (etapa === "entregado") {
        await mailCliente(o, "entregado");
        // si está activado "facturar al entregar", la factura sale sola (y le llega por mail al cliente)
        if (!o.factura) await facturarAuto(o.id, url.origin, "entregar");
      }
      return J({ ok: true, etapa });
    }
    if (estado !== "pagado") return J({ error: "estado inválido" }, 400);
    if (!puede(u, "pedidos")) return J({ error: "sin permiso" }, 403);
    o.estado = "pagado";
    await store.setJSON(o.id, o);
    await descontarPedido(o, store).catch(() => {});
    // transferencia confirmada a mano: factura sola si está activado "al pagar"
    if (!o.factura) await facturarAlPagar(o.id, url.origin);
    return J({ ok: true });
  }
  let l = await todosLosPedidos();
  if (u.rol === "repartidor") l = l.filter(o => o.repartidor === u.usuario && !["entregado", "cancelado", "esperando pago"].includes(etapaDe(o)));
  l = l.map(o => ({ ...o, etapaActual: etapaDe(o) }));
  return J(l);
};
