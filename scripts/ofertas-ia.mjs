// Lee las páginas que son FOTO (sin texto propio) con la inteligencia artificial gratis de Google (Gemini).
// La clave gratis se saca en https://aistudio.google.com/apikey y se guarda en GitHub como secreto GEMINI_API_KEY.
// Por cada página que entiende deja ofertas/paginas/<pagina>.ia.json y borra la imagen (así Tesseract no la repite).
// Si no hay clave o se termina el cupo gratis del día, las páginas que quedan las lee Tesseract como antes.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const KEY = process.env.GEMINI_API_KEY, MAX = +(process.env.IA_MAX_PAGINAS || 80);
const MODELOS = (process.env.IA_MODELO || "gemini-2.5-flash,gemini-flash-latest,gemini-2.0-flash").split(",");
if (!KEY) { console.log("IA: falta GEMINI_API_KEY, sigo con el lector común."); process.exit(0); }
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
  let d = null, modelo = MODELOS[0];
  for (let intento = 0; intento < 5 && !d; intento++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok) { d = await r.json().catch(() => null); break; }
    const err = (await r.text()).slice(0, 300);
    if (r.status === 404 && MODELOS.indexOf(modelo) < MODELOS.length - 1) { modelo = MODELOS[MODELOS.indexOf(modelo) + 1]; continue; } // ese modelo ya no existe: pruebo el siguiente
    if (r.status >= 500) { await new Promise(z => setTimeout(z, 15000 * (intento + 1))); continue; } // Google ocupado: espero y reintento
    if (r.status === 429) { if (/per day|PerDay/i.test(err)) { console.log("IA: se terminó el cupo gratis de hoy; lo que falta lo lee el lector común."); process.exit(0); } await new Promise(z => setTimeout(z, 30000)); continue; }
    console.log("IA: no pude leer", f, r.status, err); if (r.status === 400 || r.status === 401 || r.status === 403) process.exit(0); break;
  }
  if (!d) continue;
  const txt = String((d?.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("") || "").replace(/```json|```/g, "");
  let lista = []; try { lista = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)); } catch {}
  lista = (Array.isArray(lista) ? lista : []).map(x => ({ texto: String(x.producto || "").slice(0, 200), precio: +x.precio })).filter(x => x.texto && x.precio >= 100 && x.precio <= 500000);
  fs.writeFileSync(`ofertas/paginas/${f.replace(/\.png$/, "")}.ia.json`, JSON.stringify(lista));
  if (!lista.length) fs.writeFileSync(`ofertas/paginas/${f.replace(/\.png$/, "")}.ia-respuesta.txt`, JSON.stringify(d).slice(0, 4000)); // para revisar qué contestó
  fs.rmSync(png, { force: true }); ok++;
  console.log(`IA: ${f} -> ${lista.length} productos`);
  await new Promise(z => setTimeout(z, 6500)); // máximo ~10 por minuto
}
console.log(`IA: leyó ${ok} páginas.`);
