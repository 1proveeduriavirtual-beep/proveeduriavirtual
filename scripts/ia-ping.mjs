// Prueba de conexión con la IA de GitHub (variantes de dirección y encabezados)
import fs from "node:fs";
const T = process.env.GITHUB_TOKEN, out = [];
const body = JSON.stringify({ model: "openai/gpt-4o", messages: [{ role: "user", content: "Respondé solo: hola" }], max_tokens: 5 });
for (const [url, extra] of [
  ["https://models.github.ai/inference/chat/completions", { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }],
  ["https://models.github.ai/inference/chat/completions", {}],
  ["https://models.inference.ai.azure.com/chat/completions", {}],
]) {
  for (const redirect of ["manual", "follow"]) {
    try {
      const r = await fetch(url, { method: "POST", redirect, headers: { "content-type": "application/json", authorization: "Bearer " + T, ...extra }, body: url.includes("azure") ? body.replace("openai/gpt-4o", "gpt-4o") : body });
      out.push({ url, extra: Object.keys(extra), redirect, status: r.status, loc: r.headers.get("location"), tipo: r.headers.get("content-type"), texto: (await r.text()).slice(0, 400) });
    } catch (e) { out.push({ url, redirect, error: e.message }); }
  }
}
fs.mkdirSync("ofertas/paginas", { recursive: true });
fs.writeFileSync("ofertas/paginas/ping.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
