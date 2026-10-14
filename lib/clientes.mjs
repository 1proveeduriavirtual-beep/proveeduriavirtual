// Números fijos de pedido y de cliente, y la ficha de cada cliente (envío gratis, socio, activo, DNI/CUIT, notas).
// Se guardan aparte de los pedidos (store "clientes") para no pisar un pedido mientras se actualiza su pago.
import { getStore } from "@netlify/blobs";

export const claveCliente = o => String(o?.telefono || "").replace(/\D/g, "").slice(-10) || String(o?.email || "").trim().toLowerCase();

const S = () => getStore("clientes");
export const leerFichas = async () => (await S().get("fichas", { type: "json" }).catch(() => null)) || {};
export const guardarFichas = f => S().setJSON("fichas", f);

// Agrega o.nro (número de pedido) y o.nroCliente a la lista. Los números nuevos quedan guardados para siempre.
export async function numerar(lista) {
  const st = S();
  const [num, fichas] = await Promise.all([st.get("numeros", { type: "json" }).catch(() => null), leerFichas()]);
  const N = num || { max: 0, p: {} };
  let maxC = Math.max(0, ...Object.values(fichas).map(f => +f.nro || 0));
  let cambioN = false, cambioF = false;
  for (const o of [...lista].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) {
    if (!N.p[o.id]) { N.p[o.id] = ++N.max; cambioN = true; }
    o.nro = N.p[o.id];
    const k = claveCliente(o);
    if (k) {
      if (!fichas[k]) { fichas[k] = { nro: ++maxC, alta: o.fecha }; cambioF = true; }
      o.nroCliente = fichas[k].nro;
      if (o.dni && !fichas[k].dni) { fichas[k].dni = o.dni; cambioF = true; } // el DNI que puso al comprar queda en su ficha
      if (fichas[k].envioGratis) o.clienteEnvioGratis = true;
      if (fichas[k].socio) o.clienteSocio = true;
      if (fichas[k].dni) o.dniCliente = fichas[k].dni;
    }
  }
  await Promise.all([cambioN && st.setJSON("numeros", N), cambioF && guardarFichas(fichas)].filter(Boolean));
  return lista;
}

// Ficha de un cliente por teléfono o email (para el checkout: envío gratis)
export async function fichaDe(o) {
  const k = claveCliente(o);
  if (!k) return null;
  return (await leerFichas())[k] || null;
}
