// Ofertas de las revistas semanales de otros mayoristas (Diarco, Vital, Makro, Yaguar).
// Un robot de GitHub baja las revistas, las lee (OCR) y manda lo que leyó. Acá se compara con nuestro catálogo:
// solo se proponen productos que coinciden en marca y tamaño, y cuyo precio es más barato que el del proveedor principal
// pero no absurdo (para descartar errores de lectura). Nada se aplica solo: el dueño aprueba cada oferta en el panel,
// y lo que aprueba se aprende para las semanas siguientes.
import { getStore } from "@netlify/blobs";

const S = () => getStore("ofertas");
export const leerOfertas = async () => (await S().get("estado", { type: "json" }).catch(() => null)) || { pendientes: [], activas: {}, alias: {}, descartes: {}, corrida: null };
export const guardarOfertas = o => S().setJSON("estado", o);

const sinTildes = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALABRAS_VACIAS = new Set(["x", "de", "del", "la", "el", "en", "con", "sin", "por", "para", "un", "una", "y", "c/u", "cu", "oferta", "precio", "unidad", "un.", "pack"]);
// Tamaño normalizado: "1 kg" -> "1000g", "900 cc" / "900 ml" -> "900ml", "1,5 lt" -> "1500ml", "x 6" no cuenta
export function tamano(txt) {
  const t = sinTildes(txt).replace(/,/g, ".");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|gr|grs|g|lt|lts|l|litro|litros|cc|ml|cm3)\b/);
  if (!m) return "";
  let v = +m[1]; const u = m[2];
  if (/^k/.test(u)) return Math.round(v * 1000) + "g";
  if (/^g/.test(u)) return Math.round(v) + "g";
  if (/^(l|lt|lts|litro|litros)$/.test(u)) return Math.round(v * 1000) + "ml";
  return Math.round(v) + "ml";
}
export const palabras = txt => [...new Set(sinTildes(txt).replace(/&[a-z#0-9]+;/g, " ").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(w => w.length >= 3 && !PALABRAS_VACIAS.has(w) && !/^\d+$/.test(w)))];

// Mejor producto del catálogo para un texto leído de la revista (o null)
export function buscarProducto(texto, catalogo, alias = {}) {
  const k = sinTildes(texto).replace(/\s+/g, " ").trim();
  if (alias[k]) return { sku: alias[k], puntaje: 1, aprendido: true };
  const w = palabras(texto), tam = tamano(texto);
  if (w.length < 2) return null;
  let mejor = null;
  for (const p of catalogo) {
    const pw = p.w || (p.w = palabras(p.nombre)), pt = p.t ?? (p.t = tamano(p.nombre));
    if (tam && pt && tam !== pt) continue; // el tamaño tiene que coincidir
    const comunes = w.filter(x => pw.includes(x)).length;
    if (comunes < 2) continue; // al menos marca + tipo
    const puntaje = comunes / Math.max(w.length, Math.min(pw.length, 6)) + (tam && tam === pt ? 0.25 : 0);
    if (!mejor || puntaje > mejor.puntaje) mejor = { sku: p.sku, puntaje };
  }
  return mejor && mejor.puntaje >= 0.55 ? mejor : null;
}

// Compara una oferta con el costo del proveedor principal: solo vale si es entre 5% y 50% más barata
export function ofertaRazonable(precio, costoUnidad) {
  if (!(precio > 0) || !(costoUnidad > 0)) return false;
  const r = precio / costoUnidad;
  return r >= 0.5 && r <= 0.95;
}

// Ofertas aprobadas y vigentes: { sku: { tienda, costoU, hasta } }
export function vigentes(activas, hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)) {
  return Object.fromEntries(Object.entries(activas || {}).filter(([, o]) => !o.hasta || o.hasta >= hoy));
}
