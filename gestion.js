// Panel de gestión: usuarios, entregas, clientes, inventario, compras, proveedores, promociones, pagos y exportación a Excel.
// Usa lo que define pedidos.html: $, api, esc, plain, money, K, L, load, renderP, stats.
const G=(r,opt)=>fetch("/.netlify/functions/gestion?r="+r+"&k="+encodeURIComponent(K)+(opt&&opt.qs||""),opt);
const GJ=async(r,body)=>{const x=await G(r,body?{method:"POST",body:JSON.stringify(body)}:undefined);const d=await x.json().catch(()=>({error:"Error inesperado"}));if(!x.ok)throw new Error(d.error||"Error");return d};
const say=(id,ok,t)=>{const e=$(id);if(!e)return;e.className="msg "+(ok?"ok":"err");e.textContent=t};
const fecha=s=>s?new Date(s).toLocaleDateString("es-AR"):"";
const n0=n=>Math.round(+n||0).toLocaleString("es-AR");
let YO=null;
const TABS=window.TABS={};

// ---------- Exportar a Excel (CSV que Excel abre directo, con tildes y separador ;) ----------
function exportar(nombre,cols,filas){
  const c=v=>{v=v==null?"":typeof v==="number"?String(v).replace(".",","):plain(String(v));return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv="﻿"+[cols.map(c).join(";"),...filas.map(f=>f.map(c).join(";"))].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=nombre+"-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();a.remove();
}

// ---------- Entrar (dueño con la clave de siempre, o usuario + clave) ----------
async function entrar(auto){
  try{
    if(!auto){const us=$("u").value.trim(),cl=$("k").value;
      if(us){const d=await (await fetch("/.netlify/functions/gestion?r=login",{method:"POST",body:JSON.stringify({usuario:us,clave:cl})})).json();if(!d.token)throw new Error(d.error||"Usuario o clave incorrectos.");K=d.token}else K=cl}
    YO=await GJ("yo");
  }catch(e){$("m").textContent=e.message==="clave incorrecta o sin permiso"?"Clave incorrecta.":e.message;sessionStorage.removeItem("k");return}
  sessionStorage.setItem("k",K);
  const ok=p=>YO.permisos.includes("*")||YO.permisos.includes(p)||(p==="facturacion"&&YO.rol==="dueño")||(p==="logistica"&&YO.permisos.includes("pedidos"));
  let first=null;for(const b of $("tabs").children){const v=ok(b.dataset.p);b.hidden=!v;if(v&&!first)first=b}
  const simple=YO.rol==="logistica";$("tabs").style.display=simple?"none":"";$("hoyAuto").hidden=simple; // logística: una sola pantalla
  $("yoBar").hidden=false;$("yoBar").innerHTML=`Entraste como <b>${esc(YO.nombre)}</b> (${esc(YO.rolNombre)}) · <a href="#" id="salir">Salir</a>`;
  $("salir").onclick=e=>{e.preventDefault();sessionStorage.removeItem("k");location.reload()};
  await load();
  if(first)first.click();
}
window.entrar=entrar;
if(K)entrar(true);

// ---------- Pedidos: buscar, filtrar y exportar ----------
const _renderP=renderP;
renderP=function(){const q=($("pq").value||"").toLowerCase(),fe=$("pfe").value;const all=L;
  L=all.filter(o=>(!fe||o.etapaActual===fe)&&(!q||[o.nombre,o.telefono,o.email,o.direccion,...(o.items||[]).map(i=>i.nombre)].join(" ").toLowerCase().includes(q)));
  try{_renderP()}finally{L=all}};
$("pq").oninput=$("pfe").onchange=()=>renderP();
$("pexp").onclick=()=>exportar("pedidos",["Fecha","Estado","Sección","Cliente","Teléfono","Email","Dirección","Entrega","Productos","Envío","Total","Ganancia aprox.","Pago","Factura"],
  L.map(o=>[new Date(o.fecha).toLocaleString("es-AR"),(ET[o.etapaActual]||[,o.estado])[1].replace(/^\S+ /,"")+" · "+pagoTxt(o).replace(/^\S+ /,""),o.modo==="bulto"?"Mayoristas":"Supermercado",o.nombre,o.telefono,o.email||"",o.direccion,o.entrega||"",(o.items||[]).map(i=>i.cantidad+" x "+plain(i.nombre)).join(" | "),o.envio||0,o.total,(o.items||[]).reduce((a,i)=>a+(i.costo?(i.precio-i.costo)*i.cantidad:0),0),o.pago?.medio||"",o.factura?o.factura.tipo+" "+nroF(o.factura):""]));

// ---------- Entregas (hoja de ruta y repartidores) ----------
let REP=[];
const ordenDia=t=>{const m=String(t||"").match(/(\d{1,2})\/(\d{1,2})/);return m?(+m[2])*100+(+m[1]):9999};
TABS.ent=async()=>{
  if(YO.permisos.includes("*")||YO.permisos.includes("pedidos"))REP=await GJ("repartidores").catch(()=>[]);
  const P=L.filter(o=>["nuevo","preparando","en camino"].includes(o.etapaActual));
  const dias=[...new Set(P.map(o=>(o.entrega||"Sin día elegido").split(" · ")[0]))].sort((a,b)=>ordenDia(a)-ordenDia(b));
  const sel=$("entDia").value;$("entDia").innerHTML=`<option value="">Todos los días (${P.length})</option>`+dias.map(d=>`<option ${d===sel?"selected":""}>${esc(d)}</option>`).join("");
  renderEnt();
};
function renderEnt(){
  const d=$("entDia").value;
  const P=L.filter(o=>["nuevo","preparando","en camino"].includes(o.etapaActual)&&(!d||(o.entrega||"Sin día elegido").split(" · ")[0]===d))
    .sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega))||String(a.zona||a.direccion).localeCompare(String(b.zona||b.direccion)));
  window.ENTV=P;
  const asig=YO.permisos.includes("*")||YO.permisos.includes("pedidos");
  $("entL").innerHTML=P.length?P.map((o,i)=>`<div class="o"><b>${i+1}.</b> ${etq(o)} ${o.entrega?`🕒 <b>${esc(o.entrega)}</b> · `:""}<b>${esc(o.nombre)}</b> · <a href="https://wa.me/${String(o.telefono).replace(/\D/g,"").replace(/^(?!54)/,"549")}" target="_blank" rel="noopener">${esc(o.telefono)}</a><br>📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plain(o.direccion))}" target="_blank" rel="noopener">${esc(o.direccion)}</a><br>
    ${(o.items||[]).length} productos · <b>${o.estado==="efectivo al recibir"?"COBRAR "+money(o.total)+" en efectivo":o.estado==="espera transferencia"?"Espera transferencia: "+money(o.total):"Pagado ("+money(o.total)+")"}</b>${o.modo==="bulto"?" · 📦 Mayorista":""}
    <details><summary>Ver productos</summary><ul>${o.items.map(i=>`<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("")}</ul></details>
    ${asig?`<label>Repartidor: <select onchange="asignar('${o.id}',this.value)"><option value="">Sin asignar</option>${REP.map(r=>`<option value="${esc(r.usuario)}" ${o.repartidor===r.usuario?"selected":""}>${esc(r.nombre)}</option>`).join("")}</select></label>`:""}
    ${o.etapaActual==="nuevo"?'<span class="muted">Falta comprar la mercadería.</span> ':""}${o.etapaActual!=="en camino"?`<button onclick="setE('${o.id}','en camino')">👉 Marcar que salió</button>`:""} <button class="p" onclick="setE('${o.id}','entregado')">👉 Marcar entregado</button></div>`).join(""):'<p class="muted">No hay pedidos para repartir. 🎉</p>';
}
$("entDia").onchange=renderEnt;
window.asignar=async(id,rep)=>{await api("pedidos",{method:"POST",body:JSON.stringify({id,repartidor:rep})});const o=L.find(x=>x.id===id);if(o)o.repartidor=rep};
$("entExp").onclick=()=>exportar("hoja-de-ruta",["#","Entrega","Cliente","Teléfono","Dirección","Productos","Cobrar","Estado","Repartidor"],(window.ENTV||[]).map((o,i)=>[i+1,o.entrega||"",o.nombre,o.telefono,o.direccion,(o.items||[]).map(i=>i.cantidad+" x "+plain(i.nombre)).join(" | "),o.estado==="efectivo al recibir"?o.total:0,(ET[o.etapaActual]||[,""])[1].replace(/^\S+ /,""),o.repartidor||""]));

// ---------- Clientes ----------
let CLI=[];
TABS.cli=async()=>{try{CLI=await GJ("clientes")}catch(e){$("cliL").textContent=e.message;return}renderCli()};
function renderCli(){
  const q=($("cliQ").value||"").toLowerCase(),t=$("cliT").value;
  const C=CLI.filter(c=>(!t||(t==="m")===c.mayorista)&&(!q||[c.nombre,c.telefono,c.email,c.direccion].join(" ").toLowerCase().includes(q)));
  window.CLIV=C;
  const tot=C.reduce((s,c)=>s+c.total,0),rec=C.filter(c=>c.pedidos>1).length;
  $("cliK").innerHTML=[["Clientes",C.length],["Compraron más de una vez",rec],["Facturado",money(tot)],["Promedio por cliente",C.length?money(tot/C.length):"—"]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  $("cliL").innerHTML=C.length?`<table><tr><th>Cliente</th><th>Contacto</th><th class="n">Pedidos</th><th class="n">Total</th><th>Último</th></tr>${C.map(c=>`<tr><td><b>${esc(c.nombre)}</b>${c.mayorista?' <span class="tag">📦 Mayorista</span>':""}<br><span class="muted">${esc(c.direccion)}</span></td><td><a href="https://wa.me/${String(c.telefono).replace(/\D/g,"").replace(/^(?!54)/,"549")}" target="_blank" rel="noopener">${esc(c.telefono)}</a>${c.email?"<br>"+esc(c.email):""}</td><td class="n">${c.pedidos}</td><td class="n">${money(c.total)}</td><td>${fecha(c.ultimo)}</td></tr>`).join("")}</table>`:'<p class="muted">Todavía no hay clientes.</p>';
}
$("cliQ").oninput=$("cliT").onchange=renderCli;
$("cliExp").onclick=()=>exportar("clientes",["Nombre","Teléfono","Email","Dirección","Tipo","Pedidos","Total comprado","Primera compra","Última compra"],(window.CLIV||[]).map(c=>[c.nombre,c.telefono,c.email,c.direccion,c.mayorista?"Mayorista":"Supermercado",c.pedidos,Math.round(c.total),fecha(c.primero),fecha(c.ultimo)]));

// ---------- Inventario ----------
let ST={},CO={},CAT=null,CHG={};
async function catalogo(){if(!CAT){CAT=await GJ("catalogo");CAT.by=new Map(CAT.p.map(p=>[p[1],p]));CAT.p.forEach(p=>p.k=plain(p[2]).toLowerCase());$("catsDL").innerHTML=CAT.cats.map(c=>`<option value="${esc(c)}">`).join("")}return CAT}
const costoU=sku=>{const c=CO[sku];return c?c[0]:0};
TABS.inv=async()=>{
  try{const d=await GJ("stock");ST=d.stock;CO=d.costos}catch(e){$("invL").textContent=e.message;return}
  CHG={};renderInv();loadProp();
  if(!$("movMes").value)$("movMes").value=new Date().toISOString().slice(0,7);loadMov();
  catalogo().then(renderInv).catch(()=>{});
};
function renderInv(){
  const q=($("invQ").value||"").toLowerCase(),f=$("invF").value;
  const R=Object.entries(ST).map(([sku,x])=>({sku,n:x.n||CAT?.by.get(sku)?.[2]||sku,c:x.c||0,m:x.m||0})).filter(r=>(!q||plain(r.n).toLowerCase().includes(q)||r.sku.includes(q))&&(!f||(f==="neg"&&r.c<0)||(f==="bajo"&&r.m>0&&r.c<r.m)||(f==="con"&&r.c>0))).sort((a,b)=>plain(a.n).localeCompare(plain(b.n)));
  window.INVV=R;
  const all=Object.values(ST),val=Object.entries(ST).reduce((s,[k,x])=>s+Math.max(0,x.c||0)*costoU(k),0);
  $("invK").innerHTML=[["Productos con stock",all.filter(x=>x.c>0).length],["Valor del stock (a costo)",money(val)],["Vendidos sin comprar",all.filter(x=>x.c<0).length],["Debajo del mínimo",all.filter(x=>x.m>0&&x.c<x.m).length]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  $("invL").innerHTML=R.length?`<table><tr><th>Producto</th><th class="n">Stock (unid.)</th><th class="n">Mínimo</th><th class="n">Valor</th></tr>${R.slice(0,500).map(r=>`<tr><td>${esc(plain(r.n))}<br><span class="muted">${esc(r.sku)}</span></td><td class="n"><input type="number" data-s="${esc(r.sku)}" data-k="cantidad" value="${r.c}" class="${r.c<0?"neg":r.m>0&&r.c<r.m?"bajo":""}"></td><td class="n"><input type="number" min="0" data-s="${esc(r.sku)}" data-k="minimo" value="${r.m}"></td><td class="n">${r.c>0&&costoU(r.sku)?money(r.c*costoU(r.sku)):"—"}</td></tr>`).join("")}</table>${R.length>500?`<p class="muted">Mostrando 500 de ${R.length}: usá el buscador.</p>`:""}`:'<p class="muted">Todavía no hay movimientos de stock. Se llena solo con las ventas, o agregá productos abajo.</p>';
}
$("invQ").oninput=$("invF").onchange=renderInv;
$("invL").addEventListener("input",e=>{const i=e.target.closest("input[data-s]");if(!i)return;const k=i.dataset.s;CHG[k]=CHG[k]||{sku:k,nombre:ST[k]?.n||""};CHG[k][i.dataset.k]=i.value;say("invMsg",true,Object.keys(CHG).length+" cambios sin guardar")});
$("invGuardar").onclick=async()=>{const filas=Object.values(CHG);if(!filas.length)return say("invMsg",true,"No hay cambios.");
  try{const d=await GJ("stock",{filas});ST=d.stock;CHG={};renderInv();say("invMsg",true,"Guardado.")}catch(e){say("invMsg",false,e.message)}};
$("invExp").onclick=()=>exportar("stock",["Código","Producto","Stock (unidades)","Mínimo","Costo unitario","Valor"],(window.INVV||[]).map(r=>[r.sku,r.n,r.c,r.m,costoU(r.sku)||"",r.c>0?Math.round(r.c*costoU(r.sku)):0]));
$("catExp").onclick=async()=>{const C=await catalogo();exportar("catalogo",["Código","Producto","Categoría","Precio Supermercado","Precio bulto Mayoristas","Unidades por bulto","Costo unitario","Stock"],C.p.map(p=>[p[1],p[2],C.cats[p[0]],p[3],p[4]||"",p[5],costoU(p[1])||"",ST[p[1]]?.c??""]))};
$("addQ").oninput=async()=>{const q=$("addQ").value.trim().toLowerCase();if(q.length<3){$("addL").innerHTML="";return}const C=await catalogo();const w=q.split(/\s+/);
  const R=C.p.filter(p=>w.every(x=>p.k.includes(x))).slice(0,15);
  $("addL").innerHTML=R.map(p=>`<div style="margin:4px 0">${esc(plain(p[2]))} <span class="muted">(${p[5]>1?"bulto x"+p[5]:"unidad"})</span> · stock <input type="number" id="ad_${p[1]}" value="${ST[p[1]]?.c||0}" style="width:80px"> mínimo <input type="number" min="0" id="am_${p[1]}" value="${ST[p[1]]?.m||0}" style="width:70px"> <button type="button" onclick="agregarStock('${p[1]}')">Guardar</button></div>`).join("")||'<p class="muted">Sin resultados.</p>'};
window.agregarStock=async sku=>{const p=CAT.by.get(sku);try{const d=await GJ("stock",{filas:[{sku,nombre:plain(p[2]),cantidad:$("ad_"+sku).value,minimo:$("am_"+sku).value}]});ST=d.stock;renderInv();say("invMsg",true,"Guardado: "+plain(p[2]))}catch(e){say("invMsg",false,e.message)}};
// Importar desde Excel/CSV
let IMP=null;
const normCol=s=>plain(String(s||"")).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim().replace(/\s+/g,"_");
const ALIAS={codigo:"sku",sku:"sku",cod:"sku",ean:"sku",nombre:"nombre",producto:"nombre",descripcion:"nombre",cantidad:"cantidad",stock:"cantidad",minimo:"minimo",stock_minimo:"minimo",precio:"pu",precio_unidad:"pu",precio_supermercado:"pu",precio_bulto:"pb",unidades_bulto:"bu",unidades_por_bulto:"bu",categoria:"cat",rubro:"cat",costo:"costo",foto:"foto",imagen:"foto"};
async function leerArchivo(f){
  if(/\.csv$/i.test(f.name)){const t=await f.text();const sep=(t.split("\n")[0].match(/;/g)||[]).length>=(t.split("\n")[0].match(/,/g)||[]).length?";":",";
    const rows=t.replace(/^﻿/,"").split(/\r?\n/).filter(Boolean).map(l=>{const o=[];let cur="",q=false;for(const ch of l){if(ch==='"'){q=!q;continue}if(ch===sep&&!q){o.push(cur);cur="";continue}cur+=ch}o.push(cur);return o});return rows}
  if(!window.XLSX)throw new Error("No se pudo cargar el lector de Excel. Guardá el archivo como CSV y probá de nuevo.");
  const wb=XLSX.read(await f.arrayBuffer());return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""});
}
$("impFile").onchange=async()=>{const f=$("impFile").files[0];IMP=null;$("impOk").disabled=true;if(!f)return;
  try{const rows=await leerArchivo(f);const head=rows[0].map(h=>ALIAS[normCol(h)]||null);
    const filas=rows.slice(1).map(r=>{const o={};head.forEach((h,i)=>{if(h&&r[i]!==undefined&&String(r[i]).trim()!=="")o[h]=String(r[i]).trim()});["cantidad","minimo","pu","pb","bu","costo"].forEach(k=>{if(o[k]!==undefined)o[k]=String(o[k]).replace(/\$|\s/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",",".")});return o}).filter(o=>Object.keys(o).length);
    const tipo=$("impTipo").value;
    const valid=tipo==="stock"?filas.filter(o=>o.sku&&(o.cantidad!==undefined||o.minimo!==undefined)):filas.filter(o=>o.nombre&&(o.pu||o.pb));
    if(!valid.length)throw new Error(tipo==="stock"?"No encontré columnas codigo + cantidad (o minimo).":"No encontré columnas nombre + precio.");
    IMP={tipo,filas:valid};$("impOk").disabled=false;say("impMsg",true,`Listo para importar ${valid.length} filas${filas.length>valid.length?` (${filas.length-valid.length} sin datos suficientes se saltean)`:""}. Tocá Importar.`)}
  catch(e){say("impMsg",false,e.message)}};
$("impOk").onclick=async()=>{if(!IMP)return;$("impOk").disabled=true;say("impMsg",true,"Importando…");
  try{if(IMP.tipo==="stock"){const d=await GJ("stock",{tipo:"importacion",filas:IMP.filas.map(o=>({sku:o.sku,nombre:o.nombre,cantidad:o.cantidad,minimo:o.minimo}))});ST=d.stock;renderInv()}
    else{await GJ("propios",{accion:"importar",filas:IMP.filas.map(o=>({...o,stock:o.cantidad}))});loadProp();const d=await GJ("stock");ST=d.stock;renderInv()}
    say("impMsg",true,`Importadas ${IMP.filas.length} filas.`);IMP=null;$("impFile").value=""}catch(e){say("impMsg",false,e.message);$("impOk").disabled=false}};
$("impModelo").onclick=e=>{e.preventDefault();exportar("modelo-importacion",["codigo","nombre","categoria","precio","precio_bulto","unidades_bulto","costo","cantidad","minimo","foto"],[["","Bicicleta rodado 26","bicicletas",250000,"",1,180000,3,1,"https://…"],["304","ACEITE MAROLIO MEZCLA 900 CC","","","","","",24,12,""]])};
// Productos propios
async function loadProp(){try{const l=await GJ("propios");$("propL").innerHTML=l.length?`<table><tr><th>Producto</th><th>Categoría</th><th class="n">Precio</th><th class="n">Bulto</th><th class="n">Stock</th><th></th></tr>${l.map(x=>`<tr><td>${esc(x.nombre)}<br><span class="muted">${esc(x.sku)}</span></td><td>${esc(x.cat)}</td><td class="n">${x.pu?money(x.pu):"—"}</td><td class="n">${x.bu>1&&x.pb?money(x.pb)+" x"+x.bu:"—"}</td><td class="n">${ST[x.sku]?.c??"—"}</td><td><button type="button" onclick="borrarProp('${esc(x.sku)}')">Borrar</button></td></tr>`).join("")}</table>`:'<p class="muted">No cargaste productos propios.</p>'}catch(e){}}
window.borrarProp=async sku=>{if(!confirm("¿Borrar este producto de la tienda?"))return;await GJ("propios",{accion:"borrar",sku});loadProp()};
$("propF").onsubmit=async e=>{e.preventDefault();try{await GJ("propios",{nombre:$("prN").value,cat:$("prC").value,pu:$("prU").value,pb:$("prB").value,bu:$("prBu").value,costo:$("prCo").value,foto:$("prF").value,stock:$("prS").value});say("prMsg",true,"Agregado. Ya está en la tienda.");$("propF").reset();loadProp();const d=await GJ("stock");ST=d.stock;renderInv()}catch(err){say("prMsg",false,err.message)}};
// Movimientos
let MOV=[];
async function loadMov(){try{MOV=await (await G("movimientos",{qs:"&mes="+$("movMes").value})).json()}catch(e){MOV=[]}
  const T={venta:"Venta",compra:"Compra",ajuste:"Ajuste",devolucion:"Devolución",importacion:"Importación"};
  $("movL").innerHTML=MOV.length?`<table><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="n">Cantidad</th><th>Quién</th></tr>${MOV.slice(-300).reverse().map(m=>`<tr><td>${new Date(m.f).toLocaleString("es-AR")}</td><td>${esc(plain(m.n||m.sku))}</td><td>${T[m.t]||m.t}</td><td class="n ${m.d<0?"neg":""}">${m.d>0?"+":""}${m.d}</td><td>${esc(m.q||"")}</td></tr>`).join("")}</table>`:'<p class="muted">Sin movimientos en este mes.</p>'}
$("movMes").onchange=loadMov;
$("movExp").onclick=()=>exportar("movimientos-"+$("movMes").value,["Fecha","Código","Producto","Tipo","Cantidad","Referencia","Quién"],MOV.map(m=>[new Date(m.f).toLocaleString("es-AR"),m.sku,m.n,m.t,m.d,m.ref,m.q]));

// ---------- Compras y proveedores ----------
let SUG=[],COMP=[],PROV=[];
TABS.cpr=async()=>{try{const d=await GJ("compras");SUG=d.sugeridas;COMP=d.compras}catch(e){$("cprL").textContent=e.message;return}
  renderSug();renderComp();loadProv()};
function renderSug(){
  const tot=SUG.reduce((s,x)=>s+x.costo,0);
  $("cprL").innerHTML=SUG.length?`<p><b>${SUG.length}</b> productos · costo aprox. <b>${money(tot)}</b></p><table><tr><th>Producto</th><th class="n">Hacen falta</th><th class="n">Comprar</th><th class="n">Unidades</th><th class="n">Costo aprox.</th></tr>${SUG.map((x,i)=>`<tr><td>${esc(plain(x.nombre))}${x.stock>0?`<br><span class="muted">En el depósito hay ${x.stock}</span>`:""}</td><td class="n"><b>${x.falta}</b></td><td class="n">${x.bultos?`<b>${x.bultos} bulto${x.bultos>1?"s":""}</b> x${x.bu}`:`<b>${x.unidades} u.</b>`}</td><td class="n"><input type="number" min="0" data-i="${i}" value="${x.unidades}"></td><td class="n">${x.costo?money(x.costo):"—"}</td></tr>`).join("")}</table>`:'<p class="muted">No hay nada para comprar. 🎉</p>';
}
$("cprL").addEventListener("input",e=>{const i=e.target.dataset.i;if(i!==undefined)SUG[+i].unidades=+e.target.value||0});
const sugTxt=()=>"Para comprar en Maxiconsumo:\n"+SUG.filter(x=>x.unidades>0).map(x=>"• "+(x.bultos&&x.unidades%x.bu===0?`${x.unidades/x.bu} bulto${x.unidades/x.bu>1?"s":""} x${x.bu}`:`${x.unidades} u.`)+" — "+plain(x.nombre)).join("\n");
$("cprCopy").onclick=async()=>{try{await navigator.clipboard.writeText(sugTxt());say("cprMsg",true,"Copiada.")}catch(e){say("cprMsg",false,"No se pudo copiar.")}};
$("cprExp").onclick=()=>exportar("para-comprar",["Código","Producto","Stock","Falta","Bultos","Unidades por bulto","Unidades a comprar","Costo unitario","Costo aprox."],SUG.map(x=>[x.sku,x.nombre,x.stock,x.falta,x.bultos||"",x.bu,x.unidades,x.costoU,x.costo]));
async function yaCompre(msgId,prov){const items=SUG.filter(x=>x.unidades>0).map(x=>({sku:x.sku,nombre:plain(x.nombre),unidades:x.unidades,costo:x.costoU}));
  if(!items.length)return say(msgId,false,"No hay nada para comprar.");
  if(!confirm(`¿Ya compraste los ${items.length} productos de la lista en ${prov}?\n\nEl stock se suma solo y los pedidos pasan a "Para entregar".`))return false;
  try{const d=await GJ("compras",{proveedor:prov,items});say(msgId,true,`¡Listo! Compra anotada (${money(d.compra.total)}).${d.preparando?` ${d.preparando} pedido${d.preparando>1?"s pasaron":" pasó"} a "Para entregar".`:""}`);await load();return true}catch(e){say(msgId,false,e.message);return false}}
$("cprReg").onclick=async()=>{if(await yaCompre("cprMsg",$("cprProv").value))TABS.cpr()};
function renderComp(){const m=new Date().toISOString().slice(0,7),M=COMP.filter(c=>c.fecha.slice(0,7)===m);
  $("cprK").innerHTML=[["Gastado este mes",money(M.reduce((t,c)=>t+c.total,0))],["Compras este mes",M.length],["Última compra",COMP[0]?fecha(COMP[0].fecha):"—"]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  $("cprH").innerHTML=COMP.length?`<table><tr><th>Día</th><th>Qué se compró</th><th class="n">Gastado</th><th>Quién</th></tr>${COMP.map(c=>`<tr><td>${new Date(c.fecha).toLocaleDateString("es-AR")}<br><span class="muted">${esc(c.proveedor)}</span></td><td><details><summary>${c.items.length} productos</summary>${c.items.map(i=>`${i.unidades} x ${esc(plain(i.nombre))}`).join("<br>")}</details></td><td class="n"><b>${money(c.total)}</b></td><td>${esc(c.quien||"")}</td></tr>`).join("")}</table>`:'<p class="muted">Todavía no hay compras. Aparecen solas cuando alguien toca "✅ Ya compré todo" en 🏠 Hoy.</p>'}
$("cprHExp").onclick=()=>exportar("compras",["Fecha","Proveedor","Código","Producto","Unidades","Costo unitario","Subtotal","Quién"],COMP.flatMap(c=>c.items.map(i=>[new Date(c.fecha).toLocaleString("es-AR"),c.proveedor,i.sku,i.nombre,i.unidades,i.costo,Math.round(i.unidades*i.costo),c.quien||""])));
async function loadProv(){PROV=await GJ("proveedores").catch(()=>[]);
  const sel=$("cprProv").value;$("cprProv").innerHTML=PROV.map(p=>`<option ${p.nombre===sel?"selected":""}>${esc(p.nombre)}</option>`).join("");
  $("provL").innerHTML=PROV.map(p=>`<div class="o"><b>${esc(p.nombre)}</b>${p.contacto?" · "+esc(p.contacto):""}${p.telefono?" · "+esc(p.telefono):""}${p.email?" · "+esc(p.email):""}${p.web?` · <a href="${esc(p.web)}" target="_blank" rel="noopener">web</a>`:""}${p.notas?`<br><span class="muted">${esc(p.notas)}</span>`:""} <button type="button" onclick="editProv('${p.id}')">Editar</button>${p.fijo?"":` <button type="button" onclick="borrarProv('${p.id}')">Borrar</button>`}</div>`).join("")}
window.editProv=id=>{const p=PROV.find(x=>x.id===id);$("pvId").value=p.id;$("pvN").value=p.nombre;$("pvC").value=p.contacto||"";$("pvT").value=p.telefono||"";$("pvE").value=p.email||"";$("pvW").value=p.web||"";$("pvNo").value=p.notas||""};
window.borrarProv=async id=>{if(confirm("¿Borrar proveedor?")){await GJ("proveedores",{accion:"borrar",id});loadProv()}};
$("provF").onsubmit=async e=>{e.preventDefault();await GJ("proveedores",{id:$("pvId").value||undefined,nombre:$("pvN").value,contacto:$("pvC").value,telefono:$("pvT").value,email:$("pvE").value,web:$("pvW").value,notas:$("pvNo").value}).catch(err=>alert(err.message));$("provF").reset();$("pvId").value="";loadProv()};
$("pvExp").onclick=()=>exportar("proveedores",["Nombre","Contacto","Teléfono","Email","Web","Notas"],PROV.map(p=>[p.nombre,p.contacto,p.telefono,p.email,p.web,p.notas]));

// ---------- Promociones ----------
let PROMOS=[],PSK=[];
TABS.cup=async()=>{loadC();try{PROMOS=await GJ("promos")}catch(e){$("proL").textContent=e.message;return}
  const C=await catalogo().catch(()=>null);if(C&&!$("poCats").dataset.ok){$("poCats").innerHTML=C.cats.map(c=>`<label class="chk"><input type="checkbox" value="${esc(c)}"> ${esc(c)}</label>`).join("");$("poCats").dataset.ok=1}
  renderPromos()};
function renderPromos(){const hoy=new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  $("proL").innerHTML=PROMOS.length?PROMOS.map(p=>{const vig=p.activa!==false&&(!p.desde||p.desde<=hoy)&&(!p.hasta||p.hasta>=hoy);return `<div class="o"><b>${esc(p.nombre)}</b> · <b>${p.pct}% off</b> · ${({ambos:"Mayoristas y Supermercado",unidad:"Supermercado",bulto:"Mayoristas"})[p.modo]} · ${p.desde||p.hasta?`${p.desde?fecha(p.desde+"T12:00"):"hoy"} al ${p.hasta?fecha(p.hasta+"T12:00"):"sin fin"}`:"sin fechas"} · ${vig?'<span class="tag">✅ vigente</span>':'<span class="tag">⏸ no vigente</span>'}<br><span class="muted">${p.cats.length?"Categorías: "+p.cats.map(esc).join(", "):""}${p.skus.length?" · "+p.skus.length+" productos":""}${!p.cats.length&&!p.skus.length?"Toda la tienda":""}</span> <button type="button" onclick="editPromo('${p.id}')">Editar</button> <button type="button" onclick="togglePromo('${p.id}')">${p.activa!==false?"Pausar":"Activar"}</button> <button type="button" onclick="borrarPromo('${p.id}')">Borrar</button></div>`}).join(""):'<p class="muted">No hay promociones.</p>'}
const renderPSK=()=>{$("poSk").innerHTML=PSK.map(s=>`<span class="tag">${esc(plain(CAT?.by.get(s)?.[2]||s))} <a href="#" onclick="PSK=PSK.filter(x=>x!=='${s}');renderPSK();return false">✕</a></span>`).join("")};window.renderPSK=renderPSK;
$("poQ").oninput=async()=>{const q=$("poQ").value.trim().toLowerCase();if(q.length<3){$("poQL").innerHTML="";return}const C=await catalogo();const w=q.split(/\s+/);
  $("poQL").innerHTML=C.p.filter(p=>w.every(x=>p.k.includes(x))).slice(0,10).map(p=>`<div><a href="#" onclick="if(!PSK.includes('${p[1]}'))PSK.push('${p[1]}');renderPSK();return false">+ ${esc(plain(p[2]))}</a></div>`).join("")};
window.editPromo=id=>{const p=PROMOS.find(x=>x.id===id);$("poId").value=p.id;$("poN").value=p.nombre;$("poP").value=p.pct;$("poM").value=p.modo;$("poD").value=p.desde||"";$("poH").value=p.hasta||"";$("poA").checked=p.activa!==false;
  $("poCats").querySelectorAll("input").forEach(i=>i.checked=p.cats.includes(i.value));PSK=[...p.skus];renderPSK();$("poN").focus()};
window.togglePromo=async id=>{const p=PROMOS.find(x=>x.id===id);PROMOS=await GJ("promos",{...p,activa:p.activa===false});renderPromos()};
window.borrarPromo=async id=>{if(confirm("¿Borrar promoción?")){PROMOS=await GJ("promos",{accion:"borrar",id});renderPromos()}};
$("proF").onsubmit=async e=>{e.preventDefault();try{PROMOS=await GJ("promos",{id:$("poId").value||undefined,nombre:$("poN").value,pct:$("poP").value,modo:$("poM").value,desde:$("poD").value,hasta:$("poH").value,activa:$("poA").checked,cats:[...$("poCats").querySelectorAll("input:checked")].map(i=>i.value),skus:PSK});
  say("poMsg",true,"Guardada. Se ve en la tienda en 1 minuto.");$("proF").reset();$("poId").value="";PSK=[];renderPSK();$("poCats").querySelectorAll("input").forEach(i=>i.checked=false);renderPromos()}catch(err){say("poMsg",false,err.message)}};

// ---------- Medios de pago (en la pestaña de precios) ----------
const _loadP=loadP;
loadP=async function(){await _loadP();try{const d=await (await api("productos")).json();const p=d.pagos||{};$("pgMp").checked=p.mp!==false;$("pgEf").checked=p.efectivo!==false;$("pgTr").checked=!!p.transferencia;$("pgAl").value=p.alias||""}catch(e){}};
$("pgF").onsubmit=async e=>{e.preventDefault();const r=await api("productos",{method:"POST",body:JSON.stringify({pagos:{mp:$("pgMp").checked,efectivo:$("pgEf").checked,transferencia:$("pgTr").checked,alias:$("pgAl").value}})});const d=await r.json().catch(()=>({}));say("pgMsg",r.ok,r.ok?"Guardado. La tienda lo usa en 1 minuto.":(d.error||"No se pudo guardar."))};

// ---------- Estadísticas: ganancia y compras ----------
const _stats=stats;
stats=async function(){_stats();
  const per=$("per").value,now=new Date(),desde=per==="todo"?new Date(0):per==="mes"?new Date(now.getFullYear(),now.getMonth(),1):new Date(now-(+per)*864e5);
  const V=L.filter(o=>["pagado","entregado","efectivo al recibir"].includes(o.estado)&&new Date(o.fecha)>=desde);
  let gan=0,conC=0,vta=0;for(const o of V)for(const i of o.items||[]){vta+=i.precio*i.cantidad;if(i.costo){gan+=(i.precio-i.costo)*i.cantidad;conC+=i.precio*i.cantidad}}
  const extra=[["Ganancia aprox.",conC?money(gan):"—"],["Margen",conC?Math.round(gan/conC*100)+"%":"—"]];
  try{const d=await GJ("compras");const c=d.compras.filter(x=>new Date(x.fecha)>=desde);extra.push(["Compras del período",money(c.reduce((s,x)=>s+x.total,0))],["Por comprar ahora",money(d.sugeridas.reduce((s,x)=>s+x.costo,0))])}catch(e){}
  $("kpis").insertAdjacentHTML("beforeend",extra.map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join(""));
};
$("per").onchange=()=>stats();

// ---------- Usuarios ----------
TABS.usu=async()=>{let l;try{l=await GJ("usuarios")}catch(e){$("usL").textContent=e.message;return}renderUs(l)};
function renderUs(l){$("usL").innerHTML=l.length?`<table><tr><th>Nombre</th><th>Usuario</th><th>Qué hace</th><th>Estado</th><th></th></tr>${l.map(x=>`<tr><td>${esc(x.nombre)}</td><td>${esc(x.usuario)}</td><td>${esc(x.rolNombre)}</td><td>${x.activo!==false?"Activo":"Dado de baja"}</td><td><button type="button" onclick="usAcc('${esc(x.usuario)}','activo',${x.activo===false})">${x.activo!==false?"Dar de baja":"Reactivar"}</button> <button type="button" onclick="usAcc('${esc(x.usuario)}','clave')">Cambiar clave</button> <button type="button" onclick="usAcc('${esc(x.usuario)}','borrar')">Borrar</button></td></tr>`).join("")}</table>`:'<p class="muted">Todavía no creaste usuarios. Por ahora entrás solo vos.</p>'}
window.usAcc=async(usuario,acc,val)=>{try{let b={accion:"editar",usuario};
  if(acc==="activo")b.activo=val;
  if(acc==="clave"){const c=prompt("Nueva clave (mínimo 6 caracteres):");if(!c)return;b.clave=c}
  if(acc==="borrar"){if(!confirm("¿Borrar el usuario "+usuario+"?"))return;b={accion:"borrar",usuario}}
  renderUs(await GJ("usuarios",b));say("usMsg",true,"Listo.")}catch(e){say("usMsg",false,e.message)}};
$("usF").onsubmit=async e=>{e.preventDefault();const n=$("usN").value.trim(),u=$("usU").value.trim().toLowerCase(),c=$("usC").value;
  try{renderUs(await GJ("usuarios",{accion:"crear",nombre:n,usuario:u,clave:c,rol:$("usR").value}));say("usMsg",true,"¡Usuario creado!");$("usF").reset();
    const txt=`Hola ${n}! Para entrar al panel de Proveeduría Virtual:\n👉 ${location.origin}/pedidos.html\nUsuario: ${u}\nClave: ${c}`;
    $("usPasar").hidden=false;$("usPasar").innerHTML=`<b>Pasale esto a ${esc(n)}</b> (por WhatsApp o en persona):<pre style="white-space:pre-wrap;font:inherit;background:var(--soft);padding:10px;border-radius:8px">${esc(txt)}</pre><button type="button" id="usCopy">📋 Copiar mensaje</button>`;
    $("usCopy").onclick=async()=>{try{await navigator.clipboard.writeText(txt);$("usCopy").textContent="¡Copiado!"}catch(e){}}}
  catch(err){say("usMsg",false,err.message)}};

// Al recargar pedidos (por ejemplo después de "Entregado"), refrescar también la hoja de ruta si está abierta
const _load=load;
load=async function(){await _load();if(!$("hoy").hidden&&TABS.hoy)TABS.hoy();if(!$("ent").hidden&&TABS.ent)TABS.ent();if(!$("cli").hidden&&TABS.cli)TABS.cli()};

// ---------- Hoy: pedidos del día → lista de compras → entregas ----------
const irA=t=>{const b=[...$("tabs").children].find(x=>x.dataset.t===t);if(b&&!b.hidden)b.click()};window.irA=irA;
const waLink=t=>`https://wa.me/${String(t).replace(/\D/g,"").replace(/^(?!54)/,"549")}`;
const cobrar=o=>o.estado==="efectivo al recibir"?`<span class="cobrar">COBRAR ${money(o.total)} en efectivo</span>`:o.estado==="espera transferencia"?`<span class="cobrar">Espera transferencia (${money(o.total)})</span>`:`<span class="muted">Pagado ✓</span>`;
const prods=o=>`<details><summary>${(o.items||[]).length} productos</summary><ul>${o.items.map(i=>`<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("")}</ul></details>`;
TABS.hoy=async()=>{
  const ver=p=>YO.permisos.includes("*")||YO.permisos.includes(p);
  if(ver("compras")){try{SUG=(await GJ("compras")).sugeridas}catch(e){SUG=[]}}
  const por=e=>L.filter(o=>o.etapaActual===e).sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega)));
  const nuevos=por("nuevo"),entregar=[...por("preparando"),...por("en camino")].sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega))||String(a.zona).localeCompare(String(b.zona)));
  const hoyS=new Date().toLocaleDateString("es-AR"),entHoy=L.filter(o=>o.etapaActual==="entregado"&&o.entregado&&new Date(o.entregado).toLocaleDateString("es-AR")===hoyS).length;
  const esp=por("esperando pago").length,costo=SUG.reduce((t,x)=>t+x.costo,0);
  const act=SUG.length||nuevos.length?(SUG.length?2:1):entregar.length?3:0;
  const cant=x=>x.bultos&&x.unidades%x.bu===0?`${x.unidades/x.bu} bulto${x.unidades/x.bu>1?"s":""} x${x.bu}`:`${x.unidades} u.`;
  $("hoyBody").innerHTML=
  `<div class="blk ${act===1?"activo":""}"><h2>📥 1. Pedidos nuevos <span class="cnt">${nuevos.length}</span></h2>
    ${nuevos.length?nuevos.map(o=>`<div class="fila"><b>${esc(o.nombre)}</b>${o.modo==="bulto"?" · 📦 Mayorista":""}${o.entrega?` · 🕒 ${esc(o.entrega)}`:""} · ${money(o.total)}${prods(o)}</div>`).join(""):'<p class="muted">No hay pedidos nuevos.</p>'}
    ${esp?`<p class="muted">Hay ${esp} pedido${esp>1?"s":""} esperando que se acredite el pago: aparece${esp>1?"n":""} acá solo${esp>1?"s":""} cuando se paguen.</p>`:""}</div>
  <div class="blk ${act===2?"activo":""}"><h2>🛒 2. Lista de compras para Maxiconsumo <span class="cnt">${SUG.length}</span>${SUG.length?`<small class="muted">aprox. ${money(costo)}</small>`:""}</h2>
    ${SUG.length?`<table><tr><th>Comprar</th><th>Producto</th></tr>${SUG.map(x=>`<tr><td><b>${cant(x)}</b></td><td>${esc(plain(x.nombre))}</td></tr>`).join("")}</table>
    <div class="tools"><button type="button" id="hoyCopy">📋 Copiar lista</button> <button type="button" id="hoyPrint">🖨 Imprimir lista</button> <button type="button" class="p big" id="hoyYa">✅ Ya compré todo</button></div>`
    :nuevos.length?`<p class="muted">No hace falta comprar nada: lo que piden ya está en el depósito.</p><button type="button" class="p" id="hoyPrep">✅ Pasar los pedidos a preparar</button>`:'<p class="muted">No hay nada para comprar. 🎉</p>'}</div>
  <div class="blk ${act===3?"activo":""}"><h2>🚚 3. Para entregar <span class="cnt">${entregar.length}</span><small class="muted">Entregados hoy: ${entHoy}</small></h2>
    ${entregar.length?entregar.map((o,i)=>`<div class="fila"><b>${i+1}. ${esc(o.nombre)}</b>${o.entrega?` · 🕒 <b>${esc(o.entrega)}</b>`:""}<br>📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plain(o.direccion))}" target="_blank" rel="noopener">${esc(o.direccion)}</a> · 📞 <a href="${waLink(o.telefono)}" target="_blank" rel="noopener">${esc(o.telefono)}</a><br>${cobrar(o)}${prods(o)}<button type="button" class="p big" onclick="setE('${o.id}','entregado')">👉 Marcar entregado</button></div>`).join(""):'<p class="muted">No hay pedidos para entregar.</p>'}</div>`;
  if($("hoyCopy"))$("hoyCopy").onclick=async()=>{try{await navigator.clipboard.writeText(sugTxt());say("hoyMsg",true,"Lista copiada. Pegala en WhatsApp o en las notas del celular.")}catch(e){say("hoyMsg",false,"No se pudo copiar.")}};
  if($("hoyPrint"))$("hoyPrint").onclick=()=>{const w=open("","_blank");if(!w)return;w.document.write(`<title>Lista de compras</title><body style="font:16px system-ui;padding:20px"><h2>Lista de compras · Maxiconsumo · ${new Date().toLocaleDateString("es-AR")}</h2><table style="border-collapse:collapse">${SUG.map(x=>`<tr><td style="padding:6px 16px 6px 0">☐ <b>${cant(x)}</b></td><td>${esc(plain(x.nombre))}</td></tr>`).join("")}</table><script>print()<\/script>`);w.document.close()};
  if($("hoyYa"))$("hoyYa").onclick=async()=>{await yaCompre("hoyMsg","Maxiconsumo")};
  if($("hoyPrep"))$("hoyPrep").onclick=async()=>{for(const o of nuevos)await api("pedidos",{method:"POST",body:JSON.stringify({id:o.id,estado:"preparando"})});say("hoyMsg",true,"Listo, los pedidos pasaron a Para entregar.");load()};
};
// La pantalla se actualiza sola cada 2 minutos (si está abierta)
setInterval(()=>{if(YO&&!$("hoy").hidden&&!document.hidden&&!document.querySelector("#hoyBody details[open]"))load()},120000);
