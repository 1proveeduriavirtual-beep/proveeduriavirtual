// Arma la lista de "producto + precio" de cada página leída de las revistas (los .tsv que deja Tesseract)
// y se la manda a la tienda, que la compara con el catálogo y la deja para aprobar en el panel.
// Uso: node scripts/ofertas-leer.mjs   (necesita TIENDA y ADMIN_KEY; con SECO=1 solo muestra lo que leyó)
import fs from "node:fs";
import path from "node:path";

const DIR = "ofertas/paginas";
const precioDe = t => { // "$1.299", "1299", "1.299,90" -> número; descarta lo que no parece precio
  const s = String(t).replace(/[oO]/g, "0").replace(/[^\d.,$]/g, "");
  const m = s.match(/^\$?(\d{1,3}(?:\.\d{3})+|\d{2,6})(?:,(\d{1,2}))?$/);
  if (!m) return 0;
  const v = +m[1].replace(/\./g, "") + (m[2] ? +m[2].padEnd(2, "0") / 100 : 0);
  return v >= 100 && v <= 500000 ? v : 0;
};

function leerTsv(f) {
  const filas = fs.readFileSync(f, "utf8").split("\n").slice(1).map(l => l.split("\t")).filter(c => c.length >= 12 && c[11].trim());
  return filas.map(c => ({ x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf: +c[10], t: c[11].trim() })).filter(w => w.conf >= 30);
}

const out = [];
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(n => n.endsWith(".tsv")) : []) {
  const tienda = { diarco: "Diarco", vital: "Vital", makro: "Makro", yaguar: "Yaguar" }[f.split("-")[0]] || f.split("-")[0];
  const W = leerTsv(path.join(DIR, f));
  if (!W.length) continue;
  const hMed = W.map(w => w.h).sort((a, b) => a - b)[Math.floor(W.length / 2)] || 20;
  // Los precios de las revistas son números grandes. Cada palabra de texto se asigna a UN solo precio:
  // el más cercano que tenga debajo (así no se mezclan los nombres de dos productos vecinos).
  const esPrecio = w => precioDe(w.t) && w.h >= hMed * 1.4; // los números chicos (1 kg, 400 g) son parte del nombre
  const precios = W.filter(esPrecio);
  const util = w => /[a-záéíóúñ]{2,}/i.test(w.t) || /^\d+([.,]\d+)?$/.test(w.t) || /^(g|l)$/i.test(w.t);
  const grupos = new Map(precios.map(p => [p, []]));
  for (const w of W) {
    if (esPrecio(w) || !util(w)) continue;
    const cx = w.x + w.w / 2;
    let mejor = null, dmin = Infinity;
    for (const p of precios) {
      const dy = p.y - (w.y + w.h); // cuánto más abajo está el precio
      if (dy < -p.h * 0.3 || dy > p.h * 3.5) continue;
      const dx = cx < p.x - p.w * 0.6 ? p.x - cx : cx > p.x + p.w * 1.6 ? cx - p.x - p.w : 0;
      if (dx > p.w * 0.6) continue;
      const d = Math.max(dy, 0) + dx * 2;
      if (d < dmin) { dmin = d; mejor = p; }
    }
    if (mejor) grupos.get(mejor).push(w);
  }
  for (const [p, ws] of grupos) {
    const precio = precioDe(p.t);
    const texto = ws.sort((a, b) => Math.round(a.y / (hMed * 0.8)) - Math.round(b.y / (hMed * 0.8)) || a.x - b.x).map(w => w.t).join(" ");
    if (texto.split(/\s+/).length < 2) continue;
    out.push({ tienda, texto: texto.slice(0, 200), precio, pagina: f.replace(/\.tsv$/, "") });
  }
}
// Lo que leyó la inteligencia artificial (ya viene como producto + precio)
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(n => n.endsWith(".ia.json")) : []) {
  const tienda = { diarco: "Diarco", vital: "Vital", makro: "Makro", yaguar: "Yaguar" }[f.split("-")[0]] || f.split("-")[0];
  for (const x of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))) out.push({ tienda, texto: x.texto, precio: x.precio, pagina: f.replace(/\.ia\.json$/, ""), ia: 1 });
}
console.log(`Leídos ${out.length} posibles productos con precio.`);
if (process.env.SECO) { console.log(JSON.stringify(out.slice(0, 40), null, 1)); process.exit(0); }
const T = (process.env.TIENDA || "https://proveeduriavirtual.netlify.app").replace(/\/$/, ""), K = process.env.ADMIN_KEY;
if (!K) { console.log("Falta ADMIN_KEY: no se manda nada."); process.exit(0); }
const r = await fetch(`${T}/.netlify/functions/gestion?r=ofertas&k=${encodeURIComponent(K)}`, { method: "POST", body: JSON.stringify({ accion: "cargar", candidatos: out }) });
const d = await r.json().catch(() => ({}));
console.log(r.ok ? `Listo: ${d.pendientes?.length || 0} ofertas para revisar en el panel.` : "Error: " + (d.error || r.status));
fs.mkdirSync("ofertas", { recursive: true });
fs.writeFileSync("ofertas/candidatos.json", JSON.stringify(out, null, 1));
