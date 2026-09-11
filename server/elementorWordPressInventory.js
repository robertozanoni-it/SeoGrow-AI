const MAX_AUTHORITATIVE_RESOURCES = 2000;
const ALLOWED_STATUSES = new Set(["publish"]);
const NON_PUBLIC_FRONTEND_POST_TYPES = new Set(["elementor_library", "e-floating-buttons", "attachment"]);

const normalizedHost = (hostname) => String(hostname || "").toLowerCase().replace(/^www\./, "");

function normalizePublicUrl(value, siteUrl) {
  try {
    const site = new URL(String(siteUrl || ""));
    const url = new URL(String(value || ""), site);
    if (url.protocol !== "https:") return "";
    if (normalizedHost(url.hostname) !== normalizedHost(site.hostname)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function comparisonKey(value, siteUrl) {
  const normalized = normalizePublicUrl(value, siteUrl);
  if (!normalized) return "";
  const url = new URL(normalized);
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  url.hostname = normalizedHost(url.hostname);
  url.searchParams.sort();
  return `${url.origin}${url.pathname}${url.search}`;
}

function safePositiveInt(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalizeResource(item, siteUrl) {
  if (!item || typeof item !== "object") return null;
  const id = safePositiveInt(item.id);
  const postType = String(item.postType || "").trim().toLowerCase().slice(0, 80);
  const status = String(item.status || "").trim().toLowerCase();
  const url = normalizePublicUrl(item.url, siteUrl);
  if (!id || !postType || !ALLOWED_STATUSES.has(status) || !url) return null;
  return { id, postType, status, url };
}

export function coverageRelevantInventoryResources(inventory) {
  return (Array.isArray(inventory?.resources) ? inventory.resources : [])
    .filter((item) => item && !NON_PUBLIC_FRONTEND_POST_TYPES.has(String(item.postType || "").toLowerCase()));
}

export function validateAuthoritativeWordPressInventory(payload, { siteUrl, maxResources = MAX_AUTHORITATIVE_RESOURCES } = {}) {
  const source = String(payload?.source || "");
  const readOnly = payload?.readOnly === true;
  const complete = payload?.complete === true;
  const truncated = payload?.truncated === true;
  const connectorVersion = String(payload?.connectorVersion || "").trim();
  const inventoryScope = String(payload?.inventoryScope || "");
  const total = safePositiveInt(payload?.totalResources);
  const rawResources = Array.isArray(payload?.resources) ? payload.resources : [];
  const limit = Number.isSafeInteger(Number(maxResources)) && Number(maxResources) > 0
    ? Number(maxResources)
    : MAX_AUTHORITATIVE_RESOURCES;

  const resources = [];
  const identityKeys = new Set();
  let invalidResources = 0;
  let duplicateResources = 0;
  for (const raw of rawResources) {
    const item = normalizeResource(raw, siteUrl);
    if (!item) {
      invalidResources += 1;
      continue;
    }
    const key = `${item.postType}:${item.id}`;
    if (identityKeys.has(key)) {
      duplicateResources += 1;
      continue;
    }
    identityKeys.add(key);
    resources.push(item);
  }

  const contractTrusted =
    source === "seogrow-connector" &&
    readOnly &&
    inventoryScope === "all-public-queryable-post-types" &&
    /^1\.3(?:\.|$)/.test(connectorVersion);
  const overLimit = rawResources.length > limit || (total !== null && total > limit);
  const countMatches = total !== null && total === rawResources.length && resources.length === rawResources.length;
  const verified =
    contractTrusted &&
    complete &&
    !truncated &&
    !overLimit &&
    invalidResources === 0 &&
    duplicateResources === 0 &&
    countMatches &&
    resources.length > 0;

  let status = "invalid-contract";
  let reason = "Il payload non proviene da un contratto Connector autorevole e read-only supportato.";
  if (contractTrusted && (truncated || overLimit)) {
    status = "truncated";
    reason = "L’inventario WordPress supera il limite supportato o risulta troncato.";
  } else if (contractTrusted && !complete) {
    status = "incomplete";
    reason = "Il Connector non dichiara completo l’inventario WordPress.";
  } else if (contractTrusted && (invalidResources > 0 || duplicateResources > 0)) {
    status = "invalid-resources";
    reason = "L’inventario contiene risorse non valide o identità duplicate.";
  } else if (contractTrusted && !countMatches) {
    status = "count-mismatch";
    reason = "Il totale dichiarato non coincide esattamente con le risorse restituite.";
  } else if (verified) {
    status = "verified-authoritative";
    reason = "Il Connector ha restituito un inventario completo, read-only e coerente delle risorse pubbliche WordPress supportate.";
  }

  return {
    verified,
    authoritative: verified,
    status,
    reason,
    source,
    connectorVersion,
    inventoryScope,
    complete,
    truncated: truncated || overLimit,
    totalResources: total,
    resources,
    invalidResources,
    duplicateResources,
    countMatches,
    maxResources: limit,
    sharedWriteAllowed: false,
  };
}

export function reconcileAuthoritativeInventoryWithPublicCoverage(inventory, publicCoverage) {
  if (inventory?.verified !== true || publicCoverage?.publicCoverageReconciled !== true) {
    return {
      verified: false,
      status: "evidence-incomplete",
      reason: "Servono sia inventario WordPress autorevole sia coverage pubblica riconciliata.",
      publicUrlsOutsideInventory: [],
      inventoryUrlsMissingFromPublicCoverage: [],
      sharedWriteAllowed: false,
    };
  }

  const siteUrl = publicCoverage?.siteUrl || inventory?.resources?.[0]?.url || "";
  const relevantResources = coverageRelevantInventoryResources(inventory);
  const inventoryByKey = new Map(relevantResources.map((item) => [comparisonKey(item.url, siteUrl), item.url]));
  const coverageSource = Array.isArray(publicCoverage.coverageUrls) && publicCoverage.coverageUrls.length
    ? publicCoverage.coverageUrls
    : Array.isArray(publicCoverage.crawledUrls) && publicCoverage.crawledUrls.length
      ? publicCoverage.crawledUrls
      : Array.isArray(publicCoverage.sitemapUrls)
        ? publicCoverage.sitemapUrls
        : [];
  const publicByKey = new Map(coverageSource.map((url) => [comparisonKey(url, siteUrl), url]));

  const publicUrlsOutsideInventory = [...publicByKey.entries()]
    .filter(([key]) => key && !inventoryByKey.has(key))
    .map(([, url]) => url)
    .toSorted();
  const inventoryUrlsMissingFromPublicCoverage = [...inventoryByKey.entries()]
    .filter(([key]) => key && !publicByKey.has(key))
    .map(([, url]) => url)
    .toSorted();

  const verified = publicByKey.size > 0 && inventoryUrlsMissingFromPublicCoverage.length === 0;

  let status = verified ? "verified-complete" : "inventory-routes-missing-from-public-coverage";
  let reason = verified
    ? "Inventario WordPress rilevante per il frontend e coverage pubblica ispezionata sono riconciliati."
    : "Una o più risorse WordPress pubblicate rilevanti per il frontend non compaiono nella coverage pubblica ispezionata.";
  if (verified && publicUrlsOutsideInventory.length > 0) {
    status = "verified-public-superset";
    reason = "La coverage pubblica verificata include anche route non appartenenti ai contenuti WordPress frontend o pagine HTML aggiuntive scoperte dal crawl. Sono già comprese nel set controllato.";
  }

  return {
    verified,
    status,
    reason,
    totalUrls: publicByKey.size,
    publicUrlCount: publicByKey.size,
    publicUrlsOutsideInventory,
    inventoryUrlsMissingFromPublicCoverage,
    excludedInventoryPostTypes: [...NON_PUBLIC_FRONTEND_POST_TYPES].toSorted(),
    relevantInventoryResources: relevantResources.length,
    scope: {
      inventory: "public-frontend-content-resources",
      publicCoverage: "sitemap-and-recursive-html-crawl-public-routes",
      globallyComplete: verified,
      publicSuperset: publicUrlsOutsideInventory.length > 0,
    },
    sharedWriteAllowed: false,
  };
}

export { MAX_AUTHORITATIVE_RESOURCES as ELEMENTOR_AUTHORITATIVE_INVENTORY_MAX_RESOURCES };
