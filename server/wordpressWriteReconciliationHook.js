import { isDeepStrictEqual } from "node:util";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";

const HOOKED = Symbol.for("seogrow.wordpressWriteReconciliationHook");

function wordpressBase(input) {
  const url = new URL(String(input || ""));
  if (url.protocol !== "https:") throw new Error("WordPress deve usare HTTPS.");
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

      const base = wordpressBase(siteUrl || targetUrl);
      const response = await pinnedHttpsFetch(
        new URL(`wp-json/wp/v2/${resource}/${entityId}?context=edit`, base),
        {
          headers: headers(username, applicationPassword),
          timeout: 20_000,
          maxBytes: 2 * 1024 * 1024,
        },
      );
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
