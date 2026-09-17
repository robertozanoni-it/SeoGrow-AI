import { safeHttpHref, normalizeHttpUrl } from "./reliabilityModel.js";
import { remediationIssueKind } from "./remediationIssueKind.js";

const brokenTarget = record => record?.issue?.targetUrl || record?.issue?.brokenUrl || record?.brokenTargetUrl || record?.targetUrl || "";
const serpWidthFinding = problem => String(problem?.issueType || "").trim().toLowerCase() === "description-serp-width";
const directReviewKinds = new Set(["title", "meta_description", "h1", "content", "excerpt", "external_link"]);
const intentKinds = new Set(["canonical", "noindex"]);
const kindOf = problem => remediationIssueKind({ type: problem?.issueType, issueType: problem?.issueType, label: problem?.title, title: problem?.title, detail: problem?.detail });

export function correctionMatchesProblem(problem, correction) {
  if (!problem || !correction || String(problem.issueType || "").toLowerCase() !== String(correction.issueType || "").toLowerCase()) return false;
  const source = normalizeHttpUrl(problem.sourceUrl || "", { stripSlash: false });
  if (!source || source !== normalizeHttpUrl(correction.sourceUrl || "", { stripSlash: false })) return false;
  if (/broken-(?:external-)?link/i.test(problem.issueType)) return problem.targetUrls?.length === 1 && problem.targetUrls[0] === brokenTarget(correction);
  return true;
}

// Safe next actions, ordered by: existing write verification -> freshness -> automatic/approval -> human intent -> manual.
export function resolutionPath(problem = {}, correction = null) {
  const type = `${problem.issueType || ""} ${problem.title || ""}`.toLowerCase();
  const kind = kindOf(problem);
  if (/esito incerto|uncertain/i.test(String(correction?.status || "")) || /lost.response|recovery/i.test(type)) return { action: "history", label: "Controlla esito e ripristino", title: "Verifica la scrittura precedente", instructions: "Confronta lo stato attuale con Prima e Dopo nello storico. Non ripetere la scrittura finché l’esito non è determinato; se necessario usa il ripristino controllato." };
  if (["applied", "verified"].includes(problem.interventionState) || problem.problemState === "resolved") return { action: "verify", label: "Verifica risultato", title: "Conferma il risultato, non riscrivere", instructions: "Riverifica la correzione collegata. Per duplicati di title o description serve anche un nuovo crawl: la sola scrittura non prova l’unicità." };
  if (problem.stale) return { action: "audit", label: "Aggiorna audit", title: "Aggiorna la rilevazione obsoleta", instructions: "Riesegui l’audit della pagina indicata. Conserva lo storico: un finding vecchio non autorizza una nuova modifica né una proposta da approvare." };
  if (problem.reviewOnly === true && problem.problemState === "needs_verification") {
    if (serpWidthFinding(problem)) return { action: "prepare", label: "Prepara correzione", title: "Genera una meta description più compatta", instructions: "SeoGrow può preparare una proposta più corta usando il contenuto reale della pagina. La proposta deve rispettare il limite caratteri e rientrare nella stima SERP; nessuna scrittura avviene senza Prima/Dopo e approvazione." };
    if (intentKinds.has(kind)) return { action: "confirm", label: "Prepara correzione", title: kind === "canonical" ? "Conferma la canonical desiderata" : "Conferma l’intento di indicizzazione", instructions: kind === "canonical" ? "Conferma che questa URL debba essere la versione canonica pubblica. Dopo la conferma SeoGrow prepara la modifica e mostra il Prima/Dopo prima dell’approvazione." : "Conferma che questa pagina debba essere indicizzabile. Dopo la conferma SeoGrow prepara la modifica e mostra il Prima/Dopo prima dell’approvazione." };
    if (directReviewKinds.has(kind) && safeHttpHref(problem.sourceUrl) && !problem.ownershipBlocked) return { action: "prepare", label: "Prepara correzione", title: "Prepara una correzione controllata", instructions: "SeoGrow può preparare una proposta sul campo verificato. La modifica resta separata dal finding e richiede sempre Prima/Dopo e approvazione." };
    if (/url-alias|redirect/.test(type)) return { action: "audit", label: "Verifica URL e indicizzazione", title: "Conferma quale URL deve essere pubblica", instructions: "Riesegui l’audit della singola pagina e confronta URL finale, canonical e redirect. Finché l’intento non è chiaro SeoGrow non sceglie automaticamente una destinazione." };
    return { action: "manual", label: "Richiede intervento manuale", title: "Conferma il segnale e intervieni manualmente", instructions: "SeoGrow mostra evidenze e passaggi operativi specifici. Se manca un adapter sicuro non simula una scrittura automatica." };
  }
  if (problem.problemState === "needs_verification") return { action: "verify", label: "Verifica risultato", title: "Conferma il risultato, non riscrivere", instructions: "Riverifica la condizione collegata. Se non esiste una correzione precedente, usa un audit recente prima di autorizzare qualunque nuova scrittura." };
  if (!safeHttpHref(problem.sourceUrl)) return { action: "audit", label: "Associa la pagina con un audit", title: "Manca la pagina da controllare", instructions: "Apri Audit SEO, seleziona il progetto e inserisci la URL esatta. Un task senza URL o evidenza recente non autorizza modifiche." };
  if (intentKinds.has(kind)) return { action: "confirm", label: "Prepara correzione", title: kind === "canonical" ? "Conferma la canonical desiderata" : "Conferma l’intento di indicizzazione", instructions: kind === "canonical" ? "Conferma che la pagina debba avere canonical verso se stessa. Solo dopo SeoGrow prepara il cambio e lo sottopone ad approvazione." : "Conferma che la pagina debba essere indicizzabile. Solo dopo SeoGrow prepara la rimozione del noindex e la sottopone ad approvazione." };
  if (/url-alias|redirect/.test(type)) return { action: "audit", label: "Verifica URL e indicizzazione", title: "Conferma quale URL deve essere pubblica", instructions: "Controlla redirect, canonical e risorsa WordPress. Due URL con e senza slash possono essere la stessa pagina: non generare modifiche senza confermare risorse distinte." };
  if (problem.correctability === "automatic" || /broken-external-link/.test(type)) return { action: "prepare", label: "Correggi automaticamente", title: "Anteprima, approvazione e verifica", instructions: "SeoGrow prepara la singola proposta sul campo verificato. Prima della scrittura mostra il Prima/Dopo e richiede approvazione. Per i link scegli se mantenere o eliminare il testo." };
  if (problem.correctability === "assisted") return { action: "prepare", label: "Prepara correzione", title: "Prepara una correzione controllata", instructions: "SeoGrow prepara una soluzione verificabile, mostra il Prima/Dopo e richiede approvazione prima di qualunque modifica." };
  if (/ottimizza|keyword|opportun|position|ranking/.test(type)) return { action: "manual", label: "Richiede intervento manuale", title: "Ottimizzazione editoriale guidata", instructions: "Confronta keyword, intento e contenuto con dati recenti. SeoGrow può preparare indicazioni operative, ma non applica automaticamente una modifica non attribuita a un adapter sicuro." };
  if (/performance|lento|response|speed|tempo di risposta/.test(type)) return { action: "manual", label: "Richiede intervento manuale", title: "Diagnosi prestazionale guidata", instructions: "SeoGrow prepara una diagnosi causale con evidenze recenti e identifica le cause più probabili. Le modifiche non attribuite con certezza restano manuali." };
  if (/depth|image|alt|broken-link/.test(type)) return { action: "manual", label: "Richiede intervento manuale", title: "Intervento tecnico manuale", instructions: "SeoGrow mostra controlli e passaggi specifici per l’elemento segnalato. Se manca un adapter sicuro, la modifica resta manuale e viene verificata con un nuovo audit." };
  return { action: "manual", label: "Richiede intervento manuale", title: "Intervento manuale richiesto", instructions: "SeoGrow usa URL, dettaglio ed evidenze per indicare il lavoro da eseguire. Se il tipo non dispone di una scrittura sicura, non inventa un adapter." };
}

