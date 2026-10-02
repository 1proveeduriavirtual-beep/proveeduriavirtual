import { getStore } from "@netlify/blobs";
export const norm = c => String(c || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
// devuelve el % de descuento (0 si no existe o está vencido)
export async function pctDe(codigo) {
  const c = norm(codigo);
  if (!c) return 0;
  const o = await getStore("cupones").get(c, { type: "json" });
  if (!o || !(o.pct > 0 && o.pct <= 90)) return 0;
  if (o.vence && new Date(o.vence + "T23:59:59-03:00") < new Date()) return 0;
  return o.pct;
}
export const conDescuento = (precio, pct) => Math.round(precio * (1 - pct / 100) * 100) / 100;
