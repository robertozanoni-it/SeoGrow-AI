import { apiFetch } from "./api.js";

const COVERAGE_ATTESTATION_TTL_MS = 5 * 60_000;
const REFERENCE_IMPACT_TTL_MS = 5 * 60_000;
const coverageAttestationCache = new Map();
const referenceImpactCache = new Map();

const ownershipOf = (entity) => entity?._seogrowOwnership && typeof entity._seogrowOwnership === "object"
  ? entity._seogrowOwnership
  : {};

export function elementorSourceDocuments(entity) {
  const ownership = ownershipOf(entity);
  const resolved = Array.isArray(ownership.elementorResolvedSourceDocuments)
    ? ownership.elementorResolvedSourceDocuments
    : [];
  const rendered = Array.isArray(ownership.elementorExternalRenderedDocuments)
    ? ownership.elementorExternalRenderedDocuments
    : [];
  const local = Array.isArray(ownership.elementorLocalSourceReferences)
    ? ownership.elementorLocalSourceReferences
    : [];
  const rows = resolved.length ? resolved : [...rendered, ...local];
  const unique = new Map();
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const type = String(row?.type || "unknown").trim().toLowerCase() || "unknown";
    const origins = Array.isArray(row?.origins)
      ? row.origins
      : row?.origin ? [row.origin] : [];
    const previous = unique.get(id);
    if (!previous) unique.set(id, { id, type, origins: [...new Set(origins.map(String))] });
    else {
      previous.origins = [...new Set([...previous.origins, ...origins.map(String)])];
      if (previous.type === "unknown" && type !== "unknown") previous.type = type;
    }
  }
  return [...unique.values()].toSorted((a, b) => a.id - b.id || a.type.localeCompare(b.type));
}

const failedEvidence = (error) => ({
  ok: false,
  readOnly: true,
  sharedWriteAllowed: false,
  displayConditionsResolved: false,
  affectedPagesEnumerated: false,
  documents: [],
  error: error instanceof Error ? error.message : String(error || "Impact analysis Elementor non disponibile."),
});

const normalizeSuccessfulEvidence = (data) => {
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  const displayConditionsResolved = documents.length > 0 &&
    documents.every((row) => row?.ok === true && row?.displayConditionsResolved === true);
  const completeSiteEnumeration = data?.observedUrlCoverage?.completeSiteEnumeration === true;
  const affectedPagesEnumerated = data?.affectedPagesEnumerated === true &&
    completeSiteEnumeration &&
    displayConditionsResolved;
  return {
    ...(data && typeof data === "object" ? data : {}),
    documents,
    readOnly: true,
    sharedWriteAllowed: false,
    displayConditionsResolved,
    affectedPagesEnumerated,
  };
};

const normalizeReferenceImpact = (data) => {
  if (!data || typeof data !== "object" || data.readOnly !== true || data.sharedWriteAllowed !== false) {
    return {
      verified: false,
      readOnly: true,
      sharedWriteAllowed: false,
      affectedPagesEnumerated: false,
      status: "reference-impact-contract-invalid",
      impact: null,
      referenceTargets: null,
    };
  }
  const targetVerified = data?.referenceTargets?.verified === true;
  const complete = data?.impact?.complete === true;
  return {
    ...data,
    readOnly: true,
    sharedWriteAllowed: false,
    verified: data.verified === true && complete && targetVerified,
    affectedPagesEnumerated: data.affectedPagesEnumerated === true && complete && targetVerified,
  };
};

const normalizeCoverageProofForRequest = (coverageProof) => {
  if (!coverageProof || typeof coverageProof !== "object" || Array.isArray(coverageProof)) {
    return { source: "manual-candidate-set", complete: false, verified: false };
  }
  return {
    source: String(coverageProof.source || "manual-candidate-set"),
    totalUrls: Number.isSafeInteger(Number(coverageProof.totalUrls)) ? Number(coverageProof.totalUrls) : undefined,
    complete: coverageProof.complete === true,
    verified: coverageProof.verified === true,
    provenanceId: String(coverageProof.provenanceId || "").slice(0, 200),
  };
};

