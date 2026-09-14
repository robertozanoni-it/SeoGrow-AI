import { remediationIssueKind } from "./remediationIssueKind.js";
import { resolutionPath } from "./resolutionPath.js";
import { safeHttpHref } from "./reliabilityModel.js";
import { confirmationAuditPolicy, confirmationAuditReady } from "./confirmationAuditPolicy.js";

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

  if (correction?.confirmationAuditState === "running") {
    const policy = confirmationAuditPolicy(correction);
    return { mode: "confirmation-audit", action: "audit-confirmation", label: "Audit di conferma in corso…", title: "Verifica SEO finale in corso", instructions: policy.runningNote, kind };
  }
  if (confirmationAuditReady(correction)) {
    const policy = confirmationAuditPolicy(correction);
    return { mode: "confirmation-audit", action: "audit-confirmation", label: policy.label, title: "Verifica SEO finale", instructions: policy.help, kind };
  }

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

  if (path.action === "prepare" && hasUrl && !problem.ownershipBlocked) {
    return {
      mode: "approval",
      action: "prepare",
      label: kind === "external_link" ? path.label : "Prepara soluzione",
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
