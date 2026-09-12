import { assertPublicObservation } from "./remediationEvidence.js";
import { flattenCorrectionSnapshot } from "./correctionReceipt.js";

const fields = {
  "meta.rank_math_title": { publicField: "title", label: "titolo SEO" },
  "meta._yoast_wpseo_title": { publicField: "title", label: "titolo SEO" },
  "meta.rank_math_description": { publicField: "metaDescription", label: "meta description" },
  "meta._yoast_wpseo_metadesc": { publicField: "metaDescription", label: "meta description" },
};
const normalizedText = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim();

export function metadataVerificationTarget(record) {
  const after = flattenCorrectionSnapshot(record?.after);
  const targets = Object.keys(fields).filter((field) => Object.prototype.hasOwnProperty.call(after, field));
  if (targets.length !== 1) return null;
  const field = targets[0];
  const expected = after[field];
  if (typeof expected !== "string" || !expected.trim()) return null;
  return { field, expected, ...fields[field] };
}

export function metadataVerificationPatch(record, response, at = new Date().toISOString()) {
  const target = metadataVerificationTarget(record);
  if (!target) throw new Error("Snapshot del meta SEO non disponibile o ambiguo: serve un nuovo audit.");
  assertPublicObservation(record, response);
  const countKey = target.publicField === "title" ? "titleCount" : "metaDescriptionCount";
  if (response[countKey] !== 1) throw new Error(`${target.label}: il controllo deve rilevare esattamente un tag nel codice HTML pubblico. Conteggio: ${response[countKey] ?? "non disponibile"}. Nessuna conferma presunta.`);
  const observed = response[target.publicField];
  if (typeof observed !== "string") throw new Error("Il controllo non ha restituito il valore del meta SEO; nessuna conferma presunta.");
  const exactMatch = normalizedText(observed) === normalizedText(target.expected);
  const caseOnlyMatch = !exactMatch && target.publicField === "title" && normalizedText(observed).toLocaleLowerCase("it") === normalizedText(target.expected).toLocaleLowerCase("it");
  const matches = exactMatch || caseOnlyMatch;
  return {
    status: "Da verificare",
    verifiedAt: "",
    frontendConfirmed: matches,
    titleCaseOnlyMatch: caseOnlyMatch,
    frontendFailure: !matches,
    lastVerificationAttemptAt: at,
    verificationNote: matches
      ? `Il valore di ${target.label} nel codice HTML pubblico coincide con quello inviato a WordPress.${caseOnlyMatch ? " Il plugin ha modificato soltanto maiuscole e minuscole del titolo." : ""} Per confermare la risoluzione SEO, inclusa l’assenza di duplicati, esegui un nuovo audit delle pagine coinvolte.`
      : `Il valore di ${target.label} sul sito non coincide con quello inviato a WordPress. Controlla cache e impostazioni del plugin SEO; la correzione non è confermata nel frontend.`,
    frontendSnapshot: { url: response.url, [target.publicField]: observed, field: target.field, expected: target.expected, checkedAt: at },
  };
}

export function requiresDuplicateAudit(record = {}) {
  const text = `${record.issueType || ""} ${record.issueLabel || ""} ${record.issue?.type || ""} ${record.issue?.label || ""}`;
  return /duplicate[-_ ](?:title|description)|(?:title|titolo|meta description|descrizione)\s+duplicat/i.test(text);
}
