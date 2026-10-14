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
  // Los precios de las revistas son números grandes: buscamos cada uno y juntamos el texto que tiene arriba
  for (const p of W) {
    const precio = precioDe(p.t);
    if (!precio || p.h < hMed * 1.4) continue;
    const caja = { x0: p.x - p.w * 0.8, x1: p.x + p.w * 2.4, y0: p.y - p.h * 3.5, y1: p.y + p.h * 0.3 };
    const esPrecio = w => precioDe(w.t) && w.h >= hMed * 1.4; // los números chicos (1 kg, 400 g) son parte del nombre
    const texto = W.filter(w => w !== p && !esPrecio(w) && w.x >= caja.x0 && w.x <= caja.x1 && w.y >= caja.y0 && w.y <= caja.y1 && (/[a-záéíóúñ]{2,}/i.test(w.t) || /^\d+([.,]\d+)?$/.test(w.t) || /^(g|l)$/i.test(w.t)))
      .sort((a, b) => Math.round(a.y / (hMed * 0.8)) - Math.round(b.y / (hMed * 0.8)) || a.x - b.x).map(w => w.t).join(" ");
    if (texto.split(/\s+/).length < 2) continue;
    out.push({ tienda, texto: texto.slice(0, 200), precio, pagina: f.replace(/\.tsv$/, "") });
  }
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
