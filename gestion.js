// Panel de gestión: usuarios, entregas, clientes, inventario, compras, proveedores, promociones, pagos y exportación a Excel.
// Usa lo que define pedidos.html: $, api, esc, plain, money, K, L, load, renderP, stats.
const G=(r,opt)=>fetch("/.netlify/functions/gestion?r="+r+"&k="+encodeURIComponent(K)+(opt&&opt.qs||""),opt);
const GJ=async(r,body)=>{const x=await G(r,body?{method:"POST",body:JSON.stringify(body)}:undefined);const d=await x.json().catch(()=>({error:"Error inesperado"}));if(!x.ok)throw new Error(d.error||"Error");return d};
const say=(id,ok,t)=>{const e=$(id);if(!e)return;e.className="msg "+(ok?"ok":"err");e.textContent=t};
const fecha=s=>s?new Date(s).toLocaleDateString("es-AR"):"";
const n0=n=>Math.round(+n||0).toLocaleString("es-AR");
let YO=null;
const TABS=window.TABS={};

// ---------- Exportar: Excel (.xlsx), CSV, PDF e impresión prolija ----------
const hoyF=()=>new Date().toISOString().slice(0,10);
function exportar(nombre,cols,filas,fmt,titulo,sub){
  fmt=fmt||(window.XLSX?"xlsx":"csv");
  const val=v=>v==null?"":typeof v==="number"?v:plain(String(v));
  if(fmt==="xlsx"&&window.XLSX){
    const ws=XLSX.utils.aoa_to_sheet([cols,...filas.map(f=>f.map(val))]);
    ws["!cols"]=cols.map((c,i)=>({wch:Math.min(60,Math.max(String(c).length,...filas.slice(0,300).map(f=>String(val(f[i])).length))+2)}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,String(titulo||nombre).replace(/[\\/?*[\]:]/g,"").slice(0,31));XLSX.writeFile(wb,nombre+"-"+hoyF()+".xlsx");return}
  if(fmt==="pdf"||fmt==="print"){
    const w=open("","_blank");if(!w){alert("El navegador bloqueó la ventana. Permití las ventanas emergentes para este sitio.");return}
    const num=v=>typeof v==="number";
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(titulo||nombre)}</title><style>body{font:12px system-ui,sans-serif;margin:18px;color:#111}h1{font-size:18px;margin:0}p{margin:4px 0 10px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef4f0}td.n{text-align:right;white-space:nowrap}tr{break-inside:avoid}.av{background:#fde9a8;padding:8px;border-radius:6px;margin-bottom:10px}@media print{.av{display:none}}</style>
      ${fmt==="pdf"?`<div class="av">Para guardarlo como PDF: en la ventana de impresión elegí <b>Guardar como PDF</b> como destino.</div>`:""}
      <h1>${esc(titulo||nombre)}</h1><p>${esc(sub||"")} · ${filas.length} filas · ${new Date().toLocaleString("es-AR")}</p>
      <table><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr>${filas.map(f=>`<tr>${f.map(v=>`<td class="${num(v)?"n":""}">${num(v)?v.toLocaleString("es-AR"):esc(val(v))}</td>`).join("")}</tr>`).join("")}</table><script>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();return}
  const c=v=>{v=val(v);v=typeof v==="number"?String(v).replace(".",","):v;return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv="\ufeff"+[cols.map(c).join(";"),...filas.map(f=>f.map(c).join(";"))].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=nombre+"-"+hoyF()+".csv";document.body.appendChild(a);a.click();a.remove();
}
// Botonera de exportación: datos() devuelve {cols, filas, sub}
function barraExp(id,nombre,titulo,datos){const e=$(id);if(!e)return;e.className="expb";
  e.innerHTML=`<button type="button" data-f="xlsx">⬇ Excel</button><button type="button" data-f="csv">⬇ CSV</button><button type="button" data-f="pdf">⬇ PDF</button><button type="button" data-f="print">🖨 Imprimir</button>`;
  e.onclick=ev=>{const f=ev.target.dataset.f;if(!f)return;const d=datos();if(!d.filas.length)return alert("No hay nada para exportar con estos filtros.");exportar(nombre,d.cols,d.filas,f,titulo,d.sub)}}
window.exportar=exportar;

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
  semHoy();
}
window.entrar=entrar;
if(K)entrar(true);

// ---------- Pedidos: filtros y exportación ----------
["pq","pd","ph"].forEach(i=>$(i).oninput=()=>{PMAX=100;renderP()});["pfe","psec"].forEach(i=>$(i).onchange=()=>{PMAX=100;renderP()});
$("plim").onclick=()=>{["pq","pd","ph","pfe","psec"].forEach(i=>$(i).value="");PSEL.clear();renderP()};
const ESTN=o=>(ET[o.etapaActual]||[,o.estado])[1].replace(/^\S+ /,"");
const filtrosTxt=()=>[$("pfe").value?"Estado: "+$("pfe").selectedOptions[0].text.replace(/^\S+ /,""):"",$("pd").value?"desde "+fecha($("pd").value+"T12:00"):"",$("ph").value?"hasta "+fecha($("ph").value+"T12:00"):"",$("psec").value?$("psec").selectedOptions[0].text.replace(/^\S+ /,""):"",$("pq").value?"buscando “"+$("pq").value+"”":""].filter(Boolean).join(" · ")||"Todos los pedidos";
barraExp("pExpB","pedidos","Pedidos",()=>{const P=PSEL.size?PV.filter(o=>PSEL.has(o.id)):PV;return{sub:(PSEL.size?PSEL.size+" pedidos marcados · ":"")+filtrosTxt(),
  cols:["Nº pedido","Fecha","Nº cliente","Cliente","Teléfono","Email","Dirección","Zona","Sección","Estado","Pago","Entrega","Productos","Envío","Total","Ganancia aprox.","Factura"],
  filas:P.map(o=>[o.nro||"",new Date(o.fecha).toLocaleString("es-AR"),o.nroCliente||"",o.nombre,o.telefono,o.email||"",o.direccion,o.zona||"",secN(o),ESTN(o),pagoTxt(o).replace(/^\S+ /,""),o.entrega||"",(o.items||[]).map(i=>i.cantidad+" x "+plain(i.nombre)).join(" | "),o.envio||0,o.total,Math.round((o.items||[]).reduce((a,i)=>a+(i.costo?(i.precio-i.costo)*i.cantidad:0),0)),o.factura?o.factura.tipo+" "+nroF(o.factura):""])}});

// ---------- Entregas: hoja de ruteo y repartidores ----------
let REP=[],ESEL=new Set();
const ordenDia=t=>{const m=String(t||"").match(/(\d{1,2})\/(\d{1,2})/);return m?(+m[2])*100+(+m[1]):9999};
const ACT=["nuevo","preparando","en camino"];
const entBase=()=>{const e=$("entE").value;return L.filter(o=>e==="act"?ACT.includes(o.etapaActual):o.etapaActual===e)};
TABS.ent=async()=>{
  if(YO.permisos.includes("*")||YO.permisos.includes("pedidos"))REP=await GJ("repartidores").catch(()=>[]);
  const P=entBase();
  const dias=[...new Set(P.map(o=>(o.entrega||"Sin día elegido").split(" · ")[0]))].sort((a,b)=>ordenDia(a)-ordenDia(b));
  const sel=$("entDia").value;$("entDia").innerHTML=`<option value="">Todos los días (${P.length})</option>`+dias.map(d=>`<option ${d===sel?"selected":""}>${esc(d)}</option>`).join("");
  renderEnt();
};
const zonaTxt=o=>o.zona==="CABA"?"CABA":o.zona==="GBA"?"Provincia":(o.zona||"");
const domicilio=o=>String(o.direccion||"").replace(/\s*\((CABA|GBA)\)\s*$/,"");
const localidad=o=>o.localidad||(domicilio(o).split(",").slice(1).join(",").trim())||(o.zona==="CABA"?"CABA":"");
const medioTxt=o=>o.estado==="efectivo al recibir"?"Efectivo al recibir":o.estado==="espera transferencia"?"Transferencia (pendiente)":o.pago?.medio==="transferencia"?"Transferencia":"Mercado Pago";
function renderEnt(){
  const d=$("entDia").value,de=$("entD").value,ha=$("entH").value,sec=$("entS").value;
  const dia=f=>new Date(new Date(f)-3*3600e3).toISOString().slice(0,10);
  const P=entBase().filter(o=>(!d||(o.entrega||"Sin día elegido").split(" · ")[0]===d)&&(!de||dia(o.fecha)>=de)&&(!ha||dia(o.fecha)<=ha)&&(!sec||(o.modo||"unidad")===sec))
    .sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega))||String(a.zona||"").localeCompare(String(b.zona||""))||localidad(a).localeCompare(localidad(b)));
  window.ENTV=P;
  $("entAll").checked=P.length>0&&P.every(o=>ESEL.has(o.id));
  $("entCnt").innerHTML=`<b>${P.length}</b> pedidos${ESEL.size?` · <b>${ESEL.size} marcados</b>`:""}`;
  const asig=YO.permisos.includes("*")||YO.permisos.includes("pedidos");
  $("entL").innerHTML=P.length?P.map((o,i)=>`<div class="o"><label class="chk"><input type="checkbox" data-esel="${o.id}" ${ESEL.has(o.id)?"checked":""}> <b>${i+1}.</b></label> ${etq(o)} <b>${o.nro?"#"+o.nro:""}</b> ${o.entrega?`🕒 <b>${esc(o.entrega)}</b> · `:""}<b>${esc(o.nombre)}</b> · <a href="https://wa.me/${String(o.telefono).replace(/\D/g,"").replace(/^(?!54)/,"549")}" target="_blank" rel="noopener">${esc(o.telefono)}</a><br>📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plain(o.direccion))}" target="_blank" rel="noopener">${esc(o.direccion)}</a> · ${esc(zonaTxt(o))}<br>
    ${(o.items||[]).length} productos · <b>${o.estado==="efectivo al recibir"?"COBRAR "+money(o.total)+" en efectivo":o.estado==="espera transferencia"?"Espera transferencia: "+money(o.total):"Pagado ("+money(o.total)+")"}</b>${secTag(o)}
    <details><summary>Ver productos</summary><ul>${o.items.map(i=>`<li>${i.cantidad} x ${esc(i.nombre)}</li>`).join("")}</ul></details>
    ${asig?`<label>Repartidor: <select onchange="asignar('${o.id}',this.value)"><option value="">Sin asignar</option>${REP.map(r=>`<option value="${esc(r.usuario)}" ${o.repartidor===r.usuario?"selected":""}>${esc(r.nombre)}</option>`).join("")}</select></label>`:""}
    ${o.etapaActual==="nuevo"?'<span class="muted">Falta comprar la mercadería.</span> ':""}${ACT.includes(o.etapaActual)&&o.etapaActual!=="en camino"?`<button onclick="setE('${o.id}','en camino')">👉 Marcar despachado</button>`:""} ${ACT.includes(o.etapaActual)?`<button class="p" onclick="setE('${o.id}','entregado')">👉 Marcar entregado</button>`:""}</div>`).join(""):'<p class="muted">No hay pedidos con estos filtros. 🎉</p>';
}
["entDia","entS","entE"].forEach(i=>$(i).onchange=()=>i==="entE"?TABS.ent():renderEnt());["entD","entH"].forEach(i=>$(i).oninput=renderEnt);
$("entL").addEventListener("change",e=>{const id=e.target.dataset?.esel;if(!id)return;e.target.checked?ESEL.add(id):ESEL.delete(id);renderEnt()});
$("entAll").onchange=()=>{(window.ENTV||[]).forEach(o=>$("entAll").checked?ESEL.add(o.id):ESEL.delete(o.id));renderEnt()};
window.asignar=async(id,rep)=>{await api("pedidos",{method:"POST",body:JSON.stringify({id,repartidor:rep})});const o=L.find(x=>x.id===id);if(o)o.repartidor=rep};
barraExp("entExpB","hoja-de-ruteo","Hoja de ruteo",()=>{const V=window.ENTV||[],P=ESEL.size?V.filter(o=>ESEL.has(o.id)):V;
  return{sub:(ESEL.size?"Pedidos marcados":"Todos los de la lista")+($("entDia").value?" · "+$("entDia").value:""),
  cols:["#","Nº pedido","Cliente","DNI / CUIT","Teléfono","Zona","Domicilio","Localidad","Medio de pago","Valor del pedido","A cobrar","Entrega","Repartidor","Productos"],
  filas:P.map((o,i)=>[i+1,o.nro||"",o.nombre,o.dniCliente||o.dni||"",o.telefono,zonaTxt(o),domicilio(o),localidad(o),medioTxt(o),o.total,o.estado==="efectivo al recibir"||o.estado==="espera transferencia"?o.total:0,o.entrega||"",(REP.find(r=>r.usuario===o.repartidor)||{}).nombre||o.repartidor||"",(o.items||[]).map(x=>x.cantidad+" x "+plain(x.nombre)).join(" | ")])}});