const coverageCredentialKey = (credentials) => [
  String(credentials?.url || "").trim(),
  String(credentials?.username || "").trim(),
].join("|");

const coverageDiagnosticReason = (data) =>
  data?.error || data?.reconciliation?.reason || data?.inventory?.reason || data?.publicCoverage?.reconciliation?.reason || data?.publicCoverage?.note || "Coverage Elementor non attestabile con le prove disponibili.";

async function loadElementorCoverageAttestation(credentials, { force = false } = {}) {
  const url = String(credentials?.url || "").trim();
  const username = String(credentials?.username || "").trim();
  const applicationPassword = String(credentials?.applicationPassword || "");
  if (!url || !username || !applicationPassword) {
    return { verified: false, candidateUrls: [], coverageProof: null, error: "Collega WordPress prima di verificare la coverage Elementor." };
  }

  const key = coverageCredentialKey(credentials);
  const now = Date.now();
  if (force) coverageAttestationCache.delete(key);
  const cached = coverageAttestationCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = (async () => {
    try {
      const response = await apiFetch("/api/wordpress/elementor-coverage-attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteUrl: url,
          username,
          applicationPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.verified !== true) {
        return {
          ...(data && typeof data === "object" ? data : {}),
          verified: false,
          candidateUrls: [],
          coverageProof: null,
          error: coverageDiagnosticReason(data),
        };
      }
      const candidateUrls = Array.isArray(data?.candidateUrls) ? data.candidateUrls : [];
      const totalUrls = Number(data?.totalUrls);
      const provenanceId = String(data?.provenanceId || "").trim();
      if (!candidateUrls.length || !Number.isSafeInteger(totalUrls) || totalUrls !== candidateUrls.length || !provenanceId) {
        return {
          ...data,
          verified: false,
          candidateUrls: [],
          coverageProof: null,
          error: "Attestazione Elementor ricevuta ma set URL/provenienza non coerenti.",
        };
      }
      return {
        ...data,
        verified: true,
        candidateUrls,
        coverageProof: {
          source: "verified-complete-crawl",
          totalUrls,
          complete: true,
          verified: true,
          provenanceId,
        },
        expiresAt: Number(data?.expiresAt) || 0,
        error: "",
      };
    } catch (error) {
      return {
        verified: false,
        candidateUrls: [],
        coverageProof: null,
        error: error instanceof Error ? error.message : "Coverage Elementor non disponibile.",
      };
    }
  })();

  coverageAttestationCache.set(key, { promise, expiresAt: now + COVERAGE_ATTESTATION_TTL_MS });
  return promise;
}

export async function inspectElementorCoverageAttestation(credentials, options = {}) {
  return loadElementorCoverageAttestation(credentials, options);
}

export async function requestElementorCoverageAttestation(credentials, options = {}) {
  const diagnostic = await loadElementorCoverageAttestation(credentials, options);
  if (diagnostic?.verified !== true) return null;
  return {
    candidateUrls: diagnostic.candidateUrls,
    coverageProof: diagnostic.coverageProof,
    expiresAt: diagnostic.expiresAt,
  };
}

export async function requestElementorReferenceImpact(credentials) {
  const url = String(credentials?.url || "").trim();
  const username = String(credentials?.username || "").trim();
  const applicationPassword = String(credentials?.applicationPassword || "");
  if (!url || !username || !applicationPassword) return null;

  const key = coverageCredentialKey(credentials);
  const now = Date.now();
  const cached = referenceImpactCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = (async () => {
    try {
      const response = await apiFetch("/api/wordpress/elementor-reference-impact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteUrl: url,
          username,
          applicationPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) return null;
      return normalizeReferenceImpact(data);
    } catch {
      return null;
    }
  })();

  referenceImpactCache.set(key, { promise, expiresAt: now + REFERENCE_IMPACT_TTL_MS });
  return promise;
}

