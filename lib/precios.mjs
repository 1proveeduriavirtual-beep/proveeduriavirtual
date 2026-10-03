// Convierte el archivo que baja el marcador de Maxi (maxi_productos.txt) en los datos de la tienda.
// Formato del archivo:
//   #cats|categoria0|categoria1|...
//   #formato: cat|ean|minimo|precio_maxi|nombre
//   0|7790310920398||1275|(g)palitos rueditas pep x 40 grs
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Precio de venta = precio Maxi + margen %, redondeado para arriba a $10 (misma cuenta que la actualización automática).
export const precioVenta = (pm, margen) => Math.ceil(Math.round(pm * 100) * (10000 + Math.round(margen * 100)) / 1e7) * 10;

export function fechaHoy() {
  const p = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value;
  return `${g("day")}/${g("month")}/${g("year")}`;
}

export function parseMaxi(txt, margen, ordenPrevio = []) {
  const lines = String(txt || "").replace(/\r/g, "").split("\n");
  const head = lines.find(l => l.startsWith("#cats|"));
  if (!head) throw new Error("El archivo no es el de Maxi (falta la línea #cats). Bajalo de nuevo con el marcador.");
  const cats = head.slice(6).split("|").map(s => s.trim()).filter(Boolean);
  const seen = new Set(), p = [];
  for (const l of lines) {
    if (!l || l.startsWith("#")) continue;
    const f = l.split("|");
    if (f.length < 5) continue;
    const cat = Number(f[0]), ean = f[1].trim(), pm = parseFloat(f[3]);
    const nombre = f.slice(4).join("/").replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (!(cat >= 0 && cat < cats.length) || !/^\d{6,14}$/.test(ean) || !(pm > 0) || !nombre || seen.has(ean)) continue;
    seen.add(ean);
    p.push([cat, ean, esc(nombre), precioVenta(pm, margen)]);
  }
  p.sort((a, b) => a[0] - b[0] || (norm(a[2]) < norm(b[2]) ? -1 : norm(a[2]) > norm(b[2]) ? 1 : 0) || (a[1] < b[1] ? -1 : 1));
  // sacar categorías vacías y reindexar
  // mismo orden de categorías que ya tenía la tienda; las nuevas van al final
  const pos = c => { const i = ordenPrevio.indexOf(cats[c]); return i < 0 ? 1000 + c : i; };
  const used = [...new Set(p.map(r => r[0]))].sort((a, b) => pos(a) - pos(b));
  const idx = new Map(used.map((c, i) => [c, i]));
  const out = p.map(r => [idx.get(r[0]), r[1], r[2], r[3]]);
  out.sort((a, b) => a[0] - b[0] || (norm(a[2]) < norm(b[2]) ? -1 : norm(a[2]) > norm(b[2]) ? 1 : 0) || (a[1] < b[1] ? -1 : 1));
  return { cats: used.map(c => cats[c]), p: out };
}

// "1/10/2026" -> 20261001 (para comparar cuál versión es más nueva)
export const fechaNum = f => { const m = String(f || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
