import { remediationIssueKind } from "./remediationIssueKind.js";
import { resolutionPath } from "./resolutionPath.js";
import { safeHttpHref } from "./reliabilityModel.js";

const USER_INTENT_KINDS = new Set(["canonical", "noindex"]);
const PREPARABLE_KINDS = new Set(["title", "meta_description", "h1", "content", "excerpt", "external_link"]);

export const problemResolutionPriority = (problem = {}, correction = null) => {
  const path = resolutionPath(problem, correction);
  const kind = remediationIssueKind({
    type: problem.issueType,
    issueType: problem.issueType,
    label: problem.title,
    title: problem.title,
    detail: problem.detail,
  });
  const hasUrl = Boolean(safeHttpHref(problem.sourceUrl));

  if (problem.problemState === "resolved" || path.action === "verify" || path.action === "history") {
    return { mode: "verify", action: path.action, label: path.label, title: path.title, instructions: path.instructions, kind };
  }

  if (problem.correctability === "automatic" && path.action === "prepare" && !problem.ownershipBlocked && hasUrl) {
    return {
      mode: "automatic",
      action: "prepare",
      label: "Risolvi automaticamente",
      title: "Correzione automatica prioritaria",
      instructions: "SeoGrow prepara la modifica con l’adapter verificato, controlla il Prima/Dopo e applica solo attraverso il flusso protetto già previsto. La risoluzione SEO viene confermata soltanto dalla verifica successiva.",
      kind,
    };
  }

  if (path.action === "prepare" || (PREPARABLE_KINDS.has(kind) && path.action !== "audit" && hasUrl && !problem.ownershipBlocked)) {
    return {
      mode: "approval",
      action: "prepare",
      label: "Prepara soluzione",
      title: "Soluzione pronta per approvazione",
      instructions: "SeoGrow prepara una proposta concreta e verificabile. Prima di qualunque scrittura mostra il confronto Prima/Dopo e richiede la tua approvazione.",
      kind,
    };
  }

  if (USER_INTENT_KINDS.has(kind) && path.action === "confirm" && hasUrl && !problem.ownershipBlocked) {
    return {
      mode: "confirm",
      action: "confirm",
      label: "Verifica e prepara soluzione",
      title: kind === "canonical" ? "Conferma la canonical desiderata" : "Conferma l’intento di indicizzazione",
      instructions: kind === "canonical"
        ? "Conferma che questa URL debba essere la versione canonica pubblica. Dopo la conferma SeoGrow prepara la modifica e mostra il Prima/Dopo prima dell’approvazione."
        : "Conferma che questa pagina debba essere indicizzabile. Dopo la conferma SeoGrow prepara la modifica e mostra il Prima/Dopo prima dell’approvazione.",
      kind,
    };
  }

  return {
    mode: "guided",
    action: path.action === "audit" ? "audit" : "guide",
    label: path.action === "audit" ? path.label : "Prepara soluzione guidata",
    title: path.title || "Soluzione guidata",
    instructions: path.instructions || "SeoGrow prepara i passaggi operativi e le verifiche necessarie. Se manca un adapter sicuro non viene simulata alcuna scrittura automatica.",
    kind,
  };
};

export const agentProblemActionLabel = (problem = {}, correction = null) => problemResolutionPriority(problem, correction).label;
