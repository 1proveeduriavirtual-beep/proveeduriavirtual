// Lee las páginas que son FOTO (sin texto propio) con un modelo de inteligencia artificial gratis de GitHub
// (GitHub Models: viene incluido con GitHub, usa el token del robot, no hay que pagar ni crear cuentas).
// Por cada página que entiende deja ofertas/paginas/<pagina>.ia.json y borra la imagen (así Tesseract no la repite).
// Si GitHub corta por límite diario, las páginas que quedan las lee Tesseract como antes.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const TOKEN = process.env.GITHUB_TOKEN, MAX = +(process.env.IA_MAX_PAGINAS || 45), MODELO = process.env.IA_MODELO || "openai/gpt-4o";
if (!TOKEN) { console.log("IA: sin GITHUB_TOKEN, sigo con el lector común."); process.exit(0); }
const PROMPT = `Es una página de una revista de ofertas de un supermercado mayorista de Argentina.
Listá TODOS los productos que tienen precio. Respondé SOLO con JSON, sin texto antes ni después:
[{"producto":"nombre completo como figura: tipo, marca, variedad y tamaño (ej: Yerba mate Nobleza Gaucha Selección 1 kg)","precio":1649}]
Reglas: "precio" es el precio de oferta de UNA unidad en pesos, como número (1.649 -> 1649, $2.149,90 -> 2149.9).
No uses el precio por kilo o por litro, ni el de cuotas, ni el "precio sin impuestos". Si dice "llevando 3" o "desde 6 unidades", usá el precio por unidad de esa oferta.
Si no estás seguro del nombre o del precio de un producto, no lo pongas.`;
const imgs = fs.readdirSync("ofertas/png").filter(f => f.endsWith(".png")).sort().slice(0, MAX);
let ok = 0;
for (const f of imgs) {
  const png = `ofertas/png/${f}`, jpg = `${png}.ia.jpg`;
  try { execFileSync("magick", [png, "-resize", "1600x1600>", "-quality", "82", jpg]); } catch { continue; }
  const b64 = fs.readFileSync(jpg).toString("base64"); fs.rmSync(jpg, { force: true });
  let r, d;
  for (let intento = 0; intento < 3; intento++) {
    r = await fetch("https://models.github.ai/inference/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ model: MODELO, temperature: 0, max_tokens: 3500, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64, detail: "high" } }] }] }) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.status !== 429) break;
    const espera = +(r.headers?.get?.("retry-after") || 0);
    if (espera > 120) { console.log("IA: se terminó el cupo gratis de hoy; lo que falta lo lee el lector común."); process.exit(0); }
    await new Promise(z => setTimeout(z, (espera || 20) * 1000));
  }
  if (!r.ok) { console.log("IA: no pude leer", f, r.status, (await r.text()).slice(0, 200)); if (r.status === 401 || r.status === 403) process.exit(0); continue; }
  d = await r.json().catch(() => null);
  const txt = String(d?.choices?.[0]?.message?.content || "").replace(/```json|```/g, "");
  let lista = []; try { lista = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)); } catch {}
  lista = (Array.isArray(lista) ? lista : []).map(x => ({ texto: String(x.producto || "").slice(0, 200), precio: +x.precio })).filter(x => x.texto && x.precio >= 100 && x.precio <= 500000);
  fs.writeFileSync(`ofertas/paginas/${f.replace(/\.png$/, "")}.ia.json`, JSON.stringify(lista));
  fs.rmSync(png, { force: true }); ok++;
  console.log(`IA: ${f} -> ${lista.length} productos`);
  await new Promise(z => setTimeout(z, 6500)); // máximo ~10 por minuto
}
console.log(`IA: leyó ${ok} páginas.`);
