// Ofertas de las revistas semanales de otros mayoristas (Diarco, Vital, Makro, Yaguar).
// Un robot de GitHub baja las revistas, las lee (OCR) y manda lo que leyó. Acá se compara con nuestro catálogo:
// solo se proponen productos que coinciden en marca y tamaño (nunca se crean productos nuevos), y cuyo precio es más barato que el del proveedor principal
// pero no absurdo (para descartar errores de lectura). Las seguras se aplican solas (se puede apagar en el panel); las dudosas quedan para revisar,
// y lo que aprueba se aprende para las semanas siguientes.
import { getStore } from "@netlify/blobs";

const S = () => getStore("ofertas");
export const leerOfertas = async () => (await S().get("estado", { type: "json" }).catch(() => null)) || { pendientes: [], activas: {}, alias: {}, descartes: {}, corrida: null };
export const guardarOfertas = o => S().setJSON("estado", o);

const sinTildes = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALABRAS_VACIAS = new Set(["x", "de", "del", "la", "el", "en", "con", "sin", "por", "para", "un", "una", "y", "c/u", "cu", "oferta", "precio", "unidad", "un.", "pack",
  "bolsa", "pet", "lata", "botella", "caja", "paquete", "sachet", "doypack", "frasco", "vidrio", "envase", "bot", "paq",
  "grs", "gr", "kg", "kgs", "cc", "ml", "lt", "lts", "cm3", "kilo", "kilos", "litro", "litros", "unid", "unidades", "uni"]);
// Variantes: si nuestro producto es "light" y la revista no lo dice, es otro producto
const VARIANTES = ["light", "zero", "diet", "descremada", "descremado", "semidescremada", "deslactosada", "integral", "sin", "azucar", "sal", "tacc", "liviana", "mini", "max", "plus", "ultra", "clasica", "clasico", "original", "suave", "intensa", "intenso", "tinto", "blanco", "rosado", "brut", "dulce"];
const grado = t => (sinTildes(t).match(/\b0{3,4}\b/) || [""])[0]; // harina 000 / 0000
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
  // La IA escribe la MARCA primero y en mayúsculas ("NATURA Salsa golf"): esa marca tiene que estar en nuestro producto
  const mm = String(texto).match(/^((?:[A-ZÁÉÍÓÚÑ0-9&'.]{2,}\s+){1,3})(?=[A-ZÁÉÍÓÚÑ]?[a-záéíóúñ])/);
  const marca = mm ? sinTildes(mm[1]).split(/\s+/).map(t => t.replace(/[^a-z0-9ñ]/g, "")).filter(t => t.length >= 2 && !PALABRAS_VACIAS.has(t)) : [];
  const tieneMarca = nombre => { const n = sinTildes(nombre), compacto = n.replace(/[^a-z0-9ñ]/g, ""), pal = n.split(/[^a-z0-9ñ&]+/).map(t => t.replace(/&/g, ""));
    return marca.every(t => t.length >= 4 ? compacto.includes(t) : pal.includes(t)); };
  if (w.length < 2) return null;
  // Cuántos productos del catálogo usan cada palabra: las palabras raras son la marca ("playadito"), las comunes el tipo ("yerba", "mate")
  if (!catalogo.frec) { catalogo.frec = new Map(); for (const p of catalogo) for (const x of (p.w || (p.w = palabras(p.nombre)))) catalogo.frec.set(x, (catalogo.frec.get(x) || 0) + 1); }
  const rara = x => (catalogo.frec.get(x) || 0) <= Math.max(3, catalogo.length * 0.01);
  let mejor = null;
  for (const p of catalogo) {
    const pw = p.w || (p.w = palabras(p.nombre)), pt = p.t ?? (p.t = tamano(p.nombre));
    if (tam && pt && tam !== pt) continue; // el tamaño tiene que coincidir
    if (marca.length && !tieneMarca(p.nombre)) continue; // otra marca (todas las palabras de la marca tienen que estar)
    const comun = w.filter(x => pw.includes(x)), comunes = comun.length;
    if (comunes < 2) continue; // al menos marca + tipo
    if (grado(texto) !== grado(p.nombre)) continue; // harina 0000 no es harina 000
    const tw = sinTildes(texto);
    if (VARIANTES.some(v => new RegExp("\\b" + v + "\\b").test(sinTildes(p.nombre)) !== new RegExp("\\b" + v + "\\b").test(tw))) continue; // light, zero, etc. tienen que coincidir
    if (!comun.some(rara)) continue; // tiene que coincidir la marca: "Yerba mate Taragüi" nunca es "Yerba mate Playadito"
    const minComun = Math.min(...comun.map(x => catalogo.frec.get(x) || 0));
    if (w.some(x => !pw.includes(x) && (catalogo.frec.get(x) || 0) > 0 && catalogo.frec.get(x) <= minComun)) continue; // nombra otra marca que también vendemos
    const puntaje = comunes / Math.max(w.length, Math.min(pw.length, 6)) + (tam && tam === pt ? 0.25 : 0);
    // "completo": aparece el nombre entero de nuestro producto (con su tamaño). Solo esas se pueden aplicar solas.
    const completo = pw.every(x => w.includes(x)) && (!pt || tam === pt);
    // "seguro" para aplicar solo: nombre completo, o mismo tamaño y al menos 2/3 del nombre (la marca ya coincide sí o sí)
    // si la oferta junta dos productos ("Shampoo y Acondicionador", "crackers / salvado") no se aplica sola: queda para revisar
    const varios = /\s(y|o)\s|\//i.test(texto.replace(/\b\d+\s*\/\s*\d+/g, ""));
    const seguro = !varios && (completo || (!!tam && tam === pt && comunes / pw.length >= 0.66));
    if (!mejor || puntaje > mejor.puntaje) mejor = { sku: p.sku, puntaje, completo, seguro };
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
