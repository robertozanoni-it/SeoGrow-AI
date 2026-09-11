export function observedNumber(value) {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  if (!["number", "string"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function observedPageCount(audit = {}) {
  const explicit = observedNumber(audit.pagesChecked);
  if (explicit !== null && Number.isSafeInteger(explicit)) return explicit;
  if (Array.isArray(audit.pages)) return audit.pages.length;
  return null;
}
export function observedScoreDelta(current, previous) {
  const score = observedNumber(current?.score), old = observedNumber(previous?.score);
  return score !== null && old !== null && score <= 100 && old <= 100 ? score - old : null;
}
