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

// Archivo del marcador de Maxiconsumo (maxiconsumo_productos.txt):
//   #maxiconsumo|sucursal|cache/xxxx/        (prefijo de las fotos)
//   #cats|almacén|bebidas|...
//   cat|sku|stock(1/0)|precio_bulto|precio_suelto|unidades_bulto|nombre|foto
// Fila de la tienda: [cat, sku, nombre, venta_unidad, venta_bulto (el bulto entero), unidades_bulto, foto]
// Los productos sin stock no se publican.
export function parseMaxiconsumo(txt, margen, margenBulto, ordenPrevio = []) {
  const lines = String(txt || "").replace(/\r/g, "").split("\n");
  const h0 = (lines[0] || "").split("|");
  if (h0[0] !== "#maxiconsumo") throw new Error("El archivo no es el de Maxiconsumo. Bajalo de nuevo con el marcador.");
  const img = /^cache\/[\w]+\/$/.test(h0[2] || "") ? h0[2] : "";
  const head = lines.find(l => l.startsWith("#cats|"));
  if (!head) throw new Error("Al archivo le falta la línea #cats. Bajalo de nuevo con el marcador.");
  const cats = head.slice(6).split("|").map(x => x.trim()).filter(Boolean);
  const promoL = lines.find(l => l.startsWith("#promo|"));
  const promo = new Set(promoL ? promoL.slice(7).split(",").map(x => x.trim()).filter(Boolean) : []);
  const seen = new Set(), p = [], costos = {};
  let sinStock = 0;
  for (const l of lines) {
    if (!l || l.startsWith("#")) continue;
    const f = l.split("|");
    if (f.length < 7) continue;
    const cat = Number(f[0]), sku = f[1].trim(), stock = f[2] === "1";
    const pb = parseFloat(f[3]) || 0, pu = parseFloat(f[4]) || 0, bu = Math.max(1, Math.floor(Number(f[5]) || 1));
    const nombre = f.slice(6, f.length > 7 ? -1 : undefined).join("/").replace(/\s+/g, " ").trim();
    const foto = f.length > 7 ? f[f.length - 1].trim() : "";
    if (!(cat >= 0 && cat < cats.length) || !/^\d{1,10}$/.test(sku) || !nombre || seen.has(sku)) continue;
    if (!stock) { sinStock++; continue; }
    const unidad = pu > 0 ? pu : pb, bulto = pb > 0 ? pb : pu;
    if (!(unidad > 0)) continue;
    seen.add(sku);
    costos[sku] = [unidad, bulto, promo.has(sku) ? 1 : 0];
    p.push([cat, sku, esc(nombre), precioVenta(unidad, margen), bu > 1 ? precioVenta(bulto, margenBulto) * bu : 0, bu, /^[\w\/.-]+$/.test(foto) ? foto : ""]);
  }
  const pos = c => { const i = ordenPrevio.indexOf(cats[c]); return i < 0 ? 1000 + c : i; };
  const used = [...new Set(p.map(r => r[0]))].sort((a, b) => pos(a) - pos(b));
  const idx = new Map(used.map((c, i) => [c, i]));
  const out = p.map(r => [idx.get(r[0]), ...r.slice(1)]);
  out.sort((a, b) => a[0] - b[0] || (norm(a[2]) < norm(b[2]) ? -1 : norm(a[2]) > norm(b[2]) ? 1 : 0) || (a[1] < b[1] ? -1 : 1));
  return { cats: used.map(c => cats[c]), p: out, img, sinStock, costos };
}

// Ofertas: compara el costo de hoy con el costo "normal" de cada producto (guardado en refs: sku -> [costo_unidad, costo_bulto, fecha]).
// Si bajó 10% o más es oferta, y se muestra el precio de antes (con la ganancia actual). Los productos de las promos
// "Solo por hoy" y "Fin de semana" de Maxiconsumo también son oferta. El precio normal se renueva cuando el costo vuelve
// a subir o después de 28 días. Agrega a cada renglón: [7] antes_unidad, [8] antes_bulto, [9] promo (1/0).
export function marcarOfertas(p, costos, refs, margen, margenBulto, hoy = Date.now()) {
  const nuevos = {}, DIA = 864e5;
  let ofertas = 0;
  for (const r of p) {
    const c = costos[r[1]]; if (!c) continue;
    const [cu, cb, pr] = c;
    let ref = refs[r[1]];
    if (!ref || cu >= ref[0] || hoy - ref[2] > 28 * DIA) ref = [cu, cb, hoy];
    const bajaU = cu <= ref[0] * 0.9, bajaB = cb <= ref[1] * 0.9;
    const antesU = bajaU ? precioVenta(ref[0], margen) : 0;
    const antesB = bajaB && r[4] > 0 ? precioVenta(ref[1], margenBulto) * r[5] : 0;
    r[7] = antesU > r[3] ? antesU : 0;
    r[8] = antesB > r[4] ? antesB : 0;
    r[9] = pr ? 1 : 0;
    if (r[7] || r[8] || r[9]) ofertas++;
    nuevos[r[1]] = ref;
  }
  return { refs: nuevos, ofertas };
}

// Precio y nombre de un renglón según cómo compra el cliente ("bulto" o "unidad").
export function precioDe(p, modo) {
  const bulto = modo === "bulto" && p[4] > 0;
  return { precio: bulto ? p[4] : p[3], bulto, unidades: bulto ? p[5] : 1 };
}

// "1/10/2026" -> 20261001 (para comparar cuál versión es más nueva)
export const fechaNum = f => { const m = String(f || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
