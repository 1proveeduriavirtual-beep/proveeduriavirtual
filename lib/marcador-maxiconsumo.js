// Código del marcador "Bajar precios Maxiconsumo" (versión legible).
// En el panel se usa esta misma lógica en una sola línea (pedidos.html, const BM).
// Recorre todas las categorías de maxiconsumo.com (96 productos por página, 4 páginas a la vez)
// y baja maxiconsumo_productos.txt con: cat|sku|stock|precio_bulto|precio_suelto|unidades_bulto|nombre|foto
(async () => {
  if (!/maxiconsumo\.com$/.test(location.host)) { alert("Primero abrí www.maxiconsumo.com y después tocá este marcador"); return; }
  const SUC = (location.pathname.match(/\/(sucursal_[a-z0-9_]+)/) || [])[1] || "sucursal_moreno";
  const CATS = [["almacen", "almacén"], ["bebidas", "bebidas"], ["limpieza", "limpieza"], ["perfumeria", "perfumería"], ["frescos", "frescos"], ["congelados", "congelados"], ["hogar-y-bazar", "hogar y bazar"], ["mascotas", "mascotas"], ["electro", "electro"]];
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:99999;top:12px;left:50%;transform:translateX(-50%);background:#1f5c3a;color:#fff;padding:14px 20px;border-radius:12px;font:600 16px system-ui;box-shadow:0 4px 20px #0005";
  document.body.appendChild(box);
  const say = t => { box.textContent = t; document.title = t; };
  const num = s => s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : 0;
  const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return new DOMParser().parseFromString(await r.text(), "text/html"); } catch (e) {} await new Promise(r => setTimeout(r, 1500)); } return null; };
  const url = (c, p) => "/" + SUC + "/" + c + ".html?product_list_limit=96&p=" + p;
  let IMG = "";
  const S = new Set(), L = [];
  const leer = (d, ci) => {
    for (const x of d.querySelectorAll("li.product-item")) {
      const tx = x.textContent.replace(/\s+/g, " ");
      const sku = (x.querySelector(".product-sku")?.textContent.match(/\d+/) || [])[0];
      const nm = (x.querySelector(".product-item-link")?.textContent || "").replace(/\s+/g, " ").trim().replace(/\|/g, "/");
      const st = /en stock/i.test(x.querySelector(".stock-status")?.textContent || "") ? 1 : 0;
      const pb = num((tx.match(/bulto cerrado ?\$ ?([\d.]+,\d+)/) || [])[1]);
      const pu = num((tx.match(/Precio unitario ?\$ ?([\d.]+,\d+)/) || [])[1]);
      let bu = 1;
      for (const s of x.querySelectorAll("script")) {
        const c = s.textContent, i = c.indexOf('"code":"presentacion"'); if (i < 0) continue;
        const j = c.indexOf('"options":', i), k = c.indexOf('"position"', j);
        try { bu = Math.max(1, ...JSON.parse(c.slice(j + 10, c.lastIndexOf("]", k) + 1)).filter(o => o.products && o.products.length).map(o => +o.label || 1)); } catch (e) {}
      }
      const im = x.querySelector("img.product-image-photo");
      const src = im?.getAttribute("data-src") || im?.getAttribute("src") || "";
      const m = src.match(/\/media\/catalog\/product\/(cache\/[^/]+\/)?(.+?)(\?|$)/);
      if (m && m[1] && !IMG) IMG = m[1];
      if (!sku || !nm || !(pb > 0 || pu > 0) || S.has(sku)) continue;
      S.add(sku);
      L.push([ci, sku, st, pb, pu, bu, nm, m && !/placeholder/.test(m[2]) ? m[2] : ""].join("|"));
    }
  };
  // 0) promos de Maxiconsumo ("Solo por hoy" y "Fin de semana"): van a "Ofertas" en la tienda
  const PROMO = new Set();
  for (const c of ["solo-por-hoy", "fin-de-semana"]) {
    const d = await get(url(c, 1));
    if (d) for (const x of d.querySelectorAll("li.product-item")) { const k = (x.querySelector(".product-sku")?.textContent.match(/\d+/) || [])[0]; if (k) PROMO.add(k); }
  }
  // 1) primera página de cada categoría: cuántas páginas tiene
  const jobs = [];
  for (let i = 0; i < CATS.length; i++) {
    say("Maxiconsumo: revisando categorías " + (i + 1) + "/" + CATS.length + "…");
    const d = await get(url(CATS[i][0], 1)); if (!d) continue;
    leer(d, i);
    const tot = Math.max(0, ...[...d.querySelectorAll(".toolbar-number")].map(e => +e.textContent.replace(/\D/g, "") || 0));
    for (let p = 2; p <= Math.ceil(tot / 96); p++) jobs.push([i, p]);
  }
  // 2) el resto de las páginas, 4 a la vez
  let hechos = 0, fallas = 0; const total = jobs.length;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (jobs.length) {
      const [i, p] = jobs.shift();
      const d = await get(url(CATS[i][0], p));
      if (d) leer(d, i); else fallas++;
      hechos++; say("Maxiconsumo: bajando precios " + Math.round(hechos / total * 100) + "% · " + L.length + " productos");
    }
  }));
  const txt = "#maxiconsumo|" + SUC + "|" + IMG + "\n#cats|" + CATS.map(c => c[1]).join("|") + "\n#promo|" + [...PROMO].join(",") + "\n#formato: cat|sku|stock|precio_bulto|precio_suelto|unidades_bulto|nombre|foto\n" + L.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
  a.download = "maxiconsumo_productos.txt"; document.body.appendChild(a); a.click(); a.remove();
  say("Listo: " + L.length + " productos");
  alert("Listo: " + L.length + " productos" + (fallas ? " (" + fallas + " páginas no se pudieron leer: si son muchas, probá de nuevo)" : "") + ". Ahora subí maxiconsumo_productos.txt en el panel de tu tienda.");
})();
