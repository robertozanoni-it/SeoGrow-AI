import { runPostWriteSampler } from "./wordpress-taxonomy-postwrite-sampler.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
let pendingRankMathWrite = null;

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url || "";
}

function parseBody(init) {
  try { return typeof init?.body === "string" ? JSON.parse(init.body) : {}; }
  catch { return {}; }
}

globalThis.fetch = async (input, init = {}) => {
  const url = requestUrl(input);
  const method = String(init?.method || "GET").toUpperCase();

  if (method === "POST" && url === `${appUrl}/api/wordpress/taxonomy-verify` && pendingRankMathWrite) {
    const body = parseBody(init);
    if (body?.adapter === "rank-math" && body?.expected === pendingRankMathWrite.marker && body?.url) {
      console.warn("\n[SeoGrow] POSTWRITE READ-ONLY SAMPLER: campiono lo stato Rank Math prima della prima taxonomy-verify e prima di qualsiasi recovery/rollback.");
      try {
        await runPostWriteSampler({
          nativeFetch,
          appUrl,
          siteUrl,
          username,
          applicationPassword,
          targetUrl: body.url,
          marker: pendingRankMathWrite.marker,
          original: pendingRankMathWrite.original,
          label: pendingRankMathWrite.label || "taxonomy",
        });
      } catch (error) {
        console.error(`[SeoGrow] POSTWRITE_SAMPLER_FAILED: ${error.message}`);
      } finally {
        pendingRankMathWrite = null;
      }
    }
  }

  const response = await nativeFetch(input, init);

  if (method === "POST" && url === `${appUrl}/api/wordpress/taxonomy-apply` && response.ok) {
    try {
      const data = await response.clone().json();
      const after = String(data?.after ?? "");
      if (data?.adapter === "rank-math" && /^SeoGrow E2E\b/i.test(after)) {
        pendingRankMathWrite = {
          marker: after,
          original: String(data?.before ?? ""),
          label: /\btag\b/i.test(after) ? "tag" : "categoria",
        };
        console.warn("[SeoGrow] Apply Rank Math osservato: la prima riverifica sarà preceduta da tre snapshot read-only cross-request.");
      }
    } catch {
      // La risposta originale resta invariata; l'osservatore non modifica il contratto E2E.
    }
  }

  return response;
};

await import("./wordpress-taxonomy-e2e.mjs");
