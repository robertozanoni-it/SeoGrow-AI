import { safeHttpHref, normalizeHttpUrl } from "./reliabilityModel.js";
const brokenTarget = record => record?.issue?.targetUrl || record?.issue?.brokenUrl || record?.brokenTargetUrl || record?.targetUrl || "";
export function correctionMatchesProblem(problem, correction) {
  if (!problem || !correction || String(problem.issueType || "").toLowerCase() !== String(correction.issueType || "").toLowerCase()) return false;
  const source = normalizeHttpUrl(problem.sourceUrl || "", { stripSlash: false });
  if (!source || source !== normalizeHttpUrl(correction.sourceUrl || "", { stripSlash: false })) return false;
  if (/broken-(?:external-)?link/i.test(problem.issueType)) return problem.targetUrls?.length === 1 && problem.targetUrls[0] === brokenTarget(correction);
  return true;
}
// Safe next actions, not a claim that every problem supports automatic writes.
export function resolutionPath(problem = {}, correction = null) {
  const type = `${problem.issueType || ""} ${problem.title || ""}`.toLowerCase();
  if (/esito incerto|uncertain/i.test(String(correction?.status || "")) || /lost.response|recovery/i.test(type)) return { action: "history", label: "Controlla esito e ripristino", title: "Verifica la scrittura precedente", instructions: "Confronta lo stato attuale con Prima e Dopo nello storico. Non ripetere la scrittura finché l’esito non è determinato; se necessario usa il ripristino controllato." };
  if (problem.problemState === "needs_verification" || ["applied", "verified"].includes(problem.interventionState) || problem.problemState === "resolved") return { action: "verify", label: "Verifica risultato", title: "Conferma il risultato, non riscrivere", instructions: "Riverifica la correzione collegata. Per duplicati di title o description serve anche un nuovo crawl: la sola scrittura non prova l’unicità." };
  if (!safeHttpHref(problem.sourceUrl)) return { action: "audit", label: "Associa la pagina con un audit", title: "Manca la pagina da controllare", instructions: "Apri Audit SEO, seleziona il progetto e inserisci la URL esatta. Un task senza URL o evidenza recente non autorizza modifiche." };
  if (problem.stale) return { action: "audit", label: "Aggiorna audit", title: "Aggiorna la rilevazione obsoleta", instructions: "Riesegui l’audit della pagina indicata. Conserva lo storico: un task vecchio non è automaticamente risolto e una vecchia proposta non va riapplicata." };
  if (/ottimizza|keyword|opportun|position|ranking/.test(type)) return { action: "agent", label: "Prepara analisi e indicazioni SEO", title: "Ottimizzazione editoriale guidata", instructions: "Confronta keyword, intento e contenuto con dati recenti. Prepara un brief prima di modificare titolo, testo o link; verifica poi pagina e andamento." };
  if (/url-alias|canonical|noindex|indexability|redirect/.test(type)) return { action: "audit", label: "Verifica URL e indicizzazione", title: "Conferma quale URL deve essere pubblica", instructions: "Controlla redirect, canonical e risorsa WordPress. Due URL con e senza slash possono essere la stessa pagina: non generare testi diversi senza confermare risorse distinte." };
  if (problem.correctability === "automatic" || /broken-external-link/.test(type)) return { action: "prepare", label: "Prepara correzione", title: "Anteprima, approvazione e verifica", instructions: "Prepara la singola proposta sul campo verificato. Se la generazione fallisce, rivedi e valida il testo prima di approvare. Per i link scegli se mantenere o eliminare il testo." };
  if (/performance|lento|response|depth|image|alt|broken-link/.test(type)) return { action: "manual", label: "Apri pagina da correggere", title: "Intervento tecnico guidato", instructions: "Controlla l’elemento segnalato e modifica il widget, collegamento, testo alternativo o configurazione responsabile. Mantieni un backup e riesegui l’audit." };
  return { action: "agent", label: "Analizza il caso con SeoGrow", title: "Diagnosi guidata necessaria", instructions: "Questo tipo non dispone di una scrittura automatica sicura. Usa URL, dettaglio ed evidenze per definire un intervento manuale preciso; poi verifica il frontend o riesegui l’audit." };
}
export const shouldOpenAutomaticProposal = problem => problem?.correctability === "automatic" && resolutionPath(problem).action === "prepare";
export function problemEntryLabel(problem) {
  const path = resolutionPath(problem);
  if (["verify", "history", "audit"].includes(path.action)) return path.label;
  return shouldOpenAutomaticProposal(problem) ? "Apri proposta" : "Apri risoluzione";
}

// Requesting this preview never grants write permission or changes correctability.
export const canOpenControlledLinkPreview = problem => problem?.issueType === "broken-external-link" &&
  problem.targetUrls?.length === 1 && Boolean(safeHttpHref(problem.targetUrls[0])) && resolutionPath(problem).action === "prepare";
export const controlledPreviewAllowed = (problem, focus) => shouldOpenAutomaticProposal(problem) ||
  (focus?.controlledPreview === true && focus.targetUrl === problem?.targetUrls?.[0] && canOpenControlledLinkPreview(problem));
