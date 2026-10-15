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
await p.getByText("MAYORISTA", { exact: true }).first().click({ timeout: 8000 }).catch(e => out.push("no pude MAYORISTA " + e.message));
await p.waitForTimeout(3000);
const sels = await p.$$("select");
for (const [i, s] of sels.entries()) {
  const vis = await s.isVisible().catch(() => false);
  const ops = await s.$$eval("option", o => o.map(x => [x.value, x.textContent.trim()]));
  out.push(`select ${i} visible=${vis}: ` + ops.slice(0, 8).map(o => o.join("=")).join(" | "));
}
for (const [i, s] of sels.entries()) {
  if (!(await s.isVisible().catch(() => false))) continue;
  const ops = await s.$$eval("option", o => o.map(x => [x.value, x.textContent.trim()]));
  const op = ops.find(o => /mercado central|san mart/i.test(o[1])) || ops.find(o => o[0] && !/selecc/i.test(o[1]));
  if (!op) continue;
  red.length = 0;
  const nav = p.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await s.selectOption(op[0]).catch(e => out.push("select err " + e.message));
  await nav; await p.waitForTimeout(6000);
  for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(800); }
  await p.screenshot({ path: `diag/diarco-suc-${i}.png`, fullPage: true }).catch(() => {});
  const links = await p.$$eval("a[href],iframe[src],embed[src],object[data],img[src]", els => els.map(e => `${e.tagName} ${e.href || e.src || e.data} | ${(e.innerText || e.alt || "").trim().slice(0, 60)}`));
  out.push(`### elegí ${op[1]} (value ${op[0]}) -> ${p.url()}`, ...links.filter(l => !/facebook|instagram|tiktok|youtube|wa\.me|whatsapp|linkedin|Discount|Combined|Chat\.png|logo|icon/i.test(l)).slice(0, 80), "RED:", ...[...new Set(red)].filter(l => !/clarity|google|gtm|facebook|doubleclick|\.svg/i.test(l)).slice(0, 80));
  break;
}
fs.writeFileSync("diag/diarco2.txt", out.join("\n"));
await b.close();
