// Pedidos para el panel.
//   GET  -> lista (el repartidor solo ve los que tiene asignados)
//   POST {id, estado: "pagado"|"en camino"|"entregado"} · {id, repartidor} · {id, borrar:true}
import { getStore } from "@netlify/blobs";
import { facturarAlPagar } from "../../lib/arca.mjs";
import { mailCliente } from "../../lib/aviso.mjs";
import { autorizar, puede } from "../../lib/auth.mjs";
import { descontarPedido, devolverPedido } from "../../lib/inventario.mjs";
import { todosLosPedidos } from "../../lib/listado.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const u = await autorizar(req);
  if (!u || !(puede(u, "pedidos") || puede(u, "entregas"))) return J({ error: "clave incorrecta o sin permiso" }, 401);
  const url = new URL(req.url);
  const store = getStore("pedidos");
  if (req.method === "POST") {
    const { id, estado, borrar, repartidor } = await req.json();
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
    if (!["pagado", "en camino", "entregado"].includes(estado)) return J({ error: "estado inválido" }, 400);
    if (estado === "pagado" && !puede(u, "pedidos")) return J({ error: "sin permiso" }, 403);
    if (u.rol === "repartidor" && o.repartidor && o.repartidor !== u.usuario) return J({ error: "Ese pedido es de otro repartidor." }, 403);
    if (estado === "en camino") o.sale = true; // el pedido sigue con su estado de pago, solo se marca que salió
    else o.estado = estado;
    if (estado === "entregado") { o.entregado = new Date().toISOString(); o.entregoPor = u.nombre; }
    await store.setJSON(o.id, o);
    if (estado === "pagado") await descontarPedido(o, store).catch(() => {});
    if (estado === "en camino") await mailCliente(o, "sale");
    if (estado === "entregado") await mailCliente(o, "entregado");
    // transferencia confirmada a mano: factura sola si está activado "al pagar"
    if (estado === "pagado" && !o.factura) await facturarAlPagar(o.id, url.origin);
    return J({ ok: true });
  }
  let l = await todosLosPedidos();
  if (u.rol === "repartidor") l = l.filter(o => o.repartidor === u.usuario && o.estado !== "entregado");
  return J(l);
};
