// Actualización automática de precios y stock desde Maxiconsumo (corre sola en GitHub Actions, sin ninguna compu prendida).
// 1) Lee todas las categorías de www.maxiconsumo.com (precios públicos, sucursal Moreno).
// 2) Arma el mismo archivo que baja el marcador del panel.
// 3) Lo sube a la tienda con la clave del panel (ADMIN_KEY), usando las ganancias guardadas en el panel.
// No vuelve a publicar la página: no gasta créditos de despliegue de Netlify.
//
// Variables: ADMIN_KEY (obligatoria), TIENDA (opcional, por defecto https://proveeduriavirtual.netlify.app),
//            SUCURSAL (opcional, por defecto sucursal_moreno), SOLO_PROBAR=1 (no sube nada, solo muestra el resumen).

const BASE = "https://www.maxiconsumo.com";
const SUC = process.env.SUCURSAL || "sucursal_moreno";
const TIENDA = (process.env.TIENDA || "https://proveeduriavirtual.netlify.app").replace(/\/$/, "");
const CATS = [["almacen", "almacén"], ["bebidas", "bebidas"], ["limpieza", "limpieza"], ["perfumeria", "perfumería"], ["frescos", "frescos"], ["congelados", "congelados"], ["hogar-y-bazar", "hogar y bazar"], ["mascotas", "mascotas"], ["electro", "electro"]];
const PROMOS = ["solo-por-hoy", "fin-de-semana"]; // promos de Maxiconsumo: entran en "Ofertas" de la tienda
const POR_PAGINA = 96, A_LA_VEZ = 4;

const espera = ms => new Promise(r => setTimeout(r, ms));
const ENT = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const texto = h => decode(h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const num = s => s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : 0;

// Lee una página del listado (HTML crudo). Devuelve { total, items: [sku, stock, precio_bulto, precio_suelto, unidades_bulto, nombre, foto], img }
export function leerPagina(h) {
  const total = Math.max(0, ...[...h.matchAll(/<span class="toolbar-number">(\d+)<\/span>/g)].map(m => +m[1]));
  let img = "";
  const items = [];
  for (let x of h.split('<li class="item product product-item">').slice(1)) {
    const fin = x.indexOf("</ol>"); if (fin >= 0) x = x.slice(0, fin);
    const sku = (x.match(/class="product-sku"[^>]*>[\s\S]*?(\d+)\s*<\/span>/) || [])[1];
    const nm = texto((x.match(/class="product-item-link"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "").replace(/\|/g, "/");
    const st = /en stock/i.test((x.match(/stock-status[^"]*"[^>]*>([^<]*)</) || [])[1] || "") ? 1 : 0;
    const tx = texto(x);
    const pb = num((tx.match(/bulto cerrado ?\$ ?([\d.]+,\d+)/) || [])[1]);
    const pu = num((tx.match(/Precio unitario ?\$ ?([\d.]+,\d+)/) || [])[1]);
    let bu = 1;
    const i = x.indexOf('"code":"presentacion"');
    if (i >= 0) {
      const j = x.indexOf('"options":', i), k = x.indexOf('"position"', j);
      try { bu = Math.max(1, ...JSON.parse(x.slice(j + 10, x.lastIndexOf("]", k) + 1)).filter(o => o.products && o.products.length).map(o => +o.label || 1)); } catch (e) {}
    }
    const tag = (x.match(/<img[^>]*product-image-photo[^>]*>/) || [])[0] || "";
    const src = decode((tag.match(/data-src="([^"]+)"/) || tag.match(/\ssrc="([^"]+)"/) || [])[1] || "");
    const m = src.match(/\/media\/catalog\/product\/(cache\/[^/]+\/)?(.+?)(\?|$)/);
    if (m && m[1] && !img) img = m[1];
    if (!sku || !nm || !(pb > 0 || pu > 0)) continue;
    items.push([sku, st, pb, pu, bu, nm, m && !/placeholder/.test(m[2]) ? m[2] : ""]);
  }
  return { total, items, img };
}

async function bajar(cat, p) {
  const url = `${BASE}/${SUC}/${cat}.html?product_list_limit=${POR_PAGINA}&p=${p}`;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", "accept-language": "es-AR,es;q=0.9" }, signal: AbortSignal.timeout(90000) });
      if (r.ok) return leerPagina(await r.text());
      console.log(`  ${cat} p${p}: HTTP ${r.status}`);
    } catch (e) { console.log(`  ${cat} p${p}: ${e.message}`); }
    await espera(3000 * (i + 1));
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  const S = new Set(), L = [];
  let IMG = "", fallas = 0;
  const agregar = (r, ci) => { if (r.img && !IMG) IMG = r.img; for (const it of r.items) if (!S.has(it[0])) { S.add(it[0]); L.push([ci, ...it].join("|")); } };
  const promo = new Set();
  for (const c of PROMOS) { const r = await bajar(c, 1); if (r) r.items.forEach(it => promo.add(it[0])); }
  console.log(`Promos de Maxiconsumo: ${promo.size} productos`);
  const trabajos = [];
  for (let i = 0; i < CATS.length; i++) {
    const r = await bajar(CATS[i][0], 1);
    if (!r) { fallas++; continue; }
    agregar(r, i);
    const paginas = Math.ceil(r.total / POR_PAGINA);
    console.log(`${CATS[i][1]}: ${r.total} artículos, ${paginas} páginas`);
    for (let p = 2; p <= paginas; p++) trabajos.push([i, p]);
  }
  await Promise.all(Array.from({ length: A_LA_VEZ }, async () => {
    while (trabajos.length) {
      const [i, p] = trabajos.shift();
      const r = await bajar(CATS[i][0], p);
      if (r) agregar(r, i); else fallas++;
    }
  }));
  console.log(`Listo: ${L.length} productos con precio en ${Math.round((Date.now() - t0) / 1000)} s, ${fallas} páginas fallidas.`);
  if (fallas > 3 || L.length < 1000) throw new Error("Demasiadas fallas o muy pocos productos: no se actualiza la tienda para no romperla.");

  const archivo = `#maxiconsumo|${SUC}|${IMG}\n#cats|${CATS.map(c => c[1]).join("|")}\n#promo|${[...promo].join(",")}\n#formato: cat|sku|stock|precio_bulto|precio_suelto|unidades_bulto|nombre|foto\n${L.join("\n")}`;
  if (process.env.SOLO_PROBAR) { console.log(archivo.split("\n").slice(0, 8).join("\n")); return; }

  const key = process.env.ADMIN_KEY;
  if (!key) throw new Error("Falta ADMIN_KEY (la clave del panel) en los secretos de GitHub.");
  // sin margen: usa las ganancias guardadas en el panel. "forzar" porque un día puede haber más o menos productos con stock.
  const r = await fetch(`${TIENDA}/.netlify/functions/productos?k=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ archivo, forzar: true }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`La tienda no aceptó los precios: ${d.error || r.status}`);
  console.log(`Tienda actualizada al ${d.fecha}: ${d.productos} productos · ${d.ofertas} en oferta · ${d.suben} suben · ${d.bajan} bajan · ${d.nuevos} nuevos · ${d.retirados} retirados.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
