const LINK_TYPES = new Set(["problem", "correction", "opportunity"]);
const AUTO_COMPLETION_PREFIX = "Causa SEO chiusa:";

const text = value => String(value || "").trim();

export function normalizeTaskLinks(value = {}) {
  const links = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    problemKey: text(links.problemKey),
    correctionId: text(links.correctionId),
    opportunityId: text(links.opportunityId),
    opportunityKey: text(links.opportunityKey),
  };
}

export function taskLinkageKey(task = {}) {
  const links = normalizeTaskLinks(task.taskLinks);
  if (links.problemKey) return `problem:${links.problemKey}`;
  if (links.correctionId) return `correction:${links.correctionId}`;
  if (links.opportunityId) return `opportunity:${links.opportunityId}`;
  if (links.opportunityKey) return `opportunity-key:${links.opportunityKey}`;
  return "";
}

export function taskOrigin(task = {}) {
  const legacyAuditId = /^analysis-/i.test(text(task.id)) && text(task.kind).toLowerCase() !== "manual";
  if (legacyAuditId) return "audit";
  const origin = text(task.origin).toLowerCase();
  if (["manual", "audit", "opportunity", "correction", "workflow"].includes(origin)) return origin;
  const links = normalizeTaskLinks(task.taskLinks);
  if (links.problemKey) return "audit";
  if (links.opportunityId || links.opportunityKey) return "opportunity";
  if (links.correctionId) return "correction";
  return task.automatic === true ? "workflow" : "manual";
}

export function taskLinkSummary(task = {}) {
  const links = normalizeTaskLinks(task.taskLinks);
  if (links.correctionId) return { type: "correction", id: links.correctionId, label: "Correzione" };
  if (links.problemKey) return { type: "problem", id: links.problemKey, label: "Problema" };
  if (links.opportunityId || links.opportunityKey) return { type: "opportunity", id: links.opportunityId || links.opportunityKey, label: "Opportunità" };
  return { type: "", id: "", label: taskOrigin(task) === "manual" ? "Manuale" : "Automatico" };
}

const problemIndex = rows => new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map(row => [text(row.key), row]));
const correctionIndex = rows => new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map(row => [text(row.id), row]));
const opportunityIndex = rows => {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    if (row.id) map.set(text(row.id), row);
    if (row.dedupeKey) map.set(`key:${text(row.dedupeKey)}`, row);
  }
  return map;
};

const closedProblem = problem => Boolean(problem && ["resolved", "intentional"].includes(problem.problemState));
const activeProblem = problem => Boolean(problem && ["open", "reappeared", "needs_verification"].includes(problem.problemState));
const verifiedCorrection = correction => Boolean(
  correction &&
  correction.status === "Verificato" &&
  correction.writeConfirmed !== false &&
  correction.completionGatePending !== true,
);
const unresolvedCorrection = correction => Boolean(correction && correction.status !== "Verificato" && correction.status !== "Ripristinato");
const resolvedOpportunity = opportunity => Boolean(opportunity && (opportunity.resolved === true || opportunity.status === "Completata" || opportunity.status === "Risolta"));
const activeOpportunity = opportunity => Boolean(opportunity && !resolvedOpportunity(opportunity));

const causeState = (task, indexes) => {
  const links = normalizeTaskLinks(task.taskLinks);
  const observed = [];
  if (links.correctionId) {
    const correction = indexes.corrections.get(links.correctionId);
    if (verifiedCorrection(correction)) observed.push({ state: "closed", type: "correction", id: links.correctionId, label: "correzione verificata" });
    else if (unresolvedCorrection(correction)) observed.push({ state: "active", type: "correction", id: links.correctionId, label: "correzione da verificare" });
  }
  if (links.problemKey) {
    const problem = indexes.problems.get(links.problemKey);
    if (closedProblem(problem)) observed.push({ state: "closed", type: "problem", id: links.problemKey, label: problem.problemState === "intentional" ? "problema chiuso intenzionalmente" : "problema risolto" });
    else if (activeProblem(problem)) observed.push({ state: "active", type: "problem", id: links.problemKey, label: problem.problemState === "reappeared" ? "problema ricomparso" : "problema attivo" });
  }
  if (links.opportunityId || links.opportunityKey) {
    const id = links.opportunityId || `key:${links.opportunityKey}`;
    const opportunity = indexes.opportunities.get(id);
    if (resolvedOpportunity(opportunity)) observed.push({ state: "closed", type: "opportunity", id, label: "opportunità completata" });
    else if (activeOpportunity(opportunity)) observed.push({ state: "active", type: "opportunity", id, label: "opportunità attiva" });
  }
  return observed.find(item => item.state === "closed") || observed.find(item => item.state === "active") || { state: "unknown", type: "", id: "", label: "causa non verificabile" };
};

const autoCompleted = task => Boolean(
  task?.causeReconciled === true &&
  String(task?.completionReason || "").startsWith(AUTO_COMPLETION_PREFIX),
);

export function reconcileTasksWithCauses(tasks, { problems = [], corrections = [], opportunities = [], now = () => new Date() } = {}) {
  const input = Array.isArray(tasks) ? tasks : [];
  const indexes = {
    problems: problemIndex(problems),
    corrections: correctionIndex(corrections),
    opportunities: opportunityIndex(opportunities),
  };
  let changed = false;
  const output = input.map(task => {
    const links = normalizeTaskLinks(task?.taskLinks);
    if (!links.problemKey && !links.correctionId && !links.opportunityId && !links.opportunityKey) return task;
    const cause = causeState(task, indexes);
    if (cause.state === "closed" && task.status !== "Completato") {
      changed = true;
      const at = now().toISOString();
      return {
        ...task,
        taskLinks: links,
        status: "Completato",
        completedAt: at,
        completionReason: `${AUTO_COMPLETION_PREFIX} ${cause.label}`,
        causeReconciled: true,
        causeReconciledAt: at,
        causeResolution: { type: cause.type, id: cause.id, state: "closed" },
      };
    }
    if (cause.state === "active" && task.status === "Completato" && autoCompleted(task)) {
      changed = true;
      const at = now().toISOString();
      return {
        ...task,
        taskLinks: links,
        status: "Da fare",
        completedAt: "",
        completionReason: "",
        causeReconciled: false,
        causeReopenedAt: at,
        causeResolution: { type: cause.type, id: cause.id, state: "active" },
      };
    }
    return task;
  });
  return { tasks: changed ? output : input, changed };
}

export function linkedTaskCounts(tasks = []) {
  const counts = { manual: 0, automatic: 0, linked: 0, completedByCause: 0 };
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const origin = taskOrigin(task);
    if (origin === "manual") counts.manual += 1; else counts.automatic += 1;
    if (taskLinkageKey(task)) counts.linked += 1;
    if (autoCompleted(task)) counts.completedByCause += 1;
  }
  return counts;
}

export const TASK_LINK_TYPES = Object.freeze([...LINK_TYPES]);
