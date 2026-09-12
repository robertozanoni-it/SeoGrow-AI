// Evidence shared by every public-verification path. Missing data is not success.
export function exactPageKey(value, provenSameResource = false) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    if (provenSameResource) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return ""; }
}

export function assertPublicObservation(record, response) {
  const status = response?.status;
  if (response?.ok !== true || response.isHtml !== true ||
      typeof status !== "number" || !Number.isInteger(status) || status < 200 || status >= 300) {
    throw new Error("Il controllo non ha restituito una pagina HTML verificabile.");
  }
  const expectedId = Number(record.entityId || record.wordpressId);
  const observedId = Number(response.wordpressDocumentId);
  const sameResource = Number.isSafeInteger(expectedId) && expectedId > 0 && expectedId === observedId;
  const wanted = exactPageKey(record.finalUrl || record.sourceUrl, sameResource);
  if (!wanted || exactPageKey(response.url, sameResource) !== wanted) {
    throw new Error("La pagina pubblica controllata non coincide con la pagina della correzione; nessun alias presunto.");
  }
  if (expectedId > 0 && observedId > 0 && expectedId !== observedId) {
    throw new Error("La pagina pubblica appartiene a una diversa risorsa WordPress.");
  }
}

export function contentVerificationEvidence(record, data) {
  assertPublicObservation(record, data);
  const validCount = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const thresholdReached = data.pageKind !== "gdpr" && validCount(data.words) &&
    validCount(data.minimumWords) && data.minimumWords > 0 && data.words >= data.minimumWords;
  const modifiedContentVisible = data.contentProbeVisible === true;
  const qualityAccepted = record.editorialQuality?.publishable === true;
  const visibilitySafe = data.verificationSafe === true && data.requiresBrowserVerification === false;
  return { thresholdReached, modifiedContentVisible, qualityAccepted, visibilitySafe,
    fixed: thresholdReached && modifiedContentVisible && qualityAccepted && visibilitySafe };
}

export function verificationErrorPatch(record, error, prefix, at = new Date().toISOString()) {
  return {
    status: "Da verificare", frontendConfirmed: false, frontendFailure: true, verifiedAt: "",
    // Historical proof stays available, but is no longer presented as current.
    lastSuccessfulVerification: record.status === "Verificato" || record.frontendConfirmed === true
      ? { status: record.status, verifiedAt: record.verifiedAt || "", snapshot: record.frontendSnapshot || null }
      : record.lastSuccessfulVerification || null,
    verificationNote: `${prefix}: ${error.message}. Nessuna conferma attuale; snapshot prima/dopo conservati.`,
    lastVerificationErrorAt: at, lastVerificationAttemptAt: at,
  };
}

export function verifiedForAudit(record, auditAt) {
  if (record.status !== "Verificato" || record.writeConfirmed === false || record.frontendConfirmed === false) return false;
  const verifiedAt = Date.parse(record.verifiedAt || "");
  const observedAt = Date.parse(auditAt || "");
  return Number.isFinite(verifiedAt) && Number.isFinite(observedAt) && verifiedAt >= observedAt;
}
