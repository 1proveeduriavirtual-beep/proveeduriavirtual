// Envío y horarios de entrega. Se configuran en el panel (store "tienda", clave "config": envio y horarios).
// La misma cuenta se hace en la tienda (index.html) para mostrarla y acá para cobrarla.

// envio: { caba, gba, gratisDesde }  (null/"" = "a coordinar por WhatsApp", 0 = gratis)
export function costoEnvio(envio, zona, subtotal) {
  const e = envio || {};
  const base = zona === "CABA" ? e.caba : zona === "GBA" ? e.gba : null;
  if (base === null || base === undefined || base === "" || !(Number(base) >= 0)) return null; // a coordinar
  if (Number(e.gratisDesde) > 0 && subtotal >= Number(e.gratisDesde)) return 0;
  return Math.round(Number(base));
}

// horarios: { dias: [1..6] (0=domingo), franjas: ["9 a 13 hs", ...], anticipacion: 1 }
export const HORARIOS_DEF = { dias: [1, 2, 3, 4, 5, 6], franjas: ["9 a 13 hs", "14 a 18 hs"], anticipacion: 1 };
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Turnos para los próximos 7 días hábiles (hora Argentina). Ej: "Mié 8/10 · 9 a 13 hs"
export function turnos(horarios, ahora = Date.now()) {
  const h = { ...HORARIOS_DEF, ...(horarios || {}) };
  const dias = Array.isArray(h.dias) && h.dias.length ? h.dias.map(Number) : HORARIOS_DEF.dias;
  const franjas = (Array.isArray(h.franjas) ? h.franjas : []).map(f => String(f).trim()).filter(Boolean);
  if (!franjas.length) return [];
  const ar = new Date(ahora - 3 * 3600e3); // Argentina = UTC-3, sin horario de verano
  const out = [];
  for (let d = Math.max(0, Number(h.anticipacion) || 0), n = 0; n < 7 && d < 30; d++) {
    const f = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + d));
    if (!dias.includes(f.getUTCDay())) continue;
    n++;
    for (const fr of franjas) out.push(`${DIAS[f.getUTCDay()]} ${f.getUTCDate()}/${f.getUTCMonth() + 1} · ${fr}`);
  }
  return out;
}
