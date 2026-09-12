import { hydrateLocalProviderEnv } from "./providerEnv.js";
import {
  openAiCompatibleProvider,
  rewriteOpenAiApiUrl,
  rewriteOpenAiCompatibleRequestBody,
} from "./openAiCompatibleEndpoint.js";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";
import { registerElementorImpactRoutesWithCoverage } from "./elementorCoverageRouteDecorator.js";

const providerEnv = hydrateLocalProviderEnv();
if (providerEnv.imported) {
  console.log("SeoGrow: configurazione AI locale riutilizzata in memoria dalla installazione principale.");
}
if (providerEnv.configured) {
  try {
    console.log(`SeoGrow: provider AI attivo ${openAiCompatibleProvider()}.`);
  } catch (error) {
    console.warn(`SeoGrow: configurazione provider AI non valida: ${error.message || error}`);
  }
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const requestHeaders = (input, options) => {
  try {
    return new Headers(options.headers || input?.headers || {});
  } catch {
    return new Headers();
  }
};

if (!globalThis.fetch.__seogrowPinnedRemediation) {
  const guardedFetch = async (input, options = {}) => {
    const originalUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    let url = String(originalUrl || "");
    let routedOptions = options;
    try {
      url = rewriteOpenAiApiUrl(url);
      const rewrittenBody = rewriteOpenAiCompatibleRequestBody(options?.body);
      if (rewrittenBody !== options?.body) routedOptions = { ...options, body: rewrittenBody };
    } catch (error) {
      throw new Error(`Configurazione provider AI non valida: ${error.message || error}`, { cause: error });
    }

    const headers = requestHeaders(input, routedOptions);
    const userAgent = headers.get("user-agent") || "";
    const authorization = headers.get("authorization") || "";
    const isHttps = /^https:\/\//i.test(url);
    const isSeoGrowRemediation = /seoGrowAI\/1\.4-(?:wordpress-remediation|frontend-verification)/i.test(userAgent);
    const isAuthenticatedWordPressRest = /^Basic\s+/i.test(authorization) && /\/wp-json\//i.test(url);
    const needsPinning = isHttps && (isSeoGrowRemediation || isAuthenticatedWordPressRest);

    const routedInput = url !== originalUrl
      ? (typeof Request !== "undefined" && input instanceof Request ? new Request(url, input) : url)
      : input;

    if (needsPinning) return pinnedHttpsFetch(url, routedOptions);
    return nativeFetch(routedInput, routedOptions);
  };
  guardedFetch.__seogrowPinnedRemediation = true;
  globalThis.fetch = guardedFetch;
}

const remediationModules = await Promise.all([
  import("./wordpressConnectionHook.js"),
  import("./wordpressLiveApprovalHook.js"),
  import("./wordpressLiveRollbackHook.js"),
  import("./wordpressSeoAdapterV2Hook.js"),
  import("./frontendVerificationHook.js"),
  import("./wordpressInspectFastHook.js"),
  import("./elementorImpactHook.js"),
  import("./wordpressTaxonomyHook.js"),
  import("./wordpressPatchV2Hook.js"),
  import("./elementorPublicCoverageHook.js"),
  import("./elementorCoverageAttestationHook.js"),
  import("./elementorReferenceImpactHook.js"),
  import("./wordpressWriteReconciliationHook.js"),
  import("./providerBudgetConfigHook.js"),
  import("./linkEvidenceHook.js"),
]);

const ELEMENTOR_IMPACT_MODULE_INDEX = 6;
const ROUTES_ATTACHED = Symbol.for("seogrow.remediationRoutesAttached");

export function registerRemediationRoutes(app) {
  if (!app || typeof app.post !== "function") throw new Error("Express app non valida per le route remediation.");
  if (app[ROUTES_ATTACHED]) return;
  app[ROUTES_ATTACHED] = true;

  app.get("/api/wordpress/remediation-capabilities", (_req, res) => {
    res.json({
      ok: true,
      engine: "v2",
      supports: [
        "connection-check",
        "inspect",
        "inspect-fast",
        "inspect-taxonomy",
        "elementor-impact-read-only",
        "elementor-impact-server-attested-coverage",
        "elementor-public-coverage-read-only",
        "wordpress-public-inventory-read-only",
        "elementor-coverage-attestation",
        "elementor-reference-impact-read-only",
        "frontend-link-evidence-read-only",
        "taxonomy-preview",
        "taxonomy-apply",
        "taxonomy-rollback-preview",
        "taxonomy-verify",
        "frontend-verification",
        "patch-v2",
        "seo-value-v2",
        "live-preview",
        "live-apply",
        "live-rollback",
        "write-reconciliation-read-only",
        "provider-budget-status",
        "openai-compatible-provider-routing",
      ],
      aiProvider: (() => { try { return openAiCompatibleProvider(); } catch { return "invalid"; } })(),
      liveMode: "single-explicit-approval",
      taxonomyMode: "single-field-explicit-approval-stale-safe",
      elementorImpactMode: "read-only-server-attested-coverage-no-shared-write",
      elementorPublicCoverageMode: "sitemap-crawl-reconciled-non-authoritative-no-shared-write",
      elementorCoverageAttestationMode: "connector-inventory-plus-public-coverage-exact-match-no-shared-write",
      elementorReferenceImpactMode: "connector-inventory-plus-rest-meta-read-only-page-post-fail-closed-custom-types",
      linkEvidenceMode: "read-only-source-anchor-target-evidence",
      writeReconciliationMode: "read-only-exact-before-after-classification-core-fields",
      taxonomyConnectorMinimum: "1.3.0",
      elementorInventoryConnectorMinimum: "1.3.0",
      elementorReferenceImpactConnectorMinimum: "1.3.0",
      draftCopyCompatibility: false,
    });
  });

  for (const [index, module] of remediationModules.entries()) {
    if (typeof module.registerRoutes !== "function") continue;
    if (index === ELEMENTOR_IMPACT_MODULE_INDEX) {
      registerElementorImpactRoutesWithCoverage(app, module);
      continue;
    }
    module.registerRoutes(app);
  }
}

export const explicitRemediationRouteModules = remediationModules
  .filter((module) => typeof module.registerRoutes === "function")
  .length;