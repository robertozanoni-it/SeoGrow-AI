import { readWorkspaceJson as readJson, writeWorkspaceJson as writeJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { listCorrections } from "./remediationStore.js";
import { normalizeTaskLinks, reconcileTasksWithCauses } from "./experience/tasks/index.js";

const forClient = (store, clientId, fallback = []) => {
  const value = store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
  return Array.isArray(value) ? value : value ? [value] : [];
};
const at = value => Date.parse(String(value || "")) || 0;

const correctionMatchesProblem = (record, problemKey) => Boolean(
  problemKey && record && [record.issueKey, record.legacyIssueKey].filter(Boolean).includes(problemKey),
);

export function attachCorrectionLinks(tasks, corrections) {
  const rows = Array.isArray(corrections) ? corrections : [];
  let changed = false;
  const next = (Array.isArray(tasks) ? tasks : []).map(task => {
    const links = normalizeTaskLinks(task.taskLinks);
    if (!links.problemKey) return task;
    const match = rows
      .filter(record => correctionMatchesProblem(record, links.problemKey))
      .toSorted((left, right) => at(right.appliedAt) - at(left.appliedAt))[0];
    if (!match?.id || links.correctionId === match.id) return task;
    changed = true;
    return { ...task, taskLinks: { ...links, correctionId: match.id } };
  });
  return { tasks: changed ? next : tasks, changed };
}

export async function reconcileTaskCauses({ now = () => new Date() } = {}) {
  const original = readJson(WORKSPACE_KEYS.tasks, []);
  if (!Array.isArray(original) || !original.length) return { tasks: original, changed: false, clients: 0 };

  const analyses = readJson(WORKSPACE_KEYS.analyses, {});
  const pageAudits = readJson(WORKSPACE_KEYS.pageAuditHistory, {});
  const closures = readJson(WORKSPACE_KEYS.problemClosures, []);
  const clientIds = [...new Set(original.map(task => Number(task?.sourceClientId)).filter(id => Number.isSafeInteger(id) && id > 0))];
  let tasks = original;
  let changed = false;

  for (const clientId of clientIds) {
    let corrections;
    try { corrections = await listCorrections({ clientId }); }
    catch { continue; }

    const linked = attachCorrectionLinks(tasks, corrections);
    if (linked.changed) {
      tasks = linked.tasks;
      changed = true;
    }

    const unified = buildUnifiedProblems({
      clientId,
      siteHistory: forClient(analyses, clientId),
      pageHistory: forClient(pageAudits, clientId),
      tasks,
      corrections,
      closures,
      now: now().getTime(),
    });
    const reconciled = reconcileTasksWithCauses(tasks, {
      problems: unified.rows,
      corrections,
      now,
    });
    if (reconciled.changed) {
      tasks = reconciled.tasks;
      changed = true;
    }
  }

  if (changed && JSON.stringify(tasks) !== JSON.stringify(original)) {
    writeJson(WORKSPACE_KEYS.tasks, tasks);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("seogrow-task-cause-reconciled"));
    return { tasks, changed: true, clients: clientIds.length };
  }
  return { tasks: original, changed: false, clients: clientIds.length };
}

let scheduled = 0;
let running = false;
const schedule = () => {
  if (typeof window === "undefined" || scheduled) return;
  scheduled = window.setTimeout(async () => {
    scheduled = 0;
    if (running) return;
    running = true;
    try { await reconcileTaskCauses(); }
    catch (error) { console.warn("Riconciliazione cause Task non completata.", error); }
    finally { running = false; }
  }, 120);
};

if (typeof window !== "undefined" && !window.__seogrowTaskCauseReconciliationInstalled) {
  window.__seogrowTaskCauseReconciliationInstalled = true;
  for (const event of [
    "seogrow-storage-ok",
    "seogrow-remediation-history",
    "seogrow-remediation-applied",
    "seogrow-problem-closures-changed",
  ]) window.addEventListener(event, schedule);
  window.addEventListener("storage", event => {
    if ([WORKSPACE_KEYS.tasks, WORKSPACE_KEYS.analyses, WORKSPACE_KEYS.pageAuditHistory, WORKSPACE_KEYS.problemClosures].includes(event.key)) schedule();
  });
  schedule();
}
