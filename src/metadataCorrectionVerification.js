import { flattenCorrectionSnapshot } from "./correctionReceipt.js";

const fields = {
  "meta.rank_math_title": { publicField: "title", label: "titolo SEO" },
  "meta._yoast_wpseo_title": { publicField: "title", label: "titolo SEO" },
  "meta.rank_math_description": { publicField: "metaDescription", label: "meta description" },
  "meta._yoast_wpseo_metadesc": { publicField: "metaDescription", label: "meta description" },
};
const normalizedText = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const samePage = (left, right) => {
  try {
    const normalize = (value) => {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("URL non valida");
      url.hash = "";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      return url.href;
    };
    return normalize(left) === normalize(right);
  } catch { return false; }
};

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
  if (response?.ok !== true || response.isHtml !== true || Number(response.status) < 200 || Number(response.status) >= 300 || !Number.isFinite(Number(response.status))) {
    throw new Error("Il controllo non ha restituito una pagina HTML verificabile.");
  }
  if (!samePage(response.url, record.finalUrl || record.sourceUrl)) {
    throw new Error("La pagina pubblica controllata non coincide con la pagina della correzione.");
  }
  const expectedId = Number(record.entityId || record.wordpressId);
  const observedId = Number(response.wordpressDocumentId);
  if (expectedId > 0 && observedId > 0 && expectedId !== observedId) throw new Error("La pagina pubblica appartiene a una diversa risorsa WordPress.");
  const observed = response[target.publicField];
  if (typeof observed !== "string") throw new Error("Il controllo non ha restituito il valore del meta SEO; nessuna conferma presunta.");
  const matches = normalizedText(observed) === normalizedText(target.expected);
  return {
    status: "Da verificare",
    frontendConfirmed: matches,
    frontendFailure: !matches,
    lastVerificationAttemptAt: at,
    verificationNote: matches
      ? `Il valore di ${target.label} nel codice HTML pubblico coincide con quello inviato a WordPress. Per confermare la risoluzione SEO, inclusa l’assenza di duplicati, esegui un nuovo audit delle pagine coinvolte.`
      : `Il valore di ${target.label} sul sito non coincide con quello inviato a WordPress. Controlla cache e impostazioni del plugin SEO; la correzione non è confermata nel frontend.`,
    frontendSnapshot: { url: response.url, [target.publicField]: observed, field: target.field, expected: target.expected, checkedAt: at },
  };
}
