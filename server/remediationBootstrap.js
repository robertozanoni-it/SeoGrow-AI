import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";
import { registerElementorImpactRoutesWithCoverage } from "./elementorCoverageRouteDecorator.js";

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
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const headers = requestHeaders(input, options);
    const userAgent = headers.get("user-agent") || "";
    const authorization = headers.get("authorization") || "";
    const isHttps = /^https:\/\//i.test(String(url || ""));
    const isSeoGrowRemediation = /seoGrowAI\/1\.4-(?:wordpress-remediation|frontend-verification)/i.test(userAgent);
    const isAuthenticatedWordPressRest = /^Basic\s+/i.test(authorization) && /\/wp-json\//i.test(String(url || ""));
    const needsPinning = isHttps && (isSeoGrowRemediation || isAuthenticatedWordPressRest);
    if (needsPinning) return pinnedHttpsFetch(url, options);
    return nativeFetch(input, options);
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
      ],
      liveMode: "single-explicit-approval",
      taxonomyMode: "single-field-explicit-approval-stale-safe",
      elementorImpactMode: "read-only-server-attested-coverage-no-shared-write",
      elementorPublicCoverageMode: "sitemap-crawl-reconciled-non-authoritative-no-shared-write",
      elementorCoverageAttestationMode: "connector-inventory-plus-public-coverage-exact-match-no-shared-write",
      elementorReferenceImpactMode: "connector-inventory-plus-rest-meta-read-only-page-post-fail-closed-custom-types",
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