export async function inspectElementorImpactEvidence(entity, credentials, candidateUrls = [], coverageProof = null) {
  const documents = elementorSourceDocuments(entity);
  if (!documents.length) return null;
  try {
    let effectiveCandidateUrls = Array.isArray(candidateUrls) ? candidateUrls : [];
    let effectiveCoverageProof = coverageProof;
    if (!effectiveCoverageProof) {
      const attested = await requestElementorCoverageAttestation(credentials);
      if (attested) {
        effectiveCandidateUrls = attested.candidateUrls;
        effectiveCoverageProof = attested.coverageProof;
      }
    }

    const needsReferenceImpact = documents.some((document) => ["template", "widget"].includes(document.type));
    const [response, crossPageReferenceImpact] = await Promise.all([
      apiFetch("/api/wordpress/elementor-impact-inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteUrl: credentials?.url || "",
          username: credentials?.username || "",
          applicationPassword: credentials?.applicationPassword || "",
          targetEntity: {
            id: Number(entity?.id),
            type: String(entity?.type || "").trim().toLowerCase(),
          },
          documents,
          candidateUrls: effectiveCandidateUrls,
          coverageProof: normalizeCoverageProofForRequest(effectiveCoverageProof),
        }),
      }),
      needsReferenceImpact ? requestElementorReferenceImpact(credentials) : Promise.resolve(null),
    ]);
    const data = await response.json();
    if (!response.ok) return failedEvidence(data?.error || "Impact analysis Elementor non disponibile.");
    return {
      ...normalizeSuccessfulEvidence(data),
      ...(crossPageReferenceImpact ? { crossPageReferenceImpact } : {}),
    };
  } catch (error) {
    // L'impact analysis è diagnostica read-only: un timeout/rete non deve mai
    // trasformarsi in autorizzazione implicita né nascondere il blocco ownership.
    return failedEvidence(error);
  }
}

export function attachElementorImpactEvidence(entity, evidence) {
  if (!entity || typeof entity !== "object" || !evidence) return entity;
  const current = ownershipOf(entity);
  entity._seogrowOwnership = {
    ...current,
    elementorImpactEvidence: evidence,
  };
  return entity;
}

