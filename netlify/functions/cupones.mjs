import { getStore } from "@netlify/blobs";
import { autorizar, puede } from "../../lib/auth.mjs";
import { norm, pctDe } from "../../lib/cupon.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("cupones");
  const k = url.searchParams.get("k");
  if (!k) { // público: validar un código
    const c = norm(url.searchParams.get("c"));
    const pct = await pctDe(c);
    return pct ? J({ ok: true, codigo: c, pct }) : J({ ok: false, error: "Cupón inválido o vencido." }, 404);
  }
  if (!(await autorizar(req, "promos"))) return J({ error: "clave incorrecta o sin permiso" }, 401);
  if (req.method === "POST") {
    const b = await req.json();
    const c = norm(b.codigo);
    if (b.borrar) { await store.delete(c); return J({ ok: true }); }
    const pct = Math.floor(Number(b.pct));
    if (!c || !(pct >= 1 && pct <= 90)) return J({ error: "Código o % inválido (1 a 90)." }, 400);
    const vence = /^\d{4}-\d{2}-\d{2}$/.test(b.vence || "") ? b.vence : "";
    await store.setJSON(c, { codigo: c, pct, vence });
    return J({ ok: true });
  }
  const { blobs } = await store.list();
  return J((await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean));
};
