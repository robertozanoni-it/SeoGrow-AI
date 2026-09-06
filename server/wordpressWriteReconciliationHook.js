import dns from "node:dns/promises";
import net from "node:net";
import { isDeepStrictEqual } from "node:util";

const HOOKED = Symbol.for("seogrow.wordpressWriteReconciliationHook");

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && [0, 2].includes(c)) ||
      (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  const value = String(address).toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || /^fe[c-f]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8:");
}

async function safeBase(input) {
  const url = new URL(String(input || ""));
  if (url.protocol !== "https:") throw new Error("WordPress deve usare HTTPS.");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) || url.hostname.endsWith(".local"))
    throw new Error("Indirizzo WordPress locale non consentito.");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("Indirizzo WordPress non pubblico.");
  url.pathname = `${url.pathname.replace(/\/(?:wp-admin|wp-json)(?:\/.*)?$/i, "").replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url;
}

function headers(username, password) {
  return {
    authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    accept: "application/json",
    "user-agent": "seoGrowAI/1.4-wordpress-remediation",
  };
}

const comparable = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value && typeof value === "object") return value;
  return String(value ?? "");
};

function currentField(entity, field) {
  if (field.startsWith("meta.")) return comparable(entity?.meta?.[field.slice(5)]);
  const value = entity?.[field];
  if (value && typeof value === "object") return comparable(value.raw ?? value.rendered ?? "");
  return comparable(value);
}

function classify(entity, fields, before, after) {
  const current = Object.fromEntries(fields.map((field) => [field, currentField(entity, field)]));
  const matches = (snapshot) => fields.every((field) =>
    Object.prototype.hasOwnProperty.call(snapshot || {}, field) &&
    isDeepStrictEqual(current[field], comparable(snapshot[field])));
  if (matches(after)) return { classification: "APPLIED", current };
  if (matches(before)) return { classification: "NOT_APPLIED", current };
  return { classification: "DIVERGED", current };
}

function registerRoutes(app) {
  if (app[HOOKED]) return;
  app[HOOKED] = true;
  app.post("/api/wordpress/reconcile-write", async (req, res) => {
    try {
      const { siteUrl, targetUrl, username, applicationPassword, resource, id, fields, before, after } = req.body || {};
      if (!username || !applicationPassword) throw new Error("Inserisci utente e password applicativa WordPress.");
      if (!["pages", "posts"].includes(resource)) throw new Error("Tipo WordPress non supportato per la riconciliazione.");
      const entityId = Number(id);
      if (!Number.isSafeInteger(entityId) || entityId <= 0) throw new Error("ID WordPress non valido.");
      const exactFields = Array.isArray(fields) ? [...new Set(fields.map(String))] : [];
      if (!exactFields.length || exactFields.some((field) => !["title", "content", "excerpt"].includes(field))) {
        throw new Error("Riconciliazione disponibile solo per title/content/excerpt.");
      }
      if (!before || typeof before !== "object" || !after || typeof after !== "object" ||
          exactFields.some((field) => before[field] === undefined || after[field] === undefined)) {
        throw new Error("Snapshot prima/dopo incompleto.");
      }
      const base = await safeBase(siteUrl || targetUrl);
      const response = await fetch(new URL(`wp-json/wp/v2/${resource}/${entityId}?context=edit`, base), {
        headers: headers(username, applicationPassword),
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Redirect WordPress inatteso durante la riconciliazione.");
      const text = await response.text();
      let entity;
      try { entity = text ? JSON.parse(text) : {}; }
      catch (error) { throw new Error(`Risposta WordPress non valida (HTTP ${response.status}).`, { cause: error }); }
      if (!response.ok) throw new Error(`WordPress: ${entity?.message || entity?.code || `HTTP ${response.status}`}`);
      if (Number(entity?.id) !== entityId) throw new Error("Identità WordPress incoerente durante la riconciliazione.");
      const result = classify(entity, exactFields, before, after);
      return res.json({ ok: true, readOnly: true, resource, id: entityId, fields: exactFields, ...result });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Riconciliazione WordPress non riuscita." });
    }
  });
}

export { registerRoutes, classify };