export function elementorOwnershipDetail(entity) {
  const ownership = ownershipOf(entity);
  const impactEvidence = ownership.elementorImpactEvidence && typeof ownership.elementorImpactEvidence === "object"
    ? ownership.elementorImpactEvidence
    : null;
  const conditionRows = Array.isArray(impactEvidence?.documents) ? impactEvidence.documents : [];
  const conditionById = new Map(conditionRows.map((row) => [Number(row?.id), row]));
  const crossPage = impactEvidence?.crossPageReferenceImpact;
  const referenceRows = Array.isArray(crossPage?.impact?.references) ? crossPage.impact.references : [];
  const referenceById = new Map(referenceRows.map((row) => [Number(row?.templateId), row]));
  const resolved = Array.isArray(ownership.elementorResolvedSourceDocuments)
    ? ownership.elementorResolvedSourceDocuments.filter((item) => item?.resolved === true)
    : [];
  const rendered = Array.isArray(ownership.elementorExternalRenderedDocuments)
    ? ownership.elementorExternalRenderedDocuments
    : [];
  const local = Array.isArray(ownership.elementorLocalSourceReferences)
    ? ownership.elementorLocalSourceReferences
    : [];
  const sources = resolved.length ? resolved : [...rendered, ...local];

  if (sources.length) {
    const labels = sources.slice(0, 6).map((item) => {
      const type = String(item?.type || "documento");
      const id = Number(item?.id);
      const title = String(item?.title || "").trim();
      const condition = Number.isSafeInteger(id) ? conditionById.get(id) : null;
      const reference = Number.isSafeInteger(id) ? referenceById.get(id) : null;
      const observedCount = Number(condition?.observedRenderedCount || 0);
      const targetApplicability = String(condition?.conditionInterpretation?.targetApplicability || condition?.targetApplicability || "unknown");
      const conditionLabel = condition?.ok && condition?.displayConditionsResolved && targetApplicability === "applies"
        ? " · condizioni confermano applicazione sulla risorsa target"
        : condition?.ok && condition?.displayConditionsResolved && targetApplicability === "excluded"
          ? " · condizioni escludono la risorsa target"
          : condition?.ok && condition?.displayConditionsResolved && targetApplicability === "not-applied"
            ? " · condizioni non includono la risorsa target"
            : condition?.ok && condition?.displayConditionsResolved && condition?.conditionInterpretation?.entireSiteIncluded
              ? " · ambito intero sito confermato"
              : condition?.ok && condition?.conditionsObserved
                ? " · condizioni lette (semantica parziale/da verificare)"
                : condition?.ok
                  ? " · condizioni non esposte"
                  : condition?.error
                    ? " · condizioni non verificabili"
                    : "";
      const observedLabel = observedCount > 0 ? ` · osservato su ${observedCount} URL del crawl disponibile` : "";
      const referenceLabel = reference && crossPage?.verified === true
        ? ` · riferimento cross-page verificato in ${Array.isArray(reference.sources) ? reference.sources.length : 0} risorse WordPress`
        : ["template", "widget"].includes(type) && crossPage
          ? " · impatto cross-page non completamente verificato"
          : "";
      return `${type}${Number.isSafeInteger(id) ? ` #${id}` : ""}${title ? ` “${title}”` : ""}${conditionLabel}${observedLabel}${referenceLabel}`;
    });
    const coverage = impactEvidence?.observedUrlCoverage;
    const coverageNote = coverage?.inspected > 0
      ? coverage?.completeSiteEnumeration === true && impactEvidence?.affectedPagesEnumerated === true
        ? ` Sono state controllate tutte le ${coverage.inspected} URL dichiarate come enumerazione completa del sito, senza promuovere questa evidenza a permesso di scrittura condivisa.`
        : ` Sono state controllate ${coverage.inspected} URL candidate${coverage.failed ? `; ${coverage.failed} non verificabili` : ""}. Questo non equivale a una enumerazione completa del sito.`
      : "";
    const referenceNote = crossPage
      ? crossPage.verified === true
        ? " La scansione cross-page delle risorse WordPress e dei documenti Elementor referenziati è verificata in sola lettura."
        : ` La scansione cross-page resta incompleta (${crossPage.status || "stato non disponibile"}).`
      : "";
    const targetNote = impactEvidence?.targetApplicabilityResolved
      ? " L'applicazione alla risorsa WordPress target è stata valutata per tutte le condizioni del sottoinsieme supportato."
      : "";
    const evidenceNote = impactEvidence?.ok === false
      ? ` La lettura read-only delle condizioni non è riuscita: ${impactEvidence.error}`
      : impactEvidence?.displayConditionsResolved
        ? impactEvidence?.affectedPagesEnumerated === true
          ? ` La semantica delle condizioni note e l'enumerazione completa dichiarata delle URL risultano risolte.${targetNote}${coverageNote}${referenceNote}`
          : ` La semantica delle condizioni note è risolta per il sottoinsieme supportato, ma il raggio completo sulle URL non è enumerato.${targetNote}${coverageNote}${referenceNote}`
        : impactEvidence
          ? ` Le condizioni disponibili sono state lette in sola lettura; le regole non riconosciute restano semanticamente non risolte.${coverageNote}${referenceNote}`
          : " Le Display Conditions e il raggio sulle altre URL non sono ancora dimostrati.";
    return `Il frontend della URL usa anche documenti Elementor condivisi: ${labels.join(", ")}. SeoGrow ha identificato l'ownership esterna ma non modifica automaticamente un template condiviso senza analizzarne l'impatto sulle altre pagine.${evidenceNote}`;
  }

  if (ownership.elementorEvidenceStatus === "shared-templates-present-unresolved") {
    const types = Array.isArray(ownership.elementorSharedTemplateTypes) ? ownership.elementorSharedTemplateTypes : [];
    return `Nel sito risultano template Elementor condivisi${types.length ? ` (${types.join(", ")})` : ""}, ma il documento sorgente applicato a questa URL non è stato identificato con certezza.`;
  }
  return "La pagina contiene ownership Elementor locale o condivisa che non può essere attribuita con certezza a un singolo widget modificabile.";
}
