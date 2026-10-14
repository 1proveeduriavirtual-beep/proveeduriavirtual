// La tienda avisa qué tiene cargado un cliente que empezó a completar sus datos y todavía no pagó.
// Sirve para la lista de "carritos que no terminaron la compra" del panel. Solo guarda lo último de cada carrito.
import { getStore } from "@netlify/blobs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const t = (v, n) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);

export default async (req) => {
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b; try { b = await req.json(); } catch { return J({ error: "inválido" }, 400); }
  const cid = String(b.cid || "");
  if (!/^[a-z0-9-]{8,40}$/i.test(cid)) return J({ error: "inválido" }, 400);
  const C = getStore("carritos");
  if (b.listo) { await C.delete(cid).catch(() => {}); return J({ ok: true }); } // compró: se borra
  const telefono = t(b.telefono, 30), email = t(b.email, 120).toLowerCase();
  if (telefono.replace(/\D/g, "").length < 8 && !/@/.test(email)) return J({ ok: true }); // sin forma de contactarlo, no sirve
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 100).map(i => ({ nombre: t(i.nombre, 200), cantidad: Math.max(1, Math.min(999, Math.floor(+i.cantidad || 1))), precio: Math.max(0, Math.round(+i.precio || 0)) })).filter(i => i.nombre);
  if (!items.length) return J({ ok: true });
  await C.setJSON(cid, { id: cid, fecha: new Date().toISOString(), nombre: t(b.nombre, 80), telefono, email, modo: b.modo === "bulto" ? "bulto" : "unidad", items, total: items.reduce((s, i) => s + i.precio * i.cantidad, 0) });
  return J({ ok: true });
};
