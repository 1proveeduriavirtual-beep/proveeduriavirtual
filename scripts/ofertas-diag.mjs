// Diagnóstico Diarco: elige "MAYORISTA" y anota qué carga
import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("diag", { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", viewport: { width: 1366, height: 900 }, locale: "es-AR" });
const p = await ctx.newPage(); const red = [];
p.on("response", r => { try { const ct = r.headers()["content-type"] || ""; if (!/css|font|javascript/.test(ct)) red.push(`${r.status()} ${ct.split(";")[0]} ${r.headers()["content-length"] || "?"} ${r.url().slice(0, 250)}`); } catch {} });
const out = [];
await p.goto("https://www.diarco.com.ar/ofertas/", { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(3000);
for (const sel of [".elementor-popup-modal .dialog-close-button", "[aria-label*=Cerrar]", ".dialog-lightbox-close-button"]) await p.click(sel, { timeout: 2000 }).catch(() => {});
await p.keyboard.press("Escape").catch(() => {});
for (const tipo of ["MAYORISTA", "BARRIO"]) {
  red.length = 0;
  await p.getByText(tipo, { exact: true }).first().click({ timeout: 8000 }).catch(e => out.push("no pude clickear " + tipo + ": " + e.message));
  await p.waitForTimeout(6000);
  for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(800); }
  await p.screenshot({ path: `diag/diarco-${tipo}.png`, fullPage: true }).catch(() => {});
  const links = await p.$$eval("a[href],iframe[src],embed[src],object[data],img[src]", els => els.map(e => `${e.tagName} ${e.href || e.src || e.data} | ${(e.innerText || e.alt || "").trim().slice(0, 60)}`));
  out.push(`### ${tipo} -> ${p.url()}`, ...links.filter(l => !/facebook|instagram|tiktok|youtube|wa\.me|whatsapp|linkedin/i.test(l)).slice(0, 200), "RED:", ...[...new Set(red)].filter(l => !/clarity|google|gtm|facebook|doubleclick/i.test(l)).slice(0, 120));
  // si hay sucursales para elegir, mostrar las opciones
  out.push("SELECTS:", ...(await p.$$eval("select", s => s.map(x => [...x.options].map(o => o.textContent.trim()).join(" | ")))));
  await p.goto("https://www.diarco.com.ar/ofertas/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2000); await p.keyboard.press("Escape").catch(() => {});
}
fs.writeFileSync("diag/diarco2.txt", out.join("\n"));
await b.close();
