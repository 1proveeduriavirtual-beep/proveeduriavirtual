// Factura electrónica con ARCA (ex AFIP), sin librerías externas.
//  - generarClaveYCSR(): crea la clave privada y el "pedido de certificado" (.csr) que se sube en ARCA.
//  - facturarPedido(): pide el CAE al web service WSFEv1 y lo guarda en el pedido.
// La clave privada y el certificado quedan guardados en Netlify (store "facturacion"), nunca en el código.
import crypto from "node:crypto";
import https from "node:https";
import { getStore } from "@netlify/blobs";
import { mandarFactura } from "./aviso.mjs";

// ───────────────────────── DER (ASN.1) mínimo ─────────────────────────
const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x))));
function len(n) {
  if (n < 128) return Buffer.from([n]);
  const h = []; while (n > 0) { h.unshift(n & 255); n >>= 8; }
  return Buffer.from([0x80 | h.length, ...h]);
}
const tlv = (tag, c) => B([tag], len(c.length), c);
const seq = (...p) => tlv(0x30, B(...p));
const set = (...p) => tlv(0x31, B(...p));
const ctx = (n, c) => tlv(0xa0 + n, c);
const nul = Buffer.from([5, 0]);
const oct = c => tlv(0x04, c);
const bits = c => tlv(0x03, B([0], c));
const utf8 = s => tlv(0x0c, Buffer.from(s, "utf8"));
const printable = s => tlv(0x13, Buffer.from(s, "ascii"));
function int(v) {
  let b = typeof v === "number" ? Buffer.from([v]) : Buffer.from(v);
  if (b[0] & 0x80) b = B([0], b);
  return tlv(0x02, b);
}
function oid(s) {
  const p = s.split(".").map(Number), out = [40 * p[0] + p[1]];
  for (const n of p.slice(2)) {
    const t = [n & 127]; let x = n >> 7;
    while (x > 0) { t.unshift((x & 127) | 128); x >>= 7; }
    out.push(...t);
  }
  return tlv(0x06, Buffer.from(out));
}
function utcTime(d) {
  const z = n => String(n).padStart(2, "0");
  return tlv(0x17, Buffer.from(`${z(d.getUTCFullYear() % 100)}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`));
}
// lector: devuelve los elementos hijos (TLV completos) de un contenido construido
function hijos(buf) {
  const out = []; let i = 0;
  while (i < buf.length) {
    const tag = buf[i]; let l = buf[i + 1], h = 2;
    if (l & 0x80) { const n = l & 127; l = 0; for (let k = 0; k < n; k++) l = l * 256 + buf[i + 2 + k]; h = 2 + n; }
    out.push({ tag, raw: buf.subarray(i, i + h + l), body: buf.subarray(i + h, i + h + l) });
    i += h + l;
  }
  return out;
}

