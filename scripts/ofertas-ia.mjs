// Lee las páginas de las revistas con la inteligencia artificial gratis de Google (Gemini).
// La clave gratis se saca en https://aistudio.google.com/apikey y se guarda en GitHub como secreto GEMINI_API_KEY.
// Para que alcance el cupo gratis, manda varias páginas por pedido. Si un modelo se queda sin cupo, prueba el siguiente.
// Por cada página que entiende deja ofertas/paginas/<pagina>.ia.json y borra la imagen (así el lector común no la repite).
// Lo que no llegue a leer lo lee el lector común (Tesseract). Todo lo que pasa queda en ofertas/ia-registro.txt.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const KEY = process.env.GEMINI_API_KEY, MAX = +(process.env.IA_MAX_PAGINAS || 160), POR = +(process.env.IA_POR_PEDIDO || 4);
let MODELOS = (process.env.IA_MODELO || "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-flash-lite-latest,gemini-flash-latest,gemini-2.0-flash,gemini-2.0-flash-lite").split(",");
const LOG = "ofertas/ia-registro.txt";
const log = (...a) => { const l = a.join(" "); console.log(l); fs.appendFileSync(LOG, l + "\n"); };
if (!KEY) { log("IA: falta GEMINI_API_KEY, sigo con el lector común."); process.exit(0); }
const espera = ms => new Promise(z => setTimeout(z, ms));
const PROMPT = n => `Te paso ${n} página(s) de revistas de ofertas de supermercados mayoristas de Argentina, en orden (página 1 a ${n}).
Listá TODOS los productos que tienen precio. Respondé SOLO con JSON, sin texto antes ni después:
[{"pagina":1,"producto":"nombre completo como figura: tipo, marca, variedad y tamaño (ej: Yerba mate Nobleza Gaucha Selección 1 kg)","precio":1649}]
Reglas: "pagina" es el número de imagen (1 a ${n}). "precio" es el precio de oferta de UNA unidad en pesos, como número (1.649 -> 1649, $2.149,90 -> 2149.9).
No uses el precio por kilo o por litro, ni el de cuotas, ni el "precio sin impuestos". Si dice "llevando 3" o "desde 6 unidades", usá el precio por unidad de esa oferta.
Si no estás seguro del nombre o del precio de un producto, no lo pongas.`;

async function pedir(partes) {
  for (let intento = 0; intento < 6 && MODELOS.length; intento++) {
    const modelo = MODELOS[0];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: partes }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok) return { d: await r.json().catch(() => null), modelo };
    const err = (await r.text()).replace(/\s+/g, " ").slice(0, 400);
    log(`IA: ${modelo} respondió ${r.status}: ${err}`);
    if (r.status === 404 || r.status === 400 && /model/i.test(err)) { MODELOS.shift(); continue; } // ese modelo no existe: el siguiente
    if (r.status === 429) {
      if (/per ?day|PerDay|daily|quota/i.test(err) && !/per ?minute|PerMinute/i.test(err)) { MODELOS.shift(); continue; } // sin cupo hoy en este modelo: el siguiente
      await espera(35000); continue; // límite por minuto: espero
    }
    if (r.status >= 500 || r.status === 0) { await espera(15000 * (intento + 1)); continue; } // Google ocupado
    if (r.status === 401 || r.status === 403) { log("IA: la clave no sirve o no tiene permiso."); MODELOS = []; }
    return null;
  }
  return null;
}

fs.mkdirSync("ofertas/paginas", { recursive: true });
const imgs = fs.readdirSync("ofertas/png").filter(f => f.endsWith(".png")).sort().slice(0, MAX);
log(`IA: ${imgs.length} páginas para leer, de a ${POR} por pedido.`);
let leidas = 0, productos = 0;
for (let i = 0; i < imgs.length && MODELOS.length; i += POR) {
  const grupo = imgs.slice(i, i + POR), partes = [{ text: PROMPT(grupo.length) }];
  for (const f of grupo) {
    const jpg = `ofertas/png/${f}.ia.jpg`;
    try { execFileSync("magick", [`ofertas/png/${f}`, "-resize", "1400x1400>", "-quality", "80", jpg]); } catch { continue; }
    partes.push({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(jpg).toString("base64") } }); fs.rmSync(jpg, { force: true });
  }
  const res = await pedir(partes);
  if (!res?.d) continue;
  const txt = String((res.d.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join(""));
  let lista; try { lista = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)); } catch { lista = null; }
  if (!Array.isArray(lista)) { log(`IA: respuesta rara en ${grupo[0]}: ${txt.slice(0, 300)}`); continue; }
  grupo.forEach((f, k) => {
    const de = lista.filter(x => (+x.pagina || 1) === k + 1).map(x => ({ texto: String(x.producto || "").slice(0, 200), precio: +x.precio })).filter(x => x.texto && x.precio >= 100 && x.precio <= 500000);
    fs.writeFileSync(`ofertas/paginas/${f.replace(/\.png$/, "")}.ia.json`, JSON.stringify(de));
    fs.rmSync(`ofertas/png/${f}`, { force: true }); leidas++; productos += de.length;
  });
  log(`IA (${res.modelo}): ${grupo.join(", ")} -> ${lista.length} productos`);
  await espera(5000);
}
log(`IA: leyó ${leidas} páginas, ${productos} productos.${MODELOS.length ? "" : " (se terminó el cupo gratis de hoy)"}`);