// ---------- Clientes y carritos que no terminaron la compra ----------
let CLI=[],CAR=[],CLIOPEN=null;
TABS.cli=async()=>{try{CLI=await GJ("clientes")}catch(e){$("cliL").textContent=e.message;return}renderCli();
  try{CAR=await GJ("carritos")}catch(e){CAR=[]}renderCar();loadCuentas()};
function renderCli(){
  const q=($("cliQ").value||"").toLowerCase().trim(),t=$("cliT").value;
  const C=CLI.filter(c=>(!t||(t==="m"&&c.mayorista)||(t==="s"&&!c.mayorista&&c.pedidos)||(t==="eg"&&c.envioGratis)||(t==="so"&&c.socio)||(t==="baja"&&!c.activo)||(t==="sin"&&!c.pedidos))&&(!q||[c.nro,c.nombre,c.telefono,c.email,c.direccion,c.dni,c.empresa].join(" ").toLowerCase().includes(q)));
  window.CLIV=C;
  const conC=CLI.filter(c=>c.pedidos),tot=conC.reduce((s,c)=>s+c.total,0);
  $("cliK").innerHTML=[["Clientes que compraron",conC.length],["Compraron más de una vez",conC.filter(c=>c.pedidos>1).length],["Facturado",money(tot)],["Promedio por cliente",conC.length?money(tot/conC.length):"—"]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  $("cliCnt").innerHTML=`<b>${C.length}</b> clientes`;
  const dueno=YO.rol==="dueño";
  $("cliL").innerHTML=C.length?`<table><tr><th>Nº</th><th>Cliente</th><th>Contacto</th><th class="n">Pedidos</th><th class="n">Total</th><th>Último</th><th></th></tr>${C.slice(0,300).map(c=>`<tr class="${CLIOPEN===c.clave?"abierto":""}"><td><b>${c.nro||""}</b></td><td><b>${esc(c.nombre)}</b>${c.mayorista?' <span class="tag">📦 Mayorista</span>':""}${c.envioGratis?' <span class="tag">🚚 Envío gratis</span>':""}${c.socio?' <span class="tag">⭐ Socio</span>':""}${c.activo?"":' <span class="tag">⛔ De baja</span>'}<br><span class="muted">${esc(c.direccion||"")}</span></td><td><a href="https://wa.me/${String(c.telefono).replace(/\D/g,"").replace(/^(?!54)/,"549")}" target="_blank" rel="noopener">${esc(c.telefono||"")}</a>${c.email?"<br>"+esc(c.email):""}</td><td class="n">${c.pedidos}</td><td class="n">${money(c.total)}</td><td>${fecha(c.ultimo)}</td><td><button type="button" onclick="fichaCli('${esc(c.clave)}')">${CLIOPEN===c.clave?"Cerrar":"Ficha"}</button></td></tr>${CLIOPEN===c.clave?`<tr class="detrow"><td></td><td colspan="6"><form class="det" onsubmit="guardarCli(event,'${esc(c.clave)}')">
      <label class="chk"><input type="checkbox" name="envioGratis" ${c.envioGratis?"checked":""} ${dueno?"":"disabled"}> 🚚 Envío gratis siempre</label>
      <label class="chk"><input type="checkbox" name="socio" ${c.socio?"checked":""} ${dueno?"":"disabled"}> ⭐ Socio (membresía)</label>
      <label class="chk"><input type="checkbox" name="activo" ${c.activo?"checked":""} ${dueno?"":"disabled"}> Cliente activo</label><br>
      <label>DNI / CUIT <input name="dni" value="${esc(c.dni)}" ${dueno?"":"disabled"} style="width:150px"></label> <label>Empresa <input name="empresa" value="${esc(c.empresa)}" ${dueno?"":"disabled"} style="width:200px"></label><br>
      <label>Notas <input name="notas" value="${esc(c.notas)}" ${dueno?"":"disabled"} style="width:100%"></label><br>
      ${dueno?`<button class="p">Guardar ficha</button>`:'<span class="muted">Solo el dueño puede cambiar la ficha.</span>'} <span class="muted">Primera compra: ${fecha(c.primero)} · Zona: ${esc(c.zona||"—")}</span> <span id="cliMsg" class="msg"></span></form></td></tr>`:""}`).join("")}</table>${C.length>300?`<p class="muted">Mostrando 300 de ${C.length}: usá el buscador.</p>`:""}`:'<p class="muted">No hay clientes con estos filtros.</p>';
}
window.fichaCli=k=>{CLIOPEN=CLIOPEN===k?null:k;renderCli()};
window.guardarCli=async(e,clave)=>{e.preventDefault();const f=e.target;
  if(!confirm("¿Guardar los cambios en la ficha de este cliente?"))return;
  try{CLI=await GJ("clientes",{clave,envioGratis:f.envioGratis.checked,socio:f.socio.checked,activo:f.activo.checked,dni:f.dni.value,empresa:f.empresa.value,notas:f.notas.value});renderCli();say("cliMsg",true,"Ficha guardada.")}catch(err){say("cliMsg",false,err.message)}};
$("cliQ").oninput=$("cliT").onchange=renderCli;
barraExp("cliExpB","clientes","Clientes",()=>({sub:$("cliT").value?$("cliT").selectedOptions[0].text:"Todos los clientes",
  cols:["Nº cliente","Nombre","DNI / CUIT","Empresa","Teléfono","Email","Dirección","Zona","Tipo","Envío gratis","Socio","Activo","Pedidos","Total comprado","Primera compra","Última compra","Notas"],
  filas:(window.CLIV||[]).map(c=>[c.nro||"",c.nombre,c.dni,c.empresa,c.telefono,c.email,c.direccion,c.zona,c.mayorista?"Mayorista":"Supermercado",c.envioGratis?"Sí":"No",c.socio?"Sí":"No",c.activo?"Sí":"No",c.pedidos,Math.round(c.total),fecha(c.primero),fecha(c.ultimo),c.notas])}));
let CTA=[];
async function loadCuentas(){try{CTA=await GJ("cuentas")}catch(e){CTA=[]}
  try{const d=await (await api("productos")).json();$("mayReg").checked=!!d.mayoristasRegistro}catch(e){}
  const pend=CTA.filter(c=>c.mayorista?.estado==="pendiente"),apr=CTA.filter(c=>c.mayorista?.estado==="aprobado");
  const fila=c=>`<tr><td><b>${esc(c.mayorista.razon)}</b><br><span class="muted">CUIT ${esc(c.mayorista.cuit)}${c.mayorista.rubro?" · "+esc(c.mayorista.rubro):""}</span></td><td>${esc(c.nombre||"")}<br><span class="muted">${esc(c.email)}${c.telefono?" · "+esc(c.telefono):""}</span></td><td>${fecha(c.mayorista.f)}</td><td>${c.mayorista.estado==="pendiente"?`<button class="p" type="button" onclick="ctaAcc('${esc(c.email)}','aprobar')">✅ Aprobar</button> <button type="button" onclick="ctaAcc('${esc(c.email)}','rechazar')">Rechazar</button>`:'<span class="tag">✅ Aprobado</span>'}</td></tr>`;
  $("ctaL").innerHTML=(pend.length?`<p><b>${pend.length} esperando aprobación</b></p><table>${pend.map(fila).join("")}</table>`:'<p class="muted">No hay pedidos de acceso pendientes.</p>')+(apr.length?`<details class="o"><summary>${apr.length} mayoristas aprobados · ${CTA.length} cuentas en total</summary><table>${apr.map(fila).join("")}</table></details>`:`<p class="muted">${CTA.length} cuentas de clientes en total.</p>`)}
window.ctaAcc=async(email,accion)=>{if(!confirm(accion==="aprobar"?`¿Aprobar a ${email} como mayorista? Le llega un mail y ya puede ver los precios por bulto.`:`¿Rechazar el pedido de ${email}?`))return;try{await GJ("cuentas",{email,accion});loadCuentas()}catch(e){alert(e.message)}};
$("mayReg").onchange=async()=>{const v=$("mayReg").checked;if(!confirm(v?"¿Esconder los precios mayoristas para quien no tenga cuenta aprobada?":"¿Mostrar los precios mayoristas a todos?")){$("mayReg").checked=!v;return}
  const r=await api("productos",{method:"POST",body:JSON.stringify({tienda:{mayoristasRegistro:v}})});say("mayRegMsg",r.ok,r.ok?"Guardado. La tienda lo aplica en 1 minuto.":"No se pudo guardar.")};
function renderCar(){
  const tot=CAR.reduce((s,c)=>s+(c.total||0),0);
  $("carCnt").innerHTML=`<b>${CAR.length}</b> carritos · ${money(tot)} sin vender`;
  $("carL").innerHTML=CAR.length?`<table><tr><th>Cuándo</th><th>Cliente</th><th>Qué llevaba</th><th class="n">Total</th><th></th></tr>${CAR.slice(0,200).map(c=>`<tr><td>${new Date(c.fecha).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}<br><span class="muted">${esc(c.motivo)}</span></td><td><b>${esc(c.nombre||"Sin nombre")}</b>${secTag(c)}<br>${esc(c.telefono||"")}${c.email?"<br>"+esc(c.email):""}</td><td><details><summary>${(c.items||[]).length} productos</summary>${(c.items||[]).map(i=>`${i.cantidad} x ${esc(plain(i.nombre))}`).join("<br>")}</details></td><td class="n">${money(c.total||0)}</td><td>${c.telefono?`<a href="https://wa.me/${String(c.telefono).replace(/\D/g,"").replace(/^(?!54)/,"549")}?text=${encodeURIComponent("Hola "+(c.nombre||"")+"! Vimos que te quedó una compra sin terminar en Proveeduría Virtual. ¿Te ayudamos a completarla?")}" target="_blank" rel="noopener">💬 Escribirle</a>`:""}</td></tr>`).join("")}</table>`:'<p class="muted">No hay carritos abandonados. 🎉</p>';
}
barraExp("carExpB","carritos-abandonados","Carritos que no terminaron la compra",()=>({sub:"",cols:["Fecha","Motivo","Nombre","Teléfono","Email","Sección","Productos","Total"],
  filas:CAR.map(c=>[new Date(c.fecha).toLocaleString("es-AR"),c.motivo,c.nombre,c.telefono,c.email,secN(c),(c.items||[]).map(i=>i.cantidad+" x "+plain(i.nombre)).join(" | "),c.total||0])}));

// ---------- Inventario: stock, ficha de producto, ingresos con vencimiento, deshacer ----------
let ST={},CO={},CAT=null,CHG={},AJ={},PROP=[],INVP=0,DESH=null;
async function catalogo(force){if(!CAT||force){CAT=await GJ("catalogo");CAT.by=new Map(CAT.p.map(p=>[p[1],p]));CAT.p.forEach(p=>p.k=plain(p[2]).toLowerCase());$("catsDL").innerHTML=CAT.cats.map(c=>`<option value="${esc(c)}">`).join("")}return CAT}
const costoU=sku=>{const c=CO[sku];return c?c[0]:+(PROP.find(x=>x.sku===sku)?.costo)||0};
const hoyISO=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
const diasA=f=>f?Math.round((new Date(f+"T12:00")-new Date(hoyISO()+"T12:00"))/864e5):null;
const venTxt=f=>{if(!f)return"";const d=diasA(f);return d<0?`<span class="neg">Vencido (${fecha(f+"T12:00")})</span>`:d<=30?`<span class="bajo">Vence ${fecha(f+"T12:00")}</span>`:fecha(f+"T12:00")};
const nomDe=sku=>plain(ST[sku]?.n||CAT?.by.get(sku)?.[2]||PROP.find(x=>x.sku===sku)?.nombre||sku);
TABS.inv=async()=>{
  try{const d=await GJ("stock");ST=d.stock;CO=d.costos}catch(e){$("invL").textContent=e.message;return}
  CHG={};INVP=0;renderInv();loadProp();
  if(!$("movD").value){$("movD").value=hoyISO().slice(0,8)+"01";$("movH").value=hoyISO()}loadMov();
  catalogo().then(renderInv).catch(()=>{});GJ("ajustes").then(a=>AJ=a).catch(()=>{});
};
function renderInv(){
  const q=plain($("invQ").value||"").toLowerCase().trim(),f=$("invF").value;
  const R=Object.entries(ST).map(([sku,x])=>({sku,n:nomDe(sku),c:x.c||0,m:x.m||0,ven:x.ven||"",ing:x.ing||""})).filter(r=>(!q||r.n.toLowerCase().includes(q)||r.sku.includes(q))&&(!f||(f==="neg"&&r.c<0)||(f==="bajo"&&r.m>0&&r.c<r.m)||(f==="con"&&r.c>0)||(f==="ven30"&&r.ven&&diasA(r.ven)>=0&&diasA(r.ven)<=30)||(f==="vencido"&&r.ven&&diasA(r.ven)<0&&r.c>0))).sort((a,b)=>a.n.localeCompare(b.n));
  window.INVV=R;
  const all=Object.values(ST),val=Object.entries(ST).reduce((s,[k,x])=>s+Math.max(0,x.c||0)*costoU(k),0);
  $("invK").innerHTML=[["Productos con stock",all.filter(x=>x.c>0).length],["Valor del stock (a costo)",money(val)],["Vendidos sin comprar",all.filter(x=>x.c<0).length],["Debajo del mínimo",all.filter(x=>x.m>0&&x.c<x.m).length],["Vencen en 30 días",all.filter(x=>x.c>0&&x.ven&&diasA(x.ven)<=30).length]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  const POR=100,pags=Math.max(1,Math.ceil(R.length/POR));INVP=Math.min(INVP,pags-1);const V=R.slice(INVP*POR,INVP*POR+POR);
  $("invL").innerHTML=R.length?`<table><tr><th>Producto</th><th class="n">Stock (unid.)</th><th class="n">Mínimo</th><th>Vence</th><th class="n">Valor</th></tr>${V.map(r=>`<tr><td><a class="prod" onclick="abrirFicha('${esc(r.sku)}')">${esc(r.n)}</a><br><span class="muted">${esc(r.sku)}</span></td><td class="n"><input type="number" data-s="${esc(r.sku)}" data-k="cantidad" value="${CHG[r.sku]?.cantidad??r.c}" class="${r.c<0?"neg":r.m>0&&r.c<r.m?"bajo":""}"></td><td class="n"><input type="number" min="0" data-s="${esc(r.sku)}" data-k="minimo" value="${CHG[r.sku]?.minimo??r.m}"></td><td>${venTxt(r.ven)}</td><td class="n">${r.c>0&&costoU(r.sku)?money(r.c*costoU(r.sku)):"—"}</td></tr>`).join("")}</table>`:'<p class="muted">No hay productos con estos filtros. El stock se llena solo con las ventas, o agregá mercadería abajo.</p>';
  $("invPag").innerHTML=pags>1?`<button type="button" ${INVP?"":"disabled"} onclick="INVP--;renderInv()">◀ Anterior</button> <span class="muted">Página ${INVP+1} de ${pags} · ${R.length} productos</span> <button type="button" ${INVP<pags-1?"":"disabled"} onclick="INVP++;renderInv()">Siguiente ▶</button>`:`<span class="muted">${R.length} productos</span>`;
}
$("invQ").oninput=$("invF").onchange=()=>{INVP=0;renderInv()};
$("invL").addEventListener("input",e=>{const i=e.target.closest("input[data-s]");if(!i)return;const k=i.dataset.s;CHG[k]=CHG[k]||{sku:k,nombre:nomDe(k)};CHG[k][i.dataset.k]=i.value;say("invMsg",true,Object.keys(CHG).length+" cambios sin guardar")});
// Guardar con confirmación; lo anterior queda para "Deshacer"
async function guardarStock(filas,resumen,tipo){
  if(!confirm(resumen+"\n\n¿Guardar?"))return false;
  const prev=filas.map(f=>{const x=ST[f.sku]||{};return{sku:f.sku,nombre:f.nombre,cantidad:x.c||0,minimo:x.m||0,ingreso:x.ing||"",vence:x.ven||""}});
  const d=await GJ("stock",{filas,tipo});ST=d.stock;DESH={filas:prev,txt:resumen};$("invDeshacer").hidden=false;renderInv();return true}
$("invGuardar").onclick=async()=>{const filas=Object.values(CHG);if(!filas.length)return say("invMsg",true,"No hay cambios para guardar.");
  const res=filas.map(f=>{const x=ST[f.sku]||{};return "• "+f.nombre+": "+[f.cantidad!==undefined&&+f.cantidad!==(x.c||0)?`stock ${x.c||0} → ${f.cantidad}`:"",f.minimo!==undefined&&+f.minimo!==(x.m||0)?`mínimo ${x.m||0} → ${f.minimo}`:""].filter(Boolean).join(", ")}).filter(t=>!/: $/.test(t));
  if(!res.length){CHG={};renderInv();return say("invMsg",true,"No hay cambios para guardar.")}
  try{if(await guardarStock(filas,`Vas a cambiar ${res.length} producto${res.length>1?"s":""}:\n`+res.slice(0,15).join("\n")+(res.length>15?`\n… y ${res.length-15} más`:""))){CHG={};renderInv();say("invMsg",true,"Guardado. Si te equivocaste, tocá ↩ Deshacer.")}}catch(e){say("invMsg",false,e.message)}};
$("invDeshacer").onclick=async()=>{if(!DESH)return;if(!confirm("¿Volver atrás el último cambio?\n\n"+DESH.txt))return;
  try{const d=await GJ("stock",{filas:DESH.filas.map(f=>({...f,ref:"deshacer"}))});ST=d.stock;DESH=null;$("invDeshacer").hidden=true;renderInv();say("invMsg",true,"Listo, quedó como estaba.");if(!$("ficha").hidden&&FSKU)abrirFicha(FSKU)}catch(e){say("invMsg",false,e.message)}};
barraExp("invExpB","stock","Stock del depósito",()=>({sub:$("invF").value?$("invF").selectedOptions[0].text:"Todos los productos",cols:["Código","Producto","Stock (unidades)","Mínimo","Ingreso","Vencimiento","Costo unitario","Valor"],
  filas:(window.INVV||[]).map(r=>[r.sku,r.n,r.c,r.m,r.ing?fecha(r.ing+"T12:00"):"",r.ven?fecha(r.ven+"T12:00"):"",costoU(r.sku)||"",r.c>0?Math.round(r.c*costoU(r.sku)):0])}));
// Buscar un producto para abrir su ficha
$("addQ").oninput=async()=>{const q=plain($("addQ").value.trim()).toLowerCase();if(q.length<3){$("addL").innerHTML="";return}const C=await catalogo();const w=q.split(/\s+/);
  const R=C.p.filter(p=>w.every(x=>p.k.includes(x)||p[1].includes(x))).slice(0,15);
  $("addL").innerHTML=R.map(p=>`<div style="margin:6px 0"><a class="prod" onclick="abrirFicha('${esc(p[1])}')">${esc(plain(p[2]))}</a> <span class="muted">· stock ${ST[p[1]]?.c??0}${p[6]?" · propio":""}</span> <button type="button" onclick="abrirFicha('${esc(p[1])}')">Abrir ficha</button></div>`).join("")||'<p class="muted">Sin resultados. Si es nuevo, cargalo abajo.</p>'};
// ---- Ficha de un producto ----
let FSKU=null;
window.abrirFicha=async sku=>{FSKU=sku;const C=await catalogo().catch(()=>null);if(!PROP.length)await loadProp();
  const p=C?.by.get(sku),pr=PROP.find(x=>x.sku===sku),x=ST[sku]||{c:0,m:0},a=AJ[sku]||{},bu=p?.[5]||pr?.bu||1;
  const nombre=nomDe(sku),cat=p?C.cats[p[0]]:pr?.cat||"";
  const F=$("ficha");F.hidden=false;
  F.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h2>${esc(nombre)}</h2><span class="muted">Código ${esc(sku)}${cat?" · "+esc(cat):""} · ${pr?"Producto propio":"Del proveedor (el precio se actualiza solo)"}</span></div><button type="button" onclick="$('ficha').hidden=true">✕ Cerrar</button></div>
  <form id="fiF">
  <fieldset><legend>📦 Stock</legend>
    <p style="margin:2px 0">${(x.c||0)<0?`No hay en el depósito: faltan comprar <b>${-x.c}</b> unidades que ya se vendieron`:`Hay <b>${x.c||0}</b> unidades`}${x.ing?` · último ingreso ${fecha(x.ing+"T12:00")}`:""}${x.ven?` · ${venTxt(x.ven).replace(/>([0-9])/,">Vence $1").replace(/^([0-9])/,"Vence $1")}`:""}</p>
    <label>Sumar unidades que entraron <input name="sumar" type="number" min="0" style="width:90px"></label>
    <label>Fecha de ingreso <input name="ingreso" type="date" value="${hoyISO()}"></label>
    <label>Vencimiento <input name="vence" type="date" value="${x.ven||""}"></label><br>
    <label>…o corregir el stock a <input name="corregir" type="number" style="width:90px" placeholder="${x.c||0}"></label>
    <label>Mínimo <input name="minimo" type="number" min="0" value="${x.m||0}" style="width:80px"></label>
  </fieldset>
  <fieldset><legend>💲 Precio y tienda</legend>
  ${pr?`<label>Nombre <input name="nombre" value="${esc(pr.nombre)}" style="width:280px"></label> <label>Categoría <input name="cat" value="${esc(pr.cat)}" list="catsDL" style="width:140px"></label><br>
    <label>Precio unidad $<input name="pu" type="number" min="0" value="${pr.pu||""}" style="width:100px"></label> <label>Precio bulto (c/u) $<input name="pb" type="number" min="0" value="${pr.pb||""}" style="width:100px"></label> <label>Unid. por bulto <input name="bu" type="number" min="1" value="${pr.bu||1}" style="width:70px"></label> <label>Costo $<input name="costo" type="number" min="0" value="${pr.costo||""}" style="width:90px"></label><br>
    <label>Foto <input name="foto" value="${esc(pr.foto||"")}" placeholder="https://…" style="width:300px"></label> <label class="chk"><input name="mostrar" type="checkbox" ${pr.activo!==false?"checked":""}> Mostrar en la tienda</label> <label class="chk"><input name="intl" type="checkbox" ${pr.intl?"checked":""}> 🌎 Sección Internacional</label>`
  :`<p style="margin:2px 0">Precio del proveedor con tu ganancia: <b>${p?money(p[3]):"—"}</b> por unidad${p?.[4]>0?` · <b>${money(p[4]/bu)}</b> c/u en bulto x${bu}`:""}. Costo: ${costoU(sku)?money(costoU(sku)):"—"}</p>
    <label>Precio a mano por unidad $<input name="pu" type="number" min="0" value="${a.pu||""}" placeholder="automático" style="width:110px"></label> ${bu>1?`<label>Precio a mano c/u en bulto $<input name="pb" type="number" min="0" value="${a.pb||""}" placeholder="automático" style="width:110px"></label>`:""}
    <label class="chk"><input name="mostrar" type="checkbox" ${a.oculto?"":"checked"}> Mostrar en la tienda</label><br><span class="muted">Dejá el precio vacío para que siga el del proveedor.</span>`}
  </fieldset>
  <button class="p">💾 Guardar ficha</button> <span id="fiMsg" class="msg"></span></form>
  <h3 style="margin:12px 0 4px">Últimos movimientos</h3><div id="fiMov" class="muted">Cargando…</div>`;
  F.scrollIntoView({behavior:"smooth",block:"start"});
  $("fiF").onsubmit=e=>guardarFicha(e,sku,pr,a,x);
  const d90=new Date(Date.now()-90*864e5).toISOString().slice(0,10);
  G("movimientos",{qs:`&desde=${d90}&hasta=${hoyISO()}`}).then(r=>r.json()).then(M=>{M=M.filter(m=>m.sku===sku).slice(-10).reverse();$("fiMov").innerHTML=M.length?`<table>${M.map(m=>`<tr><td>${new Date(m.f).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</td><td>${TIPOM[m.t]||m.t}</td><td class="n ${m.d<0?"neg":""}">${m.d>0?"+":""}${m.d}</td><td>${esc(m.q||"")}</td></tr>`).join("")}</table>`:"Sin movimientos en los últimos 90 días."}).catch(()=>{$("fiMov").textContent=""});
};
async function guardarFicha(e,sku,pr,a,x){e.preventDefault();const f=e.target,v=n=>f[n]?f[n].value.trim():"";
  const cambios=[],fila={sku,nombre:nomDe(sku)};let tipo="ajuste";
  if(+v("sumar")>0){fila.cantidad=(x.c||0)+ +v("sumar");tipo="ingreso";cambios.push(`Entran ${v("sumar")} unidades (stock ${x.c||0} → ${fila.cantidad})`+(v("vence")?`, vencen el ${fecha(v("vence")+"T12:00")}`:""));fila.ingreso=v("ingreso")||hoyISO();if(v("vence"))fila.vence=v("vence")}
  else if(v("corregir")!==""&&+v("corregir")!==(x.c||0)){fila.cantidad=+v("corregir");cambios.push(`Corregir stock ${x.c||0} → ${fila.cantidad}`)}
  if(!(+v("sumar")>0)&&v("vence")!==(x.ven||"")){fila.vence=v("vence");cambios.push(v("vence")?`Vencimiento: ${fecha(v("vence")+"T12:00")}`:"Sacar el vencimiento")}
  if(+v("minimo")!==(x.m||0)){fila.minimo=+v("minimo");cambios.push(`Mínimo ${x.m||0} → ${fila.minimo}`)}
  const mostrar=f.mostrar.checked;let prod=null;
  if(pr){const n={...pr,nombre:v("nombre")||pr.nombre,cat:v("cat")||pr.cat,pu:+v("pu")||0,pb:+v("pb")||0,bu:+v("bu")||1,costo:+v("costo")||0,foto:v("foto"),activo:mostrar,intl:f.intl.checked};
    const dif=["nombre","cat","pu","pb","bu","costo","foto","activo","intl"].filter(k=>String(n[k]??"")!==String(pr[k]??""));if(dif.length){prod=n;cambios.push("Datos del producto: "+dif.map(k=>({nombre:"nombre",cat:"categoría",pu:"precio unidad",pb:"precio bulto",bu:"unidades por bulto",costo:"costo",foto:"foto",activo:mostrar?"se muestra en la tienda":"se esconde de la tienda",intl:n.intl?"pasa a Internacional":"sale de Internacional"})[k]).join(", "))}}
  else{const n={sku,oculto:!mostrar,pu:+v("pu")||0,pb:+v("pb")||0};if(n.oculto!==!!a.oculto||n.pu!==(a.pu||0)||n.pb!==(a.pb||0)){prod=n;cambios.push([n.oculto!==!!a.oculto?(n.oculto?"Esconder de la tienda":"Mostrar en la tienda"):"",n.pu!==(a.pu||0)?(n.pu?`Precio por unidad a mano: ${money(n.pu)}`:"Precio por unidad: vuelve al automático"):"",n.pb!==(a.pb||0)?(n.pb?`Precio en bulto a mano: ${money(n.pb)} c/u`:"Precio en bulto: vuelve al automático"):""].filter(Boolean).join(" · "))}}
  if(!cambios.length)return say("fiMsg",true,"No cambiaste nada.");
  if(!confirm(nomDe(sku)+"\n\n• "+cambios.join("\n• ")+"\n\n¿Guardar?"))return;
  try{
    const prevStock={sku,nombre:nomDe(sku),cantidad:x.c||0,minimo:x.m||0,ingreso:x.ing||"",vence:x.ven||""};
    if(Object.keys(fila).length>2){const d=await GJ("stock",{filas:[fila],tipo});ST=d.stock}
    if(prod&&pr){await GJ("propios",{...prod,stock:undefined});await loadProp()}
    if(prod&&!pr)AJ=await GJ("ajustes",prod);
    DESH={filas:Object.keys(fila).length>2?[prevStock]:[],prod:prod?(pr?{tipo:"propio",v:pr}:{tipo:"ajuste",v:{sku,oculto:!!a.oculto,pu:a.pu||0,pb:a.pb||0}}):null,txt:nomDe(sku)+": "+cambios.join(" · ")};
    $("invDeshacer").hidden=false;renderInv();await abrirFicha(sku);say("fiMsg",true,"Guardado. Si te equivocaste, tocá ↩ Deshacer.");
  }catch(err){say("fiMsg",false,err.message)}}
// Deshacer también vuelve atrás precio / tienda de la ficha
const _desh=$("invDeshacer").onclick;$("invDeshacer").onclick=async()=>{if(DESH&&DESH.prod){if(!confirm("¿Volver atrás el último cambio?\n\n"+DESH.txt))return;
  try{if(DESH.prod.tipo==="propio"){await GJ("propios",{...DESH.prod.v,stock:undefined});await loadProp()}else AJ=await GJ("ajustes",DESH.prod.v);
    if(DESH.filas.length){const d=await GJ("stock",{filas:DESH.filas.map(f=>({...f,ref:"deshacer"}))});ST=d.stock}
    DESH=null;$("invDeshacer").hidden=true;renderInv();say("invMsg",true,"Listo, quedó como estaba.");if(!$("ficha").hidden&&FSKU)abrirFicha(FSKU)}catch(e){say("invMsg",false,e.message)}return}
  return _desh()};
// Importar desde Excel/CSV
let IMP=null;
const normCol=s=>plain(String(s||"")).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim().replace(/\s+/g,"_");
const ALIAS={codigo:"sku",sku:"sku",cod:"sku",ean:"sku",nombre:"nombre",producto:"nombre",descripcion:"nombre",cantidad:"cantidad",stock:"cantidad",minimo:"minimo",stock_minimo:"minimo",precio:"pu",precio_unidad:"pu",precio_supermercado:"pu",precio_bulto:"pb",unidades_bulto:"bu",unidades_por_bulto:"bu",categoria:"cat",rubro:"cat",costo:"costo",foto:"foto",imagen:"foto",ingreso:"ingreso",fecha_ingreso:"ingreso",internacional:"intl",importado:"intl",vencimiento:"vence",vence:"vence",fecha_vencimiento:"vence"};
const fechaISO=v=>{v=String(v||"").trim();let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(m){const y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}return ""};
async function leerArchivo(f){
  if(/\.csv$/i.test(f.name)){const t=await f.text();const sep=(t.split("\n")[0].match(/;/g)||[]).length>=(t.split("\n")[0].match(/,/g)||[]).length?";":",";
    return t.replace(/^﻿/,"").split(/\r?\n/).filter(Boolean).map(l=>{const o=[];let cur="",q=false;for(const ch of l){if(ch==='"'){q=!q;continue}if(ch===sep&&!q){o.push(cur);cur="";continue}cur+=ch}o.push(cur);return o})}
  if(!window.XLSX)throw new Error("No se pudo cargar el lector de Excel. Guardá el archivo como CSV y probá de nuevo.");
  const wb=XLSX.read(await f.arrayBuffer());return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""});
}
$("impFile").onchange=async()=>{const f=$("impFile").files[0];IMP=null;$("impOk").disabled=true;if(!f)return;
  try{const rows=await leerArchivo(f);const head=rows[0].map(h=>ALIAS[normCol(h)]||null);
    const filas=rows.slice(1).map(r=>{const o={};head.forEach((h,i)=>{if(h&&r[i]!==undefined&&String(r[i]).trim()!=="")o[h]=String(r[i]).trim()});["cantidad","minimo","pu","pb","bu","costo"].forEach(k=>{if(o[k]!==undefined)o[k]=String(o[k]).replace(/\$|\s/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",",".")});["ingreso","vence"].forEach(k=>{if(o[k]!==undefined)o[k]=fechaISO(o[k])});if(o.intl!==undefined)o.intl=/^(s|si|sí|1|x|true)$/i.test(o.intl);return o}).filter(o=>Object.keys(o).length);
    const tipo=$("impTipo").value;
    const valid=tipo==="stock"?filas.filter(o=>o.sku&&(o.cantidad!==undefined||o.minimo!==undefined)):filas.filter(o=>o.nombre&&(o.pu||o.pb));
    if(!valid.length)throw new Error(tipo==="stock"?"No encontré columnas codigo + cantidad (o minimo).":"No encontré columnas nombre + precio.");
    IMP={tipo,filas:valid};$("impOk").disabled=false;say("impMsg",true,`Listo para importar ${valid.length} filas${filas.length>valid.length?` (${filas.length-valid.length} sin datos suficientes se saltean)`:""}. Tocá Importar.`)}
  catch(e){say("impMsg",false,e.message)}};
$("impOk").onclick=async()=>{if(!IMP)return;if(!confirm(`¿Importar ${IMP.filas.length} filas? Las cantidades del archivo reemplazan a las que hay ahora.`))return;$("impOk").disabled=true;say("impMsg",true,"Importando…");
  try{if(IMP.tipo==="stock"){const prev=IMP.filas.map(o=>{const x=ST[o.sku]||{};return{sku:o.sku,nombre:o.nombre||x.n,cantidad:x.c||0,minimo:x.m||0,ingreso:x.ing||"",vence:x.ven||""}});
      const d=await GJ("stock",{tipo:"importacion",filas:IMP.filas.map(o=>({sku:o.sku,nombre:o.nombre,cantidad:o.cantidad,minimo:o.minimo,ingreso:o.ingreso,vence:o.vence}))});ST=d.stock;DESH={filas:prev,txt:`Importación de ${prev.length} filas`};$("invDeshacer").hidden=false;renderInv()}
    else{await GJ("propios",{accion:"importar",filas:IMP.filas.map(o=>({...o,stock:o.cantidad}))});await loadProp();const d=await GJ("stock");ST=d.stock;CAT=null;renderInv()}
    say("impMsg",true,`Importadas ${IMP.filas.length} filas.`);IMP=null;$("impFile").value=""}catch(e){say("impMsg",false,e.message);$("impOk").disabled=false}};
$("impModelo").onclick=e=>{e.preventDefault();exportar("modelo-importacion",["codigo","nombre","categoria","precio","precio_bulto","unidades_bulto","costo","cantidad","minimo","ingreso","vencimiento","internacional","foto"],[["","Chocolate importado 100 g","importados",3500,"",1,2200,24,6,hoyISO(),"2027-03-31","si","https://…"],["304","ACEITE MEZCLA 900 CC","","","","","",24,12,"","","",""]],"xlsx","Modelo de importación")};
// Productos propios
async function loadProp(){try{PROP=await GJ("propios");$("propL").innerHTML=PROP.length?`<table><tr><th>Producto</th><th>Categoría</th><th class="n">Precio</th><th class="n">Bulto</th><th class="n">Stock</th><th>En la tienda</th></tr>${PROP.map(x=>`<tr><td><a class="prod" onclick="abrirFicha('${esc(x.sku)}')">${esc(x.nombre)}</a><br><span class="muted">${esc(x.sku)}</span></td><td>${esc(x.cat)}</td><td class="n">${x.pu?money(x.pu):"—"}</td><td class="n">${x.bu>1&&x.pb?money(x.pb)+" x"+x.bu:"—"}</td><td class="n">${ST[x.sku]?.c??"—"}</td><td>${x.activo!==false?"Sí":"No"} <button type="button" onclick="borrarProp('${esc(x.sku)}')">Borrar</button></td></tr>`).join("")}</table>`:'<p class="muted">No cargaste productos propios.</p>'}catch(e){}}
window.borrarProp=async sku=>{if(!confirm("¿Borrar este producto de la tienda? Esto no se puede deshacer."))return;await GJ("propios",{accion:"borrar",sku});CAT=null;loadProp()};
$("propF").onsubmit=async e=>{e.preventDefault();const n=$("prN").value.trim();
  if(!confirm(`¿Agregar "${n}"${$("prA").checked?" a la tienda":" (sin mostrarlo en la tienda)"}${$("prS").value?" con "+$("prS").value+" unidades":""}?`))return;
  try{const l=await GJ("propios",{nombre:n,cat:$("prC").value,pu:$("prU").value,pb:$("prB").value,bu:$("prBu").value,costo:$("prCo").value,foto:$("prF").value,stock:$("prS").value,activo:$("prA").checked,intl:$("prX").checked});
    const nuevo=l.find(x=>x.nombre===n);if(nuevo&&($("prI").value||$("prV").value))await GJ("stock",{filas:[{sku:nuevo.sku,nombre:n,ingreso:$("prI").value||hoyISO(),vence:$("prV").value}]});
    say("prMsg",true,$("prA").checked?"Agregado. Ya está en la tienda.":"Agregado al stock (no se muestra en la tienda).");$("propF").reset();$("prA").checked=true;CAT=null;await loadProp();const d=await GJ("stock");ST=d.stock;renderInv()}catch(err){say("prMsg",false,err.message)}};
// Movimientos
let MOV=[],MOVV=[];const TIPOM={venta:"Venta",compra:"Compra",ingreso:"Ingreso",ajuste:"Corrección",devolucion:"Devolución",importacion:"Importación"};
async function loadMov(){try{MOV=await (await G("movimientos",{qs:`&desde=${$("movD").value}&hasta=${$("movH").value}`})).json();if(!Array.isArray(MOV))MOV=[]}catch(e){MOV=[]}renderMov()}
function renderMov(){const t=$("movT").value,q=plain($("movQ").value||"").toLowerCase().trim();
  MOVV=MOV.filter(m=>(!t||m.t===t)&&(!q||plain(m.n||"").toLowerCase().includes(q)||String(m.sku).includes(q))).reverse();
  $("movCnt").innerHTML=`<b>${MOVV.length}</b> movimientos`;
  $("movL").innerHTML=MOVV.length?`<table><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="n">Cantidad</th><th>Quién</th></tr>${MOVV.slice(0,300).map(m=>`<tr><td>${new Date(m.f).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</td><td><a class="prod" onclick="abrirFicha('${esc(m.sku)}')">${esc(plain(m.n||m.sku))}</a>${m.ven?`<br><span class="muted">vence ${fecha(m.ven+"T12:00")}</span>`:""}</td><td>${TIPOM[m.t]||m.t}${m.ref==="deshacer"?" (deshecho)":""}</td><td class="n ${m.d<0?"neg":""}">${m.d>0?"+":""}${m.d}</td><td>${esc(m.q||"")}</td></tr>`).join("")}</table>${MOVV.length>300?`<p class="muted">Mostrando 300 de ${MOVV.length}: exportá para ver todos.</p>`:""}`:'<p class="muted">Sin movimientos con estos filtros.</p>'}
["movD","movH"].forEach(i=>$(i).onchange=loadMov);$("movT").onchange=renderMov;$("movQ").oninput=renderMov;
barraExp("movExpB","movimientos","Movimientos de stock",()=>({sub:`Del ${fecha($("movD").value+"T12:00")} al ${fecha($("movH").value+"T12:00")}`+($("movT").value?" · "+$("movT").selectedOptions[0].text:""),cols:["Fecha","Código","Producto","Tipo","Cantidad","Vencimiento","Referencia","Quién"],
  filas:MOVV.map(m=>[new Date(m.f).toLocaleString("es-AR"),m.sku,plain(m.n||""),TIPOM[m.t]||m.t,m.d,m.ven?fecha(m.ven+"T12:00"):"",m.ref||"",m.q||""])}));

// ---------- Compras y proveedores ----------
let SUG=[],COMP=[],PROV=[];
TABS.cpr=async()=>{try{const d=await GJ("compras");SUG=d.sugeridas;COMP=d.compras}catch(e){$("cprL").textContent=e.message;return}
  renderSug();renderComp();loadProv()};
function renderSug(){
  const tot=SUG.reduce((s,x)=>s+x.costo,0);
  $("cprL").innerHTML=SUG.length?`<p><b>${SUG.length}</b> productos · costo aprox. <b>${money(tot)}</b></p><table><tr><th>Producto</th><th class="n">Hacen falta</th><th class="n">Comprar</th><th class="n">Unidades</th><th class="n">Costo aprox.</th></tr>${SUG.map((x,i)=>`<tr><td>${esc(plain(x.nombre))}${x.stock>0?`<br><span class="muted">En el depósito hay ${x.stock}</span>`:""}</td><td class="n"><b>${x.falta}</b></td><td class="n"><b>${cantTxt(x)}</b></td><td class="n"><input type="number" min="0" data-i="${i}" value="${x.unidades}"></td><td class="n">${x.costo?money(x.costo):"—"}</td></tr>`).join("")}</table>`:'<p class="muted">No hay nada para comprar. 🎉</p>';
}
$("cprL").addEventListener("input",e=>{const i=e.target.dataset.i;if(i!==undefined)SUG[+i].unidades=+e.target.value||0});
const cantTxt=x=>x.unidades===(x.bultos*x.bu+(x.sueltas||0))?[x.bultos?`${x.bultos} bulto${x.bultos>1?"s":""} x${x.bu}`:"",x.sueltas?`${x.sueltas} suelta${x.sueltas>1?"s":""}`:""].filter(Boolean).join(" + "):`${x.unidades} u.`;
const sugTxt=()=>"Lista de compras:\n"+SUG.filter(x=>x.unidades>0).map(x=>"• "+cantTxt(x)+" — "+plain(x.nombre)).join("\n");
$("cprCopy").onclick=async()=>{try{await navigator.clipboard.writeText(sugTxt());say("cprMsg",true,"Copiada.")}catch(e){say("cprMsg",false,"No se pudo copiar.")}};
$("cprExp").onclick=()=>exportar("para-comprar",["Código","Producto","Stock","Falta","Bultos","Unidades por bulto","Unidades a comprar","Costo unitario","Costo aprox."],SUG.map(x=>[x.sku,x.nombre,x.stock,x.falta,x.bultos||"",x.bu,x.unidades,x.costoU,x.costo]));
async function yaCompre(msgId,prov,pedidos){const items=SUG.filter(x=>x.unidades>0).map(x=>({sku:x.sku,nombre:plain(x.nombre),unidades:x.unidades,costo:x.costoU}));
  if(!items.length)return say(msgId,false,"No hay nada para comprar.");
  if(!confirm(`¿Ya compraste los ${items.length} productos de la lista?\n\nEl stock se suma solo y ${pedidos?pedidos.length+" pedido"+(pedidos.length===1?"":"s")+" pasan":"los pedidos pasan"} a "Para entregar".`))return false;
  try{const d=await GJ("compras",{proveedor:prov,items,pedidos});say(msgId,true,`¡Listo! Compra anotada (${money(d.compra.total)}).${d.preparando?` ${d.preparando} pedido${d.preparando>1?"s pasaron":" pasó"} a "Para entregar".`:""}`);await load();return true}catch(e){say(msgId,false,e.message);return false}}
$("cprReg").onclick=async()=>{if(await yaCompre("cprMsg",$("cprProv").value))TABS.cpr()};
const provN=n=>/maxi/i.test(n||"")?"Proveedor principal":n||"";
function renderComp(){const m=new Date().toISOString().slice(0,7),M=COMP.filter(c=>c.fecha.slice(0,7)===m);
  $("cprK").innerHTML=[["Gastado este mes",money(M.reduce((t,c)=>t+c.total,0))],["Compras este mes",M.length],["Última compra",COMP[0]?fecha(COMP[0].fecha):"—"]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  $("cprH").innerHTML=COMP.length?`<table><tr><th>Día</th><th>Qué se compró</th><th class="n">Gastado</th><th>Quién</th></tr>${COMP.map(c=>`<tr><td>${new Date(c.fecha).toLocaleDateString("es-AR")}<br><span class="muted">${esc(provN(c.proveedor))}</span></td><td><details><summary>${c.items.length} productos</summary>${c.items.map(i=>`${i.unidades} x ${esc(plain(i.nombre))}`).join("<br>")}</details></td><td class="n"><b>${money(c.total)}</b></td><td>${esc(c.quien||"")}</td></tr>`).join("")}</table>`:'<p class="muted">Todavía no hay compras. Aparecen solas cuando alguien toca "✅ Ya compré todo" en 🏠 Hoy.</p>'}
$("cprHExp").onclick=()=>exportar("compras",["Fecha","Proveedor","Código","Producto","Unidades","Costo unitario","Subtotal","Quién"],COMP.flatMap(c=>c.items.map(i=>[new Date(c.fecha).toLocaleString("es-AR"),provN(c.proveedor),i.sku,i.nombre,i.unidades,i.costo,Math.round(i.unidades*i.costo),c.quien||""])));
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

// ---------- Precios de Supermercado desde el proveedor por unidad ----------
const BM2="javascript:(async()=>{const H='comerciante.carrefour.com.ar';if(location.host!==H){alert('Primero abr\u00ed '+H+' y despu\u00e9s toc\u00e1 este marcador');return}let C=[...new Set([...document.querySelectorAll('a[href*=\"/sec/\"]')].map(a=>decodeURIComponent(a.pathname.split('/sec/')[1]||'').split('/')[0]))].filter(Boolean);if(!C.length)C=['bebidas','almac\u00e9n','desayuno y merienda','limpieza','perfumer\u00eda','l\u00e1cteos y productos frescos','mundo beb\u00e9','mascotas','panader\u00eda','bazar y textil'];const S=new Set(),L=[];for(let i=0;i<C.length;i++){document.title='Bajando precios '+(i+1)+'/'+C.length;const r=await fetch('/products?currentUrl=sec/'+encodeURIComponent(C[i])+'&filters=&orderBy=default&currentPage=1&itemsPerPage=5000&method=productsList');const d=new DOMParser().parseFromString(await r.text(),'text/html');for(const k of d.querySelectorAll('.item_card')){const n=(k.querySelector('.item_card__description')?.textContent||'').replace(/\\s+/g,' ').trim().replace(/\\|/g,'/');const t=k.textContent.replace(/\\s+/g,' ');const e=(t.match(/ID:\\s*(\\d+)/)||[])[1];const m=(t.match(/Llevando\\s+(\\d+)/i)||[])[1]||'';const p=t.match(/\\$\\s*([\\d,]+(?:\\.\\d+)?)/);if(!e||!p||S.has(e))continue;S.add(e);L.push([i,e,m,parseFloat(p[1].replace(/,/g,'')),n].join('|'))}}const x='\\x23cats|'+C.join('|')+'\\n\\x23formato: cat|ean|minimo|precio_maxi|nombre\\n'+L.join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([x],{type:'text/plain'}));a.download='maxi_productos.txt';document.body.appendChild(a);a.click();a.remove();document.title='Listo: '+L.length+' productos';alert('Listo: '+L.length+' productos. Ahora sub\u00ed maxi_productos.txt en el panel de tu tienda.')})();";
$("bm2").textContent=BM2;$("copyBm2").onclick=async()=>{try{await navigator.clipboard.writeText(BM2);$("copyBm2").textContent="¡Copiado!"}catch(e){}};
async function loadSM(){try{const d=await (await api("productos")).json();const s=d.supermercado||{};
  $("smEst").innerHTML=s.fuente==="maxi"?`🛒 Supermercado usa los precios del <b>proveedor por unidad</b>: ${s.productos} productos, actualizados el <b>${esc(s.fecha||"—")}</b>.`:`🛒 Supermercado usa los precios del <b>proveedor principal</b> (precio por unidad suelta).`}catch(e){}}
$("smOk").onclick=async()=>{const f=$("smFile").files[0];if(!f)return say("smMsg",false,"Elegí el archivo .txt primero.");
  if(!confirm("¿Actualizar los precios de Supermercado con este archivo?"))return;say("smMsg",true,"Actualizando…");
  const r=await api("productos",{method:"POST",body:JSON.stringify({archivo:await f.text(),margen:+$("pmar").value})});const d=await r.json().catch(()=>({}));
  say("smMsg",r.ok,r.ok?`¡Listo! ${d.productos} productos de Supermercado al ${d.fecha}.`:(d.error||"No se pudo actualizar."));if(r.ok)loadSM()};
$("smVolver").onchange=async()=>{if(!$("smVolver").checked)return;if(!confirm("¿Volver a usar el proveedor principal para Supermercado?")){$("smVolver").checked=false;return}
  const r=await api("productos",{method:"POST",body:JSON.stringify({tienda:{supermercado:"principal"}})});$("smVolver").checked=false;say("smMsg",r.ok,r.ok?"Listo.":"No se pudo.");loadSM()};

// ---------- Medios de pago (en la pestaña de precios) ----------
const _loadP=loadP;
loadP=async function(){await _loadP();loadSM();try{const d=await (await api("productos")).json();const p=d.pagos||{};$("pgMp").checked=p.mp!==false;$("pgEf").checked=p.efectivo!==false;$("pgTr").checked=!!p.transferencia;$("pgAl").value=p.alias||""}catch(e){}};
$("pgF").onsubmit=async e=>{e.preventDefault();const r=await api("productos",{method:"POST",body:JSON.stringify({pagos:{mp:$("pgMp").checked,efectivo:$("pgEf").checked,transferencia:$("pgTr").checked,alias:$("pgAl").value}})});const d=await r.json().catch(()=>({}));say("pgMsg",r.ok,r.ok?"Guardado. La tienda lo usa en 1 minuto.":(d.error||"No se pudo guardar."))};

// ---------- Estadísticas: ganancia y compras ----------
const _stats=stats;
stats=async function(){_stats();
  const [desde,hasta]=periodo(),V=ventasDe(desde,hasta);
  let gan=0,conC=0;for(const o of V)for(const i of o.items||[]){if(i.costo){gan+=(i.precio-i.costo)*i.cantidad;conC+=i.precio*i.cantidad}}
  const extra=[["Ganancia aprox.",conC?money(gan):"—"],["Margen",conC?Math.round(gan/conC*100)+"%":"—"]];
  try{const d=await GJ("compras");const c=d.compras.filter(x=>new Date(x.fecha)>=desde&&new Date(x.fecha)<hasta);extra.push(["Gastado en compras",money(c.reduce((s,x)=>s+x.total,0))],["Por comprar ahora",money(d.sugeridas.reduce((s,x)=>s+x.costo,0))])}catch(e){}
  $("kpis").insertAdjacentHTML("beforeend",extra.map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join(""));
};
["per","perS"].forEach(i=>$(i).onchange=()=>stats());["perD","perH"].forEach(i=>$(i).onchange=()=>stats());

// ---------- Ofertas de revistas ----------
let OFE={pendientes:[],activas:[]};
TABS.ofe=async()=>{try{OFE=await GJ("ofertas")}catch(e){$("ofC").textContent=e.message;return}renderOfe()};
function renderOfe(){const c=OFE.corrida;
  $("ofC").innerHTML=c?`Última lectura: <b>${new Date(c.f).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</b> · revistas de ${esc((c.tiendas||[]).join(", ")||"—")} · ${c.leidos} productos leídos · <b>${c.propuestas}</b> coinciden con el catálogo y están más baratos`:"Todavía no corrió el robot de las revistas. Corre solo los lunes y jueves.";
  $("ofP").innerHTML=OFE.pendientes.length?`<table><tr><th>Producto nuestro</th><th>Leído en la revista</th><th class="n">Su precio</th><th class="n">Nuestro costo</th><th class="n">Bulto en la tienda</th><th>Hasta</th><th></th></tr>${OFE.pendientes.map(x=>`<tr><td><b>${esc(plain(x.nombre))}</b><br><span class="muted">${esc(x.sku)}${x.aprendido?" · ya aprobado antes":""}</span></td><td>${esc(x.tienda)}: <i>${esc(x.texto)}</i></td><td class="n"><b>${money(x.precio)}</b><br><span class="ok">-${x.ahorro}%</span></td><td class="n">${money(x.costoU)}</td><td class="n">${money(x.precioBultoActual)} → <b>${money(x.precioBultoNuevo)}</b><br><span class="muted">bulto x${x.bu}</span></td><td><input type="date" id="ofh_${x.id}" value="${new Date(Date.now()+7*864e5).toISOString().slice(0,10)}" style="width:140px"></td><td><button class="p" type="button" onclick="ofeAcc('aprobar','${x.id}')">✅ Usar</button> <button type="button" onclick="ofeAcc('descartar','${x.id}')">✖ No es</button></td></tr>`).join("")}</table>`:'<p class="muted">No hay ofertas nuevas para revisar.</p>';
  $("ofA").innerHTML=OFE.activas.length?`<table><tr><th>Producto</th><th>Dónde</th><th class="n">Precio</th><th class="n">Bulto en la tienda</th><th>Hasta</th><th></th></tr>${OFE.activas.map(x=>`<tr><td>${esc(plain(x.nombre||x.sku))}</td><td>${esc(x.tienda)}</td><td class="n">${money(x.costoU)}</td><td class="n">${money(x.precioBulto)}</td><td>${x.hasta?fecha(x.hasta+"T12:00"):"—"}</td><td><button type="button" onclick="ofeAcc('quitar','${esc(x.sku)}')">Quitar</button></td></tr>`).join("")}</table>`:'<p class="muted">Ninguna oferta en uso.</p>'}
window.ofeAcc=async(accion,id)=>{const x=OFE.pendientes.find(y=>y.id===id);
  const q={aprobar:x&&`¿Usar la oferta de ${x.tienda}?\n\n${plain(x.nombre)}\nA ${money(x.precio)} c/u (-${x.ahorro}%). El bulto en la tienda pasa de ${money(x.precioBultoActual)} a ${money(x.precioBultoNuevo)}.`,descartar:"¿Descartar? No se vuelve a proponer este producto con ese texto.",quitar:"¿Dejar de usar esta oferta? El precio vuelve al del proveedor principal."}[accion];
  if(q&&!confirm(q))return;try{OFE=await GJ("ofertas",accion==="quitar"?{accion,sku:id}:{accion,id,hasta:$("ofh_"+id)?.value});renderOfe()}catch(e){alert(e.message)}};

// ---------- Membresía ----------
TABS.mem=async()=>{let d;try{d=await (await api("productos")).json()}catch(e){return}const m=d.membresia||{};
  $("mbA").checked=!!m.activa;$("mbN").value=m.nombre||"";$("mbP").value=m.precio||"";$("mbD").value=m.descripcion||"";$("mbE").checked=!!m.envioGratis;$("mbDe").value=m.descuento||0;$("mbM").checked=!!m.mayoristaSinMinimo;
  const [C,F]=await Promise.all([GJ("cuentas").catch(()=>[]),GJ("clientes").catch(()=>[])]);
  const mp=C.filter(c=>c.socio),man=F.filter(c=>c.socio);
  const act=mp.filter(c=>c.socio.estado==="activo");
  $("mbK").innerHTML=[["Socios que pagan",act.length],["Por mes (aprox.)",money(act.reduce((s,c)=>s+(+c.socio.monto||m.precio||0),0))],["Socios a mano",man.length]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join("");
  const E={activo:"✅ Pagando",pendiente:"⏳ Sin confirmar",inactivo:"⛔ De baja"};
  $("mbL").innerHTML=mp.length||man.length?`<table><tr><th>Cliente</th><th>Cómo</th><th>Estado</th><th>Desde</th></tr>${mp.map(c=>`<tr><td><b>${esc(c.nombre||c.email)}</b><br><span class="muted">${esc(c.email)}</span></td><td>Mercado Pago (${money(c.socio.monto||0)}/mes)</td><td>${E[c.socio.estado]||c.socio.estado}</td><td>${fecha(c.socio.f)}</td></tr>`).join("")}${man.map(c=>`<tr><td><b>${esc(c.nombre)}</b><br><span class="muted">Cliente Nº ${c.nro||""}</span></td><td>Marcado a mano</td><td>${c.activo?"✅ Activo":"⛔ De baja"}</td><td>—</td></tr>`).join("")}</table>`:'<p class="muted">Todavía no hay socios.</p>'};
$("mbF").onsubmit=async e=>{e.preventDefault();const m={activa:$("mbA").checked,nombre:$("mbN").value,precio:$("mbP").value,descripcion:$("mbD").value,envioGratis:$("mbE").checked,descuento:$("mbDe").value,mayoristaSinMinimo:$("mbM").checked};
  if(!confirm(`¿Guardar la membresía?\n\n${m.activa?"Activa":"Desactivada"} · ${m.nombre} · $ ${(+m.precio).toLocaleString("es-AR")} por mes\nBeneficios: ${[m.envioGratis?"envío gratis":"",+m.descuento?m.descuento+"% de descuento":"",m.mayoristaSinMinimo?"Mayoristas sin mínimo":""].filter(Boolean).join(", ")||"ninguno"}`))return;
  const r=await api("productos",{method:"POST",body:JSON.stringify({membresia:m})});const d=await r.json().catch(()=>({}));
  say("mbMsg",r.ok,r.ok?"Guardado. La tienda lo muestra en 1 minuto."+(d.actualizados?` Se actualizó el precio de ${d.actualizados} socios.`:""):(d.error||"No se pudo guardar."));if(r.ok)TABS.mem()};

// ---------- Semáforo, mantenimiento e instructivo ----------
const SEMC={ok:"🟢",aviso:"🟠",error:"🔴"};
const SEMQ={tienda:"sos",precios:"pre",mp:"pre",mail:"sos",pedidos:"ped",factura:"fac"};
async function semaforo(){try{return await GJ("estado")}catch(e){return null}}
TABS.sos=async()=>{const d=await (await api("productos")).json().catch(()=>({}));$("mtA").checked=!!d.mantenimiento;$("mtM").value=d.mantenimientoMsg||"";$("mtS").value=d.soporte||"";
  $("instSop").textContent=d.soporte?"Llamá a "+d.soporte+".":"Llamá a soporte (cargá el contacto arriba, en Modo mantenimiento).";
  $("semL").textContent="Revisando…";const s=await semaforo();
  $("semL").innerHTML=s?s.items.map(x=>`<div class="semi"><span class="d">${SEMC[x.nivel]}</span><div><b>${esc(x.nombre)}</b><br><span class="muted">${esc(x.txt)}</span>${x.nivel!=="ok"&&SEMQ[x.id]&&SEMQ[x.id]!=="sos"?` <a href="#" onclick="irA('${SEMQ[x.id]}');return false">Ir a arreglarlo →</a>`:""}</div></div>`).join(""):'<p class="err">No se pudo revisar. Si el panel abre pero esto falla, avisá a soporte.</p>'};
$("semR").onclick=()=>TABS.sos();
$("mtF").onsubmit=async e=>{e.preventDefault();const on=$("mtA").checked;if(!confirm(on?"¿Poner la tienda en mantenimiento? Los clientes van a ver el cartel y el botón de WhatsApp.":"¿Guardar? La tienda queda abierta normalmente."))return;
  const r=await api("productos",{method:"POST",body:JSON.stringify({tienda:{mantenimiento:on,mantenimientoMsg:$("mtM").value,soporte:$("mtS").value}})});say("mtMsg",r.ok,r.ok?(on?"Listo: la tienda muestra el cartel de mantenimiento (en 1 minuto).":"Guardado."):"No se pudo guardar.");if(r.ok)TABS.sos()};
$("instPr").onclick=()=>{const w=open("","_blank");if(!w)return;w.document.write(`<!doctype html><meta charset="utf-8"><title>Instructivo - Si algo falla</title><style>body{font:14px system-ui,sans-serif;margin:24px;max-width:760px}h3{margin:16px 0 4px}li{margin:3px 0}</style><h1>Proveeduría Virtual · Qué hacer si algo falla</h1>${$("inst").innerHTML}<script>setTimeout(()=>print(),300)<\/script>`);w.document.close()};
// Semáforo chiquito en Hoy (solo para quien puede verlo)
async function semHoy(){if(!(YO.permisos.includes("*")||YO.permisos.includes("precios")))return;const s=await semaforo();if(!s)return;const mal=s.items.filter(x=>x.nivel!=="ok");
  $("hoySem").hidden=false;$("hoySem").textContent=mal.length?`${SEMC[s.peor]} ${mal.length} cosa${mal.length>1?"s":""} para revisar → ver`:"🟢 Todo funciona";$("hoySem").onclick=()=>irA("sos")}

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
let HEXC=new Set(); // pedidos nuevos que se sacaron de la lista de compras
async function traerSug(nuevos){const ids=nuevos.filter(o=>!HEXC.has(o.id)).map(o=>o.id);
  const r=await G("compras",HEXC.size?{qs:"&pedidos="+encodeURIComponent(ids.join(","))}:undefined);const d=await r.json();if(!r.ok)throw new Error(d.error);return d.sugeridas}
TABS.hoy=async()=>{
  const ver=p=>YO.permisos.includes("*")||YO.permisos.includes(p);
  const por=e=>L.filter(o=>o.etapaActual===e).sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega)));
  const nuevos=por("nuevo");for(const id of HEXC)if(!nuevos.some(o=>o.id===id))HEXC.delete(id);
  if(ver("compras")){try{SUG=await traerSug(nuevos)}catch(e){SUG=[]}}
  const entregar=[...por("preparando"),...por("en camino")].sort((a,b)=>ordenDia(a.entrega)-ordenDia(b.entrega)||String(a.entrega).localeCompare(String(b.entrega))||String(a.zona).localeCompare(String(b.zona)));
  const hoyS=new Date().toLocaleDateString("es-AR"),entHoy=L.filter(o=>o.etapaActual==="entregado"&&o.entregado&&new Date(o.entregado).toLocaleDateString("es-AR")===hoyS).length;
  const esp=por("esperando pago").length,costo=SUG.reduce((t,x)=>t+x.costo,0);
  const act=SUG.length||nuevos.length?(SUG.length?2:1):entregar.length?3:0;
  const cant=cantTxt,elegidos=nuevos.filter(o=>!HEXC.has(o.id));
  $("hoyBody").innerHTML=
  `<div class="blk ${act===1?"activo":""}"><h2>📥 1. Pedidos nuevos <span class="cnt">${nuevos.length}</span></h2>
    ${nuevos.length?`<p class="muted" style="margin:0 0 4px">Los que están tildados entran en la lista de compras. Destildá los que vas a comprar otro día.</p>`+nuevos.map(o=>`<div class="fila"><label class="chk"><input type="checkbox" data-hsel="${o.id}" ${HEXC.has(o.id)?"":"checked"}> <b>${o.nro?"#"+o.nro+" · ":""}${esc(o.nombre)}</b></label>${secTag(o)}${o.entrega?` · 🕒 ${esc(o.entrega)}`:""} · ${money(o.total)}${prods(o)}</div>`).join(""):'<p class="muted">No hay pedidos nuevos.</p>'}
    ${esp?`<p class="muted">Hay ${esp} pedido${esp>1?"s":""} esperando que se acredite el pago: aparece${esp>1?"n":""} acá solo${esp>1?"s":""} cuando se paguen.</p>`:""}</div>
  <div class="blk ${act===2?"activo":""}"><h2>🛒 2. Lista de compras <span class="cnt">${SUG.length}</span>${SUG.length?`<small class="muted">aprox. ${money(costo)}${HEXC.size?` · para ${elegidos.length} de ${nuevos.length} pedidos`:""}</small>`:""}</h2>
    ${SUG.length?`<table><tr><th>Comprar</th><th>Producto</th><th>Sección</th><th>Dónde</th></tr>${[...SUG].sort((a,b)=>String(a.proveedor).localeCompare(String(b.proveedor))).map(x=>`<tr><td><b>${cant(x)}</b></td><td>${esc(plain(x.nombre))}</td><td class="muted">${esc(x.seccion||"")}</td><td class="muted">${esc(x.proveedor||"")}</td></tr>`).join("")}</table>
    <div class="tools"><button type="button" id="hoyCopy">📋 Copiar lista</button> <span id="hoyExpB"></span> <button type="button" class="p big" id="hoyYa">✅ Ya compré todo</button></div>`
    :elegidos.length?`<p class="muted">No hace falta comprar nada: lo que piden ya está en el depósito.</p><button type="button" class="p" id="hoyPrep">✅ Pasar los pedidos a preparar</button>`:'<p class="muted">No hay nada para comprar. 🎉</p>'}</div>
  <div class="blk ${act===3?"activo":""}"><h2>🚚 3. Para entregar <span class="cnt">${entregar.length}</span><small class="muted">Entregados hoy: ${entHoy}</small></h2>
    ${entregar.length?entregar.map((o,i)=>`<div class="fila"><b>${i+1}. ${o.nro?"#"+o.nro+" · ":""}${esc(o.nombre)}</b>${o.entrega?` · 🕒 <b>${esc(o.entrega)}</b>`:""}<br>📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plain(o.direccion))}" target="_blank" rel="noopener">${esc(o.direccion)}</a> · 📞 <a href="${waLink(o.telefono)}" target="_blank" rel="noopener">${esc(o.telefono)}</a><br>${cobrar(o)}${prods(o)}<button type="button" class="p big" onclick="setE('${o.id}','entregado')">👉 Marcar entregado</button></div>`).join(""):'<p class="muted">No hay pedidos para entregar.</p>'}</div>`;
  $("hoyBody").querySelectorAll("[data-hsel]").forEach(c=>c.onchange=()=>{c.checked?HEXC.delete(c.dataset.hsel):HEXC.add(c.dataset.hsel);TABS.hoy()});
  if($("hoyCopy"))$("hoyCopy").onclick=async()=>{try{await navigator.clipboard.writeText(sugTxt());say("hoyMsg",true,"Lista copiada. Pegala en WhatsApp o en las notas del celular.")}catch(e){say("hoyMsg",false,"No se pudo copiar.")}};
  barraExp("hoyExpB","lista-de-compras","Lista de compras",()=>({sub:`Para ${elegidos.length} pedido${elegidos.length===1?"":"s"}`+(elegidos.length?": "+elegidos.map(o=>o.nro?"#"+o.nro:o.nombre).join(", "):""),
    cols:["Sección","Código","Producto","Cantidad","Cómo comprar","Precio unitario","Subtotal","Proveedor"],
    filas:SUG.filter(x=>x.unidades>0).map(x=>[x.seccion||"",x.sku,plain(x.nombre),x.unidades,cantTxt(x),x.costoU||"",x.costo||"",x.proveedor||"Proveedor principal"])}));
  if($("hoyYa"))$("hoyYa").onclick=async()=>{await yaCompre("hoyMsg","Proveedor principal",elegidos.map(o=>o.id))};
  if($("hoyPrep"))$("hoyPrep").onclick=async()=>{for(const o of elegidos)await api("pedidos",{method:"POST",body:JSON.stringify({id:o.id,estado:"preparando"})});say("hoyMsg",true,"Listo, los pedidos pasaron a Para entregar.");load()};
};
// La pantalla se actualiza sola cada 2 minutos (si está abierta)
setInterval(()=>{if(YO&&!$("hoy").hidden&&!document.hidden&&!document.querySelector("#hoyBody details[open]"))load()},120000);