const OID = {
  sha256: "2.16.840.1.101.3.4.2.1", rsa: "1.2.840.113549.1.1.1", sha256rsa: "1.2.840.113549.1.1.11",
  data: "1.2.840.113549.1.7.1", signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3", messageDigest: "1.2.840.113549.1.9.4", signingTime: "1.2.840.113549.1.9.5",
  C: "2.5.4.6", O: "2.5.4.10", CN: "2.5.4.3", serialNumber: "2.5.4.5",
};
const alg = o => seq(oid(o), nul);
const pem = (der, label) => `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
const unpem = s => Buffer.from(String(s).replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");

// ───────────────────────── Clave + pedido de certificado ─────────────────────────
const limpiar = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,&-]/g, "").trim().slice(0, 60);

export function generarClaveYCSR({ cuit, razon, alias }) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rdn = (o, v) => set(seq(oid(o), v));
  const subject = seq(
    rdn(OID.C, printable("AR")),
    rdn(OID.O, utf8(limpiar(razon) || "Proveeduria Virtual")),
    rdn(OID.CN, utf8(limpiar(alias) || "tienda")),
    rdn(OID.serialNumber, printable("CUIT " + cuit)),
  );
  const info = seq(int(0), subject, publicKey.export({ type: "spki", format: "der" }), ctx(0, Buffer.alloc(0)));
  const firma = crypto.sign("sha256", info, privateKey);
  const csr = seq(info, alg(OID.sha256rsa), bits(firma));
  return { clave: privateKey.export({ type: "pkcs8", format: "pem" }), csr: pem(csr, "CERTIFICATE REQUEST") };
}

// Revisa que el certificado sea válido y corresponda a la clave guardada.
export function revisarCertificado(certPem, clavePem) {
  let x;
  try { x = new crypto.X509Certificate(certPem); } catch { throw new Error("El archivo no es un certificado válido. Subí el .crt que te dio ARCA."); }
  if (clavePem && !x.checkPrivateKey(crypto.createPrivateKey(clavePem)))
    throw new Error("Ese certificado no corresponde al pedido (.csr) generado acá. Subí el .crt que ARCA te dio para el último pedido.");
  return { titular: x.subject.replace(/\n/g, ", "), vence: new Date(x.validTo).toISOString(), emisor: x.issuer.replace(/\n/g, ", ") };
}

// ───────────────────────── Firma CMS del ticket de acceso ─────────────────────────
export function firmarCMS(contenido, certPem, clavePem) {
  const certDer = unpem(certPem);
  const tbs = hijos(hijos(certDer)[0].body)[0].body;
  const t = hijos(tbs), i0 = t[0].tag === 0xa0 ? 1 : 0;
  const serial = t[i0].raw, issuer = t[i0 + 2].raw;
  const data = Buffer.from(contenido, "utf8");
  const attrs = [
    seq(oid(OID.contentType), set(oid(OID.data))),
    seq(oid(OID.signingTime), set(utcTime(new Date()))),
    seq(oid(OID.messageDigest), set(oct(crypto.createHash("sha256").update(data).digest()))),
  ].sort(Buffer.compare);
  const firma = crypto.sign("sha256", set(...attrs), crypto.createPrivateKey(clavePem));
  const signer = seq(int(1), seq(issuer, serial), alg(OID.sha256), ctx(0, B(...attrs)), alg(OID.rsa), oct(firma));
  const sd = seq(int(1), set(alg(OID.sha256)), seq(oid(OID.data), ctx(0, oct(data))), ctx(0, certDer), set(signer));
  return seq(oid(OID.signedData), ctx(0, sd)).toString("base64");
}

// ───────────────────────── SOAP ─────────────────────────
const URLS = {
  homo: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  prod: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
};
// Los servidores de ARCA usan claves DH viejas: hace falta bajar el nivel de seguridad TLS para conectarse.
export let post = (url, body, action) => new Promise((ok, mal) => {
  const req = https.request(url, {
    method: "POST", ciphers: "DEFAULT@SECLEVEL=1", timeout: 15000,
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: action || '""', "content-length": Buffer.byteLength(body) },
  }, res => { let s = ""; res.setEncoding("utf8"); res.on("data", c => s += c); res.on("end", () => ok({ status: res.statusCode, text: s })); });
  req.on("timeout", () => req.destroy(new Error("ARCA no respondió a tiempo")));
  req.on("error", e => mal(new Error("No me pude conectar con ARCA: " + e.message)));
  req.end(body);
});
export const _setPost = f => { post = f; }; // para pruebas

const unx = s => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const x = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (xml, n) => { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`)); return m ? m[1] : null; };
const tags = (xml, n) => [...String(xml).matchAll(new RegExp(`<(?:\\w+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`, "g"))].map(m => m[1]);

const isoAR = d => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 19) + "-03:00";
export const hoyAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); // AAAA-MM-DD

