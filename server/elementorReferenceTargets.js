const MAX_REFERENCE_TARGETS = 20;

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export function referenceTargetIds(references) {
  const ids = new Set();
  for (const reference of Array.isArray(references) ? references : []) {
    const id = positiveInt(reference?.templateId);
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

export function validateElementorReferenceTargets(references, connectorPayload) {
  const entries = Array.isArray(references) ? references : [];
  const ids = referenceTargetIds(entries);
  if (ids.length === 0) {
    return {
      verified: true,
      status: "no-reference-targets",
      requestedTargets: 0,
      documents: [],
      sharedWriteAllowed: false,
    };
  }
  if (ids.length > MAX_REFERENCE_TARGETS) {
    return {
      verified: false,
      status: "reference-target-limit-exceeded",
      requestedTargets: ids.length,
      documents: [],
      sharedWriteAllowed: false,
    };
  }
  if (!connectorPayload || typeof connectorPayload !== "object" ||
      connectorPayload.ok !== true || connectorPayload.readOnly !== true ||
      connectorPayload.sharedWriteAllowed !== false || !Array.isArray(connectorPayload.documents)) {
    return {
      verified: false,
      status: "reference-target-contract-invalid",
      requestedTargets: ids.length,
      documents: [],
      sharedWriteAllowed: false,
    };
  }

  const normalized = [];
  for (const id of ids) {
    const matches = connectorPayload.documents.filter((row) => Number(row?.id) === id);
    if (matches.length !== 1) {
      return {
        verified: false,
        status: matches.length > 1 ? "reference-target-duplicate" : "reference-target-missing",
        requestedTargets: ids.length,
        documents: normalized,
        failedTargetId: id,
        sharedWriteAllowed: false,
      };
    }
    const row = matches[0];
    if (row?.ok !== true || row?.readOnly !== true || row?.sharedWriteAllowed !== false) {
      return {
        verified: false,
        status: "reference-target-unverified",
        requestedTargets: ids.length,
        documents: normalized,
        failedTargetId: id,
        sharedWriteAllowed: false,
      };
    }
    const type = String(row?.type || "").trim().toLowerCase();
    if (!type) {
      return {
        verified: false,
        status: "reference-target-type-missing",
        requestedTargets: ids.length,
        documents: normalized,
        failedTargetId: id,
        sharedWriteAllowed: false,
      };
    }
    const sourceKinds = [...new Set(entries
      .filter((entry) => Number(entry?.templateId) === id)
      .flatMap((entry) => Array.isArray(entry?.sources) ? entry.sources : [])
      .map((source) => String(source?.referenceKind || ""))
      .filter(Boolean))].sort();
    if (sourceKinds.includes("global-widget") && type !== "widget") {
      return {
        verified: false,
        status: "global-widget-type-mismatch",
        requestedTargets: ids.length,
        documents: normalized,
        failedTargetId: id,
        observedType: type,
        sharedWriteAllowed: false,
      };
    }
    normalized.push({
      id,
      type,
      title: String(row?.title || ""),
      status: String(row?.status || ""),
      link: String(row?.link || ""),
      sourceKinds,
      readOnly: true,
      sharedWriteAllowed: false,
    });
  }

  return {
    verified: normalized.length === ids.length,
    status: "reference-targets-verified",
    requestedTargets: ids.length,
    documents: normalized,
    sharedWriteAllowed: false,
  };
}

export const ELEMENTOR_REFERENCE_TARGET_LIMIT = MAX_REFERENCE_TARGETS;