export const shouldOpenAutomaticProposal = problem => problem?.correctability === "automatic" && resolutionPath(problem).action === "prepare";
export function problemEntryLabel(problem) {
  const path = resolutionPath(problem);
  if (["verify", "history", "audit"].includes(path.action)) return path.label;
  if (shouldOpenAutomaticProposal(problem)) return "Correggi automaticamente";
  if (["prepare", "confirm"].includes(path.action)) return "Prepara correzione";
  return "Richiede intervento manuale";
}

// Requesting a controlled preview never grants write permission or changes correctability.
export const canOpenControlledLinkPreview = problem => problem?.issueType === "broken-external-link" &&
  problem.targetUrls?.length === 1 && Boolean(safeHttpHref(problem.targetUrls[0])) && resolutionPath(problem).action === "prepare";
export const canOpenControlledReviewPreview = problem => problem?.reviewOnly === true && directReviewKinds.has(kindOf(problem)) &&
  problem?.problemState === "needs_verification" && Boolean(safeHttpHref(problem?.sourceUrl)) && resolutionPath(problem).action === "prepare";
export const canOpenControlledContextPreview = problem => intentKinds.has(kindOf(problem)) && Boolean(safeHttpHref(problem?.sourceUrl)) &&
  !problem?.ownershipBlocked && !problem?.stale && !["resolved"].includes(problem?.problemState) && resolutionPath(problem).action === "confirm";
export const controlledPreviewAllowed = (problem, focus) => shouldOpenAutomaticProposal(problem) ||
  (focus?.controlledPreview === true && focus.targetUrl === problem?.targetUrls?.[0] && canOpenControlledLinkPreview(problem)) ||
  (focus?.controlledReviewPreview === true && canOpenControlledReviewPreview(problem)) ||
  (focus?.controlledContextPreview === true && canOpenControlledContextPreview(problem));
