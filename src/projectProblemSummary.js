import { listCorrections } from "./remediationStore.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { workspaceStorage } from "./workspaceDatabase.js";

export async function loadProjectProblemSummary({ clientId, analysisHistory = [], analysis = null, tasks = [] } = {}) {
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return { active: 0, high: 0, verify: 0 };
  const corrections = await listCorrections({ clientId });
  let pageStore;
  try { pageStore = JSON.parse(workspaceStorage.getItem("seogrow-page-audit-history-v2") || "{}"); } catch { pageStore = {}; }
  const pageHistory = pageStore[clientId] || pageStore[String(clientId)] || [];
  const siteHistory = analysisHistory.length ? analysisHistory : analysis ? [analysis] : [];
  const model = buildUnifiedProblems({ clientId, siteHistory, pageHistory, tasks, corrections });
  const open = (row) => !["resolved", "intentional"].includes(row.problemState);
  return {
    active: model.rows.filter(open).length,
    high: model.rows.filter((row) => row.severity === "high" && open(row)).length,
    verify: model.rows.filter((row) => row.problemState === "needs_verification").length,
  };
}
