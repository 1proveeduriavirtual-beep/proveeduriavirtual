import { getStore } from "@netlify/blobs";
import { facturarAlPagar } from "../../lib/arca.mjs";
import { mailCliente } from "../../lib/aviso.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const key = Netlify.env.get("ADMIN_KEY");
  const url = new URL(req.url);
  if (!key || url.searchParams.get("k") !== key) return J({ error: "clave incorrecta" }, 401);
  const store = getStore("pedidos");
  if (req.method === "POST") { // marcar entregado
    const { id, estado, borrar } = await req.json();
    if (borrar) {
      const p = await store.get(String(id), { type: "json" });
      if (p?.factura?.prod) return J({ error: "Este pedido tiene factura electrónica: no se puede borrar." }, 409);
      await store.delete(String(id)); return J({ ok: true });
    }
    const o = await store.get(String(id), { type: "json" });
    if (!o || !["pagado", "en camino", "entregado"].includes(estado)) return J({ error: "no existe" }, 404);
    if (estado === "en camino") o.sale = true; // el pedido sigue con su estado de pago, solo se marca que salió
    else o.estado = estado;
    await store.setJSON(o.id, o);
    if (estado === "en camino") await mailCliente(o, "sale");
    if (estado === "entregado") await mailCliente(o, "entregado");
    // transferencia confirmada a mano: factura sola si está activado "al pagar"
    if (estado === "pagado" && !o.factura) await facturarAlPagar(o.id, url.origin);
    return J({ ok: true });
  }
  const { blobs } = await store.list();
  const all = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })));
  return J(all.filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha)));
};
