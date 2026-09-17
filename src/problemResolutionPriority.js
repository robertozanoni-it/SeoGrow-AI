import { remediationIssueKind } from "./remediationIssueKind.js";
import { resolutionPath } from "./resolutionPath.js";
import { safeHttpHref } from "./reliabilityModel.js";

const USER_INTENT_KINDS = new Set(["canonical", "noindex"]);

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

  if (path.action === "audit") {
    return { mode: "guided", action: "audit", label: path.label, title: path.title, instructions: path.instructions, kind };
  }

  if (problem.correctability === "automatic" && path.action === "prepare" && !problem.ownershipBlocked && hasUrl) {
    return {
      mode: "automatic",
      action: "prepare",
      label: "Correggi automaticamente",
      title: "Correzione automatica controllata",
      instructions: "SeoGrow prepara il confronto Prima/Dopo con l’adapter verificato. La scrittura avviene soltanto nel flusso protetto e la risoluzione SEO viene confermata dalla verifica successiva.",
      kind,
    };
  }

  if (path.action === "prepare" && hasUrl && !problem.ownershipBlocked) {
    return {
      mode: "approval",
      action: "prepare",
      label: "Prepara correzione",
      title: "Correzione da preparare",
      instructions: "Serve una proposta controllata prima della scrittura. SeoGrow prepara il Prima/Dopo e richiede approvazione esplicita prima di applicare la modifica.",
      kind,
    };
  }

  if (USER_INTENT_KINDS.has(kind) && path.action === "confirm" && hasUrl && !problem.ownershipBlocked) {
    return {
      mode: "confirm",
      action: "confirm",
      label: "Prepara correzione",
      title: kind === "canonical" ? "Conferma la canonical desiderata" : "Conferma l’intento di indicizzazione",
      instructions: kind === "canonical"
        ? "Prima conferma che questa URL debba essere la versione canonica pubblica. SeoGrow mostrerà poi il Prima/Dopo prima di qualunque scrittura."
        : "Prima conferma che questa pagina debba essere indicizzabile. SeoGrow mostrerà poi il Prima/Dopo prima di qualunque scrittura.",
      kind,
    };
  }

  return {
    mode: "guided",
    action: path.action,
    label: "Richiede intervento manuale",
    title: path.title || "Intervento manuale richiesto",
    instructions: path.instructions || "Non esiste un adapter sicuro per applicare automaticamente questa modifica. SeoGrow può mostrare evidenze e passaggi, ma non simula una scrittura automatica.",
    kind,
  };
};

export const agentProblemActionLabel = (problem = {}, correction = null) => problemResolutionPriority(problem, correction).label;
