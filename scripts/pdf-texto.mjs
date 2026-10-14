// Si el PDF trae el texto adentro (los folletos hechos en compu casi siempre), lo saca exacto y gratis,
// sin "mirar" la imagen. Escribe un .tsv por página con el mismo formato que Tesseract (para ofertas-leer.mjs).
// Uso: node scripts/pdf-texto.mjs archivo.pdf ofertas/paginas/makro-05   -> imprime las páginas que resolvió
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [pdf, base] = process.argv.slice(2);
let html = "";
try { html = execFileSync("pdftotext", ["-bbox", pdf, "-"], { maxBuffer: 1 << 28 }).toString(); } catch { process.exit(0); }
const E = 200 / 72; // misma escala que las imágenes a 200 dpi
const des = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
let n = 0; const hechas = [];
for (const pag of html.split(/<page /).slice(1)) {
  n++;
  const filas = [];
  for (const m of pag.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
    const [x0, y0, x1, y1] = m.slice(1, 5).map(Number), t = des(m[5]).trim();
    if (!t) continue;
    filas.push([5, 1, 1, 1, 1, filas.length + 1, Math.round(x0 * E), Math.round(y0 * E), Math.max(1, Math.round((x1 - x0) * E)), Math.max(1, Math.round((y1 - y0) * E)), 100, t].join("\t"));
  }
  if (filas.length < 15) continue; // casi sin texto: es una foto, que la lea Tesseract
  fs.writeFileSync(`${base}-${n}.tsv`, "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n" + filas.join("\n") + "\n");
  hechas.push(n);
}
console.log(hechas.join(" "));
