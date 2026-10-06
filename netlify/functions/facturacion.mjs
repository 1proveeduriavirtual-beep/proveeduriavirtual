// Facturación electrónica (ARCA). Solo para el panel, con la clave ADMIN_KEY.
//   GET  ?k=CLAVE            -> estado (datos cargados, certificado, pedido de certificado)
//   GET  ?k=CLAVE&id=PEDIDO  -> pedido + datos del emisor (para ver / imprimir la factura)
//   POST ?k=CLAVE {accion: "config" | "csr" | "cert" | "probar" | "facturar", ...}
import { getStore } from "@netlify/blobs";
import { mandarFactura } from "../../lib/aviso.mjs";
import { generarClaveYCSR, revisarCertificado, facturarPedido, probar, leerConfig, configCompleta } from "../../lib/arca.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const txt = (v, n = 120) => String(v ?? "").trim().slice(0, n);

export default async (req) => {
  const key = Netlify.env.get("ADMIN_KEY");
  const url = new URL(req.url);
  if (!key || url.searchParams.get("k") !== key) return J({ error: "clave incorrecta" }, 401);
  const st = getStore("facturacion");
  const cfg = await leerConfig();

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      const o = await getStore("pedidos").get(String(id), { type: "json" });
      return o ? J({ pedido: o, emisor: cfg }) : J({ error: "No existe el pedido." }, 404);
    }
    const [clave, csr, cert] = await Promise.all(["clave", "csr", "cert"].map(k => st.get(k, { type: "json" }).catch(() => null)));
    return J({ cfg, completa: !!configCompleta(cfg), clave: !!clave, csr: csr?.pem || null, cert: cert ? { titular: cert.titular, vence: cert.vence, emisor: cert.emisor } : null });
  }
  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "pedido inválido" }, 400); }

  try {
    if (b.accion === "config") {
      const cuit = String(b.cuit || "").replace(/\D/g, "");
      if (!/^\d{11}$/.test(cuit)) return J({ error: "El CUIT tiene que tener 11 números." }, 400);
      const ptoVta = Math.floor(Number(b.ptoVta));
      if (!(ptoVta >= 1 && ptoVta <= 99998)) return J({ error: "Poné el número de punto de venta (el que creaste en ARCA para web services)." }, 400);
      const tipo = b.tipo === "B" ? "B" : "C";
      const nuevo = {
        cuit, ptoVta, tipo, alicuota: Number(b.alicuota) === 10.5 ? 10.5 : 21, prod: !!b.prod, activo: !!b.activo, alPagar: !!b.alPagar,
        razon: txt(b.razon), domicilio: txt(b.domicilio, 160), condIva: tipo === "C" ? "Responsable Monotributo" : "IVA Responsable Inscripto",
        iibb: txt(b.iibb, 40), inicio: txt(b.inicio, 10),
      };
      if (!nuevo.razon) return J({ error: "Poné la razón social o nombre del titular." }, 400);
      // si cambia el CUIT o el ambiente, el acceso guardado ya no sirve
      if (cfg.cuit !== cuit || !!cfg.prod !== nuevo.prod) await Promise.all([st.delete("ta_homo"), st.delete("ta_prod")]);
      await st.setJSON("cfg", nuevo);
      return J({ ok: true, cfg: nuevo });
    }

    if (b.accion === "csr") {
      const cuit = String(b.cuit || cfg.cuit || "").replace(/\D/g, "");
      if (!/^\d{11}$/.test(cuit)) return J({ error: "Primero guardá el CUIT en los datos de facturación." }, 400);
      if (await st.get("cert", { type: "json" }) && !b.regenerar)
        return J({ error: "Ya hay un certificado cargado. Si querés empezar de nuevo, tildá 'Generar uno nuevo'. El certificado actual va a dejar de funcionar.", confirmar: true }, 409);
      const { clave, csr } = generarClaveYCSR({ cuit, razon: b.razon || cfg.razon, alias: "tienda" + cuit.slice(-4) });
      await st.setJSON("clave", { pem: clave, fecha: new Date().toISOString() });
      await st.setJSON("csr", { pem: csr });
      await Promise.all([st.delete("cert"), st.delete("ta_homo"), st.delete("ta_prod")]);
      return J({ ok: true, csr });
    }

    if (b.accion === "cert") {
      const clave = await st.get("clave", { type: "json" });
      if (!clave) return J({ error: "Primero generá el pedido de certificado (.csr) acá en el panel." }, 400);
      const pem = String(b.pem || "");
      const info = revisarCertificado(pem, clave.pem);
      await st.setJSON("cert", { pem, ...info });
      await Promise.all([st.delete("ta_homo"), st.delete("ta_prod")]);
      return J({ ok: true, cert: info });
    }

    if (b.accion === "probar") return J({ ok: true, ...(await probar()) });

    if (b.accion === "facturar" || b.accion === "enviar") {
      const f = b.accion === "facturar" ? await facturarPedido(b.id) : null;
      const P = getStore("pedidos");
      const o = await P.get(String(b.id), { type: "json" });
      if (!o?.factura) return J({ error: "Ese pedido no tiene factura." }, 400);
      let enviada = null;
      // al facturar se manda sola solo si es real y nunca se mandó; "enviar" la manda siempre (también de prueba)
      if (o.email && (b.accion === "enviar" || (o.factura.prod && !o.facturaEnviada))) {
        const link = `${url.origin}/factura.html?id=${encodeURIComponent(o.id)}&t=${o.factura.token}`;
        if (await mandarFactura(o, cfg, link)) { o.facturaEnviada = new Date().toISOString(); await P.setJSON(o.id, o); enviada = o.email; }
        else if (b.accion === "enviar") return J({ error: "No se pudo mandar el mail. Revisá GMAIL_APP_PASSWORD en Netlify." }, 502);
      }
      if (b.accion === "enviar" && !o.email) return J({ error: "El cliente no dejó email." }, 400);
      return J({ ok: true, factura: f || o.factura, enviada });
    }
    return J({ error: "acción desconocida" }, 400);
  } catch (e) {
    return J({ error: e.message || "Error inesperado" }, 502);
  }
};
