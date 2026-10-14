// Baja las revistas de ofertas de la semana (PDF o imágenes) de Diarco, Makro, Vital y Yaguar.
// Usa un navegador (Playwright) porque algunas páginas cargan los folletos con JavaScript.
// Guarda todo en ofertas/raw/<tienda>/ y una lista de lo bajado en ofertas/fuentes.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TIENDAS = {
  diarco: ["https://www.diarco.com.ar/ofertas/"],
  makro: ["https://makro.com.ar/ofertas/"],
  vital: ["https://www.vital.com.ar/ofertas/"],
  yaguar: ["https://www.yaguar.com.ar/", "https://www.yaguar.com.ar/ofertas/", "https://yaguar.com.ar/revista/"],
};
const OUT = "ofertas/raw";
const esFolleto = u => /\.pdf(\?|$)/i.test(u) || /(folleto|revista|flyer|oferta|catalogo)[^/]*\.(jpe?g|png|webp)(\?|$)/i.test(u);
const fuentes = [];

const b = await chromium.launch();
for (const [tienda, urls] of Object.entries(TIENDAS)) {
  const dir = path.join(OUT, tienda); fs.mkdirSync(dir, { recursive: true });
  const vistos = new Set();
  const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  // también cazamos imágenes grandes que se cargan por red (visores de folletos)
  p.on("response", async r => {
    try {
      const u = r.url(), ct = r.headers()["content-type"] || "";
      if (vistos.has(u)) return;
      if (ct.includes("pdf") || (/image\/(jpe?g|png|webp)/.test(ct) && +(r.headers()["content-length"] || 0) > 150000)) vistos.add(u);
    } catch {}
  });
  for (const u of urls) {
    try {
      await p.goto(u, { waitUntil: "networkidle", timeout: 60000 });
      await p.waitForTimeout(3000);
      // si hay un selector de folletos/sucursales, probamos cada opción
      for (const sel of await p.$$("select")) {
        const ops = await sel.$$eval("option", o => o.map(x => x.value).filter(Boolean));
        for (const v of ops.slice(0, 6)) { try { await sel.selectOption(v); await p.waitForTimeout(2500); } catch {} }
      }
      const links = await p.$$eval("a[href],iframe[src],embed[src],object[data],img[src]", els => els.map(e => e.href || e.src || e.data).filter(Boolean));
      links.filter(esFolleto).forEach(l => vistos.add(l));
    } catch (e) { console.log(tienda, u, "no se pudo abrir:", e.message); }
  }
  // Primero los PDF (traen el texto exacto). Se saltean links para compartir (WhatsApp), banners
  // y las fotos "_page-0001" de un folleto que ya está en PDF.
  const lista = [...vistos].filter(u => !/^https?:\/\/(wa\.me|api\.whatsapp|www\.facebook|twitter|x\.com)/i.test(u) && !/banner|hero|logo/i.test(u));
  const pdfs = lista.filter(u => /\.pdf(\?|$)/i.test(u)), base = u => u.replace(/[?#].*$/, "").replace(/(_page-\d+)?(-\d+)?\.(pdf|jpe?g|png|webp)$/i, "").replace(/-(v-final|corregido-final|final)$/i, "").toLowerCase();
  const orden = [...pdfs, ...lista.filter(u => !pdfs.includes(u) && !pdfs.some(f => base(f) === base(u)))];
  let n = 0;
  for (const u of orden) {
    if (n >= 12) break;
    try {
      const r = await ctx.request.get(u, { timeout: 60000 });
      if (!r.ok()) continue;
      const buf = await r.body(); if (buf.length < 50000) continue;
      const ext = buf.subarray(0, 5).toString() === "%PDF-" ? "pdf" : "jpg";
      if (ext === "jpg" && !/image\//.test(r.headers()["content-type"] || "")) continue; // no es ni PDF ni imagen
      const f = path.join(dir, `${String(++n).padStart(2, "0")}.${ext}`);
      fs.writeFileSync(f, buf);
      fuentes.push({ tienda, archivo: f, url: u, bytes: buf.length });
      console.log(tienda, "bajado", f, u);
    } catch (e) { console.log(tienda, "falló", u, e.message); }
  }
  if (!n) console.log(tienda, "⚠ no se encontraron folletos");
  await ctx.close();
}
await b.close();
fs.writeFileSync("ofertas/fuentes.json", JSON.stringify(fuentes, null, 1));
