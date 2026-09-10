const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const text = (value) => String(value || "").trim().toLocaleLowerCase("it");
const urlKey = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return ""; }
};

export function flattenCorrectionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const result = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "meta" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [metaKey, metaValue] of Object.entries(value)) result[`meta.${metaKey}`] = metaValue;
    } else result[key] = value;
  }
  return result;
}

export function correctionReceiptFields(record = {}) {
  const before = flattenCorrectionSnapshot(record.before);
  const after = flattenCorrectionSnapshot(record.after);
  const names = Array.isArray(record.fields) && record.fields.length
    ? record.fields
    : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return [...new Set(names)].filter((field) => typeof field === "string").map((field) => ({
    field,
    before: before[field],
    after: after[field],
    beforeAvailable: own(before, field),
    afterAvailable: own(after, field),
  }));
}

export function latestCorrectionForFocus(records, focus = {}) {
  const clientId = Number(focus.clientId);
  const wantedUrl = urlKey(focus.sourceUrl);
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || !wantedUrl) return null;
  const wantedType = text(focus.issueType);
  const wantedTitle = text(focus.title);
  if (!wantedType && !wantedTitle) return null;
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!record?.id || Number(record.clientId) !== clientId || urlKey(record.sourceUrl) !== wantedUrl) return false;
    return wantedType
      ? text(record.issueType || record.issue?.type) === wantedType
      : text(record.issueLabel || record.issue?.label) === wantedTitle;
  }).sort((a, b) => {
    // Verification of an old record must not make it the latest application.
    const time = (row) => Date.parse(row.appliedAt || row.createdAt || "") || 0;
    return time(b) - time(a);
  })[0] || null;
}

export function canVerifyReceipt(record) {
  return Boolean(record?.id && record.sourceUrl && record.writeConfirmed !== false &&
    ["Applicato", "Da verificare", "Verificato"].includes(record.status));
}

export function receiptAfterLabel(record) {
  if (record?.status === "Bloccato") return "Dopo — proposta non applicata";
  if (record?.status === "Esito incerto" || record?.writeConfirmed === false) return "Dopo — valore previsto, scrittura da confermare";
  if (record?.status === "Ripristinato") return "Dopo — modifica successivamente ripristinata";
  return "Dopo — valore inviato a WordPress";
}
