// Diagnóstico: entra a la página de ofertas de cada mayorista, saca captura y anota todos los links y archivos que carga.
import { chromium } from "playwright";
import fs from "node:fs";
const SITIOS = {
  diarco: ["https://www.diarco.com.ar/ofertas/", "https://www.diarco.com.ar/"],
  makro: ["https://makro.com.ar/ofertas/", "https://makro.com.ar/revistas/", "https://makro.com.ar/"],
  yaguar: ["https://www.yaguar.com.ar/", "https://www.yaguar.com.ar/ofertas/", "https://yaguar.com.ar/revista/"],
};
fs.mkdirSync("diag", { recursive: true });
const b = await chromium.launch();
for (const [t, urls] of Object.entries(SITIOS)) {
  const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", viewport: { width: 1366, height: 900 }, locale: "es-AR" });
  const p = await ctx.newPage(); const red = [];
  p.on("response", r => { try { const ct = r.headers()["content-type"] || ""; if (!/css|font|javascript/.test(ct)) red.push(`${r.status()} ${ct.split(";")[0]} ${r.headers()["content-length"] || "?"} ${r.url().slice(0, 250)}`); } catch {} });
  for (const [i, u] of urls.entries()) {
    const out = [`### ${u}`];
    try {
      const r = await p.goto(u, { waitUntil: "networkidle", timeout: 60000 }); out.push("estado: " + r?.status() + " -> " + p.url());
      await p.waitForTimeout(4000);
      for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(700); }
      await p.screenshot({ path: `diag/${t}-${i}.png`, fullPage: true }).catch(() => {});
      const links = await p.$$eval("a[href],iframe[src],embed[src],object[data],img[src],source[src]", els => els.map(e => `${e.tagName} ${e.href || e.src || e.data} | ${(e.innerText || e.alt || "").trim().slice(0, 60)}`));
      out.push("LINKS:", ...links.filter(l => /ofert|revist|folle|catalog|pdf|flyer|issuu|yumpu|flipsnack|calameo|publuu|heyzine|drive\.google/i.test(l)));
      out.push("TODOS LOS LINKS (primeros 150):", ...links.slice(0, 150));
      out.push("TEXTO:", (await p.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 1500));
    } catch (e) { out.push("ERROR " + e.message); }
    fs.appendFileSync(`diag/${t}.txt`, out.join("\n") + "\n\n");
  }
  fs.writeFileSync(`diag/${t}-red.txt`, [...new Set(red)].join("\n"));
  await ctx.close();
}
await b.close();