// Ticket de acceso (dura 12 h; se guarda para no pedirlo de nuevo)
async function acceso(cfg) {
  const st = getStore("facturacion"), amb = cfg.prod ? "prod" : "homo";
  const ta = await st.get("ta_" + amb, { type: "json" }).catch(() => null);
  if (ta && ta.cuit === cfg.cuit && new Date(ta.vence) - Date.now() > 10 * 60e3) return ta;
  const [c, k] = await Promise.all([st.get("cert", { type: "json" }), st.get("clave", { type: "json" })]);
  if (!c?.pem || !k?.pem) throw new Error("Falta el certificado de ARCA. Completalo en Facturación.");
  const cert = c.pem, clave = k.pem;
  const now = new Date();
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId><generationTime>${isoAR(new Date(now - 10 * 60e3))}</generationTime><expirationTime>${isoAR(new Date(+now + 10 * 60e3))}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
  const env = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${firmarCMS(tra, cert, clave)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const r = await post(URLS[amb].wsaa, env, '""');
  const ret = tag(r.text, "loginCmsReturn");
  if (!ret) {
    const f = unx(tag(r.text, "faultstring") || "respuesta inesperada");
    if (/alreadyAuthenticated|ya posee un TA valido/i.test(r.text)) throw new Error("ARCA dice que ya hay un acceso abierto. Esperá unos minutos y probá de nuevo.");
    if (/cms.cert.untrusted|not.yet.valid|expired/i.test(r.text)) throw new Error("ARCA no acepta el certificado (" + f + "). Revisá que sea el del ambiente correcto (prueba o real) y que no esté vencido.");
    if (/notAuthorized|no autorizado|wsn.unavailable|ns.unavailable/i.test(r.text)) throw new Error("El certificado no está autorizado para Facturación electrónica. En ARCA asociá el servicio 'wsfe' a este certificado. (" + f + ")");
    throw new Error("ARCA rechazó el acceso: " + f);
  }
  const t = unx(ret);
  const nuevo = { token: unx(tag(t, "token") || ""), sign: unx(tag(t, "sign") || ""), vence: tag(t, "expirationTime"), cuit: cfg.cuit };
  if (!nuevo.token || !nuevo.sign) throw new Error("ARCA no devolvió el acceso.");
  await st.setJSON("ta_" + amb, nuevo);
  return nuevo;
}

async function wsfe(cfg, metodo, cuerpo) {
  const ta = await acceso(cfg);
  const env = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Header/><soapenv:Body><ar:${metodo}><ar:Auth><ar:Token>${x(ta.token)}</ar:Token><ar:Sign>${x(ta.sign)}</ar:Sign><ar:Cuit>${cfg.cuit}</ar:Cuit></ar:Auth>${cuerpo}</ar:${metodo}></soapenv:Body></soapenv:Envelope>`;
  const r = await post(URLS[cfg.prod ? "prod" : "homo"].wsfe, env, "http://ar.gov.afip.dif.FEV1/" + metodo);
  const res = tag(r.text, metodo + "Result");
  if (!res) throw new Error("ARCA respondió con un error: " + unx(tag(r.text, "faultstring") || ("HTTP " + r.status)));
  return res;
}
const errores = res => tags(tag(res, "Errors") || "", "Err").map(e => `${tag(e, "Code")}: ${unx(tag(e, "Msg"))}`);

export const TIPOS = { C: 11, B: 6 };

export async function ultimoNumero(cfg) {
  const res = await wsfe(cfg, "FECompUltimoAutorizado", `<ar:PtoVta>${cfg.ptoVta}</ar:PtoVta><ar:CbteTipo>${TIPOS[cfg.tipo]}</ar:CbteTipo>`);
  const errs = errores(res);
  if (errs.length) throw new Error("ARCA: " + errs.join(" · "));
  return Number(tag(res, "CbteNro") || 0);
}

async function consultar(cfg, nro) {
  const res = await wsfe(cfg, "FECompConsultar", `<ar:FeCompConsReq><ar:CbteTipo>${TIPOS[cfg.tipo]}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${cfg.ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);
  const g = tag(res, "ResultGet");
  if (!g) return null;
  return { cae: tag(g, "CodAutorizacion"), caeVto: tag(g, "FchVto"), total: Number(tag(g, "ImpTotal")), fecha: tag(g, "CbteFch") };
}

const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
export function importes(total, cfg) {
  if (cfg.tipo !== "B") return { total, neto: total, iva: 0 };
  const a = Number(cfg.alicuota) === 10.5 ? 10.5 : 21;
  const neto = Math.round(total / (1 + a / 100) * 100) / 100;
  return { total, neto, iva: Math.round((total - neto) * 100) / 100, alicuota: a };
}

export async function leerConfig() {
  const c = await getStore("facturacion").get("cfg", { type: "json" }).catch(() => null);
  return c || { tipo: "C", prod: false, activo: false };
}
export const configCompleta = c => /^\d{11}$/.test(c.cuit || "") && c.ptoVta >= 1 && TIPOS[c.tipo];

// Factura un pedido (una sola vez). Devuelve la factura guardada.
export async function facturarPedido(id) {
  const cfg = await leerConfig();
  if (!configCompleta(cfg)) throw new Error("Completá los datos de facturación (CUIT, punto de venta y tipo) en el panel.");
  const st = getStore("pedidos");
  const o = await st.get(String(id), { type: "json" });
  if (!o) throw new Error("El pedido no existe.");
  if (o.factura) return o.factura;
  if (o.facturando && Date.now() - o.facturando < 60e3) throw new Error("Ese pedido se está facturando. Esperá un minuto.");
  o.facturando = Date.now();
  await st.setJSON(o.id, o);
  const imp = importes(o.total, cfg);
  const guardar = async f => { const p = await st.get(o.id, { type: "json" }); p.factura = f; delete p.facturando; delete p.facturaIntento; delete p.facturaError; await st.setJSON(o.id, p); return f; };
  const base = { tipo: cfg.tipo, ptoVta: cfg.ptoVta, prod: !!cfg.prod, cuit: cfg.cuit, ...imp, token: crypto.randomBytes(12).toString("hex") };
  try {
    // Si un intento anterior se cortó, ver si ARCA llegó a autorizarlo
    if (o.facturaIntento && o.facturaIntento.tipo === cfg.tipo && o.facturaIntento.ptoVta === cfg.ptoVta && !!o.facturaIntento.prod === !!cfg.prod) {
      const c = await consultar(cfg, o.facturaIntento.nro).catch(() => null);
      if (c && c.cae && Math.abs(c.total - o.total) < 0.01 && c.fecha === o.facturaIntento.fecha)
        return await guardar({ ...base, nro: o.facturaIntento.nro, cae: c.cae, caeVto: c.caeVto, fecha: c.fecha });
    }
    const nro = (await ultimoNumero(cfg)) + 1;
    const fecha = hoyAR().replace(/-/g, "");
    o.facturaIntento = { nro, fecha, tipo: cfg.tipo, ptoVta: cfg.ptoVta, prod: !!cfg.prod };
    await st.setJSON(o.id, o);
    const iva = cfg.tipo === "B" ? `<ar:Iva><ar:AlicIva><ar:Id>${imp.alicuota === 10.5 ? 4 : 5}</ar:Id><ar:BaseImp>${f2(imp.neto)}</ar:BaseImp><ar:Importe>${f2(imp.iva)}</ar:Importe></ar:AlicIva></ar:Iva>` : "";
    const det = `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${cfg.ptoVta}</ar:PtoVta><ar:CbteTipo>${TIPOS[cfg.tipo]}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>`
      + `<ar:Concepto>1</ar:Concepto><ar:DocTipo>99</ar:DocTipo><ar:DocNro>0</ar:DocNro><ar:CbteDesde>${nro}</ar:CbteDesde><ar:CbteHasta>${nro}</ar:CbteHasta><ar:CbteFch>${fecha}</ar:CbteFch>`
      + `<ar:ImpTotal>${f2(imp.total)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${f2(imp.neto)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${f2(imp.iva)}</ar:ImpIVA>`
      + `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>${iva}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
    const res = await wsfe(cfg, "FECAESolicitar", det);
    const d = tag(res, "FECAEDetResponse") || "";
    if (tag(d, "Resultado") !== "A" || !tag(d, "CAE")) {
      const obs = tags(tag(d, "Observaciones") || "", "Obs").map(e => `${tag(e, "Code")}: ${unx(tag(e, "Msg"))}`);
      const p = await st.get(o.id, { type: "json" }); delete p.facturando; delete p.facturaIntento;
      p.facturaError = ["ARCA rechazó la factura", ...errores(res), ...obs].join(" · ");
      await st.setJSON(o.id, p);
      throw new Error(p.facturaError);
    }
    return await guardar({ ...base, nro, cae: tag(d, "CAE"), caeVto: tag(d, "CAEFchVto"), fecha });
  } catch (e) {
    const p = await st.get(o.id, { type: "json" });
    if (p && !p.factura) { delete p.facturando; p.facturaError = p.facturaError || e.message; await st.setJSON(o.id, p); }
    throw e;
  }
}

// Factura sola apenas el pedido queda pagado (si está activado en el panel).
// Si es factura real y el cliente dejó mail, se la manda. Nunca tira error: si falla, queda anotado en el pedido.
export async function facturarAlPagar(id, origin) {
  try {
    const cfg = await leerConfig();
    if (!cfg.alPagar || !configCompleta(cfg)) return null;
    if (!(await getStore("facturacion").get("cert", { type: "json" }).catch(() => null))) return null;
    const st = getStore("pedidos");
    const antes = await st.get(String(id), { type: "json" });
    if (!antes || antes.factura) return null;
    await facturarPedido(id);
    const o = await st.get(String(id), { type: "json" });
    if (o?.factura?.prod && o.email && !o.facturaEnviada) {
      const link = `${origin}/factura.html?id=${encodeURIComponent(o.id)}&t=${o.factura.token}`;
      if (await mandarFactura(o, cfg, link)) { o.facturaEnviada = new Date().toISOString(); await st.setJSON(o.id, o); }
    }
    return o?.factura || null;
  } catch (e) {
    console.error("factura al pagar falló:", e?.message);
    return null;
  }
}

// Prueba de conexión: pide acceso y el último número autorizado.
export async function probar() {
  const cfg = await leerConfig();
  if (!configCompleta(cfg)) throw new Error("Completá CUIT, punto de venta y tipo de factura.");
  return { ultimo: await ultimoNumero(cfg), ambiente: cfg.prod ? "real" : "prueba (homologación)" };
}
